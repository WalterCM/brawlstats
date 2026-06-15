import React, { useState } from 'react';

const MODES = ['All', 'Brawl Ball', 'Gem Grab', 'Heist', 'Hot Zone', 'Knockout', 'Bounty'];

const MapSelectorModal = ({ isOpen, maps, selectedMap, onSelectMap, onClose }) => {
  const [filterMode, setFilterMode] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  if (!isOpen) return null;

  const filteredMaps = maps
    .filter(m => filterMode === 'All' || m.mode === filterMode)
    .filter(m => m.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="map-selector-modal-backdrop" onClick={onClose}>
      <div className="map-selector-modal glass-panel" onClick={(e) => e.stopPropagation()}>
        <div className="map-modal-header">
          <h2>Select Map</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        <div className="map-modal-tabs">
          {MODES.map(mode => (
            <button
              key={mode}
              type="button"
              className={`map-tab-btn ${filterMode === mode ? 'active' : ''}`}
              onClick={() => setFilterMode(mode)}
            >
              {mode}
            </button>
          ))}
        </div>

        <div className="map-search-bar" style={{ padding: '12px 24px', borderBottom: '1px solid var(--border-glass)', flexShrink: 0 }}>
          <input
            type="text"
            placeholder="Search map by name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
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
            {filteredMaps.map(m => (
              <div
                key={m.id}
                className={`map-card ${selectedMap?.id === m.id ? 'active' : ''}`}
                onClick={() => {
                  onSelectMap(m);
                  onClose();
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
  );
};

export default MapSelectorModal;
