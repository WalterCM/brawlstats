import { useState, useRef, useEffect, useMemo } from 'react';

const MODE_CONFIG = {
  'Gem Grab':   { icon: '💎', color: '#00e5ff' },
  'Brawl Ball': { icon: '⚽', color: '#f59e0b' },
  'Heist':      { icon: '💰', color: '#fbbf24' },
  'Hot Zone':   { icon: '🔥', color: '#ef4444' },
  'Knockout':   { icon: '💀', color: '#a855f7' },
  'Bounty':     { icon: '⭐', color: '#10b981' },
};

const getModeConfig = (mode) => {
  const key = Object.keys(MODE_CONFIG).find(k => k.toLowerCase() === mode?.toLowerCase());
  return key ? MODE_CONFIG[key] : { icon: '⚔️', color: '#9ca3af' };
};

export default function MapSearchWidget({ allMaps = [], matches = [], onNavigate }) {
  const [query, setQuery]           = useState('');
  const [open, setOpen]             = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const inputRef  = useRef(null);
  const listRef   = useRef(null);
  const containerRef = useRef(null);

  // Build match count + WR per map for subtle context in dropdown
  const mapStats = useMemo(() => {
    const data = {};
    matches.forEach(m => {
      if (!m.map_id) return;
      if (!data[m.map_id]) data[m.map_id] = { wins: 0, total: 0 };
      data[m.map_id].total++;
      if (m.result === 'victory') data[m.map_id].wins++;
    });
    const out = {};
    Object.entries(data).forEach(([id, { wins, total }]) => {
      out[id] = { total, wr: Math.round((wins / total) * 100) };
    });
    return out;
  }, [matches]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return allMaps
      .filter(m =>
        m.name.toLowerCase().includes(q) ||
        m.mode?.toLowerCase().includes(q)
      )
      .sort((a, b) => {
        const aStarts = a.name.toLowerCase().startsWith(q);
        const bStarts = b.name.toLowerCase().startsWith(q);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return (mapStats[b.id]?.total || 0) - (mapStats[a.id]?.total || 0);
      })
      .slice(0, 10);
  }, [query, allMaps, mapStats]);

  // Reset highlight when results change
  useEffect(() => { setHighlighted(0); }, [filtered]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (!containerRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Scroll highlighted item into view
  useEffect(() => {
    listRef.current?.children[highlighted]?.scrollIntoView({ block: 'nearest' });
  }, [highlighted]);

  const handleSelect = (map) => {
    setQuery('');
    setOpen(false);
    onNavigate(map.id);
  };

  const handleKeyDown = (e) => {
    if (!open || filtered.length === 0) return;
    if (e.key === 'ArrowDown')  { e.preventDefault(); setHighlighted(h => Math.min(h + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setHighlighted(h => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter')     { if (filtered[highlighted]) handleSelect(filtered[highlighted]); }
    else if (e.key === 'Escape')    { setOpen(false); setQuery(''); }
  };

  const showDropdown = open && filtered.length > 0;

  return (
    <div ref={containerRef} className="msw-bar-container">
      {/* ── Input ── */}
      <div className={`msw-bar-wrap ${showDropdown ? 'msw-bar-wrap--open' : ''}`}>
        <span className="msw-bar-icon">🔍</span>
        <input
          ref={inputRef}
          type="text"
          className="msw-bar-input"
          placeholder="Search maps by name or mode…"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => { if (query) setOpen(true); }}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          spellCheck={false}
        />
        {query && (
          <button className="msw-bar-clear" onClick={() => { setQuery(''); setOpen(false); inputRef.current?.focus(); }}>✕</button>
        )}
      </div>

      {/* ── Dropdown ── */}
      {showDropdown && (
        <div className="msw-bar-dropdown" ref={listRef}>
          {filtered.map((m, i) => {
            const cfg = getModeConfig(m.mode);
            const stats = mapStats[m.id];
            const isHl = i === highlighted;
            return (
              <button
                key={m.id}
                type="button"
                className={`msw-bar-row ${isHl ? 'msw-bar-row--hl' : ''}`}
                onMouseEnter={() => setHighlighted(i)}
                onClick={() => handleSelect(m)}
              >
                {m.image_url
                  ? <img src={m.image_url} alt={m.name} className="msw-bar-thumb" />
                  : <div className="msw-bar-thumb-ph">{cfg.icon}</div>
                }

                <div className="msw-bar-info">
                  <span className="msw-bar-name">{m.name}</span>
                  <span className="msw-bar-mode" style={{ color: cfg.color }}>
                    {cfg.icon} {m.mode}
                  </span>
                </div>

                <div className="msw-bar-meta">
                  {stats ? (
                    <>
                      <span className="msw-bar-games">{stats.total}G</span>
                      <span
                        className="msw-bar-wr"
                        style={{
                          color: stats.wr >= 50 ? 'var(--color-ally)' : 'var(--color-enemy)',
                          background: stats.wr >= 50 ? 'rgba(0,229,255,0.1)' : 'rgba(255,0,85,0.1)',
                        }}
                      >
                        {stats.wr}%
                      </span>
                    </>
                  ) : (
                    <span className="msw-bar-unplayed">Unplayed</span>
                  )}
                  <span className={`msw-bar-arrow ${isHl ? 'msw-bar-arrow--hl' : ''}`}>→</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
