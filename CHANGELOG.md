# Changelog

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
