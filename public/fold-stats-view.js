(function exposeFoldStatsView(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.foldStatsView = api;
})(typeof globalThis === 'object' ? globalThis : this, () => {
  'use strict';

  const DELTA_EPSILON = 1e-6;
  const ROLL_BALANCED = 0.05;

  const ROWS = [
    { key: 'maxSpeed', label: '최고속도', min: 38, max: 72, goodWhen: 'high' },
    { key: 'liftScale', label: '양력', min: 0.15, max: 1.8, goodWhen: 'high' },
    { key: 'dragScale', label: '항력', min: 0.25, max: 2.2, goodWhen: 'low' },
    { key: 'rollRateScale', label: '선회력', min: 0.68, max: 1.42, goodWhen: 'high' },
    { key: 'stability', label: '안정성', min: 0.2, max: 1.25, goodWhen: 'high' },
    { key: 'stallSpeed', label: '실속속도', min: 8, max: 42, goodWhen: 'low' },
    { key: 'rollBias', label: '좌우균형', min: -0.65, max: 0.65, goodWhen: 'center' }
  ];

  function clamp01(value) {
    return Math.max(0, Math.min(1, value));
  }

  function rowText(row, value) {
    if (row.key === 'rollBias') {
      if (Math.abs(value) <= ROLL_BALANCED) return '균형';
      const side = value < 0 ? '좌' : '우';
      return `${side} ${Math.round(Math.abs(value) / row.max * 100)}%`;
    }
    if (row.key === 'maxSpeed') return `${Math.round(value * 3.6)} km/h`;
    if (row.key === 'stallSpeed') return `${Math.round(value)} m/s`;
    return `${Math.round(value * 100)}%`;
  }

  function buildStatsRows(profile, previousProfile) {
    if (!profile) return [];
    return ROWS.map(row => {
      const value = Number(profile[row.key]) || 0;
      const ratio = clamp01((value - row.min) / (row.max - row.min));
      const previous = previousProfile ? Number(previousProfile[row.key]) || 0 : null;
      const delta = previous === null || Math.abs(value - previous) < DELTA_EPSILON
        ? 'same'
        : value > previous ? 'up' : 'down';
      const good = row.goodWhen === 'center'
        ? Math.abs(value) <= ROLL_BALANCED
        : row.goodWhen === 'high' ? ratio >= 0.4 : ratio <= 0.6;
      return {
        key: row.key,
        label: row.label,
        percent: Math.round(ratio * 100),
        text: rowText(row, value),
        delta,
        good
      };
    });
  }

  return { buildStatsRows };
});
