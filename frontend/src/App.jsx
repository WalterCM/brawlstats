import React, { useState, useEffect } from 'react';
import { api, setGlobalActiveUser } from './services/api';
import './App.css';

function App() {
  // Authentication & Users
  const [currentUser, setCurrentUser] = useState({ id: 'walter-supabase-uid-999', name: 'Walter' });
  const [me, setMe] = useState(null);

  // Catalogs
  const [brawlers, setBrawlers] = useState([]);
  const [maps, setMaps] = useState([]);
  const [selectedMap, setSelectedMap] = useState(null);

  // Search
  const [searchQuery, setSearchQuery] = useState('');
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
  const [opponentPerceptions, setOpponentPerceptions] = useState({}); // { enemy_brawler_id: value }

  // Load catalogs on init
  useEffect(() => {
    loadCatalogs();
  }, [currentUser]);

  // Load recommendations whenever draft selections or map changes
  useEffect(() => {
    if (selectedMap) {
      loadSuggestions();
    } else {
      setSuggestions([]);
    }
  }, [draft, selectedMap]);

  const loadCatalogs = async () => {
    try {
      setGlobalActiveUser(currentUser.id, currentUser.name);
      
      // Load user details
      const playerProfile = await api.fetchMe();
      setMe(playerProfile);

      // Load catalogs
      const brawlerList = await api.fetchBrawlers();
      setBrawlers(brawlerList);

      const mapList = await api.fetchMaps(true); // Fetch ranked maps
      setMaps(mapList);
      if (mapList.length > 0 && !selectedMap) {
        setSelectedMap(mapList[0]);
      }

      // Load user statistics & perceptions
      loadUserStats();
    } catch (err) {
      console.error("Error loading catalogs:", err);
    }
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

  const switchUser = (id, name) => {
    setCurrentUser({ id, name });
  };

  const handleMapChange = (e) => {
    const mapId = e.target.value;
    const foundMap = maps.find(m => m.id === mapId);
    if (foundMap) {
      setSelectedMap(foundMap);
    }
  };

  // Click on a draft slot to set it active
  const selectSlot = (type, index) => {
    setActiveSlot({ type, index });
  };

  // Remove brawler from draft slot
  const clearSlot = (type, index, e) => {
    e.stopPropagation();
    const list = [...draft[type]];
    list[index] = null;
    setDraft({ ...draft, [type]: list });
  };

  // Click on a catalog brawler to place it in the active slot
  const placeBrawler = (brawler) => {
    // Check if brawler is already picked or banned in other slots
    const isUsed = [
      ...draft.allies_banned,
      ...draft.enemies_banned,
      ...draft.allies_picked,
      ...draft.enemies_picked
    ].some(b => b && b.id === brawler.id);

    if (isUsed) return; // Ignore if already used

    const list = [...draft[activeSlot.type]];
    list[activeSlot.index] = brawler;
    
    const newDraft = { ...draft, [activeSlot.type]: list };
    setDraft(newDraft);

    // Auto-advance slot logically
    advanceSlot(activeSlot.type, activeSlot.index, newDraft);
  };

  const advanceSlot = (type, index, currentDraft) => {
    const sequence = [
      { type: 'allies_banned', count: 3 },
      { type: 'enemies_banned', count: 3 },
      { type: 'allies_picked', count: 3 },
      { type: 'enemies_picked', count: 3 }
    ];

    let currentSeqIdx = sequence.findIndex(s => s.type === type);
    let nextIndex = index + 1;
    let nextType = type;

    if (nextIndex >= sequence[currentSeqIdx].count) {
      currentSeqIdx = (currentSeqIdx + 1) % sequence.length;
      nextType = sequence[currentSeqIdx].type;
      nextIndex = 0;
    }

    // Find first empty slot in that sequence or subsequent sequences
    let found = false;
    for (let s = 0; s < sequence.length; s++) {
      const checkSeq = sequence[(currentSeqIdx + s) % sequence.length];
      const checkType = checkSeq.type;
      const startIndex = (s === 0) ? nextIndex : 0;
      
      for (let i = startIndex; i < checkSeq.count; i++) {
        if (!currentDraft[checkType][i]) {
          setActiveSlot({ type: checkType, index: i });
          found = true;
          break;
        }
      }
      if (found) break;
    }
  };

  const resetDraft = () => {
    setDraft({
      allies_banned: [null, null, null],
      enemies_banned: [null, null, null],
      allies_picked: [null, null, null],
      enemies_picked: [null, null, null],
    });
    setActiveSlot({ type: 'allies_banned', index: 0 });
  };

  const openLogMatch = () => {
    // Default my_brawler to the first allied pick if available
    const myPick = draft.allies_picked.find(Boolean) || null;
    setMyBrawler(myPick);

    // Filter enemy brawlers to rate
    const enemies = draft.enemies_picked.filter(Boolean);
    const initialPerceptions = {};
    enemies.forEach(enemy => {
      initialPerceptions[enemy.id] = 0; // default to neutral
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

      // Populate draft events sequentially
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

      // 1. Save match logs
      await api.saveMatch(matchPayload);

      // 2. Save perceptions for enemy brawlers faced
      for (const [enemyId, ratingVal] of Object.entries(opponentPerceptions)) {
        await api.savePerception(myBrawler.id, enemyId, ratingVal);
      }

      // Cleanup
      setShowMatchLogger(false);
      resetDraft();
      loadUserStats();
      alert("Match and matchup perceptions logged successfully!");
    } catch (err) {
      console.error(err);
      alert("Failed to save match logs.");
    }
  };

  // Filtering Catalog Brawlers
  const filteredBrawlers = brawlers.filter(b => {
    const matchesSearch = b.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesClass = selectedClass === 'All' || b.class_name === selectedClass;
    return matchesSearch && matchesClass;
  });

  const brawlerClasses = ['All', 'Damage Dealer', 'Tank', 'Marksman', 'Assassin', 'Support', 'Controller', 'Artillery'];

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header glass-panel">
        <div className="logo-section">
          <h1>BRAWL STARS</h1>
          <p className="subtitle">Ranked Draft HUD</p>
        </div>

        {/* User Account Toggles */}
        <div className="user-toggle-container">
          <button 
            className={`btn ${currentUser.name === 'Walter' ? 'btn-primary' : ''}`}
            onClick={() => switchUser('walter-supabase-uid-999', 'Walter')}
          >
            Walter
          </button>
          <button 
            className={`btn ${currentUser.name === 'Novia' ? 'btn-primary' : ''}`}
            onClick={() => switchUser('novia-supabase-uid-888', 'Novia')}
          >
            Novia
          </button>
          <div className="active-user-badge">
            Active: <span>{me?.name || currentUser.name}</span>
          </div>
        </div>
      </header>

      {/* Main Grid */}
      <div className="main-grid">
        
        {/* Left Panel: History & Perceptions */}
        <section className="left-panel glass-panel">
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
        </section>

        {/* Center Panel: Interactive Draft Lobby */}
        <section className="center-panel">
          
          {/* Map Select */}
          <div className="map-selector-bar glass-panel">
            <label htmlFor="map-select">Ranked Map:</label>
            <select id="map-select" value={selectedMap?.id || ''} onChange={handleMapChange}>
              {maps.map(m => (
                <option key={m.id} value={m.id}>{m.name} ({m.mode})</option>
              ))}
            </select>
          </div>

          {/* Draft Selection HUD */}
          <div className="draft-hud glass-panel">
            <div className="allies-column">
              <h3>Blue Team (Allies)</h3>
              
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

              <div className="slots-row bans">
                {draft.allies_banned.map((b, idx) => (
                  <div 
                    key={`ally-ban-${idx}`}
                    className={`draft-slot ban-slot ${activeSlot.type === 'allies_banned' && activeSlot.index === idx ? 'active-slot glow-ally' : ''}`}
                    onClick={() => selectSlot('allies_banned', idx)}
                  >
                    {b ? (
                      <div className="filled-slot">
                        <img src={b.image_url} alt={b.name} className="banned-img" />
                        <span className="slot-name">{b.name}</span>
                        <button className="clear-btn" onClick={(e) => clearSlot('allies_banned', idx, e)}>×</button>
                      </div>
                    ) : (
                      <span className="slot-placeholder">BAN {idx + 1}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="enemies-column">
              <h3>Red Team (Enemies)</h3>
              
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

              <div className="slots-row bans">
                {draft.enemies_banned.map((b, idx) => (
                  <div 
                    key={`enemy-ban-${idx}`}
                    className={`draft-slot ban-slot ${activeSlot.type === 'enemies_banned' && activeSlot.index === idx ? 'active-slot glow-enemy' : ''}`}
                    onClick={() => selectSlot('enemies_banned', idx)}
                  >
                    {b ? (
                      <div className="filled-slot">
                        <img src={b.image_url} alt={b.name} className="banned-img" />
                        <span className="slot-name">{b.name}</span>
                        <button className="clear-btn" onClick={(e) => clearSlot('enemies_banned', idx, e)}>×</button>
                      </div>
                    ) : (
                      <span className="slot-placeholder">BAN {idx + 1}</span>
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
              {filteredBrawlers.map(b => (
                <div 
                  key={b.id} 
                  className="brawler-card"
                  onClick={() => placeBrawler(b)}
                >
                  <img src={b.image_url} alt={b.name} />
                  <span className="brawler-name">{b.name}</span>
                </div>
              ))}
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
    </div>
  );
}

export default App;
