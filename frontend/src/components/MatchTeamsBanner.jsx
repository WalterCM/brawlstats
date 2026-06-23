import React from 'react';
import { getBrawlerAvatar, getBrawlerName } from '../utils/helpers';

const BrawlerAvatar = ({ brawlerId, brawlers, borderColor, boxShadow, label, size = '24px' }) => {
  const avatarUrl = getBrawlerAvatar(brawlers, brawlerId);
  const bName = getBrawlerName(brawlers, brawlerId);
  return (
    <div style={{
      position: 'relative', width: size, height: size, borderRadius: '50%',
      border: borderColor, overflow: 'hidden', flexShrink: 0,
      boxShadow: boxShadow || 'none'
    }} title={`${bName}${label ? ` (${label})` : ''}`}>
      {avatarUrl ? (
        <img src={avatarUrl} alt={bName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <div style={{ width: '100%', height: '100%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px' }}>👤</div>
      )}
    </div>
  );
};

const MatchTeamsBanner = ({ match, brawlers, vertical = false }) => {
  const picks = match.draft_events || [];
  const alliedPicks = picks
    .filter(e => e.type === 'pick' && e.team === 'allied')
    .sort((a, b) => a.order - b.order)
    .map(e => e.brawler_id);
  const enemyPicks = picks
    .filter(e => e.type === 'pick' && e.team === 'enemy')
    .sort((a, b) => a.order - b.order)
    .map(e => e.brawler_id);

  if (alliedPicks.length === 0 && match.my_brawler_id) {
    alliedPicks.push(match.my_brawler_id);
  }

  const firstAllyMatchIdx = alliedPicks.findIndex(bId => String(bId) === String(match.my_brawler_id));

  const avatarSize = vertical ? '32px' : '24px';

  return (
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      gap: vertical ? '16px' : '6px',
      flexDirection: 'row' 
    }}>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: vertical ? '4px' : '2px', 
        flexDirection: vertical ? 'column' : 'row' 
      }}>
        {alliedPicks.map((bId, idx) => (
          <BrawlerAvatar
            key={`${bId}-${idx}`}
            brawlerId={bId}
            brawlers={brawlers}
            borderColor={idx === firstAllyMatchIdx ? '2px solid #ffd166' : '1.5px solid var(--color-ally)'}
            boxShadow={idx === firstAllyMatchIdx ? '0 0 6px #ffd166' : 'none'}
            label={idx === firstAllyMatchIdx ? 'You' : undefined}
            size={avatarSize}
          />
        ))}
      </div>
      <span style={{ 
        fontSize: vertical ? '11px' : '9px', 
        fontWeight: 'bold', 
        color: 'var(--color-text-muted)',
        letterSpacing: vertical ? '0.5px' : 'normal'
      }}>
        VS
      </span>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: vertical ? '4px' : '2px', 
        flexDirection: vertical ? 'column' : 'row' 
      }}>
        {enemyPicks.map((bId, idx) => (
          <BrawlerAvatar
            key={`${bId}-${idx}`}
            brawlerId={bId}
            brawlers={brawlers}
            borderColor="1.5px solid var(--color-enemy)"
            size={avatarSize}
          />
        ))}
      </div>
    </div>
  );
};

export default MatchTeamsBanner;
