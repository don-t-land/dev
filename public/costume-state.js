(function exposeCostumeState(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.costumeState = api;
})(typeof globalThis === 'object' ? globalThis : this, () => {
  const STORAGE_KEY = 'pp_costume';
  const HATS = Object.freeze(['none', 'santa', 'magic', 'police']);
  const NOSES = Object.freeze(['none', 'rudolph']);
  const DEFAULT_COSTUME = Object.freeze({ hat: 'none', nose: 'none' });

  function normalize(value) {
    let candidate = value;
    if (typeof candidate === 'string') {
      try { candidate = JSON.parse(candidate); } catch { candidate = null; }
    }
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      return { ...DEFAULT_COSTUME };
    }
    return {
      hat: HATS.includes(candidate.hat) ? candidate.hat : DEFAULT_COSTUME.hat,
      nose: NOSES.includes(candidate.nose) ? candidate.nose : DEFAULT_COSTUME.nose
    };
  }

  function serialize(value) {
    return JSON.stringify(normalize(value));
  }

  function load(storage = typeof localStorage === 'object' ? localStorage : null) {
    if (!storage?.getItem) return { ...DEFAULT_COSTUME };
    return normalize(storage.getItem(STORAGE_KEY));
  }

  function save(value, storage = typeof localStorage === 'object' ? localStorage : null) {
    const costume = normalize(value);
    storage?.setItem?.(STORAGE_KEY, JSON.stringify(costume));
    return costume;
  }

  return { STORAGE_KEY, HATS, NOSES, DEFAULT_COSTUME, normalize, serialize, load, save };
});
