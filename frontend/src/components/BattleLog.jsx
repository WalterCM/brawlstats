import { useState } from 'react';
import { api } from '../services/api';
import { getMapName, getBrawlerName, getBrawlerAvatar, getModeIcon, getRankById, getRankIconUrl, getMapImage } from '../utils/helpers';
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
  const [currentPage, setCurrentPage] = useState(1);
  const matchesPerPage = 3;

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

  const filteredMatches = matches.filter(m => {
    if (!searchQuery) return true;
    const bName = getBrawlerName(brawlers, m.my_brawler_id).toLowerCase();
    return bName.includes(searchQuery.toLowerCase());
  });

  const totalPages = Math.max(1, Math.ceil(filteredMatches.length / matchesPerPage));
  const activePage = Math.min(currentPage, totalPages);
  const paginatedMatches = filteredMatches.slice((activePage - 1) * matchesPerPage, activePage * matchesPerPage);

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
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setCurrentPage(1);
          }}
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

      <div className="match-list" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: 'none', overflowY: 'visible', paddingRight: '5px' }}>
        {paginatedMatches.map((m) => {
          const isRatingOpen = ratingMatchId === m.id;
          const enemyPicks = m.draft_events?.filter(e => e.team === 'enemy' && e.type === 'pick') || [];
          const mapImage = getMapImage(allMaps, m.map_id);
          const isWin = m.result === 'victory';
          const hasPerceptions = m.perceptions && Object.values(m.perceptions).some(v => v !== 0);
          
          const cardBackground = `linear-gradient(135deg, ${isWin ? 'rgba(0, 45, 60, 0.85)' : 'rgba(50, 5, 20, 0.85)'} 0%, rgba(15, 15, 15, 0.92) 100%)`;
          const extraPaddingRight = mapImage ? '230px' : '30px';

          const myBrawlerAvatar = getBrawlerAvatar(brawlers, m.my_brawler_id);
          const myBrawlerName = getBrawlerName(brawlers, m.my_brawler_id);

          return (
            <div key={m.id} style={{ display: 'flex', flexDirection: 'column', marginBottom: '12px' }}>
              <div 
                className={`match-item ${isWin ? 'win' : 'loss'}`} 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  gap: '24px', 
                  padding: `36px ${extraPaddingRight} 36px 30px`, 
                  minHeight: '220px',
                  borderRadius: '16px', 
                  backgroundImage: mapImage 
                    ? `linear-gradient(135deg, ${isWin ? 'rgba(0, 45, 60, 0.75)' : 'rgba(50, 5, 20, 0.75)'} 0%, rgba(10, 10, 10, 0.90) 100%), url(${mapImage})`
                    : cardBackground,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  border: '1px solid var(--border-glass)',
                  boxShadow: isWin ? '0 6px 24px rgba(0, 229, 255, 0.12)' : '0 6px 24px rgba(255, 0, 127, 0.12)',
                  transition: 'all 0.3s ease',
                  position: 'relative',
                  overflow: 'hidden'
                }}
              >
                {/* Option B: Split Card Layout Map Segment */}
                {mapImage && (
                  <div style={{
                    position: 'absolute',
                    right: 0,
                    top: 0,
                    bottom: 0,
                    width: '180px',
                    backgroundImage: `url(${mapImage})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    borderLeft: isWin ? '3px solid #00e5ff' : '3px solid #ff007f',
                    boxShadow: isWin ? '-4px 0 12px rgba(0, 229, 255, 0.2)' : '-4px 0 12px rgba(255, 0, 127, 0.2)',
                    zIndex: 1
                  }}>
                    <div style={{
                      position: 'absolute',
                      top: 0, left: 0, right: 0, bottom: 0,
                      background: 'linear-gradient(to right, rgba(15,15,15,0.5) 0%, rgba(15,15,15,0.1) 100%)'
                    }} />
                  </div>
                )}

                {/* Left Column: Player's Brawler Avatar & Name */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', minWidth: '200px', position: 'relative', zIndex: 2 }}>
                  <div style={{ 
                    position: 'relative', 
                    width: '68px', 
                    height: '68px', 
                    borderRadius: '16px', 
                    border: isWin ? '3px solid #00e5ff' : '3px solid #ff007f',
                    boxShadow: isWin ? '0 0 12px rgba(0, 229, 255, 0.6)' : '0 0 12px rgba(255, 0, 79, 0.6)',
                    overflow: 'hidden',
                    flexShrink: 0
                  }}>
                    {myBrawlerAvatar ? (
                      <img src={myBrawlerAvatar} alt={myBrawlerName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', background: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>👤</div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <span style={{ fontWeight: '900', fontSize: '16px', color: '#fff', letterSpacing: '0.4px' }}>
                      {myBrawlerName}
                    </span>
                    {m.my_brawler_trophies != null && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 'bold' }}>
                        {m.draft_type === 'ranked' ? (
                          <>
                            {getRankIconUrl(m.my_brawler_trophies) && (
                              <img src={getRankIconUrl(m.my_brawler_trophies)} alt="" style={{ width: 14, height: 14 }} />
                            )}
                            <span style={{ color: 'var(--color-text-muted)' }}>
                              {getRankById(m.my_brawler_trophies)?.name || m.my_brawler_trophies}
                            </span>
                          </>
                        ) : (
                          <span style={{ color: '#ffd166' }}>{m.my_brawler_trophies} 🏆</span>
                        )}
                      </span>
                    )}
                  </div>
                </div>

                {/* Center Column: Map & Game Mode Info */}
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '8px', position: 'relative', zIndex: 2 }}>
                  <span className="map-name" style={{ fontWeight: '900', fontSize: '20px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#fff', letterSpacing: '0.5px' }}>
                    {getMapName(allMaps, m.map_id)}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'rgba(255, 255, 255, 0.8)', fontWeight: '600' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', textTransform: 'capitalize' }}>
                      <span style={{ fontSize: '15px' }}>{getModeIcon(m.mode)}</span> {m.mode}
                    </span>
                    <span>•</span>
                    <span style={{ 
                      textTransform: 'uppercase', 
                      fontSize: '10px',
                      letterSpacing: '0.6px',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      background: m.draft_type === 'ranked' ? 'rgba(0, 229, 255, 0.15)' : 'rgba(255, 255, 255, 0.08)',
                      color: m.draft_type === 'ranked' ? '#00e5ff' : 'rgba(255, 255, 255, 0.7)'
                    }}>
                      {m.draft_type}
                    </span>
                  </div>
                </div>

                {/* Right Column: 3v3 Compositions & Action Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px', position: 'relative', zIndex: 2 }}>
                  <div style={{ background: 'rgba(0, 0, 0, 0.25)', padding: '12px 18px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <MatchTeamsBanner match={m} brawlers={brawlers} vertical={true} />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px', minWidth: '100px' }}>
                    <span className="result-badge" style={{ 
                      fontSize: '11px', 
                      fontWeight: '900', 
                      padding: '4px 12px', 
                      borderRadius: '6px', 
                      letterSpacing: '1px',
                      background: isWin ? 'rgba(0, 229, 255, 0.2)' : 'rgba(255, 0, 127, 0.2)', 
                      color: isWin ? '#00e5ff' : '#ff007f',
                      boxShadow: isWin ? '0 0 10px rgba(0, 229, 255, 0.3)' : '0 0 10px rgba(255, 0, 127, 0.3)',
                      border: isWin ? '1px solid rgba(0, 229, 255, 0.4)' : '1px solid rgba(255, 0, 127, 0.4)'
                    }}>
                      {isWin ? 'VICTORY' : 'DEFEAT'}
                    </span>
                    
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {isOwnProfile && enemyPicks.length > 0 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setRatingMatchId(isRatingOpen ? null : m.id);
                          }}
                          style={{
                            background: isRatingOpen ? 'rgba(0, 229, 255, 0.25)' : (hasPerceptions ? 'rgba(255, 183, 3, 0.15)' : 'rgba(255, 255, 255, 0.05)'),
                            border: isRatingOpen ? '1px solid #00e5ff' : (hasPerceptions ? '1px solid #ffb703' : '1px solid rgba(255,255,255,0.1)'),
                            color: isRatingOpen ? '#00e5ff' : (hasPerceptions ? '#ffb703' : '#fff'),
                            borderRadius: '6px',
                            cursor: 'pointer',
                            padding: '6px 10px',
                            fontSize: '11px',
                            fontWeight: '700',
                            transition: 'all 0.2s',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            boxShadow: isRatingOpen ? '0 0 8px rgba(0, 229, 255, 0.2)' : (hasPerceptions ? '0 0 6px rgba(255, 183, 3, 0.2)' : 'none')
                          }}
                          title="Rate matchups"
                        >
                          <span>⚡</span> {isRatingOpen ? 'Close' : (hasPerceptions ? 'Rated' : 'Rate')}
                        </button>
                      )}

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
                            padding: '6px 10px',
                            fontSize: '11px',
                            fontWeight: '700',
                            cursor: 'pointer',
                            borderRadius: '6px',
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
                </div>
              </div>
              
              {isOwnProfile && isRatingOpen && (
                <div style={{
                  background: 'rgba(10, 10, 10, 0.6)',
                  backdropFilter: 'blur(10px)',
                  border: '1px solid var(--border-glass)',
                  borderTop: 'none',
                  borderBottomLeftRadius: '10px',
                  borderBottomRightRadius: '10px',
                  padding: '16px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  marginTop: '-4px',
                  zIndex: 1,
                  boxShadow: 'inset 0 4px 10px rgba(0, 0, 0, 0.3)'
                }}>
                  <div style={{ fontWeight: '800', fontSize: '11px', color: 'rgba(255, 255, 255, 0.6)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Rate matchup comfort as <span style={{ color: '#ffd166' }}>{myBrawlerName}</span> against:
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {enemyPicks.map(enemy => {
                      const enemyId = enemy.brawler_id;
                      const currentValue = m.perceptions?.[enemyId] ?? 0;
                      const avatar = getBrawlerAvatar(brawlers, enemyId);
                      const enemyName = getBrawlerName(brawlers, enemyId);
                      
                      const labels = {
                        '1': '⚡ Easy',
                        '0': '⚖️ Neutral',
                        '-1': '⚠️ Hard',
                        '-2': '🚫 Counter'
                      };
                      const label = labels[String(currentValue)] || '⚖️ Neutral';

                      return (
                        <div 
                          key={enemyId} 
                          style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'space-between', 
                            gap: '24px', 
                            padding: '10px 16px', 
                            background: 'rgba(255, 255, 255, 0.02)',
                            border: '1px solid rgba(255, 255, 255, 0.04)',
                            borderRadius: '8px'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: '140px' }}>
                            <div style={{ width: '28px', height: '28px', borderRadius: '6px', overflow: 'hidden', border: '1px solid rgba(255, 255, 255, 0.1)', flexShrink: 0 }}>
                              {avatar ? (
                                <img src={avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              ) : (
                                <div style={{ width: '100%', height: '100%', background: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px' }}>👤</div>
                              )}
                            </div>
                            <span style={{ fontWeight: '700', fontSize: '12px', color: '#fff' }}>{enemyName}</span>
                          </div>
                          
                          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1, justifyContent: 'flex-end', maxWidth: '320px' }}>
                            <span style={{ 
                              fontSize: '11px', 
                              fontWeight: '800', 
                              minWidth: '85px', 
                              textAlign: 'right',
                              color: currentValue === 1 ? '#00e5ff' : currentValue === 0 ? '#fff' : currentValue === -1 ? '#ff0055' : '#ff00c8'
                            }}>
                              {label}
                            </span>
                            
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                              <input 
                                type="range" 
                                min="-2" 
                                max="1" 
                                step="1" 
                                value={currentValue}
                                onChange={(e) => handleSavePerceptionInline(m.id, enemyId, parseInt(e.target.value))}
                                style={{
                                  width: '100%',
                                  cursor: 'pointer',
                                  height: '6px',
                                  borderRadius: '3px',
                                  background: 'rgba(255, 255, 255, 0.1)',
                                  outline: 'none',
                                  accentColor: currentValue === 1 ? '#00e5ff' : currentValue === 0 ? '#ffffff' : currentValue === -1 ? '#ff0055' : '#ff00c8'
                                }}
                              />
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', color: 'rgba(255,255,255,0.4)', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.2px' }}>
                                <span>Counter</span>
                                <span>Easy</span>
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
          );
        })}
        {filteredMatches.length === 0 && <p className="empty-msg">No matches logged yet.</p>}

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            gap: '20px', 
            marginTop: '20px', 
            padding: '10px',
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            borderRadius: '10px'
          }}>
            <button 
              type="button"
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={activePage === 1}
              style={{
                background: activePage === 1 ? 'transparent' : 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: activePage === 1 ? 'rgba(255, 255, 255, 0.2)' : '#fff',
                padding: '6px 12px',
                borderRadius: '6px',
                cursor: activePage === 1 ? 'not-allowed' : 'pointer',
                fontSize: '12px',
                fontWeight: '700',
                transition: 'all 0.2s ease'
              }}
            >
              ◄ Prev
            </button>
            
            <span style={{ fontSize: '12px', fontWeight: '800', color: 'rgba(255, 255, 255, 0.6)' }}>
              Page <span style={{ color: '#00e5ff' }}>{activePage}</span> of {totalPages}
            </span>

            <button 
              type="button"
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={activePage === totalPages}
              style={{
                background: activePage === totalPages ? 'transparent' : 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: activePage === totalPages ? 'rgba(255, 255, 255, 0.2)' : '#fff',
                padding: '6px 12px',
                borderRadius: '6px',
                cursor: activePage === totalPages ? 'not-allowed' : 'pointer',
                fontSize: '12px',
                fontWeight: '700',
                transition: 'all 0.2s ease'
              }}
            >
              Next ►
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
