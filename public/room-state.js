(function exposeRoomStatePolicy(root, factory) {
  const policy = factory();
  if (typeof module === 'object' && module.exports) module.exports = policy;
  if (root) root.roomStatePolicy = policy;
})(typeof globalThis === 'object' ? globalThis : this, () => {
  function getLocalRoundRole(room, playerId) {
    const order = Array.isArray(room?.order) ? room.order : [];
    if (!order.includes(playerId)) return 'spectator';

    const players = Array.isArray(room?.players) ? room.players : [];
    const player = players.find(item => item?.id === playerId);
    return player?.alive ? 'active' : 'crashed';
  }

  function shouldShowResults(room, playerId) {
    if (room?.phase !== 'results') return false;
    const order = Array.isArray(room.order) ? room.order : [];
    const readyIds = Array.isArray(room.readyIds) ? room.readyIds : [];
    return order.includes(playerId) && !readyIds.includes(playerId);
  }

  return { getLocalRoundRole, shouldShowResults };
});
