/* ============================================================
   종이비행기 멀티플레이 서버

   - HTTP: public/ 정적 파일 서빙
   - WebSocket: 방·세션·라운드 관리, 상태 중계
   - 세션: 토큰으로 재접속 시 이름·승수 유지 (서버 생존 동안)
   - 방: 공개/비공개 생성, 초대 코드, DIST 최대 8명 / ARENA 최대 4명
   - 라운드: DIST는 countdown(4s), ARENA는 folding(60s) → launch → playing,
             이후 results → 참가자별 확인 → waiting
   ============================================================ */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const {
  createPaperModel,
  replayFoldCommands,
  serializeFoldCommands
} = require('./public/paper-fold-model.js');
const { deriveAerodynamicProfile } = require('./public/paper-aero-profile.js');

const DEFAULT_AERO_PROFILE = deriveAerodynamicProfile(createPaperModel());

const PORT = Number(process.env.PORT || 3000);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error('PORT must be an integer from 1 to 65535');
const RELEASE_ID = process.env.RELEASE_ID || 'development';
const PUB = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png'
};

/* ---------- 정적 파일 ---------- */
const httpServer = http.createServer((req, res) => {
  let p;
  try {
    p = decodeURIComponent(req.url.split('?')[0]);
  } catch {
    res.writeHead(400);
    return res.end('bad request');
  }
  if (p === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ status: 'ok', release: RELEASE_ID }));
  }
  if (p === '/') p = '/index.html';
  const file = path.resolve(PUB, '.' + p);
  if (file !== PUB && !file.startsWith(PUB + path.sep)) {
    res.writeHead(403);
    return res.end('forbidden');
  }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
});

const wss = new WebSocketServer({ server: httpServer, maxPayload: 16 * 1024 });

/* ---------- 세션 ---------- */
const sessions = new Map(); // token -> { name, wins }

/* ---------- 방 ---------- */
const ROUND_SEC = { DIST: 150, ARENA: 180 };
const MAX_PLAYERS = { DIST: 4, ARENA: 4 };
const configuredFoldingMs = Number(process.env.FOLDING_MS || 60_000);
const FOLDING_MS = Number.isFinite(configuredFoldingMs) && configuredFoldingMs >= 0
  ? configuredFoldingMs
  : 60_000;
const configuredLaunchMs = Number(process.env.LAUNCH_MS || 4_400);
const LAUNCH_MS = Number.isFinite(configuredLaunchMs) && configuredLaunchMs >= 0
  ? configuredLaunchMs
  : 4_400;
const configuredReconnectGraceMs = Number(process.env.RECONNECT_GRACE_MS || 10_000);
const RECONNECT_GRACE_MS = Number.isFinite(configuredReconnectGraceMs) && configuredReconnectGraceMs >= 0
  ? configuredReconnectGraceMs
  : 10_000;
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
let roomSeq = 0;
const rooms = new Map();
let roomListCache = null;
let roomListBroadcastTimer = null;

function makeRoomCode() {
  for (let attempt = 0; attempt < 100; attempt++) {
    let code = '';
    for (let i = 0; i < 6; i++) code += ROOM_CODE_ALPHABET[crypto.randomInt(ROOM_CODE_ALPHABET.length)];
    if (![...rooms.values()].some(room => room.code === code)) return code;
  }
  throw new Error('unable to allocate room code');
}

function makeRoom(mode, visibility = 'public') {
  const room = {
    id: 'r' + (++roomSeq),
    code: makeRoomCode(),
    visibility: visibility === 'private' ? 'private' : 'public',
    hostId: null,
    createdAt: Date.now(),
    mode,
    players: new Map(),   // id -> player
    phase: 'waiting',
    seed: 0,
    phaseEnds: 0,
    order: [],            // 이번 라운드 참가자 (스폰 순서 결정)
    startedAt: 0,
    startedWith: 0,
    results: [],
    readyIds: new Set(),
    timer: null
  };
  rooms.set(room.id, room);
  return room;
}

function maxPlayers(room) {
  return MAX_PLAYERS[room.mode];
}

function findRoom(mode) {
  for (const room of rooms.values()) {
    if (room.visibility === 'public' && room.mode === mode && room.phase === 'waiting' &&
        room.players.size < maxPlayers(room)) return room;
  }
  return makeRoom(mode, 'public');
}

function bcast(room, msg, exceptId) {
  const s = JSON.stringify(msg);
  for (const p of room.players.values()) {
    if (!p.ws || p.ws.readyState !== 1 || p.id === exceptId) continue;
    if (p.ws.bufferedAmount > 256 * 1024) {
      p.ws.terminate();
      continue;
    }
    p.ws.send(s);
  }
}

function finiteVec3(value, maxAbs) {
  return Array.isArray(value) && value.length === 3 &&
    value.every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= maxAbs);
}

function vecDistanceSquared(a, b) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
}

function expectedSpawn(room, playerId) {
  const index = Math.max(0, room.order.indexOf(playerId));
  const count = Math.max(1, room.order.length);
  if (room.mode === 'DIST') return [(index - (count - 1) / 2) * 10, 150, 0];
  const angle = (index / count) * Math.PI * 2;
  return [Math.cos(angle) * 130, 130, Math.sin(angle) * 130];
}

function roomSummary(room) {
  const host = room.players.get(room.hostId);
  return {
    code: room.code,
    mode: room.mode,
    phase: room.phase,
    players: room.players.size,
    maxPlayers: maxPlayers(room),
    hostName: host ? host.name : '무명',
    joinable: room.phase === 'waiting' && room.players.size < maxPlayers(room)
  };
}

function roomListMessage() {
  return {
    t: 'rooms',
    rooms: [...rooms.values()]
      .filter(room => room.visibility === 'public' && room.players.size > 0)
      .sort((a, b) => a.createdAt - b.createdAt)
      .map(roomSummary)
  };
}

function serializedRoomList() {
  if (roomListCache === null) roomListCache = JSON.stringify(roomListMessage());
  return roomListCache;
}

function sendSerialized(ws, message) {
  if (ws.readyState !== 1) return;
  if (ws.bufferedAmount > 256 * 1024) {
    ws.terminate();
    return;
  }
  ws.send(message);
}

function sendJson(ws, message) {
  if (ws.readyState === 1 && ws.bufferedAmount <= 256 * 1024) ws.send(JSON.stringify(message));
}

function broadcastRoomList() {
  roomListCache = null;
  if (roomListBroadcastTimer) return;
  roomListBroadcastTimer = setTimeout(() => {
    roomListBroadcastTimer = null;
    const message = serializedRoomList();
    for (const client of wss.clients) {
      if (client.roomListSubscribed) sendSerialized(client, message);
    }
  }, 100);
  roomListBroadcastTimer.unref();
}

function craftSnapshots(room) {
  return room.order.map(id => {
    const player = room.players.get(id);
    return {
      id,
      commands: player?.foldCommands || '[]',
      aeroProfile: player?.aeroProfile || DEFAULT_AERO_PROFILE
    };
  });
}

function snapshot(room) {
  return {
    t: 'room',
    id: room.id,
    code: room.code,
    visibility: room.visibility,
    hostId: room.hostId,
    maxPlayers: maxPlayers(room),
    mode: room.mode,
    phase: room.phase,
    seed: room.seed,
    ends: room.phaseEnds,
    duration: room.phase === 'launch' ? LAUNCH_MS : undefined,
    order: room.order,
    crafts: craftSnapshots(room),
    results: room.results,
    readyIds: [...room.readyIds],
    players: [...room.players.values()].map(p => ({
      id: p.id, name: p.name, wins: p.wins, alive: p.alive, ready: p.ready,
      foldDone: Boolean(p.foldDone), foldCommands: p.foldCommands || '[]',
      aeroProfile: p.aeroProfile || DEFAULT_AERO_PROFILE,
      connected: Boolean(p.ws && p.ws.readyState === 1)
    }))
  };
}

function bindSessionToRoom(player, room) {
  const session = sessions.get(player.token);
  if (!session) return;
  session.roomId = room?.id || null;
  session.playerId = room ? player.id : null;
}

function removePlayerFromRoom(room, player) {
  clearTimeout(player.disconnectTimer);
  player.disconnectTimer = null;
  room.players.delete(player.id);
  if (room.phase === 'waiting') room.order = room.order.filter(id => id !== player.id);
  room.readyIds.delete(player.id);
  bindSessionToRoom(player, null);
  bcast(room, { t: 'pl', id: player.id });
  if (room.hostId === player.id) room.hostId = room.players.keys().next().value || null;
  if (room.players.size === 0) {
    clearTimeout(room.timer);
    rooms.delete(room.id);
  } else {
    const resultsFinished = room.phase === 'results' && finishResultsIfReady(room);
    if (!resultsFinished) bcast(room, snapshot(room));
    checkEarlyEnd(room);
  }
  broadcastRoomList();
}

function resetPlayerForRoom(player) {
  player.ready = false;
  player.foldDone = false;
  player.foldCommands = '[]';
  player.aeroProfile = DEFAULT_AERO_PROFILE;
  player.alive = false;
  player.score = 0;
  player.state = null;
  player.stateAt = 0;
  player.movementBudget = 40;
  player.movementAt = Date.now();
  player.shots = [];
  player.lastShotAt = 0;
  player.ammo = 3;
  player.ammoAt = Date.now();
}

/* ---------- 라운드 흐름 ---------- */
function startPreparation(room, phase, duration, nextPhase) {
  clearTimeout(room.timer);
  room.phase = phase;
  room.seed = (Math.random() * 0x7fffffff) | 0;
  room.phaseEnds = Date.now() + duration;
  room.order = [...room.players.keys()];
  room.results = [];
  room.readyIds.clear();
  for (const p of room.players.values()) {
    p.alive = true;
    p.foldDone = false;
    p.foldCommands = '[]';
    p.aeroProfile = DEFAULT_AERO_PROFILE;
    p.score = 0;
    p.state = null;
    p.stateAt = 0;
    p.movementBudget = 40;
    p.movementAt = Date.now();
    p.shots = [];
    p.lastShotAt = 0;
    p.ammo = 3;
    p.ammoAt = Date.now();
  }
  bcast(room, { t: 'phase', phase, seed: room.seed, ends: room.phaseEnds, order: room.order });
  room.timer = setTimeout(() => nextPhase(room), duration);
}

function startCountdown(room) {
  startPreparation(room, 'countdown', 4000, startPlaying);
}

function startFolding(room) {
  startPreparation(room, 'folding', FOLDING_MS, startLaunch);
}

function startLaunch(room) {
  if (!rooms.has(room.id) || room.phase !== 'folding') return;
  room.phase = 'launch';
  room.phaseEnds = Date.now() + LAUNCH_MS;
  bcast(room, {
    t: 'phase', phase: 'launch', seed: room.seed,
    ends: room.phaseEnds, order: room.order, duration: LAUNCH_MS,
    crafts: craftSnapshots(room)
  });
  broadcastRoomList();
  room.timer = setTimeout(() => startPlaying(room), LAUNCH_MS);
}

function startPlaying(room) {
  room.phase = 'playing';
  room.startedAt = Date.now();
  room.startedWith = room.order.filter(id => room.players.has(id)).length;
  if (room.startedWith === 0) {
    endRound(room);
    return;
  }
  room.phaseEnds = Date.now() + ROUND_SEC[room.mode] * 1000;
  bcast(room, {
    t: 'phase', phase: 'playing', seed: room.seed,
    ends: room.phaseEnds, order: room.order, crafts: craftSnapshots(room)
  });
  broadcastRoomList();
  room.timer = setTimeout(() => endRound(room), ROUND_SEC[room.mode] * 1000);
}

function endRound(room) {
  clearTimeout(room.timer);
  if (room.phase !== 'playing') return;
  room.phase = 'results';

  // 시간 종료까지 생존한 아레나 플레이어 점수 확정
  for (const p of room.players.values()) {
    if (!room.order.includes(p.id)) continue;
    if (p.alive && room.mode === 'ARENA')
      p.score = (Date.now() - room.startedAt) / 1000;
  }

  const results = room.order
    .map(id => room.players.get(id))
    .filter(Boolean)
    .map(p => ({ id: p.id, name: p.name, score: Math.round(p.score * 10) / 10, alive: p.alive }))
    .sort((a, b) => b.score - a.score);

  if (results.length > 0) {
    const winner = room.players.get(results[0].id);
    if (winner) {
      winner.wins++;
      const s = sessions.get(winner.token);
      if (s) s.wins = winner.wins;
    }
  }

  room.results = results;
  room.readyIds.clear();
  room.phaseEnds = 0;
  room.timer = null;
  if (finishResultsIfReady(room)) return;
  bcast(room, {
    t: 'phase', phase: 'results', results, ends: room.phaseEnds,
    order: room.order, readyIds: []
  });
  broadcastRoomList();
}

function finishResultsIfReady(room) {
  if (room.phase !== 'results') return false;
  const requiredIds = room.order.filter(id => room.players.has(id));
  if (requiredIds.some(id => !room.readyIds.has(id))) return false;

  room.phase = 'waiting';
  room.phaseEnds = 0;
  room.order = [];
  room.results = [];
  room.readyIds.clear();
  for (const player of room.players.values()) {
    player.ready = false;
    player.alive = false;
  }
  bcast(room, snapshot(room));
  broadcastRoomList();
  return true;
}

function onCrash(room, player, byName) {
  if (room.phase !== 'playing' || !player.alive) return;
  player.alive = false;
  if (room.mode === 'ARENA')
    player.score = (Date.now() - room.startedAt) / 1000;
  // DIST 점수는 상태 메시지에서 이미 누적됨

  bcast(room, { t: 'crashed', id: player.id, by: byName || null });
  checkEarlyEnd(room);
}

function checkEarlyEnd(room) {
  if (room.phase !== 'playing') return;
  const alive = room.order
    .map(id => room.players.get(id))
    .filter(p => p && p.alive);

  if (room.mode === 'ARENA') {
    // 2명 이상으로 시작했고 1명 이하만 남으면 조기 종료
    if (room.startedWith >= 2 && alive.length <= 1) endRound(room);
    else if (alive.length === 0) endRound(room);
  } else {
    if (alive.length === 0) endRound(room);
  }
}

function leaderboardMessage(room, now = Date.now()) {
  const rows = room.order
    .map(id => room.players.get(id))
    .filter(Boolean)
    .map(player => {
      const liveScore = room.mode === 'ARENA' && room.phase === 'playing' && player.alive
        ? (now - room.startedAt) / 1000
        : player.score;
      return {
        id: player.id,
        name: player.name,
        score: Math.round(liveScore * 10) / 10,
        alive: player.alive,
        wins: player.wins
      };
    })
    .sort((a, b) => b.score - a.score || Number(b.alive) - Number(a.alive));
  return { t: 'leaderboard', rows };
}

/* ---------- 접속 ---------- */
wss.on('connection', (ws) => {
  if (wss.clients.size > 1000) {
    ws.close(1013, 'server busy');
    return;
  }
  let me = null;
  let room = null;
  let messageWindowStarted = Date.now();
  let messageCount = 0;
  ws.roomListSubscribed = false;
  ws.lastRoomListSentAt = 0;

  ws.on('error', (err) => {
    if (err.code !== 'WS_ERR_UNSUPPORTED_MESSAGE_LENGTH')
      console.error('WebSocket client error:', err.message);
  });

  ws.on('message', (raw) => {
    const now = Date.now();
    if (now - messageWindowStarted >= 1000) {
      messageWindowStarted = now;
      messageCount = 0;
    }
    if (++messageCount > 60) {
      ws.close(1008, 'rate limit');
      return;
    }

    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== 'object' || Array.isArray(m)) return;

    /* -- 공개 방 목록은 세션 확립 전에도 조회할 수 있습니다 -- */
    if (m.t === 'list') {
      ws.roomListSubscribed = true;
      if (now - ws.lastRoomListSentAt >= 1000) {
        ws.lastRoomListSentAt = now;
        sendSerialized(ws, serializedRoomList());
      }
      return;
    }

    /* -- 세션 확립 -- */
    if (m.t === 'hello') {
      if (me) return;
      let token = typeof m.token === 'string' ? m.token : null;
      if (!token || !sessions.has(token)) {
        token = crypto.randomBytes(12).toString('hex');
        if (sessions.size >= 10000) sessions.delete(sessions.keys().next().value);
        sessions.set(token, { name: '', wins: 0, roomId: null, playerId: null });
      }
      const s = sessions.get(token);
      if (m.name) s.name = String(m.name).slice(0, 12).trim() || s.name;

      const resumeRoom = s.roomId ? rooms.get(s.roomId) : null;
      const resumePlayer = resumeRoom?.players.get(s.playerId);
      if (resumePlayer && (!resumePlayer.ws || resumePlayer.ws.readyState !== 1)) {
        me = resumePlayer;
        room = resumeRoom;
        clearTimeout(me.disconnectTimer);
        me.disconnectTimer = null;
        me.ws = ws;
        me.name = s.name || me.name;
        sendJson(ws, { t: 'hello', id: me.id, token, name: me.name, wins: me.wins, resumed: true });
        sendJson(ws, snapshot(room));
        bcast(room, snapshot(room), me.id);
        return;
      }

      me = {
        id: crypto.randomBytes(4).toString('hex'),
        token,
        name: s.name || '무명',
        wins: s.wins,
        ws,
        ready: false,
        foldDone: false,
        alive: false,
        score: 0,
        state: null,
        stateAt: 0,
        movementBudget: 40,
        movementAt: Date.now(),
        shots: [],
        lastShotAt: 0,
        ammo: 3,
        ammoAt: Date.now(),
        disconnectTimer: null
      };
      sendJson(ws, { t: 'hello', id: me.id, token, name: me.name, wins: me.wins, resumed: false });
      return;
    }
    if (!me) return;

    /* -- 로비/대기방 이름 변경 -- */
    if (m.t === 'rename') {
      if (room && room.phase !== 'waiting') {
        sendJson(ws, { t: 'error', code: 'ROOM_NOT_WAITING', message: '대기 중에만 이름을 바꿀 수 있습니다' });
        return;
      }
      const name = String(m.name || '').slice(0, 12).trim();
      if (!name || name === me.name) return;
      me.name = name;
      const session = sessions.get(me.token);
      if (session) session.name = name;
      if (room) {
        bcast(room, snapshot(room));
        if (room.visibility === 'public' && room.hostId === me.id) broadcastRoomList();
      }
      return;
    }

    /* -- 새 방 생성 -- */
    if (m.t === 'create') {
      ws.roomListSubscribed = false;
      if (room) removePlayerFromRoom(room, me);
      room = makeRoom(m.mode === 'ARENA' ? 'ARENA' : 'DIST', m.visibility);
      room.hostId = me.id;
      resetPlayerForRoom(me);
      room.players.set(me.id, me);
      bindSessionToRoom(me, room);
      sendJson(ws, snapshot(room));
      broadcastRoomList();
      return;
    }

    /* -- 방 입장(코드) 또는 빠른 참가(모드) -- */
    if (m.t === 'join') {
      let targetRoom;
      if (typeof m.code === 'string' && m.code.trim()) {
        const code = m.code.trim().toUpperCase();
        targetRoom = [...rooms.values()].find(candidate => candidate.code === code);
        if (!targetRoom) {
          sendJson(ws, { t: 'error', code: 'ROOM_NOT_FOUND', message: '방 코드를 확인해 주세요' });
          return;
        }
      } else {
        targetRoom = findRoom(m.mode === 'ARENA' ? 'ARENA' : 'DIST');
      }
      ws.roomListSubscribed = false;
      if (room === targetRoom) {
        sendJson(ws, snapshot(room));
        return;
      }
      if (targetRoom.phase !== 'waiting') {
        sendJson(ws, { t: 'error', code: 'ROOM_NOT_JOINABLE', message: '이미 시작한 방에는 참가할 수 없습니다' });
        return;
      }
      if (targetRoom.players.size >= maxPlayers(targetRoom)) {
        sendJson(ws, { t: 'error', code: 'ROOM_FULL', message: '방이 가득 찼습니다' });
        return;
      }

      if (room) removePlayerFromRoom(room, me);

      room = targetRoom;
      resetPlayerForRoom(me);
      room.players.set(me.id, me);
      bindSessionToRoom(me, room);
      if (!room.hostId) room.hostId = me.id;

      bcast(room, snapshot(room));
      bcast(room, { t: 'pj', pl: { id: me.id, name: me.name, wins: me.wins } }, me.id);
      broadcastRoomList();
      return;
    }

    /* -- 연결을 유지한 채 방에서 나가기 -- */
    if (m.t === 'leave') {
      if (room) removePlayerFromRoom(room, me);
      room = null;
      me.alive = false;
      me.state = null;
      sendJson(ws, { t: 'left' });
      return;
    }

    if (!room) return;

    /* -- 대기 상태는 방장 여부와 무관하게 각 플레이어가 직접 설정합니다 -- */
    if (m.t === 'ready') {
      if (room.phase !== 'waiting') {
        sendJson(ws, { t: 'error', code: 'ROOM_NOT_WAITING', message: '대기 중에만 준비 상태를 바꿀 수 있습니다' });
        return;
      }
      if (typeof m.ready !== 'boolean' || me.ready === m.ready) return;
      me.ready = m.ready;
      bcast(room, snapshot(room));
      return;
    }

    /* -- 접기 명령은 서버에서 재생·검증한 뒤 공력 프로필로 변환합니다 -- */
    if (m.t === 'fold_done') {
      if (room.phase !== 'folding' || me.foldDone) return;
      const commands = m.commands === undefined ? '[]' : m.commands;
      const foldModel = replayFoldCommands(commands);
      if (!foldModel) {
        sendJson(ws, {
          t: 'error', code: 'INVALID_FOLD',
          message: '접기 명령을 확인할 수 없습니다. 접기선을 다시 그려 주세요'
        });
        return;
      }
      me.foldCommands = serializeFoldCommands(foldModel);
      me.aeroProfile = deriveAerodynamicProfile(foldModel);
      me.foldDone = true;
      const doneIds = room.order.filter(id => room.players.get(id)?.foldDone);
      const profiles = Object.fromEntries(doneIds.map(id => [
        id,
        room.players.get(id).aeroProfile
      ]));
      bcast(room, { t: 'fold_status', doneIds, total: room.order.length, profiles });
      return;
    }

    /* -- 라운드 시작은 현재 방장만 요청할 수 있습니다 -- */
    if (m.t === 'start') {
      if (room.hostId !== me.id) {
        sendJson(ws, { t: 'error', code: 'NOT_HOST', message: '방장만 시작할 수 있습니다' });
        return;
      }
      if (room.phase !== 'waiting') {
        sendJson(ws, { t: 'error', code: 'ROOM_NOT_WAITING', message: '대기 중인 방만 시작할 수 있습니다' });
        return;
      }
      if (![...room.players.values()].every(player => player.ready)) {
        sendJson(ws, { t: 'error', code: 'NOT_ALL_READY', message: '모든 플레이어가 준비해야 시작할 수 있습니다' });
        return;
      }
      startFolding(room);
      broadcastRoomList();
      return;
    }

    /* -- 결과 확인은 라운드 참가자별로 명시적으로 완료합니다 -- */
    if (m.t === 'results-ready') {
      if (room.phase !== 'results' || !room.order.includes(me.id) || room.readyIds.has(me.id)) return;
      room.readyIds.add(me.id);
      if (!finishResultsIfReady(room)) bcast(room, snapshot(room));
      return;
    }

    /* -- 비행 상태 (클라이언트 → 15Hz) -- */
    if (m.t === 's') {
      if (room.phase !== 'playing' || !me.alive) return;
      if (!finiteVec3(m.p, 10000) || !finiteVec3(m.r, 10)) return;
      const stateNow = Date.now();
      const movementElapsed = Math.max(0, Math.min((stateNow - me.movementAt) / 1000, 2));
      me.movementBudget = Math.min(40, me.movementBudget + 200 * movementElapsed);
      me.movementAt = stateNow;
      const previousPosition = me.state ? me.state.p : expectedSpawn(room, me.id);
      const movement = Math.sqrt(vecDistanceSquared(previousPosition, m.p));
      if (movement > me.movementBudget) return;
      me.movementBudget -= movement;
      me.movementAt = stateNow;
      if (room.mode === 'DIST') {
        me.score = Math.max(me.score, Math.min(99999, Math.max(0, -m.p[2])));
      }
      me.state = { p: m.p, r: m.r };
      me.stateAt = stateNow;
      return;
    }

    /* -- 자체 추락 신고 -- */
    if (m.t === 'crash') { onCrash(room, me); return; }

    /* -- 발사 중계 (아레나) -- */
    if (m.t === 'shoot') {
      if (room.mode !== 'ARENA' || room.phase !== 'playing' || !me.alive || !me.state ||
          !finiteVec3(m.o, 10000) || !finiteVec3(m.v, 1000)) return;
      const shotNow = Date.now();
      const regenerated = Math.floor((shotNow - me.ammoAt) / 2500);
      if (regenerated > 0) {
        me.ammo = Math.min(3, me.ammo + regenerated);
        me.ammoAt += regenerated * 2500;
      }
      if (me.ammo <= 0) return;
      const speedSquared = m.v[0] ** 2 + m.v[1] ** 2 + m.v[2] ** 2;
      if (vecDistanceSquared(me.state.p, m.o) > 15 ** 2 || speedSquared < 1 || speedSquared > 250 ** 2 ||
          shotNow - me.lastShotAt < 100) return;
      me.lastShotAt = shotNow;
      me.ammo -= 1;
      me.shots = me.shots.filter(shot => shotNow - shot.at <= 3000);
      me.shots.push({ at: shotNow, o: m.o, v: m.v });
      bcast(room, { t: 'shot', id: me.id, o: m.o, v: m.v }, me.id);
      return;
    }

    /* -- 피격 판정 (발사자가 신고, 서버가 근접 검증) -- */
    if (m.t === 'hit') {
      if (room.mode !== 'ARENA' || room.phase !== 'playing' || !me.alive ||
          typeof m.id !== 'string' || !finiteVec3(m.p, 10000)) return;
      const target = room.players.get(m.id);
      if (!target || !target.alive || target.id === me.id || !target.state) return;
      const hitNow = Date.now();
      const shotIndex = me.shots.findIndex(shot => {
        const elapsed = (hitNow - shot.at) / 1000;
        if (elapsed < 0 || elapsed > 3) return false;
        const expected = [
          shot.o[0] + shot.v[0] * elapsed,
          shot.o[1] + shot.v[1] * elapsed - 4 * elapsed * elapsed,
          shot.o[2] + shot.v[2] * elapsed
        ];
        return vecDistanceSquared(expected, m.p) <= 25 ** 2;
      });
      if (shotIndex < 0) return;
      me.shots.splice(shotIndex, 1);
      // 검증된 다트 궤적의 착탄 지점이 대상 마지막 위치와 가까운지 확인
      const dx = target.state.p[0] - m.p[0];
      const dy = target.state.p[1] - m.p[1];
      const dz = target.state.p[2] - m.p[2];
      if (dx * dx + dy * dy + dz * dz > 35 * 35) return;
      onCrash(room, target, me.name);
      return;
    }
  });

  ws.on('close', () => {
    if (!room || !me || me.ws !== ws) return;
    if (room.phase !== 'waiting' && RECONNECT_GRACE_MS > 0) {
      const disconnectedRoom = room;
      me.ws = null;
      clearTimeout(me.disconnectTimer);
      me.disconnectTimer = setTimeout(() => {
        if (!me.ws && disconnectedRoom.players.get(me.id) === me) {
          removePlayerFromRoom(disconnectedRoom, me);
        }
      }, RECONNECT_GRACE_MS);
      me.disconnectTimer.unref?.();
      bcast(disconnectedRoom, snapshot(disconnectedRoom));
    } else {
      removePlayerFromRoom(room, me);
    }
    room = null;
  });
});

/* ---------- 상태 브로드캐스트 (20Hz) ---------- */
const stateBroadcastTimer = setInterval(() => {
  for (const room of rooms.values()) {
    if (room.phase !== 'playing') continue;
    const a = [];
    for (const p of room.players.values())
      if (p.state) a.push([p.id, p.state.p, p.state.r, p.alive ? 1 : 0, Math.round(p.score)]);
    if (a.length) bcast(room, { t: 'ss', a });
  }
}, 50);
stateBroadcastTimer.unref();

const leaderboardBroadcastTimer = setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (room.phase === 'playing') bcast(room, leaderboardMessage(room, now));
  }
}, 250);
leaderboardBroadcastTimer.unref();

if (require.main === module) {
  httpServer.listen(PORT, () => {
    console.log(`종이비행기 서버 실행 중 → http://localhost:${PORT}`);
  });
}

module.exports = { httpServer, wss };
