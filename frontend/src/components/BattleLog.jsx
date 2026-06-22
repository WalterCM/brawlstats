import { useState } from 'react';
import { api } from '../services/api';
import { getMapName, getBrawlerName, getBrawlerAvatar, getModeIcon, getRankById, getRankIconUrl } from '../utils/helpers';
import MatchTeamsBanner from './MatchTeamsBanner';

export default function BattleLog({
  matches = [],
  brawlers = [],
  allMaps = [],
  isOwnProfile = true,
  handleSyncHistory,
  syncingHistory,
  onMatchesChange
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [ratingMatchId, setRatingMatchId] = useState(null);
  const [linkingMatchId, setLinkingMatchId] = useState(null);

  const handleSavePerceptionInline = async (matchId, rivalId, value) => {
    try {
      const match = matches.find(m => m.id === matchId);
      if (!match) return;
      await api.savePerception(matchId, match.my_brawler_id, rivalId, value);
      if (onMatchesChange) {
        onMatchesChange(prev => prev.map(m => {
          if (m.id === matchId) {
            const updatedPerceptions = { ...(m.perceptions || {}), [rivalId]: value };
            return { ...m, perceptions: updatedPerceptions };
          }
          return m;
        }));
      }
    } catch (err) {
      console.error("Failed to save perception:", err);
    }
  };

  const handleLinkMatchAPI = async (matchId) => {
    setLinkingMatchId(matchId);
    try {
      await api.linkMatchAPI(matchId);
      if (onMatchesChange) {
        // Trigger parent state update to reflect linked state
        onMatchesChange(prev => prev.map(m => {
          if (m.id === matchId) {
            return { ...m, api_match_id: 'linked' };
          }
          return m;
        }));
      }
    } catch (err) {
      console.error("Failed to link match:", err);
    } finally {
      setLinkingMatchId(null);
    }
  };

  return (
    <div className="battle-log-card glass-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <h2>📜 {isOwnProfile ? 'My Battle Log' : 'Battle Log'}</h2>
      </div>
      
      <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
        <input 
          type="text" 
          placeholder="🔍 Search by Brawler..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            flex: 1,
            background: 'rgba(0, 0, 0, 0.2)',
            border: '1px solid var(--border-glass)',
            borderRadius: '6px',
            padding: '8px 12px',
            color: '#fff',
            fontSize: '12px'
          }}
        />
      </div>

      <div className="match-list" style={{ flex: 1, overflowY: 'auto', maxHeight: '380px', paddingRight: '5px' }}>
        {matches
          .filter(m => {
            if (!searchQuery) return true;
            const bName = getBrawlerName(brawlers, m.my_brawler_id).toLowerCase();
            return bName.includes(searchQuery.toLowerCase());
          })
          .map((m) => {
            const isRatingOpen = ratingMatchId === m.id;
            const enemyPicks = m.draft_events?.filter(e => e.team === 'enemy' && e.type === 'pick') || [];
            return (
              <div key={m.id} style={{ display: 'flex', flexDirection: 'column', marginBottom: '8px' }}>
                <div 
                  className={`match-item ${m.result === 'victory' ? 'win' : 'loss'}`} 
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '8px', 
                    padding: '8px 10px', 
                    fontSize: '11px', 
                    borderRadius: '6px', 
                    background: 'rgba(255, 255, 255, 0.03)', 
                    border: '1px solid var(--border-glass)' 
                  }}
                >
                  <MatchTeamsBanner match={m} brawlers={brawlers} />
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span className="map-name" style={{ fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--color-text)' }}>
                        {getMapName(allMaps, m.map_id)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: 'var(--color-text-muted)' }}>
                      <span style={{ textTransform: 'capitalize' }}>{getModeIcon(m.mode)} {m.mode}</span>
                      <span>•</span>
                      <span>{getBrawlerName(brawlers, m.my_brawler_id)}</span>
                      <span>•</span>
                      <span style={{ textTransform: 'capitalize', color: m.draft_type === 'ranked' ? 'var(--color-ally)' : 'var(--color-text-muted)' }}>
                        {m.draft_type}
                      </span>
                      {m.my_brawler_trophies != null && (
                        <>
                          <span>•</span>
                          {m.draft_type === 'ranked' ? (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                              {getRankIconUrl(m.my_brawler_trophies) && (
                                <img src={getRankIconUrl(m.my_brawler_trophies)} alt="" style={{ width: 12, height: 12 }} />
                              )}
                              {getRankById(m.my_brawler_trophies)?.name || m.my_brawler_trophies}
                            </span>
                          ) : (
                            <span>{m.my_brawler_trophies}🏆</span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {isOwnProfile && enemyPicks.length > 0 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setRatingMatchId(isRatingOpen ? null : m.id);
                        }}
                        style={{
                          background: isRatingOpen ? 'rgba(0, 229, 255, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          color: 'var(--color-text)',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          padding: '4px 6px',
                          fontSize: '11px',
                          fontWeight: '600',
                          transition: 'all 0.2s'
                        }}
                        title="Rate matchups"
                      >
                        {isRatingOpen ? '✖ Close' : '⚡ Rate'}
                      </button>
                    )}
                    <span className="result-badge" style={{ fontSize: '9px', fontWeight: 'bold', padding: '2px 6px', borderRadius: '4px', background: m.result === 'victory' ? 'rgba(0,229,255,0.15)' : 'rgba(255,0,127,0.15)', color: m.result === 'victory' ? 'var(--color-ally)' : 'var(--color-enemy)' }}>
                      {m.result === 'victory' ? 'WIN' : 'LOSS'}
                    </span>
                    {isOwnProfile && !m.api_match_id && (
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleLinkMatchAPI(m.id);
                        }}
                        disabled={linkingMatchId === m.id}
                        style={{
                          background: 'linear-gradient(135deg, #4caf50 0%, #2e7d32 100%)',
                          borderColor: '#2e7d32',
                          color: '#fff',
                          padding: '4px 6px',
                          fontSize: '11px',
                          fontWeight: '600',
                          cursor: 'pointer',
                          borderRadius: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        {linkingMatchId === m.id ? 'Linking...' : '🔗 Link'}
                      </button>
                    )}
                  </div>
                </div>
                
                {isOwnProfile && isRatingOpen && (
                  <div style={{
                    background: 'rgba(255, 255, 255, 0.01)',
                    border: '1px solid var(--border-glass)',
                    borderTop: 'none',
                    borderBottomLeftRadius: '6px',
                    borderBottomRightRadius: '6px',
                    padding: '10px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    marginTop: '-8px',
                    zIndex: 1,
                    marginBottom: '8px'
                  }}>
                    <div style={{ fontWeight: '600', fontSize: '10px', color: 'var(--color-text-muted)' }}>
                      Rate matchup comfort as {getBrawlerName(brawlers, m.my_brawler_id)}:
                    </div>
                    {enemyPicks.map(enemy => {
                      const enemyId = enemy.brawler_id;
                      const currentValue = m.perceptions?.[enemyId] ?? 0;
                      const avatar = getBrawlerAvatar(brawlers, enemyId);
                      
                      return (
                        <div key={enemyId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: '100px' }}>
                            {avatar ? (
                              <img src={avatar} alt="" style={{ width: '18px', height: '18px', borderRadius: '4px' }} />
                            ) : (
                              <div style={{ width: '18px', height: '18px', borderRadius: '4px', background: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px' }}>👤</div>
                            )}
                            <span style={{ fontWeight: '600', color: 'var(--color-text)' }}>{getBrawlerName(brawlers, enemyId)}</span>
                          </div>
                          
                          <div style={{ display: 'flex', gap: '3px' }}>
                            {[
                              { label: 'E', val: 1, title: 'Easy Matchup', bg: currentValue === 1 ? '#00e5ff' : 'transparent', color: currentValue === 1 ? '#000' : '#00e5ff' },
                              { label: 'N', val: 0, title: 'Neutral Matchup', bg: currentValue === 0 ? 'rgba(255,255,255,0.2)' : 'transparent', color: '#fff' },
                              { label: 'H', val: -1, title: 'Hard Matchup', bg: currentValue === -1 ? '#ff0055' : 'transparent', color: currentValue === -1 ? '#000' : '#ff0055' },
                              { label: 'C', val: -2, title: 'Counter Matchup', bg: currentValue === -2 ? '#ff00c8' : 'transparent', color: currentValue === -2 ? '#000' : '#ff00c8' }
                            ].map(btn => (
                              <button
                                key={btn.val}
                                type="button"
                                title={btn.title}
                                onClick={() => handleSavePerceptionInline(m.id, enemyId, btn.val)}
                                style={{
                                  background: btn.bg,
                                  border: '1px solid rgba(255,255,255,0.1)',
                                  color: btn.color,
                                  borderRadius: '3px',
                                  fontSize: '9px',
                                  fontWeight: '800',
                                  padding: '2px 5px',
                                  cursor: 'pointer',
                                  minWidth: '18px'
                                }}
                              >
                                {btn.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        {matches.length === 0 && <p className="empty-msg">No matches logged yet.</p>}
      </div>
    </div>
  );
}
