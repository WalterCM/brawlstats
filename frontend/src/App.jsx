import React, { useState, useEffect } from 'react';
import { api, setGlobalActiveUser } from './services/api';
import './App.css';

const deduplicateMaps = (mapList) => {
  const seen = new Set();
  return mapList.filter(m => {
    const key = `${m.name.trim().toLowerCase()}-${m.mode.trim().toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

function App() {
  // Authentication & Users
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem('brawl_active_user');
    return saved ? JSON.parse(saved) : null;
  });

  const [me, setMe] = useState(null);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [authError, setAuthError] = useState('');
  const [currentView, setCurrentView] = useState('menu'); // 'menu' or 'draft'
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);

  // Connection State
  const [backendConnected, setBackendConnected] = useState(true);

  // Catalogs
  const [brawlers, setBrawlers] = useState([]);
  const [maps, setMaps] = useState([]);
  const [selectedMap, setSelectedMap] = useState(null);
  const [showMapModal, setShowMapModal] = useState(false);
  const [mapFilterMode, setMapFilterMode] = useState('All');
  const [draftType, setDraftType] = useState('ranked'); // 'ranked' or 'normal'
  const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = useState(false);
  const [firstPickTeam, setFirstPickTeam] = useState('allies'); // 'allies' or 'enemies'

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [mapSearchQuery, setMapSearchQuery] = useState('');
  const [selectedClass, setSelectedClass] = useState('All');

  // Personal Logs
  const [matches, setMatches] = useState([]);
  const [perceptions, setPerceptions] = useState([]);

  // Draft State
  const [draft, setDraft] = useState({
    allies_banned: [null, null, null],
    enemies_banned: [null, null, null],
    allies_picked: [null, null, null],
    enemies_picked: [null, null, null],
  });

  const [activeSlot, setActiveSlot] = useState({ type: 'allies_banned', index: 0 });
  const [suggestions, setSuggestions] = useState([]);

  // Post match Logger Modal State
  const [showMatchLogger, setShowMatchLogger] = useState(false);
  const [matchResult, setMatchResult] = useState('victory');
  const [myBrawler, setMyBrawler] = useState(null);
  const [opponentPerceptions, setOpponentPerceptions] = useState({});

  // Load catalogs and stats whenever active user changes
  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('brawl_active_user', JSON.stringify(currentUser));
      setCurrentView('menu');
      loadCatalogs();
    } else {
      localStorage.removeItem('brawl_active_user');
      setMe(null);
      setMatches([]);
      setPerceptions([]);
    }
  }, [currentUser]);

  // Load recommendations whenever draft selections or map changes
  useEffect(() => {
    if (selectedMap && currentUser && backendConnected) {
      loadSuggestions();
    } else {
      setSuggestions([]);
    }
  }, [draft, selectedMap, currentUser, backendConnected]);

  const loadCatalogs = async () => {
    if (!currentUser) return;
    try {
      setGlobalActiveUser(currentUser.token, currentUser.name);

      // Load user details
      const playerProfile = await api.fetchMe();
      setMe(playerProfile);

      // Load catalogs
      const brawlerList = await api.fetchBrawlers();
      setBrawlers(brawlerList);

      // Default to Ranked maps on startup
      const mapList = await api.fetchMaps(true);
      const uniqueMaps = deduplicateMaps(mapList);
      setMaps(uniqueMaps);
      if (uniqueMaps.length > 0) {
        setSelectedMap(uniqueMaps[0]);
      }

      setBackendConnected(true);
      loadUserStats();
    } catch (err) {
      console.error("Error loading catalogs:", err);
      setBackendConnected(false);
    }
  };

  const loadMapsForDraft = async (isRanked) => {
    try {
      const mapList = await api.fetchMaps(isRanked ? true : null);
      const uniqueMaps = deduplicateMaps(mapList);
      setMaps(uniqueMaps);
      if (uniqueMaps.length > 0) {
        if (!selectedMap || !uniqueMaps.some(m => m.id === selectedMap.id)) {
          setSelectedMap(uniqueMaps[0]);
        }
      } else {
        setSelectedMap(null);
      }
    } catch (err) {
      console.error("Error loading maps:", err);
    }
  };

  const enterDraftMode = async (type) => {
    await loadMapsForDraft(type === 'ranked');
    resetDraft(type);
    setDraftType(type);
    setCurrentView('draft');
  };

  const loadUserStats = async () => {
    try {
      const matchHistory = await api.fetchMatches();
      setMatches(matchHistory);
      const perceptionList = await api.fetchPerceptions();
      setPerceptions(perceptionList);
    } catch (err) {
      console.error("Error loading user logs:", err);
    }
  };

  const loadSuggestions = async () => {
    try {
      const alliesPicked = draft.allies_picked.filter(Boolean).map(b => b.id);
      const enemiesPicked = draft.enemies_picked.filter(Boolean).map(b => b.id);
      const alliesBanned = draft.allies_banned.filter(Boolean).map(b => b.id);
      const enemiesBanned = draft.enemies_banned.filter(Boolean).map(b => b.id);

      const res = await api.fetchSuggestions(
        selectedMap.id,
        alliesPicked,
        enemiesPicked,
        alliesBanned,
        enemiesBanned
      );
      setSuggestions(res.suggestions || []);
    } catch (err) {
      console.error("Error fetching suggestions:", err);
    }
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    if (!loginUsername.trim() || !loginPassword) return;

    const username = loginUsername.trim();
    try {
      let data;
      if (isRegisterMode) {
        data = await api.register(username, loginPassword);
      } else {
        data = await api.login(username, loginPassword);
      }

      const userSession = { id: data.token, token: data.token, name: data.username };
      
      setGlobalActiveUser(data.token, data.username);
      setCurrentUser(userSession);
      
      // Reset forms
      setLoginUsername('');
      setLoginPassword('');
      setIsRegisterMode(false);
    } catch (err) {
      setAuthError(err.message || 'Authentication failed');
    }
  };

  const handleLogout = () => {
    setGlobalActiveUser('', '');
    setCurrentUser(null);
    setShowProfileDropdown(false);
    setCurrentView('menu');
    resetDraft();
  };

  const handleMapChange = (e) => {
    const mapId = e.target.value;
    const foundMap = maps.find(m => m.id === mapId);
    if (foundMap) {
      setSelectedMap(foundMap);
    }
  };

  const selectSlot = (type, index) => {
    if (draftType === 'normal' && (type === 'allies_banned' || type === 'enemies_banned')) {
      return;
    }
    setActiveSlot({ type, index });
  };

  const clearSlot = (type, index, e) => {
    e.stopPropagation();
    const list = [...draft[type]];
    list[index] = null;
    setDraft({ ...draft, [type]: list });
  };

  const getDraftSteps = (type = draftType, firstPick = firstPickTeam) => {
    const steps = [];
    if (type === 'ranked') {
      // 3 Allies bans
      steps.push(
        { type: 'allies_banned', index: 0 },
        { type: 'allies_banned', index: 1 },
        { type: 'allies_banned', index: 2 },
        // 3 Enemies bans
        { type: 'enemies_banned', index: 0 },
        { type: 'enemies_banned', index: 1 },
        { type: 'enemies_banned', index: 2 }
      );
      
      // 1-2-2-1 picks
      if (firstPick === 'allies') {
        steps.push(
          { type: 'allies_picked', index: 0 },
          { type: 'enemies_picked', index: 0 },
          { type: 'enemies_picked', index: 1 },
          { type: 'allies_picked', index: 1 },
          { type: 'allies_picked', index: 2 },
          { type: 'enemies_picked', index: 2 }
        );
      } else {
        steps.push(
          { type: 'enemies_picked', index: 0 },
          { type: 'allies_picked', index: 0 },
          { type: 'allies_picked', index: 1 },
          { type: 'enemies_picked', index: 1 },
          { type: 'enemies_picked', index: 2 },
          { type: 'allies_picked', index: 2 }
        );
      }
    } else {
      // Normal: Pick 1, 2, 3 Allies then Pick 1, 2, 3 Enemies
      steps.push(
        { type: 'allies_picked', index: 0 },
        { type: 'allies_picked', index: 1 },
        { type: 'allies_picked', index: 2 },
        { type: 'enemies_picked', index: 0 },
        { type: 'enemies_picked', index: 1 },
        { type: 'enemies_picked', index: 2 }
      );
    }
    return steps;
  };

  const handleFirstPickChange = (team) => {
    setFirstPickTeam(team);
    resetDraft(draftType, team);
  };

  const flipCoin = () => {
    const result = Math.random() < 0.5 ? 'allies' : 'enemies';
    handleFirstPickChange(result);
  };

  const placeBrawler = (brawler) => {
    const { type, index } = activeSlot;
    
    // Check if brawler is already picked
    const isPicked = [
      ...draft.allies_picked,
      ...draft.enemies_picked
    ].some(b => b && b.id === brawler.id);
    if (isPicked) return;

    // Check ban status depending on active slot type
    if (type === 'allies_banned') {
      const isAlreadyBannedByAllies = draft.allies_banned.some(b => b && b.id === brawler.id);
      if (isAlreadyBannedByAllies) return;
    } else if (type === 'enemies_banned') {
      const isAlreadyBannedByEnemies = draft.enemies_banned.some(b => b && b.id === brawler.id);
      if (isAlreadyBannedByEnemies) return;
    } else {
      // Pick slots: cannot select a brawler banned by either team
      const isBanned = [
        ...draft.allies_banned,
        ...draft.enemies_banned
      ].some(b => b && b.id === brawler.id);
      if (isBanned) return;
    }

    const list = [...draft[type]];
    list[index] = brawler;

    const newDraft = { ...draft, [type]: list };
    setDraft(newDraft);
    advanceSlot(type, index, newDraft);
  };

  const advanceSlot = (type, index, currentDraft) => {
    const steps = getDraftSteps();
    const currentStepIdx = steps.findIndex(s => s.type === type && s.index === index);
    if (currentStepIdx === -1) return;

    let nextStep = null;
    for (let i = currentStepIdx + 1; i < steps.length; i++) {
      const step = steps[i];
      if (!currentDraft[step.type][step.index]) {
        nextStep = step;
        break;
      }
    }
    
    if (!nextStep) {
      for (let i = 0; i < currentStepIdx; i++) {
        const step = steps[i];
        if (!currentDraft[step.type][step.index]) {
          nextStep = step;
          break;
        }
      }
    }

    if (nextStep) {
      setActiveSlot({ type: nextStep.type, index: nextStep.index });
    }
  };

  const resetDraft = (type = draftType, firstPick = firstPickTeam) => {
    setDraft({
      allies_banned: [null, null, null],
      enemies_banned: [null, null, null],
      allies_picked: [null, null, null],
      enemies_picked: [null, null, null],
    });
    const steps = getDraftSteps(type, firstPick);
    if (steps.length > 0) {
      setActiveSlot({ type: steps[0].type, index: steps[0].index });
    }
  };

  const openLogMatch = () => {
    const myPick = draft.allies_picked.find(Boolean) || null;
    setMyBrawler(myPick);

    const enemies = draft.enemies_picked.filter(Boolean);
    const initialPerceptions = {};
    enemies.forEach(enemy => {
      initialPerceptions[enemy.id] = 0;
    });
    setOpponentPerceptions(initialPerceptions);
    setShowMatchLogger(true);
  };

  const submitMatch = async () => {
    if (!selectedMap || !myBrawler) return;

    try {
      const matchPayload = {
        map_id: selectedMap.id,
        my_brawler_id: myBrawler.id,
        mode: selectedMap.mode,
        result: matchResult,
        draft_events: []
      };

      let order = 1;
      const addEvents = (list, type, team) => {
        list.forEach(b => {
          if (b) {
            matchPayload.draft_events.push({
              type: type,
              brawler_id: b.id,
              team: team,
              order: order++
            });
          }
        });
      };

      addEvents(draft.allies_banned, 'ban', 'allied');
      addEvents(draft.enemies_banned, 'ban', 'enemy');
      addEvents(draft.allies_picked, 'pick', 'allied');
      addEvents(draft.enemies_picked, 'pick', 'enemy');

      await api.saveMatch(matchPayload);

      for (const [enemyId, ratingVal] of Object.entries(opponentPerceptions)) {
        await api.savePerception(myBrawler.id, enemyId, ratingVal);
      }

      setShowMatchLogger(false);
      resetDraft();
      loadUserStats();
      alert("Match and matchup perceptions logged successfully!");
    } catch (err) {
      console.error(err);
      alert("Failed to save match logs.");
    }
  };

  const filteredBrawlers = brawlers.filter(b => {
    const matchesSearch = b.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesClass = selectedClass === 'All' || b.class_name === selectedClass;
    return matchesSearch && matchesClass;
  });

  const brawlerClasses = ['All', 'Damage Dealer', 'Tank', 'Marksman', 'Assassin', 'Support', 'Controller', 'Artillery'];

  // Auth Guard
  if (!currentUser) {
    return (
      <div className="login-screen">
        <div className="login-card glass-panel">
          <h1>BRAWL STATS</h1>
          <p className="subtitle">Game Hub & Analytics</p>
          
          <form onSubmit={handleLoginSubmit} className="login-form">
            {authError && <div className="auth-error-banner">{authError}</div>}
            
            <div className="form-group">
              <label htmlFor="username-input">Player Username:</label>
              <input 
                id="username-input"
                type="text" 
                placeholder="e.g. Player1, DraftKing" 
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                className="search-input"
                required
                autoFocus
              />
            </div>

            <div className="form-group">
              <label htmlFor="password-input">Password:</label>
              <input 
                id="password-input"
                type="password" 
                placeholder="••••••••" 
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="search-input"
                required
              />
            </div>

            <button type="submit" className="btn btn-primary login-btn">
              {isRegisterMode ? 'Create Account & Enter' : 'Sign In & Enter'}
            </button>

            <button 
              type="button" 
              className="btn-link-toggle"
              onClick={() => {
                setIsRegisterMode(!isRegisterMode);
                setAuthError('');
              }}
              style={{ background: 'none', border: 'none', color: 'var(--color-ally)', cursor: 'pointer', fontSize: '12px', marginTop: '5px', textDecoration: 'underline' }}
            >
              {isRegisterMode ? 'Already have an account? Sign In' : "Don't have an account? Register Profile"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Backend connection failure banner */}
      {!backendConnected && (
        <div className="connection-error-banner pulse glow-enemy">
          ⚠️ Cannot connect to backend server. Please verify Django is running at http://localhost:8000/
          <button className="btn btn-sm btn-primary" onClick={loadCatalogs} style={{ marginLeft: '15px' }}>
            Retry
          </button>
        </div>
      )}

      {/* Header */}
      <header className="app-header glass-panel">
        <div className="logo-section">
          <h1>BRAWL STATS</h1>
          <p className="subtitle">Game Hub & Analytics</p>
        </div>

        <div className="header-actions-group" style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          {currentView === 'draft' && (
            <button className="btn btn-secondary" onClick={() => setCurrentView('menu')}>
              ◀ Exit Draft Tool
            </button>
          )}

          {/* Dynamic User Profile Selector */}
          <div className="profile-selector-menu">
            <button 
              className="btn btn-profile-trigger" 
              onClick={() => setShowProfileDropdown(!showProfileDropdown)}
            >
              👤 Player: <strong>{me?.name || currentUser.name}</strong> ▾
            </button>
            
            {showProfileDropdown && (
              <div className="profile-dropdown-menu glass-panel">
                <div className="dropdown-title">Session</div>
                <div style={{ padding: '8px 15px', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                  Logged in as <strong>{me?.name || currentUser.name}</strong>
                </div>
                <div className="dropdown-divider"></div>
                <button 
                  className="dropdown-item logout-btn"
                  onClick={handleLogout}
                >
                  🚪 Log Out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Grid / Dashboard Hub */}
      {currentView === 'draft' ? (
        <div className={`main-grid ${isLeftPanelCollapsed ? 'left-collapsed' : ''}`}>

        {/* Left Panel: History & Perceptions */}
        <section className={`left-panel glass-panel ${isLeftPanelCollapsed ? 'collapsed' : ''}`}>
          <button 
            type="button" 
            className="collapse-panel-btn"
            onClick={() => setIsLeftPanelCollapsed(!isLeftPanelCollapsed)}
            title={isLeftPanelCollapsed ? "Expand panel" : "Collapse panel"}
          >
            {isLeftPanelCollapsed ? "▶" : "◀"}
          </button>

          {!isLeftPanelCollapsed && (
            <>
              <h2>Player Performance</h2>

              <div className="stats-summary">
                <div className="stat-card">
                  <span className="stat-num">{matches.length}</span>
                  <span className="stat-lbl">Matches</span>
                </div>
                <div className="stat-card">
                  <span className="stat-num">
                    {matches.length > 0
                      ? `${Math.round((matches.filter(m => m.result === 'victory').length / matches.length) * 100)}%`
                      : 'N/A'
                    }
                  </span>
                  <span className="stat-lbl">Win Rate</span>
                </div>
              </div>

              <div className="history-section">
                <h3>Recent Matches</h3>
                <div className="match-list">
                  {matches.map((m) => (
                    <div key={m.id} className={`match-item ${m.result === 'victory' ? 'win' : 'loss'}`}>
                      <div className="match-info">
                        <span className="map-name">{m.map_id}</span>
                        <span className="mode-lbl">{m.mode}</span>
                      </div>
                      <div className="match-result">
                        <span className="brawler-played">{m.my_brawler_id}</span>
                        <span className="result-badge">{m.result.toUpperCase()}</span>
                      </div>
                    </div>
                  ))}
                  {matches.length === 0 && <p className="empty-msg">No matches logged yet.</p>}
                </div>
              </div>

              <div className="perceptions-section">
                <h3>Matchup Comforts</h3>
                <div className="perception-list">
                  {perceptions.map((p) => (
                    <div key={p.id} className="perception-item">
                      <span className="my-b">{p.my_brawler_id}</span>
                      <span className="vs-lbl">vs</span>
                      <span className="rival-b">{p.brawler_rival_id}</span>
                      <span className={`rating-badge val-${p.value}`}>
                        {p.value === 1 && 'Easy'}
                        {p.value === 0 && 'Neutral'}
                        {p.value === -1 && 'Hard'}
                        {p.value === -2 && 'Counter'}
                      </span>
                    </div>
                  ))}
                  {perceptions.length === 0 && <p className="empty-msg">No perceptions rated yet.</p>}
                </div>
              </div>
            </>
          )}
        </section>

        {/* Center Panel: Interactive Draft Lobby */}
        <section className="center-panel">

          {/* Map Select */}
          <div className="map-selector-bar glass-panel">
            <label>Map:</label>
            <button 
              type="button" 
              className="map-selector-btn"
              onClick={() => {
                setMapSearchQuery('');
                setShowMapModal(true);
              }}
            >
              {selectedMap?.image_url && (
                <img 
                  src={selectedMap.image_url} 
                  alt={selectedMap.name} 
                  className="map-btn-thumb" 
                />
              )}
              <div className="map-btn-info">
                <span className="map-btn-name">{selectedMap?.name || 'Select a Map'}</span>
                <span className="map-btn-mode">{selectedMap?.mode || 'No mode'}</span>
              </div>
              <span className="map-btn-chevron">▼</span>
            </button>
          </div>

          {/* Coin Flip Selector / Indicator */}
          {draftType === 'ranked' && (
            <div className="coin-flip-bar glass-panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '15px', marginBottom: '15px', padding: '10px' }}>
              <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--color-text-muted)', letterSpacing: '0.5px' }}>FIRST PICK:</span>
              <button
                type="button"
                className={`btn-coin ${firstPickTeam === 'allies' ? 'active' : ''}`}
                onClick={() => handleFirstPickChange('allies')}
                style={{
                  padding: '5px 12px',
                  borderRadius: '6px',
                  border: '1px solid',
                  borderColor: firstPickTeam === 'allies' ? 'var(--color-ally)' : 'var(--border-glass)',
                  background: firstPickTeam === 'allies' ? 'rgba(0, 229, 255, 0.15)' : 'transparent',
                  color: firstPickTeam === 'allies' ? '#fff' : 'var(--color-text-muted)',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: '600',
                  transition: 'all 0.2s ease'
                }}
              >
                🔵 Blue Team (Allies)
              </button>
              <button
                type="button"
                className={`btn-coin ${firstPickTeam === 'enemies' ? 'active' : ''}`}
                onClick={() => handleFirstPickChange('enemies')}
                style={{
                  padding: '5px 12px',
                  borderRadius: '6px',
                  border: '1px solid',
                  borderColor: firstPickTeam === 'enemies' ? 'var(--color-enemy)' : 'var(--border-glass)',
                  background: firstPickTeam === 'enemies' ? 'rgba(255, 0, 127, 0.15)' : 'transparent',
                  color: firstPickTeam === 'enemies' ? '#fff' : 'var(--color-text-muted)',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: '600',
                  transition: 'all 0.2s ease'
                }}
              >
                🔴 Red Team (Enemies)
              </button>
            </div>
          )}

          {/* Draft Selection HUD */}
          <div className="draft-hud glass-panel">
            <div className="allies-column">
              <h3>Blue Team (Allies)</h3>

              {draftType === 'ranked' && (
                <div className="slots-row bans small-bans">
                  {draft.allies_banned.map((b, idx) => (
                    <div
                      key={`ally-ban-${idx}`}
                      className={`draft-slot ban-slot ${activeSlot.type === 'allies_banned' && activeSlot.index === idx ? 'active-slot glow-ally' : ''}`}
                      onClick={() => selectSlot('allies_banned', idx)}
                    >
                      {b ? (
                        <div className="filled-slot">
                          <img src={b.image_url} alt={b.name} className="banned-img" />
                          <button className="clear-btn" onClick={(e) => clearSlot('allies_banned', idx, e)}>×</button>
                        </div>
                      ) : (
                        <span className="slot-placeholder">BAN {idx + 1}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="slots-row picks">
                {draft.allies_picked.map((b, idx) => (
                  <div
                    key={`ally-pick-${idx}`}
                    className={`draft-slot pick-slot ${activeSlot.type === 'allies_picked' && activeSlot.index === idx ? 'active-slot glow-ally' : ''}`}
                    onClick={() => selectSlot('allies_picked', idx)}
                  >
                    {b ? (
                      <div className="filled-slot">
                        <img src={b.image_url} alt={b.name} />
                        <span className="slot-name">{b.name}</span>
                        <button className="clear-btn" onClick={(e) => clearSlot('allies_picked', idx, e)}>×</button>
                      </div>
                    ) : (
                      <span className="slot-placeholder">PICK {idx + 1}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="enemies-column">
              <h3>Red Team (Enemies)</h3>

              {draftType === 'ranked' && (
                <div className="slots-row bans small-bans">
                  {draft.enemies_banned.map((b, idx) => (
                    <div
                      key={`enemy-ban-${idx}`}
                      className={`draft-slot ban-slot ${activeSlot.type === 'enemies_banned' && activeSlot.index === idx ? 'active-slot glow-enemy' : ''}`}
                      onClick={() => selectSlot('enemies_banned', idx)}
                    >
                      {b ? (
                        <div className="filled-slot">
                          <img src={b.image_url} alt={b.name} className="banned-img" />
                          <button className="clear-btn" onClick={(e) => clearSlot('enemies_banned', idx, e)}>×</button>
                        </div>
                      ) : (
                        <span className="slot-placeholder">BAN {idx + 1}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="slots-row picks">
                {draft.enemies_picked.map((b, idx) => (
                  <div
                    key={`enemy-pick-${idx}`}
                    className={`draft-slot pick-slot ${activeSlot.type === 'enemies_picked' && activeSlot.index === idx ? 'active-slot glow-enemy' : ''}`}
                    onClick={() => selectSlot('enemies_picked', idx)}
                  >
                    {b ? (
                      <div className="filled-slot">
                        <img src={b.image_url} alt={b.name} />
                        <span className="slot-name">{b.name}</span>
                        <button className="clear-btn" onClick={(e) => clearSlot('enemies_picked', idx, e)}>×</button>
                      </div>
                    ) : (
                      <span className="slot-placeholder">PICK {idx + 1}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Brawler Selector Grid */}
          <div className="brawler-selector-container glass-panel">
            <div className="filter-controls">
              <input
                type="text"
                placeholder="Search Brawler..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-input"
              />
              <div className="class-tabs">
                {brawlerClasses.map(cls => (
                  <button
                    key={cls}
                    className={`tab-btn ${selectedClass === cls ? 'active' : ''}`}
                    onClick={() => setSelectedClass(cls)}
                  >
                    {cls}
                  </button>
                ))}
              </div>
            </div>

            <div className="brawler-grid">
              {filteredBrawlers.map(b => {
                const isPicked = [
                  ...draft.allies_picked,
                  ...draft.enemies_picked
                ].some(p => p && p.id === b.id);

                let isBanned = false;
                if (activeSlot.type === 'allies_banned') {
                  isBanned = draft.allies_banned.some(ban => ban && ban.id === b.id);
                } else if (activeSlot.type === 'enemies_banned') {
                  isBanned = draft.enemies_banned.some(ban => ban && ban.id === b.id);
                } else {
                  isBanned = [
                    ...draft.allies_banned,
                    ...draft.enemies_banned
                  ].some(ban => ban && ban.id === b.id);
                }

                return (
                  <div
                    key={b.id}
                    className={`brawler-card ${isBanned ? 'banned-card' : ''} ${isPicked ? 'picked-card' : ''}`}
                    onClick={() => placeBrawler(b)}
                  >
                    <img src={b.image_url} alt={b.name} />
                    <span className="brawler-name">{b.name}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="action-buttons-row">
            <button className="btn btn-danger" onClick={resetDraft}>Reset Draft</button>
            <button
              className="btn btn-primary"
              onClick={openLogMatch}
              disabled={!draft.allies_picked.some(Boolean)}
            >
              Log Finished Match
            </button>
          </div>
        </section>

        {/* Right Panel: Recommendations Suggestions */}
        <section className="right-panel glass-panel">
          <h2>Suggestions</h2>
          <p className="suggestions-meta">Powered by Bayesian Smoothing</p>

          <div className="suggestions-list">
            {suggestions.map((item, index) => (
              <div
                key={item.brawler.id}
                className={`suggestion-card ${index < 3 ? 'top-pick glow-gold' : ''}`}
              >
                <div className="suggestion-rank">#{index + 1}</div>
                <img src={item.brawler.image_url} alt={item.brawler.name} className="sug-img" />

                <div className="suggestion-details">
                  <span className="sug-name">{item.brawler.name}</span>
                  <span className="sug-class">{item.brawler.class_name}</span>
                </div>

                <div className="suggestion-score-container">
                  <span className="sug-score">{item.score.toFixed(3)}</span>
                  <div className="tooltip-breakdown">
                    <p><strong>Breakdown:</strong></p>
                    <p>A (Win rate): {item.components.A_adjusted_win_rate}</p>
                    <p>B (Matchup): {item.components.B_matchup_factor}</p>
                    <p>C (Synergy): {item.components.C_synergy_factor}</p>
                    <p>D (Meta): {item.components.D_meta_relevance}</p>
                    <p>E (Confidence): {item.components.E_confidence_penalty}</p>
                  </div>
                </div>
              </div>
            ))}

            {suggestions.length === 0 && (
              <div className="suggestions-placeholder">
                <div className="pulse">💡</div>
                <p>Select a Map and assign picks/bans to load suggestions in real time.</p>
              </div>
            )}
          </div>
        </section>
      </div>
      ) : (
        <div className="welcome-menu-container">
          <div className="welcome-card glass-panel">
            <h2>Welcome, {me?.name || currentUser.name}!</h2>
            <p className="welcome-subtitle">Brawl Stats Game Hub</p>
            
            <div className="menu-options-grid">
              <button 
                className="menu-card btn-enter-draft ranked-draft-btn" 
                onClick={() => enterDraftMode('ranked')}
                style={{ width: '100%' }}
              >
                <div className="menu-card-icon">🏆</div>
                <div className="menu-card-details">
                  <h3>Competitive Draft (Ranked)</h3>
                  <p>Draft with Bans using the active Ranked seasonal map rotation.</p>
                </div>
              </button>
              
              <button 
                className="menu-card btn-enter-draft normal-draft-btn" 
                onClick={() => enterDraftMode('normal')}
                style={{ width: '100%', marginTop: '10px' }}
              >
                <div className="menu-card-icon">🎮</div>
                <div className="menu-card-details">
                  <h3>Normal Draft (No Bans)</h3>
                  <p>Draft without Bans using all available maps in the database.</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}



      {/* Post-Game Logger Modal */}
      {showMatchLogger && (
        <div className="modal-backdrop">
          <div className="modal-content glass-panel">
            <h2>Log Finished Match</h2>

            <div className="modal-form-group">
              <label>Result:</label>
              <div className="result-toggle">
                <button
                  className={`btn ${matchResult === 'victory' ? 'btn-primary' : ''}`}
                  onClick={() => setMatchResult('victory')}
                >
                  Victory
                </button>
                <button
                  className={`btn ${matchResult === 'defeat' ? 'btn-danger' : ''}`}
                  onClick={() => setMatchResult('defeat')}
                >
                  Defeat
                </button>
              </div>
            </div>

            <div className="modal-form-group">
              <label>My Brawler:</label>
              <select
                value={myBrawler?.id || ''}
                onChange={(e) => setMyBrawler(brawlers.find(b => b.id === e.target.value))}
              >
                {draft.allies_picked.filter(Boolean).map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>

            <div className="opponents-rating-section">
              <h3>Faced Opponents: Subjective Rating</h3>
              <p className="subtitle">Rate how hard it felt to play your brawler against them</p>

              <div className="opponents-list-rating">
                {draft.enemies_picked.filter(Boolean).map(enemy => (
                  <div key={enemy.id} className="opponent-rating-row">
                    <div className="opponent-info">
                      <img src={enemy.image_url} alt={enemy.name} />
                      <span>{enemy.name}</span>
                    </div>
                    <div className="rating-buttons">
                      {[
                        { val: 1, label: 'Easy' },
                        { val: 0, label: 'Neutral' },
                        { val: -1, label: 'Hard' },
                        { val: -2, label: 'Counter' }
                      ].map(opt => (
                        <button
                          key={opt.val}
                          className={`btn btn-sm ${opponentPerceptions[enemy.id] === opt.val ? 'btn-primary' : ''}`}
                          onClick={() => setOpponentPerceptions({
                            ...opponentPerceptions,
                            [enemy.id]: opt.val
                          })}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn" onClick={() => setShowMatchLogger(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={submitMatch}>Submit Logs</button>
            </div>
          </div>
        </div>
      )}

      {/* Map Selector Modal */}
      {showMapModal && (
        <div className="map-selector-modal-backdrop" onClick={() => setShowMapModal(false)}>
          <div className="map-selector-modal glass-panel" onClick={(e) => e.stopPropagation()}>
            <div className="map-modal-header">
              <h2>Select Map</h2>
              <button className="close-btn" onClick={() => setShowMapModal(false)}>&times;</button>
            </div>
            
            <div className="map-modal-tabs">
              {['All', 'Brawl Ball', 'Gem Grab', 'Heist', 'Hot Zone', 'Knockout', 'Bounty'].map(mode => (
                <button
                  key={mode}
                  type="button"
                  className={`map-tab-btn ${mapFilterMode === mode ? 'active' : ''}`}
                  onClick={() => setMapFilterMode(mode)}
                >
                  {mode}
                </button>
              ))}
            </div>

            <div className="map-search-bar" style={{ padding: '12px 24px', borderBottom: '1px solid var(--border-glass)', flexShrink: 0 }}>
              <input
                type="text"
                placeholder="Search map by name..."
                value={mapSearchQuery}
                onChange={(e) => setMapSearchQuery(e.target.value)}
                className="search-input"
                style={{
                  width: '100%',
                  padding: '10px 16px',
                  fontSize: '0.9rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-glass)',
                  background: 'rgba(0,0,0,0.2)',
                  color: '#fff',
                  outline: 'none',
                  transition: 'all 0.2s ease'
                }}
              />
            </div>

            <div className="map-modal-content">
              <div className="map-grid">
                {maps
                  .filter(m => mapFilterMode === 'All' || m.mode === mapFilterMode)
                  .filter(m => m.name.toLowerCase().includes(mapSearchQuery.toLowerCase()))
                  .map(m => (
                    <div 
                      key={m.id} 
                      className={`map-card ${selectedMap?.id === m.id ? 'active' : ''}`}
                      onClick={() => {
                        setSelectedMap(m);
                        setShowMapModal(false);
                      }}
                    >
                      <div className="map-card-img-wrapper">
                        {m.image_url ? (
                          <img src={m.image_url} alt={m.name} />
                        ) : (
                          <div className="map-placeholder">No Image</div>
                        )}
                      </div>
                      <div className="map-card-info">
                        <span className="map-card-name">{m.name}</span>
                        <span className="map-card-mode">{m.mode}</span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
