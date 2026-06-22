import React from 'react';
import { useFilters } from '../context/FilterContext';
import MatchFilterBar from './MatchFilterBar';
import { getModeIcon } from '../utils/helpers';

const GAME_MODES = [
  { value: 'All', label: '🎮 All Game Modes' },
  { value: 'gemGrab', label: '💎 Gem Grab' },
  { value: 'brawlBall', label: '⚽ Brawl Ball' },
  { value: 'heist', label: '💰 Heist' },
  { value: 'hotZone', label: '🔥 Hot Zone' },
  { value: 'knockout', label: '💀 Knockout' },
  { value: 'bounty', label: '⭐ Bounty' },
];

const BRAWLER_CLASSES = [
  'All',
  'Damage Dealer',
  'Tank',
  'Marksman',
  'Assassin',
  'Support',
  'Controller',
  'Artillery',
];

export default function GlobalFilterBar({ minNormalTrophies, containerRef }) {
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
    setSelectedTiers,
  } = useFilters();

  return (
    <div ref={containerRef} className="global-filter-bar glass-panel animate-fade-in">
      <div className="filter-group-row" style={{ display: 'flex', gap: '15px', marginBottom: '15px', flexWrap: 'wrap' }}>
        <div className="filter-control" style={{ flex: '1 1 180px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '5px', color: 'var(--text-secondary)' }}>Game Mode</label>
          <select
            value={selectedMode}
            onChange={(e) => setSelectedMode(e.target.value)}
            style={{ width: '100%', padding: '8px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
          >
            {GAME_MODES.map((mode) => (
              <option key={mode.value} value={mode.value} style={{ background: '#1e1b29', color: '#fff' }}>
                {mode.label}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-control" style={{ flex: '1 1 180px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '5px', color: 'var(--text-secondary)' }}>Draft Format</label>
          <select
            value={selectedDraftType}
            onChange={(e) => setSelectedDraftType(e.target.value)}
            style={{ width: '100%', padding: '8px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
          >
            <option value="All" style={{ background: '#1e1b29', color: '#fff' }}>🏆 All Formats</option>
            <option value="Ranked" style={{ background: '#1e1b29', color: '#fff' }}>🛡️ Competitive (Ranked)</option>
            <option value="Normal" style={{ background: '#1e1b29', color: '#fff' }}>🎮 Normal (No Bans)</option>
          </select>
        </div>

        <div className="filter-control" style={{ flex: '1 1 180px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', marginBottom: '5px', color: 'var(--text-secondary)' }}>Brawler Class</label>
          <select
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            style={{ width: '100%', padding: '8px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
          >
            {BRAWLER_CLASSES.map((cls) => (
              <option key={cls} value={cls} style={{ background: '#1e1b29', color: '#fff' }}>
                {cls === 'All' ? '⚡ All Classes' : cls}
              </option>
            ))}
          </select>
        </div>
      </div>

      <MatchFilterBar
        timeRange={timeRange}
        onTimeRangeChange={setTimeRange}
        draftType={selectedDraftType}
        levelMin={levelMin}
        levelMax={levelMax}
        onLevelChange={({ levelMin: lm, levelMax: lx }) => {
          setLevelMin(lm);
          setLevelMax(lx);
        }}
        selectedTiers={selectedTiers}
        onTiersChange={setSelectedTiers}
        minNormalTrophies={minNormalTrophies}
      />
    </div>
  );
}
