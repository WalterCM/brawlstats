const API_BASE_URL = 'http://localhost:8000/api';

// Simple state to store the active user metadata locally
let activeUser = {
  id: 'walter-supabase-uid-999',
  name: 'Walter'
};

export const setGlobalActiveUser = (id, name) => {
  activeUser.id = id;
  activeUser.name = name;
};

export const getGlobalActiveUser = () => {
  return activeUser;
};

const getAuthHeaders = () => {
  return {
    'Content-Type': 'application/json',
    'X-Supabase-User-Id': activeUser.id,
    'X-Supabase-User-Name': activeUser.name
  };
};

export const api = {
  // Fetch active player profile context
  async fetchMe() {
    const res = await fetch(`${API_BASE_URL}/players/me/`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Failed to fetch player profile');
    return res.json();
  },

  // Fetch the Brawler Catalog
  async fetchBrawlers() {
    const res = await fetch(`${API_BASE_URL}/brawlers/`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Failed to fetch brawlers');
    return res.json();
  },

  // Fetch the Maps Catalog
  async fetchMaps(isRanked = true) {
    const res = await fetch(`${API_BASE_URL}/maps/?is_ranked=${isRanked}`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Failed to fetch maps');
    return res.json();
  },

  // Fetch active suggestions based on picks/bans
  async fetchSuggestions(mapId, alliesPicked, enemiesPicked, alliesBanned, enemiesBanned) {
    const res = await fetch(`${API_BASE_URL}/draft/suggest/`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        map_id: mapId,
        allies_picked: alliesPicked,
        enemies_picked: enemiesPicked,
        allies_banned: alliesBanned,
        enemies_banned: enemiesBanned
      })
    });
    if (!res.ok) throw new Error('Failed to fetch draft suggestions');
    return res.json();
  },

  // Save manual match logs
  async saveMatch(matchPayload) {
    const res = await fetch(`${API_BASE_URL}/matches/`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(matchPayload)
    });
    if (!res.ok) throw new Error('Failed to save match history');
    return res.json();
  },

  // Fetch match logs history
  async fetchMatches() {
    const res = await fetch(`${API_BASE_URL}/matches/`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Failed to fetch match history');
    return res.json();
  },

  // Save subjective perceptions
  async savePerception(myBrawlerId, brawlerRivalId, value) {
    const res = await fetch(`${API_BASE_URL}/perceptions/`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        my_brawler_id: myBrawlerId,
        brawler_rival_id: brawlerRivalId,
        value: value
      })
    });
    if (!res.ok) throw new Error('Failed to save perception');
    return res.json();
  },

  // Fetch subjective perceptions list
  async fetchPerceptions() {
    const res = await fetch(`${API_BASE_URL}/perceptions/`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Failed to fetch perceptions');
    return res.json();
  }
};
