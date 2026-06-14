const API_BASE_URL = '/api';

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

  // Update active player profile context
  async updateMe(profilePayload) {
    const res = await fetch(`${API_BASE_URL}/players/me/`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify(profilePayload)
    });
    if (!res.ok) throw new Error('Failed to update player profile');
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
    let url = `${API_BASE_URL}/maps/`;
    if (isRanked === true || isRanked === false) {
      url += `?is_ranked=${isRanked}`;
    }
    const res = await fetch(url, {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Failed to fetch maps');
    return res.json();
  },

  // Fetch active suggestions based on picks/bans
  async fetchSuggestions(mapId, alliesPicked, enemiesPicked, alliesBanned, enemiesBanned, enableTurns = true, activeTeam = 'allied', draftType = 'ranked', minTrophies = 1000) {
    const res = await fetch(`${API_BASE_URL}/draft/suggest/`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        map_id: mapId,
        allies_picked: alliesPicked,
        enemies_picked: enemiesPicked,
        allies_banned: alliesBanned,
        enemies_banned: enemiesBanned,
        enable_turns: enableTurns,
        active_team: activeTeam,
        draft_type: draftType,
        min_trophies: minTrophies
      })
    });
    if (!res.ok) throw new Error('Failed to fetch draft suggestions');
    return res.json();
  },

  // Ingest last battle details from Brawl Stars API
  async fetchLastBattle() {
    const res = await fetch(`${API_BASE_URL}/draft/last-battle/`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to fetch last battle');
    }
    return res.json();
  },

  // Link manual draft brawlers to API matches
  async linkDraftBattle(payload) {
    const res = await fetch(`${API_BASE_URL}/draft/link-draft/`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to link draft with API battles');
    }
    return res.json();
  },

  // Save a series/multi-set of matches
  async submitMatchSeries(payload) {
    const res = await fetch(`${API_BASE_URL}/matches/submit-series/`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to submit match series');
    }
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

  // Update existing match logs
  async updateMatch(matchId, matchPayload) {
    const res = await fetch(`${API_BASE_URL}/matches/${matchId}/`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(matchPayload)
    });
    if (!res.ok) throw new Error('Failed to update match data');
    return res.json();
  },

  // Link manually added match to Brawl Stars API log entry
  async linkMatchAPI(matchId) {
    const res = await fetch(`${API_BASE_URL}/matches/${matchId}/link-api/`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to link match with API battle log');
    }
    return res.json();
  },

  // Bulk sync all new 3v3 matches from the Brawl Stars API battle log
  async syncMatchesAPI() {
    const res = await fetch(`${API_BASE_URL}/matches/sync-api/`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to synchronize matches from API');
    }
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

  // Save subjective perceptions linked to a match
  async savePerception(matchId, myBrawlerId, brawlerRivalId, value) {
    const res = await fetch(`${API_BASE_URL}/perceptions/`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        match_id: matchId,
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
  },

  // Passwordless: Fetch all player profiles
  async fetchPlayerList() {
    const res = await fetch(`${API_BASE_URL}/players/list/`);
    if (!res.ok) throw new Error('Failed to fetch player list');
    return res.json();
  },

  // Passwordless: Access or register a player profile using only player_tag
  async accessPlayerProfile(playerTag) {
    const res = await fetch(`${API_BASE_URL}/players/access/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player_tag: playerTag })
    });
    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || 'Failed to access player profile');
    }
    return res.json();
  }
};
