(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.arenaMinimap = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function finite(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function projectArenaPoint(position, arenaRadius) {
    const x = finite(position?.x);
    const z = finite(position?.z);
    const radius = finite(arenaRadius);
    if (x === null || z === null || radius === null || radius <= 0) return null;
    const nx = x / radius;
    const nz = z / radius;
    const distance = Math.hypot(nx, nz);
    const scale = distance > 1 ? 1 / distance : 1;
    return {
      x: nx * scale,
      z: nz * scale,
      outside: distance > 1
    };
  }

  function createArenaMinimapFrame(options = {}) {
    const empty = { visible: false, local: null, players: [], rings: [], thermals: [] };
    if (options.mode !== 'ARENA') return empty;
    const radius = finite(options.arenaRadius);
    if (radius === null || radius <= 0) return empty;

    const localPoint = projectArenaPoint(options.local, radius);
    const yaw = finite(options.local?.yaw) ?? 0;
    const local = localPoint ? {
      ...localPoint,
      yaw,
      alive: options.local?.alive !== false
    } : null;

    const players = (Array.isArray(options.players) ? options.players : [])
      .filter(player => player?.alive === true && player?.seen === true)
      .map(player => {
        const point = projectArenaPoint(player, radius);
        return point ? { id: player.id, ...point, alive: true, seen: true } : null;
      })
      .filter(Boolean);

    const rings = (Array.isArray(options.rings) ? options.rings : [])
      .filter(ring => ring?.taken !== true)
      .map(ring => projectArenaPoint(ring, radius))
      .filter(Boolean);

    const thermals = (Array.isArray(options.thermals) ? options.thermals : [])
      .map(thermal => projectArenaPoint(thermal, radius))
      .filter(Boolean);

    return { visible: true, local, players, rings, thermals };
  }

  function canvasPoint(point, center, radius) {
    return {
      x: center.x + point.x * radius,
      y: center.y + point.z * radius
    };
  }

  function drawArenaMinimap(canvas, frame) {
    const context = canvas?.getContext?.('2d');
    if (!context) return false;
    const width = Number(canvas.width) || 0;
    const height = Number(canvas.height) || 0;
    context.clearRect(0, 0, width, height);
    if (!frame?.visible || width <= 0 || height <= 0) return false;

    const center = { x: width / 2, y: height / 2 };
    const radius = Math.max(1, Math.min(width, height) * 0.42);
    const markerPoint = point => canvasPoint(point, center, radius);

    context.save();
    context.beginPath();
    context.arc(center.x, center.y, radius, 0, Math.PI * 2);
    context.fillStyle = 'rgba(5, 19, 34, .84)';
    context.fill();
    context.clip();

    context.strokeStyle = 'rgba(182, 220, 245, .12)';
    context.lineWidth = 1;
    context.setLineDash([4, 6]);
    for (const ratio of [0.5]) {
      context.beginPath();
      context.arc(center.x, center.y, radius * ratio, 0, Math.PI * 2);
      context.stroke();
    }
    context.setLineDash([]);
    context.beginPath();
    context.moveTo(center.x - radius, center.y);
    context.lineTo(center.x + radius, center.y);
    context.moveTo(center.x, center.y - radius);
    context.lineTo(center.x, center.y + radius);
    context.stroke();

    for (const thermal of frame.thermals || []) {
      const point = markerPoint(thermal);
      context.beginPath();
      context.arc(point.x, point.y, 5, 0, Math.PI * 2);
      context.fillStyle = 'rgba(110, 231, 183, .28)';
      context.fill();
      context.strokeStyle = '#6ee7b7';
      context.stroke();
    }

    for (const ring of frame.rings || []) {
      const point = markerPoint(ring);
      context.beginPath();
      context.moveTo(point.x, point.y - 5);
      context.lineTo(point.x + 5, point.y);
      context.lineTo(point.x, point.y + 5);
      context.lineTo(point.x - 5, point.y);
      context.closePath();
      context.fillStyle = '#ffc861';
      context.fill();
    }

    for (const player of frame.players || []) {
      const point = markerPoint(player);
      context.beginPath();
      context.arc(point.x, point.y, 4.5, 0, Math.PI * 2);
      context.fillStyle = '#ff7368';
      context.fill();
      context.strokeStyle = 'rgba(255,255,255,.9)';
      context.lineWidth = 1.5;
      context.stroke();
    }

    if (frame.local) {
      const point = markerPoint(frame.local);
      context.beginPath();
      context.arc(point.x, point.y, 11, 0, Math.PI * 2);
      context.fillStyle = 'rgba(124, 232, 255, .18)';
      context.fill();
      context.beginPath();
      context.arc(point.x, point.y, 8, 0, Math.PI * 2);
      context.strokeStyle = 'rgba(124, 232, 255, .8)';
      context.lineWidth = 2;
      context.stroke();
      const forward = { x: -Math.sin(frame.local.yaw || 0), y: -Math.cos(frame.local.yaw || 0) };
      const side = { x: -forward.y, y: forward.x };
      context.beginPath();
      context.moveTo(point.x + forward.x * 8, point.y + forward.y * 8);
      context.lineTo(point.x - forward.x * 5 + side.x * 5, point.y - forward.y * 5 + side.y * 5);
      context.lineTo(point.x - forward.x * 5 - side.x * 5, point.y - forward.y * 5 - side.y * 5);
      context.closePath();
      context.fillStyle = frame.local.alive ? '#7ce8ff' : 'rgba(124,232,255,.45)';
      context.fill();
      context.strokeStyle = '#ffffff';
      context.lineWidth = 1.5;
      context.stroke();
    }
    context.restore();

    context.beginPath();
    context.arc(center.x, center.y, radius, 0, Math.PI * 2);
    context.strokeStyle = 'rgba(255, 139, 126, .85)';
    context.lineWidth = 3;
    context.stroke();
    return true;
  }

  return { createArenaMinimapFrame, drawArenaMinimap, projectArenaPoint };
});
