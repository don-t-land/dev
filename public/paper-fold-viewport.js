(function exposePaperFoldViewport(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.paperFoldViewport = api;
})(typeof globalThis === 'object' ? globalThis : this, () => {
  'use strict';

  const EPSILON = 1e-8;
  const VIEW = normalize([0.55, -0.65, 0.52]);
  const RIGHT = normalize([0.65, 0.55, 0]);
  const UP = normalize(cross(VIEW, RIGHT));
  const DEFAULT_ORBIT = Object.freeze({
    azimuth: Math.atan2(VIEW[1], VIEW[0]),
    elevation: Math.asin(VIEW[2])
  });
  const DEFAULT_CAMERA = Object.freeze({
    right: Object.freeze(RIGHT),
    up: Object.freeze(UP),
    view: Object.freeze(VIEW),
    scale: 1,
    cx: 0,
    cy: 0
  });

  function dot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }

  function cross(a, b) {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0]
    ];
  }

  function subtract(a, b) {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  }

  function normalize(vector) {
    const length = Math.hypot(...vector);
    return length > EPSILON ? vector.map(value => value / length) : [0, 0, 0];
  }

  function cameraBasisFromOrbit(azimuth, elevation) {
    const safeAzimuth = Number.isFinite(azimuth) ? azimuth : DEFAULT_ORBIT.azimuth;
    const requestedElevation = Number.isFinite(elevation) ? elevation : DEFAULT_ORBIT.elevation;
    const safeElevation = Math.max(0.08, Math.min(1.45, requestedElevation));
    const horizontal = Math.cos(safeElevation);
    const view = normalize([
      horizontal * Math.cos(safeAzimuth),
      horizontal * Math.sin(safeAzimuth),
      Math.sin(safeElevation)
    ]);
    const right = normalize([-Math.sin(safeAzimuth), Math.cos(safeAzimuth), 0]);
    const up = normalize(cross(view, right));
    return {
      right,
      up,
      view,
      azimuth: safeAzimuth,
      elevation: safeElevation
    };
  }

  function cameraValue(camera, key) {
    return camera?.[key] == null ? DEFAULT_CAMERA[key] : camera[key];
  }

  function projectPoint(point, camera = DEFAULT_CAMERA) {
    const right = cameraValue(camera, 'right');
    const up = cameraValue(camera, 'up');
    const view = cameraValue(camera, 'view');
    const scale = Number(cameraValue(camera, 'scale')) || 1;
    const cx = Number(cameraValue(camera, 'cx')) || 0;
    const cy = Number(cameraValue(camera, 'cy')) || 0;
    return {
      point: [cx + dot(point, right) * scale, cy - dot(point, up) * scale],
      depth: dot(point, view)
    };
  }

  function polygonArea(points) {
    let area = 0;
    for (let index = 0; index < points.length; index += 1) {
      const next = (index + 1) % points.length;
      area += points[index][0] * points[next][1] - points[next][0] * points[index][1];
    }
    return area / 2;
  }

  function faceNormal(face) {
    const vertices = face?.vertices3d || [];
    if (vertices.length < 3) return [0, 0, 0];
    for (let index = 1; index < vertices.length - 1; index += 1) {
      const normal = cross(subtract(vertices[index], vertices[0]), subtract(vertices[index + 1], vertices[0]));
      if (Math.hypot(...normal) > EPSILON) return normalize(normal);
    }
    return [0, 0, 0];
  }

  function projectFace(face, camera = DEFAULT_CAMERA) {
    const projected = (face?.vertices3d || []).map(point => projectPoint(point, camera));
    const normal = faceNormal(face);
    const view = cameraValue(camera, 'view');
    return {
      face,
      points: projected.map(value => value.point),
      depths: projected.map(value => value.depth),
      depth: projected.length
        ? projected.reduce((sum, value) => sum + value.depth, 0) / projected.length
        : -Infinity,
      normal,
      facing: dot(normal, view)
    };
  }

  function barycentricCoordinates(point, a, b, c) {
    const denominator = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    if (Math.abs(denominator) <= EPSILON) return null;
    const first = ((b[1] - c[1]) * (point[0] - c[0]) + (c[0] - b[0]) * (point[1] - c[1])) / denominator;
    const second = ((c[1] - a[1]) * (point[0] - c[0]) + (a[0] - c[0]) * (point[1] - c[1])) / denominator;
    return [first, second, 1 - first - second];
  }

  function barycentric(point, a, b, c) {
    const weights = barycentricCoordinates(point, a, b, c);
    if (!weights) return null;
    if (weights.some(weight => weight < -EPSILON)) return null;
    return weights;
  }

  function interpolateTriangle(values, indices, weights) {
    const dimensions = values[indices[0]].length;
    return Array.from({ length: dimensions }, (_, dimension) => (
      values[indices[0]][dimension] * weights[0]
      + values[indices[1]][dimension] * weights[1]
      + values[indices[2]][dimension] * weights[2]
    ));
  }

  function findTriangle(point, polygon) {
    for (let index = 1; index < polygon.length - 1; index += 1) {
      const indices = [0, index, index + 1];
      const weights = barycentric(point, polygon[0], polygon[index], polygon[index + 1]);
      if (weights) return { indices, weights };
    }
    return null;
  }

  function findAffineTriangle(point, polygon) {
    for (let index = 1; index < polygon.length - 1; index += 1) {
      const indices = [0, index, index + 1];
      const weights = barycentricCoordinates(point, polygon[0], polygon[index], polygon[index + 1]);
      if (weights) return { indices, weights };
    }
    return null;
  }

  function pointOnSegment(point, a, b) {
    const crossValue = (point[0] - a[0]) * (b[1] - a[1]) - (point[1] - a[1]) * (b[0] - a[0]);
    if (Math.abs(crossValue) > EPSILON) return false;
    const along = (point[0] - a[0]) * (b[0] - a[0]) + (point[1] - a[1]) * (b[1] - a[1]);
    const lengthSquared = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
    return along >= -EPSILON && along <= lengthSquared + EPSILON;
  }

  function pointInPolygon(point, polygon) {
    if (!Array.isArray(polygon) || polygon.length < 3) return false;
    let inside = false;
    for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
      const a = polygon[previous];
      const b = polygon[index];
      if (pointOnSegment(point, a, b)) return true;
      const intersects = (a[1] > point[1]) !== (b[1] > point[1])
        && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0];
      if (intersects) inside = !inside;
    }
    return inside;
  }

  function materialToScreen(face, materialPoint, camera = DEFAULT_CAMERA) {
    const materials = face?.materialPoly || [];
    const vertices = face?.vertices3d || [];
    if (materials.length !== vertices.length || materials.length < 3) return null;
    const triangle = findTriangle(materialPoint, materials) || findAffineTriangle(materialPoint, materials);
    if (!triangle) return null;
    const point3d = interpolateTriangle(vertices, triangle.indices, triangle.weights);
    return projectPoint(point3d, camera).point;
  }

  function screenToMaterial(face, screenPoint, camera = DEFAULT_CAMERA) {
    const materials = face?.materialPoly || [];
    const projected = projectFace(face, camera);
    if (materials.length !== projected.points.length || materials.length < 3) return null;
    const triangle = findTriangle(screenPoint, projected.points) || findAffineTriangle(screenPoint, projected.points);
    if (!triangle) return null;
    return interpolateTriangle(materials, triangle.indices, triangle.weights);
  }

  function hitOnFace(face, screenPoint, camera) {
    const projected = projectFace(face, camera);
    if (Math.abs(polygonArea(projected.points)) <= EPSILON || !pointInPolygon(screenPoint, projected.points)) return null;
    const triangle = findTriangle(screenPoint, projected.points);
    if (!triangle) return null;
    const material = interpolateTriangle(face.materialPoly, triangle.indices, triangle.weights);
    const depth = triangle.indices.reduce((sum, vertexIndex, weightIndex) => (
      sum + projected.depths[vertexIndex] * triangle.weights[weightIndex]
    ), 0);
    return { face, material, depth, projected, screen: screenPoint.slice() };
  }

  function hitTestFaces(faces, screenPoint, camera = DEFAULT_CAMERA) {
    let winner = null;
    (faces || []).forEach((face, index) => {
      const hit = hitOnFace(face, screenPoint, camera);
      if (!hit) return;
      hit.index = index;
      if (!winner || hit.depth > winner.depth + EPSILON
        || (Math.abs(hit.depth - winner.depth) <= EPSILON && Number(face.layer || 0) > Number(winner.face.layer || 0))
        || (Math.abs(hit.depth - winner.depth) <= EPSILON && Number(face.layer || 0) === Number(winner.face.layer || 0) && index > winner.index)) {
        winner = hit;
      }
    });
    return winner;
  }

  return {
    DEFAULT_CAMERA,
    DEFAULT_ORBIT,
    cameraBasisFromOrbit,
    faceNormal,
    hitTestFaces,
    materialToScreen,
    pointInPolygon,
    polygonArea,
    projectFace,
    projectPoint,
    screenToMaterial
  };
});
