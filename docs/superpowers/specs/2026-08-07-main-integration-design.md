# 원격 main 선별 통합 설계

작성일: 2026-08-07
상태: 사용자 지시로 확정. **로컬 전용 — push·배포 금지.**

## 방향 (사용자 확정)

로컬(`KHR0907/main`, HEAD d558e2d)을 베이스로 유지하고, origin/main(7e84a2f)의 기능을 선별 이식한다.

**로컬 유지 (건드리지 않음):** ARENA 드롭인 멀티플레이, 바이옴 맵 생성, 기본 비행기 프리셋, 실시간 스탯 패널, Rapier 플래그, 접기 화면 로비로 나가기, 물리엔진(로컬).

**접기 엔진: 보류 (사용자 지시)** — 이번 통합에서 접기 코어·편집기(paper-fold-model.js, fold-editor-3d.mjs, paper-fold-ui.js)와 main의 대응물(viewport 등)을 어느 쪽으로 갈지 결정하지 않는다. 통합 작업은 접기 관련 파일을 일절 수정하지 않으며, 베이스가 로컬이므로 로컬 구현이 당분간 그대로 동작한다. main의 접기 변경(7d5af04·9a9dbe2의 fold 부분)은 이식하지 않는다.

**main에서 이식:**
1. DIST 라운드 접기 개선 — FOLDING_MS 120초, **전원 접기 완료 시 조기 launch**(`startLaunchIfFoldsComplete`), 제출 유예(FOLD_SUBMISSION_GRACE_MS 300ms)
2. 서버 시계 동기화 — phase 메시지에 `serverNow`/`duration` 포함, 클라이언트가 시계 오프셋 보정해 타이머 표시
3. 발사 연출 — `public/launch-transition.js` + `test/launch-transition.test.js` + index.html 발사 흐름 개선분
4. 대기실 슬롯 모바일 수정 — 슬롯 한 줄 유지·마스코트 슬롯 내 고정 (637d1ee/2bc42ba/854d144의 css·waiting-room-3d.js·마크업)

## 이식 시 적응 규칙

- main의 해당 코드는 라운드제 전제(양 모드) — 로컬은 ARENA가 live이므로 **round 경로(DIST)에만** 적용하고 live 방 로직과 절연한다. 특히 `removePlayerFromRoom`의 order 정리 조건은 로컬(`waiting || live`)과 main(`!== results`)이 충돌 — 통합 결과는 "results가 아니면 정리하되 live 포함" 의미가 양쪽 요구를 모두 만족하는지 라운드·live 테스트로 검증해 결정.
- 클라이언트 index.html은 로컬 쪽이 크게 변형됨 — main 커밋을 참고 소스로 읽고 **로컬 구조에 맞춰 재구현**한다 (기계적 cherry-pick 금지).
- main의 server.test.js/multiplayer-flow.test.js 추가 케이스 중 이식 기능 관련분은 로컬 테스트 스타일로 가져온다.
- fold_done 제출 유예: live 방(즉시 개인 스폰)에는 무의미 — DIST folding 페이즈 전용.

## 검증

- `npm test` 전체 통과 (기존 154 + 이식 테스트)
- 브라우저: DIST 라운드에서 전원 완료 조기 launch·타이머 정확도(시계 오프셋 시나리오는 코드 리뷰로), 발사 연출, 모바일 뷰포트 대기실 슬롯, ARENA 드롭인 회귀
- push 금지, 로컬 서버 재확인
