import React, { useState, useEffect, useRef } from 'react';

const MODE_CONFIG = {
  'All': {
    icon: '🗺️',
    color: '#9ca3af',
    glow: 'rgba(156, 163, 175, 0.3)',
    gradient: 'linear-gradient(135deg, #4b5563, #374151)',
  },
  'Brawl Ball': {
    icon: '⚽',
    color: '#00e5ff',
    glow: 'rgba(0, 229, 255, 0.35)',
    gradient: 'linear-gradient(135deg, #00e5ff, #0077ff)',
  },
  'Gem Grab': {
    icon: '💎',
    color: '#a855f7',
    glow: 'rgba(168, 85, 247, 0.35)',
    gradient: 'linear-gradient(135deg, #a855f7, #7c3aed)',
  },
  'Heist': {
    icon: '💰',
    color: '#c084fc',
    glow: 'rgba(192, 132, 252, 0.35)',
    gradient: 'linear-gradient(135deg, #c084fc, #a78bfa)',
  },
  'Hot Zone': {
    icon: '🔥',
    color: '#ef4444',
    glow: 'rgba(239, 68, 68, 0.35)',
    gradient: 'linear-gradient(135deg, #ef4444, #dc2626)',
  },
  'Knockout': {
    icon: '💀',
    color: '#f59e0b',
    glow: 'rgba(245, 158, 11, 0.35)',
    gradient: 'linear-gradient(135deg, #f59e0b, #d97706)',
  },
  'Bounty': {
    icon: '⭐',
    color: '#fbbf24',
    glow: 'rgba(251, 191, 36, 0.35)',
    gradient: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
  },
};

const MODES = Object.keys(MODE_CONFIG);

const getModeConfig = (mode) => {
  const key = Object.keys(MODE_CONFIG).find(
    k => k.toLowerCase() === mode?.toLowerCase()
  );
  return key ? MODE_CONFIG[key] : { icon: '⚔️', color: '#9ca3af', glow: 'rgba(156,163,175,0.3)', gradient: 'linear-gradient(135deg, #4b5563, #374151)' };
};

const PAGE_SIZE = 20;

const MapSelectorModal = ({ isOpen, maps, selectedMap, onSelectMap, onClose }) => {
  const [filterMode, setFilterMode] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const searchRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setPage(0);
      setTimeout(() => searchRef.current?.focus(), 100);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  useEffect(() => {
    setPage(0);
  }, [filterMode, searchQuery]);

  if (!isOpen) return null;

  const filteredMaps = maps
    .filter(m => filterMode === 'All' || m.mode === filterMode)
    .filter(m => m.name.toLowerCase().includes(searchQuery.toLowerCase()));

  const pageCount = Math.max(1, Math.ceil(filteredMaps.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const paginatedMaps = filteredMaps.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  return (
    <div className="msm-backdrop" onClick={onClose}>
      <div className="msm-panel glass-panel" onClick={(e) => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="msm-header">
          <div className="msm-header-left">
            <span className="msm-header-icon">🗺️</span>
            <div>
              <h2 className="msm-title">Select Map</h2>
              <p className="msm-subtitle">
                {filteredMaps.length} map{filteredMaps.length !== 1 ? 's' : ''} available
              </p>
            </div>
          </div>
          <button className="msm-close-btn" onClick={onClose} title="Close (Esc)">
            ✕
          </button>
        </div>

        {/* ── Search Bar ── */}
        <div className="msm-search-wrapper">
          <span className="msm-search-icon">🔍</span>
          <input
            ref={searchRef}
            type="text"
            className="msm-search-input"
            placeholder="Search by map name…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="msm-search-clear" onClick={() => setSearchQuery('')}>✕</button>
          )}
        </div>

        {/* ── Mode Tabs ── */}
        <div className="msm-tabs">
          {MODES.map(mode => {
            const cfg = MODE_CONFIG[mode];
            const isActive = filterMode === mode;
            return (
              <button
                key={mode}
                type="button"
                className={`msm-tab ${isActive ? 'msm-tab--active' : ''}`}
                style={isActive ? {
                  background: cfg.gradient,
                  borderColor: 'transparent',
                  boxShadow: `0 0 14px ${cfg.glow}`,
                  color: '#fff',
                } : {}}
                onClick={() => setFilterMode(mode)}
              >
                <span className="msm-tab-icon">{cfg.icon}</span>
                <span className="msm-tab-label">{mode}</span>
              </button>
            );
          })}
        </div>

        {/* ── Map Grid ── */}
        <div className="msm-grid-wrapper">
          {filteredMaps.length === 0 ? (
            <div className="msm-empty">
              <span>🔍</span>
              <p>No maps match your search.</p>
            </div>
          ) : (
            <div className="msm-grid">
              {paginatedMaps.map(m => {
                const cfg = getModeConfig(m.mode);
                const isSelected = selectedMap?.id === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    className={`msm-card ${isSelected ? 'msm-card--selected' : ''}`}
                    style={isSelected ? {
                      borderColor: cfg.color,
                      boxShadow: `0 0 18px ${cfg.glow}, inset 0 0 0 1px ${cfg.color}40`,
                    } : {}}
                    onClick={() => {
                      onSelectMap(m);
                      onClose();
                    }}
                  >
                    {/* Map Image */}
                    <div className="msm-card-img-wrapper">
                      {m.image_url ? (
                        <img src={m.image_url} alt={m.name} className="msm-card-img" />
                      ) : (
                        <div className="msm-card-img-placeholder">No Image</div>
                      )}

                      {/* Mode badge overlay */}
                      <div
                        className="msm-mode-badge"
                        style={{ background: cfg.gradient }}
                      >
                        {cfg.icon} {m.mode}
                      </div>

                      {/* Selected checkmark */}
                      {isSelected && (
                        <div
                          className="msm-selected-overlay"
                          style={{ background: `${cfg.color}20`, borderColor: cfg.color }}
                        >
                          <div className="msm-checkmark" style={{ color: cfg.color }}>✓</div>
                        </div>
                      )}
                    </div>

                    {/* Card Footer */}
                    <div className="msm-card-footer">
                      <span className="msm-card-name">{m.name}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Pagination ── */}
        {pageCount > 1 && (
          <div className="msm-pagination">
            <button type="button" className="msm-page-btn" disabled={safePage === 0} onClick={() => setPage(p => p - 1)}>
              ‹
            </button>
            {Array.from({ length: pageCount }, (_, i) => (
              <button
                key={i}
                type="button"
                className={`msm-page-btn ${i === safePage ? 'msm-page-btn--active' : ''}`}
                onClick={() => setPage(i)}
              >
                {i + 1}
              </button>
            ))}
            <button type="button" className="msm-page-btn" disabled={safePage >= pageCount - 1} onClick={() => setPage(p => p + 1)}>
              ›
            </button>
          </div>
        )}

      </div>
    </div>
  );
};

export default MapSelectorModal;
