import { useMemo } from 'react';
import { buildTrophyRanges, TIER_GROUPS } from '../utils/matchFilters';

const TIME_OPTIONS = [
  { value: '1d', label: '1d' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
  { value: 'all', label: 'All' },
];

export default function MatchFilterBar({
  timeRange,
  onTimeRangeChange,
  draftType,
  levelMin,
  levelMax,
  onLevelChange,
  selectedTiers,
  onTiersChange,
  minNormalTrophies,
}) {
  const trophyRanges = useMemo(() => buildTrophyRanges(minNormalTrophies), [minNormalTrophies]);

  const dt = draftType?.toLowerCase();
  const showLevel = dt && dt !== 'all';
  const isNormal = dt === 'normal';
  const isRanked = dt === 'ranked';

  const handleTrophyClick = (range) => {
    if (levelMin === range.min && levelMax === (range.max ?? null)) {
      onLevelChange({ levelMin: null, levelMax: null });
    } else {
      onLevelChange({ levelMin: range.min, levelMax: range.max ?? null });
    }
  };

  const handleTierToggle = (groupIds) => {
    const current = selectedTiers || [];
    const allSelected = groupIds.every(id => current.includes(id));
    let next;
    if (allSelected) {
      next = current.filter(id => !groupIds.includes(id));
    } else {
      next = [...current, ...groupIds.filter(id => !current.includes(id))];
    }
    onTiersChange(next);
  };

  const handleClearLevel = () => {
    onLevelChange({ levelMin: null, levelMax: null });
    onTiersChange([]);
  };

  const hasActiveLevel = (isNormal && (levelMin != null || levelMax != null))
    || (isRanked && selectedTiers && selectedTiers.length > 0);

  const isTierActive = (groupIds) => {
    if (!selectedTiers || selectedTiers.length === 0) return false;
    return groupIds.every(id => selectedTiers.includes(id));
  };

  return (
    <div className="match-filter-bar">
      <div className="filter-group-row">
        <label className="filter-bar-label">Time</label>
        <div className="filter-bar-buttons">
          {TIME_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              className={`filter-btn ${timeRange === opt.value ? 'active' : ''}`}
              onClick={() => onTimeRangeChange(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {showLevel && (
        <div className="filter-group-row">
          <label className="filter-bar-label">
            {isNormal ? 'Trophies' : 'Rank'}
          </label>
          <div className="filter-bar-buttons">
            {isNormal && trophyRanges.map(range => {
              const active = levelMin === range.min && levelMax === (range.max ?? null);
              return (
                <button
                  key={range.label}
                  type="button"
                  className={`filter-btn ${active ? 'active' : ''}`}
                  onClick={() => handleTrophyClick(range)}
                >
                  {range.label}
                </button>
              );
            })}
            {isRanked && TIER_GROUPS.map(group => {
              const active = isTierActive(group.ids);
              return (
                <button
                  key={group.label}
                  type="button"
                  className={`filter-btn ${active ? 'active-tier' : ''}`}
                  onClick={() => handleTierToggle(group.ids)}
                >
                  {group.label}
                </button>
              );
            })}
          </div>
          {hasActiveLevel && (
            <button
              type="button"
              className="btn-clear-filter"
              onClick={handleClearLevel}
            >
              ✕ clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}
