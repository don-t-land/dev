/* ============================================================
   종이비행기 멀티플레이 서버

   - HTTP: public/ 정적 파일 서빙
   - WebSocket: 방·세션·라운드 관리, 상태 중계
   - 세션: 토큰으로 재접속 시 이름·승수 유지 (서버 생존 동안)
   - 방: 모드별 자동 생성, 최대 8명
   - 라운드: waiting → countdown(4s) → playing → results(7s) 반복
   ============================================================ */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT || 3000);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error('PORT must be an integer from 1 to 65535');
const RELEASE_ID = process.env.RELEASE_ID || 'development';
const PUB = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
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
const MAX_PLAYERS = 8;
let roomSeq = 0;
const rooms = new Map();

function makeRoom(mode) {
  const room = {
    id: 'r' + (++roomSeq),
    mode,
    players: new Map(),   // id -> player
    phase: 'waiting',
    seed: 0,
    phaseEnds: 0,
    order: [],            // 이번 라운드 참가자 (스폰 순서 결정)
    startedAt: 0,
    startedWith: 0,
    timer: null
  };
  rooms.set(room.id, room);
  return room;
}

function findRoom(mode) {
  for (const r of rooms.values())
    if (r.mode === mode && r.players.size < MAX_PLAYERS) return r;
  return makeRoom(mode);
}

function bcast(room, msg, exceptId) {
  const s = JSON.stringify(msg);
  for (const p of room.players.values()) {
    if (p.ws.readyState !== 1 || p.id === exceptId) continue;
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

function snapshot(room) {
  return {
    t: 'room',
    mode: room.mode,
    phase: room.phase,
    seed: room.seed,
    ends: room.phaseEnds,
    order: room.order,
    players: [...room.players.values()].map(p => ({
      id: p.id, name: p.name, wins: p.wins, alive: p.alive
    }))
  };
}

/* ---------- 라운드 흐름 ---------- */
function tryStart(room) {
  if (room.phase === 'waiting' && room.players.size > 0) startCountdown(room);
}

function startCountdown(room) {
  clearTimeout(room.timer);
  room.phase = 'countdown';
  room.seed = (Math.random() * 0x7fffffff) | 0;
  room.phaseEnds = Date.now() + 4000;
  room.order = [...room.players.keys()];
  for (const p of room.players.values()) {
    p.alive = true;
    p.score = 0;
    p.state = null;
    p.stateAt = 0;
    p.movementBudget = 40;
    p.movementAt = Date.now();
    p.shots = [];
    p.lastShotAt = 0;
  }
  bcast(room, { t: 'phase', phase: 'countdown', seed: room.seed, ends: room.phaseEnds, order: room.order });
  room.timer = setTimeout(() => startPlaying(room), 4000);
}

function startPlaying(room) {
  room.phase = 'playing';
  room.startedAt = Date.now();
  room.startedWith = room.order.filter(id => room.players.has(id)).length;
  room.phaseEnds = Date.now() + ROUND_SEC[room.mode] * 1000;
  bcast(room, { t: 'phase', phase: 'playing', ends: room.phaseEnds });
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

  room.phaseEnds = Date.now() + 7000;
  bcast(room, { t: 'phase', phase: 'results', results, ends: room.phaseEnds });
  room.timer = setTimeout(() => { room.phase = 'waiting'; tryStart(room); }, 7000);
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

    /* -- 세션 확립 -- */
    if (m.t === 'hello') {
      if (me) return;
      let token = typeof m.token === 'string' ? m.token : null;
      if (!token || !sessions.has(token)) {
        token = crypto.randomBytes(12).toString('hex');
        if (sessions.size >= 10000) sessions.delete(sessions.keys().next().value);
        sessions.set(token, { name: '', wins: 0 });
      }
      const s = sessions.get(token);
      if (m.name) s.name = String(m.name).slice(0, 12).trim() || s.name;

      me = {
        id: crypto.randomBytes(4).toString('hex'),
        token,
        name: s.name || '무명',
        wins: s.wins,
        ws,
        alive: false,
        score: 0,
        state: null,
        stateAt: 0,
        movementBudget: 40,
        movementAt: Date.now(),
        shots: [],
        lastShotAt: 0
      };
      ws.send(JSON.stringify({ t: 'hello', id: me.id, token, name: me.name, wins: me.wins }));
      return;
    }
    if (!me) return;

    /* -- 방 입장 -- */
    if (m.t === 'join') {
      if (room) {
        room.players.delete(me.id);
        if (room.phase === 'countdown') room.order = room.order.filter(id => id !== me.id);
        bcast(room, { t: 'pl', id: me.id });
        checkEarlyEnd(room);
      }
      room = findRoom(m.mode === 'ARENA' ? 'ARENA' : 'DIST');
      me.alive = false;
      me.score = 0;
      me.state = null;
      me.stateAt = 0;
      me.movementBudget = 40;
      me.movementAt = Date.now();
      me.shots = [];
      me.lastShotAt = 0;
      room.players.set(me.id, me);

      // 카운트다운 중이면 이번 라운드에 합류시킵니다
      if (room.phase === 'countdown') {
        room.order.push(me.id);
        me.alive = true;
      }

      // 스냅샷(모드 포함)을 먼저 보낸 뒤 페이즈를 알립니다
      ws.send(JSON.stringify(snapshot(room)));
      if (room.phase === 'countdown') {
        bcast(room, {
          t: 'phase', phase: 'countdown',
          seed: room.seed, ends: room.phaseEnds, order: room.order
        });
      }
      bcast(room, { t: 'pj', pl: { id: me.id, name: me.name, wins: me.wins } }, me.id);
      tryStart(room);
      return;
    }
    if (!room) return;

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
      const speedSquared = m.v[0] ** 2 + m.v[1] ** 2 + m.v[2] ** 2;
      if (vecDistanceSquared(me.state.p, m.o) > 15 ** 2 || speedSquared < 1 || speedSquared > 250 ** 2 ||
          shotNow - me.lastShotAt < 100) return;
      me.lastShotAt = shotNow;
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
    if (!room || !me) return;
    room.players.delete(me.id);
    bcast(room, { t: 'pl', id: me.id });
    if (room.players.size === 0) {
      clearTimeout(room.timer);
      rooms.delete(room.id);
    } else {
      checkEarlyEnd(room);
    }
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

if (require.main === module) {
  httpServer.listen(PORT, () => {
    console.log(`종이비행기 서버 실행 중 → http://localhost:${PORT}`);
  });
}

module.exports = { httpServer, wss };
