(function exposePaperFoldModel(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.paperFoldModel = api;
})(typeof globalThis === 'object' ? globalThis : this, () => {
  'use strict';

  const EPSILON = 1e-9;
  const HINGE_EPSILON = 1e-7;
  const MIN_DRAG = 0.05;
  const MIN_ANGLE = 0.05;
  const MAX_ANGLE = Math.PI;
  const MIN_POLYGON_AREA = 1e-6;
  const MAX_FOLDS = 10;
  const MAX_FACES = 64;
  // 규약: 접는선 진행방향의 왼쪽 영역이 angle > 0 에서 +y(위)로 들린다.
  // d3 축(전개도 방향을 (x,0,-y)로 올린 것)에 대한 오른손 법칙이 그 규약과 일치한다.
  const ANGLE_SIGN = 1;

  function clonePoint(point) {
    return [point[0], point[1]];
  }

  function cloneFace(face) {
    return {
      poly: face.poly.map(clonePoint),
      folds: face.folds.slice()
    };
  }

  function cloneFold(fold) {
    return {
      A: clonePoint(fold.A),
      d: clonePoint(fold.d),
      angle: fold.angle,
      parents: fold.parents.slice()
    };
  }

  function cloneCommand(command) {
    return {
      start: clonePoint(command.start),
      end: clonePoint(command.end),
      angle: command.angle
    };
  }

  function cloneSnapshot(snapshot) {
    return {
      faces: snapshot.faces.map(cloneFace),
      folds: snapshot.folds.map(cloneFold),
      commands: snapshot.commands.map(cloneCommand)
    };
  }

  function createPaperModel() {
    return {
      faces: [{
        // 전개도(material) 좌표 — 접기는 이 좌표를 절대 변형하지 않으며,
        // 면들은 원판 [-1,1]² 시트를 항상 그대로 분할한다.
        poly: [[-1, -1], [1, -1], [1, 1], [-1, 1]],
        folds: []
      }],
      folds: [],
      history: [],
      commands: []
    };
  }

  function isPoint(point) {
    return Array.isArray(point)
      && point.length >= 2
      && Number.isFinite(point[0])
      && Number.isFinite(point[1]);
  }

  function isValidAngle(angle) {
    return Number.isFinite(angle)
      && Math.abs(angle) >= MIN_ANGLE
      && Math.abs(angle) <= MAX_ANGLE;
  }

  function isUsableModel(model) {
    return Boolean(model)
      && Array.isArray(model.faces)
      && model.faces.length > 0
      && model.faces.length <= MAX_FACES
      && Array.isArray(model.folds)
      && Array.isArray(model.history)
      && Array.isArray(model.commands)
      && model.faces.every(face => face
        && Array.isArray(face.poly)
        && face.poly.length >= 3
        && face.poly.every(isPoint)
        && Array.isArray(face.folds));
  }

  function signedArea(poly) {
    let twiceArea = 0;
    for (let i = 0; i < poly.length; i += 1) {
      const next = (i + 1) % poly.length;
      twiceArea += poly[i][0] * poly[next][1] - poly[next][0] * poly[i][1];
    }
    return twiceArea / 2;
  }

  function pointsEqual(left, right) {
    return Math.abs(left[0] - right[0]) <= EPSILON
      && Math.abs(left[1] - right[1]) <= EPSILON;
  }

  function cleanPolygon(poly) {
    const clean = [];
    poly.forEach(point => {
      if (!clean.length || !pointsEqual(clean[clean.length - 1], point)) {
        clean.push(clonePoint(point));
      }
    });
    if (clean.length > 1 && pointsEqual(clean[0], clean[clean.length - 1])) clean.pop();
    return clean;
  }

  // The positive half-plane is the left side of the directed crease — the part that folds.
  function splitPolygon(poly, creasePoint, normal) {
    const distances = poly.map(point => (point[0] - creasePoint[0]) * normal[0]
      + (point[1] - creasePoint[1]) * normal[1]);
    const positive = [];
    const negative = [];
    let hasPositive = false;
    let hasNegative = false;

    for (let i = 0; i < poly.length; i += 1) {
      const next = (i + 1) % poly.length;
      const distance = distances[i];
      const nextDistance = distances[next];
      if (distance > EPSILON) hasPositive = true;
      if (distance < -EPSILON) hasNegative = true;
      if (distance >= -EPSILON) positive.push(poly[i]);
      if (distance <= EPSILON) negative.push(poly[i]);

      if ((distance > EPSILON && nextDistance < -EPSILON)
          || (distance < -EPSILON && nextDistance > EPSILON)) {
        const ratio = distance / (distance - nextDistance);
        const intersection = [
          poly[i][0] + ratio * (poly[next][0] - poly[i][0]),
          poly[i][1] + ratio * (poly[next][1] - poly[i][1])
        ];
        positive.push(intersection);
        negative.push(intersection);
      }
    }

    return {
      moved: hasPositive ? cleanPolygon(positive) : null,
      stationary: hasNegative ? cleanPolygon(negative) : null
    };
  }

  function isLargeEnough(poly) {
    return poly && poly.length >= 3 && Math.abs(signedArea(poly)) > MIN_POLYGON_AREA;
  }

  // Faces stay convex forever (they are line-splits of a convex sheet),
  // so a boundary-inclusive same-side test is exact.
  function pointInPolygon(point, poly) {
    const orientation = signedArea(poly) >= 0 ? 1 : -1;
    for (let i = 0; i < poly.length; i += 1) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const cross = (b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0]);
      if (cross * orientation < -EPSILON) return false;
    }
    return true;
  }

  function foldsKey(folds) {
    return folds.slice().sort((left, right) => left - right).join(',');
  }

  function lineSide(point, origin, normal) {
    return (point[0] - origin[0]) * normal[0] + (point[1] - origin[1]) * normal[1];
  }

  // Signed offset of a point from the infinite line through `A` along unit `d`.
  function lineOffset(point, A, d) {
    return (point[0] - A[0]) * -d[1] + (point[1] - A[1]) * d[0];
  }

  // Edges of `poly` that lie on fold `fold`'s crease line — the hinge along
  // which the piece that carries that fold is attached.
  function edgesOnFoldLine(poly, fold) {
    const edges = [];
    for (let i = 0; i < poly.length; i += 1) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      if (Math.abs(lineOffset(a, fold.A, fold.d)) <= HINGE_EPSILON
          && Math.abs(lineOffset(b, fold.A, fold.d)) <= HINGE_EPSILON) {
        edges.push([a, b]);
      }
    }
    return edges;
  }

  function creaseCrossesEdges(edges, creasePoint, normal) {
    return edges.some(([a, b]) => {
      const sideA = lineSide(a, creasePoint, normal);
      const sideB = lineSide(b, creasePoint, normal);
      return (sideA > EPSILON && sideB < -EPSILON)
        || (sideA < -EPSILON && sideB > EPSILON);
    });
  }

  /**
   * A new crease may not cut through a hinge that already carries paper:
   * neither a hinge of a flap folded off this component (child) nor the hinge
   * this component itself hangs from (parent). Crossing either would tear.
   */
  function creaseTearsHinge(model, componentFolds, componentFaces, creasePoint, normal) {
    const componentSet = new Set(componentFolds);

    // Child hinges: faces whose folds are exactly componentFolds plus one.
    for (const face of model.faces) {
      if (face.folds.length !== componentFolds.length + 1) continue;
      if (!componentFolds.every(index => face.folds.includes(index))) continue;
      const extra = face.folds.find(index => !componentSet.has(index));
      const fold = model.folds[extra];
      if (!fold) continue;
      if (creaseCrossesEdges(edgesOnFoldLine(face.poly, fold), creasePoint, normal)) return true;
    }

    // Parent hinges: this component hangs from fold j onto faces whose folds
    // are exactly componentFolds minus j; the hinge edges sit on our own faces.
    for (const hingeIndex of componentFolds) {
      const parentKey = foldsKey(componentFolds.filter(index => index !== hingeIndex));
      if (!model.faces.some(face => foldsKey(face.folds) === parentKey)) continue;
      const fold = model.folds[hingeIndex];
      if (!fold) continue;
      for (const face of componentFaces) {
        if (creaseCrossesEdges(edgesOnFoldLine(face.poly, fold), creasePoint, normal)) return true;
      }
    }

    return false;
  }

  /**
   * Return a newly folded model. A rejected command returns the original model,
   * which lets callers use `model = applyFold(model, ...)` without a side channel.
   * The fold splits only the rigid component under the crease midpoint; material
   * (unfolded-sheet) coordinates are never altered — 3D placement is derived
   * later by computeFoldedGeometry.
   */
  function applyFold(model, start, end, angle) {
    if (!isUsableModel(model)
        || !isPoint(start)
        || !isPoint(end)
        || !isValidAngle(angle)
        || model.folds.length >= MAX_FOLDS) {
      return model;
    }

    const deltaX = end[0] - start[0];
    const deltaY = end[1] - start[1];
    const dragLength = Math.hypot(deltaX, deltaY);
    if (dragLength < MIN_DRAG) return model;

    const creasePoint = [start[0], start[1]];
    const creaseDirection = [deltaX / dragLength, deltaY / dragLength];
    // A directed crease has an unambiguous folding side: its left half-plane.
    const normal = [-creaseDirection[1], creaseDirection[0]];

    const midpoint = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
    const anchor = model.faces.find(face => pointInPolygon(midpoint, face.poly));
    if (!anchor) return model;

    // The rigid component: every face whose fold set matches the anchor's.
    const componentKey = foldsKey(anchor.folds);
    const componentFaces = model.faces.filter(face => foldsKey(face.folds) === componentKey);

    if (creaseTearsHinge(model, anchor.folds, componentFaces, creasePoint, normal)) return model;

    const foldIndex = model.folds.length;
    const faces = [];
    let anyMoved = false;

    for (const face of model.faces) {
      if (foldsKey(face.folds) !== componentKey) {
        faces.push(cloneFace(face));
        continue;
      }
      const split = splitPolygon(face.poly, creasePoint, normal);
      if (split.moved && !isLargeEnough(split.moved)) return model;
      if (split.stationary && !isLargeEnough(split.stationary)) return model;
      if (split.stationary) {
        faces.push({
          poly: split.stationary.map(clonePoint),
          folds: face.folds.slice()
        });
      }
      if (split.moved) {
        anyMoved = true;
        faces.push({
          poly: split.moved.map(clonePoint),
          folds: face.folds.concat(foldIndex)
        });
      }
    }

    if (!anyMoved) return model;
    if (faces.length > MAX_FACES) return model;

    const snapshot = {
      faces: model.faces.map(cloneFace),
      folds: model.folds.map(cloneFold),
      commands: model.commands.map(cloneCommand)
    };
    const command = {
      start: [start[0], start[1]],
      end: [end[0], end[1]],
      angle
    };

    return {
      faces,
      folds: model.folds.map(cloneFold).concat({
        A: creasePoint,
        d: creaseDirection,
        angle,
        parents: anchor.folds.slice()
      }),
      history: model.history.map(cloneSnapshot).concat(snapshot),
      commands: model.commands.map(cloneCommand).concat(command)
    };
  }

  // 전개도 점 (x,y) → 기저 3D (x, 0, -y). 기수(nose) = -z = 전개도 +y.
  function basePoint3(point) {
    return [point[0], 0, -point[1]];
  }

  // Rodrigues rotation of `p` around the axis through `origin` along unit `u`.
  function rotateAroundAxis(p, origin, u, angle) {
    const px = p[0] - origin[0];
    const py = p[1] - origin[1];
    const pz = p[2] - origin[2];
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const dot = px * u[0] + py * u[1] + pz * u[2];
    const crossX = u[1] * pz - u[2] * py;
    const crossY = u[2] * px - u[0] * pz;
    const crossZ = u[0] * py - u[1] * px;
    return [
      origin[0] + px * cos + crossX * sin + u[0] * dot * (1 - cos),
      origin[1] + py * cos + crossY * sin + u[1] * dot * (1 - cos),
      origin[2] + pz * cos + crossZ * sin + u[2] * dot * (1 - cos)
    ];
  }

  /**
   * Pure derivation of the folded 3D shape: every face starts on the y=0 plane
   * in material coordinates and accumulates the rotations of its fold set in
   * ascending order. Each fold's axis is itself carried through the rotations
   * of the folds that existed on its component when it was created (parents).
   */
  function computeFoldedGeometry(model) {
    if (!isUsableModel(model)) return { faces: [], minY: 0, maxY: 0, hinges: [] };

    const axisCache = new Array(model.folds.length).fill(null);

    function transformThrough(point3, foldIndices) {
      let current = point3;
      for (const index of foldIndices) {
        const fold = model.folds[index];
        if (!fold) continue;
        const axis = axisFor(index);
        current = rotateAroundAxis(current, axis.origin3, axis.dir3, ANGLE_SIGN * fold.angle);
      }
      return current;
    }

    function axisFor(index) {
      if (axisCache[index]) return axisCache[index];
      const fold = model.folds[index];
      const parents = fold.parents.slice().sort((left, right) => left - right);
      const origin3 = transformThrough(basePoint3(fold.A), parents);
      const tip3 = transformThrough(
        basePoint3([fold.A[0] + fold.d[0], fold.A[1] + fold.d[1]]),
        parents
      );
      const dx = tip3[0] - origin3[0];
      const dy = tip3[1] - origin3[1];
      const dz = tip3[2] - origin3[2];
      const length = Math.hypot(dx, dy, dz) || 1;
      axisCache[index] = { origin3, dir3: [dx / length, dy / length, dz / length] };
      return axisCache[index];
    }

    let minY = Infinity;
    let maxY = -Infinity;
    const faces = model.faces.map(face => {
      const ordered = face.folds.slice().sort((left, right) => left - right);
      const vertices3 = face.poly.map(point => transformThrough(basePoint3(point), ordered));
      vertices3.forEach(vertex => {
        if (vertex[1] < minY) minY = vertex[1];
        if (vertex[1] > maxY) maxY = vertex[1];
      });
      return {
        vertices3,
        foldDepth: face.folds.length,
        materialPoly: face.poly.map(clonePoint)
      };
    });

    if (minY === Infinity) {
      minY = 0;
      maxY = 0;
    }

    // Each fold's transformed 3D axis — the persistent hinge renderers/pickers
    // need exactly what axisFor already derives, so expose it (additive only).
    const hinges = model.folds.map((fold, index) => {
      const axis = axisFor(index);
      return {
        origin3: axis.origin3.slice(),
        dir3: axis.dir3.slice(),
        angle: fold.angle,
        foldIndex: index
      };
    });

    return { faces, minY, maxY, hinges };
  }

  /**
   * Re-fold an existing hinge to a new angle. Face splits and hinge guards are
   * angle-independent, so replacing folds[k].angle (and the matching command
   * angle, so serialize→replay stays faithful) keeps the model consistent.
   * Like applyFold, a rejected call returns the original model unchanged; a
   * history snapshot is pushed so undo restores the previous angle.
   */
  function setFoldAngle(model, foldIndex, angle) {
    if (!isUsableModel(model)
        || !Number.isInteger(foldIndex)
        || foldIndex < 0
        || foldIndex >= model.folds.length
        || !isValidAngle(angle)
        || model.folds[foldIndex].angle === angle) {
      return model;
    }

    const snapshot = {
      faces: model.faces.map(cloneFace),
      folds: model.folds.map(cloneFold),
      commands: model.commands.map(cloneCommand)
    };
    const folds = model.folds.map(cloneFold);
    folds[foldIndex].angle = angle;
    const commands = model.commands.map(cloneCommand);
    if (commands[foldIndex]) commands[foldIndex].angle = angle;

    return {
      faces: model.faces.map(cloneFace),
      folds,
      history: model.history.map(cloneSnapshot).concat(snapshot),
      commands
    };
  }

  function undoFold(model) {
    if (!isUsableModel(model) || model.history.length === 0) return model;
    const snapshot = model.history[model.history.length - 1];
    if (!snapshot
        || !Array.isArray(snapshot.faces)
        || !Array.isArray(snapshot.folds)
        || !Array.isArray(snapshot.commands)) {
      return model;
    }

    return {
      faces: snapshot.faces.map(cloneFace),
      folds: snapshot.folds.map(cloneFold),
      history: model.history.slice(0, -1).map(cloneSnapshot),
      commands: snapshot.commands.map(cloneCommand)
    };
  }

  function serializeFoldCommands(model) {
    if (!model || !Array.isArray(model.commands)) return '[]';
    return JSON.stringify(model.commands.map(cloneCommand));
  }

  function replayFoldCommands(input) {
    let commands = input;
    if (typeof input === 'string') {
      if (input.length > 4096) return null;
      try { commands = JSON.parse(input); } catch { return null; }
    }
    if (!Array.isArray(commands) || commands.length > MAX_FOLDS) return null;

    let model = createPaperModel();
    for (const command of commands) {
      if (!command || !isPoint(command.start) || !isPoint(command.end)
          || !isValidAngle(command.angle)) return null;
      // Sheet coordinates live in [-1,1]; tolerate edge dragging but reject
      // wildly out-of-range wire input (e.g. 1e300) before it reaches applyFold.
      if (Math.abs(command.start[0]) > 4 || Math.abs(command.start[1]) > 4
          || Math.abs(command.end[0]) > 4 || Math.abs(command.end[1]) > 4) return null;
      const next = applyFold(model, command.start, command.end, command.angle);
      if (next === model) return null;
      model = next;
    }
    return model;
  }

  // Fold'N Fly의 실제 완성 형상과 측정값을 기준으로 저작한 게임용 근사 모델.
  // 편집기는 한 번 접힌 힌지를 가로지르는 다층 접기를 허용하지 않으므로 사이트의
  // 전체 제작 순서를 그대로 재생하지 않고, 최종 실루엣·상반각·비행 성격을 만드는
  // 최소 대칭 힌지 세트로 표현한다. 각 수치의 출처는 PRESET_INFO.reference에 둔다.
  const PRESETS = {
    dart: [
      // 최초 소스의 N/L/R/B 기본 메시(chord/span=2.77/2.4)에 맞춘 다트 실루엣.
      { start: [0, 1], end: [1, 0], angle: Math.PI },
      { start: [-1, 0], end: [0, 1], angle: Math.PI },
      { start: [0, 1], end: [0.52, -1], angle: 3.02 },
      { start: [-0.52, -1], end: [0, 1], angle: 3.02 }
    ],
    stable: [
      // 넓은 삼각 날개와 짧은 동체를 가진 The Stable의 델타 실루엣.
      { start: [0, 1], end: [1, 0], angle: 3.1 },
      { start: [-1, 0], end: [0, 1], angle: 3.1 }
    ],
    stealth: [
      // Stealth Glider의 넓고 거의 직사각형인 플라잉 윙과 완만한 V자 상반각.
      { start: [0.65, 1], end: [0.65, -1], angle: 0.74 },
      { start: [-0.65, -1], end: [-0.65, 1], angle: 0.74 }
    ],
    jet: [
      // Jet Fighter의 좁은 2단 날개와 들린 외측 패널을 단순화한 형상.
      { start: [0.5, 1], end: [0.5, -1], angle: 1.15 },
      { start: [-0.5, -1], end: [-0.5, 1], angle: 1.15 },
      { start: [0.6, 1], end: [1, 0.68], angle: Math.PI },
      { start: [-1, 0.68], end: [-0.6, 1], angle: Math.PI }
    ]
  };

  const reference = values => Object.freeze(values);
  const PRESET_INFO = Object.freeze({
    dart: Object.freeze({
      label: 'Basic Dart', tagline: '빠른 직선 비행 · 초급', role: '기본',
      reference: reference({ sourceUrl: 'https://www.foldnfly.com/1d.html', folds: 5, distanceM: 12.5, timeAloftS: 1.4, lengthCm: 29.5, wingspanCm: 11.1, wingChordCm: 15.2, wingAreaCm2: 168.5 })
    }),
    stable: Object.freeze({
      label: 'The Stable', tagline: '넓은 선회 · 긴 체공', role: '안정',
      reference: reference({ sourceUrl: 'https://www.foldnfly.com/2d.html', folds: 7, distanceM: 5.5, timeAloftS: 2.5, lengthCm: 17, wingspanCm: 12.5, wingChordCm: 10.3, wingAreaCm2: 129.2 })
    }),
    stealth: Object.freeze({
      label: 'Stealth Glider', tagline: '넓은 V형 날개 · 활공', role: '체공',
      reference: reference({ sourceUrl: 'https://www.foldnfly.com/43.html', folds: 10, distanceM: 11.5, timeAloftS: 4.7, lengthCm: 14.1, wingspanCm: 16.4, wingChordCm: 12.6, wingAreaCm2: 206.8 })
    }),
    jet: Object.freeze({
      label: 'Jet Fighter', tagline: '2단 날개 · 빠른 반응', role: '기동',
      reference: reference({ sourceUrl: 'https://www.foldnfly.com/24d.html', folds: 9, distanceM: 6.4, timeAloftS: 2, lengthCm: 19.1, wingspanCm: 16, wingChordCm: 11.2, wingAreaCm2: 179.1 })
    })
  });

  // 프리셋 선택 화면과 실제 비행에서 쓰는 깨끗한 완성 메시. 접기 커맨드는
  // 서버 검증·공력 계산용이고, 이 메시는 공식 완성 사진의 외곽과 단면을 저작한다.
  // dart 좌표는 최초 커밋 bdd6135의 makePlaneMesh를 그대로 보존한다.
  const PRESET_VISUALS = Object.freeze({
    dart: Object.freeze({
      vertices: Object.freeze([[0, 0, -1.85], [-1.2, .16, .92], [0, 0, .8], [1.2, .16, .92], [0, -.42, .86]].map(Object.freeze)),
      faces: Object.freeze([[0, 1, 2], [0, 2, 3], [0, 4, 2]].map(Object.freeze))
    }),
    stable: Object.freeze({
      vertices: Object.freeze([[0, 0, -1.28], [-1.28, .14, .82], [0, 0, .68], [1.28, .14, .82], [0, -.28, .72]].map(Object.freeze)),
      faces: Object.freeze([[0, 1, 2], [0, 2, 3], [0, 4, 2]].map(Object.freeze))
    }),
    stealth: Object.freeze({
      vertices: Object.freeze([[0, 0, -.98], [-.72, .12, -.76], [-1.26, .2, .82], [0, 0, .66], [1.26, .2, .82], [.72, .12, -.76]].map(Object.freeze)),
      faces: Object.freeze([[0, 1, 2, 3], [0, 3, 4, 5]].map(Object.freeze))
    }),
    jet: Object.freeze({
      vertices: Object.freeze([
        [0, 0, -1.5], [-.32, .04, -.15], [-1.12, .32, .68], [-.3, .08, .72],
        [0, 0, .58], [.32, .04, -.15], [1.12, .32, .68], [.3, .08, .72], [0, -.3, .76]
      ].map(Object.freeze)),
      faces: Object.freeze([[0, 1, 4], [1, 2, 3, 4], [0, 4, 5], [5, 4, 7, 6], [0, 8, 4]].map(Object.freeze))
    })
  });

  function getPresetCommands(name) {
    const commands = PRESETS[name];
    return commands ? commands.map(cloneCommand) : null;
  }

  function createPresetModel(name) {
    const commands = PRESETS[name];
    return commands ? replayFoldCommands(commands) : null;
  }

  function getPresetVisual(name) {
    const visual = PRESET_VISUALS[name];
    return visual ? {
      vertices: visual.vertices.map(vertex => vertex.slice()),
      faces: visual.faces.map(face => face.slice())
    } : null;
  }

  return {
    createPaperModel,
    applyFold,
    setFoldAngle,
    undoFold,
    serializeFoldCommands,
    replayFoldCommands,
    getPresetCommands,
    getPresetVisual,
    createPresetModel,
    computeFoldedGeometry,
    presetNames: Object.keys(PRESETS),
    PRESET_INFO
  };
});
