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
