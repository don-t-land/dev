(function exposeInputPolicy(root, factory) {
  const policy = factory();
  if (typeof module === 'object' && module.exports) module.exports = policy;
  if (root) root.inputPolicy = policy;
})(typeof globalThis === 'object' ? globalThis : this, () => {
  const gameKeyCodes = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space']);

  function isEditableTarget(target) {
    if (!target || typeof target !== 'object') return false;
    if (target.isContentEditable) return true;

    const tagName = typeof target.tagName === 'string' ? target.tagName.toUpperCase() : '';
    return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';
  }

  function shouldCaptureGameKey(event) {
    return gameKeyCodes.has(event?.code) && !isEditableTarget(event?.target);
  }

  return { shouldCaptureGameKey, isEditableTarget };
});
