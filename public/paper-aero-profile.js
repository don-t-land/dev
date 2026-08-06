(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PaperAeroProfile = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const EPSILON = 1e-9;

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

  function polygonMetrics3d(vertices) {
    if (!Array.isArray(vertices) || vertices.length < 3
        || !vertices.every(point => Array.isArray(point) && point.length === 3
          && point.every(Number.isFinite))) return null;
    const origin = vertices[0];
    let area = 0;
    let weightedX = 0;
    let weightedY = 0;
    for (let index = 1; index < vertices.length - 1; index += 1) {
      const a = [0, 1, 2].map(axis => vertices[index][axis] - origin[axis]);
      const b = [0, 1, 2].map(axis => vertices[index + 1][axis] - origin[axis]);
      const cross3d = [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0]
      ];
      const triangleArea = Math.hypot(...cross3d) / 2;
      if (triangleArea <= EPSILON) continue;
      const cx = (origin[0] + vertices[index][0] + vertices[index + 1][0]) / 3;
      const cy = (origin[1] + vertices[index][1] + vertices[index + 1][1]) / 3;
      area += triangleArea;
      weightedX += cx * triangleArea;
      weightedY += cy * triangleArea;
    }
    if (area <= EPSILON) return { area: 0, cx: 0, cy: 0 };
    return { area, cx: weightedX / area, cy: weightedY / area };
  }

  function deriveAerodynamicProfile(model) {
    const faces = Array.isArray(model?.faces) ? model.faces : [];
    const points = [];
    let physicalArea = 0;
    let weightedX = 0;
    let weightedY = 0;
    let minLayer = 0;
    let maxLayer = 0;

    faces.forEach(face => {
      const projectedMetrics = polygonMetrics(face?.poly);
      const metrics3d = polygonMetrics3d(face?.vertices3d);
      const metrics = metrics3d || projectedMetrics;
      if (metrics.area <= EPSILON || projectedMetrics.area < 0) return;
      physicalArea += metrics.area;
      weightedX += metrics.cx * metrics.area;
      weightedY += metrics.cy * metrics.area;
      if (Array.isArray(face.poly)) {
        points.push(...face.poly.map(point => [Number(point[0]), Number(point[1])]));
      }
      const layer = Number.isFinite(face.layer) ? face.layer : 0;
      minLayer = Math.min(minLayer, layer);
      maxLayer = Math.max(maxLayer, layer);
    });

    if (physicalArea <= EPSILON || points.length < 3) {
      return {
        physicalArea: 0, planformArea: 0, areaRatio: .02, span: .01, chord: .01,
        aspectRatio: 1, massCenterX: 0, massCenterY: 0, pressureCenterX: 0,
        pressureCenterY: 0, asymmetry: 0, liftScale: .15, dragScale: 2.2,
        stallSpeed: 42, stability: .2, rollBias: 0, pitchBias: 0,
        foldCount: 0, layerCount: 1
      };
    }

    const hull = convexHull(points);
    const planform = polygonMetrics(hull);
    const xs = hull.map(point => point[0]);
    const ys = hull.map(point => point[1]);
    const span = Math.max(EPSILON, Math.max(...xs) - Math.min(...xs));
    const chord = Math.max(EPSILON, Math.max(...ys) - Math.min(...ys));
    const planformArea = Math.max(EPSILON, planform.area);
    const areaRatio = clamp(planformArea / physicalArea, .02, 1);
    const aspectRatio = clamp(span * span / planformArea, .15, 12);
    const massCenterX = weightedX / physicalArea;
    const massCenterY = weightedY / physicalArea;
    const pressureCenterX = planform.cx;
    const pressureCenterY = planform.cy;
    const normalizedX = (massCenterX - pressureCenterX) / Math.max(span / 2, EPSILON);
    const normalizedY = (massCenterY - pressureCenterY) / Math.max(chord / 2, EPSILON);
    const asymmetry = clamp(Math.abs(normalizedX), 0, 1);
    const foldCount = Array.isArray(model?.commands)
      ? model.commands.filter(command => command?.type === 'fold' || command?.type == null).length
      : 0;
    const layerCount = Math.max(1, Math.round(maxLayer - minLayer + 1));

    const liftScale = clamp(areaRatio * Math.sqrt(aspectRatio) * (1 - .28 * asymmetry), .15, 1.8);
    const dragScale = clamp(
      .4 + .65 * areaRatio + .12 / aspectRatio + .035 * foldCount + .28 * asymmetry,
      .25,
      2.2
    );
    const stallSpeed = clamp(12 / Math.sqrt(Math.max(.08, liftScale)), 8, 42);
    const stability = clamp(1.12 - .8 * asymmetry - .45 * Math.abs(normalizedY), .2, 1.25);
    const rollBias = clamp(normalizedX * .8, -.65, .65);
    const pitchBias = clamp(normalizedY * .65, -.55, .55);

    return {
      physicalArea: round(physicalArea),
      planformArea: round(planformArea),
      areaRatio: round(areaRatio),
      span: round(span),
      chord: round(chord),
      aspectRatio: round(aspectRatio),
      massCenterX: round(massCenterX),
      massCenterY: round(massCenterY),
      pressureCenterX: round(pressureCenterX),
      pressureCenterY: round(pressureCenterY),
      asymmetry: round(asymmetry),
      liftScale: round(liftScale),
      dragScale: round(dragScale),
      stallSpeed: round(stallSpeed),
      stability: round(stability),
      rollBias: round(rollBias),
      pitchBias: round(pitchBias),
      foldCount,
      layerCount
    };
  }

  return { convexHull, polygonMetrics, polygonMetrics3d, deriveAerodynamicProfile };
}));
