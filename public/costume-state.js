(function exposeCostumeState(root, factory) {
  const templates = typeof module === 'object' && module.exports
    ? require('./costume-template.js')
    : root?.costumeTemplates;
  const api = factory(templates);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.costumeState = api;
})(typeof globalThis === 'object' ? globalThis : this, templates => {
  const STORAGE_KEY = 'pp_costume';
  const HATS = templates?.OPTIONS_BY_SLOT?.hat || Object.freeze(['none', 'santa', 'magic', 'police']);
  const NOSES = templates?.OPTIONS_BY_SLOT?.nose || Object.freeze(['none', 'rudolph']);
  const WINGS = templates?.OPTIONS_BY_SLOT?.wings || Object.freeze(['none', 'twin-jets']);
  const DEFAULT_COSTUME = templates?.DEFAULT_COSTUME || Object.freeze({ hat: 'none', nose: 'none', wings: 'none' });

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
      nose: NOSES.includes(candidate.nose) ? candidate.nose : DEFAULT_COSTUME.nose,
      wings: WINGS.includes(candidate.wings) ? candidate.wings : DEFAULT_COSTUME.wings
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

  return { STORAGE_KEY, HATS, NOSES, WINGS, DEFAULT_COSTUME, normalize, serialize, load, save };
});
