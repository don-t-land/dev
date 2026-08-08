(function exposeHudPolicy(root, factory) {
  const policy = factory();
  if (typeof module === 'object' && module.exports) module.exports = policy;
  if (root) root.hudPolicy = policy;
})(typeof globalThis === 'object' ? globalThis : this, () => {
  function toggleMinimapMode(mode) {
    return mode === 'local' ? 'full' : 'local';
  }

  function finite(value, fallback) {
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
  }

  function createMinimapView(options = {}) {
    const mode = options.mode === 'local' ? 'local' : 'full';
    const gameMode = options.gameMode === 'ARENA' ? 'ARENA' : 'DIST';
    const player = options.player || {};
    if (mode === 'local') {
      const radius = Math.max(1, finite(options.localRadius, 400));
      return {
        mode, gameMode,
        centerX: finite(player.x, 0),
        centerZ: finite(player.z, 0),
        yaw: finite(player.yaw, 0),
        halfX: radius,
        halfZ: radius
      };
    }

    if (gameMode === 'ARENA') {
      const radius = Math.max(1, finite(options.arenaRadius, 720));
      return { mode, gameMode, centerX: 0, centerZ: 0, yaw: 0, halfX: radius, halfZ: radius };
    }

    const courseHalf = Math.max(1, finite(options.courseHalf, 155));
    const courseLength = Math.max(1, finite(options.courseLength, 7500));
    return {
      mode, gameMode,
      centerX: 0,
      centerZ: -courseLength / 2,
      yaw: 0,
      halfX: courseHalf,
      halfZ: courseLength / 2
    };
  }

  function projectMinimapPoint(point = {}, view, width, height, padding = 0) {
    const safeWidth = Math.max(1, finite(width, 1));
    const safeHeight = Math.max(1, finite(height, 1));
    const safePadding = Math.max(0, finite(padding, 0));
    const usableWidth = Math.max(0, safeWidth - safePadding * 2);
    const usableHeight = Math.max(0, safeHeight - safePadding * 2);
    const dx = finite(point.x, 0) - view.centerX;
    const dz = finite(point.z, 0) - view.centerZ;
    let horizontal = dx;
    let vertical = dz;

    if (view.mode === 'local') {
      const cos = Math.cos(view.yaw);
      const sin = Math.sin(view.yaw);
      horizontal = dx * cos - dz * sin;
      const forward = -dx * sin - dz * cos;
      vertical = -forward;
    }

    const x = safeWidth / 2 + horizontal / view.halfX * usableWidth / 2;
    const y = safeHeight / 2 + vertical / view.halfZ * usableHeight / 2;
    const insideRectangle = x >= safePadding && x <= safeWidth - safePadding &&
      y >= safePadding && y <= safeHeight - safePadding;
    const insideLocalRadius = view.mode !== 'local' ||
      Math.hypot(horizontal / view.halfX, vertical / view.halfZ) <= 1;
    return { x, y, visible: insideRectangle && insideLocalRadius };
  }

  function shouldRenderMinimap({ force = false, coarsePointer = false, compactViewport = false } = {}) {
    return Boolean(force || (!coarsePointer && !compactViewport));
  }

  function approachThermalIntensity(current, target, deltaSeconds) {
    const from = Math.min(1, Math.max(0, finite(current, 0)));
    const to = Math.min(1, Math.max(0, finite(target, 0)));
    const dt = Math.max(0, finite(deltaSeconds, 0));
    if (dt === 0) return from;
    const next = from + (to - from) * (1 - Math.exp(-8 * dt));
    return Math.abs(next - to) < 0.001 ? to : Math.min(1, Math.max(0, next));
  }

  function enqueueBoundedAnnouncement(queue, spec, maxLength = 6) {
    if (!Array.isArray(queue)) throw new TypeError('announcement queue must be an array');
    const limit = Math.max(1, Math.floor(finite(maxLength, 6)));
    while (queue.length >= limit) queue.shift();
    queue.push(spec);
    return queue.length;
  }

  function announcementSpec(kind, pilotName) {
    const pilot = String(pilotName || '').trim() || '조종사';
    if (kind === 'kill') return {
      tone: 'kill', kicker: 'PAPER TORN', title: '격추 확인',
      detail: `${pilot}의 종이비행기를 찢었습니다`, duration: 2800
    };
    if (kind === 'death') return {
      tone: 'death', kicker: 'SHOT DOWN', title: '기체 손실',
      detail: `${pilot}에게 격추되었습니다`, duration: 2800
    };
    return {
      tone: 'join', kicker: 'NEW CONTACT', title: `${pilot} 참전`,
      detail: '새로운 종이비행기가 전장에 진입했습니다', duration: 2400
    };
  }

  function advancePaperFragment(fragment, deltaSeconds) {
    const dt = Math.min(0.05, Math.max(0, finite(deltaSeconds, 0)));
    if (!fragment || dt === 0) return Boolean(fragment && fragment.life > 0 && fragment.position?.y > -2);
    const drag = Math.exp(-1.8 * dt);
    fragment.velocity.x *= drag;
    fragment.velocity.z *= drag;
    fragment.velocity.y = fragment.velocity.y * drag - 12 * dt;
    fragment.position.x += fragment.velocity.x * dt;
    fragment.position.y += fragment.velocity.y * dt;
    fragment.position.z += fragment.velocity.z * dt;
    fragment.rotation.x += fragment.spin.x * dt;
    fragment.rotation.y += fragment.spin.y * dt;
    fragment.rotation.z += fragment.spin.z * dt;
    fragment.life -= dt;
    return fragment.life > 0 && fragment.position.y > -2;
  }

  return {
    toggleMinimapMode, createMinimapView, projectMinimapPoint, shouldRenderMinimap,
    approachThermalIntensity, announcementSpec, enqueueBoundedAnnouncement, advancePaperFragment
  };
});
