(function exposeMobileControls(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.mobileControls = api;
})(typeof globalThis === 'object' ? globalThis : this, () => {
  const CONTROL_CODES = new Set([
    'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'Space'
  ]);

  function createCombinedKeyState(keyboard, touch) {
    return new Proxy({}, {
      get(_target, code) {
        if (typeof code !== 'string') return undefined;
        return !!keyboard[code] || !!touch[code];
      }
    });
  }

  function createTouchKeyState(touch, options = {}) {
    const pointers = new Map();
    const counts = new Map();

    function press(pointerId, code) {
      if (!CONTROL_CODES.has(code)) return false;
      if (pointers.has(pointerId)) release(pointerId);

      const count = counts.get(code) || 0;
      pointers.set(pointerId, code);
      counts.set(code, count + 1);
      touch[code] = true;
      if (count === 0) {
        options.onChange?.(code, true);
        options.onPress?.(code);
      }
      return true;
    }

    function release(pointerId) {
      const code = pointers.get(pointerId);
      if (!code) return false;

      pointers.delete(pointerId);
      const count = (counts.get(code) || 1) - 1;
      if (count > 0) {
        counts.set(code, count);
      } else {
        counts.delete(code);
        touch[code] = false;
        options.onChange?.(code, false);
      }
      return true;
    }

    function clear() {
      for (const pointerId of [...pointers.keys()]) release(pointerId);
    }

    return {
      press,
      release,
      clear,
      isPointerActive: pointerId => pointers.has(pointerId)
    };
  }

  return { CONTROL_CODES, createCombinedKeyState, createTouchKeyState };
});
