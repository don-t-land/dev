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

  function approachDashIntensity(current, target, deltaSeconds) {
    const from = Math.min(1, Math.max(0, finite(current, 0)));
    const to = Math.min(1, Math.max(0, finite(target, 0)));
    const dt = Math.max(0, finite(deltaSeconds, 0));
    if (dt === 0) return from;
    const response = to > from ? 14 : 7;
    const next = from + (to - from) * (1 - Math.exp(-response * dt));
    return Math.abs(next - to) < 0.001 ? to : Math.min(1, Math.max(0, next));
  }

  function enqueueBoundedAnnouncement(queue, spec, maxLength = 6) {
    if (!Array.isArray(queue)) throw new TypeError('announcement queue must be an array');
    const limit = Math.max(1, Math.floor(finite(maxLength, 6)));
    while (queue.length >= limit) queue.shift();
    queue.push(spec);
    return queue.length;
  }

  function respawnPresentation(byName, survivedSeconds) {
    const attacker = typeof byName === 'string' ? byName.trim() : '';
    const survived = Math.max(0, Math.floor(Number(survivedSeconds) || 0));
    return attacker
      ? {
          kicker: 'SHOT DOWN',
          title: '격추되었습니다',
          detail: `${attacker} 님에게 격추 · 이번 생존 ${survived}초`
        }
      : {
          kicker: 'COLLISION',
          title: '충돌했습니다',
          detail: `지형과 충돌 · 이번 생존 ${survived}초`
        };
  }

  function authoritativeCrashAction({ localPlayer, alive, live, respawnOpen } = {}) {
    if (!localPlayer) return null;
    if (alive) return live ? 'die-and-show' : 'die';
    return live && respawnOpen ? 'reconcile' : null;
  }

  function createRespawnRetryController(options = {}) {
    const send = typeof options.send === 'function' ? options.send : () => {};
    const schedule = typeof options.schedule === 'function' ? options.schedule : setTimeout;
    const cancelSchedule = typeof options.cancelSchedule === 'function' ? options.cancelSchedule : clearTimeout;
    const onStatus = typeof options.onStatus === 'function' ? options.onStatus : () => {};
    const onExhausted = typeof options.onExhausted === 'function' ? options.onExhausted : () => {};
    const createRequestId = typeof options.createRequestId === 'function'
      ? options.createRequestId
      : () => globalThis.crypto?.randomUUID?.()
        || `respawn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const retryDelayMs = Math.max(0, finite(options.retryDelayMs, 700));
    const maxRetries = Math.max(0, Math.floor(finite(options.maxRetries, 3)));
    let active = false;
    let retries = 0;
    let timer = null;
    let generation = 0;
    let requestId = null;

    function clearTimer() {
      if (timer === null) return;
      cancelSchedule(timer);
      timer = null;
    }

    function request() {
      if (!active) return;
      onStatus(retries === 0 ? '부활 요청 중…' : `부활 재시도 중… (${retries}/${maxRetries})`);
      send({ t: 'spawn', requestId });
    }

    function cancel() {
      clearTimer();
      active = false;
      requestId = null;
      generation += 1;
    }

    function matches(candidateRequestId) {
      return active && typeof candidateRequestId === 'string' && candidateRequestId === requestId;
    }

    return {
      get active() { return active; },
      matches,
      start() {
        cancel();
        active = true;
        retries = 0;
        requestId = String(createRequestId()).slice(0, 64);
        request();
      },
      handleError(code, candidateRequestId) {
        if (!matches(candidateRequestId) || code !== 'RESPAWN_COOLDOWN') return false;
        clearTimer();
        if (retries >= maxRetries) {
          active = false;
          onExhausted(code);
          return true;
        }
        retries += 1;
        onStatus(`부활 재시도 대기 중… (${retries}/${maxRetries})`);
        const scheduledGeneration = generation;
        timer = schedule(() => {
          if (scheduledGeneration !== generation) return;
          timer = null;
          request();
        }, retryDelayMs);
        return true;
      },
      succeed: cancel,
      cancel
    };
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
    approachThermalIntensity, approachDashIntensity, announcementSpec, enqueueBoundedAnnouncement,
    respawnPresentation, authoritativeCrashAction, advancePaperFragment,
    createRespawnRetryController
  };
});
