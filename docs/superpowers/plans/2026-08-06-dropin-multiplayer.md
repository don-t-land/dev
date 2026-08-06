# 드롭인 멀티플레이 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ARENA를 대기실 없는 상시 진행(live) 월드로 전환 — 언제든 참여, 입장 시 접기(시간제한 없음), 즉시 스폰, 사망 시 바로 부활/다시 접기 선택. DIST는 라운드제 유지.

**Architecture:** 서버는 ARENA 방을 생성 즉시 `phase:'live'`로 두고 라운드 전이를 없앤다. 스폰은 새 `spawn` 메시지로 개인 단위 처리, 접기는 live 방에서 상시 허용(`fold_ok` 응답). 클라이언트는 ARENA 경로에서 대기실을 우회해 접기 화면 → 스폰으로 직행하고, 사망 시 리스폰 오버레이를 띄운다.

**Tech Stack:** Node 22 `node --test` + `ws` 실서버 테스트, Vanilla JS 클라이언트, Three.js 0.184

## Global Constraints

- 원격 push·배포 금지 (로컬 전용, `main` push는 Jenkins 배포를 트리거하므로 절대 금지)
- DIST 모드의 기존 라운드 흐름(대기실·READY·방장 시작·folding 60초·launch·results)은 회귀 없이 유지 — 기존 테스트 전부 통과 필수
- `fold_done` 검증 경로(replayFoldCommands → deriveAerodynamicProfile)는 변경 금지, 호출 조건만 확장
- 이동 예산·발사 궤적·피격 근접 검증 등 기존 치팅 방어는 live에도 동일 적용
- UI 문구는 한국어
- `MAX_PLAYERS = { DIST: 4, ARENA: 8 }`, 리스폰 쿨다운 2000ms (상수 `RESPAWN_COOLDOWN_MS`)
- 에러 코드: `FOLD_REQUIRED`, `ALREADY_ALIVE`, `RESPAWN_COOLDOWN`, ARENA에서 start/ready/results-ready는 `ARENA_LIVE`
- 커밋 메시지 끝에 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

## 프로토콜 계약 (전 태스크 공통)

- `fold_ok` (S→C): `{ t:'fold_ok', profile }` — live 방에서 fold_done 성공 시 해당 플레이어에게
- `spawn` (C→S): `{ t:'spawn' }` — live 방에서 `!alive && foldDone`일 때
- `spawned` (S→방 전체): `{ t:'spawned', id, name, angle, profile, commands, kills }` — angle은 라디안, 스폰 좌표는 `[cos(angle)*130, 130, sin(angle)*130]`
- `leaderboard` (live 방): rows = `{ id, name, kills, score, alive }` — score는 현재(또는 마지막) 생존 초, 정렬 kills desc → score desc
- live 방 스냅샷: `phase:'live'`, 기존 필드 유지 + 플레이어별 `kills`

---

### Task 1: 서버 — ARENA live 방 수명주기

**Files:**
- Modify: `server.js` (헤더 주석, makeRoom, MAX_PLAYERS, findRoom, roomSummary, join/start/ready/results-ready 핸들러, startCountdown 제거)
- Test: `test/arena-live.test.js` (신규)

**Interfaces:**
- Produces: ARENA 방은 생성 즉시 `phase:'live'`·시드 고정, live 방 join 허용, 빠른 참가 자동 방 생성, `joinable` 기준 모드별 분기, ARENA에서 start/ready/results-ready → `{t:'error', code:'ARENA_LIVE'}`
- Consumes: 기존 방·세션 구조

- [ ] **Step 1: 실패하는 테스트 작성** — `test/arena-live.test.js`. 기존 `test/multiplayer-flow.test.js`의 WebSocket 헬퍼 패턴(서버 기동, ws 연결, 메시지 대기)을 재사용해 작성:

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert');
// 기존 test/multiplayer-flow.test.js 상단의 서버 기동·connect·expectMessage 헬퍼를 동일하게 복사/재사용한다.
// (그 파일의 헬퍼가 모듈로 분리되어 있지 않으므로, 같은 패턴을 이 파일에 맞게 옮겨 온다)

test('ARENA 방은 생성 즉시 live 상태다', async () => {
  // hello → create {mode:'ARENA'} → room 스냅샷 수신
  // assert: snapshot.phase === 'live', snapshot.seed가 0이 아닌 수, maxPlayers === 8
});

test('진행 중인 ARENA live 방에 코드로 중도 참여할 수 있다', async () => {
  // A: create ARENA → live. B: join {code} → room 스냅샷 수신 (에러 아님)
  // assert: B 스냅샷 phase 'live', players에 A·B 포함
});

test('ARENA 빠른 참가는 자리 있는 공개 live 방을 찾고 없으면 자동 생성한다', async () => {
  // B1: join {mode:'ARENA'} (방 없음) → room 스냅샷 (자동 생성, phase live, 본인 포함)
  // B2: join {mode:'ARENA'} → 같은 방 code로 배정됨
});

test('ARENA live 방에서 start/ready/results-ready는 ARENA_LIVE 에러다', async () => {
  // create ARENA 후 start → error ARENA_LIVE; ready → error ARENA_LIVE; results-ready → error ARENA_LIVE
});

test('room 목록에서 ARENA live 방은 인원 미만이면 joinable이다', async () => {
  // create ARENA(공개) 후 별도 연결로 list → rooms에서 해당 방 joinable === true, phase 'live'
});
```

테스트 본문은 위 주석 시나리오를 실제 코드로 완성한다 (기존 multiplayer-flow.test.js가 사용하는 것과 동일한 연결·수신 유틸 사용).

- [ ] **Step 2: 실패 확인**

Run: `node --test test/arena-live.test.js`
Expected: FAIL (phase가 'waiting', join 거부 등)

- [ ] **Step 3: 서버 구현** — `server.js`:

1. 헤더 주석(9-10행) 갱신: `- 라운드: DIST는 waiting → folding(60s) → launch → playing → results / ARENA는 상시 live (드롭인·개인 스폰)`
2. `MAX_PLAYERS = { DIST: 4, ARENA: 8 }`
3. `makeRoom(mode, visibility)`: 마지막에 ARENA 분기 추가 —

```js
  if (mode === 'ARENA') {
    room.phase = 'live';
    room.seed = crypto.randomInt(2 ** 31);
    room.startedAt = Date.now();
  }
```

4. `findRoom(mode)`: joinable 조건을 모드별로 —

```js
function joinablePhase(room) {
  return room.mode === 'ARENA' ? room.phase === 'live' : room.phase === 'waiting';
}

function findRoom(mode) {
  for (const room of rooms.values()) {
    if (room.visibility === 'public' && room.mode === mode && joinablePhase(room) &&
        room.players.size < maxPlayers(room)) return room;
  }
  return mode === 'ARENA' ? makeRoom('ARENA', 'public') : null;
}
```

주의: 기존 `findRoom`이 null을 반환할 때의 처리(DIST 빠른 참가에서 방 없음)가 어떻게 되어 있는지 확인하고 기존 동작 유지. (현재 join 핸들러는 `findRoom` 결과를 그대로 targetRoom으로 쓰므로 null이면 이후 가드에서 걸린다 — DIST에서 방이 없으면 기존과 동일하게 동작해야 한다. 현재 코드가 null 시 `targetRoom.phase` 접근으로 crash한다면 그것은 기존 버그이므로 `if (!targetRoom) { sendJson(ws, { t:'error', code:'ROOM_NOT_FOUND', message:'참여 가능한 방이 없습니다. 방을 만들어 보세요' }); return; }` 가드를 추가한다.)
5. `roomSummary`: `joinable: joinablePhase(room) && room.players.size < maxPlayers(room)`
6. `join` 핸들러: `if (targetRoom.phase !== 'waiting')` 거부를 `if (!joinablePhase(targetRoom))`로 교체
7. `start` 핸들러 최상단에 —

```js
      if (room.mode === 'ARENA') {
        sendJson(ws, { t: 'error', code: 'ARENA_LIVE', message: '오래 날기는 항상 진행 중입니다. 접기를 마치면 바로 참여합니다' });
        return;
      }
```

`ready`·`results-ready` 핸들러에도 동일한 ARENA 가드 추가 (같은 code/message).
8. `startCountdown` 함수 삭제 (죽은 코드).
9. `removePlayerFromRoom`의 waiting 전용 order 정리(269행)는 live 방에도 적용: `if (room.phase === 'waiting' || room.phase === 'live') room.order = room.order.filter(...)`.

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: 신규 5개 + 기존 전부 PASS (DIST 회귀 없음)

- [ ] **Step 5: 커밋**

```bash
git add server.js test/arena-live.test.js
git commit -m "feat: make arena rooms persistent drop-in worlds"
```

---

### Task 2: 서버 — live 접기·스폰·리스폰·킬 집계

**Files:**
- Modify: `server.js` (플레이어 필드, fold_done, spawn 신규 핸들러, onCrash/checkEarlyEnd, expectedSpawn, leaderboardMessage, ss·shoot·hit·crash·s 페이즈 가드)
- Test: `test/arena-live.test.js` (추가)

**Interfaces:**
- Consumes: Task 1의 live 방
- Produces: 프로토콜 계약 그대로의 `fold_ok`/`spawn`/`spawned`, ARENA 리더보드 `{id,name,kills,score,alive}`, `RESPAWN_COOLDOWN_MS = 2000`

- [ ] **Step 1: 실패하는 테스트 추가** — `test/arena-live.test.js`에:

```js
test('live 방 접기 → fold_ok → spawn → spawned 브로드캐스트', async () => {
  // A create ARENA, B join. B fold_done(유효 커맨드: paperFoldModel.getPresetCommands('dart') 직렬화 사용)
  // → B가 fold_ok {profile} 수신 → B spawn → A·B 모두 spawned {id:B, angle, profile, commands, kills:0} 수신
});

test('spawn 가드: 미접기 FOLD_REQUIRED, 생존 중 ALREADY_ALIVE, 사망 직후 RESPAWN_COOLDOWN', async () => {
  // 접기 전 spawn → FOLD_REQUIRED
  // 접고 spawn 후 다시 spawn → ALREADY_ALIVE
  // crash 신고로 사망 → 즉시 spawn → RESPAWN_COOLDOWN → 2.1초 후 spawn → spawned (프로필 재사용 = 바로 부활)
  // (테스트 시간 단축을 위해 RESPAWN_COOLDOWN_MS를 env로 오버라이드 가능하게 해도 좋으나, 2초 실대기도 허용)
});

test('격추 시 killer의 kills가 증가하고 리더보드가 kills/생존초 형식이다', async () => {
  // A·B 모두 스폰. A가 shoot(검증 통과 좌표) → hit {id:B, p:궤적상 좌표}
  // → crashed {id:B, by:A이름} 수신, 이후 leaderboard rows에서 A.kills === 1
  // rows 각 행에 kills(number)·score(number)·alive(boolean) 존재, 정렬 kills desc 우선
  // 기존 test/server.test.js의 shoot/hit 좌표 구성 방식을 참고해 검증을 통과하는 궤적을 만든다
});

test('live 방에서는 전원이 죽어도 방이 끝나지 않는다', async () => {
  // A·B 스폰 → 둘 다 crash → results/phase 메시지가 오지 않고 방 스냅샷은 여전히 live
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/arena-live.test.js`
Expected: 신규 4개 FAIL

- [ ] **Step 3: 서버 구현** — `server.js`:

1. 상수: `const RESPAWN_COOLDOWN_MS = Number(process.env.RESPAWN_COOLDOWN_MS || 2000);` (기존 env 상수들 옆, 동일한 유효성 패턴).
2. 신규 플레이어 필드(hello의 me 생성부와 `resetPlayerForRoom`): `kills: 0, lifeStartedAt: 0, diedAt: 0, spawnAngle: null`.
3. `fold_done` 가드 교체 —

```js
    if (m.t === 'fold_done') {
      const liveFold = room.phase === 'live' && !me.alive;
      const roundFold = room.phase === 'folding' && !me.foldDone;
      if (!liveFold && !roundFold) return;
```

검증 성공 후 기존 fold_status 브로드캐스트는 `roundFold`일 때만 수행하고, `liveFold`면 대신 `sendJson(ws, { t: 'fold_ok', profile: me.aeroProfile });` (liveFold에서는 `me.foldDone = true` 유지 — 리스폰 시 재사용).
4. `spawn` 핸들러 신규 (fold_done 다음에):

```js
    if (m.t === 'spawn') {
      if (room.phase !== 'live') return;
      if (me.alive) {
        sendJson(ws, { t: 'error', code: 'ALREADY_ALIVE', message: '이미 비행 중입니다' });
        return;
      }
      if (!me.foldDone) {
        sendJson(ws, { t: 'error', code: 'FOLD_REQUIRED', message: '비행기를 먼저 접어 주세요' });
        return;
      }
      const spawnNow = Date.now();
      if (me.diedAt && spawnNow - me.diedAt < RESPAWN_COOLDOWN_MS) {
        sendJson(ws, { t: 'error', code: 'RESPAWN_COOLDOWN', message: '잠시 후 다시 시도해 주세요' });
        return;
      }
      me.spawnAngle = Math.random() * Math.PI * 2;
      me.alive = true;
      me.lifeStartedAt = spawnNow;
      me.state = null;
      me.movementBudget = 40;
      me.movementAt = spawnNow;
      me.ammo = 3;
      me.ammoAt = spawnNow;
      me.shots = [];
      if (!room.order.includes(me.id)) room.order.push(me.id);
      bcast(room, {
        t: 'spawned', id: me.id, name: me.name, angle: me.spawnAngle,
        profile: me.aeroProfile, commands: me.foldCommands, kills: me.kills
      });
      return;
    }
```

5. `expectedSpawn(room, playerId)`: live 방이면 해당 플레이어의 spawnAngle 기반 좌표 `[Math.cos(a)*130, 130, Math.sin(a)*130]` 반환 (spawnAngle이 null이면 기존 로직).
6. `onCrash`: 가드 `if ((room.phase !== 'playing' && room.phase !== 'live') || !player.alive) return;` 로 교체. live 분기 —

```js
  if (room.phase === 'live') {
    player.score = (Date.now() - player.lifeStartedAt) / 1000;
    player.diedAt = Date.now();
    if (byName) {
      const killer = [...room.players.values()].find(p => p.name === byName && p.alive);
      if (killer) killer.kills += 1;
    }
    bcast(room, { t: 'crashed', id: player.id, by: byName || null });
    return; // live에서는 조기 종료 검사 없음
  }
```

주의: killer를 이름으로 찾는 것은 동명이인에 취약 — `onCrash(room, player, byName)` 시그니처를 `onCrash(room, player, killer)`(플레이어 객체 또는 null)로 바꾸고 `hit` 핸들러에서 `onCrash(room, target, me)`로 호출, crashed 메시지의 `by`는 `killer?.name || null`, kills 증가는 `killer.kills += 1`로 구현한다 (DIST/round 경로 호출부도 함께 갱신).
7. `checkEarlyEnd`: 첫 줄 가드에 live 제외 (playing 전용 유지 — onCrash live 분기가 이미 return하므로 호출되지 않지만 방어적으로 `if (room.phase !== 'playing') return;` 유지).
8. `leaderboardMessage`: live 분기 —

```js
  if (room.mode === 'ARENA' && room.phase === 'live') {
    const rows = [...room.players.values()].map(player => ({
      id: player.id,
      name: player.name,
      kills: player.kills,
      score: Math.round((player.alive ? (now - player.lifeStartedAt) / 1000 : player.score) * 10) / 10,
      alive: player.alive
    })).sort((a, b) => b.kills - a.kills || b.score - a.score);
    return { t: 'leaderboard', rows };
  }
```

9. 페이즈 가드 확장: `s`(비행 상태)·`crash`·`shoot`·`hit` 핸들러의 `room.phase !== 'playing'`을 `!['playing','live'].includes(room.phase)` (또는 동등한 헬퍼 `isFlightPhase(room)`)로 교체. 20Hz `ss` 브로드캐스트와 250ms 리더보드 브로드캐스트의 `phase === 'playing'` 조건에 `|| phase === 'live'` 추가.
10. `snapshot(room)`: live 방도 crafts 포함 (기존 조건에 live 추가), 플레이어 직렬화에 `kills` 필드 추가 (251행 부근).

- [ ] **Step 4: 전체 테스트 통과 확인**

Run: `npm test`
Expected: 전체 PASS

- [ ] **Step 5: 커밋**

```bash
git add server.js test/arena-live.test.js
git commit -m "feat: add per-player spawn, respawn, and kill tracking to live arenas"
```

---

### Task 3: 클라이언트 — ARENA 드롭인 입장·접기·스폰 흐름

**Files:**
- Modify: `public/paper-fold-ui.js` (타이머 없는 모드 + 초기 커맨드 옵션)
- Modify: `public/index.html` (handle()의 room/fold_ok/spawned 분기, applyPhase live 진입 함수, enterRoomLobby 우회)

**Interfaces:**
- Consumes: Task 1·2의 서버 프로토콜
- Produces: `paperFoldingStage.enter({ ends: null, initialCommands, onComplete })` — `ends`가 유한수가 아니면 타이머 숨김·자동 잠금 없음, `initialCommands`(JSON 문자열)가 유효하면 그 상태에서 시작. `enterLiveArena(m)` — live 스냅샷으로 월드 구축 + 접기 화면 진입. Task 4가 이 함수와 spawned 흐름 위에 리스폰 오버레이를 얹는다.

- [ ] **Step 1: fold-ui 타이머리스 모드** — `public/paper-fold-ui.js`:

상태 변수에 `let timed = true;` 추가. `enter(options)`에서:

```js
    timed = Number.isFinite(Number(options?.ends));
    ends = timed ? Number(options.ends) : 0;
    const initial = typeof options?.initialCommands === 'string' && options.initialCommands !== '[]'
      ? api.replayFoldCommands(options.initialCommands)
      : null;
    model = initial || api.createPaperModel();
    $('fold-timer').classList.toggle('hide', !timed);
```

(기존 `model = api.createPaperModel(); ends = ...` 줄을 위 코드로 대체. `.hide` 클래스는 index.html 전역에서 이미 쓰는 유틸리티 클래스다.)
`render()`의 타이머 갱신·`if (left <= 0 && !locked) lock(...)` 블록을 `if (timed) { ... }`로 감싼다.
`lock()`의 완료 문구는 timed 여부로 분기: timed면 기존 문구, 아니면 `'완성 · 활공 시작!'`.
`updateStats()`의 상태 문구도 timed가 아니면 대기 문구 대신 `완성 버튼을 누르면 바로 출격합니다` 계열로 분기.

- [ ] **Step 2: index.html — live 진입·스폰 처리**:

1. `handle()`의 `case 'room'`에 live 분기 (waiting 분기 앞):

```js
      if (m.phase === 'live') {
        const alreadyInWorld = Number(m.seed) === Number(game.seed) &&
          (game.phase === 'playing' || game.phase === 'folding');
        if (!alreadyInWorld) enterLiveArena(m);
        refreshBoard();
        break;
      }
```

2. `enterLiveArena(m)` 신규 (applyPhase 근처에 정의):

```js
function enterLiveArena(m) {
  game.mode = 'ARENA';
  game.seed = Number(m.seed) || 0;
  game.order = Array.isArray(m.order) ? m.order : [];
  game.ends = 0;
  net.leaderboard = [];
  hideResults();
  buildArena(game.seed);
  applyCraftSnapshots(m.crafts);
  enterFolding();
  window.paperFoldingStage?.enter({
    ends: null,
    initialCommands: net.lastFoldCommands || '[]',
    onComplete: fold => {
      net.lastFoldCommands = fold.commands;
      send({ t: 'fold_done', commands: fold.commands });
    }
  });
}
```

`net` 객체 초기화부에 `lastFoldCommands: '[]'` 필드 추가.
3. `handle()`에 신규 케이스 2개 (`fold_status` 케이스 옆에):

```js
    case 'fold_ok':
      send({ t: 'spawn' });
      break;

    case 'spawned': {
      if (m.id === net.id) {
        window.paperFoldingStage?.leave();
        enterGame();
        game.phase = 'playing';
        const angle = Number(m.angle) || 0;
        craft.position.set(Math.cos(angle) * 130, 130, Math.sin(angle) * 130);
        const center = craft.position.clone().multiplyScalar(-1).normalize();
        me.yaw = Math.atan2(-center.x, -center.z);
        me.pitch = -0.05; me.roll = 0; me.speed = 22;
        freeLook = { yaw: 0, pitch: 0 };
        me.alive = true;
        me.dist = 0; me.surv = 0;
        me.ammo = 3; me.ammoT = 0;
        game.frozen = false;
        craft.visible = true;
        craft.rotation.set(me.pitch, me.yaw, -me.roll);
        setCraftFromFoldModel(
          window.paperFoldModel.replayFoldCommands(m.commands || net.lastFoldCommands || '[]'),
          m.profile,
          m.commands || net.lastFoldCommands
        );
        syncRapierMap();
        syncRapierFromCraft();
        hideCenter();
      } else {
        const player = net.players.get(m.id) || (addRemote({ id: m.id, name: m.name, wins: 0 }), net.players.get(m.id));
        if (player) {
          player.alive = true;
          player.remote.seen = false;
          setFoldedCraftVisual(
            player.remote.group,
            player.remote.baseVisual,
            window.paperFoldModel.replayFoldCommands(m.commands || '[]'),
            player.remote.color,
            m.commands || '[]'
          );
        }
        showKill(`${escapeHtml(m.name || '조종사')} 참전!`);
      }
      refreshBoard();
      break;
    }
```

주의: `setCraftFromFoldModel`·`setFoldedCraftVisual`·`addRemote`의 실제 시그니처를 코드에서 확인해 호출을 맞춘다 (위 코드는 의도 기술 — 파라미터 순서·기본값은 현재 구현 기준으로 조정하되, "스폰한 플레이어의 접은 기체 비주얼과 프로필을 적용한다"는 결과가 요구사항).
4. `enterRoomLobby` 진입 경로 확인: room 스냅샷 처리에서 live는 위 1번 분기로 선점되므로 대기실로 갈 일이 없어야 한다. `case 'phase'`는 live 방에서 오지 않는다.
5. `isSameRoundPhase`에 live 추가는 하지 않는다 (1번 분기가 선행 처리).

- [ ] **Step 3: 정적 검증 + 기존 테스트**

Run: `node --check public/paper-fold-ui.js && npm test`
Expected: 전체 PASS (index.html 동작은 Task 5에서 검증)

- [ ] **Step 4: 커밋**

```bash
git add public/paper-fold-ui.js public/index.html
git commit -m "feat: route arena entry through timerless folding into instant spawn"
```

---

### Task 4: 클라이언트 — 리스폰 오버레이·리더보드·로비 표기

**Files:**
- Modify: `public/index.html` (리스폰 오버레이 마크업 + crashed 분기 + refreshBoard live 형식 + 방 목록/입장 카피)
- Modify: `public/multiplayer-flow.css` (오버레이 스타일)

**Interfaces:**
- Consumes: Task 3의 spawned 흐름, `net.lastFoldCommands`
- Produces: `#respawn-overlay` (버튼 `#respawn-now-btn`, `#respawn-refold-btn`), live 리더보드 `N킬 · Ns` 표기

- [ ] **Step 1: 오버레이 마크업** — `public/index.html`의 `<div id="results" ...>` 요소 앞(HUD 내부 동일 계층)에:

```html
<div id="respawn-overlay" class="hide" role="dialog" aria-labelledby="respawn-title">
  <div class="respawn-card">
    <div class="fold-kicker">SHOT DOWN</div>
    <h2 id="respawn-title">격추되었습니다</h2>
    <p id="respawn-detail"></p>
    <div class="button-row">
      <button id="respawn-now-btn" class="action-btn primary">바로 부활</button>
      <button id="respawn-refold-btn" class="action-btn">다시 접기</button>
    </div>
    <div id="respawn-status" role="status"></div>
  </div>
</div>
```

CSS (`multiplayer-flow.css` 끝에):

```css
#respawn-overlay { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(6,9,26,.62); backdrop-filter:blur(3px); z-index:60; }
#respawn-overlay.hide { display:none; }
.respawn-card { background:rgba(13,19,48,.94); border:1px solid rgba(134,220,245,.28); border-radius:20px; padding:28px 34px; text-align:center; display:flex; flex-direction:column; gap:14px; min-width:300px; }
.respawn-card h2 { font-size:clamp(24px,3vw,36px); letter-spacing:-.04em; }
.respawn-card p { color:#cfe6f4; font-size:14px; }
.respawn-card .button-row { display:flex; gap:10px; justify-content:center; }
```

- [ ] **Step 2: crashed → 오버레이, 버튼 동작** — index.html 모듈:

`case 'crashed'`의 본인 분기에서, `game.phase`가 live 흐름(ARENA에서 `net.room?.phase === 'live'`)이면 `showRespawnOverlay(m.by)` 호출 추가 (관전 문구 showCenter 대신).

```js
function showRespawnOverlay(byName) {
  $('respawn-detail').textContent = byName
    ? `${byName} 님에게 격추 · 이번 생존 ${Math.floor(me.surv)}초`
    : `추락 · 이번 생존 ${Math.floor(me.surv)}초`;
  $('respawn-status').textContent = '';
  $('respawn-overlay').classList.remove('hide');
  $('respawn-now-btn').disabled = false;
  $('respawn-now-btn').focus();
}
```

`dieLocal`: live 방이면 `showCenter(...관전...)` 대신 오버레이 (crash 자체 신고 경로).
버튼 리스너 (기존 버튼 리스너들 옆):

```js
$('respawn-now-btn').addEventListener('click', () => {
  $('respawn-now-btn').disabled = true;
  $('respawn-status').textContent = '부활 요청 중…';
  send({ t: 'spawn' });
});
$('respawn-refold-btn').addEventListener('click', () => {
  $('respawn-overlay').classList.add('hide');
  enterFolding();
  window.paperFoldingStage?.enter({
    ends: null,
    initialCommands: net.lastFoldCommands || '[]',
    onComplete: fold => {
      net.lastFoldCommands = fold.commands;
      send({ t: 'fold_done', commands: fold.commands });
    }
  });
});
```

`RESPAWN_COOLDOWN` 에러 수신 시(`case 'error'` 분기에서 code 확인) 오버레이가 열려 있으면 `#respawn-status`에 메시지 표시 + 1초 후 버튼 재활성화 (전역 에러 배너 대신). `spawned`(본인) 수신 시 `$('respawn-overlay').classList.add('hide')` 추가 (Task 3의 본인 분기에 한 줄).

- [ ] **Step 3: 리더보드·생존시간 HUD** — `refreshBoard()`에 live 분기: `net.room?.phase === 'live'`이면 행 형식 `\`${index + 1}. ${escapeHtml(row.name)}\`` + 점수 셀 `\`${row.kills ?? 0}킬 · ${row.score}s\``. leaderboard 케이스에서 kills도 player에 반영. `me.surv`는 기존 playing 루프가 갱신하는지 확인하고 live에서도 동일 동작 보장.

- [ ] **Step 4: 접기 화면 인원 표기** — live 접기 중에는 `paperFoldingStage.setRoomProgress` 대신 방 인원 요약을 보여준다: `room` 스냅샷(live) 수신 시 접기 화면이 활성이면 `$('fold-status')` 옆이 아닌 기존 roomProgress 표시 경로를 재사용해 `완료 N/M명` 대신 `방 인원 N명 · 전투 진행 중` 문구가 되도록 fold-ui의 `updateStats` live(=!timed) 분기에서 `roomProgress.total`을 인원수로 해석해 표기한다 (fold-ui에 새 setter를 만들기보다 `setRoomProgress(done, total)` 호출을 live에서는 `(생존자 수, 전체 인원)`으로 호출하고 !timed일 때 문구만 바꾼다).

- [ ] **Step 5: 로비 표기** — `renderRoomList`에서 ARENA 방은 `진행 중 · ${players}/${maxPlayers} · 바로 참여` 배지, `openRoomEntry`의 `UP TO 4 PLAYERS`를 모드별(`UP TO ${entryMode === 'ARENA' ? 8 : 4} PLAYERS`)로, `ROOM_ENTRY_COPY.ARENA.description`을 `'접기를 마치는 순간 바로 전장에 합류합니다. 언제든 드나들 수 있어요.'`로 교체.

- [ ] **Step 6: 정적 검증**

Run: `npm test`
Expected: 전체 PASS

- [ ] **Step 7: 커밋**

```bash
git add public/index.html public/multiplayer-flow.css public/paper-fold-ui.js
git commit -m "feat: add respawn overlay and live arena leaderboard"
```

---

### Task 5: 브라우저 통합 검증 (탭 2개)

**Files:**
- 코드 변경 없음 (발견된 결함은 이 태스크에서 수정 후 커밋)

- [ ] **Step 1: 전체 테스트 + 서버 재기동**

Run: `npm test` 후 기존 서버 프로세스를 종료하고 `npm start` 재기동 (`curl -s localhost:3000/healthz` 확인). 로컬 전용 — push 금지.

- [ ] **Step 2: Playwright 시나리오**

1. 탭 A: 접속 → 오래 날기 빠른 참가 → 접기 화면(타이머 없음 확인) → 기본 비행기 → 완성 → **즉시 스폰**되어 비행 시작
2. 탭 B: 접속 → 방 목록에서 A의 방(진행 중 · 1/8 · 참여 가능) 클릭 참여 → 접기 → 완성 → A가 나는 중인 월드에 **중도 스폰**, A 화면에 "참전!" 표시
3. A가 B를 격추(또는 B가 crash) → B에 리스폰 오버레이 → [바로 부활] → 쿨다운 후 재스폰 확인 → 다시 사망 → [다시 접기] → 접기 화면(이전 접기 상태 유지) → 완성 → 재스폰
4. 리더보드가 `N킬 · Ns` 형식으로 두 탭에서 일치
5. DIST 회귀: 거리 방 생성 → 대기실 표시 → READY → START → 60초 접기 → 기존 흐름 정상
6. 콘솔 에러 확인, 스크린샷 저장 (스폰 직후·리스폰 오버레이·리더보드)

- [ ] **Step 3: 발견 결함 수정 후 커밋 (없으면 생략)**

```bash
git add -A && git commit -m "fix: polish drop-in arena flow"
```
