export const TIER_GROUPS = [
  { label: 'Bronze',   ids: [1, 2, 3] },
  { label: 'Silver',   ids: [4, 5, 6] },
  { label: 'Gold',     ids: [7, 8, 9] },
  { label: 'Diamond',  ids: [10, 11, 12] },
  { label: 'Mythic',   ids: [13, 14, 15] },
  { label: 'Legendary', ids: [16, 17, 18] },
  { label: 'Masters',  ids: [19] },
];

export function buildTrophyRanges(minTrophies) {
  const min = Number(minTrophies) || 750;
  return [
    { label: `${min}-999`, min, max: 999 },
    { label: '1000+', min: 1000, max: null },
  ];
}

export function filterByTimeRange(matches, range) {
  if (!range || range === 'all') return matches;
  const now = Date.now();
  const ms = {
    '1d': 86400000,
    '7d': 604800000,
    '30d': 2592000000,
    '90d': 7776000000,
  }[range];
  if (!ms) return matches;
  const cutoff = new Date(now - ms);
  return matches.filter(m => new Date(m.date) >= cutoff);
}

export function filterByLevel(matches, draftType, { levelMin, levelMax, selectedTiers } = {}) {
  if (draftType === 'normal') {
    if (levelMin == null && levelMax == null) return matches;
    return matches.filter(m => {
      const t = m.my_brawler_trophies;
      if (t == null) return true;
      if (levelMin != null && t < levelMin) return false;
      if (levelMax != null && t > levelMax) return false;
      return true;
    });
  }
  if (draftType === 'ranked') {
    if (!selectedTiers || selectedTiers.length === 0) return matches;
    return matches.filter(m => {
      const t = m.my_brawler_trophies;
      if (t == null) return false;
      return selectedTiers.includes(t);
    });
  }
  return matches;
}
