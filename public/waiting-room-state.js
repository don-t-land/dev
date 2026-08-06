(function exposeWaitingRoomStatePolicy(root, factory) {
  const policy = factory();
  if (typeof module === 'object' && module.exports) module.exports = policy;
  if (root) root.waitingRoomStatePolicy = policy;
})(typeof globalThis === 'object' ? globalThis : this, () => {
  function getPlayers(room) {
    return Array.isArray(room?.players) ? room.players : [];
  }

  function getWaitingRole(room, playerId) {
    const player = getPlayers(room).find(item => item?.id === playerId);
    if (!player) return 'empty';
    return room?.hostId === playerId ? 'host' : 'client';
  }

  function getWaitingSlots(room, size = 4) {
    const slotCount = Number.isFinite(size) ? Math.max(0, Math.floor(size)) : 4;
    const players = getPlayers(room);

    return Array.from({ length: slotCount }, (_, index) => {
      const player = players[index] || null;
      return {
        index,
        player,
        role: player ? getWaitingRole(room, player.id) : 'empty',
        ready: Boolean(player?.ready)
      };
    });
  }

  function areAllPlayersReady(room) {
    const players = getPlayers(room);
    return players.length > 0 && players.every(player => Boolean(player?.ready));
  }

  function canStart(room, playerId) {
    if (room?.phase !== 'waiting' || getWaitingRole(room, playerId) !== 'host') return false;
    return areAllPlayersReady(room);
  }

  function getLocalReady(room, playerId) {
    const player = getPlayers(room).find(item => item?.id === playerId);
    return Boolean(player?.ready);
  }

  return {
    getWaitingRole,
    getWaitingSlots,
    areAllPlayersReady,
    canStart,
    getLocalReady
  };
});
