import { useState, useMemo, useCallback } from 'react';

export default function StatsDashboard({ matches = [], perceptions = [], brawlers = [], allMaps = [], onClose }) {
  // Filter States
  const [selectedMode, setSelectedMode] = useState('All');
  const [selectedDraftType, setSelectedDraftType] = useState('All');
  const [selectedClass, setSelectedClass] = useState('All');
  const [timeframe, setTimeframe] = useState('All'); // 'All', '10', '25'
  const [brawlerSort, setBrawlerSort] = useState('games'); // 'games', 'winrate', 'trophies'

  // Helpers
  const getBrawlerName = useCallback((id) => {
    const found = brawlers.find(b => String(b.id) === String(id));
    return found ? found.name : 'Unknown';
  }, [brawlers]);

  const getBrawlerAvatar = useCallback((id) => {
    const found = brawlers.find(b => String(b.id) === String(id));
    return found ? found.image_url : '';
  }, [brawlers]);

  const getBrawlerClass = useCallback((id) => {
    const found = brawlers.find(b => String(b.id) === String(id));
    return found ? found.class_name : '';
  }, [brawlers]);

  const getMapName = useCallback((id) => {
    const found = allMaps.find(m => String(m.id) === String(id));
    return found ? found.name : 'Unknown';
  }, [allMaps]);

  const getModeIcon = (mode) => {
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

  // List of game modes represented in matches
  const gameModesList = useMemo(() => {
    const modes = new Set(matches.map(m => m.mode).filter(Boolean));
    return ['All', ...Array.from(modes)];
  }, [matches]);

  const brawlerClasses = ['All', 'Damage Dealer', 'Tank', 'Marksman', 'Assassin', 'Support', 'Controller', 'Artillery'];

  // 1. Filtered Matches calculation
  const filteredMatches = useMemo(() => {
    // Sort matches chronologically descending (newest first)
    let sorted = [...matches].sort((a, b) => new Date(b.date) - new Date(a.date));

    // Apply Mode Filter
    if (selectedMode !== 'All') {
      sorted = sorted.filter(m => m.mode === selectedMode);
    }

    // Apply Draft Type Filter
    if (selectedDraftType !== 'All') {
      sorted = sorted.filter(m => m.draft_type === selectedDraftType.toLowerCase());
    }

    // Apply Brawler Class Filter
    if (selectedClass !== 'All') {
      sorted = sorted.filter(m => {
        const bClass = getBrawlerClass(m.my_brawler_id);
        return bClass === selectedClass;
      });
    }

    // Apply Timeframe Limit
    if (timeframe !== 'All') {
      const limit = parseInt(timeframe, 10);
      sorted = sorted.slice(0, limit);
    }

    return sorted;
  }, [matches, selectedMode, selectedDraftType, selectedClass, timeframe, getBrawlerClass]);

  // 2. KPI Calculations
  const kpis = useMemo(() => {
    const total = filteredMatches.length;
    if (total === 0) {
      return { winRate: 0, total: 0, mvpRate: 0, avgTrophies: 0, streak: 'None' };
    }

    const wins = filteredMatches.filter(m => m.result === 'victory').length;
    const mvps = filteredMatches.filter(m => m.is_star_player).length;

    // Average trophies
    const trophyMatches = filteredMatches.filter(m => m.my_brawler_trophies !== null && m.my_brawler_trophies > 0);
    const avgTrophies = trophyMatches.length > 0
      ? Math.round(trophyMatches.reduce((acc, m) => acc + m.my_brawler_trophies, 0) / trophyMatches.length)
      : 0;

    // Win/Loss Streak from chronological list (filteredMatches is newest first)
    let streakCount = 0;
    let streakType = null; // 'W' or 'L'

    for (let i = 0; i < filteredMatches.length; i++) {
      const isWin = filteredMatches[i].result === 'victory';
      if (i === 0) {
        streakType = isWin ? 'W' : 'L';
        streakCount = 1;
      } else {
        if ((isWin && streakType === 'W') || (!isWin && streakType === 'L')) {
          streakCount++;
        } else {
          break; // Streak broken
        }
      }
    }

    return {
      winRate: Math.round((wins / total) * 100),
      total,
      mvpRate: Math.round((mvps / total) * 100),
      avgTrophies,
      streak: `${streakCount} ${streakType === 'W' ? 'Win' : 'Loss'}${streakCount > 1 ? 's' : ''}`
    };
  }, [filteredMatches]);

  // 3. Stats by Brawler
  const brawlerStats = useMemo(() => {
    const groups = {};
    filteredMatches.forEach(m => {
      const bid = m.my_brawler_id;
      if (!bid) return;
      if (!groups[bid]) {
        groups[bid] = { id: bid, games: 0, wins: 0, mvps: 0, trophiesSum: 0, trophiesCount: 0 };
      }
      groups[bid].games++;
      if (m.result === 'victory') groups[bid].wins++;
      if (m.is_star_player) groups[bid].mvps++;
      if (m.my_brawler_trophies) {
        groups[bid].trophiesSum += m.my_brawler_trophies;
        groups[bid].trophiesCount++;
      }
    });

    const list = Object.values(groups).map(g => {
      const name = getBrawlerName(g.id);
      const avatar = getBrawlerAvatar(g.id);
      const bClass = getBrawlerClass(g.id);
      const winRate = Math.round((g.wins / g.games) * 100);
      const avgTrophies = g.trophiesCount > 0 ? Math.round(g.trophiesSum / g.trophiesCount) : 0;
      const mvpRate = Math.round((g.mvps / g.games) * 100);

      return {
        ...g,
        name,
        avatar,
        bClass,
        winRate,
        avgTrophies,
        mvpRate
      };
    });

    // Apply Sorting
    return list.sort((a, b) => {
      if (brawlerSort === 'winrate') {
        return b.winRate - a.winRate || b.games - a.games;
      }
      if (brawlerSort === 'trophies') {
        return b.avgTrophies - a.avgTrophies || b.games - a.games;
      }
      return b.games - a.games || b.winRate - a.winRate; // Default 'games'
    });
  }, [filteredMatches, brawlerSort, getBrawlerName, getBrawlerAvatar, getBrawlerClass]);

  // 4. Stats by Game Mode
  const gameModeStats = useMemo(() => {
    const groups = {};
    filteredMatches.forEach(m => {
      const mode = m.mode;
      if (!mode) return;
      if (!groups[mode]) {
        groups[mode] = { mode, games: 0, wins: 0 };
      }
      groups[mode].games++;
      if (m.result === 'victory') groups[mode].wins++;
    });

    return Object.values(groups)
      .map(g => ({
        ...g,
        winRate: Math.round((g.wins / g.games) * 100)
      }))
      .sort((a, b) => b.games - a.games);
  }, [filteredMatches]);

  // 5. Stats by Map
  const mapStats = useMemo(() => {
    const groups = {};
    filteredMatches.forEach(m => {
      const mapId = m.map_id;
      if (!mapId) return;
      if (!groups[mapId]) {
        groups[mapId] = { mapId, games: 0, wins: 0, mode: m.mode };
      }
      groups[mapId].games++;
      if (m.result === 'victory') groups[mapId].wins++;
    });

    return Object.values(groups)
      .map(g => ({
        ...g,
        name: getMapName(g.mapId),
        winRate: Math.round((g.wins / g.games) * 100)
      }))
      .sort((a, b) => b.games - a.games || b.winRate - a.winRate)
      .slice(0, 8); // Top 8 maps
  }, [filteredMatches, getMapName]);

  // 6. Matchup Comforts summary
  const perceptionStats = useMemo(() => {
    // Filter perceptions corresponding to the filtered matches
    const matchIds = new Set(filteredMatches.map(m => m.id));
    const relevantPerceptions = perceptions.filter(p => matchIds.has(p.match_id));

    const counts = { Easy: 0, Neutral: 0, Hard: 0, Counter: 0 };
    const rivalScores = {};

    relevantPerceptions.forEach(p => {
      if (p.value === 1) counts.Easy++;
      else if (p.value === 0) counts.Neutral++;
      else if (p.value === -1) counts.Hard++;
      else if (p.value === -2) counts.Counter++;

      const rival = p.brawler_rival_id;
      if (!rivalScores[rival]) {
        rivalScores[rival] = { id: rival, name: getBrawlerName(rival), avatar: getBrawlerAvatar(rival), sum: 0, count: 0 };
      }
      rivalScores[rival].sum += p.value;
      rivalScores[rival].count++;
    });

    // Find toughest rival brawlers (lowest average comfort)
    const toughest = Object.values(rivalScores)
      .filter(r => r.count >= 1)
      .map(r => ({
        ...r,
        avg: parseFloat((r.sum / r.count).toFixed(2))
      }))
      .sort((a, b) => a.avg - b.avg) // Lowest rating first
      .slice(0, 5);

    // Find easiest rival brawlers (highest average comfort)
    const easiest = Object.values(rivalScores)
      .filter(r => r.count >= 1)
      .map(r => ({
        ...r,
        avg: parseFloat((r.sum / r.count).toFixed(2))
      }))
      .sort((a, b) => b.avg - a.avg) // Highest rating first
      .slice(0, 5);

    return {
      total: relevantPerceptions.length,
      counts,
      toughest,
      easiest
    };
  }, [filteredMatches, perceptions, getBrawlerName, getBrawlerAvatar]);

  return (
    <div className="stats-dashboard-container">
      {/* Header with Exit button */}
      <div className="dashboard-header glass-panel">
        <div className="dashboard-title-section">
          <h2>📊 Personal Stats Dashboard</h2>
          <p className="welcome-subtitle">Advanced Analytics & Match History Insights</p>
        </div>
        <button className="btn btn-secondary" onClick={onClose}>
          ◀ Back to Main Menu
        </button>
      </div>

      {/* Filter Control Center */}
      <div className="filter-center glass-panel">
        <div className="filter-group-row">
          <div className="filter-control">
            <label>Game Mode</label>
            <select value={selectedMode} onChange={(e) => setSelectedMode(e.target.value)}>
              {gameModesList.map(mode => (
                <option key={mode} value={mode}>
                  {mode === 'All' ? '🎮 All Game Modes' : `${getModeIcon(mode)} ${mode}`}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-control">
            <label>Draft Type</label>
            <select value={selectedDraftType} onChange={(e) => setSelectedDraftType(e.target.value)}>
              <option value="All">🏆 All Formats</option>
              <option value="Ranked">Competitive (Ranked)</option>
              <option value="Normal">Normal (No Bans)</option>
            </select>
          </div>

          <div className="filter-control">
            <label>Brawler Class</label>
            <select value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)}>
              {brawlerClasses.map(cls => (
                <option key={cls} value={cls}>
                  {cls === 'All' ? '⚡ All Classes' : cls}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-control">
            <label>Timeframe Limit</label>
            <div className="timeframe-buttons">
              {[
                { val: 'All', lbl: 'All time' },
                { val: '25', lbl: 'Last 25' },
                { val: '10', lbl: 'Last 10' }
              ].map(opt => (
                <button
                  key={opt.val}
                  type="button"
                  className={`time-btn ${timeframe === opt.val ? 'active' : ''}`}
                  onClick={() => setTimeframe(opt.val)}
                >
                  {opt.lbl}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* KPI Section */}
      <div className="kpi-grid">
        <div className="kpi-card glass-panel glow-ally">
          <div className="kpi-icon-wrapper circle-ally">🏆</div>
          <div className="kpi-details">
            <span className="kpi-value">{kpis.winRate}%</span>
            <span className="kpi-label">Win Rate</span>
            <div className="kpi-bar-track">
              <div className="kpi-bar-fill ally-bg" style={{ width: `${kpis.winRate}%` }}></div>
            </div>
          </div>
        </div>

        <div className="kpi-card glass-panel">
          <div className="kpi-icon-wrapper circle-grey">⚔️</div>
          <div className="kpi-details">
            <span className="kpi-value">{kpis.total}</span>
            <span className="kpi-label">Games Played</span>
            <span className="kpi-subtext">Filtered Matches</span>
          </div>
        </div>

        <div className="kpi-card glass-panel glow-gold">
          <div className="kpi-icon-wrapper circle-gold">👑</div>
          <div className="kpi-details">
            <span className="kpi-value">{kpis.mvpRate}%</span>
            <span className="kpi-label">MVP (Star Player) Rate</span>
            <div className="kpi-bar-track">
              <div className="kpi-bar-fill gold-bg" style={{ width: `${kpis.mvpRate}%` }}></div>
            </div>
          </div>
        </div>

        <div className="kpi-card glass-panel">
          <div className="kpi-icon-wrapper circle-blue">🏆</div>
          <div className="kpi-details">
            <span className="kpi-value">{kpis.avgTrophies || 'N/A'}</span>
            <span className="kpi-label">Avg Trawler Trophies</span>
            <span className="kpi-subtext">For logged games</span>
          </div>
        </div>

        <div className="kpi-card glass-panel glow-enemy">
          <div className="kpi-icon-wrapper circle-enemy">🔥</div>
          <div className="kpi-details">
            <span className="kpi-value">{kpis.streak}</span>
            <span className="kpi-label">Current Streak</span>
            <span className="kpi-subtext">Active Match Sequence</span>
          </div>
        </div>
      </div>

      {/* Main Stats Layout Grid */}
      <div className="dashboard-main-grid">
        
        {/* Left Side: Brawler performance table */}
        <div className="dashboard-section glass-panel brawlers-leaderboard">
          <div className="section-header">
            <h3>Brawler Performance</h3>
            <div className="sort-buttons">
              <button
                className={`btn btn-sm ${brawlerSort === 'games' ? 'btn-primary' : ''}`}
                onClick={() => setBrawlerSort('games')}
              >
                Games
              </button>
              <button
                className={`btn btn-sm ${brawlerSort === 'winrate' ? 'btn-primary' : ''}`}
                onClick={() => setBrawlerSort('winrate')}
              >
                Win Rate
              </button>
              <button
                className={`btn btn-sm ${brawlerSort === 'trophies' ? 'btn-primary' : ''}`}
                onClick={() => setBrawlerSort('trophies')}
              >
                Trophies
              </button>
            </div>
          </div>

          <div className="table-wrapper">
            {brawlerStats.length === 0 ? (
              <div className="empty-msg">No brawlers matching filters.</div>
            ) : (
              <table className="stats-table">
                <thead>
                  <tr>
                    <th>Brawler</th>
                    <th>Class</th>
                    <th>Games</th>
                    <th>Win Rate</th>
                    <th>Avg Trophies</th>
                    <th>MVP Count</th>
                  </tr>
                </thead>
                <tbody>
                  {brawlerStats.map(b => (
                    <tr key={b.id}>
                      <td>
                        <div className="brawler-td">
                          {b.avatar ? (
                            <img src={b.avatar} alt={b.name} className="brawler-avatar-small" />
                          ) : (
                            <div className="brawler-avatar-placeholder">👤</div>
                          )}
                          <span className="brawler-name-td">{b.name}</span>
                        </div>
                      </td>
                      <td className="class-td">{b.bClass || 'Unknown'}</td>
                      <td className="games-td">{b.games}</td>
                      <td>
                        <div className="winrate-td">
                          <span className={b.winRate >= 60 ? 'win-color' : b.winRate < 45 ? 'loss-color' : ''}>
                            {b.winRate}%
                          </span>
                          <div className="micro-bar">
                            <div
                              className={`micro-fill ${b.winRate >= 50 ? 'ally-bg' : 'enemy-bg'}`}
                              style={{ width: `${b.winRate}%` }}
                            ></div>
                          </div>
                        </div>
                      </td>
                      <td>{b.avgTrophies ? `${b.avgTrophies} 🏆` : 'N/A'}</td>
                      <td>
                        {b.mvps > 0 ? (
                          <span className="mvp-badge">👑 {b.mvps}</span>
                        ) : (
                          <span style={{ color: 'var(--color-text-muted)' }}>0</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right Side: Game Mode, Map & Perception Cards */}
        <div className="dashboard-sidebar">
          
          {/* Game Mode Performance */}
          <div className="dashboard-section glass-panel">
            <h3>Performance by Game Mode</h3>
            <div className="game-modes-grid" style={{ marginTop: '12px' }}>
              {gameModeStats.length === 0 ? (
                <div className="empty-msg">No mode statistics.</div>
              ) : (
                gameModeStats.map(g => (
                  <div key={g.mode} className="game-mode-stat-card">
                    <div className="mode-title-row">
                      <span className="mode-name">{getModeIcon(g.mode)} {g.mode}</span>
                      <span className="mode-games">{g.games} games</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px' }}>
                      <div className="kpi-bar-track" style={{ flex: 1, height: '8px' }}>
                        <div
                          className={`kpi-bar-fill ${g.winRate >= 50 ? 'ally-bg' : 'enemy-bg'}`}
                          style={{ width: `${g.winRate}%`, height: '100%' }}
                        ></div>
                      </div>
                      <span className="mode-winrate-pct">{g.winRate}% WR</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Map Performance */}
          <div className="dashboard-section glass-panel" style={{ marginTop: '20px' }}>
            <h3>Map Win Rates (Top Played)</h3>
            <div className="maps-stats-list" style={{ marginTop: '12px' }}>
              {mapStats.length === 0 ? (
                <div className="empty-msg">No map statistics.</div>
              ) : (
                mapStats.map(m => (
                  <div key={m.mapId} className="map-stat-row">
                    <div className="map-detail">
                      <span className="map-name-lbl">{m.name}</span>
                      <span className="map-mode-lbl">{getModeIcon(m.mode)} {m.mode}</span>
                    </div>
                    <div className="map-games-metric">
                      <span>{m.games} Games</span>
                      <span className={`map-wr-badge ${m.winRate >= 50 ? 'win-badge' : 'loss-badge'}`}>
                        {m.winRate}% WR
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Matchup Subjective Perceptions */}
          <div className="dashboard-section glass-panel" style={{ marginTop: '20px' }}>
            <h3>Matchup Comfort Profiles</h3>
            <p className="welcome-subtitle" style={{ fontSize: '11px', marginBottom: '12px' }}>
              Aggregated feelings from manual match logs
            </p>

            {perceptionStats.total === 0 ? (
              <div className="empty-msg">No perceptions logged in matches.</div>
            ) : (
              <div>
                {/* Distribution bars */}
                <div className="comfort-distribution" style={{ display: 'flex', height: '16px', borderRadius: '4px', overflow: 'hidden', marginBottom: '20px' }}>
                  {Object.entries(perceptionStats.counts).map(([label, count]) => {
                    const pct = perceptionStats.total > 0 ? (count / perceptionStats.total) * 100 : 0;
                    if (pct === 0) return null;
                    const colors = {
                      Easy: '#00e5ff',
                      Neutral: '#9ca3af',
                      Hard: '#ff6699',
                      Counter: '#ff0055'
                    };
                    return (
                      <div
                        key={label}
                        style={{ width: `${pct}%`, background: colors[label] }}
                        title={`${label}: ${count} logged (${Math.round(pct)}%)`}
                      ></div>
                    );
                  })}
                </div>

                <div className="comfort-legend" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--color-text-muted)', marginBottom: '15px' }}>
                  <span>🔵 Easy ({perceptionStats.counts.Easy})</span>
                  <span>⚪ Neutral ({perceptionStats.counts.Neutral})</span>
                  <span>💗 Hard ({perceptionStats.counts.Hard})</span>
                  <span>🔴 Counter ({perceptionStats.counts.Counter})</span>
                </div>

                {/* Easiest Matchups */}
                {perceptionStats.easiest.length > 0 && (
                  <div className="comfort-top-list" style={{ marginBottom: '15px' }}>
                    <h4 style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-ally)', marginBottom: '8px' }}>
                      Easiest Matchups (Avg Rating)
                    </h4>
                    {perceptionStats.easiest.map(r => (
                      <div key={`easy-rival-${r.id}`} className="rival-rating-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', marginBottom: '5px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <img src={r.avatar} alt={r.name} style={{ width: '18px', height: '18px', borderRadius: '50%' }} />
                          <span>{r.name}</span>
                        </div>
                        <span style={{ fontWeight: 'bold', color: 'var(--color-ally)' }}>
                          +{r.avg.toFixed(1)} ({r.count}x)
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Hardest Matchups */}
                {perceptionStats.toughest.length > 0 && (
                  <div className="comfort-top-list">
                    <h4 style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-enemy)', marginBottom: '8px' }}>
                      Hardest Opponent Rivals (Avg Rating)
                    </h4>
                    {perceptionStats.toughest.map(r => (
                      <div key={`hard-rival-${r.id}`} className="rival-rating-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', marginBottom: '5px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <img src={r.avatar} alt={r.name} style={{ width: '18px', height: '18px', borderRadius: '50%' }} />
                          <span>{r.name}</span>
                        </div>
                        <span style={{ fontWeight: 'bold', color: 'var(--color-enemy)' }}>
                          {r.avg.toFixed(1)} ({r.count}x)
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}
