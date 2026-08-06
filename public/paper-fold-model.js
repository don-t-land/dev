(function exposePaperFoldModel(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.paperFoldModel = api;
})(typeof globalThis === 'object' ? globalThis : this, () => {
  'use strict';

  const EPSILON = 1e-9;
  const HINGE_EPSILON = 1e-7;
  const MIN_DRAG = 0.05;
  const MIN_POLYGON_AREA = 1e-6;
  const MAX_FOLDS = 10;
  const MAX_ACTIONS = 20;
  const MAX_FACES = 64;
  const MAX_COMMAND_JSON = 4096;
  const MAX_COORDINATE = 1000;
  const LEGACY_COMMAND_VERSION = 2;
  const COMMAND_VERSION = 3;

  function cleanNumber(value) {
    const rounded = Math.round(value * 1e12) / 1e12;
    return Math.abs(rounded) < 1e-12 ? 0 : rounded;
  }

  function clonePoint(point) {
    return [point[0], point[1]];
  }

  function clonePoint3d(point) {
    return [point[0], point[1], point[2]];
  }

  function projected(vertices) {
    return vertices.map(point => [cleanNumber(point[0]), cleanNumber(point[1])]);
  }

  function isPoint(point) {
    return Array.isArray(point)
      && point.length >= 2
      && Number.isFinite(point[0])
      && Number.isFinite(point[1])
      && Math.abs(point[0]) <= MAX_COORDINATE
      && Math.abs(point[1]) <= MAX_COORDINATE;
  }

  function isPoint3d(point) {
    return Array.isArray(point)
      && point.length === 3
      && point.every(value => Number.isFinite(value) && Math.abs(value) <= MAX_COORDINATE * 4);
  }

  function isId(id) {
    return typeof id === 'string' && id.length > 0 && id.length <= 256
      && /^[A-Za-z0-9:._-]+$/.test(id);
  }

  function isActionId(id, type) {
    return isId(id) && new RegExp(`^${type}-[1-9][0-9]*$`).test(id);
  }

  function faceVertices(face) {
    if (Array.isArray(face.vertices3d) && face.vertices3d.length === face.poly.length
        && face.vertices3d.every(isPoint3d)) return face.vertices3d.map(clonePoint3d);
    return face.poly.map(point => [point[0], point[1], 0]);
  }

  function faceMaterial(face) {
    if (Array.isArray(face.materialPoly) && face.materialPoly.length === face.poly.length
        && face.materialPoly.every(isPoint)) return face.materialPoly.map(clonePoint);
    // Valid pre-v2 in-memory models used poly as their only material coordinates.
    return face.poly.map(clonePoint);
  }

  function cloneFace(face, fallbackId, foldIds) {
    const vertices3d = faceVertices(face);
    const folds = face.folds.map(value => {
      if (typeof value === 'number' && foldIds[value]) return foldIds[value];
      return value;
    });
    return {
      id: isId(face.id) ? face.id : fallbackId,
      poly: projected(vertices3d),
      materialPoly: faceMaterial(face),
      vertices3d,
      layer: face.layer,
      folds
    };
  }

  function cloneFold(fold, index = 0, commandId) {
    const A = isPoint(fold?.A) ? clonePoint(fold.A) : [0, 0];
    const d = isPoint(fold?.d) && Math.hypot(fold.d[0], fold.d[1]) > EPSILON
      ? clonePoint(fold.d) : [1, 0];
    const axis3d = Array.isArray(fold?.axis3d) && fold.axis3d.length === 2
      && fold.axis3d.every(isPoint3d)
      ? fold.axis3d.map(clonePoint3d)
      : [[A[0], A[1], 0], [A[0] + d[0], A[1] + d[1], 0]];
    const cloned = {
      id: isActionId(fold?.id, 'fold') ? fold.id : (commandId || `fold-${index + 1}`),
      A,
      d,
      axis3d,
      dir: fold?.dir === -1 ? -1 : 1,
      targetAngle: quantizeAngle(fold?.targetAngle) ?? 180,
      targetFaceIds: Array.isArray(fold?.targetFaceIds) ? fold.targetFaceIds.slice() : null
    };
    if (isId(fold?.seedFaceId)) cloned.seedFaceId = fold.seedFaceId;
    return cloned;
  }

  function cloneCommand(command, index = 0, fallbackId) {
    const version = command?.version === LEGACY_COMMAND_VERSION
      ? LEGACY_COMMAND_VERSION : COMMAND_VERSION;
    if (command?.type === 'flip') {
      return {
        type: 'flip', version,
        id: isActionId(command.id, 'flip') ? command.id : (fallbackId || `flip-${index + 1}`)
      };
    }
    const legacy = command?.type == null;
    const cloned = {
      type: 'fold',
      version,
      id: isActionId(command?.id, 'fold') ? command.id : (fallbackId || `fold-${index + 1}`),
      start: clonePoint(command.start),
      end: clonePoint(command.end),
      direction: command.direction,
      targetAngle: legacy ? 180 : command.targetAngle
    };
    if (command.coordinateSpace === 'material') cloned.coordinateSpace = 'material';
    if (Array.isArray(command.targetFaceIds)) cloned.targetFaceIds = command.targetFaceIds.slice();
    if (isId(command.seedFaceId)) cloned.seedFaceId = command.seedFaceId;
    return cloned;
  }

  function isUsableModel(model) {
    return Boolean(model)
      && Array.isArray(model.faces)
      && model.faces.length > 0
      && model.faces.length <= MAX_FACES
      && Array.isArray(model.folds)
      && model.folds.length <= MAX_FOLDS
      && Array.isArray(model.history)
      && Array.isArray(model.commands)
      && model.commands.length <= MAX_ACTIONS
      && model.faces.every(face => face
        && Array.isArray(face.poly)
        && face.poly.length >= 3
        && face.poly.length <= 64
        && face.poly.every(isPoint)
        && (!('vertices3d' in face) || (Array.isArray(face.vertices3d)
          && face.vertices3d.length === face.poly.length && face.vertices3d.every(isPoint3d)))
        && (!('materialPoly' in face) || (Array.isArray(face.materialPoly)
          && face.materialPoly.length === face.poly.length && face.materialPoly.every(isPoint)))
        && Number.isFinite(face.layer)
        && Array.isArray(face.folds));
  }

  function upgradeModel(model) {
    if (!isUsableModel(model)) return null;
    try {
      const commands = model.commands.map((command, index) => {
        if (!command || !isPoint(command.start) && command.type !== 'flip'
            || !isPoint(command.end) && command.type !== 'flip') throw new Error('bad command');
        const foldAtIndex = model.folds[index];
        const fallback = command.type === 'flip' ? `flip-${index + 1}`
          : (isActionId(foldAtIndex?.id, 'fold') ? foldAtIndex.id : `fold-${index + 1}`);
        return cloneCommand(command, index, fallback);
      });
      const commandIds = new Set(commands.map(command => command.id));
      if (commandIds.size !== commands.length) return null;
      const foldCommandIds = commands.filter(command => command.type === 'fold').map(command => command.id);
      const folds = model.folds.map((fold, index) => cloneFold(fold, index, foldCommandIds[index]));
      const foldIds = folds.map(fold => fold.id);
      const faces = model.faces.map((face, index) => cloneFace(face, `face-${index}`, foldIds));
      if (new Set(faces.map(face => face.id)).size !== faces.length) return null;
      return {
        faces,
        folds,
        history: model.history.map(snapshot => upgradeSnapshot(snapshot)),
        commands,
        paperSide: model.paperSide === 'back' ? 'back' : 'front'
      };
    } catch {
      return null;
    }
  }

  function upgradeSnapshot(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.faces) || !Array.isArray(snapshot.folds)
        || !Array.isArray(snapshot.commands)) throw new Error('bad snapshot');
    const commands = snapshot.commands.map((command, index) => cloneCommand(command, index));
    const foldCommandIds = commands.filter(command => command.type === 'fold').map(command => command.id);
    const folds = snapshot.folds.map((fold, index) => cloneFold(fold, index, foldCommandIds[index]));
    const foldIds = folds.map(fold => fold.id);
    return {
      faces: snapshot.faces.map((face, index) => cloneFace(face, `face-${index}`, foldIds)),
      folds,
      commands,
      paperSide: snapshot.paperSide === 'back' ? 'back' : 'front'
    };
  }

  function cloneSnapshot(snapshot) {
    return upgradeSnapshot(snapshot);
  }

  function snapshotOf(model) {
    return {
      faces: model.faces.map((face, index) => cloneFace(face, `face-${index}`)),
      folds: model.folds.map((fold, index) => cloneFold(fold, index)),
      commands: model.commands.map((command, index) => cloneCommand(command, index)),
      paperSide: model.paperSide === 'back' ? 'back' : 'front'
    };
  }

  function createPaperModel() {
    const materialPoly = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    const vertices3d = materialPoly.map(point => [point[0], point[1], 0]);
    return {
      faces: [{
        id: 'face-0',
        poly: projected(vertices3d),
        materialPoly: materialPoly.map(clonePoint),
        vertices3d,
        layer: 0,
        folds: []
      }],
      folds: [],
      history: [],
      commands: [],
      paperSide: 'front'
    };
  }

  function signedArea(poly) {
    let twiceArea = 0;
    for (let index = 0; index < poly.length; index += 1) {
      const next = (index + 1) % poly.length;
      twiceArea += poly[index][0] * poly[next][1] - poly[next][0] * poly[index][1];
    }
    return twiceArea / 2;
  }

  function pointsEqual(left, right) {
    return Math.abs(left[0] - right[0]) <= EPSILON
      && Math.abs(left[1] - right[1]) <= EPSILON;
  }

  function cleanPolygonPair(materialPoly, vertices3d) {
    const cleanMaterial = [];
    const clean3d = [];
    materialPoly.forEach((point, index) => {
      if (!cleanMaterial.length || !pointsEqual(cleanMaterial[cleanMaterial.length - 1], point)) {
        cleanMaterial.push(clonePoint(point));
        clean3d.push(clonePoint3d(vertices3d[index]));
      }
    });
    if (cleanMaterial.length > 1 && pointsEqual(cleanMaterial[0], cleanMaterial.at(-1))) {
      cleanMaterial.pop();
      clean3d.pop();
    }
    return { materialPoly: cleanMaterial, vertices3d: clean3d };
  }

  // Polygon output and interpolation always use canonical sheet coordinates.
  // The compatibility wrapper may classify left/right in projection, but only
  // after an invertible projected-to-material mapping has been established.
  function splitFace(face, creasePoint, normal, classifierPoly = face.materialPoly) {
    const materialPoly = face.materialPoly;
    const vertices3d = face.vertices3d;
    const distances = classifierPoly.map(point => (point[0] - creasePoint[0]) * normal[0]
      + (point[1] - creasePoint[1]) * normal[1]);
    const positiveMaterial = [];
    const positive3d = [];
    const negativeMaterial = [];
    const negative3d = [];
    let hasPositive = false;
    let hasNegative = false;

    for (let index = 0; index < materialPoly.length; index += 1) {
      const next = (index + 1) % materialPoly.length;
      const distance = distances[index];
      const nextDistance = distances[next];
      if (distance > EPSILON) hasPositive = true;
      if (distance < -EPSILON) hasNegative = true;
      if (distance >= -EPSILON) {
        positiveMaterial.push(materialPoly[index]);
        positive3d.push(vertices3d[index]);
      }
      if (distance <= EPSILON) {
        negativeMaterial.push(materialPoly[index]);
        negative3d.push(vertices3d[index]);
      }
      if ((distance > EPSILON && nextDistance < -EPSILON)
          || (distance < -EPSILON && nextDistance > EPSILON)) {
        const ratio = distance / (distance - nextDistance);
        const intersectionMaterial = [
          materialPoly[index][0] + ratio * (materialPoly[next][0] - materialPoly[index][0]),
          materialPoly[index][1] + ratio * (materialPoly[next][1] - materialPoly[index][1])
        ];
        const intersection3d = [0, 1, 2].map(axis => vertices3d[index][axis]
          + ratio * (vertices3d[next][axis] - vertices3d[index][axis]));
        positiveMaterial.push(intersectionMaterial);
        positive3d.push(intersection3d);
        negativeMaterial.push(intersectionMaterial);
        negative3d.push(intersection3d);
      }
    }

    return {
      moved: hasPositive ? cleanPolygonPair(positiveMaterial, positive3d) : null,
      stationary: hasNegative ? cleanPolygonPair(negativeMaterial, negative3d) : null
    };
  }

  function isLargeEnough(piece) {
    return piece && piece.materialPoly.length >= 3
      && Math.abs(signedArea(piece.materialPoly)) > MIN_POLYGON_AREA;
  }

  function affineMap(point, source, destination) {
    for (let first = 0; first < source.length - 2; first += 1) {
      for (let second = first + 1; second < source.length - 1; second += 1) {
        for (let third = second + 1; third < source.length; third += 1) {
          const ux = source[second][0] - source[first][0];
          const uy = source[second][1] - source[first][1];
          const vx = source[third][0] - source[first][0];
          const vy = source[third][1] - source[first][1];
          const determinant = ux * vy - uy * vx;
          if (Math.abs(determinant) <= EPSILON) continue;
          const px = point[0] - source[first][0];
          const py = point[1] - source[first][1];
          const u = (px * vy - py * vx) / determinant;
          const v = (ux * py - uy * px) / determinant;
          return destination[first].map((value, axis) => cleanNumber(value
            + u * (destination[second][axis] - value)
            + v * (destination[third][axis] - value)));
        }
      }
    }
    return null;
  }

  function materialPoint3d(face, point) {
    return affineMap(point, face.materialPoly, face.vertices3d);
  }

  function projectedPointMaterial(face, point) {
    return affineMap(point, face.poly, face.materialPoly);
  }

  function vector3d(start, end) {
    return [end[0] - start[0], end[1] - start[1], end[2] - start[2]];
  }

  function normalized3d(vector) {
    const length = Math.hypot(...vector);
    return length <= EPSILON ? null : vector.map(value => value / length);
  }

  function cross3d(left, right) {
    return [
      left[1] * right[2] - left[2] * right[1],
      left[2] * right[0] - left[0] * right[2],
      left[0] * right[1] - left[1] * right[0]
    ];
  }

  function distanceToLine(point, linePoint, lineDirection) {
    return Math.hypot(...cross3d(vector3d(linePoint, point), lineDirection));
  }

  function sameHinge(left, right) {
    const leftDirection = normalized3d(vector3d(left[0], left[1]));
    const rightDirection = normalized3d(vector3d(right[0], right[1]));
    return leftDirection && rightDirection
      && Math.hypot(...cross3d(leftDirection, rightDirection)) <= HINGE_EPSILON
      && distanceToLine(right[0], left[0], leftDirection) <= HINGE_EPSILON;
  }

  function rotatePoint(point, axisPoint, axisDirection, radians) {
    const relative = vector3d(axisPoint, point);
    const [ux, uy, uz] = axisDirection;
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    const dot = ux * relative[0] + uy * relative[1] + uz * relative[2];
    const cross = [
      uy * relative[2] - uz * relative[1],
      uz * relative[0] - ux * relative[2],
      ux * relative[1] - uy * relative[0]
    ];
    return [0, 1, 2].map(axis => cleanNumber(axisPoint[axis]
      + relative[axis] * cosine + cross[axis] * sine
      + axisDirection[axis] * dot * (1 - cosine)));
  }

  function normalizeLayers(faces) {
    const layers = [...new Set(faces.map(face => face.layer))].sort((left, right) => left - right);
    const rank = new Map(layers.map((layer, index) => [layer, index]));
    return faces.map(face => ({ ...face, layer: rank.get(face.layer) }));
  }

  function quantizeAngle(angle) {
    if (!Number.isFinite(angle) || angle < 0 || angle > 180) return null;
    return cleanNumber(Math.round(angle * 1000) / 1000);
  }

  function normalizedTargets(model, options, connectedFlap) {
    if (options.targetFaceIds != null && options.seedFaceId != null) return null;
    let ids = null;
    let seedFaceId = null;
    if (options.seedFaceId != null) {
      ids = [options.seedFaceId];
      seedFaceId = options.seedFaceId;
    } else if (options.targetFaceIds != null) {
      ids = options.targetFaceIds;
    }
    if (ids == null) {
      return { ids: null, seedFaceId: null, selected: new Set(model.faces.map(face => face.id)) };
    }
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_FACES
        || !ids.every(isId) || new Set(ids).size !== ids.length) return null;
    // In v3 a selected face identifies which visible layer the user grabbed.
    // The actual motion still includes every sheet facet on the directed
    // crease's moving side; v2 replay keeps its historical single-face motion.
    if (ids.length !== 1) return null;
    const available = new Set(model.faces.map(face => face.id));
    const seedExists = available.has(ids[0]) || connectedFlap && model.history.some(snapshot => (
      snapshot.faces.some(face => face.id === ids[0])
    ));
    if (!seedExists) return null;
    const candidates = model.faces.filter(face => face.id === ids[0]
      || connectedFlap && face.id.startsWith(`${ids[0]}:`));
    if (!candidates.length) return null;
    const canonical = model.faces.map(face => face.id).filter(id => ids.includes(id));
    return {
      ids: connectedFlap ? ids.slice() : canonical,
      seedFaceId,
      hingeFaceIds: new Set(candidates.map(face => face.id)),
      selected: new Set((connectedFlap ? model.faces : candidates).map(face => face.id))
    };
  }

  function nextActionId(model, type) {
    const highest = model.commands.reduce((max, command) => {
      const match = /-([1-9][0-9]*)$/.exec(command.id);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
    return `${type}-${highest + 1}`;
  }

  function chooseActionId(model, type, supplied) {
    const id = supplied == null ? nextActionId(model, type) : supplied;
    if (!isActionId(id, type) || model.commands.some(command => command.id === id)) return null;
    return id;
  }

  function applyPanelFoldInternal(original, options, requiredId, commandVersion = COMMAND_VERSION) {
    const model = upgradeModel(original);
    if (!model || !options || typeof options !== 'object'
        || !isPoint(options.start) || !isPoint(options.end)
        || (options.coordinateSpace != null && options.coordinateSpace !== 'material'
          && options.coordinateSpace !== 'projected')
        || (options.direction !== 1 && options.direction !== -1)
        || model.commands.length >= MAX_ACTIONS || model.folds.length >= MAX_FOLDS) return original;

    const targetAngle = quantizeAngle(options.targetAngle);
    if (targetAngle == null) return original;
    const suppliedId = requiredId != null ? requiredId : options.id;
    if (requiredId != null && options.id != null && options.id !== requiredId) return original;
    const id = chooseActionId(model, 'fold', suppliedId);
    if (!id) return original;
    const connectedFlap = commandVersion === COMMAND_VERSION;
    const targets = normalizedTargets(model, options, connectedFlap);
    if (!targets) return original;

    const deltaX = options.end[0] - options.start[0];
    const deltaY = options.end[1] - options.start[1];
    if (Math.hypot(deltaX, deltaY) < MIN_DRAG) return original;
    const coordinateSpace = options.coordinateSpace === 'material' ? 'material' : 'projected';
    const pieces = [];
    const hinges = [];
    let anyMoved = false;

    for (const face of model.faces) {
      if (!targets.selected.has(face.id)) {
        pieces.push({ face, selected: false, moved: null, stationary: null });
        continue;
      }
      const materialStart = coordinateSpace === 'material'
        ? clonePoint(options.start) : projectedPointMaterial(face, options.start);
      const materialEnd = coordinateSpace === 'material'
        ? clonePoint(options.end) : projectedPointMaterial(face, options.end);
      if (!materialStart || !materialEnd) return original;
      const materialDelta = [materialEnd[0] - materialStart[0], materialEnd[1] - materialStart[1]];
      const materialLength = Math.hypot(...materialDelta);
      if (materialLength < MIN_DRAG) return original;
      const creasePoint = materialStart.map(cleanNumber);
      const creaseDirection = materialDelta.map(value => cleanNumber(value / materialLength));
      const materialNormal = [-creaseDirection[1], creaseDirection[0]];
      const projectedLength = Math.hypot(deltaX, deltaY);
      const projectedNormal = [-deltaY / projectedLength, deltaX / projectedLength];
      const split = coordinateSpace === 'material'
        ? splitFace(face, creasePoint, materialNormal)
        : splitFace(face, options.start, projectedNormal, face.poly);
      if ((split.moved && !isLargeEnough(split.moved))
          || (split.stationary && !isLargeEnough(split.stationary))) return original;
      // Only a face cut into two physical pieces contributes a real hinge.
      // A face wholly on the moving side follows the connected flap but must
      // not manufacture an extrapolated axis outside the sheet.
      if (split.moved && (!connectedFlap || split.stationary)) {
        const axisStart = materialPoint3d(face, materialStart);
        const axisEnd = materialPoint3d(face, materialEnd);
        if (!axisStart || !axisEnd || !normalized3d(vector3d(axisStart, axisEnd))) return original;
        hinges.push({ axis: [axisStart, axisEnd], faceId: face.id });
      }
      if (split.moved) anyMoved = true;
      pieces.push({
        face, selected: true, moved: split.moved, stationary: split.stationary,
        creasePoint, creaseDirection
      });
    }

    if (!anyMoved || !hinges.length
        || !hinges.every(hinge => sameHinge(hinges[0].axis, hinge.axis))) return original;
    let physicalHinge = hinges[0].axis;
    if (connectedFlap && targets.ids) {
      const seedHinges = hinges.filter(hinge => targets.hingeFaceIds.has(hinge.faceId));
      if (seedHinges.length !== 1) return original;
      physicalHinge = seedHinges[0].axis;
    }
    const resultingFaceCount = pieces.reduce((count, piece) => {
      if (!piece.selected || !piece.moved) return count + 1;
      return count + 1 + (piece.stationary ? 1 : 0);
    }, 0);
    if (resultingFaceCount > MAX_FACES) return original;

    const axisPoint = physicalHinge[0];
    const axisEnd = physicalHinge[1];
    const axisDirection = normalized3d(vector3d(axisPoint, axisEnd));
    const radians = options.direction * targetAngle * Math.PI / 180;
    const movedLayers = pieces.filter(piece => piece.moved).map(piece => piece.face.layer);
    const maxMoved = Math.max(...movedLayers);
    const minMoved = Math.min(...movedLayers);
    const allLayers = model.faces.map(face => face.layer);
    const globalMax = Math.max(...allLayers);
    const globalMin = Math.min(...allLayers);
    const faces = [];

    for (const piece of pieces) {
      const face = piece.face;
      if (!piece.selected || !piece.moved) {
        faces.push(face);
        continue;
      }
      if (piece.stationary) {
        faces.push({
          id: `${face.id}:${id}:s`,
          poly: projected(piece.stationary.vertices3d),
          materialPoly: piece.stationary.materialPoly.map(clonePoint),
          vertices3d: piece.stationary.vertices3d.map(clonePoint3d),
          layer: face.layer,
          folds: face.folds.slice()
        });
      }
      const moved3d = piece.moved.vertices3d
        .map(point => rotatePoint(point, axisPoint, axisDirection, radians));
      const layer = options.direction > 0
        ? globalMax + 1 + (maxMoved - face.layer)
        : globalMin - 1 - (face.layer - minMoved);
      faces.push({
        id: `${face.id}:${id}:m`,
        poly: projected(moved3d),
        materialPoly: piece.moved.materialPoly.map(clonePoint),
        vertices3d: moved3d,
        layer,
        folds: face.folds.concat(id)
      });
    }

    const command = {
      type: 'fold', version: commandVersion, id,
      start: [cleanNumber(options.start[0]), cleanNumber(options.start[1])],
      end: [cleanNumber(options.end[0]), cleanNumber(options.end[1])],
      direction: options.direction,
      targetAngle
    };
    if (coordinateSpace === 'material') command.coordinateSpace = 'material';
    if (targets.seedFaceId) command.seedFaceId = targets.seedFaceId;
    else if (targets.ids) command.targetFaceIds = targets.ids.slice();

    const firstPiece = pieces.find(piece => piece.moved);
    const fold = {
      id,
      A: clonePoint(firstPiece.creasePoint),
      d: clonePoint(firstPiece.creaseDirection),
      axis3d: [clonePoint3d(axisPoint), clonePoint3d(axisEnd)],
      dir: options.direction,
      targetAngle,
      targetFaceIds: targets.ids ? targets.ids.slice() : null
    };
    if (targets.seedFaceId) fold.seedFaceId = targets.seedFaceId;
    const nextCommands = model.commands.map((item, index) => cloneCommand(item, index)).concat(command);
    if (JSON.stringify(nextCommands).length > MAX_COMMAND_JSON) return original;

    return {
      faces: commandVersion === LEGACY_COMMAND_VERSION && targets.ids
        ? faces : normalizeLayers(faces),
      folds: model.folds.map((item, index) => cloneFold(item, index)).concat(fold),
      history: model.history.map(cloneSnapshot).concat(snapshotOf(model)),
      commands: nextCommands,
      paperSide: model.paperSide
    };
  }

  /**
   * Apply an absolute-angle panel fold. `coordinateSpace: 'material'` cuts in
   * canonical sheet coordinates and is the stable API for sequential seed-face
   * editing. A selected face is a grab seed; every connected facet on the
   * directed line's left side moves through one rigid hinge transform so old
   * seams remain joined. Unsupported multi-hinge motion and every other failure
   * are rejected atomically by returning the original model.
   */
  function applyPanelFold(model, options) {
    return applyPanelFoldInternal(model, options, options && options.id);
  }

  // Backward-compatible projected line API: a legacy fold is a complete 180° fold.
  function applyFold(model, start, end, direction) {
    return applyPanelFold(model, { start, end, direction, targetAngle: 180 });
  }

  function flipPaperInternal(original, requiredId, commandVersion = COMMAND_VERSION) {
    const model = upgradeModel(original);
    if (!model || model.commands.length >= MAX_ACTIONS) return original;
    const id = chooseActionId(model, 'flip', requiredId);
    if (!id) return original;
    const layers = model.faces.map(face => face.layer);
    const minLayer = Math.min(...layers);
    const maxLayer = Math.max(...layers);
    const faces = model.faces.map(face => {
      const vertices3d = face.vertices3d.map(point => [
        cleanNumber(point[0]), cleanNumber(-point[1]), cleanNumber(-point[2])
      ]);
      return {
        ...face,
        poly: projected(vertices3d),
        materialPoly: face.materialPoly.map(clonePoint),
        vertices3d,
        folds: face.folds.slice(),
        layer: cleanNumber(minLayer + maxLayer - face.layer)
      };
    });
    const folds = model.folds.map((fold, index) => cloneFold(fold, index)).map(fold => ({
      ...fold,
      A: [fold.A[0], cleanNumber(-fold.A[1])],
      d: [fold.d[0], cleanNumber(-fold.d[1])],
      axis3d: fold.axis3d.map(point => [point[0], cleanNumber(-point[1]), cleanNumber(-point[2])])
    }));
    const command = { type: 'flip', version: commandVersion, id };
    const nextCommands = model.commands.map((item, index) => cloneCommand(item, index)).concat(command);
    if (JSON.stringify(nextCommands).length > MAX_COMMAND_JSON) return original;
    return {
      faces,
      folds,
      history: model.history.map(cloneSnapshot).concat(snapshotOf(model)),
      commands: nextCommands,
      paperSide: model.paperSide === 'back' ? 'front' : 'back'
    };
  }

  function flipPaper(model) {
    const upgraded = upgradeModel(model);
    if (!upgraded) return model;
    // A physical flip is its own inverse. Compact only direct user actions;
    // replay passes a required id to flipPaperInternal and must retain every
    // command id from the wire payload.
    if (upgraded.commands.at(-1)?.type === 'flip') return undoFold(upgraded);
    return flipPaperInternal(upgraded, null);
  }

  function undoFold(original) {
    const model = upgradeModel(original);
    if (!model || model.history.length === 0) return original;
    const snapshot = model.history.at(-1);
    return {
      faces: snapshot.faces.map((face, index) => cloneFace(face, `face-${index}`)),
      folds: snapshot.folds.map((fold, index) => cloneFold(fold, index)),
      history: model.history.slice(0, -1).map(cloneSnapshot),
      commands: snapshot.commands.map((command, index) => cloneCommand(command, index)),
      paperSide: snapshot.paperSide
    };
  }

  function serializeFoldCommands(model) {
    if (!model || !Array.isArray(model.commands)) return '[]';
    try {
      return JSON.stringify(model.commands.map((command, index) => cloneCommand(command, index)));
    } catch {
      return '[]';
    }
  }

  function isLegacyCommand(command) {
    return command && command.type == null && isPoint(command.start) && isPoint(command.end)
      && (command.direction === 1 || command.direction === -1);
  }

  function replayFoldCommands(input) {
    let commands = input;
    if (typeof input === 'string') {
      if (input.length > MAX_COMMAND_JSON) return null;
      try { commands = JSON.parse(input); } catch { return null; }
    }
    if (!Array.isArray(commands) || commands.length > MAX_ACTIONS) return null;
    try {
      if (JSON.stringify(commands).length > MAX_COMMAND_JSON) return null;
    } catch {
      return null;
    }
    const modernIds = commands.filter(command => command?.type != null).map(command => command.id);
    if (new Set(modernIds).size !== modernIds.length) return null;

    let model = createPaperModel();
    for (const rawCommand of commands) {
      if (isLegacyCommand(rawCommand)) {
        const next = applyFold(model, rawCommand.start, rawCommand.end, rawCommand.direction);
        if (next === model) return null;
        model = next;
        continue;
      }
      if (!rawCommand || ![LEGACY_COMMAND_VERSION, COMMAND_VERSION].includes(rawCommand.version)) return null;
      if (rawCommand.type === 'fold') {
        const allowed = [
          'type', 'version', 'id', 'start', 'end', 'direction', 'targetAngle',
          'targetFaceIds', 'seedFaceId', 'coordinateSpace'
        ];
        if (!isActionId(rawCommand.id, 'fold')
            || Object.keys(rawCommand).some(key => !allowed.includes(key))
            || !isPoint(rawCommand.start) || !isPoint(rawCommand.end)
            || (rawCommand.direction !== 1 && rawCommand.direction !== -1)
            || quantizeAngle(rawCommand.targetAngle) !== rawCommand.targetAngle
            || (rawCommand.coordinateSpace != null && rawCommand.coordinateSpace !== 'material'
              && rawCommand.coordinateSpace !== 'projected')) return null;
        const options = {
          id: rawCommand.id,
          start: rawCommand.start,
          end: rawCommand.end,
          direction: rawCommand.direction,
          targetAngle: rawCommand.targetAngle
        };
        if ('coordinateSpace' in rawCommand) options.coordinateSpace = rawCommand.coordinateSpace;
        if ('targetFaceIds' in rawCommand) options.targetFaceIds = rawCommand.targetFaceIds;
        if ('seedFaceId' in rawCommand) options.seedFaceId = rawCommand.seedFaceId;
        const next = applyPanelFoldInternal(model, options, rawCommand.id, rawCommand.version);
        if (next === model) return null;
        model = next;
      } else if (rawCommand.type === 'flip') {
        if (!isActionId(rawCommand.id, 'flip')
            || Object.keys(rawCommand).some(key => !['type', 'version', 'id'].includes(key))) return null;
        const next = flipPaperInternal(model, rawCommand.id, rawCommand.version);
        if (next === model) return null;
        model = next;
      } else {
        return null;
      }
    }
    return model;
  }

  function updateFoldAngle(original, foldId, targetAngle) {
    const model = upgradeModel(original);
    if (!model || !isActionId(foldId, 'fold') || quantizeAngle(targetAngle) == null) return original;
    const index = model.commands.findIndex(command => command.type === 'fold' && command.id === foldId);
    if (index < 0) return original;
    const commands = model.commands.map((command, commandIndex) => cloneCommand(command, commandIndex));
    commands[index].targetAngle = quantizeAngle(targetAngle);
    return replayFoldCommands(commands) || original;
  }

  function removeFold(original, foldId) {
    const model = upgradeModel(original);
    if (!model || !isActionId(foldId, 'fold')) return original;
    const index = model.commands.findIndex(command => command.type === 'fold' && command.id === foldId);
    if (index < 0) return original;
    const commands = model.commands
      .filter((command, commandIndex) => commandIndex !== index)
      .map((command, commandIndex) => cloneCommand(command, commandIndex));
    return replayFoldCommands(commands) || original;
  }

  return {
    createPaperModel,
    applyFold,
    undoFold,
    serializeFoldCommands,
    replayFoldCommands,
    applyPanelFold,
    updateFoldAngle,
    removeFold,
    flipPaper
  };
});
