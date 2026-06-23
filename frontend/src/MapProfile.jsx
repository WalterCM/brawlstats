import { useState, useMemo, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useFilters } from './context/FilterContext';
import { api } from './services/api';
import { getBrawlerAvatar, getRankById, getRankIconUrl } from './utils/helpers';
import { filterByTimeRange, filterByLevel } from './utils/matchFilters';

const MODE_CONFIG = {
  'Gem Grab':  { icon: '💎', color: '#00e5ff', bg: 'rgba(0,229,255,0.12)',  border: 'rgba(0,229,255,0.35)'  },
  'Brawl Ball':{ icon: '⚽', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.35)' },
  'Heist':     { icon: '💰', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.35)' },
  'Hot Zone':  { icon: '🔥', color: '#ef4444', bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.35)'  },
  'Knockout':  { icon: '💀', color: '#a855f7', bg: 'rgba(168,85,247,0.12)', border: 'rgba(168,85,247,0.35)' },
  'Bounty':    { icon: '⭐', color: '#10b981', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.35)' },
};

const getModeConfig = (mode) => {
  const key = Object.keys(MODE_CONFIG).find(k => k.toLowerCase() === mode?.toLowerCase());
  return key ? MODE_CONFIG[key] : { icon: '⚔️', color: '#9ca3af', bg: 'rgba(156,163,175,0.1)', border: 'rgba(156,163,175,0.3)' };
};

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function MapProfile({ mapId: propMapId, matches = [], brawlers = [], allMaps = [], brawlerMeta = [], minNormalTrophies = 750, onBack, onBrawlerClick }) {
  const params = useParams();
  const mapId = propMapId || params.mapId;

  const {
    timeRange,
    setTimeRange,
    levelMin,
    setLevelMin,
    levelMax,
    setLevelMax,
    selectedTiers,
    setSelectedTiers,
    selectedDraftType,
    setSelectedDraftType
  } = useFilters();

  const mapData = allMaps.find(m => String(m.id) === String(mapId));
  const [suggestions, setSuggestions] = useState([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);
  const [showMapLightbox, setShowMapLightbox] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [mapId]);

  useEffect(() => {
    let cancelled = false;
    setLoadingSuggestions(true);
    api.fetchSuggestions(mapId, [], [], [], [], true, 'allied', 'ranked', 1000)
      .then(data => { if (!cancelled) setSuggestions(data.suggestions || []); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingSuggestions(false); });
    return () => { cancelled = true; };
  }, [mapId]);

  const mapMatches = useMemo(() => {
    let filtered = [...matches];

    if (selectedDraftType !== 'All') {
      filtered = filtered.filter(m => m.draft_type === selectedDraftType.toLowerCase());
    }

    filtered = filterByTimeRange(filtered, timeRange);
    filtered = filterByLevel(filtered, selectedDraftType !== 'All' ? selectedDraftType.toLowerCase() : null, { levelMin, levelMax, selectedTiers });
    return filtered.filter(m => String(m.map_id) === String(mapId)).sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [matches, mapId, selectedDraftType, timeRange, levelMin, levelMax, selectedTiers]);

  const total  = mapMatches.length;
  const wins   = mapMatches.filter(m => m.result === 'victory').length;
  const losses = total - wins;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
  const rankedCount = mapMatches.filter(m => m.draft_type === 'ranked').length;
  const normalCount = total - rankedCount;
  const mvpCount = mapMatches.filter(m => m.is_star_player).length;

  const brawlerStats = useMemo(() => {
    const groups = {};
    mapMatches.forEach(m => {
      const bid = m.my_brawler_id;
      if (!bid) return;
      if (!groups[bid]) groups[bid] = { id: bid, games: 0, wins: 0, mvps: 0 };
      groups[bid].games++;
      if (m.result === 'victory') groups[bid].wins++;
      if (m.is_star_player) groups[bid].mvps++;
    });
    return Object.values(groups)
      .map(g => ({
        ...g,
        name: brawlers.find(b => String(b.id) === String(g.id))?.name || 'Unknown',
        avatar: getBrawlerAvatar(brawlers, g.id),
        winRate: Math.round((g.wins / g.games) * 100),
      }))
      .sort((a, b) => b.games - a.games || b.winRate - a.winRate);
  }, [mapMatches, brawlers]);

  const maxBrawlerGames = brawlerStats[0]?.games || 1;

  // Global WR lookup
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

  // Map Meta Archetype based on meta suggestions
  const mapArchetype = useMemo(() => {
    if (suggestions.length === 0) return null;
    
    const classScores = {};
    suggestions.forEach(s => {
      const b = brawlers.find(br => String(br.id) === String(s.brawler.id));
      if (!b || !b.class_name) return;
      
      const className = b.class_name;
      if (!classScores[className]) {
        classScores[className] = { sum: 0, count: 0 };
      }
      classScores[className].sum += s.components?.A_adjusted_win_rate || 0.5;
      classScores[className].count++;
    });

    const entries = Object.entries(classScores).map(([name, data]) => ({
      name,
      avgWR: Math.round((data.sum / data.count) * 100),
      count: data.count
    }));

    if (entries.length === 0) return null;
    entries.sort((a, b) => b.count - a.count || b.avgWR - a.avgWR);

    return {
      primaryClass: entries[0].name,
      avgWR: entries[0].avgWR,
      allClasses: entries
    };
  }, [suggestions, brawlers]);

  // User Pocket Picks (comfort brawlers that are good on this map)
  const pocketPicks = useMemo(() => {
    return brawlerStats
      .filter(b => b.games >= 2 && b.winRate >= 55)
      .map(b => {
        const isMeta = suggestions.findIndex(s => String(s.brawler.id) === String(b.id));
        return {
          ...b,
          metaRank: isMeta !== -1 ? isMeta + 1 : null
        };
      })
      .slice(0, 3);
  }, [brawlerStats, suggestions]);

  // Draft pick/ban frequency from ranked matches on this map
  const draftFrequency = useMemo(() => {
    const freq = {};
    mapMatches
      .filter(m => m.draft_type === 'ranked')
      .forEach(m => {
        (m.draft_events || []).forEach(evt => {
          const key = `${evt.brawler_id}__${evt.type}__${evt.team}`;
          if (!freq[key]) freq[key] = { brawler_id: evt.brawler_id, type: evt.type, team: evt.team, count: 0 };
          freq[key].count++;
        });
      });
    return Object.values(freq).sort((a, b) => b.count - a.count);
  }, [mapMatches]);

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

  if (!mapData) return null;

  const modeCfg = getModeConfig(mapData.mode);

  return (
    <div 
      className="stats-dashboard-container"
      style={mapData.image_url ? {
        backgroundImage: `linear-gradient(180deg, rgba(10, 10, 10, 0.85) 0%, rgba(10, 10, 10, 0.97) 100%), url(${mapData.image_url})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed',
        borderRadius: '16px',
        padding: '24px'
      } : {}}
    >

      {/* ── Sticky Header ── */}
      <div className="dashboard-header glass-panel mp-header" style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '20px' }}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(0,229,255,0.12)', border: '3px solid var(--color-ally)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
          {mapData.image_url
            ? <img src={mapData.image_url} alt={mapData.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <div style={{ fontSize: '1.8rem' }}>{modeCfg.icon}</div>
          }
        </div>

        <div className="mp-header-info" style={{ flex: 1 }}>
          <div className="mp-header-title-row">
            <h2 className="mp-title" style={{ margin: 0 }}>{mapData.name}</h2>
            <span className="mp-mode-badge" style={{ background: modeCfg.bg, border: `1px solid ${modeCfg.border}`, color: modeCfg.color }}>
              {modeCfg.icon} {mapData.mode}
            </span>
            {mapData.is_ranked && (
              <span className="mp-ranked-badge">🏆 Ranked</span>
            )}
            {mapArchetype && (
              <span className="mp-archetype-badge" style={{ background: 'rgba(168, 85, 247, 0.15)', border: '1px solid rgba(168, 85, 247, 0.4)', color: '#c084fc', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 'bold' }}>
                {(() => {
                  const name = mapArchetype.primaryClass;
                  const emojis = { Marksman: '🎯', Tank: '🛡️', Assassin: '⚡', 'Damage Dealer': '⚔️', Support: '💚', Controller: '🌀', Artillery: '💣' };
                  const emoji = emojis[name] || '👾';
                  return `${emoji} ${name} Meta`;
                })()}
              </span>
            )}
          </div>
          <p className="mp-header-sub" style={{ margin: '4px 0 0' }}>{total} match{total !== 1 ? 'es' : ''} logged</p>
        </div>

        {/* Flat KPI summary aligned to other profiles */}
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center', marginLeft: 'auto', flexWrap: 'wrap' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '22px', fontWeight: 'bold', color: winRate >= 50 ? 'var(--color-ally)' : 'var(--color-enemy)' }}>{winRate}%</div>
            <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Win Rate</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '22px', fontWeight: 'bold', color: 'var(--color-ally)' }}>{wins}</div>
            <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Wins</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '22px', fontWeight: 'bold', color: 'var(--color-enemy)' }}>{losses}</div>
            <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Losses</div>
          </div>
          {mvpCount > 0 && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '22px', fontWeight: 'bold', color: 'var(--color-gold)' }}>👑 {mvpCount}</div>
              <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>MVPs</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Secondary stats bar ── */}
      {total > 0 && (
        <div className="mp-stats-bar glass-panel">
          <div className="mp-stats-bar-item">
            <span className="mp-stats-bar-icon">🏅</span>
            <div>
              <div className="mp-stats-bar-val">{rankedCount}</div>
              <div className="mp-stats-bar-lbl">Ranked</div>
            </div>
          </div>
          <div className="mp-stats-bar-divider" />
          <div className="mp-stats-bar-item">
            <span className="mp-stats-bar-icon">🎮</span>
            <div>
              <div className="mp-stats-bar-val">{normalCount}</div>
              <div className="mp-stats-bar-lbl">Normal</div>
            </div>
          </div>
          <div className="mp-stats-bar-divider" />
          <div className="mp-stats-bar-item">
            <span className="mp-stats-bar-icon">{modeCfg.icon}</span>
            <div>
              <div className="mp-stats-bar-val">{mapData.mode}</div>
              <div className="mp-stats-bar-lbl">Mode</div>
            </div>
          </div>
          <div className="mp-stats-bar-divider" />
          {/* W/L visual bar */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', flexShrink: 0 }}>W/L</span>
            <div style={{ flex: 1, height: '10px', borderRadius: '5px', overflow: 'hidden', background: 'rgba(255,0,85,0.25)' }}>
              <div style={{
                height: '100%',
                width: `${winRate}%`,
                background: 'linear-gradient(90deg, var(--color-ally), #0077ff)',
                borderRadius: '5px',
                transition: 'width 0.6s ease'
              }} />
            </div>
            <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', flexShrink: 0 }}>{wins}W · {losses}L</span>
          </div>
        </div>
      )}

      {total === 0 && suggestions.length === 0 ? (
        <div className="glass-panel" style={{ textAlign: 'center', padding: '60px', marginTop: '20px', color: 'var(--color-text-muted)' }}>
          <div style={{ fontSize: '3rem', marginBottom: '12px' }}>{modeCfg.icon}</div>
          <p>No matches logged on <strong>{mapData.name}</strong> yet.</p>
          <p style={{ fontSize: '12px', marginTop: '8px' }}>Play a match and sync it to see your stats here.</p>
        </div>
      ) : (
        <>
          {/* Pocket Picks Panel */}
          {pocketPicks.length > 0 && (
            <div className="glass-panel" style={{ padding: '16px 20px', marginTop: '20px' }}>
              <h4 style={{ margin: '0 0 12px', fontSize: '13px', textTransform: 'uppercase', color: 'var(--color-text-muted)', letterSpacing: '0.5px' }}>🌟 Your Pocket Picks (Meta + comfort)</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
                {pocketPicks.map(b => (
                  <div 
                    key={b.id} 
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(255,255,255,0.02)', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-glass)', cursor: onBrawlerClick ? 'pointer' : 'default' }}
                    onClick={() => onBrawlerClick && onBrawlerClick(b.id)}
                  >
                    {b.avatar ? (
                      <img src={b.avatar} alt={b.name} style={{ width: '32px', height: '32px', borderRadius: '50%', border: '2.5px solid var(--color-ally)' }} />
                    ) : (
                      <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }} />
                    )}
                    <div>
                      <strong style={{ display: 'block', fontSize: '13px', color: '#fff' }}>{b.name}</strong>
                      <div style={{ display: 'flex', gap: '6px', fontSize: '11px', color: 'var(--color-text-muted)' }}>
                        <span style={{ color: 'var(--color-ally)', fontWeight: 'bold' }}>{b.winRate}% WR</span>
                        <span>·</span>
                        <span>{b.games} games</span>
                        {b.metaRank && (
                          <>
                            <span>·</span>
                            <span style={{ color: 'var(--color-gold)' }}>Meta #{b.metaRank}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="dashboard-main-grid" style={{ marginTop: '20px' }}>

          {/* ── Left column ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

            {/* Suggested Brawlers */}
            <div className="dashboard-section glass-panel">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <h3>💡 Suggested Brawlers</h3>
                <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.2)', padding: '2px 8px', borderRadius: '10px' }}>
                  Bayesian AI
                </span>
              </div>
              <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', margin: '0 0 14px' }}>
                Best picks for <strong style={{ color: '#fff' }}>{mapData.name}</strong> based on your personal history
              </p>

              {loadingSuggestions ? (
                <div style={{ textAlign: 'center', padding: '30px', color: 'var(--color-text-muted)' }}>
                  <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>⏳</div>
                  Loading suggestions...
                </div>
              ) : suggestions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--color-text-muted)' }}>No suggestions available.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {suggestions.slice(0, 10).map((s, idx) => {
                    const brawler = brawlers.find(b => String(b.id) === String(s.brawler.id));
                    const isTop3 = idx < 3;
                    const rankColors = ['#ffd700', '#c0c0c0', '#cd7f32'];
                    const reality = brawlerStats.find(b => String(b.id) === String(s.brawler.id));
                    return (
                      <div
                        key={s.brawler.id}
                        className="mp-suggestion-row"
                        style={{
                          background: isTop3 ? `rgba(${idx === 0 ? '255,215,0' : idx === 1 ? '192,192,192' : '205,127,50'},0.04)` : 'rgba(255,255,255,0.02)',
                          border: `1px solid ${isTop3 ? `rgba(${idx === 0 ? '255,215,0' : idx === 1 ? '192,192,192' : '205,127,50'},0.2)` : 'var(--border-glass)'}`,
                          cursor: onBrawlerClick ? 'pointer' : 'default',
                        }}
                        onClick={() => onBrawlerClick && onBrawlerClick(s.brawler.id)}
                      >
                        {/* Rank */}
                        <span className="mp-sug-rank" style={{ color: isTop3 ? rankColors[idx] : 'var(--color-text-muted)' }}>
                          {isTop3 ? ['🥇','🥈','🥉'][idx] : `#${idx + 1}`}
                        </span>

                        {/* Avatar */}
                        {brawler?.image_url
                          ? <img src={brawler.image_url} alt={brawler.name} className="mp-sug-avatar" />
                          : <div className="mp-sug-avatar-ph" />
                        }

                        {/* Name + class */}
                        <div className="mp-sug-info">
                          <span className="mp-sug-name">{s.brawler.name}</span>
                          {brawler?.class_name && (
                            <span className="mp-sug-class">{brawler.class_name}</span>
                          )}
                        </div>

                        {/* Player data on this map */}
                        {reality && (
                          <div className="mp-sug-reality" style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
                            <span style={{
                              fontSize: '11px', fontWeight: 800, padding: '1px 7px', borderRadius: '5px',
                              background: reality.winRate >= 50 ? 'rgba(0,229,255,0.12)' : 'rgba(255,0,85,0.12)',
                              color: reality.winRate >= 50 ? 'var(--color-ally)' : 'var(--color-enemy)',
                            }}>
                              {reality.winRate}%
                            </span>
                            <span style={{ fontSize: '9px', color: 'var(--color-text-muted)' }}>{reality.games}G</span>
                            {globalWRLookup[String(s.brawler.id)] != null && (() => {
                              const diff = reality.winRate - globalWRLookup[String(s.brawler.id)];
                              const dColor = diff > 5 ? 'var(--color-ally)' : diff < -5 ? 'var(--color-enemy)' : 'var(--color-text-muted)';
                              return (
                                <span style={{ fontSize: '9px', fontWeight: 600, color: dColor }} title={`Global avg: ${globalWRLookup[String(s.brawler.id)]}%`}>
                                  {diff > 0 ? '+' : ''}{diff}%
                                </span>
                              );
                            })()}
                          </div>
                        )}

                        {/* Component breakdown on hover (tooltip) */}
                        <div className="mp-sug-tooltip">
                          <div className="mp-tooltip-row"><span>WR (Bayesian)</span><span>{(s.components.A_adjusted_win_rate * 100).toFixed(1)}%</span></div>
                          <div className="mp-tooltip-row"><span>Matchup factor</span><span>{s.components.B_matchup_factor.toFixed(3)}</span></div>
                          <div className="mp-tooltip-row"><span>Synergy factor</span><span>{s.components.C_synergy_factor.toFixed(3)}</span></div>
                          <div className="mp-tooltip-row"><span>Meta relevance</span><span>{(s.components.D_meta_relevance * 100).toFixed(1)}%</span></div>
                          <div className="mp-tooltip-row"><span>Confidence</span><span>{s.components.E_confidence_penalty.toFixed(2)}×</span></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Brawler Performance */}
            {brawlerStats.length > 0 && (
              <div className="dashboard-section glass-panel">
                <h3>📊 Your Brawlers on this Map</h3>
                <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', margin: '4px 0 14px' }}>
                  Personal performance history on {mapData.name}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {brawlerStats.map(b => {
                    const isGood = b.winRate >= 50;
                    return (
                      <div
                        key={b.id}
                        className="mp-brawler-perf-row"
                        style={{ cursor: onBrawlerClick ? 'pointer' : 'default' }}
                        onClick={() => onBrawlerClick && onBrawlerClick(b.id)}
                      >
                        {/* Avatar */}
                        {b.avatar
                          ? <img src={b.avatar} alt={b.name} className="mp-brawler-perf-avatar" />
                          : <div className="mp-brawler-perf-avatar-ph" />
                        }

                        <div className="mp-brawler-perf-body">
                          <div className="mp-brawler-perf-header">
                            <span className="mp-brawler-perf-name">{b.name}</span>
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                              <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>{b.games}G · {b.wins}W · {b.games - b.wins}L</span>
                              {b.mvps > 0 && <span style={{ fontSize: '10px', color: 'var(--color-gold)' }}>👑 {b.mvps}</span>}
                              <span style={{
                                fontSize: '11px', fontWeight: 800, padding: '1px 8px', borderRadius: '8px',
                                background: isGood ? 'rgba(0,229,255,0.12)' : 'rgba(255,0,85,0.12)',
                                color: isGood ? 'var(--color-ally)' : 'var(--color-enemy)'
                              }}>
                                {b.winRate}%
                              </span>
                              {globalWRLookup[b.id] != null && (() => {
                                const diff = b.winRate - globalWRLookup[b.id];
                                const color = diff > 0 ? 'var(--color-ally)' : diff < 0 ? 'var(--color-enemy)' : 'var(--color-text-muted)';
                                return (
                                  <span style={{ fontSize: '9px', color: 'var(--color-text-muted)' }}>
                                    🌐 {globalWRLookup[b.id]}%
                                    <span style={{ color, fontWeight: 700, marginLeft: '2px' }}>({diff > 0 ? '+' : ''}{diff}%)</span>
                                  </span>
                                );
                              })()}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '5px' }}>
                            <div style={{ flex: 1, height: '7px', borderRadius: '4px', background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                              <div style={{
                                width: `${(b.games / maxBrawlerGames) * 100}%`,
                                height: '100%', borderRadius: '4px',
                                background: isGood
                                  ? 'linear-gradient(90deg, var(--color-ally), #0077ff)'
                                  : 'linear-gradient(90deg, var(--color-enemy), #880022)',
                                transition: 'width 0.5s ease'
                              }} />
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ── Right sidebar ── */}
          <div className="dashboard-sidebar" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

            {/* 🗺️ Large Map Showcase Card */}
            {mapData.image_url && (
              <div className="dashboard-section glass-panel" style={{ padding: '14px', position: 'relative', overflow: 'hidden' }}>
                <h3 style={{ margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>🗺️</span> Map Layout
                </h3>
                <div 
                  className="mp-showcase-image-container"
                  style={{
                    borderRadius: '8px',
                    overflow: 'hidden',
                    background: 'rgba(0,0,0,0.2)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    cursor: 'zoom-in',
                    position: 'relative',
                    aspectRatio: '3 / 4',
                    maxHeight: '400px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  onClick={() => setShowMapLightbox(true)}
                >
                  <img 
                    src={mapData.image_url} 
                    alt={mapData.name} 
                    className="mp-showcase-image"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                      transition: 'transform 0.3s ease',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.05)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                  />
                  <div style={{
                    position: 'absolute',
                    bottom: '8px',
                    right: '8px',
                    background: 'rgba(0,0,0,0.65)',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    fontSize: '10px',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    pointerEvents: 'none'
                  }}>
                    🔍 Click to expand
                  </div>
                </div>
              </div>
            )}

            {/* Draft Pick/Ban Frequency — Ranked Meta Insights */}
            {(topPicks.allied.length > 0 || topPicks.enemy.length > 0 || topPicks.bans.length > 0) && (
              <div className="dashboard-section glass-panel">
                <h3>🎯 Ranked Meta Insights</h3>
                <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', margin: '4px 0 14px' }}>Most frequent picks & bans on this map</p>

                {topPicks.allied.length > 0 && (
                  <div style={{ marginBottom: '14px' }}>
                    <h4 style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--color-ally)', marginBottom: '8px' }}>Allied Picks</h4>
                    {topPicks.allied.map(d => {
                      const b = brawlers.find(br => String(br.id) === String(d.brawler_id));
                      return (
                        <div key={`ap-${d.brawler_id}`} style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '6px' }}>
                          {b?.image_url && <img src={b.image_url} alt={b?.name} style={{ width: '20px', height: '20px', borderRadius: '50%', border: '1.5px solid var(--color-ally)' }} />}
                          <span style={{ fontSize: '11px', width: '70px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b?.name || '?'}</span>
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
                        <div key={`ep-${d.brawler_id}`} style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '6px' }}>
                          {b?.image_url && <img src={b.image_url} alt={b?.name} style={{ width: '20px', height: '20px', borderRadius: '50%', border: '1.5px solid var(--color-enemy)' }} />}
                          <span style={{ fontSize: '11px', width: '70px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b?.name || '?'}</span>
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
                        <div key={`bn-${d.brawler_id}-${d.team}`} style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '6px' }}>
                          {b?.image_url && <img src={b.image_url} alt={b?.name} style={{ width: '20px', height: '20px', borderRadius: '50%', border: '1.5px solid #ffb703', filter: 'grayscale(0.4)' }} />}
                          <span style={{ fontSize: '11px', width: '70px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b?.name || '?'}</span>
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

            {/* Recent Matches */}
            <div className="dashboard-section glass-panel">
              <h3>📋 Recent Matches</h3>
              <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', margin: '4px 0 12px' }}>
                Your last matches on {mapData.name}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                {mapMatches.slice(0, 10).map(m => {
                  const brawlerObj = brawlers.find(b => String(b.id) === String(m.my_brawler_id));
                  const bName = brawlerObj?.name || 'Unknown';
                  const bAvatar = brawlerObj?.image_url;
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

                      {/* Brawler avatar */}
                      {bAvatar
                        ? <img src={bAvatar} alt={bName} className="mp-match-brawler-avatar" />
                        : <div className="mp-match-brawler-avatar-ph">👤</div>
                      }

                      {/* Name + draft type */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '12px', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {bName}
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', display: 'flex', gap: '5px', alignItems: 'center' }}>
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
                {mapMatches.length === 0 && <div className="empty-msg">No recent matches on this map.</div>}
              </div>
            </div>
          </div>
        </div>
        </>
      )}
      {/* Lightbox Modal */}
      {showMapLightbox && mapData.image_url && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.9)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            cursor: 'zoom-out'
          }}
          onClick={() => setShowMapLightbox(false)}
        >
          <div style={{ position: 'relative', maxWidth: '90%', maxHeight: '90%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <button 
              style={{
                position: 'absolute',
                top: '-40px',
                right: '0',
                background: 'rgba(255,255,255,0.1)',
                border: 'none',
                color: '#fff',
                fontSize: '20px',
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              onClick={() => setShowMapLightbox(false)}
            >
              ✕
            </button>
            <img 
              src={mapData.image_url} 
              alt={mapData.name} 
              style={{ 
                maxWidth: '100%', 
                maxHeight: '80vh', 
                borderRadius: '8px', 
                boxShadow: '0 0 30px rgba(0,0,0,0.8)',
                border: '1px solid rgba(255,255,255,0.1)',
                objectFit: 'contain'
              }} 
            />
            <div style={{ marginTop: '15px', color: '#fff', fontSize: '1.2rem', fontWeight: 'bold', textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>
              {mapData.name} ({mapData.mode})
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
