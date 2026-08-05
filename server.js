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

const PORT = process.env.PORT || 3000;
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
    return res.end(JSON.stringify({ status: 'ok' }));
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
  for (const p of room.players.values())
    if (p.ws.readyState === 1 && p.id !== exceptId) p.ws.send(s);
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
  for (const p of room.players.values()) { p.alive = true; p.score = 0; p.state = null; }
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
  let me = null;
  let room = null;

  ws.on('error', (err) => {
    if (err.code !== 'WS_ERR_UNSUPPORTED_MESSAGE_LENGTH')
      console.error('WebSocket client error:', err.message);
  });

  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }

    /* -- 세션 확립 -- */
    if (m.t === 'hello') {
      let token = typeof m.token === 'string' ? m.token : null;
      if (!token || !sessions.has(token)) {
        token = crypto.randomBytes(12).toString('hex');
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
        state: null
      };
      ws.send(JSON.stringify({ t: 'hello', id: me.id, token, name: me.name, wins: me.wins }));
      return;
    }
    if (!me) return;

    /* -- 방 입장 -- */
    if (m.t === 'join') {
      if (room) {
        room.players.delete(me.id);
        bcast(room, { t: 'pl', id: me.id });
        checkEarlyEnd(room);
      }
      room = findRoom(m.mode === 'ARENA' ? 'ARENA' : 'DIST');
      me.alive = false;
      me.score = 0;
      me.state = null;
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
      if (!Array.isArray(m.p) || !Array.isArray(m.r)) return;
      me.state = { p: m.p, r: m.r };
      if (room.mode === 'DIST' && typeof m.d === 'number')
        me.score = Math.max(me.score, Math.min(m.d, 99999));
      return;
    }

    /* -- 자체 추락 신고 -- */
    if (m.t === 'crash') { onCrash(room, me); return; }

    /* -- 발사 중계 (아레나) -- */
    if (m.t === 'shoot') {
      if (room.mode === 'ARENA' && room.phase === 'playing' && me.alive)
        bcast(room, { t: 'shot', id: me.id, o: m.o, v: m.v }, me.id);
      return;
    }

    /* -- 피격 판정 (발사자가 신고, 서버가 근접 검증) -- */
    if (m.t === 'hit') {
      if (room.mode !== 'ARENA' || room.phase !== 'playing' || !me.alive) return;
      const target = room.players.get(m.id);
      if (!target || !target.alive || target.id === me.id) return;
      // 다트 착탄 지점과 대상의 마지막 위치가 가까운지만 확인 (관대한 검증)
      if (target.state && Array.isArray(m.p)) {
        const dx = target.state.p[0] - m.p[0];
        const dy = target.state.p[1] - m.p[1];
        const dz = target.state.p[2] - m.p[2];
        if (dx * dx + dy * dy + dz * dz > 35 * 35) return;
      }
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
