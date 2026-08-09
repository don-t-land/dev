'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  createPresetModel,
  getPresetCommands,
  getPresetVisual,
  presetNames,
  PRESET_INFO,
  undoFold,
  serializeFoldCommands,
  computeFoldedGeometry
} = require('../public/paper-fold-model.js');
const { deriveAerodynamicProfile } = require('../public/paper-aero-profile.js');

const ALL_PRESETS = ['dart', 'stable', 'stealth', 'jet'];
const REFERENCE_FIXTURES = Object.freeze({
  dart: { label: 'Basic Dart', url: 'https://www.foldnfly.com/1d.html', folds: 5, distanceM: 12.5, timeAloftS: 1.4, lengthCm: 29.5, wingspanCm: 11.1, wingChordCm: 15.2, wingAreaCm2: 168.5 },
  stable: { label: 'The Stable', url: 'https://www.foldnfly.com/2d.html', folds: 7, distanceM: 5.5, timeAloftS: 2.5, lengthCm: 17, wingspanCm: 12.5, wingChordCm: 10.3, wingAreaCm2: 129.2 },
  stealth: { label: 'Stealth Glider', url: 'https://www.foldnfly.com/43.html', folds: 10, distanceM: 11.5, timeAloftS: 4.7, lengthCm: 14.1, wingspanCm: 16.4, wingChordCm: 12.6, wingAreaCm2: 206.8 },
  jet: { label: 'Jet Fighter', url: 'https://www.foldnfly.com/24d.html', folds: 9, distanceM: 6.4, timeAloftS: 2, lengthCm: 19.1, wingspanCm: 16, wingChordCm: 11.2, wingAreaCm2: 179.1 }
});

test('프리셋은 Fold N Fly 공식 측정값과 출처를 그대로 보존한다', () => {
  assert.deepStrictEqual(presetNames, ALL_PRESETS);
  assert.deepStrictEqual(Object.keys(PRESET_INFO), ALL_PRESETS);
  assert.ok(Object.isFrozen(PRESET_INFO));
  ALL_PRESETS.forEach(name => {
    const expected = REFERENCE_FIXTURES[name];
    const info = PRESET_INFO[name];
    assert.ok(Object.isFrozen(info));
    assert.ok(Object.isFrozen(info.reference));
    assert.strictEqual(info.label, expected.label);
    assert.deepStrictEqual(info.reference, {
      sourceUrl: expected.url,
      folds: expected.folds,
      distanceM: expected.distanceM,
      timeAloftS: expected.timeAloftS,
      lengthCm: expected.lengthCm,
      wingspanCm: expected.wingspanCm,
      wingChordCm: expected.wingChordCm,
      wingAreaCm2: expected.wingAreaCm2
    });
  });
});

test('프리셋 선택 화면은 각 기체의 메인 특장점을 명확히 표시한다', () => {
  assert.deepStrictEqual(Object.fromEntries(ALL_PRESETS.map(name => [name, {
    role: PRESET_INFO[name].role,
    tagline: PRESET_INFO[name].tagline
  }])), {
    dart: { role: '밸런스', tagline: '균형 잡힌 비행 성능 · 밸런스' },
    stable: { role: '기동성', tagline: '가장 빠른 피치와 롤 반응 · 기동성' },
    stealth: { role: '저속 안정성', tagline: '낮은 실속 속도와 안정적인 활공 · 저속 안정성' },
    jet: { role: '최대속도', tagline: '가장 높은 최고속도 · 최대속도' }
  });
});

for (const name of ALL_PRESETS) {
  test(`${name} 프리셋은 서버에서 재생 가능한 대칭 모델이다`, () => {
    const commands = getPresetCommands(name);
    const model = createPresetModel(name);
    assert.ok(model, 'preset replay must succeed');
    assert.ok(commands.length >= 2 && commands.length <= 10);
    assert.strictEqual(model.commands.length, commands.length);
    assert.ok(serializeFoldCommands(model).length <= 4096);

    const mirrored = command => ({
      start: [-command.end[0], command.end[1]],
      end: [-command.start[0], command.start[1]],
      angle: command.angle
    });
    commands.forEach(command => {
      const twin = mirrored(command);
      assert.ok(commands.some(other =>
        Math.abs(other.start[0] - twin.start[0]) < 1e-9 &&
        Math.abs(other.start[1] - twin.start[1]) < 1e-9 &&
        Math.abs(other.end[0] - twin.end[0]) < 1e-9 &&
        Math.abs(other.end[1] - twin.end[1]) < 1e-9 &&
        Math.abs(other.angle - twin.angle) < 1e-9
      ), `mirror of ${JSON.stringify(command)} missing`);
    });
  });

  test(`${name} 완성 형상은 좌우 대칭이고 유효한 공력 프로필을 만든다`, () => {
    const model = createPresetModel(name);
    const geometry = computeFoldedGeometry(model);
    const vertices = geometry.faces.flatMap(face => face.vertices3);
    vertices.forEach(vertex => {
      assert.ok(vertices.some(other =>
        Math.abs(other[0] + vertex[0]) < 1e-9 &&
        Math.abs(other[1] - vertex[1]) < 1e-9 &&
        Math.abs(other[2] - vertex[2]) < 1e-9
      ), `mirror of ${JSON.stringify(vertex)} missing`);
    });
    assert.ok(geometry.minY >= -1e-9, `minY ${geometry.minY}`);
    const profile = deriveAerodynamicProfile(model);
    assert.ok(Math.abs(profile.rollBias) <= .01, `rollBias ${profile.rollBias}`);
    assert.ok(profile.liftScale >= .5, `liftScale ${profile.liftScale}`);
    assert.ok(profile.dragScale >= .25 && profile.dragScale <= 2.2, `dragScale ${profile.dragScale}`);
  });

  test(`${name} 프리셋은 모든 저작 힌지를 한 단계씩 되돌릴 수 있다`, () => {
    let model = createPresetModel(name);
    const count = model.commands.length;
    for (let remaining = count; remaining > 0; remaining -= 1) {
      assert.strictEqual(model.commands.length, remaining);
      model = undoFold(model);
    }
    assert.strictEqual(model.commands.length, 0);
    assert.strictEqual(model.faces.length, 1);
  });
}

test('Basic Dart는 최초 소스 기본 메시의 실루엣 비율을 재현한다', () => {
  // 최초 커밋 bdd6135의 N/L/R/B 메시: chord 2.77, span 2.4.
  const legacyChordToSpan = 2.77 / 2.4;
  const profile = deriveAerodynamicProfile(createPresetModel('dart'));
  const authoredChordToSpan = profile.chord / profile.span;
  assert.ok(Math.abs(authoredChordToSpan - legacyChordToSpan) / legacyChordToSpan < .05,
    `authored ${authoredChordToSpan}, legacy ${legacyChordToSpan}`);
  assert.ok(profile.dihedral > .1, `dihedral ${profile.dihedral}`);
  assert.deepStrictEqual(getPresetVisual('dart'), {
    vertices: [[0, 0, -1.85], [-1.2, .16, .92], [0, 0, .8], [1.2, .16, .92], [0, -.42, .86]],
    faces: [[0, 1, 2], [0, 2, 3], [0, 4, 2]]
  });
});

test('beta 공력 기준 궤적은 고속과 저실속 프리셋 역할을 재현한다', async () => {
  const { createPaperFlightPhysics, makeColliderVertices } = await import('../public/flight-physics-rapier.mjs');
  const outcomes = {};
  for (const name of ALL_PRESETS) {
    const model = createPresetModel(name);
    const physics = await createPaperFlightPhysics();
    physics.configure(deriveAerodynamicProfile(model), makeColliderVertices(model));
    physics.reset({
      position: { x: 0, y: 30, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      velocity: { x: 0, y: 2, z: -22 }
    });
    let state;
    let time = 0;
    for (; time < 20; time += 1 / 60) {
      state = physics.advance(1 / 60, { pitch: 0, roll: 0, thermalLift: 0 });
      if (state.position.y <= 1) break;
    }
    outcomes[name] = { distance: -state.position.z, time };
    physics.free();
  }

  assert.ok(outcomes.jet.distance > outcomes.dart.distance);
  assert.ok(outcomes.stealth.time > outcomes.stable.time);
  assert.ok(outcomes.stable.time > outcomes.dart.time);
  assert.ok(outcomes.stable.time > outcomes.jet.time);
});

test('프리셋은 역할별 최대속도·자세 제한·조종률 envelope를 제공한다', () => {
  const profiles = Object.fromEntries(ALL_PRESETS.map(name => [
    name, deriveAerodynamicProfile(createPresetModel(name))
  ]));

  assert.deepStrictEqual(Object.fromEntries(ALL_PRESETS.map(name => [name, {
    liftScale: profiles[name].liftScale,
    dragScale: profiles[name].dragScale,
    stallSpeed: profiles[name].stallSpeed,
    maxSpeed: profiles[name].maxSpeed,
    maxPitchDown: profiles[name].maxPitchDown,
    maxPitchUp: profiles[name].maxPitchUp,
    maxRoll: profiles[name].maxRoll,
    pitchRateScale: profiles[name].pitchRateScale,
    rollRateScale: profiles[name].rollRateScale
  }])), {
    dart: {
      liftScale: .9, dragScale: 1, stallSpeed: 13, maxSpeed: 58,
      maxPitchDown: .9, maxPitchUp: .7, maxRoll: .85,
      pitchRateScale: 1, rollRateScale: 1
    },
    stable: {
      liftScale: 1.15, dragScale: 1.7, stallSpeed: 9.5, maxSpeed: 45,
      maxPitchDown: 1.08, maxPitchUp: .88, maxRoll: 1.18,
      pitchRateScale: 1.5, rollRateScale: 1.65
    },
    stealth: {
      liftScale: 1.3, dragScale: 2.2, stallSpeed: 8.5, maxSpeed: 42,
      maxPitchDown: .72, maxPitchUp: .5, maxRoll: .62,
      pitchRateScale: .72, rollRateScale: .68
    },
    jet: {
      liftScale: .8, dragScale: .72, stallSpeed: 14.5, maxSpeed: 72,
      maxPitchDown: 1.02, maxPitchUp: .8, maxRoll: .98,
      pitchRateScale: 1.12, rollRateScale: 1.18
    }
  });

  assert.ok(profiles.jet.maxSpeed > profiles.dart.maxSpeed);
  assert.ok(profiles.dart.maxSpeed > profiles.stable.maxSpeed);
  assert.ok(profiles.stable.maxSpeed > profiles.stealth.maxSpeed);
  assert.ok(profiles.stable.maxRoll > profiles.jet.maxRoll);
  assert.ok(profiles.jet.maxRoll > profiles.dart.maxRoll);
  assert.ok(profiles.dart.maxRoll > profiles.stealth.maxRoll);
  assert.ok(profiles.stable.rollRateScale > profiles.jet.rollRateScale);
  assert.ok(profiles.jet.rollRateScale > profiles.dart.rollRateScale);
  assert.ok(profiles.dart.rollRateScale > profiles.stealth.rollRateScale);
  assert.ok(profiles.stealth.stallSpeed < profiles.stable.stallSpeed);
  assert.ok(profiles.stable.stallSpeed < profiles.dart.stallSpeed);
  assert.ok(profiles.dart.stallSpeed < profiles.jet.stallSpeed);
});

test('공식 공력 보정은 프리셋 원본에만 적용되고 직접 조정하면 해제된다', () => {
  const preset = createPresetModel('dart');
  const tuned = deriveAerodynamicProfile(preset);
  assert.deepStrictEqual({
    liftScale: tuned.liftScale,
    dragScale: tuned.dragScale,
    stallSpeed: tuned.stallSpeed,
    pitchBias: tuned.pitchBias
  }, { liftScale: .9, dragScale: 1, stallSpeed: 13, pitchBias: .025 });

  const adjusted = require('../public/paper-fold-model.js').setFoldAngle(preset, 3, 2.9);
  const custom = deriveAerodynamicProfile(adjusted);
  assert.notStrictEqual(custom.liftScale, tuned.liftScale);
  assert.notStrictEqual(custom.dragScale, tuned.dragScale);
});

test('getPresetCommands는 방어적 복사본을 주고 없는 이름은 거부한다', () => {
  const first = getPresetCommands('dart');
  first[0].start[0] = 99;
  first[0].angle = 99;
  const second = getPresetCommands('dart');
  assert.strictEqual(second[0].start[0], 0);
  assert.strictEqual(second[0].angle, Math.PI);
  assert.strictEqual(createPresetModel('nope'), null);
  assert.strictEqual(getPresetCommands('nope'), null);
  assert.strictEqual(getPresetVisual('nope'), null);
});

test('완성 메시들은 유효하고 각 프리셋의 공식 실루엣 비율을 구분한다', () => {
  const ratios = {};
  ALL_PRESETS.forEach(name => {
    const visual = getPresetVisual(name);
    const xs = visual.vertices.map(vertex => vertex[0]);
    const zs = visual.vertices.map(vertex => vertex[2]);
    visual.faces.flat().forEach(index => {
      assert.ok(Number.isInteger(index) && index >= 0 && index < visual.vertices.length);
    });
    ratios[name] = (Math.max(...zs) - Math.min(...zs)) / (Math.max(...xs) - Math.min(...xs));
  });

  assert.ok(ratios.dart > ratios.jet, `dart ${ratios.dart}, jet ${ratios.jet}`);
  assert.ok(ratios.jet > ratios.stable, `jet ${ratios.jet}, stable ${ratios.stable}`);
  assert.ok(ratios.stable > ratios.stealth, `stable ${ratios.stable}, stealth ${ratios.stealth}`);

  const first = getPresetVisual('jet');
  first.vertices[0][0] = 99;
  first.faces[0][0] = 99;
  assert.strictEqual(getPresetVisual('jet').vertices[0][0], 0);
  assert.strictEqual(getPresetVisual('jet').faces[0][0], 0);
});
