# 드롭인 멀티플레이 설계 (프로젝트 2/3)

작성일: 2026-08-06
상태: 사용자 승인 대기

## 배경

사용자 결정 사항 (브레인스토밍 확정):

- ARENA(오래 날기)는 **상시 진행 월드**로 전환 — 대기실·대기시간·라운드 시작 없이 언제든 중도 참여 (slither.io 방식)
- 방 개념은 유지: 방 만들기 + 6자리 코드 참여 + 공개 방 목록, 여기에 **빠른 참가(공용 세션)** 추가
- 접기는 **입장할 때** 시간제한 없이 진행, 완료하면 그 사람만 바로 시작
- 격추당하면 **바로 부활** 또는 **다시 접기 후 부활** 중 선택
- DIST(멀리 날기)는 **기존 라운드 기반 유지** (대기실·방장·라운드 흐름 변경 없음)

## 목표

접속 → (빠른 참가 한 번의 클릭) → 접기 → 비행까지 어떤 대기도 없는 ARENA 흐름. 죽어도 몇 초 안에 다시 하늘로.

## 비목표

- DIST 모드 흐름 변경 (라운드제·대기실 유지)
- 서버 권위 물리로의 전환 (기존 이동 예산·궤적 검증 체계 유지)
- 계정·영구 랭킹 (세션 승수 체계 유지)
- 맵 변경 (프로젝트 3에서)

## 서버 설계

### ARENA 방의 새 수명주기

- ARENA 방은 생성 즉시 `phase: 'live'`가 되고 방이 사라질 때까지 그 상태를 유지한다. `waiting/folding/launch/playing/results` 전이는 ARENA에서 제거된다.
- 시드는 방 생성 시 한 번 정해지고 방 수명 동안 불변 (드롭인 참여자도 같은 맵 생성).
- 라운드 타이머(180초), 조기 종료(최후 생존), results/ready 흐름은 ARENA에 적용되지 않는다.
- 방장(hostId)은 ARENA에서 시작 권한 용도가 사라지므로 방 소유 표시 용도로만 유지하고, `start` 메시지는 ARENA 방에서 거부된다.
- 마지막 플레이어가 나가면 방 삭제 (기존 동작 유지).
- ARENA 최대 인원은 8로 상향 (`MAX_PLAYERS.ARENA = 8`). DIST는 4 유지.

### 참가와 스폰 흐름 (ARENA)

1. `join`(코드 또는 빠른 참가) — `phase === 'live'`이고 인원 미만이면 언제든 허용. 입장 직후 플레이어는 **비행 전 상태**(`alive: false`, `foldDone: false`).
2. `fold_done` — live 방에서는 언제든(스폰 전·리스폰 전) 접기 제출 가능. 서버가 기존과 동일하게 리플레이 검증 → 프로필 산출. 성공 시 해당 플레이어에게 `fold_ok { profile }` 응답. 기존 `folding` 페이즈 전용 가드는 "DIST식 folding 페이즈 또는 ARENA live"로 확장.
3. `spawn`(신규, 클라이언트→서버) — live 방에서 `!alive && foldDone`일 때만 허용. 서버가 스폰 각도를 정해 `spawned { id, angle, at, profile }`을 방 전체에 브로드캐스트하고 `alive: true`, 현재 생존 시작 시각(`lifeStartedAt`)을 기록한다. 이동 예산 검증의 기준 스폰 좌표는 이 각도에서 계산한다.
4. 격추/추락(`hit`/`crash`) — 기존 검증 유지. 사망 시 `crashed { id, by }` 브로드캐스트. ARENA에서 killer는 `kills + 1`. 죽은 플레이어는 `alive: false`로 방에 남아 리스폰 대기.
5. 리스폰 — 클라이언트가 다시 `spawn`(바로 부활: 기존 프로필 재사용) 또는 `fold_done` 후 `spawn`(다시 접기). 스팸 방지로 사망 후 2초 내 `spawn`은 거부.

### 점수와 리더보드 (ARENA)

- 플레이어 상태에 `kills`(방 입장 후 누적 격추 수)와 `lifeStartedAt`(현재 생존 시작) 추가.
- 리더보드 행: `{ id, name, kills, survival(현재 생존 초, 죽어 있으면 마지막 생존 기록), alive }`. 정렬: kills 내림차순 → survival 내림차순.
- 기존 250ms 리더보드 브로드캐스트를 live 방에도 적용. `wins`(라운드 승수)는 ARENA에서 의미가 없어져 리더보드에서 제외 (DIST는 유지).

### 방 목록·빠른 참가

- `roomSummary.joinable`: ARENA는 `phase === 'live' && size < max`, DIST는 기존(`waiting`) 기준.
- `findRoom('ARENA')`(빠른 참가): 공개 live 방 중 자리 있는 방을 찾고, **없으면 서버가 공개 방을 자동 생성**해 배정한다. 이 자동 생성 방이 곧 "공용 세션"이다 — 별도 개념을 추가하지 않는다.
- DIST 빠른 참가는 기존 동작(waiting 방 탐색) 유지. 단, 자동 생성은 ARENA에만 적용.

### 스냅샷·상태 동기화

- live 방 스냅샷: `phase: 'live'`, seed, 플레이어 목록(alive/kills 포함), 진행 중 기체 상태. 중도 참가자는 스냅샷으로 즉시 씬을 구성하고 이후 15Hz 상태 보간에 합류.
- 20Hz 상태 브로드캐스트(`ss`)·발사 중계는 `phase === 'playing'` 조건을 `'playing' 또는 'live'`로 확장.
- 재접속 유예(RECONNECT_GRACE_MS)는 live 방에도 동일 적용.

## 클라이언트 설계

### 화면 흐름 (ARENA)

```
홈 → [빠른 참가] ─────────────┐
홈 → [방 만들기(공개/비공개)] ─┼→ 접기 화면(시간제한 없음) → [비행기 완성] → 즉시 스폰·비행
홈 → [코드로 참가] ───────────┘
```

- ARENA 경로에서 대기실 화면·준비 버튼·방장 시작 버튼·결과 화면을 사용하지 않는다.
- 접기 화면 상단 타이머는 ARENA에서 숨긴다 (DIST식 folding 페이즈에서는 유지). "비행기 완성" 클릭 → `fold_done` → `fold_ok` 수신 → `spawn` 전송 → `spawned` 수신 시 게임 화면 진입. 접기 중에도 방 안의 전투는 계속 진행되므로, 접기 화면에 현재 방 인원·리더보드 요약 한 줄을 표시한다.
- 사망 시 **리스폰 오버레이**: 격추자 이름, 내 기록(생존 시간·격추 수), 버튼 [바로 부활] / [다시 접기]. 바로 부활 → 즉시 `spawn`. 다시 접기 → 접기 화면(이전 접기 상태에서 시작) → 완성 → `spawn`.
- 게임 내 리더보드는 kills/생존 시간 표시로 갱신.
- 방 나가기(ESC 메뉴)는 홈으로 복귀 (기존 leave 흐름 재사용).

### DIST 경로

- 기존 로비 → 대기실 → 라운드 흐름 그대로. 방 목록에서 ARENA 방은 "진행 중 · N/8 · 참여 가능"으로 표시된다.

### 홈 화면

- 모드 선택에 ARENA [빠른 참가] 버튼 추가 (닉네임 입력 후 한 번의 클릭으로 접기 화면까지).

## 프로토콜 변경 요약

| 메시지 | 방향 | 변경 |
|---|---|---|
| `fold_done` | C→S | live 방에서 스폰 전·리스폰 전 언제든 허용 (기존 folding 페이즈 조건 확장), 성공 시 `fold_ok` 응답 추가 |
| `fold_ok` | S→C | 신규: `{ profile }` |
| `spawn` | C→S | 신규: live 방에서 `!alive && foldDone`일 때 스폰 요청 |
| `spawned` | S→방 전체 | 신규: `{ id, name, angle, profile, kills }` |
| `crashed` | S→방 전체 | 기존 유지 (ARENA에서 killer kills 증가 반영) |
| `leaderboard` | S→방 전체 | ARENA 행 형식 변경: kills/survival |
| `start`/`ready`/`results-ready` | C→S | ARENA 방에서 거부 (DIST 전용) |
| `join` | C→S | ARENA: live 방 입장 허용, 빠른 참가 시 자동 방 생성 |

## 에러 처리

- `spawn` 거부 사유: 미접기(`FOLD_REQUIRED`), 이미 생존 중(`ALREADY_ALIVE`), 사망 2초 이내(`RESPAWN_COOLDOWN`). 각각 `error` 메시지로 응답.
- live 방에서 `start`/`ready` 수신 시 조용히 무시하지 않고 `error`로 응답해 구버전 클라이언트 디버깅을 돕는다.
- 접기 검증 실패는 기존 `INVALID_FOLD` 유지.

## 테스트

기존 `test/server.test.js`·`test/multiplayer-flow.test.js` 패턴(실제 WebSocket으로 서버에 접속)을 따른다.

- ARENA 방 생성 → 즉시 `phase: 'live'` 스냅샷
- 드롭인: 게임 진행 중 두 번째 플레이어 join → 스냅샷 수신 → fold_done → fold_ok → spawn → spawned 브로드캐스트
- 빠른 참가: 공개 live 방 없을 때 자동 생성, 있을 때 기존 방 배정
- 접기 없이 spawn → `FOLD_REQUIRED`; 생존 중 spawn → `ALREADY_ALIVE`; 사망 직후 spawn → `RESPAWN_COOLDOWN`; 2초 후 spawn 성공(바로 부활, 프로필 재사용)
- 격추 시 killer kills 증가, 리더보드 kills/survival 정렬
- ARENA에서 start/ready → error 응답
- DIST 회귀: 기존 라운드 흐름 테스트 전부 통과 유지

## 마이그레이션 노트

- 현재 서버는 DIST 라운드도 `startFolding`(60초 접기 → launch)으로 시작한다 — 파일 상단 주석("DIST는 countdown")이 낡았고 `startCountdown`은 호출되지 않는 죽은 코드다. folding/launch 페이즈는 **DIST 전용 경로로 유지**하고, `startCountdown`과 낡은 주석은 이번에 정리한다.
- 결과 화면·fold_status 진행 표시(`N/M명 완료`) 등 라운드 대기 UI는 DIST 전용으로 남긴다.
