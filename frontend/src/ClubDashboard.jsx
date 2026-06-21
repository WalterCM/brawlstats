import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from './services/api';
import './ClubDashboard.css';

export default function ClubDashboard({ me, setMe }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Club State
  const [clubStatus, setClubStatus] = useState({ in_club: false, is_approved: false });
  const [clubsList, setClubsList] = useState([]);
  
  // Forms
  const [newClubName, setNewClubName] = useState('');
  const [newClubTag, setNewClubTag] = useState('');
  const [newClubDesc, setNewClubDesc] = useState('');
  
  // Linking Player Tag
  const [tempPlayerTag, setTempPlayerTag] = useState('');
  const [updatingTag, setUpdatingTag] = useState(false);

  // Phase 1 States
  const [unlinkedUsers, setUnlinkedUsers] = useState([]);
  const [unlinkedPlayers, setUnlinkedPlayers] = useState([]);
  const [selectedUserToLink, setSelectedUserToLink] = useState('');
  const [selectedPlayerToLink, setSelectedPlayerToLink] = useState('');
  const [syncingRoster, setSyncingRoster] = useState(false);
  const [linkingAccount, setLinkingAccount] = useState(false);

  // Tabs
  const [activeTab, setActiveTab] = useState('forum'); // 'members', 'forum', 'settings'

  // Forum State
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [threads, setThreads] = useState([]);
  const [selectedThread, setSelectedThread] = useState(null);
  const [replies, setReplies] = useState([]);
  
  // Forum Forms
  const [showNewThreadForm, setShowNewThreadForm] = useState(false);
  const [newThreadTitle, setNewThreadTitle] = useState('');
  const [newThreadContent, setNewThreadContent] = useState('');
  const [newReplyContent, setNewReplyContent] = useState('');

  // Initial Load
  useEffect(() => {
    loadClubData();
  }, [me]);

  const loadUnlinkedProfiles = async (clubId) => {
    try {
      const res = await api.fetchUnlinkedProfiles(clubId);
      setUnlinkedUsers(res.unlinked_users || []);
      setUnlinkedPlayers(res.unlinked_players || []);
    } catch (err) {
      console.error('Failed to load unlinked profiles:', err);
    }
  };

  const loadClubData = async () => {
    setLoading(true);
    setError('');
    try {
      if (!me) return;

      if (!me.player_tag) {
        setLoading(false);
        return; // Prompt to link tag
      }

      // Fetch user club status
      const statusRes = await api.fetchMyClub();
      setClubStatus(statusRes);

      if (!statusRes.in_club) {
        // User not in a club (and no pending requests), load all clubs
        if (!statusRes.pending_club) {
          const list = await api.fetchClubs();
          setClubsList(list);
        }
      } else {
        // User is in a club, load forum categories
        const catList = await api.fetchForumCategories();
        setCategories(catList);
        if (catList.length > 0) {
          setSelectedCategory(catList[0]);
          loadThreads(catList[0].id);
        }

        // Load unlinked profiles for mapping if President/VP
        const isPres = statusRes.role === 'president';
        const isVice = statusRes.role === 'vice_president';
        if (isPres || isVice || me.is_admin) {
          await loadUnlinkedProfiles(statusRes.club.id);
        }
      }
    } catch (err) {
      console.error(err);
      setError('Failed to load club data.');
    } finally {
      setLoading(false);
    }
  };

  const handleSyncRoster = async () => {
    if (!clubStatus.club) return;
    setSyncingRoster(true);
    setError('');
    setSuccess('');
    try {
      const res = await api.syncClubRoster(clubStatus.club.id);
      setSuccess(`Roster synchronized successfully! Sync details processed.`);
      await loadClubData();
    } catch (err) {
      setError(err.message || 'Failed to sync roster.');
    } finally {
      setSyncingRoster(false);
    }
  };

  const handleLinkAccount = async (e) => {
    e.preventDefault();
    if (!clubStatus.club || !selectedUserToLink || !selectedPlayerToLink) return;
    setLinkingAccount(true);
    setError('');
    setSuccess('');
    try {
      const res = await api.linkClubPlayer(
        clubStatus.club.id,
        selectedUserToLink,
        selectedPlayerToLink
      );
      setSuccess(res.message || 'Account linked successfully!');
      setSelectedUserToLink('');
      setSelectedPlayerToLink('');
      await loadClubData();
    } catch (err) {
      setError(err.message || 'Failed to link account.');
    } finally {
      setLinkingAccount(false);
    }
  };

  // Load threads for a category
  const loadThreads = async (categoryId) => {
    try {
      const threadList = await api.fetchForumThreads(categoryId);
      setThreads(threadList);
      setSelectedThread(null);
      setReplies([]);
    } catch (err) {
      console.error(err);
      setError('Failed to load threads.');
    }
  };

  // Load replies for a thread
  const loadReplies = async (threadId) => {
    try {
      const replyList = await api.fetchForumReplies(threadId);
      setReplies(replyList);
    } catch (err) {
      console.error(err);
      setError('Failed to load replies.');
    }
  };

  // Handle linking Player Tag
  const handleLinkTag = async (e) => {
    e.preventDefault();
    if (!tempPlayerTag.trim()) return;
    setUpdatingTag(true);
    setError('');
    try {
      // Clean and normalize player tag
      let cleanedTag = tempPlayerTag.trim().toUpperCase();
      if (!cleanedTag.startsWith('#')) cleanedTag = '#' + cleanedTag;
      
      const updated = await api.updateMe({ player_tag: cleanedTag });
      setMe(updated);
      setSuccess('Player Tag linked successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message || 'Failed to update player tag.');
    } finally {
      setUpdatingTag(false);
    }
  };

  // Handle creating club
  const handleCreateClub = async (e) => {
    e.preventDefault();
    if (!newClubTag.trim()) return;
    setLoading(true);
    setError('');
    try {
      let cleanedTag = newClubTag.trim().toUpperCase();
      if (!cleanedTag.startsWith('#')) cleanedTag = '#' + cleanedTag;

      await api.createClub({
        tag: cleanedTag
      });
      setSuccess('Club created and imported successfully!');
      setNewClubTag('');
      await loadClubData();
    } catch (err) {
      setError(err.message || 'Failed to create/import club.');
    } finally {
      setLoading(false);
    }
  };

  // Request Join
  const handleRequestJoin = async (clubId) => {
    setError('');
    try {
      await api.requestJoinClub(clubId);
      setSuccess('Request to join submitted!');
      await loadClubData();
    } catch (err) {
      setError(err.message || 'Failed to request join.');
    }
  };

  // Cancel Pending Request / Leave Club
  const handleLeaveOrCancel = async () => {
    const clubId = clubStatus.in_club ? clubStatus.club.id : clubStatus.pending_club.id;
    const confirmMsg = clubStatus.in_club 
      ? 'Are you sure you want to leave the club?' 
      : 'Are you sure you want to cancel your join request?';
    if (!window.confirm(confirmMsg)) return;

    setError('');
    try {
      await api.leaveClub(clubId);
      setSuccess('Successfully left/cancelled request.');
      await loadClubData();
    } catch (err) {
      setError(err.message || 'Action failed.');
    }
  };

  // Approve Member Request
  const handleApproveMember = async (playerId) => {
    setError('');
    try {
      await api.approveClubMember(clubStatus.club.id, playerId);
      setSuccess('Member approved!');
      await loadClubData();
    } catch (err) {
      setError(err.message || 'Failed to approve member.');
    }
  };

  // Reject Request / Kick Member
  const handleRemoveMember = async (playerId, name) => {
    const isPending = !clubStatus.club.members.find(m => m.player === playerId)?.is_approved;
    const confirmMsg = isPending 
      ? `Reject join request from ${name}?` 
      : `Are you sure you want to kick ${name} from the club?`;
    if (!window.confirm(confirmMsg)) return;

    setError('');
    try {
      await api.rejectOrRemoveClubMember(clubStatus.club.id, playerId);
      setSuccess(isPending ? 'Request rejected.' : 'Member removed.');
      await loadClubData();
    } catch (err) {
      setError(err.message || 'Failed to remove member.');
    }
  };

  // Promote / Demote Role
  const handleChangeRole = async (playerId, newRole) => {
    setError('');
    try {
      await api.changeClubMemberRole(clubStatus.club.id, playerId, newRole);
      setSuccess('Role updated successfully.');
      await loadClubData();
    } catch (err) {
      setError(err.message || 'Failed to change role.');
    }
  };

  // Post Thread
  const handleCreateThread = async (e) => {
    e.preventDefault();
    if (!newThreadTitle.trim() || !newThreadContent.trim()) return;
    setError('');
    try {
      const created = await api.createForumThread({
        category: selectedCategory.id,
        title: newThreadTitle,
        content: newThreadContent
      });
      setSuccess('Thread created!');
      setNewThreadTitle('');
      setNewThreadContent('');
      setShowNewThreadForm(false);
      await loadThreads(selectedCategory.id);
      
      // Select the newly created thread
      setSelectedThread(created);
      await loadReplies(created.id);
    } catch (err) {
      setError(err.message || 'Failed to create thread.');
    }
  };

  // Post Reply
  const handleCreateReply = async (e) => {
    e.preventDefault();
    if (!newReplyContent.trim()) return;
    setError('');
    try {
      await api.createForumReply({
        thread: selectedThread.id,
        content: newReplyContent
      });
      setNewReplyContent('');
      await loadReplies(selectedThread.id);
    } catch (err) {
      setError(err.message || 'Failed to post reply.');
    }
  };

  // Delete Thread
  const handleDeleteThread = async (threadId) => {
    if (!window.confirm('Are you sure you want to delete this thread?')) return;
    setError('');
    try {
      await api.deleteForumThread(threadId);
      setSuccess('Thread deleted.');
      setSelectedThread(null);
      await loadThreads(selectedCategory.id);
    } catch (err) {
      setError('Failed to delete thread.');
    }
  };

  // Delete Reply
  const handleDeleteReply = async (replyId) => {
    if (!window.confirm('Are you sure you want to delete this reply?')) return;
    setError('');
    try {
      await api.deleteForumReply(replyId);
      await loadReplies(selectedThread.id);
    } catch (err) {
      setError('Failed to delete reply.');
    }
  };

  // Check role helper
  const isPresident = clubStatus.role === 'president';
  const isVP = clubStatus.role === 'vice_president';
  const isAdmin = isPresident || isVP;

  if (loading) {
    return (
      <div className="club-loading-container">
        <div className="spinner"></div>
        <p>Loading Club Hub...</p>
      </div>
    );
  }

  // Guard: Link Tag Required
  if (!me?.player_tag) {
    return (
      <div className="club-page-wrapper">
        <div className="glass-panel club-guard-card">
          <h2>🛡️ Link Player Tag</h2>
          <p>To participate in club activities, coordinate forum posts, and manage rosters, you must link your official Brawl Stars Player Tag.</p>
          
          {error && <div className="club-alert club-alert-error">❌ {error}</div>}
          
          <form onSubmit={handleLinkTag} className="link-tag-form">
            <input
              type="text"
              placeholder="Player Tag (e.g. #2GGY8V9)"
              value={tempPlayerTag}
              onChange={(e) => setTempPlayerTag(e.target.value)}
              required
            />
            <button type="submit" className="btn btn-primary" disabled={updatingTag}>
              {updatingTag ? 'Linking...' : 'Link Tag'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Case 1: NOT in a club, but request is pending
  if (!clubStatus.in_club && clubStatus.pending_club) {
    return (
      <div className="club-page-wrapper">
        <div className="glass-panel club-guard-card text-center">
          <h2>🛡️ Pending Request</h2>
          <p>Your request to join the club is currently awaiting administrator review:</p>
          <div className="pending-badge">
            <strong>{clubStatus.pending_club.name}</strong> ({clubStatus.pending_club.tag})
          </div>
          <p className="small text-muted">A club President or Vice President will approve your membership soon.</p>
          
          {error && <div className="club-alert club-alert-error">❌ {error}</div>}
          
          <button onClick={handleLeaveOrCancel} className="btn btn-danger" style={{ marginTop: '20px' }}>
            Cancel Join Request
          </button>
        </div>
      </div>
    );
  }

  // Case 2: NOT in a club, show listing and creation forms (creation forms restricted to admin)
  if (!clubStatus.in_club) {
    const showCreateSection = me?.is_admin;
    return (
      <div className="club-page-wrapper">
        <div className="club-no-club-grid" style={{ gridTemplateColumns: showCreateSection ? '1fr 1fr' : '1fr' }}>
          {/* Join Club Section */}
          <div className="glass-panel club-form-panel">
            <h2>🔍 Join a Club</h2>
            <p className="subtitle">Select an active club to send a membership request.</p>

            {error && <div className="club-alert club-alert-error">❌ {error}</div>}
            {success && <div className="club-alert club-alert-success">✓ {success}</div>}

            {clubsList.length === 0 ? (
              <div className="empty-state">
                <p>
                  {showCreateSection 
                    ? "No active clubs found. Be the first to create one!"
                    : "No active clubs found. Please contact the site administrator to set up a club."
                  }
                </p>
              </div>
            ) : (
              <div className="club-list-container">
                {clubsList.map(club => (
                  <div key={club.id} className="club-list-item">
                    <div style={{ flex: 1 }}>
                      <div className="club-item-name">{club.name}</div>
                      <div className="club-item-tag">{club.tag}</div>
                      {club.description && <div className="club-item-desc">{club.description}</div>}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="club-item-members">👥 {club.members_count} member(s)</div>
                      <button 
                        onClick={() => handleRequestJoin(club.id)}
                        className="btn btn-primary btn-sm"
                        style={{ marginTop: '6px' }}
                      >
                        Request Join
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Create Club Section (Admin Only) */}
          {showCreateSection && (
            <div className="glass-panel club-form-panel">
              <h2>🛡️ Register a Club</h2>
              <p className="subtitle">Enter the official Brawl Stars Club Tag. The club's name, description, and members will be automatically fetched and imported from the official API.</p>
              
              <form onSubmit={handleCreateClub} className="create-club-form">
                <div className="form-group">
                  <label>Club Tag</label>
                  <input
                    type="text"
                    placeholder="e.g. #2G8V9PP"
                    value={newClubTag}
                    onChange={(e) => setNewClubTag(e.target.value)}
                    required
                  />
                </div>

                <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '15px' }}>
                  🚀 Fetch & Create Club
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Case 3: APPROVED MEMBER of a club
  const club = clubStatus.club;
  const approvedMembers = club.members.filter(m => m.is_approved && m.is_active);
  const pendingMembers = club.members.filter(m => !m.is_approved);
  const inactiveMembers = club.members.filter(m => m.is_approved && !m.is_active);

  return (
    <div className="club-page-wrapper">
      {/* Alert Banners */}
      {error && <div className="club-alert club-alert-error">❌ {error}</div>}
      {success && <div className="club-alert club-alert-success">✓ {success}</div>}

      {/* Club Header Panel */}
      <div className="glass-panel club-header-banner">
        <div style={{ flex: 1 }}>
          <span className="club-badge-icon">🛡️</span>
          <div style={{ display: 'inline-block', verticalAlign: 'middle', marginLeft: '15px' }}>
            <h1 className="club-title">{club.name}</h1>
            <p className="club-meta">Tag: <strong>{club.tag}</strong> | Members: <strong>{approvedMembers.length}</strong> | Your Role: <span className="role-tag">{clubStatus.role.toUpperCase().replace('_', ' ')}</span></p>
          </div>
        </div>
        {club.description && <div className="club-header-desc">"{club.description}"</div>}
      </div>

      {/* Tab Navigation */}
      <div className="club-tab-nav">
        <button 
          className={`tab-btn ${activeTab === 'forum' ? 'active' : ''}`}
          onClick={() => { setActiveTab('forum'); setError(''); }}
        >
          💬 Club Forum
        </button>
        <button 
          className={`tab-btn ${activeTab === 'members' ? 'active' : ''}`}
          onClick={() => { setActiveTab('members'); setError(''); }}
        >
          👥 Roster & Requests {pendingMembers.length > 0 && <span className="notif-dot">{pendingMembers.length}</span>}
        </button>
        <button 
          className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => { setActiveTab('settings'); setError(''); }}
        >
          ⚙️ Club Settings
        </button>
      </div>

      {/* Tab 1: Member Roster & Admin Panel */}
      {activeTab === 'members' && (
        <div className="club-members-grid">
          {/* Approved Members List */}
          <div className="glass-panel club-panel-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h2>👥 Club Roster</h2>
              {isPresident && (
                <button 
                  onClick={handleSyncRoster} 
                  disabled={syncingRoster}
                  className="btn btn-primary btn-sm"
                  style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
                >
                  🔄 {syncingRoster ? 'Sincronizando...' : 'Sincronizar Roster'}
                </button>
              )}
            </div>
            <div className="roster-list">
              {approvedMembers.map(member => (
                <div key={member.id} className="roster-item">
                  {member.avatar_id ? (
                    <img 
                      src={`https://cdn.brawlify.com/profile-icons/regular/${member.avatar_id}.png`} 
                      alt="" 
                      className="roster-avatar"
                    />
                  ) : (
                    <div className="roster-avatar-fallback">👤</div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="roster-name">{member.player_name}</div>
                    <div className="roster-tag">
                      {member.player_tag} • <span className="joined-date-meta" style={{ fontSize: '0.8rem', color: '#aaa' }}>Desde {new Date(member.joined_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className={`role-badge ${member.role}`}>{member.role}</span>
                    
                    {/* President Controls */}
                    {isPresident && member.player !== me.id && (
                      <div className="admin-actions">
                        <select 
                          value={member.role} 
                          onChange={(e) => handleChangeRole(member.player, e.target.value)}
                          className="role-select"
                        >
                          <option value="president">Transfer President</option>
                          <option value="vice_president">Vice President</option>
                          <option value="senior">Senior</option>
                          <option value="member">Member</option>
                        </select>
                        <button 
                          onClick={() => handleRemoveMember(member.player, member.player_name)}
                          className="btn btn-sm btn-danger-text"
                          title="Kick Member"
                        >
                          Kick
                        </button>
                      </div>
                    )}

                    {/* Vice President Controls (Can only kick seniors and members) */}
                    {isVP && member.player !== me.id && member.role !== 'president' && member.role !== 'vice_president' && (
                      <button 
                        onClick={() => handleRemoveMember(member.player, member.player_name)}
                        className="btn btn-sm btn-danger-text"
                        title="Kick Member"
                      >
                        Kick
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {inactiveMembers.length > 0 && (
                <>
                  <h3 style={{ marginTop: '25px', marginBottom: '10px', fontSize: '1rem', color: '#ff6b6b', borderBottom: '1px solid #333', paddingBottom: '5px' }}>🚪 Historial de Salidas / Ex-miembros</h3>
                  {inactiveMembers.map(member => (
                    <div key={member.id} className="roster-item" style={{ opacity: 0.55 }}>
                      {member.avatar_id ? (
                        <img 
                          src={`https://cdn.brawlify.com/profile-icons/regular/${member.avatar_id}.png`} 
                          alt="" 
                          className="roster-avatar"
                        />
                      ) : (
                        <div className="roster-avatar-fallback">👤</div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="roster-name">{member.player_name} <span style={{ fontSize: '0.75rem', background: '#333', padding: '1px 5px', borderRadius: '3px', marginLeft: '5px' }}>SALIDO</span></div>
                        <div className="roster-tag">
                          {member.player_tag} • <span className="joined-date-meta" style={{ fontSize: '0.8rem' }}>Estuvo: {new Date(member.joined_at).toLocaleDateString()} - {member.left_at ? new Date(member.left_at).toLocaleDateString() : 'N/A'}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* Pending Members List & Account Linking Panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="glass-panel club-panel-section">
              <h2>📥 Pending Approval Requests</h2>
              {pendingMembers.length === 0 ? (
                <div className="empty-state">
                  <p>No pending join requests.</p>
                </div>
              ) : (
                <div className="roster-list">
                  {pendingMembers.map(member => (
                    <div key={member.id} className="roster-item">
                      <div style={{ flex: 1 }}>
                        <div className="roster-name">{member.player_name}</div>
                        <div className="roster-tag">{member.player_tag}</div>
                      </div>
                      <div>
                        {isAdmin ? (
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button 
                              onClick={() => handleApproveMember(member.player)}
                              className="btn btn-sm btn-primary"
                            >
                              Approve
                            </button>
                            <button 
                              onClick={() => handleRemoveMember(member.player, member.player_name)}
                              className="btn btn-sm btn-danger"
                            >
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span className="pending-label">Pending</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Manual Account Linkage Panel */}
            {(isPresident || isVP || me.is_admin) && (
              <div className="glass-panel club-panel-section">
                <h2>🔗 Enlazar Cuenta Web a Roster</h2>
                <p style={{ fontSize: '0.8rem', color: '#aaa', marginBottom: '15px' }}>
                  Asocia una cuenta web registrada con el perfil real de un jugador en Brawl Stars.
                </p>

                {unlinkedUsers.length === 0 ? (
                  <div className="empty-state" style={{ padding: '10px' }}>
                    <p style={{ fontSize: '0.85rem' }}>No hay usuarios web registrados pendientes de vincular.</p>
                  </div>
                ) : unlinkedPlayers.length === 0 ? (
                  <div className="empty-state" style={{ padding: '10px' }}>
                    <p style={{ fontSize: '0.85rem' }}>Todos los jugadores importados ya tienen cuentas vinculadas.</p>
                  </div>
                ) : (
                  <form onSubmit={handleLinkAccount} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                      <label style={{ fontSize: '0.8rem', color: '#ccc', display: 'block', marginBottom: '4px' }}>Usuario Web Registrado</label>
                      <select 
                        value={selectedUserToLink}
                        onChange={(e) => setSelectedUserToLink(e.target.value)}
                        required
                        style={{ width: '100%', padding: '8px', borderRadius: '4px', background: '#1c1c1e', border: '1px solid #333', color: '#fff' }}
                      >
                        <option value="">-- Seleccionar Usuario --</option>
                        {unlinkedUsers.map(u => (
                          <option key={u.id} value={u.id}>{u.username} (ID: {u.id})</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label style={{ fontSize: '0.8rem', color: '#ccc', display: 'block', marginBottom: '4px' }}>Jugador Importado (Brawl Stars)</label>
                      <select 
                        value={selectedPlayerToLink}
                        onChange={(e) => setSelectedPlayerToLink(e.target.value)}
                        required
                        style={{ width: '100%', padding: '8px', borderRadius: '4px', background: '#1c1c1e', border: '1px solid #333', color: '#fff' }}
                      >
                        <option value="">-- Seleccionar Jugador --</option>
                        {unlinkedPlayers.map(p => (
                          <option key={p.id} value={p.id}>{p.name} ({p.tag})</option>
                        ))}
                      </select>
                    </div>

                    <button 
                      type="submit" 
                      disabled={linkingAccount}
                      className="btn btn-primary"
                      style={{ width: '100%', marginTop: '5px' }}
                    >
                      {linkingAccount ? 'Vinculando...' : 'Enlazar Cuentas'}
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Club Forum Board */}
      {activeTab === 'forum' && (
        <div className="club-forum-grid">
          {/* Sidebar: Categories */}
          <div className="glass-panel forum-sidebar">
            <h3 className="section-title">Categories</h3>
            <div className="forum-categories-list">
              {categories.map(cat => (
                <button
                  key={cat.id}
                  className={`category-item-btn ${selectedCategory?.id === cat.id ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedCategory(cat);
                    loadThreads(cat.id);
                  }}
                >
                  <span className="cat-icon">📁</span>
                  <div className="cat-details">
                    <div className="cat-name">{cat.name}</div>
                    <div className="cat-desc">{cat.description}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Main Area: Threads or Single Thread View */}
          <div className="glass-panel forum-main-area">
            {!selectedThread ? (
              // ── Threads List View ──
              <>
                <div className="forum-section-header">
                  <div>
                    <h2>📁 {selectedCategory?.name}</h2>
                    <p className="subtitle">{selectedCategory?.description}</p>
                  </div>
                  <button 
                    onClick={() => setShowNewThreadForm(!showNewThreadForm)}
                    className="btn btn-primary"
                  >
                    {showNewThreadForm ? 'Cancel' : '📝 Create Thread'}
                  </button>
                </div>

                {showNewThreadForm ? (
                  // New Thread Form
                  <form onSubmit={handleCreateThread} className="new-thread-form">
                    <div className="form-group">
                      <label>Thread Title</label>
                      <input 
                        type="text" 
                        placeholder="What's on your mind?"
                        value={newThreadTitle}
                        onChange={(e) => setNewThreadTitle(e.target.value)}
                        required
                        maxLength="150"
                      />
                    </div>
                    <div className="form-group">
                      <label>Content Description</label>
                      <textarea
                        rows="5"
                        placeholder="Write your details here..."
                        value={newThreadContent}
                        onChange={(e) => setNewThreadContent(e.target.value)}
                        required
                      />
                    </div>
                    <button type="submit" className="btn btn-primary">Post Thread</button>
                  </form>
                ) : (
                  // Threads List
                  <div className="threads-list">
                    {threads.length === 0 ? (
                      <div className="empty-state">
                        <p>No threads posted in this category yet. Be the first!</p>
                      </div>
                    ) : (
                      threads.map(thread => (
                        <div 
                          key={thread.id} 
                          className="thread-list-item"
                          onClick={() => {
                            setSelectedThread(thread);
                            loadReplies(thread.id);
                          }}
                        >
                          <div style={{ flex: 1 }}>
                            <h4 className="thread-title">{thread.title}</h4>
                            <div className="thread-meta">
                              By <strong>{thread.author_name}</strong> | {new Date(thread.created_at).toLocaleDateString()}
                            </div>
                          </div>
                          <div className="thread-replies-badge">
                            💬 {thread.replies_count}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </>
            ) : (
              // ── Single Thread View ──
              <div className="single-thread-view">
                <button 
                  className="btn btn-sm btn-secondary" 
                  onClick={() => setSelectedThread(null)}
                  style={{ marginBottom: '15px' }}
                >
                  ← Back to threads
                </button>

                <div className="thread-main-post">
                  <div className="post-header">
                    {selectedThread.author_avatar_id ? (
                      <img 
                        src={`https://cdn.brawlify.com/profile-icons/regular/${selectedThread.author_avatar_id}.png`} 
                        alt="" 
                        className="post-avatar"
                      />
                    ) : (
                      <div className="post-avatar-fallback">👤</div>
                    )}
                    <div style={{ flex: 1 }}>
                      <h2 style={{ margin: 0, fontSize: '1.4rem' }}>{selectedThread.title}</h2>
                      <div className="post-meta">
                        By <strong>{selectedThread.author_name}</strong> ({selectedThread.author_tag}) | {new Date(selectedThread.created_at).toLocaleString()}
                      </div>
                    </div>
                    {(selectedThread.author === me.id || isAdmin) && (
                      <button 
                        onClick={() => handleDeleteThread(selectedThread.id)}
                        className="btn btn-sm btn-danger"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                  <div className="post-body">
                    {selectedThread.content}
                  </div>
                </div>

                {/* Replies Section */}
                <div className="replies-section">
                  <h3>Replies ({replies.length})</h3>
                  <div className="replies-list">
                    {replies.map(reply => (
                      <div key={reply.id} className="reply-item">
                        <div className="reply-header">
                          {reply.author_avatar_id ? (
                            <img 
                              src={`https://cdn.brawlify.com/profile-icons/regular/${reply.author_avatar_id}.png`} 
                              alt="" 
                              className="reply-avatar"
                            />
                          ) : (
                            <div className="reply-avatar-fallback">👤</div>
                          )}
                          <div style={{ flex: 1 }}>
                            <strong>{reply.author_name}</strong> <span className="reply-tag">{reply.author_tag}</span>
                            <span className="reply-time">{new Date(reply.created_at).toLocaleString()}</span>
                          </div>
                          {(reply.author === me.id || isAdmin) && (
                            <button 
                              onClick={() => handleDeleteReply(reply.id)}
                              className="btn btn-sm btn-danger-text"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                        <div className="reply-body">
                          {reply.content}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Add Reply Form */}
                  <form onSubmit={handleCreateReply} className="reply-form">
                    <textarea
                      rows="3"
                      placeholder="Post a reply..."
                      value={newReplyContent}
                      onChange={(e) => setNewReplyContent(e.target.value)}
                      required
                    />
                    <button type="submit" className="btn btn-primary" style={{ marginTop: '10px' }}>
                      Reply
                    </button>
                  </form>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Club Settings */}
      {activeTab === 'settings' && (
        <div className="glass-panel club-panel-section" style={{ maxWidth: '600px', margin: '0 auto' }}>
          <h2>⚙️ Club Management & Settings</h2>
          <p className="subtitle">Configure your club options or leave the club below.</p>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '20px' }}>
            <div className="settings-item">
              <label>Club Name</label>
              <div className="settings-val">{club.name}</div>
            </div>
            
            <div className="settings-item">
              <label>Club Tag</label>
              <div className="settings-val">{club.tag}</div>
            </div>

            <div className="settings-item">
              <label>Your Membership Status</label>
              <div className="settings-val">
                Joined {new Date(club.members.find(m => m.player === me.id)?.joined_at).toLocaleDateString()}
              </div>
            </div>
            
            <div style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '20px', marginTop: '10px' }}>
              <h3>Exit Club</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '15px' }}>
                {isPresident 
                  ? 'As the president, you cannot leave the club unless you dissolve it (if you are the last member) or transfer the president role to another approved member first.' 
                  : 'Leaving the club will remove you from the roster and revoke your access to the forums.'
                }
              </p>
              
              <button 
                onClick={handleLeaveOrCancel} 
                className="btn btn-danger"
              >
                {isPresident && approvedMembers.length === 1 ? 'Dissolve Club' : 'Leave Club'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
