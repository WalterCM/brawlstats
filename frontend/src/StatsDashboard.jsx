import { useState, useMemo, useCallback, useEffect } from 'react';
import { useFilters } from './context/FilterContext';
import { getRankById, getRankIconUrl } from './utils/helpers';
import { filterByTimeRange, filterByLevel } from './utils/matchFilters';
import MatchFilterBar from './components/MatchFilterBar';

export default function StatsDashboard({ matches = [], perceptions = [], brawlers = [], allMaps = [], brawlerMeta = [], minNormalTrophies = 750, onClose, onBrawlerClick, onMapClick, onModeClick, onBrowseMaps, playerName, playerAvatar, playerTag, isOwnProfile = true }) {
  const {
    selectedMode,
    setSelectedMode,
    selectedDraftType,
    setSelectedDraftType,
    selectedClass,
    setSelectedClass,
    timeRange,
    setTimeRange,
    levelMin,
    setLevelMin,
    levelMax,
    setLevelMax,
    selectedTiers,
    setSelectedTiers
  } = useFilters();
  const [brawlerSort, setBrawlerSort] = useState('games'); // 'games', 'winrate', 'trophies'
  const [brawlerPage, setBrawlerPage] = useState(0);
  const [sessionPage, setSessionPage] = useState(0);
  const [showVisuals, setShowVisuals] = useState(true);

  useEffect(() => { setBrawlerPage(0); }, [brawlerSort, selectedMode, selectedDraftType, selectedClass, timeRange]);

  // Global meta lookup
  const globalWRLookup = useMemo(() => {
    const map = {};
    brawlerMeta.forEach(rec => {
      const id = String(rec.brawler_id);
      if (!map[id]) map[id] = { sum: 0, count: 0 };
      map[id].sum += rec.win_rate;
      map[id].count++;
    });
    const result = {};
    Object.entries(map).forEach(([id, v]) => { result[id] = Math.round((v.sum / v.count) * 100); });
    return result;
  }, [brawlerMeta]);

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

  const getMapData = useCallback((id) => {
    return allMaps.find(m => String(m.id) === String(id)) || null;
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
      const normSelected = selectedMode.toLowerCase().replace(/[^a-z0-9]/g, '');
      sorted = sorted.filter(m => m.mode && m.mode.toLowerCase().replace(/[^a-z0-9]/g, '') === normSelected);
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

    // Apply Time Range
    sorted = filterByTimeRange(sorted, timeRange);

    // Apply Level Filter
    sorted = filterByLevel(sorted, selectedDraftType !== 'All' ? selectedDraftType.toLowerCase() : null, {
      levelMin, levelMax, selectedTiers,
    });

    return sorted;
  }, [matches, selectedMode, selectedDraftType, selectedClass, timeRange, levelMin, levelMax, selectedTiers, getBrawlerClass]);

  // 2. KPI Calculations
  const kpis = useMemo(() => {
    const total = filteredMatches.length;
    if (total === 0) {
      return { winRate: 0, total: 0, mvpRate: 0, avgTrophies: 0, streak: 'None', playerRankId: null };
    }

    const wins = filteredMatches.filter(m => m.result === 'victory').length;
    const mvps = filteredMatches.filter(m => m.is_star_player).length;

    // Average trophies — ONLY normal matches (ranked reports rank level, not real trophies)
    const trophyMatches = filteredMatches.filter(
      m => m.my_brawler_trophies !== null && m.draft_type === 'normal'
    );

    // Player rank — most common rank level from ranked matches
    const rankedRanks = filteredMatches
      .filter(m => m.my_brawler_trophies && m.draft_type === 'ranked')
      .map(m => m.my_brawler_trophies);
    const rankFreq = {};
    rankedRanks.forEach(id => { rankFreq[id] = (rankFreq[id] || 0) + 1; });
    const playerRankId = rankedRanks.length > 0
      ? Object.entries(rankFreq).sort((a, b) => b[1] - a[1])[0][0]
      : null;
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

    // Only show streak if it's a win streak
    const streakDisplay = streakType === 'W'
      ? `${streakCount} Win${streakCount > 1 ? 's' : ''}`
      : null;

    const recent7dMatches = filteredMatches.filter(m => {
      const matchDate = new Date(m.date).getTime();
      return matchDate >= (Date.now() - 7 * 24 * 60 * 60 * 1000);
    });
    
    const recentWR = recent7dMatches.length > 0
      ? Math.round((recent7dMatches.filter(m => m.result === 'victory').length / recent7dMatches.length) * 100)
      : null;

    let trend = null;
    if (recentWR !== null && timeRange !== '1d' && timeRange !== '7d') {
      trend = recentWR - Math.round((wins / total) * 100);
    }

    return {
      winRate: Math.round((wins / total) * 100),
      total,
      mvpRate: Math.round((mvps / total) * 100),
      avgTrophies,
      streak: streakDisplay,
      playerRankId,
      trend,
    };
  }, [filteredMatches, timeRange]);

  // Format Dual KPIs calculation (overall)
  const formatKpis = useMemo(() => {
    const normalMatches = matches.filter(m => m.draft_type === 'normal');
    const rankedMatches = matches.filter(m => m.draft_type === 'ranked');

    const normalWins = normalMatches.filter(m => m.result === 'victory').length;
    const rankedWins = rankedMatches.filter(m => m.result === 'victory').length;

    const normalTrophies = normalMatches.filter(m => m.my_brawler_trophies !== null && m.my_brawler_trophies !== undefined);
    const avgNormalTrophies = normalTrophies.length > 0
      ? Math.round(normalTrophies.reduce((acc, m) => acc + m.my_brawler_trophies, 0) / normalTrophies.length)
      : 0;

    const rankedRanks = rankedMatches.filter(m => m.my_brawler_trophies).map(m => m.my_brawler_trophies);
    const rankFreq = {};
    rankedRanks.forEach(id => { rankFreq[id] = (rankFreq[id] || 0) + 1; });
    const playerRankId = rankedRanks.length > 0
      ? Object.entries(rankFreq).sort((a, b) => b[1] - a[1])[0][0]
      : null;

    return {
      normal: {
        total: normalMatches.length,
        winRate: normalMatches.length > 0 ? Math.round((normalWins / normalMatches.length) * 100) : 0,
        avgTrophies: avgNormalTrophies
      },
      ranked: {
        total: rankedMatches.length,
        winRate: rankedMatches.length > 0 ? Math.round((rankedWins / rankedMatches.length) * 100) : 0,
        rankId: playerRankId
      }
    };
  }, [matches]);

  // Smart Alerts calculation (last 7 days by class)
  const smartAlerts = useMemo(() => {
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recent = matches.filter(m => new Date(m.date).getTime() >= oneWeekAgo);
    
    const classStats = {};
    recent.forEach(m => {
      const bClass = getBrawlerClass(m.my_brawler_id);
      if (!bClass) return;
      if (!classStats[bClass]) {
        classStats[bClass] = { games: 0, wins: 0 };
      }
      classStats[bClass].games++;
      if (m.result === 'victory') {
        classStats[bClass].wins++;
      }
    });

    const alerts = [];
    Object.entries(classStats).forEach(([className, stats]) => {
      if (stats.games >= 3) {
        const wr = Math.round((stats.wins / stats.games) * 100);
        if (wr >= 65) {
          alerts.push({
            type: 'hot',
            text: `Hot Streak: You have a ${wr}% Win Rate playing ${className} brawlers in the last 7 days (${stats.games} matches)!`
          });
        } else if (wr <= 40) {
          alerts.push({
            type: 'cold',
            text: `Performance Alert: Your Win Rate with ${className} brawlers is ${wr}% in the last 7 days (${stats.games} matches).`
          });
        }
      }
    });
    return alerts;
  }, [matches, getBrawlerClass]);

  // 3. Stats by Brawler
  const brawlerStats = useMemo(() => {
    const groups = {};
    filteredMatches.forEach(m => {
      const bid = m.my_brawler_id;
      if (!bid) return;
      if (!groups[bid]) {
        groups[bid] = { id: bid, games: 0, wins: 0, mvps: 0, trophiesSum: 0, trophiesCount: 0, lastDraftType: null, lastTrophies: null };
      }
      groups[bid].games++;
      if (m.result === 'victory') groups[bid].wins++;
      if (m.is_star_player) groups[bid].mvps++;
      if (groups[bid].lastDraftType === null) {
        groups[bid].lastDraftType = m.draft_type;
        groups[bid].lastTrophies = m.my_brawler_trophies;
      }
      if (m.my_brawler_trophies !== null && m.draft_type === 'normal') {
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
        mvpRate,
        lastDraftType: g.lastDraftType,
        lastTrophies: g.lastTrophies,
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

  const BRAW_PAGE_SIZE = 10;
  const brawlerPageCount = Math.max(1, Math.ceil(brawlerStats.length / BRAW_PAGE_SIZE));
  const safeBrawlerPage = Math.min(brawlerPage, brawlerPageCount - 1);
  const paginatedBrawlers = brawlerStats.slice(safeBrawlerPage * BRAW_PAGE_SIZE, (safeBrawlerPage + 1) * BRAW_PAGE_SIZE);

  // Sparkline data per brawler (rolling WR points)
  const brawlerSparklines = useMemo(() => {
    const map = {};
    brawlerStats.forEach(b => {
      const bMatches = filteredMatches
        .filter(m => String(m.my_brawler_id) === String(b.id))
        .sort((a, d) => new Date(a.date) - new Date(d.date));
      if (bMatches.length < 3) { map[b.id] = []; return; }
      const pts = [];
      const windowSize = 5;
      for (let i = windowSize - 1; i < bMatches.length; i++) {
        const w = bMatches.slice(Math.max(0, i - windowSize + 1), i + 1);
        pts.push(Math.round((w.filter(m => m.result === 'victory').length / w.length) * 100));
      }
      map[b.id] = pts;
    });
    return map;
  }, [brawlerStats, filteredMatches]);

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
      .map(g => {
        const md = getMapData(g.mapId);
        return {
          ...g,
          name: md?.name || getMapName(g.mapId),
          image_url: md?.image_url || null,
          winRate: Math.round((g.wins / g.games) * 100)
        };
      })
      .sort((a, b) => b.games - a.games || b.winRate - a.winRate)
      .slice(0, 8); // Top 8 maps
  }, [filteredMatches, getMapName, getMapData]);

  // 6. Result Strip — oldest to latest (left to right)
  const resultStrip = useMemo(() => {
    return [...filteredMatches]
      .sort((a, b) => new Date(a.date) - new Date(b.date)) // oldest first
      .slice(-40); // take last 40
  }, [filteredMatches]);

  // 7. Rolling win rate (window of 5)
  const rollingWinRate = useMemo(() => {
    const sorted = [...filteredMatches].sort((a, b) => new Date(a.date) - new Date(b.date));
    const windowSize = 5;
    const pts = [];
    for (let i = windowSize - 1; i < sorted.length; i++) {
      const w = sorted.slice(Math.max(0, i - windowSize + 1), i + 1);
      pts.push(Math.round((w.filter(m => m.result === 'victory').length / w.length) * 100));
    }
    return pts;
  }, [filteredMatches]);

  // 8. Draft pick/ban frequency from ranked matches
  const draftFrequency = useMemo(() => {
    const freq = {};
    filteredMatches
      .filter(m => m.draft_type === 'ranked')
      .forEach(m => {
        (m.draft_events || []).forEach(evt => {
          const key = `${evt.brawler_id}__${evt.type}__${evt.team}`;
          if (!freq[key]) freq[key] = { brawler_id: evt.brawler_id, type: evt.type, team: evt.team, count: 0 };
          freq[key].count++;
        });
      });
    return Object.values(freq).sort((a, b) => b.count - a.count);
  }, [filteredMatches]);

  const topPicks = useMemo(() => {
    const picks = draftFrequency.filter(d => d.type === 'pick');
    const alliedPicks = picks.filter(d => d.team === 'allied').slice(0, 6);
    const enemyPicks = picks.filter(d => d.team === 'enemy').slice(0, 6);
    const bans = draftFrequency.filter(d => d.type === 'ban').slice(0, 6);
    return { allied: alliedPicks, enemy: enemyPicks, bans };
  }, [draftFrequency]);

  const maxPickCount = useMemo(() => Math.max(
    ...topPicks.allied.map(d => d.count),
    ...topPicks.enemy.map(d => d.count),
    ...topPicks.bans.map(d => d.count),
    1
  ), [topPicks]);

  return (
    <div className="stats-dashboard-container">
      <div className="dashboard-header glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', padding: '16px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {playerAvatar ? (
            <img 
              src={`https://cdn.brawlify.com/profile-icons/regular/${playerAvatar}.png`} 
              alt="" 
              style={{ width: '56px', height: '56px', borderRadius: '50%', border: '3px solid var(--accent-primary)', background: 'rgba(255,255,255,0.05)', flexShrink: 0 }}
            />
          ) : (
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(255,255,255,0.08)', border: '2px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', flexShrink: 0 }}>👤</div>
          )}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800 }}>
                {playerName || 'Player Profile'}
              </h2>
              <span className="mp-mode-badge" style={{ background: 'rgba(0, 229, 255, 0.12)', border: '1px solid rgba(0, 229, 255, 0.35)', color: '#00e5ff', fontSize: '11px', padding: '4px 10px', borderRadius: '20px', fontWeight: 'bold' }}>
                📊 Gameplay Insights
              </span>
            </div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', margin: '6px 0 0 0', fontSize: '0.8rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {playerTag && (
                <>
                  <span>Tag: <strong style={{ color: '#fff' }}>{playerTag}</strong></span>
                  <span>|</span>
                </>
              )}
              <span>Matches: <strong style={{ color: '#fff' }}>{matches.length}</strong></span>
              <span>|</span>
              <span>Account: <strong style={{ color: isOwnProfile ? 'var(--color-ally)' : 'var(--color-gold)' }}>{isOwnProfile ? 'Personal' : 'Club Member'}</strong></span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button 
            className="btn btn-secondary btn-sm" 
            onClick={() => setShowVisuals(!showVisuals)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', padding: '6px 12px' }}
          >
            {showVisuals ? '👁️ Hide Visual Analytics' : '👁️ Show Visual Analytics'}
          </button>
          {onClose && (
            <button className="btn btn-secondary" onClick={onClose}>
              ◀ Back to Home
            </button>
          )}
        </div>
      </div>

      {showVisuals && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '20px' }}>
          {/* KPI Section */}
          <div className="kpi-grid" style={{ marginBottom: 0 }}>
        <div className="kpi-card glass-panel glow-ally">
          <div className="kpi-icon-wrapper circle-ally">🏆</div>
          <div className="kpi-details">
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span className="kpi-value">{kpis.winRate}%</span>
              {/* {kpis.trend !== null && kpis.trend !== 0 && (
                <span style={{ fontSize: '11px', fontWeight: '800', color: kpis.trend > 0 ? 'var(--color-ally)' : 'var(--color-enemy)' }}>
                  {kpis.trend > 0 ? `▲ +${kpis.trend}%` : `▼ ${kpis.trend}%`} vs 7d
                </span>
              )} */}
            </div>
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
            <span className="kpi-label">Avg Brawler Trophies</span>
            <span className="kpi-subtext">Normal matches only</span>
          </div>
        </div>

        {kpis.playerRankId && (
          <div className="kpi-card glass-panel glow-gold">
            <div className="kpi-icon-wrapper" style={{ background: 'rgba(255, 215, 0, 0.15)', border: '2px solid #ffd700' }}>
              {getRankIconUrl(kpis.playerRankId) && (
                <img src={getRankIconUrl(kpis.playerRankId)} alt="" style={{ width: 28, height: 28 }} />
              )}
            </div>
            <div className="kpi-details">
              <span className="kpi-value" style={{ fontSize: '1.1rem' }}>
                {getRankById(kpis.playerRankId)?.name || kpis.playerRankId}
              </span>
              <span className="kpi-label">Current Rank</span>
              <span className="kpi-subtext">Most played rank level</span>
            </div>
          </div>
        )}

        {kpis.streak && (
          <div className="kpi-card glass-panel glow-enemy">
            <div className="kpi-icon-wrapper circle-enemy">🔥</div>
            <div className="kpi-details">
              <span className="kpi-value">{kpis.streak}</span>
              <span className="kpi-label">Win Streak 🔥</span>
              <span className="kpi-subtext">Active winning sequence</span>
            </div>
          </div>
        )}
      </div>

      {/* Format Comparison Section (Commented out per user request)
      {selectedDraftType === 'All' && (
        <div className="glass-panel" style={{ padding: '16px 20px', marginBottom: '20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
          <div>
            <h4 style={{ margin: '0 0 10px', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--color-text-muted)' }}>Casual Format (Normal)</h4>
            <div style={{ display: 'flex', gap: '25px' }}>
              <div>
                <div style={{ fontSize: '18px', fontWeight: '800', color: '#fff' }}>{formatKpis.normal.winRate}%</div>
                <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Win Rate</div>
              </div>
              <div>
                <div style={{ fontSize: '18px', fontWeight: '800', color: '#fff' }}>{formatKpis.normal.total}</div>
                <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Games</div>
              </div>
              <div>
                <div style={{ fontSize: '18px', fontWeight: '800', color: '#fff' }}>{formatKpis.normal.avgTrophies || 'N/A'}</div>
                <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Avg Trophies</div>
              </div>
            </div>
          </div>
          <div className="divider-left-mobile" style={{ borderLeft: '1px solid rgba(255,255,255,0.08)', paddingLeft: '20px' }}>
            <h4 style={{ margin: '0 0 10px', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--color-text-muted)' }}>Competitive Format (Ranked)</h4>
            <div style={{ display: 'flex', gap: '25px' }}>
              <div>
                <div style={{ fontSize: '18px', fontWeight: '800', color: '#fff' }}>{formatKpis.ranked.winRate}%</div>
                <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Win Rate</div>
              </div>
              <div>
                <div style={{ fontSize: '18px', fontWeight: '800', color: '#fff' }}>{formatKpis.ranked.total}</div>
                <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Games</div>
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  {formatKpis.ranked.rankId ? (
                    <>
                      {getRankIconUrl(formatKpis.ranked.rankId) && (
                        <img src={getRankIconUrl(formatKpis.ranked.rankId)} alt="" style={{ width: 18, height: 18 }} />
                      )}
                      <span style={{ fontSize: '14px', fontWeight: '800', color: '#fff' }}>
                        {getRankById(formatKpis.ranked.rankId)?.name.split(' ')[0] || formatKpis.ranked.rankId}
                      </span>
                    </>
                  ) : (
                    <span style={{ fontSize: '18px', fontWeight: '800', color: '#fff' }}>N/A</span>
                  )}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Top Rank</div>
              </div>
            </div>
          </div>
        </div>
      )}
      */}

      {/* Result Strip */}
      {isOwnProfile && resultStrip.length > 0 && (
        <div className="glass-panel" style={{ padding: '16px 20px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <h3 style={{ margin: 0, fontSize: '14px' }}>🟢🔴 Match History Strip</h3>
            <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Oldest → Latest</span>
          </div>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {resultStrip.map((m, i) => {
              const isWin = m.result === 'victory';
              const bName = getBrawlerName(m.my_brawler_id);
              const mapName = allMaps.find(mp => String(mp.id) === String(m.map_id))?.name || '';
              return (
                <div
                  key={`strip-${m.id}-${i}`}
                  title={`${isWin ? 'WIN' : 'LOSS'} · ${bName} · ${mapName}`}
                  style={{
                    width: '18px', height: '28px', borderRadius: '3px',
                    background: isWin ? 'var(--color-ally)' : 'var(--color-enemy)',
                    opacity: 0.85,
                    cursor: 'default',
                    flexShrink: 0,
                    position: 'relative',
                    transition: 'transform 0.15s, opacity 0.15s'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'scaleY(1.2)'; e.currentTarget.style.opacity = '1'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'scaleY(1)'; e.currentTarget.style.opacity = '0.85'; }}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Rolling Win Rate */}
      {isOwnProfile && rollingWinRate.length >= 2 && (
        <div className="glass-panel" style={{ padding: '16px 20px', marginBottom: '20px' }}>
          <h3 style={{ margin: '0 0 4px' }}>📈 Rolling Win Rate (Window of 5)</h3>
          <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', margin: '0 0 12px' }}>
            Win rate of your last 5 games at each point — shows recent momentum, not overall WR.
            Overall WR ({kpis.winRate}%) shown as solid line.
          </p>
          {(() => {
            const pts = rollingWinRate;
            const overallWR = kpis.winRate;
            const h = 110, w = 600, padX = 36, padY = 16;
            const cW = w - padX * 2, cH = h - padY * 2;
            const toX = (i) => padX + (i / Math.max(pts.length - 1, 1)) * cW;
            const toY = (v) => padY + cH - (v / 100) * cH;
            const polyline = pts.map((v, i) => `${toX(i)},${toY(v)}`).join(' ');
            const area = `${toX(0)},${toY(0)} ${polyline} ${toX(pts.length - 1)},${toY(0)}`;
            const lastVal = pts[pts.length - 1];
            const lineColor = lastVal >= 50 ? '#00e5ff' : '#ff4081';
            return (
              <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ overflow: 'visible' }}>
                {/* 50% baseline */}
                <line x1={padX} y1={toY(50)} x2={w - padX} y2={toY(50)} stroke="rgba(255,255,255,0.12)" strokeWidth="1" strokeDasharray="5 4" />
                {/* Overall WR line */}
                <line x1={padX} y1={toY(overallWR)} x2={w - padX} y2={toY(overallWR)} stroke="#ffd166" strokeWidth="1.5" strokeDasharray="8 4" opacity="0.6" />
                <text x={w - padX + 4} y={toY(overallWR) + 4} fill="#ffd166" fontSize="9" opacity="0.8">Overall</text>
                {/* Y labels */}
                <text x={padX - 4} y={toY(100) + 4} fill="rgba(255,255,255,0.3)" fontSize="9" textAnchor="end">100%</text>
                <text x={padX - 4} y={toY(50) + 4} fill="rgba(255,255,255,0.3)" fontSize="9" textAnchor="end">50%</text>
                <text x={padX - 4} y={toY(0) + 4} fill="rgba(255,255,255,0.3)" fontSize="9" textAnchor="end">0%</text>
                {/* Area + line */}
                <polygon points={area} fill={lineColor} fillOpacity="0.08" />
                <polyline points={polyline} fill="none" stroke={lineColor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                <circle cx={toX(pts.length - 1)} cy={toY(lastVal)} r="4" fill={lineColor} />
                <text x={toX(pts.length - 1) + 6} y={toY(lastVal) + 4} fill={lineColor} fontSize="10" fontWeight="bold">{lastVal}%</text>
              </svg>
            );
          })()}
        </div>
      )}

        </div>
      )}

      {/* Main Stats Layout Grid */}
      <div className="dashboard-main-grid">

        {/* Left Side */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

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
                    <th style={{ width: '32px' }}>#</th>
                    <th>Brawler</th>
                    <th>Class</th>
                    <th>Games</th>
                    <th>Win Rate</th>
                    {/* <th style={{ width: '80px' }}>Trend</th> */}
                    <th>Global WR</th>
                    <th>vs Global</th>
                    <th>Avg Trophies</th>
                    <th>MVP Count</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedBrawlers.map((b, i) => (
                    <tr
                      key={b.id}
                      onClick={() => onBrawlerClick && onBrawlerClick(b.id)}
                      style={{ cursor: onBrawlerClick ? 'pointer' : 'default' }}
                      onMouseEnter={e => { if (onBrawlerClick) e.currentTarget.style.background = 'rgba(0,229,255,0.06)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = ''; }}
                    >
                      <td style={{ color: 'var(--color-text-muted)', fontWeight: 600, fontSize: '0.8rem', textAlign: 'center' }}>
                        {safeBrawlerPage * BRAW_PAGE_SIZE + i + 1}
                      </td>
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
                       {/* <td style={{ padding: '2px 4px' }}>
                        {(() => {
                          const pts = brawlerSparklines[b.id];
                          if (!pts || pts.length < 2) return <span style={{ color: 'var(--color-text-muted)', fontSize: '10px' }}>—</span>;
                          const sw = 70, sh = 24, pad = 2;
                          const cw = sw - pad * 2, ch = sh - pad * 2;
                          const toX = (i) => pad + (i / (pts.length - 1)) * cw;
                          const toY = (v) => pad + ch - (v / 100) * ch;
                          const line = pts.map((v, i) => `${toX(i)},${toY(v)}`).join(' ');
                          const lastColor = pts[pts.length - 1] >= 50 ? '#00e5ff' : '#ff4081';
                          return (
                            <svg width={sw} height={sh} viewBox={`0 0 ${sw} ${sh}`}>
                              <polyline points={line} fill="none" stroke={lastColor} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
                              <circle cx={toX(pts.length - 1)} cy={toY(pts[pts.length - 1])} r="2" fill={lastColor} />
                            </svg>
                          );
                        })()}
                      </td> */}
                      <td className="global-wr-td">
                        {globalWRLookup[b.id] != null ? `${globalWRLookup[b.id]}%` : '—'}
                      </td>
                      <td className="vs-global-td">
                        {globalWRLookup[b.id] != null ? (() => {
                          const diff = b.winRate - globalWRLookup[b.id];
                          const color = diff > 0 ? 'var(--color-ally)' : diff < 0 ? 'var(--color-enemy)' : 'var(--color-text-muted)';
                          return <span style={{ color, fontWeight: 700, fontSize: '12px' }}>{diff > 0 ? '+' : ''}{diff}%</span>;
                        })() : '—'}
                      </td>
                      <td>{b.lastDraftType === 'ranked' && b.lastTrophies
                        ? `🏅 ${getRankById(b.lastTrophies)?.name || b.lastTrophies}`
                        : b.avgTrophies > 0 ? `${b.avgTrophies} 🏆` : 'N/A'}</td>
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
            {brawlerStats.length > 0 && (
              <div className="msm-pagination" style={{ marginTop: '8px' }}>
                <button type="button" className="msm-page-btn" disabled={safeBrawlerPage === 0} onClick={() => setBrawlerPage(p => Math.max(0, p - 1))}>
                  ‹
                </button>
                {Array.from({ length: brawlerPageCount }, (_, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`msm-page-btn ${i === safeBrawlerPage ? 'msm-page-btn--active' : ''}`}
                    onClick={() => setBrawlerPage(i)}
                  >
                    {i + 1}
                  </button>
                ))}
                <button type="button" className="msm-page-btn" disabled={safeBrawlerPage >= brawlerPageCount - 1} onClick={() => setBrawlerPage(p => Math.min(brawlerPageCount - 1, p + 1))}>
                  ›
                </button>
              </div>
            )}
          </div>

        </div>

          {/* Session Analysis */}
          {isOwnProfile && (() => {
            const sorted = [...filteredMatches].sort((a, b) => new Date(a.date) - new Date(b.date));
            const sessions = [];
            let current = [];
            for (let i = 0; i < sorted.length; i++) {
              if (current.length === 0) {
                current.push(sorted[i]);
              } else {
                const prev = new Date(current[current.length - 1].date);
                const cur = new Date(sorted[i].date);
                const gapH = (cur - prev) / 3600000;
                if (gapH >= 2) {
                  sessions.push([...current]);
                  current = [sorted[i]];
                } else {
                  current.push(sorted[i]);
                }
              }
            }
            if (current.length > 0) sessions.push([...current]);

            if (sessions.length === 0) return null;

            const reversedSessions = [...sessions].reverse();
            const total = reversedSessions.length;
            const idx = Math.min(sessionPage, total - 1);
            const session = reversedSessions[idx];
            const sWins = session.filter(m => m.result === 'victory').length;
            const sLosses = session.length - sWins;
            const sWR = Math.round((sWins / session.length) * 100);
            const startDate = new Date(session[0].date);
            const endDate = new Date(session[session.length - 1].date);
            const durationMin = Math.round((endDate - startDate) / 60000);
            const fmtTime = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const today = new Date(); today.setHours(0,0,0,0);
            const sessionDay = new Date(startDate); sessionDay.setHours(0,0,0,0);
            const dayDiff = Math.round((today - sessionDay) / 86400000);
            const dayLabel = dayDiff === 0 ? 'Today' : dayDiff === 1 ? 'Yesterday' : startDate.toLocaleDateString();

            const bestSession = [...sessions]
              .map(s => ({ games: s.length, wins: s.filter(m => m.result === 'victory').length }))
              .reduce((best, s) => (s.games >= 3 && (s.wins / s.games) > (best.wr || 0)) ? { wr: s.wins / s.games, games: s.games } : best, { wr: 0, games: 0 });

            return (
              <div className="dashboard-section glass-panel">
                <h3>📅 Session Analysis</h3>
                <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', margin: '4px 0 12px' }}>
                  Matches grouped by sessions (gap &lt; 2h) — {total} total sessions
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ padding: '10px 12px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-glass)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 700 }}>{dayLabel}</span>
                      <span style={{ fontSize: '10px', color: 'var(--color-ally)', fontWeight: 600 }}>
                        {fmtTime(startDate)} → {fmtTime(endDate)}
                      </span>
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginBottom: '6px' }}>
                      {durationMin}min · {session.length} game{session.length > 1 ? 's' : ''}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ flex: 1, height: '8px', borderRadius: '4px', overflow: 'hidden', background: 'rgba(255,0,85,0.2)' }}>
                        <div style={{ width: `${sWR}%`, height: '100%', background: 'linear-gradient(90deg, var(--color-ally), #0077ff)', borderRadius: '4px' }} />
                      </div>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: sWR >= 50 ? 'var(--color-ally)' : 'var(--color-enemy)', whiteSpace: 'nowrap' }}>{sWR}%</span>
                      <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{sWins}W {sLosses}L</span>
                    </div>
                  </div>
                </div>
                {/* Pagination */}
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', marginTop: '10px' }}>
                  <button
                    className="btn btn-sm"
                    disabled={idx === 0}
                    onClick={() => setSessionPage(idx - 1)}
                    style={{ padding: '2px 10px', fontSize: '11px' }}
                  >
                    ◀
                  </button>
                  <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                    Session {idx + 1} of {total}
                  </span>
                  <button
                    className="btn btn-sm"
                    disabled={idx === total - 1}
                    onClick={() => setSessionPage(idx + 1)}
                    style={{ padding: '2px 10px', fontSize: '11px' }}
                  >
                    ▶
                  </button>
                </div>
                {bestSession.games >= 3 && (
                  <div style={{ marginTop: '6px', padding: '8px 12px', borderRadius: '6px', background: 'rgba(255,215,0,0.06)', border: '1px solid rgba(255,215,0,0.2)', fontSize: '11px', color: 'var(--color-text-muted)' }}>
                    🏆 Best session: <strong>{Math.round(bestSession.wr * 100)}%</strong> WR over {bestSession.games} games
                  </div>
                )}
              </div>
            );
          })()}

          {/* Smart Alerts inside left column */}
          {isOwnProfile && smartAlerts.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '20px' }}>
              {smartAlerts.map((alert, idx) => (
                <div 
                  key={`alert-${idx}`} 
                  className={`glass-panel ${alert.type === 'hot' ? 'glow-ally' : 'glow-enemy'}`}
                  style={{ 
                    padding: '10px 15px', 
                    fontSize: '12px', 
                    fontWeight: '600', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '10px',
                    borderLeft: `4px solid ${alert.type === 'hot' ? 'var(--color-ally)' : 'var(--color-enemy)'}`
                  }}
                >
                  <span>{alert.type === 'hot' ? '🔥' : '⚠️'}</span>
                  <span style={{ color: '#fff' }}>{alert.text}</span>
                </div>
              ))}
            </div>
          )}

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
                  <div
                    key={g.mode}
                    className="game-mode-stat-card"
                    style={{ cursor: onModeClick ? 'pointer' : 'default' }}
                    onClick={() => onModeClick && onModeClick(g.mode)}
                    onMouseEnter={e => { if (onModeClick) e.currentTarget.style.borderColor = 'var(--color-ally)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = ''; }}
                  >
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
                  <div key={m.mapId} className="map-stat-row" style={{ cursor: onMapClick ? 'pointer' : 'default' }} onClick={() => onMapClick && onMapClick(m.mapId)}>
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

          {/* Draft Pick/Ban Frequency — Ranked Meta Insights */}
          {topPicks.allied.length > 0 && (
            <div className="dashboard-section glass-panel" style={{ marginTop: '20px' }}>
              <h3>🎯 Ranked Meta Insights</h3>
              <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', margin: '4px 0 14px' }}>Most frequent picks & bans in ranked drafts</p>

              {topPicks.allied.length > 0 && (
                <div style={{ marginBottom: '14px' }}>
                  <h4 style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--color-ally)', marginBottom: '8px' }}>Allied Picks</h4>
                  {topPicks.allied.map(d => {
                    const b = brawlers.find(br => String(br.id) === String(d.brawler_id));
                    return (
                      <div 
                        key={`ap-${d.brawler_id}`} 
                        style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '6px', cursor: onBrawlerClick ? 'pointer' : 'default' }}
                        onClick={() => onBrawlerClick && onBrawlerClick(d.brawler_id)}
                      >
                        {b?.image_url && <img src={b.image_url} alt={b?.name} style={{ width: '20px', height: '20px', borderRadius: '50%', border: '1.5px solid var(--color-ally)' }} />}
                        <span 
                          onMouseEnter={e => { if (onBrawlerClick) e.currentTarget.style.textDecoration = 'underline'; }}
                          onMouseLeave={e => { e.currentTarget.style.textDecoration = 'none'; }}
                          style={{ fontSize: '11px', width: '70px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        >
                          {b?.name || '?'}
                        </span>
                        <div style={{ flex: 1, height: '5px', borderRadius: '3px', background: 'rgba(255,255,255,0.08)' }}>
                          <div style={{ width: `${(d.count / maxPickCount) * 100}%`, height: '100%', borderRadius: '3px', background: 'var(--color-ally)' }} />
                        </div>
                        <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>{d.count}x</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {topPicks.enemy.length > 0 && (
                <div style={{ marginBottom: '14px' }}>
                  <h4 style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--color-enemy)', marginBottom: '8px' }}>Enemy Picks</h4>
                  {topPicks.enemy.map(d => {
                    const b = brawlers.find(br => String(br.id) === String(d.brawler_id));
                    return (
                      <div 
                        key={`ep-${d.brawler_id}`} 
                        style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '6px', cursor: onBrawlerClick ? 'pointer' : 'default' }}
                        onClick={() => onBrawlerClick && onBrawlerClick(d.brawler_id)}
                      >
                        {b?.image_url && <img src={b.image_url} alt={b?.name} style={{ width: '20px', height: '20px', borderRadius: '50%', border: '1.5px solid var(--color-enemy)' }} />}
                        <span 
                          onMouseEnter={e => { if (onBrawlerClick) e.currentTarget.style.textDecoration = 'underline'; }}
                          onMouseLeave={e => { e.currentTarget.style.textDecoration = 'none'; }}
                          style={{ fontSize: '11px', width: '70px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        >
                          {b?.name || '?'}
                        </span>
                        <div style={{ flex: 1, height: '5px', borderRadius: '3px', background: 'rgba(255,255,255,0.08)' }}>
                          <div style={{ width: `${(d.count / maxPickCount) * 100}%`, height: '100%', borderRadius: '3px', background: 'var(--color-enemy)' }} />
                        </div>
                        <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>{d.count}x</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {topPicks.bans.length > 0 && (
                <div>
                  <h4 style={{ fontSize: '10px', textTransform: 'uppercase', color: '#ffb703', marginBottom: '8px' }}>Most Banned</h4>
                  {topPicks.bans.map(d => {
                    const b = brawlers.find(br => String(br.id) === String(d.brawler_id));
                    return (
                      <div 
                        key={`bn-${d.brawler_id}-${d.team}`} 
                        style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '6px', cursor: onBrawlerClick ? 'pointer' : 'default' }}
                        onClick={() => onBrawlerClick && onBrawlerClick(d.brawler_id)}
                      >
                        {b?.image_url && <img src={b.image_url} alt={b?.name} style={{ width: '20px', height: '20px', borderRadius: '50%', border: '1.5px solid #ffb703', filter: 'grayscale(0.4)' }} />}
                        <span 
                          onMouseEnter={e => { if (onBrawlerClick) e.currentTarget.style.textDecoration = 'underline'; }}
                          onMouseLeave={e => { e.currentTarget.style.textDecoration = 'none'; }}
                          style={{ fontSize: '11px', width: '70px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        >
                          {b?.name || '?'}
                        </span>
                        <div style={{ flex: 1, height: '5px', borderRadius: '3px', background: 'rgba(255,255,255,0.08)' }}>
                          <div style={{ width: `${(d.count / maxPickCount) * 100}%`, height: '100%', borderRadius: '3px', background: '#ffb703' }} />
                        </div>
                        <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>{d.count}x</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Hint for brawler profiles */}
          {onBrawlerClick && (
            <div style={{ marginTop: '20px', padding: '12px 16px', borderRadius: '8px', background: 'rgba(0,229,255,0.06)', border: '1px solid rgba(0,229,255,0.15)', fontSize: '11px', color: 'var(--color-text-muted)' }}>
              💡 Click any brawler in the table to view their detailed profile
            </div>
          )}

        </div>

      </div>
    </div>
  );
}
