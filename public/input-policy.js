(function exposeInputPolicy(root, factory) {
  const policy = factory();
  if (typeof module === 'object' && module.exports) module.exports = policy;
  if (root) root.inputPolicy = policy;
})(typeof globalThis === 'object' ? globalThis : this, () => {
  const gameKeyCodes = new Set([
    'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyC', 'KeyN', 'Space', 'ShiftLeft', 'ShiftRight'
  ]);

  function isEditableTarget(target) {
    if (!target || typeof target !== 'object') return false;
    if (target.isContentEditable) return true;

    const tagName = typeof target.tagName === 'string' ? target.tagName.toUpperCase() : '';
    return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';
  }

  function shouldCaptureGameKey(event) {
    return gameKeyCodes.has(event?.code) && !isEditableTarget(event?.target);
  }

  function pauseMenuAction({ code, repeat = false, pauseOpen = false, editable = false } = {}) {
    if (code !== 'Escape' || repeat) return null;
    if (!pauseOpen && editable) return null;
    return pauseOpen ? 'resume' : 'open';
  }

  function modalSpaceAction({ code, repeat = false, modalOpen = false, editable = false } = {}) {
    if (code !== 'Space' || repeat || !modalOpen || editable) return null;
    return 'activate';
  }

  function pointerLockAction({
    pointerLocked = false,
    gameplay = false,
    pauseOpen = false,
    respawnOpen = false,
    resultsOpen = false,
    suppressPauseOpen = false
  } = {}) {
    const blockingModalOpen = pauseOpen || respawnOpen || resultsOpen;
    if (pointerLocked && blockingModalOpen) return 'release';
    if (!pointerLocked && gameplay && !blockingModalOpen && !suppressPauseOpen) return 'open-pause';
    return null;
  }

  return {
    shouldCaptureGameKey, isEditableTarget, pauseMenuAction, modalSpaceAction, pointerLockAction
  };
});
