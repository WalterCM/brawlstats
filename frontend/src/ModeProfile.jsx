import { useMemo, useEffect } from 'react';

const MODE_ICONS = {
  bounty: '⭐',
  brawlball: '⚽',
  gemgrab: '💎',
  heist: '💰',
  hotzone: '🔥',
  knockout: '💀',
  showdown: '🌵',
  soloshowdown: '🌵',
  duoshowdown: '👥',
};

function getModeIcon(mode) {
  if (!mode) return '⚔️';
  const key = mode.toLowerCase().replace(/[^a-z0-9]/g, '');
  return MODE_ICONS[key] || '⚔️';
}

function RollingWinRateChart({ matches, windowSize = 5, height = 120, width = 400 }) {
  const points = useMemo(() => {
    if (matches.length < 2) return [];
    const sorted = [...matches].sort((a, b) => new Date(a.date) - new Date(b.date));
    const pts = [];
    for (let i = windowSize - 1; i < sorted.length; i++) {
      const w = sorted.slice(Math.max(0, i - windowSize + 1), i + 1);
      pts.push((w.filter(m => m.result === 'victory').length / w.length) * 100);
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
      <line x1={padX} y1={toY(50)} x2={width - padX} y2={toY(50)} stroke="rgba(255,255,255,0.15)" strokeWidth="1" strokeDasharray="4 3" />
      <text x={padX - 4} y={toY(50) + 4} fill="rgba(255,255,255,0.3)" fontSize="9" textAnchor="end">50%</text>
      <text x={padX - 4} y={toY(100) + 4} fill="rgba(255,255,255,0.3)" fontSize="9" textAnchor="end">100%</text>
      <text x={padX - 4} y={toY(0) + 4} fill="rgba(255,255,255,0.3)" fontSize="9" textAnchor="end">0%</text>
      <polygon points={area} fill={color} fillOpacity="0.08" />
      <polyline points={polyline} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={toX(points.length - 1)} cy={toY(lastVal)} r="4" fill={color} />
      <text x={toX(points.length - 1) + 6} y={toY(lastVal) + 4} fill={color} fontSize="9" fontWeight="bold">{Math.round(lastVal)}%</text>
    </svg>
  );
}

export default function ModeProfile({ mode, matches = [], brawlers = [], allMaps = [], brawlerMeta = [], onBack, onBrawlerClick, onMapClick }) {
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [mode]);

  const modeMatches = useMemo(() =>
    [...matches].filter(m => m.mode === mode).sort((a, b) => new Date(b.date) - new Date(a.date)),
    [matches, mode]
  );

  const total = modeMatches.length;
  const wins = modeMatches.filter(m => m.result === 'victory').length;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
  const rankedCount = modeMatches.filter(m => m.draft_type === 'ranked').length;
  const normalCount = total - rankedCount;
  const mvps = modeMatches.filter(m => m.is_star_player).length;

  const brawlerStats = useMemo(() => {
    const groups = {};
    modeMatches.forEach(m => {
      const bid = m.my_brawler_id;
      if (!bid) return;
      if (!groups[bid]) groups[bid] = { id: bid, games: 0, wins: 0, mvps: 0, trophiesSum: 0, trophiesCount: 0 };
      groups[bid].games++;
      if (m.result === 'victory') groups[bid].wins++;
      if (m.is_star_player) groups[bid].mvps++;
      if (m.my_brawler_trophies && m.draft_type === 'normal' && m.my_brawler_trophies > 50) {
        groups[bid].trophiesSum += m.my_brawler_trophies;
        groups[bid].trophiesCount++;
      }
    });

    // Build global WR lookup (average per brawler_id)
    const globalLookup = {};
    brawlerMeta.forEach(rec => {
      const id = String(rec.brawler_id);
      if (!globalLookup[id]) globalLookup[id] = { sum: 0, count: 0 };
      globalLookup[id].sum += rec.win_rate;
      globalLookup[id].count++;
    });

    return Object.values(groups).map(g => {
      const b = brawlers.find(br => String(br.id) === String(g.id));
      const globalRec = globalLookup[String(g.id)];
      return {
        ...g,
        name: b?.name || 'Unknown',
        avatar: b?.image_url || '',
        bClass: b?.class_name || '',
        winRate: Math.round((g.wins / g.games) * 100),
        avgTrophies: g.trophiesCount > 0 ? Math.round(g.trophiesSum / g.trophiesCount) : 0,
        globalWR: globalRec ? Math.round((globalRec.sum / globalRec.count) * 100) : null,
      };
    }).sort((a, b) => b.games - a.games || b.winRate - a.winRate);
  }, [modeMatches, brawlers, brawlerMeta]);

  const mapStats = useMemo(() => {
    const groups = {};
    modeMatches.forEach(m => {
      const mid = m.map_id;
      if (!mid) return;
      if (!groups[mid]) groups[mid] = { mapId: mid, games: 0, wins: 0 };
      groups[mid].games++;
      if (m.result === 'victory') groups[mid].wins++;
    });

    return Object.values(groups).map(g => {
      const mp = allMaps.find(m => String(m.id) === String(g.mapId));
      return {
        ...g,
        name: mp?.name || 'Unknown',
        image: mp?.image_url || null,
        winRate: Math.round((g.wins / g.games) * 100),
      };
    }).sort((a, b) => b.games - a.games || b.winRate - a.winRate);
  }, [modeMatches, allMaps]);

  const icon = getModeIcon(mode);

  if (!mode) return null;

  return (
    <div className="stats-dashboard-container">
      {/* Header */}
      <div className="dashboard-header glass-panel" style={{ position: 'sticky', top: 0, zIndex: 50, backdropFilter: 'blur(20px)', display: 'flex', alignItems: 'center', gap: '20px' }}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(0,229,255,0.12)', border: '3px solid var(--color-ally)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem', flexShrink: 0 }}>
          {icon}
        </div>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0 }}>{mode}</h2>
          <p className="welcome-subtitle" style={{ margin: 0 }}>{total} matches logged</p>
        </div>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '22px', fontWeight: 'bold', color: winRate >= 50 ? 'var(--color-ally)' : 'var(--color-enemy)' }}>{winRate}%</div>
            <div style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>Win Rate</div>
          </div>
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
          No matches logged in {mode} yet.
        </div>
      ) : (
        <div className="dashboard-main-grid" style={{ marginTop: '20px' }}>
          {/* Left column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

            {/* Brawler Performance Table */}
            <div className="dashboard-section glass-panel">
              <div className="section-header">
                <h3>Brawler Performance in {mode}</h3>
              </div>
              <div className="table-wrapper">
                {brawlerStats.length === 0 ? (
                  <div className="empty-msg">No brawlers in this mode.</div>
                ) : (
                  <table className="stats-table">
                    <thead>
                      <tr>
                        <th style={{ width: '32px' }}>#</th>
                        <th>Brawler</th>
                        <th>Class</th>
                        <th>Games</th>
                        <th>Win Rate</th>
                        {brawlerStats[0]?.globalWR !== null && <th>Global WR</th>}
                        {brawlerStats[0]?.globalWR !== null && <th>vs Global</th>}
                        <th>Avg Trophies</th>
                        <th>MVP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {brawlerStats.map((b, i) => (
                        <tr
                          key={b.id}
                          onClick={() => onBrawlerClick && onBrawlerClick(b.id)}
                          style={{ cursor: onBrawlerClick ? 'pointer' : 'default' }}
                          onMouseEnter={e => { if (onBrawlerClick) e.currentTarget.style.background = 'rgba(0,229,255,0.06)'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = ''; }}
                        >
                          <td style={{ color: 'var(--color-text-muted)', fontWeight: 600, fontSize: '0.8rem', textAlign: 'center' }}>{i + 1}</td>
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
                                <div className={`micro-fill ${b.winRate >= 50 ? 'ally-bg' : 'enemy-bg'}`} style={{ width: `${b.winRate}%` }}></div>
                              </div>
                            </div>
                          </td>
                          {b.globalWR !== null && (
                            <td className="global-wr-td">
                              <span style={{ color: 'var(--color-text-muted)' }}>{b.globalWR}%</span>
                            </td>
                          )}
                          {b.globalWR !== null && (
                            <td className="vs-global-td">
                              {(() => {
                                const diff = b.winRate - b.globalWR;
                                const color = diff > 0 ? 'var(--color-ally)' : diff < 0 ? 'var(--color-enemy)' : 'var(--color-text-muted)';
                                return <span style={{ color, fontWeight: 700, fontSize: '12px' }}>{diff > 0 ? '+' : ''}{diff}%</span>;
                              })()}
                            </td>
                          )}
                          <td>{b.avgTrophies > 0 ? `${b.avgTrophies} 🏆` : 'N/A'}</td>
                          <td>{b.mvps > 0 ? <span className="mvp-badge">👑 {b.mvps}</span> : <span style={{ color: 'var(--color-text-muted)' }}>0</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Rolling Win Rate */}
            <div className="dashboard-section glass-panel">
              <h3>📈 Win Rate Trend (Rolling 5)</h3>
              <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', margin: '4px 0 12px' }}>
                Sliding window of last 5 matches in {mode}
              </p>
              <RollingWinRateChart matches={modeMatches} windowSize={5} />
            </div>

            {/* Draft Type Split */}
            <div className="dashboard-section glass-panel">
              <h3>🏷️ Draft Type Split</h3>
              <div style={{ display: 'flex', gap: '20px', marginTop: '8px' }}>
                <div style={{ flex: 1, padding: '12px 16px', borderRadius: '8px', background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)' }}>
                  <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#c084fc' }}>{rankedCount}</div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Ranked</div>
                </div>
                <div style={{ flex: 1, padding: '12px 16px', borderRadius: '8px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-glass)' }}>
                  <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#fff' }}>{normalCount}</div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Normal</div>
                </div>
                {total > 0 && (
                  <div style={{ flex: 2, display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', flexShrink: 0 }}>Split</span>
                    <div style={{ flex: 1, height: '10px', borderRadius: '5px', overflow: 'hidden', background: 'rgba(255,255,255,0.08)' }}>
                      <div style={{ width: `${(rankedCount / total) * 100}%`, height: '100%', background: '#c084fc', borderRadius: '5px' }} />
                    </div>
                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', flexShrink: 0 }}>{Math.round((rankedCount / total) * 100)}% ranked</span>
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* Right sidebar */}
          <div className="dashboard-sidebar" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

            {/* Map Breakdown */}
            <div className="dashboard-section glass-panel">
              <h3>🗺️ {mode} Maps</h3>
              <div style={{ marginTop: '12px' }}>
                {mapStats.length === 0 ? (
                  <div className="empty-msg">No map data.</div>
                ) : (
                  mapStats.map(m => (
                    <div
                      key={m.mapId}
                      className="map-stat-row"
                      style={{ cursor: onMapClick ? 'pointer' : 'default' }}
                      onClick={() => onMapClick && onMapClick(m.mapId)}
                    >
                      <div className="map-detail">
                        <span className="map-name-lbl">{m.name}</span>
                        <span className="map-mode-lbl">{m.games} games</span>
                      </div>
                      <div className="map-games-metric">
                        <span className={`map-wr-badge ${m.winRate >= 50 ? 'win-badge' : 'loss-badge'}`}>
                          {m.winRate}% WR
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Summary KPIs */}
            <div className="dashboard-section glass-panel">
              <h3>📊 Summary</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderRadius: '6px', background: 'rgba(255,255,255,0.03)' }}>
                  <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Total Matches</span>
                  <span style={{ fontSize: '14px', fontWeight: 'bold' }}>{total}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderRadius: '6px', background: 'rgba(255,255,255,0.03)' }}>
                  <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Wins / Losses</span>
                  <span style={{ fontSize: '14px', fontWeight: 'bold' }}>{wins}W / {total - wins}L</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderRadius: '6px', background: 'rgba(255,255,255,0.03)' }}>
                  <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Brawlers Used</span>
                  <span style={{ fontSize: '14px', fontWeight: 'bold' }}>{brawlerStats.length}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderRadius: '6px', background: 'rgba(255,255,255,0.03)' }}>
                  <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Maps Played</span>
                  <span style={{ fontSize: '14px', fontWeight: 'bold' }}>{mapStats.length}</span>
                </div>
              </div>
            </div>

            {onBrawlerClick && (
              <div style={{ padding: '12px 16px', borderRadius: '8px', background: 'rgba(0,229,255,0.06)', border: '1px solid rgba(0,229,255,0.15)', fontSize: '11px', color: 'var(--color-text-muted)' }}>
                💡 Click any brawler to view their detailed profile
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}
