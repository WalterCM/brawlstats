export const deduplicateMaps = (mapList) => {
  const seen = new Set();
  return mapList.filter(m => {
    const key = `${m.name.trim().toLowerCase()}-${m.mode.trim().toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const getMapName = (maps, id) => {
  const found = maps.find(m => String(m.id) === String(id));
  return found ? found.name : id;
};

export const getBrawlerName = (brawlers, id) => {
  const found = brawlers.find(b => String(b.id) === String(id));
  return found ? found.name : id;
};

export const getBrawlerAvatar = (brawlers, id) => {
  const found = brawlers.find(b => String(b.id) === String(id));
  return found ? found.image_url : '';
};

export const getModeIcon = (mode) => {
  if (!mode) return '⚔️';
  const normalized = mode.toLowerCase().replace(/[^a-z0-9]/g, '');
  const icons = {
    bounty: '⭐',
    brawlball: '⚽',
    gemgrab: '💎',
    heist: '💰',
    hotzone: '🔥',
    knockout: '💀',
    showdown: '🌵',
    soloshowdown: '🌵',
    duoshowdown: '👥'
  };
  return icons[normalized] || '⚔️';
};

export const RANKS = [
  { id: 1,  name: 'Bronze I' },
  { id: 2,  name: 'Bronze II' },
  { id: 3,  name: 'Bronze III' },
  { id: 4,  name: 'Silver I' },
  { id: 5,  name: 'Silver II' },
  { id: 6,  name: 'Silver III' },
  { id: 7,  name: 'Gold I' },
  { id: 8,  name: 'Gold II' },
  { id: 9,  name: 'Gold III' },
  { id: 10, name: 'Diamond I' },
  { id: 11, name: 'Diamond II' },
  { id: 12, name: 'Diamond III' },
  { id: 13, name: 'Mythic I' },
  { id: 14, name: 'Mythic II' },
  { id: 15, name: 'Mythic III' },
  { id: 16, name: 'Legendary I' },
  { id: 17, name: 'Legendary II' },
  { id: 18, name: 'Legendary III' },
  { id: 19, name: 'Masters' },
];

export const getRankById = (id) => {
  const numId = Number(id);
  return RANKS.find(r => r.id === numId) || null;
};

export const getRankIconUrl = (rankId) => {
  const numId = Number(rankId);
  if (numId < 1 || numId > 19) return '';
  const assetId = 58000000 + (numId - 1);
  return `https://cdn.brawlify.com/ranked/tiered/${assetId}.png`;
};
