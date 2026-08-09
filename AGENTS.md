# Dont Land AI 작업 계약

이 파일은 저장소에서 작업하는 모든 AI coding agent에게 적용됩니다. 목표는 검증을 줄이는 것이 아니라, 값싼 검증을 앞에 두고 commit·push·배포 같은 외부 부작용은 마지막에 한 번만 수행하는 것입니다.

## 기본 원칙

- 사용자가 요청한 범위만 변경합니다. 관련 없는 정리나 리팩터링을 섞지 않습니다.
- 작은 버그는 관련 client/server/test 파일부터 읽고, 막힐 때만 조사 범위를 넓힙니다.
- 구현 전 완료 조건과 반례를 짧게 정의합니다.
- 가능하면 실패하는 회귀 테스트를 먼저 만들고 RED를 실제로 확인합니다.
- 구현 중에는 관련 테스트만 실행합니다. 전체 suite는 release candidate가 확정된 뒤 실행합니다.
- 독립 리뷰와 반례 검토는 version bump, commit, push, deploy보다 먼저 끝냅니다.
- 비동기 reviewer를 release gate로 사용했다면 결과가 오기 전에 commit하거나 배포하지 않습니다. 결과를 기다릴 수 없다면 foreground reviewer 또는 직접 adversarial review로 gate를 닫습니다.
- review finding은 먼저 재현 테스트로 고정한 뒤 수정합니다.
- 버전·changelog·asset cache key는 최종 diff가 확정된 뒤 한 번만 갱신합니다.
- 정상 작업에서 commit, push, immutable deploy는 각각 한 번을 목표로 합니다.
- 배포를 새 shell로 재구현하지 말고 `deploy/README.md`와 `deploy/dontland.sh` 계약을 먼저 확인합니다.
- 수동 SSH 배포는 사용자가 요청했거나 기존 자동 경로가 막힌 break-glass 상황에서만 사용합니다.

## 표준 단계

### 1. 범위와 완료 조건

작업 시작 시 다음을 확인합니다.

- 사용자가 실제로 원하는 observable behavior
- 변경해야 하는 client/server/protocol 경계
- 정상 흐름과 실패·취소·중복·지연 응답 반례
- 명시적으로 보존해야 하는 기존 동작
- 배포까지 요청된 작업인지 여부

작은 수정에 장문의 계획 문서를 만들지 않습니다. 복수 컴포넌트나 3단계 이상의 작업만 task list를 사용합니다.

### 2. 최소 조사

우선순위:

1. 관련 production handler/controller
2. 해당 behavior를 다루는 기존 테스트
3. client/server protocol의 반대편
4. version/changelog/cache 규칙
5. 배포가 필요할 때만 `deploy/`

독립적인 파일 읽기와 검색은 병렬로 수행합니다.

### 3. RED

회귀 테스트는 happy path뿐 아니라 해당 변경이 만들 수 있는 race를 포함합니다.

- duplicate action
- stale timer/callback
- off-by-one retry
- delayed or unrelated response
- cancel/restart/disconnect lifecycle
- client/server compatibility

취소된 callback 문제는 timer mock에서 callback을 제거하는 것만 확인하지 말고, 보관된 stale callback을 강제로 실행해도 부작용이 없는지 검증합니다.

### 4. 최소 구현과 targeted GREEN

실패 테스트를 통과시키는 최소 변경만 합니다. 관련 테스트를 먼저 실행하고, 전체 `npm test`를 구현 도중 반복하지 않습니다.

예시:

```bash
node --test --test-name-pattern='respawn' test/hud-policy.test.js
node --test --test-name-pattern='spawn 가드' test/arena-live.test.js
```

### 5. 배포 전 리뷰 gate

최종 diff를 다음 관점으로 검토합니다.

- race condition과 stale work
- 중복 network request
- off-by-one과 경계값
- unrelated error routing
- cancel/cleanup lifecycle
- server/client protocol compatibility
- 보안과 secret 노출
- 기존 flow 회귀

리뷰가 끝나기 전에는 version bump, commit, push, deploy를 하지 않습니다. 리뷰 후 diff가 바뀌면 finding 관련 테스트를 다시 실행하고 변경된 부분을 재검토합니다.

### 6. Release candidate 확정

리뷰가 닫힌 뒤에만 다음을 수행합니다.

1. 필요한 version bump
2. `CHANGELOG.md` 갱신
3. versioned asset cache key 갱신
4. `sh scripts/ai-verify.sh`

`ai-verify.sh`는 release metadata 일관성, `git diff --check`, 전체 test suite를 하나의 최종 gate로 실행합니다.

### 7. 외부 부작용

최종 gate가 통과한 뒤에만 순서대로 수행합니다.

1. commit
2. push 후 exact remote SHA 확인
3. 요청된 경우 immutable deploy
4. health, version, release ID, asset 및 대표 WebSocket behavior 확인

배포 실패 시 rollback 결과까지 검증합니다. 성공한 첫 배포 뒤 늦게 도착한 review를 처리하는 방식은 허용하지 않습니다.

### 8. 보고

중간 메시지는 다음 milestone에만 보냅니다.

- 조사 결과와 확정된 문제
- RED 재현
- review finding
- 최종 검증 및 배포 결과

매 tool call마다 진행 상황을 설명하지 않습니다. 최종 보고에는 변경 behavior, 테스트 결과, commit/SHA, 배포 release와 남은 한계만 포함합니다.

## 작업 규모별 적용

### 작은 버그

```text
완료 조건 → 최소 조사 → RED → 최소 수정 → targeted GREEN
→ adversarial review → release metadata → ai-verify → 단일 commit/push/deploy
```

### 중간 기능

```text
상태 전이·protocol 정의 → 단위 테스트 → 구현 → integration test
→ 독립 리뷰 → finding 회귀 테스트 → ai-verify → 단일 release
```

### UI 작업

```text
대상 viewport·acceptance 정의 → DOM/CSS 최소 수정 → 관련 test
→ 실제 browser screenshot/interaction → review → ai-verify → 단일 release
```

문자열 기반 HTML 테스트만으로 시각적 완료를 주장하지 않습니다.

## 금지되는 순서

```text
구현 → version bump → commit/push/deploy → 늦은 review → 두 번째 release
```

권장 순서:

```text
구현 → targeted test → review → finding 수정 → ai-verify
→ version이 포함된 최종 commit → push → deploy → runtime smoke
```
