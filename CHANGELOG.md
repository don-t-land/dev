# Changelog

## 1.7.3 - 2026-08-09

### Changed

- ESC 설정 modal을 viewport 정중앙에 배치하고 최대 크기, 내부 padding, tab rail, 설정 row와 footer 간격을 줄여 더 컴팩트하게 조정했습니다.
- 421~640px 화면에서는 설정 row를 좌우 배치해 불필요한 세로 길이를 줄이고, 420px 이하에서만 세로 stacking하도록 responsive breakpoint를 세분화했습니다.
- browser asset cache key를 앱 버전 `1.7.3`과 일치시켰습니다.

## 1.7.2 - 2026-08-08

### Fixed

- ESC로 설정 메뉴를 닫으며 요청한 pointer lock이 같은 ESC 입력에 의해 거부·취소되어도 `pointerlockchange`가 메뉴를 즉시 다시 열지 않도록 상태 전이를 수정했습니다.
- 로컬 지형 충돌과 서버 격추 판정이 거의 동시에 발생해도 열린 respawn modal을 서버의 authoritative 공격자 정보로 재조정하도록 수정했습니다.
- 설정 sidebar의 ARIA orientation이 desktop에서는 `vertical`, 작은 화면에서는 실제 가로 tab rail에 맞춰 `horizontal`로 동기화되도록 수정했습니다.
- browser asset cache key를 앱 버전 `1.7.2`와 일치시켰습니다.

## 1.7.1 - 2026-08-08

### Added

- ESC 설정 모달에 **조작 / 그래픽 / 오디오** sidebar를 추가하고 선택된 섹션만 독립적으로 스크롤되도록 재구성했습니다. 작은 화면에서는 sidebar가 가로 tab rail로 전환됩니다.
- 설정 tab에 ARIA tab/tabpanel semantics와 방향키·Home·End 탐색을 추가했습니다.
- pause·respawn·results modal에서 `Space`로 현재 focus된 버튼을, focus가 없으면 기본 버튼을 실행할 수 있습니다.

### Changed

- 자가 충돌 사망은 `COLLISION / 충돌했습니다`, 실제 공격자에 의한 사망은 `SHOT DOWN / 격추되었습니다`로 구분해 표시합니다.
- input/HUD policy와 browser asset cache key를 앱 버전 `1.7.1`과 일치시켰습니다.

### Fixed

- 한 번의 ESC 입력에서 key repeat와 pointer-lock 해제 event가 경쟁해 설정 메뉴가 닫힌 직후 다시 열리던 문제를 수정했습니다.
- 사망·결과 modal이 표시된 뒤 지연된 pointer-lock 요청이 완료되어도 즉시 다시 해제해 mouse cursor와 modal 버튼을 항상 사용할 수 있도록 했습니다.
- modal에서 처리한 `Space` 입력이 gameplay 발사 동작으로 전달되지 않도록 차단했습니다.
- 설정 중 사망해도 respawn modal이 pause modal을 선점하고 유일한 interactive HUD layer가 되도록 inert 상태 전이를 수정했습니다.
- sidebar 섹션을 바꾼 뒤 `Tab`/`Shift+Tab` focus가 modal 밖으로 이탈하던 문제를 수정했습니다.

## 1.7.0 - 2026-08-08

### Added

- 랭킹·키 가이드·전술 지도를 하나의 bounded right rail에 배치해 최대 8명 경기에서도 HUD가 독립적으로 겹치지 않도록 했습니다.
- `N` 키로 전체 전장과 플레이어 중심 `주변 420m` 지도를 전환하며, DIST 코스와 ARENA 경계·상대·링·상승기류를 같은 tactical map에 표시합니다.
- 상승기류 진입 시 화면 중심으로 수렴하는 vortex를 표시하고, join·격추·사망 알림을 FIFO announcement로 제공합니다.
- 실제 공격자가 있는 원격 격추에 18개의 world-space 종이 파편을 생성하고 수명 종료 시 geometry·material을 해제합니다.

### Changed

- PC의 클릭형 ESC 설정 버튼을 제거하되 키보드 `Escape`와 모바일 설정 버튼은 유지했습니다.
- 기존 ARENA 전용 minimap module을 통합 tactical map으로 교체하고, DIST 전체 지도 폭은 biome/noise의 수학적 최대 폭을 사용합니다.
- 운영 최신 audio 종료 처리와 rooftop launch 전환을 동기화하면서 beta 전용 양력 `0.70×`, 항력 `0.45×`, 비행 상한 `420m`, 고층 cloud band, loopback binding을 유지했습니다.
- 변경된 input policy, HUD policy, biome helper, map generator의 cache key를 앱 버전 `1.7.0`과 일치시켰습니다.

### Fixed

- local map의 원형 반경 밖 corner marker를 숨기고, reduced-motion에서는 announcement transition과 종이 파편 burst를 생략합니다.
- graphics QA freeze 해제 시 announcement queue가 멈추지 않도록 lifecycle을 복구합니다.
- 순수 터치·극소 viewport에서 숨겨진 tactical map의 Canvas 렌더링을 중단하고, announcement pending queue를 6건으로 제한해 event burst에서도 CPU·메모리 사용이 누적되지 않도록 했습니다.

## 1.6.1 - 2026-08-07

### Added

- 오래 날기(ARENA) 모드에 북쪽 고정 원형 미니맵을 추가했습니다. 경기장 경계, 내 기체 방향, 생존 상대, 에너지 링, 상승기류를 표시합니다.
- 미니맵의 월드 좌표 정규화·경계 클램프·상태 필터링·Canvas 렌더링을 독립 회귀 테스트로 검증합니다.

### Changed

- 중간 폭에서는 미니맵을 leaderboard의 예약 영역에 통합하고, 모바일 portrait·landscape에서는 compact 배치를 사용해 기존 HUD와 겹치지 않도록 했습니다.
- 미니맵은 15Hz로 갱신하며 멀리 날기(DIST) 모드에서는 렌더링하지 않습니다.
- 운영의 3D 코스튬 body-slot 배치와 view-only 종이비행기 선택 화면을 베타에 동기화했습니다.
- 베타 전용 양력 `0.70×`, 항력 `0.45×`, 비행 상한 `420m` cloud band와 loopback-only origin binding을 유지했습니다.
- 변경된 biome helper, map generator, arena minimap의 Cloudflare cache key를 앱 버전 `1.6.1`과 일치시켰습니다.

## 1.5.8 - 2026-08-07

### Changed

- 운영 `1.5.7`의 모바일 멀티터치 조작, 짧은 세로 HUD safe-area 대응, 안티에일리어싱, 구름 depth sorting, thermal/Bloom 안정화 변경을 베타 환경에도 동기화했습니다.
- 베타 전용 양력 `0.70×`, 항력 `0.45×` 조정과 loopback-only origin binding을 유지했습니다.
- 변경된 biome helper와 map generator의 Cloudflare cache key를 앱 버전 `1.5.8`과 일치시켰습니다.

### Fixed

- 비행 상한 `420m`와 겹치는 고층 cloud band를 유지해 고고도 상승 pitch에서 구름이 모두 사라져 보이지 않도록 했습니다.

## 1.5.7 - 2026-08-07

### Fixed

- 짧은 모바일 세로 화면의 leaderboard 높이 계산에 동적 viewport와 하단 safe-area inset을 반영해 노치·홈 인디케이터 영역이 있는 기기에서도 에너지 게이지와 겹치지 않도록 했습니다.
- safe-area가 포함된 HUD 높이 예산을 순수 함수 회귀 테스트로 검증합니다.

## 1.5.6 - 2026-08-07

### Fixed

- 짧은 모바일 세로 화면에서 leaderboard를 가용 높이에 맞춰 축소하거나 숨겨 속도·에너지 게이지와 겹치지 않도록 했습니다.
- 높이 440px 이하의 세로 화면에서는 속도·에너지 게이지를 우측으로 이동해 비행 통계와 겹치지 않도록 했습니다.

## 1.5.5 - 2026-08-07

### Added

- 모바일 비행 중 빈 화면을 드래그해 자유 시야를 회전할 수 있습니다.

### Changed

- 모바일 속도·에너지 게이지를 더 작고 중앙 집중적인 형태로 조정했습니다.
- 모바일 D-pad 터치 영역을 확대하고 DASH/FIRE 버튼을 큰 원형으로 변경했습니다.

## 1.5.4 - 2026-08-07

### Fixed

- 모바일 결과·리스폰 모달이 터치 조작 패드보다 항상 위에 표시되도록 stacking 순서를 고정했습니다.

## 1.5.3 - 2026-08-07

### Added

- 휴대폰과 태블릿의 coarse-pointer 환경에서 피치·롤, 대시, ARENA 다트 발사, 비행 설정을 조작할 수 있는 멀티터치 오버레이 키패드를 추가했습니다.
- 터치와 키보드 입력을 독립적으로 합성하고 pointer 취소·capture 상실·메뉴 전환 시 입력을 안전하게 해제합니다.

### Changed

- 모바일 세로·가로 화면에서 통계, 타이머, 랭킹, 속도·에너지 계기판과 터치 패드가 겹치지 않도록 HUD를 재배치했습니다.

## 1.5.2 - 2026-08-07

### Fixed

- `mediump` fragment precision에서 `1e-8` epsilon이 0으로 underflow될 수 있던 열기류 shader를 `1e-4`로 보강해, 정확히 0인 view vector에서도 `inversesqrt` 결과가 항상 유한하도록 했습니다.

## 1.5.1 - 2026-08-07

### Fixed

- 모든 구름을 하나의 투명 인스턴스 묶음으로 그리던 방식을 구름 덩어리별 정렬 단위로 분리해, 앞 구름 뒤의 구름이 선명하게 덮여 보이던 투명도 순서 문제를 수정했습니다.
- 구름 geometry를 덩어리 간 공유하면서 환경 해제 시 중복 dispose하지 않도록 정리했습니다.

## 1.5.0 - 2026-08-07

### Added

- ESC 그래픽 설정에 런타임 전환 가능한 안티에일리어싱 옵션을 추가했습니다.
- 성능 우선 `FXAA`, 선명도 우선 `SMAA`, 비활성화 모드를 제공하며 선택 상태를 브라우저에 저장합니다.

### Fixed

- 카메라가 열기류 geometry와 겹쳐 view vector 길이가 0이 되어도 Bloom 입력에 `NaN`이 발생하지 않도록 epsilon-guarded 정규화를 적용했습니다.
- FXAA가 해상도 배율과 창 크기 변경 후에도 올바른 물리 픽셀 크기를 사용하도록 uniform을 동기화합니다.
- 안티에일리어싱 모드 변경 시 이전 post-processing pass의 GPU resource를 해제합니다.

## 1.4.1 - 2026-08-07

### Added

- ESC 비행 설정에 마우스 상하 반전 옵션을 추가하고 선택 상태를 브라우저에 저장합니다.

### Fixed

- Bloom 활성화 시 열기류 fragment shader의 `NaN`과 정의되지 않은 역순 `smoothstep`이 주변 픽셀로 확산되어 검은 블록이 깜빡이던 문제를 수정했습니다.
- 열기류의 fractional `pow` 입력과 시선 벡터 내적을 안전 범위로 제한해 GPU·브라우저별 렌더링 차이를 제거했습니다.

## 1.4.0 - 2026-08-07

### Added

- ESC 메뉴의 그래픽 설정 그룹에 CSM, GTAO, Bloom, 안개 품질, 그림자 부드러움 옵션을 추가했습니다.
- Three.js 공식 CSM 및 EffectComposer 기반 GTAO/Bloom 후처리를 런타임 변경·저장할 수 있습니다.
- 기본/대기형/시네마틱 안개와 PCF 선명/PCF 소프트 필터/VSM 그림자를 선택할 수 있습니다.

### Changed

- 기본 품질을 CSM 3단계, 반해상도 GTAO 보통, Bloom 은은함, 대기형 안개, PCF radius 기반 소프트 필터로 구성했습니다.
- 표시된 3km/5km/7.5km 시야 거리와 FogExp2의 실제 1% 투과거리를 맞췄습니다.
- 후처리 ON/OFF 모두 동일한 OutputPass 색상 경로를 사용해 톤 변화를 제거했습니다.
- 대기형 안개가 biome별 안개·하늘 색상과 아레나의 낮은 안개 밀도를 보존하도록 통합했습니다.

### Fixed

- 높은 비행 고도에서 태양이 기체 아래로 내려가 그림자 방향이 뒤집힐 수 있던 문제를 수정했습니다.
- 그림자 모드 변경 시 기존 shadow map과 VSM 보조 render target이 남는 문제를 수정했습니다.
- CSM과 기존 단일 directional shadow가 중복 렌더링되지 않도록 했습니다.
- GTAO에서 투명 상승기류와 하늘 셰이더가 폐색 대상으로 처리되는 문제를 방지했습니다.
- Three.js 0.184에서 폐기된 PCFSoftShadowMap 사용을 홈·접기 renderer에서도 제거했습니다.
- CSM material registry가 biome, launch tower/mascot, costume, dart를 포함한 모든 lit Object3D를 추적하고 teardown 시 완전히 해제하도록 했습니다.
- CSM shader hook을 기존 triplanar `onBeforeCompile`과 합성하고 CSM 재구성 시 원래 hook을 복원하도록 했습니다.
- ESC에서 라운드를 나간 뒤 lobby 입력란으로 keyboard focus가 복원되도록 했습니다.
- QA freeze가 시간·camera·remote interpolation·network 송신을 고정하고 loopback capture API를 노출하지 않도록 했습니다.
