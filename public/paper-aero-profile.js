(function (root, factory) {
  const paperFoldModel = (typeof module === 'object' && module.exports)
    ? require('./paper-fold-model.js')
    : root.paperFoldModel;
  const api = factory(paperFoldModel);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PaperAeroProfile = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (paperFoldModel) {
  'use strict';

  const EPSILON = 1e-9;

  // Fold'N Fly의 공식 거리/체공 측정 순서를 같은 게임 투척 조건에서도
  // 재현하기 위한 프리셋 보정값. 정확히 같은 커맨드 키에만 적용되므로
  // 사용자가 직접 조정한 기체는 아래 보정 없이 기하에서 공력을 계산한다.
  const PRESET_FLIGHT_TUNING = Object.freeze({
    // 기준형: 모든 능력치의 중간점. 이후 프리셋은 이 envelope와 비교해 역할을 갖는다.
    dart: Object.freeze({
      liftScale: .9, dragScale: 1, stallSpeed: 13, pitchBias: .025,
      maxSpeed: 58, maxPitchDown: .9, maxPitchUp: .7, maxRoll: .85,
      pitchRateScale: 1, rollRateScale: 1
    }),
    // 저속 고기동형: 속도는 낮지만 가장 큰 자세 범위와 가장 빠른 선회 반응.
    stable: Object.freeze({
      liftScale: 1.15, dragScale: 1.7, stallSpeed: 9.5, pitchBias: .02,
      maxSpeed: 45, maxPitchDown: 1.08, maxPitchUp: .88, maxRoll: 1.18,
      pitchRateScale: 1.28, rollRateScale: 1.42
    }),
    // 저속 활공형: 실속에는 가장 강하지만 자세 범위와 선회 반응은 가장 낮다.
    stealth: Object.freeze({
      liftScale: 1.3, dragScale: 2.2, stallSpeed: 8.5, pitchBias: .035,
      maxSpeed: 42, maxPitchDown: .72, maxPitchUp: .5, maxRoll: .62,
      pitchRateScale: .72, rollRateScale: .68
    }),
    // 고속형: 최고속도는 가장 높고 선회 반응은 기준형보다 한 단계만 높다.
    jet: Object.freeze({
      liftScale: .8, dragScale: .72, stallSpeed: 14.5, pitchBias: .04,
      maxSpeed: 72, maxPitchDown: 1.02, maxPitchUp: .8, maxRoll: .98,
      pitchRateScale: 1.12, rollRateScale: 1.18
    })
  });
  let presetTuningByCommandKey = null;

  function presetFlightTuning(model) {
    if (!paperFoldModel?.serializeFoldCommands || !paperFoldModel?.getPresetCommands) return null;
    if (!presetTuningByCommandKey) {
      presetTuningByCommandKey = new Map(Object.entries(PRESET_FLIGHT_TUNING).map(([name, tuning]) => [
        JSON.stringify(paperFoldModel.getPresetCommands(name)), tuning
      ]));
    }
    return presetTuningByCommandKey.get(paperFoldModel.serializeFoldCommands(model)) || null;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function round(value) {
    return Math.round(value * 1e6) / 1e6;
  }

  function cross(origin, a, b) {
    return (a[0] - origin[0]) * (b[1] - origin[1]) -
      (a[1] - origin[1]) * (b[0] - origin[0]);
  }

  function convexHull(points) {
    const unique = [...new Map(points
      .filter(point => Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]))
      .map(point => [`${round(point[0])}:${round(point[1])}`, [Number(point[0]), Number(point[1])]])).values()]
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (unique.length <= 2) return unique;

    const lower = [];
    for (const point of unique) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= EPSILON) lower.pop();
      lower.push(point);
    }
    const upper = [];
    for (let index = unique.length - 1; index >= 0; index -= 1) {
      const point = unique[index];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= EPSILON) upper.pop();
      upper.push(point);
    }
    lower.pop();
    upper.pop();
    return lower.concat(upper);
  }

  function polygonMetrics(poly) {
    if (!Array.isArray(poly) || poly.length < 3) return { area: 0, cx: 0, cy: 0 };
    let twiceArea = 0;
    let cx = 0;
    let cy = 0;
    for (let index = 0; index < poly.length; index += 1) {
      const current = poly[index];
      const next = poly[(index + 1) % poly.length];
      const term = current[0] * next[1] - next[0] * current[1];
      twiceArea += term;
      cx += (current[0] + next[0]) * term;
      cy += (current[1] + next[1]) * term;
    }
    if (Math.abs(twiceArea) <= EPSILON) return { area: 0, cx: 0, cy: 0 };
    return {
      area: Math.abs(twiceArea) / 2,
      cx: cx / (3 * twiceArea),
      cy: cy / (3 * twiceArea)
    };
  }

  // 좌우 절반의 (부호 있는 y 상승 / |x| 거리) 평균을 낸 뒤 두 절반을 평균한다.
  // 양수면 양쪽 날개가 중심에서 멀어질수록 위로 들리는 상반각(dihedral),
  // 음수면 처지는 하반각(anhedral).
  function dihedralFactor(vertices3) {
    let leftSum = 0;
    let leftCount = 0;
    let rightSum = 0;
    let rightCount = 0;
    vertices3.forEach(vertex => {
      const x = vertex[0];
      const y = vertex[1];
      if (Math.abs(x) <= EPSILON) return;
      const ratio = y / Math.abs(x);
      if (x < 0) {
        leftSum += ratio;
        leftCount += 1;
      } else {
        rightSum += ratio;
        rightCount += 1;
      }
    });
    const leftAvg = leftCount > 0 ? leftSum / leftCount : 0;
    const rightAvg = rightCount > 0 ? rightSum / rightCount : 0;
    if (leftCount === 0 && rightCount === 0) return 0;
    if (leftCount === 0) return clamp(rightAvg, -1, 1);
    if (rightCount === 0) return clamp(leftAvg, -1, 1);
    return clamp((leftAvg + rightAvg) / 2, -1, 1);
  }

  function deriveAerodynamicProfile(model) {
    const geometry = paperFoldModel.computeFoldedGeometry(model);
    const faces = Array.isArray(geometry?.faces) ? geometry.faces : [];
    const points = [];
    const vertices3All = [];
    let physicalArea = 0;
    let weightedX = 0;
    let weightedZ = 0;
    let maxFoldDepth = 0;

    faces.forEach(face => {
      const metrics = polygonMetrics(face?.materialPoly);
      if (metrics.area <= EPSILON) return;
      physicalArea += metrics.area;
      const vertices3 = Array.isArray(face.vertices3) ? face.vertices3 : [];
      const xyz = vertices3.map(point => [Number(point[0]), Number(point[1]), Number(point[2])]);
      const centroidX = xyz.reduce((sum, point) => sum + point[0], 0) / Math.max(1, xyz.length);
      const centroidZ = xyz.reduce((sum, point) => sum + point[2], 0) / Math.max(1, xyz.length);
      weightedX += centroidX * metrics.area;
      weightedZ += centroidZ * metrics.area;
      points.push(...xyz.map(point => [point[0], point[2]]));
      vertices3All.push(...xyz);
      const depth = Number.isFinite(face.foldDepth) ? face.foldDepth : 0;
      maxFoldDepth = Math.max(maxFoldDepth, depth);
    });

    if (physicalArea <= EPSILON || points.length < 3) {
      return {
        physicalArea: 0, planformArea: 0, areaRatio: .02, span: .01, chord: .01,
        aspectRatio: 1, massCenterX: 0, massCenterY: 0, pressureCenterX: 0,
        pressureCenterY: 0, asymmetry: 0, liftScale: .15, dragScale: 2.2,
        stallSpeed: 42, stability: .2, rollBias: 0, pitchBias: 0,
        maxSpeed: 38, maxPitchDown: .65, maxPitchUp: .45, maxRoll: .55,
        pitchRateScale: .7, rollRateScale: .65,
        dihedral: 0, foldCount: 0, layerCount: 1
      };
    }

    const hull = convexHull(points);
    const planform = polygonMetrics(hull);
    const xs = hull.map(point => point[0]);
    const zs = hull.map(point => point[1]);
    const span = Math.max(EPSILON, Math.max(...xs) - Math.min(...xs));
    const chord = Math.max(EPSILON, Math.max(...zs) - Math.min(...zs));
    const planformArea = Math.max(EPSILON, planform.area);
    const areaRatio = clamp(planformArea / physicalArea, .02, 1);
    const aspectRatio = clamp(span * span / planformArea, .15, 12);
    const massCenterX = weightedX / physicalArea;
    const massCenterZ = weightedZ / physicalArea;
    const pressureCenterX = planform.cx;
    const pressureCenterZ = planform.cy;
    const normalizedX = (massCenterX - pressureCenterX) / Math.max(span / 2, EPSILON);
    // 기수 방향은 -z이므로, z 편차를 뒤집어 기존 "기수 쪽 +y" 부호 규약을 유지한다.
    const normalizedZ = -(massCenterZ - pressureCenterZ) / Math.max(chord / 2, EPSILON);
    const asymmetry = clamp(Math.abs(normalizedX), 0, 1);
    const foldCount = Array.isArray(model?.commands) ? model.commands.length : 0;
    const layerCount = Math.max(1, Math.round(maxFoldDepth) + 1);
    const dihedral = dihedralFactor(vertices3All);

    const liftScale = clamp(areaRatio * Math.sqrt(aspectRatio) * (1 - .28 * asymmetry), .15, 1.8);
    const dragScale = clamp(
      .4 + .65 * areaRatio + .12 / aspectRatio + .035 * foldCount + .28 * asymmetry,
      .25,
      2.2
    );
    const stallSpeed = clamp(12 / Math.sqrt(Math.max(.08, liftScale)), 8, 42);
    const stability = clamp(
      1.12 - .8 * asymmetry - .45 * Math.abs(normalizedZ) + .35 * dihedral,
      .2,
      1.4
    );
    const rollBias = clamp(normalizedX * .8, -.65, .65);
    const pitchBias = clamp(normalizedZ * .65, -.55, .55);
    const maneuverability = clamp(1.08 - stability * .28 + aspectRatio * .08, .65, 1.25);
    const maxSpeed = clamp(62 - dragScale * 9 + aspectRatio * 2, 38, 68);
    const maxPitchDown = clamp(.72 + maneuverability * .18, .62, 1.05);
    const maxPitchUp = clamp(.48 + maneuverability * .16, .42, .82);
    const maxRoll = clamp(.58 + maneuverability * .3, .52, 1.05);
    const pitchRateScale = clamp(maneuverability, .65, 1.25);
    const rollRateScale = clamp(maneuverability * 1.04, .65, 1.3);
    const tuning = presetFlightTuning(model);

    return {
      physicalArea: round(physicalArea),
      planformArea: round(planformArea),
      areaRatio: round(areaRatio),
      span: round(span),
      chord: round(chord),
      aspectRatio: round(aspectRatio),
      massCenterX: round(massCenterX),
      massCenterY: round(massCenterZ),
      pressureCenterX: round(pressureCenterX),
      pressureCenterY: round(pressureCenterZ),
      asymmetry: round(asymmetry),
      liftScale: round(tuning?.liftScale ?? liftScale),
      dragScale: round(tuning?.dragScale ?? dragScale),
      stallSpeed: round(tuning?.stallSpeed ?? stallSpeed),
      stability: round(stability),
      rollBias: round(rollBias),
      pitchBias: round(tuning?.pitchBias ?? pitchBias),
      maxSpeed: round(tuning?.maxSpeed ?? maxSpeed),
      maxPitchDown: round(tuning?.maxPitchDown ?? maxPitchDown),
      maxPitchUp: round(tuning?.maxPitchUp ?? maxPitchUp),
      maxRoll: round(tuning?.maxRoll ?? maxRoll),
      pitchRateScale: round(tuning?.pitchRateScale ?? pitchRateScale),
      rollRateScale: round(tuning?.rollRateScale ?? rollRateScale),
      dihedral: round(dihedral),
      foldCount,
      layerCount
    };
  }

  return { convexHull, polygonMetrics, deriveAerodynamicProfile };
}));
