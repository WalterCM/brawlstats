import { useState, useMemo, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useFilters } from './context/FilterContext';
import { filterByTimeRange, filterByLevel } from './utils/matchFilters';
import { getRankById, getRankIconUrl } from './utils/helpers';

// Pure SVG rolling win rate line chart
function RollingWinRateChart({ matches, windowSize = 5, height = 120, width = 400 }) {
  const points = useMemo(() => {
    if (matches.length < 2) return [];
    // matches oldest first
    const sorted = [...matches].sort((a, b) => new Date(a.date) - new Date(b.date));
    const pts = [];
    for (let i = windowSize - 1; i < sorted.length; i++) {
      const window = sorted.slice(Math.max(0, i - windowSize + 1), i + 1);
      const wins = window.filter(m => m.result === 'victory').length;
      pts.push((wins / window.length) * 100);
    }
    return pts;
  }, [matches, windowSize]);

  if (points.length < 2) {
    return (
      <div style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '20px', fontSize: '12px' }}>
        Need at least {windowSize} matches to show trend
      </div>
    );
  }

  const padX = 32, padY = 16;
  const chartW = width - padX * 2;
  const chartH = height - padY * 2;

  const toX = (i) => padX + (i / (points.length - 1)) * chartW;
  const toY = (v) => padY + chartH - (v / 100) * chartH;

  const polyline = points.map((v, i) => `${toX(i)},${toY(v)}`).join(' ');
  const area = `${toX(0)},${toY(0)} ${polyline} ${toX(points.length - 1)},${toY(0)}`;

  const lastVal = points[points.length - 1];
  const color = lastVal >= 50 ? '#00e5ff' : '#ff4081';

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
      {/* 50% reference line */}
      <line
        x1={padX} y1={toY(50)} x2={width - padX} y2={toY(50)}
        stroke="rgba(255,255,255,0.15)" strokeWidth="1" strokeDasharray="4 3"
      />
      <text x={padX - 4} y={toY(50) + 4} fill="rgba(255,255,255,0.3)" fontSize="9" textAnchor="end">50%</text>
      {/* 0% and 100% labels */}
      <text x={padX - 4} y={toY(100) + 4} fill="rgba(255,255,255,0.3)" fontSize="9" textAnchor="end">100%</text>
      <text x={padX - 4} y={toY(0) + 4} fill="rgba(255,255,255,0.3)" fontSize="9" textAnchor="end">0%</text>
      {/* Area fill */}
      <polygon points={area} fill={color} fillOpacity="0.08" />
      {/* Line */}
      <polyline points={polyline} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {/* Last point dot */}
      <circle cx={toX(points.length - 1)} cy={toY(lastVal)} r="4" fill={color} />
      <text x={toX(points.length - 1) + 6} y={toY(lastVal) + 4} fill={color} fontSize="9" fontWeight="bold">
        {Math.round(lastVal)}%
      </text>
    </svg>
  );
}

// Horizontal bar for brawler frequency
function FreqBar({ name, avatar, count, maxCount, color }) {
  const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
      {avatar
        ? <img src={avatar} alt={name} style={{ width: '22px', height: '22px', borderRadius: '50%', border: `1.5px solid ${color}`, flexShrink: 0 }} />
        : <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', flexShrink: 0 }} />
      }
      <span style={{ fontSize: '11px', width: '80px', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
      <div style={{ flex: 1, height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.08)' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: '3px', background: color, transition: 'width 0.5s ease' }} />
      </div>
      <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', width: '24px', textAlign: 'right' }}>{count}x</span>
    </div>
  );
}

const MODE_ICONS_MAP = {
  'Gem Grab': '💎', 'Brawl Ball': '⚽', 'Heist': '💰', 'Hot Zone': '🔥',
  'Knockout': '💀', 'Bounty': '⭐', 'Showdown': '🌵', 'Solo Showdown': '🌵',
  'Duo Showdown': '👥',
};

function getModeIcon(mode) {
  if (!mode) return '⚔️';
  return MODE_ICONS_MAP[mode] || '⚔️';
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}


export default function BrawlerProfile({ brawlerId: propBrawlerId, matches = [], perceptions = [], brawlers = [], allMaps = [], brawlerMeta = [], minNormalTrophies = 750, onBack, onBrawlerClick, onMapClick, onModeClick }) {
  const params = useParams();
  const brawlerId = propBrawlerId || params.brawlerId;

  const {
    timeRange,
    setTimeRange,
    levelMin,
    setLevelMin,
    levelMax,
    setLevelMax,
    selectedTiers,
    setSelectedTiers,
    selectedMode,
    setSelectedMode,
    selectedDraftType,
    setSelectedDraftType
  } = useFilters();

  const getBrawler = (id) => brawlers.find(b => String(b.id) === String(id));
  const getMap = (id) => allMaps.find(m => String(m.id) === String(id));

  const brawler = getBrawler(brawlerId);

  // Unique modes for this brawler
  const brawlerModes = useMemo(() => {
    const modes = new Set();
    matches.filter(m => String(m.my_brawler_id) === String(brawlerId)).forEach(m => { if (m.mode) modes.add(m.mode); });
    return ['All', ...Array.from(modes)];
  }, [matches, brawlerId]);

  // Matches with this brawler
  const myMatches = useMemo(() => {
    let filtered = [...matches];

    if (selectedMode !== 'All') {
      const normSelected = selectedMode.toLowerCase().replace(/[^a-z0-9]/g, '');
      filtered = filtered.filter(m => m.mode && m.mode.toLowerCase().replace(/[^a-z0-9]/g, '') === normSelected);
    }
    if (selectedDraftType !== 'All') {
      filtered = filtered.filter(m => m.draft_type === selectedDraftType.toLowerCase());
    }

    filtered = filterByTimeRange(filtered, timeRange);
    filtered = filterByLevel(filtered, selectedDraftType !== 'All' ? selectedDraftType.toLowerCase() : null, { levelMin, levelMax, selectedTiers });
    return filtered.filter(m => String(m.my_brawler_id) === String(brawlerId)).sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [matches, brawlerId, selectedMode, selectedDraftType, timeRange, levelMin, levelMax, selectedTiers]);

  const total = myMatches.length;
  const wins = myMatches.filter(m => m.result === 'victory').length;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
  const mvps = myMatches.filter(m => m.is_star_player).length;

  // Global WR for this brawler
  const globalWR = useMemo(() => {
    const recs = brawlerMeta.filter(r => String(r.brawler_id) === String(brawlerId));
    if (recs.length === 0) return null;
    return Math.round((recs.reduce((s, r) => s + r.win_rate, 0) / recs.length) * 100);
  }, [brawlerMeta, brawlerId]);

  // Win rate by game mode
  const modeStats = useMemo(() => {
    const groups = {};
    myMatches.forEach(m => {
      if (!m.mode) return;
      if (!groups[m.mode]) groups[m.mode] = { mode: m.mode, games: 0, wins: 0 };
      groups[m.mode].games++;
      if (m.result === 'victory') groups[m.mode].wins++;
    });
    return Object.values(groups).map(g => ({
      ...g,
      winRate: Math.round((g.wins / g.games) * 100)
    })).sort((a, b) => b.games - a.games);
  }, [myMatches]);

  // Win rate by map
  const mapStats = useMemo(() => {
    const groups = {};
    myMatches.forEach(m => {
      if (!m.map_id) return;
      if (!groups[m.map_id]) groups[m.map_id] = { games: 0, wins: 0, mode: m.mode };
      groups[m.map_id].games++;
      if (m.result === 'victory') groups[m.map_id].wins++;
    });
    return Object.entries(groups).map(([mapId, g]) => ({
      mapId,
      name: getMap(mapId)?.name || 'Unknown',
      mode: g.mode,
      games: g.games,
      winRate: Math.round((g.wins / g.games) * 100)
    })).sort((a, b) => b.games - a.games);
  }, [myMatches, allMaps]);

  // Matchup comfort perceptions for this brawler (as my_brawler)
  const myPerceptions = useMemo(() => {
    const matchIds = new Set(myMatches.map(m => m.id));
    return perceptions.filter(p => matchIds.has(p.match_id));
  }, [myMatches, perceptions]);

  const comfortCounts = useMemo(() => {
    const c = { Easy: 0, Neutral: 0, Hard: 0, Counter: 0 };
    const rivals = {};
    myPerceptions.forEach(p => {
      if (p.value === 1) c.Easy++;
      else if (p.value === 0) c.Neutral++;
      else if (p.value === -1) c.Hard++;
      else if (p.value === -2) c.Counter++;
      const rid = p.brawler_rival_id;
      if (!rivals[rid]) rivals[rid] = { id: rid, sum: 0, count: 0 };
      rivals[rid].sum += p.value;
      rivals[rid].count++;
    });
    const sorted = Object.values(rivals).map(r => ({ ...r, avg: r.sum / r.count })).sort((a, b) => a.avg - b.avg);
    return { counts: c, hardest: sorted.slice(0, 5), easiest: sorted.slice(-5).reverse() };
  }, [myPerceptions]);

  // Allied and enemy brawler frequency from draft events
  const draftFreq = useMemo(() => {
    const allied = {}, enemy = {};
    myMatches.forEach(m => {
      (m.draft_events || []).forEach(evt => {
        if (evt.type !== 'pick') return;
        if (String(evt.brawler_id) === String(brawlerId)) return; // skip self
        const target = evt.team === 'allied' ? allied : enemy;
        if (!target[evt.brawler_id]) target[evt.brawler_id] = 0;
        target[evt.brawler_id]++;
      });
    });
    const toList = (obj) => Object.entries(obj)
      .map(([id, count]) => ({ id, count, brawler: getBrawler(id) }))
      .sort((a, b) => b.count - a.count).slice(0, 6);
    return { allied: toList(allied), enemy: toList(enemy) };
  }, [myMatches, brawlerId, brawlers]);

  const maxAllied = draftFreq.allied[0]?.count || 1;
  const maxEnemy = draftFreq.enemy[0]?.count || 1;

  // Breakdown of stats by Rank and Trophy ranges
  const breakdownStats = useMemo(() => {
    // Keep timeRange and mode filters for the breakdown, but ignore draftType and level bounds
    let baseMatches = [...matches].filter(m => String(m.my_brawler_id) === String(brawlerId));
    if (selectedMode !== 'All') {
      const normSelected = selectedMode.toLowerCase().replace(/[^a-z0-9]/g, '');
      baseMatches = baseMatches.filter(m => m.mode && m.mode.toLowerCase().replace(/[^a-z0-9]/g, '') === normSelected);
    }
    baseMatches = filterByTimeRange(baseMatches, timeRange);

    const ranked = {
      gold: { name: 'Gold', games: 0, wins: 0, iconId: 7 },
      diamond: { name: 'Diamond', games: 0, wins: 0, iconId: 10 },
      mythic: { name: 'Mythic', games: 0, wins: 0, iconId: 13 },
      other: { name: 'Other Ranks', games: 0, wins: 0, iconId: 16 }
    };

    const normal = {
      mid: { name: '750 - 1000 🏆', games: 0, wins: 0 },
      high: { name: '1000+ 🏆', games: 0, wins: 0 }
    };

    baseMatches.forEach(m => {
      const isWin = m.result === 'victory';
      if (m.draft_type === 'ranked') {
        const val = Number(m.my_brawler_trophies) || 0;
        if (val >= 7 && val <= 9) {
          ranked.gold.games++;
          if (isWin) ranked.gold.wins++;
        } else if (val >= 10 && val <= 12) {
          ranked.diamond.games++;
          if (isWin) ranked.diamond.wins++;
        } else if (val >= 13 && val <= 15) {
          ranked.mythic.games++;
          if (isWin) ranked.mythic.wins++;
        } else {
          ranked.other.games++;
          if (isWin) ranked.other.wins++;
        }
      } else {
        const val = Number(m.my_brawler_trophies) || 0;
        if (val >= 750 && val <= 1000) {
          normal.mid.games++;
          if (isWin) normal.mid.wins++;
        } else if (val > 1000) {
          normal.high.games++;
          if (isWin) normal.high.wins++;
        }
      }
    });

    const formatItem = (item) => ({
      ...item,
      winRate: item.games > 0 ? Math.round((item.wins / item.games) * 100) : null
    });

    return {
      ranked: [
        formatItem(ranked.gold),
        formatItem(ranked.diamond),
        formatItem(ranked.mythic),
        formatItem(ranked.other)
      ].filter(r => r.games > 0),
      normal: [
        formatItem(normal.mid),
        formatItem(normal.high)
      ].filter(r => r.games > 0)
    };
  }, [matches, brawlerId, selectedMode, timeRange]);

  // Best & Worst Mode Highlights
  const modeHighlights = useMemo(() => {
    const candidates = modeStats.filter(g => g.games >= 3);
    if (candidates.length === 0) return { best: null, worst: null };
    const sortedByWR = [...candidates].sort((a, b) => b.winRate - a.winRate || b.games - a.games);
    const best = sortedByWR[0];
    const worst = sortedByWR[sortedByWR.length - 1];
    if (best.mode === worst.mode) {
      return { best, worst: null };
    }
    return { best, worst };
  }, [modeStats]);

  // Signature Map Highlight
  const signatureMap = useMemo(() => {
    const candidates = mapStats.filter(g => g.games >= 2);
    if (candidates.length === 0) return null;
    const sortedByWR = [...candidates].sort((a, b) => b.winRate - a.winRate || b.games - a.games);
    return sortedByWR[0];
  }, [mapStats]);

  // Synergy & Counter stats (win rate when playing with or against them)
  const synergyStats = useMemo(() => {
    const alliedWR = {};
    const enemyWR = {};
    
    myMatches.forEach(m => {
      const isWin = m.result === 'victory';
      (m.draft_events || []).forEach(evt => {
        if (evt.type !== 'pick') return;
        if (String(evt.brawler_id) === String(brawlerId)) return; // skip self
        
        const target = evt.team === 'allied' ? alliedWR : enemyWR;
        if (!target[evt.brawler_id]) {
          target[evt.brawler_id] = { id: evt.brawler_id, games: 0, wins: 0 };
        }
        target[evt.brawler_id].games++;
        if (isWin) target[evt.brawler_id].wins++;
      });
    });

    const calculateWR = (obj) => {
      return Object.values(obj)
        .filter(item => item.games >= 2) // minimum 2 games for reliability
        .map(item => ({
          ...item,
          winRate: Math.round((item.wins / item.games) * 100),
          brawler: getBrawler(item.id)
        }))
        .sort((a, b) => b.winRate - a.winRate);
    };

    const synergies = calculateWR(alliedWR);
    const counters = calculateWR(enemyWR).reverse(); // lowest WR at top (hardest enemies)

    return {
      topAllies: synergies.slice(0, 3),
      hardestEnemies: counters.slice(0, 3)
    };
  }, [myMatches, brawlerId, getBrawler]);

  if (!brawler) return null;

  // Scroll to top when this profile mounts or brawlerId changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [brawlerId]);

  return (
    <div className="stats-dashboard-container">
      {/* Header — sticky so brawler summary is always visible */}
      <div
        className="dashboard-header glass-panel"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
          marginBottom: '20px'
        }}
      >
        {brawler.image_url
          ? <img src={brawler.image_url} alt={brawler.name} style={{ width: '52px', height: '52px', borderRadius: '50%', border: '3px solid var(--color-ally)', objectFit: 'cover', flexShrink: 0 }} />
          : <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', flexShrink: 0 }} />
        }
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0 }}>{brawler.name}</h2>
          <p className="welcome-subtitle" style={{ margin: 0 }}>{brawler.class_name} · {total} matches logged</p>
        </div>
        {/* Summary KPIs */}
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '22px', fontWeight: 'bold', color: winRate >= 50 ? 'var(--color-ally)' : 'var(--color-enemy)' }}>{winRate}%</div>
            <div style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>Win Rate</div>
          </div>
          {globalWR != null && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--color-text-muted)' }}>🌐 {globalWR}%</div>
              <div style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>Global WR</div>
            </div>
          )}
          {globalWR != null && (() => {
            const diff = winRate - globalWR;
            const color = diff > 0 ? 'var(--color-ally)' : diff < 0 ? 'var(--color-enemy)' : 'var(--color-text-muted)';
            return (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color }}>{diff > 0 ? '+' : ''}{diff}%</div>
                <div style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>vs Global</div>
              </div>
            );
          })()}
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '22px', fontWeight: 'bold' }}>{total}</div>
            <div style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>Games</div>
          </div>
          {mvps > 0 && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#ffd166' }}>👑 {mvps}</div>
              <div style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>MVPs</div>
            </div>
          )}
        </div>
        <button className="btn btn-secondary" onClick={onBack}>◀ Back</button>
      </div>


      {total === 0 ? (
        <div className="glass-panel" style={{ textAlign: 'center', padding: '40px', marginTop: '20px', color: 'var(--color-text-muted)' }}>
          No matches logged with {brawler.name} yet.
        </div>
      ) : (
        <>
          {/* Smart Insights Panel */}
          <div className="glass-panel" style={{ padding: '16px 20px', marginTop: '20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
            {/* Mode Highlights */}
            {(modeHighlights.best || modeHighlights.worst) && (
              <div>
                <h4 style={{ margin: '0 0 12px', fontSize: '13px', textTransform: 'uppercase', color: 'var(--color-text-muted)', letterSpacing: '0.5px' }}>Mode Recommendation</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {modeHighlights.best && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                      <span style={{ fontSize: '18px' }}>🥇</span>
                      <div>
                        <strong>{getModeIcon(modeHighlights.best.mode)} {modeHighlights.best.mode}</strong>
                        <div style={{ fontSize: '11px', color: 'var(--color-ally)', fontWeight: '700' }}>Best: {modeHighlights.best.winRate}% WR ({modeHighlights.best.games} games)</div>
                      </div>
                    </div>
                  )}
                  {modeHighlights.worst && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '6px' }}>
                      <span style={{ fontSize: '18px' }}>⚠️</span>
                      <div>
                        <strong>{getModeIcon(modeHighlights.worst.mode)} {modeHighlights.worst.mode}</strong>
                        <div style={{ fontSize: '11px', color: 'var(--color-enemy)', fontWeight: '700' }}>Avoid: {modeHighlights.worst.winRate}% WR ({modeHighlights.worst.games} games)</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Signature Map */}
            {signatureMap && (
              <div className="divider-left-mobile" style={{ borderLeft: '1px solid rgba(255,255,255,0.08)', paddingLeft: '20px' }}>
                <h4 style={{ margin: '0 0 12px', fontSize: '13px', textTransform: 'uppercase', color: 'var(--color-text-muted)', letterSpacing: '0.5px' }}>Signature Map</h4>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '24px' }}>🗺️</span>
                  <div>
                    <strong style={{ display: 'block', fontSize: '14px', color: '#fff' }}>{signatureMap.name}</strong>
                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{getModeIcon(signatureMap.mode)} {signatureMap.mode}</span>
                    <div style={{ fontSize: '12px', color: 'var(--color-ally)', fontWeight: '700', marginTop: '2px' }}>{signatureMap.winRate}% Win Rate ({signatureMap.games} games)</div>
                  </div>
                </div>
              </div>
            )}

            {/* Synergy & Counters */}
            {(synergyStats.topAllies.length > 0 || synergyStats.hardestEnemies.length > 0) && (
              <div className="divider-left-mobile" style={{ borderLeft: '1px solid rgba(255,255,255,0.08)', paddingLeft: '20px' }}>
                <h4 style={{ margin: '0 0 12px', fontSize: '13px', textTransform: 'uppercase', color: 'var(--color-text-muted)', letterSpacing: '0.5px' }}>Synergy & Counter Insights</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '11px' }}>
                  {synergyStats.topAllies.length > 0 && (
                    <div>
                      <strong style={{ color: 'var(--color-text-muted)' }}>Best Allies: </strong>
                      <span style={{ color: '#fff' }}>
                        {synergyStats.topAllies.map(s => `${s.brawler?.name || '?'}(${s.winRate}%)`).join(', ')}
                      </span>
                    </div>
                  )}
                  {synergyStats.hardestEnemies.length > 0 && (
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '6px' }}>
                      <strong style={{ color: 'var(--color-text-muted)' }}>Avoid Facing: </strong>
                      <span style={{ color: '#fff' }}>
                        {synergyStats.hardestEnemies.map(s => `${s.brawler?.name || '?'}(${s.winRate}%)`).join(', ')}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="dashboard-main-grid" style={{ marginTop: '20px' }}>
          {/* Left column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

            {/* Rolling Win Rate */}
            <div className="dashboard-section glass-panel">
              <h3>📈 Win Rate Trend (Rolling 5)</h3>
              <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', margin: '4px 0 12px' }}>
                Sliding window of last 5 matches — shows momentum
              </p>
              <RollingWinRateChart matches={myMatches} windowSize={5} />
            </div>

            {/* Competitive Rank Breakdown */}
            <div className="dashboard-section glass-panel">
              <h3>🏅 Competitive Rank Breakdown</h3>
              <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', margin: '4px 0 12px' }}>
                Your performance in Ranked formats segmented by tier
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {breakdownStats.ranked.length === 0 ? (
                  <div className="empty-msg" style={{ padding: '8px 0', fontSize: '11px', color: 'var(--color-text-muted)' }}>No ranked matches recorded with this brawler.</div>
                ) : (
                  breakdownStats.ranked.map(row => {
                    const hasGames = row.games > 0;
                    const wr = row.winRate;
                    const isGood = hasGames && wr >= 55;
                    const isBad = hasGames && wr <= 45;
                    const wrColor = !hasGames ? 'var(--color-text-muted)' : isGood ? 'var(--color-ally)' : isBad ? 'var(--color-enemy)' : '#fff';

                    return (
                      <div key={row.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                          {getRankIconUrl(row.iconId) && (
                            <img src={getRankIconUrl(row.iconId)} alt="" style={{ width: '20px', height: '20px', objectFit: 'contain' }} />
                          )}
                          <div style={{ minWidth: 0 }}>
                            <span style={{ fontSize: '12px', fontWeight: 600, color: '#fff' }}>{row.name}</span>
                            <div style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>{row.games} match{row.games !== 1 ? 'es' : ''}</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '120px' }}>
                          <div style={{ flex: 1, height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                            {hasGames && (
                              <div style={{
                                width: `${wr}%`,
                                height: '100%',
                                background: isGood ? 'var(--color-ally)' : isBad ? 'var(--color-enemy)' : '#fff',
                                borderRadius: '3px'
                              }} />
                            )}
                          </div>
                          <span style={{ fontSize: '12px', fontWeight: '800', color: wrColor, width: '36px', textAlign: 'right' }}>
                            {hasGames ? `${wr}%` : '—'}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Casual Trophy Breakdown */}
            <div className="dashboard-section glass-panel">
              <h3>🏆 Casual Trophy Breakdown</h3>
              <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', margin: '4px 0 12px' }}>
                Your performance in Casual (Normal) formats segmented by trophies
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {breakdownStats.normal.length === 0 ? (
                  <div className="empty-msg" style={{ padding: '8px 0', fontSize: '11px', color: 'var(--color-text-muted)' }}>No casual matches recorded above 750 trophies.</div>
                ) : (
                  breakdownStats.normal.map(row => {
                    const hasGames = row.games > 0;
                    const wr = row.winRate;
                    const isGood = hasGames && wr >= 55;
                    const isBad = hasGames && wr <= 45;
                    const wrColor = !hasGames ? 'var(--color-text-muted)' : isGood ? 'var(--color-ally)' : isBad ? 'var(--color-enemy)' : '#fff';

                    return (
                      <div key={row.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ fontSize: '12px', fontWeight: 600, color: '#fff' }}>{row.name}</span>
                          <div style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>{row.games} match{row.games !== 1 ? 'es' : ''}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '120px' }}>
                          <div style={{ flex: 1, height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                            {hasGames && (
                              <div style={{
                                width: `${wr}%`,
                                height: '100%',
                                background: isGood ? 'var(--color-ally)' : isBad ? 'var(--color-enemy)' : '#fff',
                                borderRadius: '3px'
                              }} />
                            )}
                          </div>
                          <span style={{ fontSize: '12px', fontWeight: '800', color: wrColor, width: '36px', textAlign: 'right' }}>
                            {hasGames ? `${wr}%` : '—'}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Right column */}
          <div className="dashboard-sidebar" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

            {/* Win rate by mode */}
            {modeStats.length > 0 && (
            <div className="dashboard-section glass-panel">
              <h3>🎮 Win Rate by Mode</h3>
              <div style={{ marginTop: '12px' }}>
                {modeStats.map(m => (
                  <div 
                    key={m.mode} 
                    className="map-stat-row" 
                    style={{ cursor: onModeClick ? 'pointer' : 'default' }}
                    onClick={() => onModeClick && onModeClick(m.mode)}
                  >
                    <div className="map-detail">
                      <span 
                        className="map-name-lbl"
                        onMouseEnter={e => { if (onModeClick) e.currentTarget.style.textDecoration = 'underline'; }}
                        onMouseLeave={e => { e.currentTarget.style.textDecoration = 'none'; }}
                      >
                        {getModeIcon(m.mode)} {m.mode}
                      </span>
                      <span className="map-mode-lbl"></span>
                    </div>
                    <div className="map-games-metric">
                      <span>{m.games} Games</span>
                      <span className={`map-wr-badge ${m.winRate >= 50 ? 'win-badge' : 'loss-badge'}`}>{m.winRate}% WR</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            )}

            {/* Map win rates */}
            <div className="dashboard-section glass-panel">
              <h3>🗺️ Win Rate by Map</h3>
              <div style={{ marginTop: '12px' }}>
                {mapStats.length === 0
                  ? <div className="empty-msg">No map data.</div>
                  : mapStats.map(m => (
                    <div 
                      key={m.mapId} 
                      className="map-stat-row" 
                      style={{ cursor: onMapClick ? 'pointer' : 'default' }}
                      onClick={() => onMapClick && onMapClick(m.mapId)}
                    >
                      <div className="map-detail">
                        <span 
                          className="map-name-lbl"
                          onMouseEnter={e => { if (onMapClick) e.currentTarget.style.textDecoration = 'underline'; }}
                          onMouseLeave={e => { e.currentTarget.style.textDecoration = 'none'; }}
                        >
                          {m.name}
                        </span>
                        <span className="map-mode-lbl">{getModeIcon(m.mode)} {m.mode}</span>
                      </div>
                      <div className="map-games-metric">
                        <span>{m.games} Games</span>
                        <span className={`map-wr-badge ${m.winRate >= 50 ? 'win-badge' : 'loss-badge'}`}>{m.winRate}% WR</span>
                      </div>
                    </div>
                  ))
                }
              </div>
            </div>

            {/* Matchup Comfort Profile */}
            {myPerceptions.length > 0 && (
              <div className="dashboard-section glass-panel">
                <h3>🎯 Matchup Comfort</h3>
                <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', margin: '4px 0 12px' }}>
                  Subjective ratings for {brawler.name}
                </p>
                {/* Distribution bar */}
                <div style={{ display: 'flex', height: '14px', borderRadius: '4px', overflow: 'hidden', marginBottom: '8px' }}>
                  {[['Easy', '#00e5ff'], ['Neutral', '#9ca3af'], ['Hard', '#ff6699'], ['Counter', '#ff0055']].map(([label, color]) => {
                    const count = comfortCounts.counts[label];
                    const pct = myPerceptions.length > 0 ? (count / myPerceptions.length) * 100 : 0;
                    if (pct === 0) return null;
                    return <div key={label} style={{ width: `${pct}%`, background: color }} title={`${label}: ${count}`} />;
                  })}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--color-text-muted)', marginBottom: '16px' }}>
                  <span>🔵 Easy ({comfortCounts.counts.Easy})</span>
                  <span>⚪ Neutral ({comfortCounts.counts.Neutral})</span>
                  <span>💗 Hard ({comfortCounts.counts.Hard})</span>
                  <span>🔴 Counter ({comfortCounts.counts.Counter})</span>
                </div>
                {comfortCounts.easiest.length > 0 && (
                  <div style={{ marginBottom: '12px' }}>
                    <h4 style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--color-ally)', marginBottom: '6px' }}>Easiest</h4>
                    {comfortCounts.easiest.map(r => {
                      const b = getBrawler(r.id);
                      return (
                        <div 
                          key={r.id} 
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px', cursor: onBrawlerClick ? 'pointer' : 'default' }}
                          onClick={() => onBrawlerClick && onBrawlerClick(r.id)}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            {b?.image_url && <img src={b.image_url} alt={b.name} style={{ width: '16px', height: '16px', borderRadius: '50%' }} />}
                            <span 
                              onMouseEnter={e => { if (onBrawlerClick) e.currentTarget.style.textDecoration = 'underline'; }}
                              onMouseLeave={e => { e.currentTarget.style.textDecoration = 'none'; }}
                            >
                              {b?.name || '?'}
                            </span>
                          </div>
                          <span style={{ color: 'var(--color-ally)', fontWeight: 'bold' }}>+{r.avg.toFixed(1)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                {comfortCounts.hardest.length > 0 && (
                  <div>
                    <h4 style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--color-enemy)', marginBottom: '6px' }}>Hardest</h4>
                    {comfortCounts.hardest.map(r => {
                      const b = getBrawler(r.id);
                      return (
                        <div 
                          key={r.id} 
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px', cursor: onBrawlerClick ? 'pointer' : 'default' }}
                          onClick={() => onBrawlerClick && onBrawlerClick(r.id)}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            {b?.image_url && <img src={b.image_url} alt={b.name} style={{ width: '16px', height: '16px', borderRadius: '50%' }} />}
                            <span 
                              onMouseEnter={e => { if (onBrawlerClick) e.currentTarget.style.textDecoration = 'underline'; }}
                              onMouseLeave={e => { e.currentTarget.style.textDecoration = 'none'; }}
                            >
                              {b?.name || '?'}
                            </span>
                          </div>
                          <span style={{ color: 'var(--color-enemy)', fontWeight: 'bold' }}>{r.avg.toFixed(1)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Recent match history */}
            <div className="dashboard-section glass-panel">
              <h3>📋 Recent Matches</h3>
              <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', margin: '4px 0 12px' }}>
                Your last matches with {brawler?.name}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                {myMatches.slice(0, 10).map(m => {
                  const mapName = getMap(m.map_id)?.name || 'Unknown';
                  const isWin = m.result === 'victory';
                  const isRanked = m.draft_type === 'ranked';
                  return (
                    <div key={m.id} className="mp-match-row" style={{
                      borderLeft: `3px solid ${isWin ? 'var(--color-ally)' : 'var(--color-enemy)'}`,
                      background: isWin ? 'rgba(0,229,255,0.03)' : 'rgba(255,0,85,0.03)',
                    }}>
                      {/* Win/Loss badge */}
                      <span className="mp-match-result-badge" style={{
                        background: isWin ? 'rgba(0,229,255,0.15)' : 'rgba(255,0,85,0.15)',
                        color: isWin ? 'var(--color-ally)' : 'var(--color-enemy)',
                      }}>
                        {isWin ? 'WIN' : 'LOSS'}
                      </span>

                      {/* Game mode icon as avatar */}
                      <div className="mp-match-brawler-avatar-ph" style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: '1.5px solid rgba(255,255,255,0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '12px'
                      }}>
                        {getModeIcon(m.mode)}
                      </div>

                      {/* Name + draft type */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div 
                          onClick={() => onMapClick && onMapClick(m.map_id)}
                          onMouseEnter={e => { if (onMapClick) e.currentTarget.style.textDecoration = 'underline'; }}
                          onMouseLeave={e => { e.currentTarget.style.textDecoration = 'none'; }}
                          style={{ fontSize: '12px', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: onMapClick ? 'pointer' : 'default', color: '#fff' }}
                        >
                          {mapName}
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', display: 'flex', gap: '5px', alignItems: 'center' }}>
                          <span 
                            onClick={() => onModeClick && onModeClick(m.mode)}
                            onMouseEnter={e => { if (onModeClick) e.currentTarget.style.textDecoration = 'underline'; }}
                            onMouseLeave={e => { e.currentTarget.style.textDecoration = 'none'; }}
                            style={{ cursor: onModeClick ? 'pointer' : 'default', color: '#00e5ff' }}
                          >
                            {m.mode}
                          </span>
                          <span>•</span>
                          <span style={{
                            padding: '1px 5px', borderRadius: '4px', fontSize: '9px', fontWeight: 700,
                            background: isRanked ? 'rgba(168,85,247,0.15)' : 'rgba(255,255,255,0.06)',
                            color: isRanked ? '#c084fc' : 'var(--color-text-muted)',
                          }}>
                            {isRanked ? '🏅 Ranked' : '🎮 Normal'}
                          </span>
                          {isRanked ? (
                            m.my_brawler_trophies && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                                {getRankIconUrl(m.my_brawler_trophies) && (
                                  <img src={getRankIconUrl(m.my_brawler_trophies)} alt="" style={{ width: 12, height: 12 }} />
                                )}
                                {getRankById(m.my_brawler_trophies)?.name || m.my_brawler_trophies}
                              </span>
                            )
                          ) : (
                            m.my_brawler_trophies > 0 && (
                              <span>🏆 {m.my_brawler_trophies}</span>
                            )
                          )}
                        </div>
                      </div>

                      {/* Right side: time + star */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px', flexShrink: 0 }}>
                        {m.is_star_player && <span title="Star Player" style={{ fontSize: '12px' }}>👑</span>}
                        <span style={{ fontSize: '9px', color: 'var(--color-text-muted)' }}>{timeAgo(m.date)}</span>
                      </div>
                    </div>
                  );
                })}
                {myMatches.length === 0 && <div className="empty-msg">No recent matches with this brawler.</div>}
              </div>
            </div>

          </div>
        </div>
        </>
      )}
    </div>
  );
}
