const API_BASE_URL = 'http://localhost:8000/api';

// State to store the active user metadata locally
let activeUser = {
  token: localStorage.getItem('django_auth_token') || '',
  name: localStorage.getItem('django_auth_username') || ''
};

export const setGlobalActiveUser = (token, name) => {
  activeUser.token = token;
  activeUser.name = name;
  if (token) {
    localStorage.setItem('django_auth_token', token);
    localStorage.setItem('django_auth_username', name);
  } else {
    localStorage.removeItem('django_auth_token');
    localStorage.removeItem('django_auth_username');
  }
};

export const getGlobalActiveUser = () => {
  return activeUser;
};

const getAuthHeaders = () => {
  const headers = {
    'Content-Type': 'application/json'
  };
  if (activeUser.token) {
    headers['Authorization'] = `Token ${activeUser.token}`;
  }
  return headers;
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
  },

  // Authenticate with Django User backend
  async login(username, password) {
    const res = await fetch(`${API_BASE_URL}/auth/login/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || 'Invalid credentials');
    }
    return res.json();
  },

  // Register a new Django User
  async register(username, password) {
    const res = await fetch(`${API_BASE_URL}/auth/register/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || 'Failed to register');
    }
    return res.json();
  }
};
