(function exposeHomeScreen(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.homeScreen = api;
})(typeof globalThis === 'object' ? globalThis : this, () => {
  const homeModes = Object.freeze([
    Object.freeze({ id: 'distance', label: '멀리 날기', description: '끝없이 펼쳐진 하늘을 향해' }),
    Object.freeze({ id: 'survival', label: '오래 날기', description: '구름 위에서 가장 오래 버티기' })
  ]);

  function initializeHomeScreen(screen = typeof document === 'undefined' ? null : document.getElementById('home-screen')) {
    if (!screen || screen.dataset.initialized === 'true') return;
    screen.dataset.initialized = 'true';

    screen.addEventListener('pointermove', event => {
      const bounds = screen.getBoundingClientRect();
      const x = ((event.clientX - bounds.left) / bounds.width - 0.5).toFixed(3);
      const y = ((event.clientY - bounds.top) / bounds.height - 0.5).toFixed(3);
      screen.style.setProperty('--home-pointer-x', x);
      screen.style.setProperty('--home-pointer-y', y);
    }, { passive: true });

    screen.addEventListener('pointerleave', () => {
      screen.style.setProperty('--home-pointer-x', '0');
      screen.style.setProperty('--home-pointer-y', '0');
    });
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => initializeHomeScreen(), { once: true });
    else initializeHomeScreen();
  }

  return { homeModes, initializeHomeScreen };
});
