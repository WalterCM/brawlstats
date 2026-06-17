import { useMemo, useEffect } from 'react';

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

export default function BrawlerProfile({ brawlerId, matches = [], perceptions = [], brawlers = [], allMaps = [], brawlerMeta = [], onBack }) {
  const getBrawler = (id) => brawlers.find(b => String(b.id) === String(id));
  const getMap = (id) => allMaps.find(m => String(m.id) === String(id));

  const brawler = getBrawler(brawlerId);

  // Matches with this brawler
  const myMatches = useMemo(() =>
    [...matches].filter(m => String(m.my_brawler_id) === String(brawlerId)).sort((a, b) => new Date(b.date) - new Date(a.date)),
    [matches, brawlerId]);

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
          position: 'sticky',
          top: 0,
          zIndex: 50,
          backdropFilter: 'blur(20px)',
          display: 'flex',
          alignItems: 'center',
          gap: '20px'
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

            {/* Allied brawlers */}
            {draftFreq.allied.length > 0 && (
              <div className="dashboard-section glass-panel">
                <h3>🤝 Most Frequent Allies</h3>
                <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', margin: '4px 0 12px' }}>Brawlers most often on your team</p>
                {draftFreq.allied.map(item => (
                  <FreqBar key={item.id} name={item.brawler?.name || '?'} avatar={item.brawler?.image_url} count={item.count} maxCount={maxAllied} color="var(--color-ally)" />
                ))}
              </div>
            )}

            {/* Enemy brawlers */}
            {draftFreq.enemy.length > 0 && (
              <div className="dashboard-section glass-panel">
                <h3>⚔️ Most Frequent Enemies</h3>
                <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', margin: '4px 0 12px' }}>Brawlers most often against you</p>
                {draftFreq.enemy.map(item => (
                  <FreqBar key={item.id} name={item.brawler?.name || '?'} avatar={item.brawler?.image_url} count={item.count} maxCount={maxEnemy} color="var(--color-enemy)" />
                ))}
              </div>
            )}
          </div>

          {/* Right column */}
          <div className="dashboard-sidebar" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

            {/* Map win rates */}
            <div className="dashboard-section glass-panel">
              <h3>🗺️ Win Rate by Map</h3>
              <div style={{ marginTop: '12px' }}>
                {mapStats.length === 0
                  ? <div className="empty-msg">No map data.</div>
                  : mapStats.map(m => (
                    <div key={m.mapId} className="map-stat-row">
                      <div className="map-detail">
                        <span className="map-name-lbl">{m.name}</span>
                        <span className="map-mode-lbl">{m.mode}</span>
                      </div>
                      <div className="map-games-metric">
                        <span>{m.games}G</span>
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
                        <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            {b?.image_url && <img src={b.image_url} alt={b.name} style={{ width: '16px', height: '16px', borderRadius: '50%' }} />}
                            <span>{b?.name || '?'}</span>
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
                        <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            {b?.image_url && <img src={b.image_url} alt={b.name} style={{ width: '16px', height: '16px', borderRadius: '50%' }} />}
                            <span>{b?.name || '?'}</span>
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
              <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {myMatches.slice(0, 8).map(m => {
                  const mapName = getMap(m.map_id)?.name || 'Unknown';
                  const isWin = m.result === 'victory';
                  return (
                    <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '6px', background: 'rgba(255,255,255,0.03)', border: `1px solid ${isWin ? 'rgba(0,229,255,0.2)' : 'rgba(255,64,129,0.2)'}` }}>
                      <span style={{ fontSize: '10px', fontWeight: 'bold', padding: '2px 6px', borderRadius: '4px', background: isWin ? 'rgba(0,229,255,0.15)' : 'rgba(255,0,127,0.15)', color: isWin ? 'var(--color-ally)' : 'var(--color-enemy)' }}>
                        {isWin ? 'WIN' : 'LOSS'}
                      </span>
                      <span style={{ fontSize: '11px', flex: 1 }}>{mapName}</span>
                      <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'capitalize' }}>{m.draft_type}</span>
                      {m.is_star_player && <span title="Star Player">👑</span>}
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
