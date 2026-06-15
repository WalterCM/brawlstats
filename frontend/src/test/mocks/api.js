import { vi } from 'vitest'

export const mockData = {
  brawlers: [
    { id: '1', name: 'Shelly', class_name: 'Damage Dealer', image_url: '/shelly.png' },
    { id: '2', name: 'Colt', class_name: 'Marksman', image_url: '/colt.png' },
    { id: '3', name: 'Bull', class_name: 'Tank', image_url: '/bull.png' },
    { id: '4', name: 'Poco', class_name: 'Support', image_url: '/poco.png' },
    { id: '5', name: 'Stu', class_name: 'Assassin', image_url: '/stu.png' },
    { id: '6', name: 'Jessie', class_name: 'Controller', image_url: '/jessie.png' },
    { id: '7', name: 'Barley', class_name: 'Artillery', image_url: '/barley.png' },
  ],
  maps: [
    { id: 'm1', name: 'Gem Grab Map', mode: 'Gem Grab', image_url: '/gem_map.png', is_ranked: true },
    { id: 'm2', name: 'Brawl Ball Map', mode: 'Brawl Ball', image_url: '/bball_map.png', is_ranked: true },
    { id: 'm3', name: 'Heist Map', mode: 'Heist', image_url: '/heist_map.png', is_ranked: true },
    { id: 'm4', name: 'Non Ranked Map', mode: 'Gem Grab', image_url: '/nr_map.png', is_ranked: false },
  ],
  me: { id: 1, name: 'TestPlayer', player_tag: '#TEST1', avatar_id: '1', min_normal_trophies: 750 },
  matches: [],
  perceptions: [],
  playerList: [
    { id: 1, name: 'PlayerOne', player_tag: '#P1', avatar_id: '1' },
    { id: 2, name: 'PlayerTwo', player_tag: '#P2', avatar_id: null },
  ],
  loginResult: { token: 'test-token-123', username: 'TestPlayer', player_tag: '#TEST1' },
  suggestions: {
    suggestions: [
      {
        brawler: { id: '2', name: 'Colt', class_name: 'Marksman', image_url: '/colt.png' },
        score: 0.85,
        components: {
          A_adjusted_win_rate: 0.55,
          B_matchup_factor: 1.2,
          C_synergy_factor: 1.0,
          D_meta_relevance: 0.8,
          E_confidence_penalty: 1.0,
        },
      },
      {
        brawler: { id: '5', name: 'Stu', class_name: 'Assassin', image_url: '/stu.png' },
        score: 0.72,
        components: {
          A_adjusted_win_rate: 0.50,
          B_matchup_factor: 1.1,
          C_synergy_factor: 0.9,
          D_meta_relevance: 0.75,
          E_confidence_penalty: 1.0,
        },
      },
    ],
  },
  lastBattle: {
    map: { id: 'm1', name: 'Gem Grab Map', mode: 'Gem Grab', image_url: '/gem_map.png', is_ranked: true },
    allies_picked: [{ id: '1', name: 'Shelly', class_name: 'Damage Dealer', image_url: '/shelly.png' }],
    enemies_picked: [{ id: '2', name: 'Colt', class_name: 'Marksman', image_url: '/colt.png' }],
    my_brawler: { id: '1', name: 'Shelly', class_name: 'Damage Dealer', image_url: '/shelly.png' },
    draft_type: 'ranked',
    sets: [
      { api_match_id: 'api-set-1', result: 'victory', my_brawler_trophies: 500, is_star_player: false },
      { api_match_id: 'api-set-2', result: 'defeat', my_brawler_trophies: 500, is_star_player: true },
      { api_match_id: 'api-set-3', result: 'victory', my_brawler_trophies: 500, is_star_player: false },
    ],
  },
}

function createMockApi() {
  const mockApi = {
    fetchMe: vi.fn().mockResolvedValue(mockData.me),
    updateMe: vi.fn().mockResolvedValue(mockData.me),
    fetchBrawlers: vi.fn().mockResolvedValue(mockData.brawlers),
    fetchMaps: vi.fn().mockImplementation((isRanked) => {
      if (isRanked === true) return Promise.resolve(mockData.maps.filter(m => m.is_ranked))
      if (isRanked === false) return Promise.resolve(mockData.maps.filter(m => !m.is_ranked))
      return Promise.resolve(mockData.maps)
    }),
    fetchSuggestions: vi.fn().mockResolvedValue(mockData.suggestions),
    fetchLastBattle: vi.fn().mockResolvedValue(mockData.lastBattle),
    linkDraftBattle: vi.fn().mockResolvedValue({ sets: mockData.lastBattle.sets }),
    submitMatchSeries: vi.fn().mockResolvedValue({ id: 999 }),
    saveMatch: vi.fn().mockResolvedValue({ id: 100 }),
    updateMatch: vi.fn().mockResolvedValue({ id: 100 }),
    linkMatchAPI: vi.fn().mockResolvedValue({ success: true }),
    syncMatchesAPI: vi.fn().mockResolvedValue({ message: 'Synced 5 matches!', synced_count: 5 }),
    fetchMatches: vi.fn().mockResolvedValue(mockData.matches),
    savePerception: vi.fn().mockResolvedValue({ id: 1 }),
    fetchPerceptions: vi.fn().mockResolvedValue(mockData.perceptions),
    login: vi.fn().mockResolvedValue(mockData.loginResult),
    register: vi.fn().mockResolvedValue(mockData.loginResult),
    fetchPlayerList: vi.fn().mockResolvedValue(mockData.playerList),
    accessPlayerProfile: vi.fn().mockResolvedValue(mockData.loginResult),
  }

  return mockApi
}

export const mockApi = createMockApi()

// Re-export so tests can reference mock functions by name
export const {
  fetchMe,
  updateMe,
  fetchBrawlers,
  fetchMaps,
  fetchSuggestions,
  fetchLastBattle,
  linkDraftBattle,
  submitMatchSeries,
  saveMatch,
  updateMatch,
  linkMatchAPI,
  syncMatchesAPI,
  fetchMatches,
  savePerception,
  fetchPerceptions,
  login,
  register,
  fetchPlayerList,
  accessPlayerProfile,
} = mockApi
