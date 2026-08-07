# Changelog

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
