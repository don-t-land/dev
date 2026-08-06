const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const { createPaperModel, applyPanelFold } = require('../public/paper-fold-model.js');
const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');

function extractFunction(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} is present in index.html`);
  const bodyStart = html.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < html.length; index += 1) {
    if (html[index] === '{') depth += 1;
    if (html[index] === '}') depth -= 1;
    if (depth === 0) return html.slice(start, index + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

function makeThreeStub() {
  class Group {
    constructor() { this.children = []; }
    add(child) { this.children.push(child); }
  }
  class BufferGeometry {
    constructor() { this.attributes = {}; }
    setAttribute(name, attribute) { this.attributes[name] = attribute; }
    computeVertexNormals() {}
  }
  class Float32BufferAttribute {
    constructor(array, itemSize) {
      this.array = new Float32Array(array);
      this.itemSize = itemSize;
    }
  }
  class Color {
    constructor(value) { this.value = value; }
    clone() { return new Color(this.value); }
    lerp() { return this; }
    offsetHSL() { return this; }
  }
  class MeshStandardMaterial {
    constructor(options) { this.options = options; }
  }
  class Mesh {
    constructor(geometry, material) {
      this.geometry = geometry;
      this.material = material;
    }
  }
  return {
    Group, BufferGeometry, Float32BufferAttribute, Color,
    MeshStandardMaterial, Mesh, DoubleSide: Symbol('DoubleSide')
  };
}

function render(model) {
  const context = { THREE: makeThreeStub(), model, result: null };
  vm.createContext(context);
  vm.runInContext(`${extractFunction('makeFoldedCraftVisual')}\nresult = makeFoldedCraftVisual(model);`,
    context, { filename: 'index.html#makeFoldedCraftVisual' });
  return context.result;
}

function visualAxisExtent(visual, axis) {
  const values = visual.children.flatMap(mesh => {
    const positions = [...mesh.geometry.attributes.position.array];
    return positions.filter((value, index) => index % 3 === axis);
  });
  return Math.max(...values) - Math.min(...values);
}

test('flight visual keeps 90 degree and sequential selected-face folds three-dimensional', () => {
  const first = applyPanelFold(createPaperModel(), {
    start: [-1, 0], end: [1, 0], coordinateSpace: 'material',
    direction: 1, targetAngle: 90
  });
  const standing = first.faces.find(face => face.folds.includes('fold-1'));
  const sequential = applyPanelFold(first, {
    start: [0, 0], end: [0, 1], coordinateSpace: 'material',
    direction: 1, targetAngle: 90, seedFaceId: standing.id
  });

  assert.ok(visualAxisExtent(render(first), 1) > 1.3,
    'the rendered standing panel must have flight-space vertical extent');
  assert.ok(visualAxisExtent(render(sequential), 1) > 1.3,
    'the rendered sequential fold must retain flight-space vertical extent');
});

test('flight visual retains the legacy poly-only face fallback', () => {
  const legacy = {
    commands: [{ type: 'fold' }],
    faces: [{ poly: [[-1, -1], [1, -1], [1, 1], [-1, 1]], layer: 2 }]
  };
  const visual = render(legacy);

  assert.equal(visual.children.length, 1);
  assert.ok(visualAxisExtent(visual, 0) > 2.6);
  assert.ok(visualAxisExtent(visual, 2) > 2.6);
});