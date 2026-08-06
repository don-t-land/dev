const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const paperFoldModel = require('../public/paper-fold-model.js');

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(value) { this.values.add(value); }
  remove(value) { this.values.delete(value); }
  toggle(value, force) {
    if (force === undefined ? !this.values.has(value) : force) this.values.add(value);
    else this.values.delete(value);
  }
}

class FakeElement {
  constructor(id = '') {
    this.id = id;
    this.listeners = new Map();
    this.classList = new FakeClassList();
    this.dataset = {};
    this.attributes = new Map();
    this.children = [];
    this.textContent = '';
    this.disabled = false;
    this.width = 0;
    this.height = 0;
  }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(listener);
  }
  dispatch(type, init = {}) {
    const event = {
      target: this,
      preventDefault() { this.defaultPrevented = true; },
      ...init
    };
    for (const listener of this.listeners.get(type) || []) listener(event);
    return event;
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 320, height: 320 }; }
  getContext() { return { setTransform() {} }; }
  setPointerCapture() {}
  closest() { return null; }
}

function makeHarness() {
  const ids = [
    'fold-paper-canvas', 'fold-selection', 'fold-status', 'fold-count', 'fold-side',
    'fold-history', 'fold-dir-valley', 'fold-dir-mountain', 'fold-angle-90',
    'fold-angle-180', 'fold-flip-btn', 'fold-undo-btn', 'fold-complete-btn',
    'folding-screen', 'fold-timer'
  ];
  const elements = Object.fromEntries(ids.map(id => [id, new FakeElement(id)]));
  const document = {
    readyState: 'complete',
    getElementById: id => elements[id] || null,
    querySelectorAll: () => [],
    createElement: () => new FakeElement()
  };
  const raf = [];
  const viewport = {
    DEFAULT_CAMERA: {},
    DEFAULT_ORBIT: { azimuth: -0.8, elevation: 0.55 },
    cameraBasisFromOrbit(azimuth, elevation) {
      const safeElevation = Math.max(0.08, Math.min(1.45, elevation));
      return {
        right: [Math.cos(azimuth), Math.sin(azimuth), 0],
        up: [0, 0, 1],
        view: [-Math.sin(azimuth), Math.cos(azimuth), safeElevation],
        azimuth,
        elevation: safeElevation
      };
    },
    faceNormal: () => [0, 0, 1],
    pointInPolygon: () => true,
    hitTestFaces: faces => ({ face: faces[0], material: [-1, 0] }),
    screenToMaterial: (_face, point) => point[0] < 50 ? [-1, 0] : [1, 0],
    materialToScreen: (_face, point) => point,
    projectFace: face => ({
      face, points: [[0, 0], [100, 0], [100, 100], [0, 100]], depth: 0, facing: 1
    })
  };
  const window = {
    document,
    paperFoldModel,
    paperFoldViewport: viewport,
    devicePixelRatio: 1,
    requestAnimationFrame(callback) { raf.push(callback); return raf.length; },
    cancelAnimationFrame() {},
    addEventListener() {},
    performance: { now: () => 0 }
  };
  const context = { window, document, console };
  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, '../public/paper-fold-ui.js'), 'utf8');
  vm.runInContext(source, context, { filename: 'paper-fold-ui.js' });
  return { elements, stage: window.paperFoldingStage, raf, viewport };
}

test('completing during fold animation serializes the selected final angle, never preview zero', () => {
  const { elements, stage } = makeHarness();
  let completion;
  stage.enter({ ends: Date.now() + 60_000, onComplete: payload => { completion = payload; } });

  elements['fold-paper-canvas'].dispatch('pointerdown', { clientX: 10, clientY: 10, pointerId: 1 });
  elements['fold-paper-canvas'].dispatch('pointerup', { clientX: 100, clientY: 10, pointerId: 1 });
  elements['fold-complete-btn'].dispatch('click');

  const commands = JSON.parse(completion.commands);
  assert.equal(commands.length, 1);
  assert.equal(commands[0].targetAngle, 90);
  assert.equal(stage.getModel().commands[0].targetAngle, 90);
});

test('canvas keyboard selection and H/V/D/Enter creases create folds without pointer input', () => {
  const shortcuts = [
    ['ArrowLeft', 'h'],
    ['ArrowRight', 'v'],
    ['ArrowLeft', 'd'],
    ['ArrowRight', 'Enter']
  ];

  for (const [selectionKey, foldKey] of shortcuts) {
    const { elements, stage } = makeHarness();
    stage.enter({ ends: Date.now() + 60_000 });

    const selectionEvent = elements['fold-paper-canvas'].dispatch('keydown', { key: selectionKey });
    const foldEvent = elements['fold-paper-canvas'].dispatch('keydown', { key: foldKey });

    assert.equal(selectionEvent.defaultPrevented, true, selectionKey);
    assert.equal(foldEvent.defaultPrevented, true, foldKey);
    assert.match(elements['fold-selection'].textContent, /면 \d+/);
    assert.equal(stage.getModel().commands.filter(command => command.type === 'fold').length, 1);
    assert.equal(stage.getModel().commands[0].targetAngle, 90);
    assert.match(elements['fold-status'].textContent, /90°/);
  }
});

test('middle-button drag orbits around the paper without creating a fold', () => {
  const { elements, stage } = makeHarness();
  const canvas = elements['fold-paper-canvas'];
  stage.enter({ ends: Date.now() + 60_000 });
  const initial = stage.getViewState();

  const down = canvas.dispatch('pointerdown', {
    button: 1, buttons: 4, clientX: 290, clientY: 290, pointerId: 7
  });
  canvas.dispatch('pointermove', {
    button: 1, buttons: 4, clientX: 230, clientY: 250, pointerId: 99
  });
  assert.deepEqual(stage.getViewState(), initial, 'another pointer must not move the camera');
  canvas.dispatch('pointermove', {
    button: 1, buttons: 4, clientX: 230, clientY: 250, pointerId: 7
  });
  canvas.dispatch('pointerup', {
    button: 1, buttons: 0, clientX: 230, clientY: 250, pointerId: 7
  });

  assert.equal(down.defaultPrevented, true);
  assert.notDeepEqual(stage.getViewState(), initial);
  assert.equal(stage.getModel().commands.length, 0);

  canvas.dispatch('pointerdown', { button: 0, clientX: 10, clientY: 10, pointerId: 8 });
  canvas.dispatch('pointerup', { button: 0, clientX: 100, clientY: 10, pointerId: 8 });
  assert.equal(stage.getModel().commands.filter(command => command.type === 'fold').length, 1);
});

test('cancelling a middle-button orbit stops later pointer movement', () => {
  const { elements, stage } = makeHarness();
  const canvas = elements['fold-paper-canvas'];
  stage.enter({ ends: Date.now() + 60_000 });
  canvas.dispatch('pointerdown', {
    button: 1, buttons: 4, clientX: 160, clientY: 160, pointerId: 12
  });
  canvas.dispatch('pointercancel', { pointerId: 12 });
  const cancelled = stage.getViewState();
  canvas.dispatch('pointermove', {
    button: 1, buttons: 4, clientX: 20, clientY: 20, pointerId: 12
  });

  assert.deepEqual(stage.getViewState(), cancelled);
  assert.equal(stage.getModel().commands.length, 0);
});
