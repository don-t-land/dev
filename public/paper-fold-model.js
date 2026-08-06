(function exposePaperFoldModel(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.paperFoldModel = api;
})(typeof globalThis === 'object' ? globalThis : this, () => {
  'use strict';

  const EPSILON = 1e-9;
  const MIN_DRAG = 0.05;
  const MIN_POLYGON_AREA = 1e-6;
  const MAX_FOLDS = 10;
  const MAX_FACES = 64;

  function clonePoint(point) {
    return [point[0], point[1]];
  }

  function cloneFace(face) {
    return {
      poly: face.poly.map(clonePoint),
      layer: face.layer,
      folds: face.folds.slice()
    };
  }

  function cloneFold(fold) {
    return {
      A: clonePoint(fold.A),
      d: clonePoint(fold.d),
      dir: fold.dir
    };
  }

  function cloneCommand(command) {
    return {
      start: clonePoint(command.start),
      end: clonePoint(command.end),
      direction: command.direction
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
        poly: [[-1, -1], [1, -1], [1, 1], [-1, 1]],
        layer: 0,
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
        && Number.isFinite(face.layer)
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

  // The positive half-plane is the part carried from start to end.
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

  function reflectPoint(point, creasePoint, normal) {
    const distance = (point[0] - creasePoint[0]) * normal[0]
      + (point[1] - creasePoint[1]) * normal[1];
    return [
      point[0] - 2 * distance * normal[0],
      point[1] - 2 * distance * normal[1]
    ];
  }

  function normalizeLayers(faces) {
    const layers = [...new Set(faces.map(face => face.layer))].sort((left, right) => left - right);
    const rank = new Map(layers.map((layer, index) => [layer, index]));
    return faces.map(face => ({
      poly: face.poly,
      layer: rank.get(face.layer),
      folds: face.folds
    }));
  }

  /**
   * Return a newly folded model. A rejected command returns the original model,
   * which lets callers use `model = applyFold(model, ...)` without a side channel.
   */
  function applyFold(model, start, end, direction) {
    if (!isUsableModel(model)
        || !isPoint(start)
        || !isPoint(end)
        || (direction !== 1 && direction !== -1)
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
    const pieces = [];
    let anyMoved = false;

    for (const face of model.faces) {
      const split = splitPolygon(face.poly, creasePoint, normal);
      if (split.moved) {
        if (!isLargeEnough(split.moved)) return model;
        anyMoved = true;
      }
      if (split.stationary && !isLargeEnough(split.stationary)) return model;
      pieces.push({ face, moved: split.moved, stationary: split.stationary });
    }

    if (!anyMoved) return model;

    const resultingFaceCount = pieces.reduce((count, piece) => count
      + (piece.moved ? 1 : 0) + (piece.stationary ? 1 : 0), 0);
    if (resultingFaceCount > MAX_FACES) return model;

    const movedLayers = pieces.filter(piece => piece.moved).map(piece => piece.face.layer);
    const maxMoved = Math.max(...movedLayers);
    const minMoved = Math.min(...movedLayers);
    const allLayers = model.faces.map(face => face.layer);
    const globalMax = Math.max(...allLayers);
    const globalMin = Math.min(...allLayers);
    const foldIndex = model.folds.length;
    const faces = [];

    pieces.forEach(piece => {
      const face = piece.face;
      if (piece.stationary) {
        faces.push({
          poly: piece.stationary.map(clonePoint),
          layer: face.layer,
          folds: face.folds.slice()
        });
      }
      if (piece.moved) {
        const layer = direction > 0
          ? globalMax + 1 + (maxMoved - face.layer)
          : globalMin - 1 - (face.layer - minMoved);
        faces.push({
          poly: piece.moved.map(point => reflectPoint(point, creasePoint, normal)),
          layer,
          folds: face.folds.concat(foldIndex)
        });
      }
    });

    const snapshot = {
      faces: model.faces.map(cloneFace),
      folds: model.folds.map(cloneFold),
      commands: model.commands.map(cloneCommand)
    };
    const command = {
      start: [start[0], start[1]],
      end: [end[0], end[1]],
      direction
    };

    return {
      faces: normalizeLayers(faces),
      folds: model.folds.map(cloneFold).concat({
        A: creasePoint,
        d: creaseDirection,
        dir: direction
      }),
      history: model.history.map(cloneSnapshot).concat(snapshot),
      commands: model.commands.map(cloneCommand).concat(command)
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
          || (command.direction !== 1 && command.direction !== -1)) return null;
      const next = applyFold(model, command.start, command.end, command.direction);
      if (next === model) return null;
      model = next;
    }
    return model;
  }

  return {
    createPaperModel,
    applyFold,
    undoFold,
    serializeFoldCommands,
    replayFoldCommands
  };
});
