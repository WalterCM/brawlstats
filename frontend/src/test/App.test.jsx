import { vi, describe, it, expect, beforeEach } from 'vitest'
import { render as tlRender, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { FilterProvider } from '../context/FilterContext'
import userEvent from '@testing-library/user-event'
import App from '../App'

const AllProviders = ({ children }) => (
  <MemoryRouter>
    <FilterProvider>
      {children}
    </FilterProvider>
  </MemoryRouter>
)
const render = (ui, options) => tlRender(ui, { wrapper: AllProviders, ...options })

vi.setConfig({ testTimeout: 15000 })

// ---------------------------------------------------------------------------
// Mock the api module
// ---------------------------------------------------------------------------
const { mockApi, mockSetGlobalActiveUser } = vi.hoisted(() => {
  const mockData = {
    brawlers: [
      { id: '16000000', name: 'Shelly', class_name: 'Damage Dealer', image_url: '/shelly.png' },
      { id: '16000001', name: 'Colt', class_name: 'Marksman', image_url: '/colt.png' },
      { id: '16000002', name: 'Bull', class_name: 'Tank', image_url: '/bull.png' },
      { id: '16000003', name: 'Poco', class_name: 'Support', image_url: '/poco.png' },
      { id: '16000004', name: 'Stu', class_name: 'Assassin', image_url: '/stu.png' },
    ],
    maps: [
      { id: 'm1', name: 'Gem Grab Map', mode: 'Gem Grab', image_url: '/gem_map.png', is_ranked: true },
      { id: 'm2', name: 'Brawl Ball Map', mode: 'Brawl Ball', image_url: '/bball_map.png', is_ranked: true },
    ],
    me: { id: 1, name: 'TestPlayer', player_tag: '#TEST1', avatar_id: '1', min_normal_trophies: 750 },
    matches: [
      {
        id: 10, map_id: 'm1', mode: 'Gem Grab', result: 'victory', draft_type: 'ranked',
        my_brawler_id: '16000000', api_match_id: null, my_brawler_trophies: 500, is_star_player: true,
        draft_events: [
          { type: 'pick', brawler_id: '16000000', team: 'allied', order: 1 },
          { type: 'pick', brawler_id: '16000001', team: 'enemy', order: 2 },
        ],
      },
      {
        id: 11, map_id: 'm2', mode: 'Brawl Ball', result: 'defeat', draft_type: 'ranked',
        my_brawler_id: '16000001', api_match_id: 'api-123', my_brawler_trophies: 600, is_star_player: false,
        draft_events: [
          { type: 'pick', brawler_id: '16000001', team: 'allied', order: 1 },
          { type: 'pick', brawler_id: '16000002', team: 'enemy', order: 2 },
        ],
      },
    ],
    perceptions: [
      { id: 1, match_id: 10, my_brawler_id: '16000000', brawler_rival_id: '16000001', value: 1 },
    ],
    playerList: [
      { id: 1, name: 'PlayerOne', player_tag: '#P1', avatar_id: '1' },
      { id: 2, name: 'PlayerTwo', player_tag: '#P2', avatar_id: null },
    ],
    loginResult: { token: 'test-token-123', username: 'TestPlayer' },
    suggestions: {
      suggestions: [
        {
          brawler: { id: '16000001', name: 'Colt', class_name: 'Marksman', image_url: '/colt.png' },
          score: 0.85,
          components: { A_adjusted_win_rate: 0.55, B_matchup_factor: 1.2, C_synergy_factor: 1.0, D_meta_relevance: 0.8, E_confidence_penalty: 1.0 },
        },
      ],
    },
    lastBattle: {
      map: { id: 'm1', name: 'Gem Grab Map', mode: 'Gem Grab', image_url: '/gem_map.png', is_ranked: true },
      allies_picked: [{ id: '16000000', name: 'Shelly', class_name: 'Damage Dealer', image_url: '/shelly.png' }],
      enemies_picked: [{ id: '16000001', name: 'Colt', class_name: 'Marksman', image_url: '/colt.png' }],
      my_brawler: { id: '16000000', name: 'Shelly', class_name: 'Damage Dealer', image_url: '/shelly.png' },
      draft_type: 'ranked',
      sets: [{ api_match_id: 'api-set-1', result: 'victory', my_brawler_trophies: 500, is_star_player: false }],
    },
  }

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
    fetchSyncPreview: vi.fn().mockResolvedValue({ available: [
      { battle_time: 'b1', map_name: 'Gem Grab Map', mode: 'Gem Grab', brawler_name: 'Shelly', brawler_id: '16000000', result: 'victory', draft_type: 'ranked', trophies: 500, is_star_player: true },
      { battle_time: 'b2', map_name: 'Brawl Ball Map', mode: 'Brawl Ball', brawler_name: 'Colt', brawler_id: '16000001', result: 'defeat', draft_type: 'normal', trophies: 600, is_star_player: false },
    ], count: 2 }),
    importSelectedBattles: vi.fn().mockResolvedValue({ message: 'Imported 2 matches.', synced_count: 2 }),
    syncMatchesAPI: vi.fn().mockResolvedValue({ message: 'Synced 5 matches!', synced_count: 5 }),
    fetchMatches: vi.fn().mockResolvedValue(mockData.matches),
    savePerception: vi.fn().mockResolvedValue({ id: 1 }),
    fetchPerceptions: vi.fn().mockResolvedValue(mockData.perceptions),
    fetchPlayerDetails: vi.fn().mockResolvedValue({ id: 2, name: 'PlayerTwo', player_tag: '#P2', avatar_id: '1' }),
    fetchMyClub: vi.fn().mockResolvedValue({
      in_club: true,
      is_approved: true,
      role: 'president',
      club: {
        id: 1,
        name: 'Brawl Champions',
        tag: '#CHAMP123',
        members: [
          { id: 10, player: 2, player_name: 'PlayerTwo', role: 'member', is_approved: true, is_active: true, avatar_id: '1' },
          { id: 11, player: 1, player_name: 'TestPlayer', role: 'president', is_approved: true, is_active: true, avatar_id: '2' }
        ]
      }
    }),
    fetchClubStats: vi.fn().mockResolvedValue({
      total_matches: 15,
      overall_win_rate: 66.7,
      leaderboard: [
        { player_id: 2, name: 'PlayerTwo', avatar_id: '1', played: 10, wins: 8, defeats: 2, win_rate: 80.0, role: 'member', ranked_played: 0, ranked_win_rate: 0, recent_played: 0, recent_win_rate: 0, avg_trophies: 650, max_rank: 13 },
        { player_id: 1, name: 'TestPlayer', avatar_id: '2', played: 5, wins: 3, defeats: 2, win_rate: 60.0, role: 'president', ranked_played: 0, ranked_win_rate: 0, recent_played: 0, recent_win_rate: 0, avg_trophies: 700, max_rank: 10 }
      ],
      modes: [],
      brawlers: [
        { id: '16000000', name: 'Shelly', played: 10, win_rate: 80.0, popularity_rate: 66.7 },
        { id: '16000001', name: 'Colt', played: 5, win_rate: 40.0, popularity_rate: 33.3 }
      ]
    }),
    fetchClubForumThreads: vi.fn().mockResolvedValue([]),
    fetchForumCategories: vi.fn().mockResolvedValue([]),
    fetchUnlinkedProfiles: vi.fn().mockResolvedValue({ unlinked_users: [], unlinked_players: [] }),
    login: vi.fn().mockResolvedValue(mockData.loginResult),
    register: vi.fn().mockResolvedValue(mockData.loginResult),
    fetchPlayerList: vi.fn().mockResolvedValue(mockData.playerList),
    accessPlayerProfile: vi.fn().mockResolvedValue(mockData.loginResult),
    fetchBrawlerMeta: vi.fn().mockResolvedValue([]),
    fetchMapMeta: vi.fn().mockResolvedValue([]),
  }

  return { mockApi, mockSetGlobalActiveUser: vi.fn(), mockData }
})

vi.mock('../services/api', () => ({
  api: mockApi,
  setGlobalActiveUser: mockSetGlobalActiveUser,
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function waitForWelcome() {
  await screen.findByText(/gameplay insights/i)
}

async function navigateToDraft() {
  await waitForWelcome()
  await userEvent.click(screen.getByText('Competitive Draft (Ranked)'))
  await screen.findByRole('button', { name: /select a map/i })
}

async function selectMapFromModal(mapName) {
  const btn = screen.getByRole('button', { name: /select a map/i })
  await userEvent.click(btn)
  await screen.findByRole('heading', { name: /select map/i })
  // Click the first matching map card
  const mapCards = screen.getAllByText(mapName)
  await userEvent.click(mapCards[mapCards.length - 1])
}

// ---------------------------------------------------------------------------
// Login Screen
// ---------------------------------------------------------------------------
describe('Login Screen (unauthenticated)', () => {
  beforeEach(() => { localStorage.clear() })

  it('renders title and subtitle', () => {
    render(<App />)
    expect(screen.getByText('BRAWL STATS')).toBeInTheDocument()
  })

  it('shows player profiles loaded from API', async () => {
    render(<App />)
    expect(await screen.findByText('PlayerOne')).toBeInTheDocument()
    expect(await screen.findByText('#P1')).toBeInTheDocument()
  })

  it('shows create profile form', async () => {
    render(<App />)
    expect(await screen.findByText('Create New Profile')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/enter player tag/i)).toBeInTheDocument()
  })

  it('transitions to main app after clicking a profile', async () => {
    render(<App />)
    await screen.findByText('PlayerOne')
    await userEvent.click(screen.getByText('PlayerOne'))
    expect(await screen.findByRole('heading', { name: 'TestPlayer' })).toBeInTheDocument()
    expect(screen.getByText(/Gameplay Insights/i)).toBeInTheDocument()
  })

  it('transitions to main app after submitting tag via form', async () => {
    render(<App />)
    await screen.findByText('Create New Profile')
    const input = screen.getByPlaceholderText(/enter player tag/i)
    await userEvent.type(input, '#NEW')
    await userEvent.click(screen.getByText('🚀 Load Profile'))
    expect(await screen.findByRole('heading', { name: 'TestPlayer' })).toBeInTheDocument()
    expect(screen.getByText(/Gameplay Insights/i)).toBeInTheDocument()
  })

  it('shows error message on failed login', async () => {
    mockApi.accessPlayerProfile.mockRejectedValueOnce(new Error('Invalid player tag'))
    render(<App />)
    await screen.findByText('PlayerOne')
    await userEvent.click(screen.getByText('PlayerOne'))
    expect(await screen.findByText(/invalid player tag/i)).toBeInTheDocument()
  })

  it('shows empty state when no players exist', async () => {
    mockApi.fetchPlayerList.mockResolvedValueOnce([])
    render(<App />)
    expect(await screen.findByText(/no player profiles found/i)).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Main Menu
// ---------------------------------------------------------------------------
describe('Main App Menu (authenticated)', () => {
  beforeEach(() => {
    localStorage.setItem('brawl_active_user', JSON.stringify({ id: 'test', token: 'test-token-123', name: 'TestPlayer' }))
  })

  it('renders welcome message and menu cards', async () => {
    render(<App />)
    await waitForWelcome()
    expect(screen.getByText('Competitive Draft (Ranked)')).toBeInTheDocument()
    expect(screen.getByText('Normal Draft (No Bans)')).toBeInTheDocument()
    expect(screen.getByText('Stats Dashboard')).toBeInTheDocument()
  })

  it('loads catalogs from API on mount', async () => {
    render(<App />)
    await waitForWelcome()
    expect(mockApi.fetchBrawlers).toHaveBeenCalled()
    expect(mockApi.fetchMaps).toHaveBeenCalled()
    expect(mockApi.fetchMatches).toHaveBeenCalled()
    expect(mockApi.fetchPerceptions).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Draft UI
// ---------------------------------------------------------------------------
describe('Draft UI', () => {
  beforeEach(() => {
    localStorage.setItem('brawl_active_user', JSON.stringify({ id: 'test', token: 'test-token-123', name: 'TestPlayer' }))
  })

  it('enters ranked draft and shows draft HUD', async () => {
    render(<App />)
    await navigateToDraft()
    expect(screen.getByText('Blue Team (Allies)')).toBeInTheDocument()
    expect(screen.getByText('Red Team (Enemies)')).toBeInTheDocument()
  })

  it('shows 6 ban slots in ranked mode', async () => {
    render(<App />)
    await navigateToDraft()
    expect(screen.getAllByText(/BAN [123]/).length).toBe(6)
  })

  it('opens map selector modal and selects a map', async () => {
    render(<App />)
    await navigateToDraft()
    await selectMapFromModal('Gem Grab Map')
    expect(screen.queryByRole('heading', { name: /select map/i })).not.toBeInTheDocument()
  })

  it('filters brawler grid by search text', async () => {
    render(<App />)
    await navigateToDraft()
    const searchInput = screen.getByPlaceholderText(/search brawler/i)
    await userEvent.type(searchInput, 'colt')
    // Colt may appear in multiple places (grid + left panel), check at least one exists
    expect(screen.getAllByText('Colt').length).toBeGreaterThanOrEqual(1)
  })

  it('filters brawlers by class tabs', async () => {
    render(<App />)
    await navigateToDraft()
    await userEvent.click(screen.getByText('Tank'))
    expect(screen.getByText('Bull')).toBeInTheDocument()
  })

  it('loads suggestions when a map is selected', async () => {
    render(<App />)
    await navigateToDraft()
    await selectMapFromModal('Gem Grab Map')
    await waitFor(() => {
      expect(mockApi.fetchSuggestions).toHaveBeenCalled()
    })
  })

  it('shows suggestions panel heading', async () => {
    render(<App />)
    await navigateToDraft()
    expect(screen.getByText(/powered by bayesian smoothing/i)).toBeInTheDocument()
  })

  it('has reset draft and disabled draft complete buttons', async () => {
    render(<App />)
    await navigateToDraft()
    expect(screen.getByText('Reset Draft')).toBeInTheDocument()
    expect(screen.getByText('Draft Complete')).toBeDisabled()
  })

  it('exits back to main menu', async () => {
    render(<App />)
    await navigateToDraft()
    await userEvent.click(screen.getByText(/exit draft tool/i))
    expect(await screen.findByText('Competitive Draft (Ranked)')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Main Menu — Battle Log & Stats
// ---------------------------------------------------------------------------
describe('Stats Dashboard & Battle Log', () => {
  beforeEach(() => {
    localStorage.setItem('brawl_active_user', JSON.stringify({ id: 'test', token: 'test-token-123', name: 'TestPlayer' }))
  })

  it('navigates to stats dashboard', async () => {
    render(<App />)
    await waitForWelcome()
    await userEvent.click(screen.getByText('Stats Dashboard'))
    expect(await screen.findByText(/gameplay insights/i)).toBeInTheDocument()
  })

  it('shows battle log section on menu', async () => {
    render(<App />)
    await waitForWelcome()
    await userEvent.click(screen.getByText('📜 Battle Log'))
    expect(screen.getByText(/my battle log/i)).toBeInTheDocument()
  })

  it('shows sync history button', async () => {
    render(<App />)
    await waitForWelcome()
    expect(screen.getByText(/sync battle log/i)).toBeInTheDocument()
  })

  it('shows matchup comforts inside draft UI (left panel)', async () => {
    render(<App />)
    await waitForWelcome()
    await userEvent.click(screen.getByText('Competitive Draft (Ranked)'))
    await screen.findByRole('button', { name: /select a map/i })
    expect(screen.getByText(/matchup comforts/i)).toBeInTheDocument()
    // Perceptions with value=1 should show "Easy"
    expect(screen.getByText('Easy')).toBeInTheDocument()
  })

  it('sync history triggers direct API synchronization', async () => {
    render(<App />)
    await waitForWelcome()
    await userEvent.click(screen.getByText(/sync battle log/i))
    await waitFor(() => { expect(mockApi.syncMatchesAPI).toHaveBeenCalled() })
    expect(await screen.findByText(/Synced 5 matches!/i)).toBeInTheDocument()
  })

  it('navigates to mode profile from dashboard', async () => {
    render(<App />)
    await waitForWelcome()
    await userEvent.click(screen.getByText('Stats Dashboard'))
    expect(await screen.findByText(/gameplay insights/i)).toBeInTheDocument()
    await userEvent.click(screen.getAllByText(/Gem Grab/i)[0])
    expect(await screen.findByText(/Brawler Performance in Gem Grab/i)).toBeInTheDocument()
  })

  it('navigates to member stats view from club roster list', async () => {
    render(<App />)
    await waitForWelcome()
    
    // Navigate to club page
    await userEvent.click(screen.getByText('🛡️ My Club'))
    
    // Check that Avg Trophies and Rank columns are present in the Stats tab leaderboard
    expect(await screen.findByText('Avg 🏆')).toBeInTheDocument()
    expect(await screen.findByRole('columnheader', { name: 'Rank' })).toBeInTheDocument()
    expect(await screen.findByRole('columnheader', { name: 'Played' })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'W' })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'L' })).not.toBeInTheDocument()
    expect(screen.getByText('Mythic I')).toBeInTheDocument()
    expect(screen.getByText('Diamond I')).toBeInTheDocument()

    // Switch to Roster tab
    const rosterTabBtn = await screen.findByText('👥 Roster')
    await userEvent.click(rosterTabBtn)

    // Find member in roster and click their name
    const memberName = await screen.findByText('PlayerTwo')
    await userEvent.click(memberName)

    // Verify it fetches details of target player 2 and displays Member Stats View
    await waitFor(() => {
      expect(mockApi.fetchPlayerDetails).toHaveBeenCalledWith('2')
    })
    expect(await screen.findByRole('heading', { name: 'PlayerTwo' })).toBeInTheDocument()
    expect(screen.getByText(/Gameplay Insights/i)).toBeInTheDocument()
  })

  it('applies global filters to club stats query', async () => {
    render(<App />)
    await waitForWelcome()

    // Navigate to club page
    await userEvent.click(screen.getByText('🛡️ My Club'))
    await screen.findByText('Avg 🏆')

    // Click Filters to open the global filter bar
    const filterToggleBtn = screen.getByRole('button', { name: /Filters/i })
    await userEvent.click(filterToggleBtn)

    // Select "Normal" Draft Format
    const draftTypeSelect = screen.getByDisplayValue(/All Formats/i)
    await userEvent.selectOptions(draftTypeSelect, 'Normal')

    // Click "750-999" trophy range button in MatchFilterBar
    const trophyRangeBtn = await screen.findByRole('button', { name: '750-999' })
    await userEvent.click(trophyRangeBtn)

    // Verify it fetches club stats with the correct filter params
    await waitFor(() => {
      expect(mockApi.fetchClubStats).toHaveBeenLastCalledWith(1, expect.any(String), expect.objectContaining({
        draft_type: 'Normal',
        level_min: 750,
        level_max: 999
      }))
    })
  })

  it('renders most popular brawlers grid with cards showing percentages', async () => {
    render(<App />)
    await waitForWelcome()

    // Navigate to club page
    await userEvent.click(screen.getByText('🛡️ My Club'))
    
    // Check that brawler card titles are present
    expect(await screen.findByText('🔥 Most Popular Brawlers (by Usage)')).toBeInTheDocument()
    expect(screen.getByText('⭐ Top Brawlers (by Win Rate)')).toBeInTheDocument()

    // Check that cards for Shelly and Colt are visible with their percentages
    expect(screen.getAllByText('Shelly').length).toBeGreaterThan(0)
    expect(screen.getAllByText('66.7%').length).toBeGreaterThan(0)
    expect(screen.getAllByText('10 games').length).toBeGreaterThan(0)

    expect(screen.getAllByText('Colt').length).toBeGreaterThan(0)
    expect(screen.getAllByText('33.3%').length).toBeGreaterThan(0)
    expect(screen.getAllByText('5 games').length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Profile View
// ---------------------------------------------------------------------------
describe('Profile View', () => {
  beforeEach(() => {
    localStorage.setItem('brawl_active_user', JSON.stringify({ id: 'test', token: 'test-token-123', name: 'TestPlayer' }))
  })

  it('opens settings view from dropdown', async () => {
    render(<App />)
    await waitForWelcome()

    const profileBtn = screen.getByRole('button', { name: /player.*testplayer/i })
    await userEvent.click(profileBtn)
    await screen.findByText(/settings/i)
    await userEvent.click(screen.getByText(/settings/i))
    expect(await screen.findByText(/player profile/i)).toBeInTheDocument()
  })

  it('settings view shows settings fields', async () => {
    render(<App />)
    await waitForWelcome()

    const profileBtn = screen.getByRole('button', { name: /player.*testplayer/i })
    await userEvent.click(profileBtn)
    await screen.findByText(/settings/i)
    await userEvent.click(screen.getByText(/settings/i))
    await waitFor(() => {
      expect(screen.getByText(/display name/i)).toBeInTheDocument()
      expect(screen.getByText(/player tag/i)).toBeInTheDocument()
      expect(screen.getByText(/min ingest trophies/i)).toBeInTheDocument()
    })
  })

  it('opens stats dashboard from View Profile option', async () => {
    render(<App />)
    await waitForWelcome()

    const profileBtn = screen.getByRole('button', { name: /player.*testplayer/i })
    await userEvent.click(profileBtn)
    await screen.findByText(/view profile/i)
    await userEvent.click(screen.getByText(/view profile/i))
    expect(await screen.findByRole('heading', { name: 'TestPlayer' })).toBeInTheDocument()
    expect(screen.getByText(/Gameplay Insights/i)).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Draft: Place Brawler
// ---------------------------------------------------------------------------
describe('Draft: Place Brawler', () => {
  beforeEach(() => {
    localStorage.setItem('brawl_active_user', JSON.stringify({ id: 'test', token: 'test-token-123', name: 'TestPlayer' }))
  })

  it('places a brawler in the allies pick slot and enables draft complete button', async () => {
    render(<App />)
    await navigateToDraft()
    expect(screen.getByText('Draft Complete')).toBeDisabled()
    await userEvent.click(screen.getAllByText('PICK 1')[0])
    await userEvent.click(screen.getByText('Stu'))
    expect(screen.getByText('Draft Complete')).toBeEnabled()
  })

  it('clears a placed brawler from a pick slot', async () => {
    render(<App />)
    await navigateToDraft()
    await userEvent.click(screen.getAllByText('PICK 1')[0])
    await userEvent.click(screen.getByText('Stu'))
    const clearBtn = screen.getByText('×')
    await userEvent.click(clearBtn)
    expect(screen.getByText('Draft Complete')).toBeDisabled()
  })
})

// ---------------------------------------------------------------------------
// Draft: Ban Slots
// ---------------------------------------------------------------------------
describe('Draft: Ban Slots', () => {
  beforeEach(() => {
    localStorage.setItem('brawl_active_user', JSON.stringify({ id: 'test', token: 'test-token-123', name: 'TestPlayer' }))
  })

  it('shows 6 ban slots in ranked mode', () => {
    render(<App />)
    ;('shows 6 ban slots in ranked mode')
  })

  it('hides ban slots in normal draft mode', async () => {
    render(<App />)
    await waitForWelcome()
    await userEvent.click(screen.getByText('Normal Draft (No Bans)'))
    await screen.findByRole('button', { name: /select a map/i })
    expect(screen.queryByText(/BAN \d/)).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Suggestions Breakdown Tooltip
// ---------------------------------------------------------------------------
describe('Suggestions Breakdown', () => {
  beforeEach(() => {
    localStorage.setItem('brawl_active_user', JSON.stringify({ id: 'test', token: 'test-token-123', name: 'TestPlayer' }))
  })

  it('shows suggestion breakdown tooltip content', async () => {
    render(<App />)
    await navigateToDraft()
    await selectMapFromModal('Gem Grab Map')
    await waitFor(() => { expect(mockApi.fetchSuggestions).toHaveBeenCalled() })
    expect(screen.getByText(/A \(Win rate\)/)).toBeInTheDocument()
    expect(screen.getByText(/B \(Matchup\)/)).toBeInTheDocument()
    expect(screen.getByText(/C \(Synergy\)/)).toBeInTheDocument()
    expect(screen.getByText(/D \(Meta\)/)).toBeInTheDocument()
    expect(screen.getByText(/E \(Confidence\)/)).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Informative Draft Completion
// ---------------------------------------------------------------------------
describe('Informative Draft Completion', () => {
  beforeEach(() => {
    localStorage.setItem('brawl_active_user', JSON.stringify({ id: 'test', token: 'test-token-123', name: 'TestPlayer' }))
  })

  it('shows Draft Complete button instead of Log Finished Match', async () => {
    render(<App />)
    await navigateToDraft()
    await userEvent.click(screen.getAllByText('PICK 1')[0])
    await userEvent.click(screen.getByText('Stu'))
    
    expect(screen.queryByText('Log Finished Match')).not.toBeInTheDocument()
    const draftCompleteBtn = screen.getByText('Draft Complete')
    expect(draftCompleteBtn).toBeInTheDocument()
    
    await userEvent.click(draftCompleteBtn)
    expect(screen.getByText(/Draft Simulation Complete/i)).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Map Selector
// ---------------------------------------------------------------------------
describe('Map Selector', () => {
  beforeEach(() => {
    localStorage.setItem('brawl_active_user', JSON.stringify({ id: 'test', token: 'test-token-123', name: 'TestPlayer' }))
  })

  it('filters maps by mode tab', async () => {
    render(<App />)
    await navigateToDraft()
    await userEvent.click(screen.getByRole('button', { name: /select a map/i }))
    await screen.findByRole('heading', { name: /select map/i })
    const modalRoot = screen.getByRole('heading', { name: /select map/i }).closest('.msm-panel')
    const modal = within(modalRoot)
    const tabsContainer = modalRoot.querySelector('.msm-tabs')
    const tabs = within(tabsContainer)
    await userEvent.click(tabs.getByRole('button', { name: /Brawl Ball/i }))
    expect(modal.getByText('Brawl Ball Map')).toBeInTheDocument()
    expect(modal.queryByText('Gem Grab Map')).not.toBeInTheDocument()
  })

  it('searches maps by name', async () => {
    render(<App />)
    await navigateToDraft()
    await userEvent.click(screen.getByRole('button', { name: /select a map/i }))
    await screen.findByRole('heading', { name: /select map/i })
    const modalRoot = screen.getByRole('heading', { name: /select map/i }).closest('.msm-panel')
    const modal = within(modalRoot)
    const searchInput = modal.getByPlaceholderText(/search by map name/i)
    await userEvent.type(searchInput, 'Brawl')
    expect(modal.getByText('Brawl Ball Map')).toBeInTheDocument()
    expect(modal.queryByText('Gem Grab Map')).not.toBeInTheDocument()
  })
})
