const assert = require('node:assert/strict');
const { test } = require('node:test');

const {
  createCombinedKeyState,
  createTouchKeyState,
  createTouchLookState
} = require('../public/mobile-controls.js');

test('mobile multi-touch keys compose with keyboard input and release independently', () => {
  const keyboard = { KeyW: true };
  const touch = {};
  const changes = [];
  const active = createCombinedKeyState(keyboard, touch);
  const controls = createTouchKeyState(touch, {
    onChange: (code, pressed) => changes.push([code, pressed])
  });

  controls.press(11, 'KeyA');
  controls.press(12, 'ShiftLeft');

  assert.equal(active.KeyW, true);
  assert.equal(active.KeyA, true);
  assert.equal(active.ShiftLeft, true);

  controls.release(11);
  assert.equal(active.KeyA, false);
  assert.equal(active.ShiftLeft, true);
  assert.equal(active.KeyW, true);

  keyboard.KeyW = false;
  assert.equal(active.KeyW, false);
  assert.deepEqual(changes, [
    ['KeyA', true],
    ['ShiftLeft', true],
    ['KeyA', false]
  ]);
});

test('duplicate pointers keep a key pressed until the last pointer releases and clear resets all keys', () => {
  const touch = {};
  const pressed = [];
  const controls = createTouchKeyState(touch, {
    onPress: code => pressed.push(code)
  });

  controls.press(1, 'Space');
  controls.press(2, 'Space');
  assert.equal(controls.isPointerActive(1), true);
  controls.release(1);
  assert.equal(controls.isPointerActive(1), false);
  assert.equal(touch.Space, true);
  assert.deepEqual(pressed, ['Space']);

  controls.press(3, 'KeyD');
  controls.clear();
  assert.equal(touch.Space, false);
  assert.equal(touch.KeyD, false);
});

test('one touch pointer owns screen-look drag and releases without affecting other touches', () => {
  const moves = [];
  const look = createTouchLookState({
    onMove: (movementX, movementY) => moves.push([movementX, movementY])
  });

  assert.equal(look.start(21, 100, 120), true);
  assert.equal(look.start(22, 30, 40), false);
  assert.equal(look.move(22, 50, 60), false);
  assert.equal(look.move(21, 124, 102), true);
  assert.equal(look.move(21, 130, 110), true);
  assert.deepEqual(moves, [[24, -18], [6, 8]]);

  assert.equal(look.end(22), false);
  assert.equal(look.end(21), true);
  assert.equal(look.move(21, 160, 160), false);
  assert.equal(look.isActive(), false);
});
