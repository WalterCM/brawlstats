import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from './services/api';
import { useFilters } from './context/FilterContext';
import './ClubDashboard.css';


export default function ClubDashboard({
  me,
  setMe,
  brawlers = [],
  allMaps = [],
  brawlerMeta = [],
  matches = [],
  setMatches,
  perceptions = [],
  handleSyncHistory,
  syncingHistory,
  minNormalTrophies = 750,
  enterDraftMode,
  view = 'roster'
}) {
  const navigate = useNavigate();
  const {
    selectedMode,
    selectedDraftType,
    selectedClass,
    timeRange
  } = useFilters();
  const { tag } = useParams();
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
  const [linkingPlayerId, setLinkingPlayerId] = useState(null);
  const [syncingRoster, setSyncingRoster] = useState(false);
  const [syncingClubMatches, setSyncingClubMatches] = useState(false);
  const [linkingAccount, setLinkingAccount] = useState(false);



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

  // Club Stats State
  const [clubStats, setClubStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [sortBy, setSortBy] = useState('win_rate');

  // Internal tab for club pages (stats/roster)
  const [activeClubTab, setActiveClubTab] = useState('stats');

  // Forum create category form
  const [showNewCategoryForm, setShowNewCategoryForm] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryDescription, setNewCategoryDescription] = useState('');
  const [newCategoryRestricted, setNewCategoryRestricted] = useState(false);

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
        // User is in a club, load forum categories and stats
        const catList = await api.fetchForumCategories();
        setCategories(catList);
        if (catList.length > 0) {
          setSelectedCategory(catList[0]);
          loadThreads(catList[0].id);
        }
        loadClubStats(statusRes.club.id);

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

  const loadClubStats = async (clubId, sort = null) => {
    setLoadingStats(true);
    try {
      const s = sort || sortBy;
      const filters = {
        mode: selectedMode,
        draft_type: selectedDraftType,
        brawler_class: selectedClass,
        time_range: timeRange
      };
      const stats = await api.fetchClubStats(clubId, s, filters);
      setClubStats(stats);
    } catch (err) {
      console.error('Failed to load club stats:', err);
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => {
    if (clubStatus.club && clubStatus.club.id) {
      loadClubStats(clubStatus.club.id);
    }
  }, [selectedMode, selectedDraftType, selectedClass, timeRange]);

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

  const handleSyncClubMatches = async () => {
    if (!clubStatus.club) return;
    setSyncingClubMatches(true);
    setError('');
    setSuccess('');
    try {
      const res = await api.syncClubMatches(clubStatus.club.id);
      setSuccess(`Synced ${res.total_matches_synced} new matches across ${res.synced_players} members.`);
      await loadClubStats(clubStatus.club.id);
    } catch (err) {
      setError(err.message || 'Failed to sync club matches.');
    } finally {
      setSyncingClubMatches(false);
    }
  };

  const handleLinkPlayerInline = async (playerId) => {
    if (!clubStatus.club || !selectedUserToLink) return;
    setLinkingAccount(true);
    setError('');
    setSuccess('');
    try {
      const res = await api.linkClubPlayer(
        clubStatus.club.id,
        selectedUserToLink,
        playerId
      );
      setSuccess(res.message || 'Account linked successfully!');
      setSelectedUserToLink('');
      setLinkingPlayerId(null);
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

  // Create Category
  const handleCreateCategory = async (e) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    setError('');
    try {
      await api.createForumCategory({
        name: newCategoryName,
        description: newCategoryDescription,
        restricted_to_seniors: newCategoryRestricted
      });
      setSuccess('Category created!');
      setNewCategoryName('');
      setNewCategoryDescription('');
      setNewCategoryRestricted(false);
      setShowNewCategoryForm(false);
      const catList = await api.fetchForumCategories();
      setCategories(catList);
    } catch (err) {
      setError(err.message || 'Failed to create category.');
    }
  };

  // Toggle thread like
  const handleToggleThreadLike = async (threadId) => {
    try {
      const res = await api.likeForumThread(threadId);
      setThreads(prev => prev.map(t =>
        t.id === threadId ? { ...t, likes_count: res.likes_count, has_liked: res.liked } : t
      ));
      if (selectedThread?.id === threadId) {
        setSelectedThread(prev => ({ ...prev, likes_count: res.likes_count, has_liked: res.liked }));
      }
    } catch (err) {
      console.error('Failed to toggle thread like:', err);
    }
  };

  // Toggle reply like
  const handleToggleReplyLike = async (replyId) => {
    try {
      const res = await api.likeForumReply(replyId);
      setReplies(prev => prev.map(r =>
        r.id === replyId ? { ...r, likes_count: res.likes_count, has_liked: res.liked } : r
      ));
    } catch (err) {
      console.error('Failed to toggle reply like:', err);
    }
  };

  // Get role of a player in this club
  const getMemberRole = (playerId) => {
    if (!club?.members) return null;
    const member = club.members.find(m => m.player === playerId);
    return member?.role || null;
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

  // Settings view specific guards
  if (view === 'settings') {
    if (!me?.player_tag) {
      return (
        <div className="glass-panel club-panel-section" style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'left' }}>
          <h2>🛡️ Club Settings</h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '13px', margin: '10px 0 0 0' }}>
            Please link your Brawl Stars Player Tag on the left to participate in club activities and manage settings.
          </p>
        </div>
      );
    }
    if (!clubStatus.in_club) {
      return (
        <div className="glass-panel club-panel-section" style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'left' }}>
          <h2>🛡️ Club Settings</h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '13px', margin: '10px 0 0 0' }}>
            {clubStatus.pending_club 
              ? `Your request to join "${clubStatus.pending_club.name}" (${clubStatus.pending_club.tag}) is currently pending review by club administration.`
              : "You are not currently a member of any club. You can join or create a club from the \"My Club\" tab."
            }
          </p>
        </div>
      );
    }
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
      <div className="glass-panel club-header-banner" style={{ marginBottom: '20px' }}>
        <div style={{ flex: 1 }}>
          <span className="club-badge-icon">🛡️</span>
          <div style={{ display: 'inline-block', verticalAlign: 'middle', marginLeft: '15px' }}>
            <h1 className="club-title">{club.name}</h1>
            <p className="club-meta">Tag: <strong>{club.tag}</strong> | Members: <strong>{approvedMembers.length}</strong> | Your Role: <span className="role-tag">{clubStatus.role.toUpperCase().replace('_', ' ')}</span></p>
          </div>
        </div>
        {club.description && <div className="club-header-desc">"{club.description}"</div>}
      </div>

      {(view === 'stats' || view === 'roster') && (
        <div>
          {/* Tab Navigation */}
          <div className="club-tab-nav">
            <button
              className={`tab-btn ${activeClubTab === 'stats' ? 'active' : ''}`}
              onClick={() => setActiveClubTab('stats')}
            >
              📊 Stats
            </button>
            <button
              className={`tab-btn ${activeClubTab === 'roster' ? 'active' : ''}`}
              onClick={() => setActiveClubTab('roster')}
            >
              👥 Roster
            </button>
          </div>

          {/* Stats Tab */}
          {activeClubTab === 'stats' && (
            <div className="club-stats-grid">
              <div className="glass-panel club-panel-section">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                  <h2 style={{ margin: 0 }}>📊 Club Stats</h2>
                  {isPresident && (
                    <button
                      onClick={handleSyncClubMatches}
                      disabled={syncingClubMatches}
                      className="btn btn-primary btn-sm"
                      style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
                    >
                      🔄 {syncingClubMatches ? 'Syncing...' : 'Sync All Matches'}
                    </button>
                  )}
                </div>
                {loadingStats ? (
                  <div className="club-loading-container" style={{ minHeight: '200px' }}>
                    <div className="spinner"></div>
                    <p>Loading club statistics...</p>
                  </div>
                ) : clubStats ? (
                  <div>
                    {/* KPI Cards */}
                    <div className="kpi-row">
                      <div className="kpi-card">
                        <div className="kpi-value">{clubStats.total_matches}</div>
                        <div className="kpi-label">Total Matches</div>
                      </div>
                      <div className="kpi-card">
                        <div className="kpi-value" style={{ color: clubStats.overall_win_rate >= 50 ? 'var(--color-ally)' : 'var(--color-enemy)' }}>
                          {clubStats.overall_win_rate.toFixed(1)}%
                        </div>
                        <div className="kpi-label">Win Rate</div>
                      </div>
                    </div>

                    {/* Leaderboard */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '25px', marginBottom: '15px' }}>
                      <h3 style={{ margin: 0, fontSize: '1.1rem' }}>🏆 Member Leaderboard</h3>
                      <select
                        value={sortBy}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSortBy(val);
                          loadClubStats(clubStatus.club.id, val);
                        }}
                        className="role-select"
                        style={{ width: 'auto', padding: '4px 8px', fontSize: '0.8rem' }}
                      >
                        <option value="win_rate">Win Rate</option>
                        <option value="played">Games Played</option>
                        <option value="ranked_win_rate">Ranked WR</option>
                        <option value="recent_win_rate">Recent WR (7d)</option>
                        <option value="star_player">Star Player</option>
                        <option value="avg_trophies">Avg Trophies</option>
                        <option value="name">Name</option>
                      </select>
                    </div>
                    <div className="leaderboard-table-wrapper" style={{ overflowX: 'auto' }}>
                      <table className="leaderboard-table" style={{ minWidth: '650px' }}>
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>Player</th>
                            <th>Role</th>
                            <th>W</th>
                            <th>L</th>
                            <th>WR</th>
                            <th>Ranked WR</th>
                            <th>Recent WR</th>
                            <th>☆</th>
                            <th>Avg 🏆</th>
                            <th>Top Brawler</th>
                          </tr>
                        </thead>
                        <tbody>
                          {clubStats.leaderboard
                            .filter(m => m.played > 0)
                            .map((member, idx) => (
                            <tr key={member.player_id} className={me && member.player_id === me.id ? 'highlight-row' : ''}>
                              <td>{idx + 1}</td>
                              <td>
                                <div className="leaderboard-player" style={{ whiteSpace: 'nowrap' }}>
                                  {member.avatar_id ? (
                                    <img src={`https://cdn.brawlify.com/profile-icons/regular/${member.avatar_id}.png`} alt="" className="leaderboard-avatar" />
                                  ) : (
                                    <div className="leaderboard-avatar-fallback">👤</div>
                                  )}
                                  <span>{member.name}</span>
                                </div>
                              </td>
                              <td><span className={`role-badge ${member.role}`}>{member.role.replace('_', ' ')}</span></td>
                              <td>{member.wins}</td>
                              <td>{member.defeats}</td>
                              <td className={member.win_rate >= 55 ? 'wr-high' : member.win_rate >= 50 ? 'wr-mid' : 'wr-low'}>
                                {member.win_rate.toFixed(1)}%
                              </td>
                              <td className={member.ranked_win_rate >= 55 ? 'wr-high' : member.ranked_win_rate >= 50 ? 'wr-mid' : 'wr-low'}>
                                {member.ranked_played > 0 ? `${member.ranked_win_rate.toFixed(1)}%` : '-'}
                              </td>
                              <td className={member.recent_win_rate >= 55 ? 'wr-high' : member.recent_win_rate >= 50 ? 'wr-mid' : 'wr-low'}>
                                {member.recent_played > 0 ? `${member.recent_win_rate.toFixed(1)}%` : '-'}
                              </td>
                              <td>{member.star_player}</td>
                              <td>{member.avg_trophies > 0 ? member.avg_trophies : '-'}</td>
                              <td style={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}>{member.top_brawler || '-'}</td>
                            </tr>
                          ))}
                          {clubStats.leaderboard.filter(m => m.played > 0).length === 0 && (
                            <tr>
                              <td colSpan={11} className="empty-table-msg">No matches logged yet. Sync your battle logs!</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Top Modes */}
                    {clubStats.modes && clubStats.modes.length > 0 && (
                      <div style={{ marginTop: '25px' }}>
                        <h3 style={{ marginBottom: '15px', fontSize: '1.1rem' }}>🎮 Most Played Modes</h3>
                        <div className="compact-list">
                          {clubStats.modes.slice(0, 5).map(m => (
                            <div key={m.mode} className="compact-list-item">
                              <span className="compact-list-name">{m.mode}</span>
                              <span className="compact-list-stat">{m.played} games</span>
                              <span className={`compact-list-wr ${m.win_rate >= 55 ? 'wr-high' : m.win_rate >= 50 ? 'wr-mid' : 'wr-low'}`}>
                                {m.win_rate.toFixed(1)}%
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Top Brawlers */}
                    {clubStats.brawlers && clubStats.brawlers.length > 0 && (
                      <div style={{ marginTop: '25px' }}>
                        <h3 style={{ marginBottom: '15px', fontSize: '1.1rem' }}>⭐ Most Played Brawlers</h3>
                        <div className="compact-list">
                          {clubStats.brawlers.map(b => (
                            <div key={b.id} className="compact-list-item">
                              <span className="compact-list-name">{b.name}</span>
                              <span className="compact-list-stat">{b.played} games</span>
                              <span className={`compact-list-wr ${b.win_rate >= 55 ? 'wr-high' : b.win_rate >= 50 ? 'wr-mid' : 'wr-low'}`}>
                                {b.win_rate.toFixed(1)}%
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="empty-state">
                    <p>Could not load club statistics.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Roster Tab */}
          {activeClubTab === 'roster' && (
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
                <div 
                  key={member.id} 
                  className="roster-item"
                  style={{ flexDirection: 'column', alignItems: 'stretch' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
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
                      <div className="roster-name" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                        <span>{member.player_name}</span>
                        {member.is_linked ? (
                          <span className="linked-badge" style={{ background: 'rgba(46, 204, 113, 0.15)', color: '#2ecc71', fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(46, 204, 113, 0.4)', fontWeight: 'bold' }}>
                            🔗 {member.linked_email}
                          </span>
                        ) : (
                          (isPresident || isVP || me.is_admin) && (
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setLinkingPlayerId(linkingPlayerId === member.player ? null : member.player);
                                setSelectedUserToLink('');
                              }}
                              className="btn btn-sm" 
                              style={{ padding: '2px 6px', fontSize: '0.75rem', background: '#222', border: '1px solid #444', borderRadius: '4px', cursor: 'pointer', color: '#3498db' }}
                            >
                              🔗 Enlazar Cuenta
                            </button>
                          )
                        )}
                      </div>
                      <div className="roster-tag">
                        {member.player_tag} • <span className="joined-date-meta" style={{ fontSize: '0.8rem', color: '#aaa' }}>Desde {new Date(member.joined_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className={`role-badge ${member.role}`}>{member.role}</span>
                      
                      {/* President Controls */}
                      {isPresident && member.player !== me.id && (
                        <div className="admin-actions" onClick={(e) => e.stopPropagation()}>
                          <select 
                            value={member.role} 
                            onChange={(e) => {
                              e.stopPropagation();
                              handleChangeRole(member.player, e.target.value);
                            }}
                            className="role-select"
                          >
                            <option value="president">Transfer President</option>
                            <option value="vice_president">Vice President</option>
                            <option value="senior">Senior</option>
                            <option value="member">Member</option>
                          </select>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveMember(member.player, member.player_name);
                            }}
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
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveMember(member.player, member.player_name);
                          }}
                          className="btn btn-sm btn-danger-text"
                          title="Kick Member"
                        >
                          Kick
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Inline Link Form for this specific member */}
                  {linkingPlayerId === member.player && (
                    <div 
                      className="inline-link-form" 
                      style={{ marginTop: '10px', background: 'rgba(0, 0, 0, 0.3)', padding: '12px', borderRadius: '6px', border: '1px solid #333' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <label style={{ fontSize: '0.8rem', color: '#ccc', display: 'block', marginBottom: '6px' }}>Vincular cuenta web registrada a {member.player_name}:</label>
                      {unlinkedUsers.length === 0 ? (
                        <p style={{ fontSize: '0.8rem', color: '#ff6b6b', margin: '0' }}>No hay cuentas web registradas pendientes de enlace.</p>
                      ) : (
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                          <select 
                            value={selectedUserToLink}
                            onChange={(e) => setSelectedUserToLink(e.target.value)}
                            style={{ padding: '8px', borderRadius: '4px', background: '#1c1c1e', border: '1px solid #444', color: '#fff', fontSize: '0.85rem', flex: 1 }}
                          >
                            <option value="">-- Seleccionar Cuenta / Email --</option>
                            {unlinkedUsers.map(u => (
                              <option key={u.id} value={u.id}>{u.username}</option>
                            ))}
                          </select>
                          <button 
                            onClick={() => handleLinkPlayerInline(member.player)}
                            disabled={!selectedUserToLink || linkingAccount}
                            className="btn btn-primary btn-sm"
                            style={{ padding: '8px 16px', fontSize: '0.8rem' }}
                          >
                            {linkingAccount ? 'Enlazando...' : 'Confirmar'}
                          </button>
                          <button 
                            onClick={() => {
                              setLinkingPlayerId(null);
                              setSelectedUserToLink('');
                            }}
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '8px 12px', fontSize: '0.8rem' }}
                          >
                            Cancelar
                          </button>
                        </div>
                      )}
                    </div>
                  )}
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
          </div>
        </div>
          )}
        </div>
      )}

      {view === 'forum' && (
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
                        <span className="cat-icon">{cat.restricted_to_seniors ? '🔒' : '📁'}</span>
                        <div className="cat-details">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span className="cat-name">{cat.name}</span>
                            {cat.restricted_to_seniors && (
                              <span style={{ fontSize: '9px', background: 'rgba(255, 0, 85, 0.15)', color: 'var(--color-enemy)', padding: '1px 4px', borderRadius: '3px', fontWeight: '800' }}>
                                SENIORS
                              </span>
                            )}
                          </div>
                          <div className="cat-desc">{cat.description}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                  {isAdmin && (
                    <div style={{ marginTop: '15px' }}>
                      {showNewCategoryForm ? (
                        <form onSubmit={handleCreateCategory} className="new-thread-form">
                          <div className="form-group">
                            <label>Category Name</label>
                            <input
                              type="text"
                              placeholder="e.g. Scrims"
                              value={newCategoryName}
                              onChange={(e) => setNewCategoryName(e.target.value)}
                              required
                              maxLength="100"
                            />
                          </div>
                          <div className="form-group">
                            <label>Description</label>
                            <input
                              type="text"
                              placeholder="What's this category for?"
                              value={newCategoryDescription}
                              onChange={(e) => setNewCategoryDescription(e.target.value)}
                            />
                          </div>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={newCategoryRestricted}
                              onChange={(e) => setNewCategoryRestricted(e.target.checked)}
                            />
                            🔒 Seniors only
                          </label>
                          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                            <button type="submit" className="btn btn-primary btn-sm">Create</button>
                            <button type="button" onClick={() => { setShowNewCategoryForm(false); setNewCategoryName(''); setNewCategoryDescription(''); setNewCategoryRestricted(false); }} className="btn btn-secondary btn-sm">Cancel</button>
                          </div>
                        </form>
                      ) : (
                        <button onClick={() => setShowNewCategoryForm(true)} className="btn btn-secondary btn-sm" style={{ width: '100%' }}>
                          + New Category
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Main Area: Threads or Single Thread View */}
                <div className="glass-panel forum-main-area">
                  {!selectedThread ? (
                    <>
                      <div className="forum-section-header">
                        <div>
                          <h2>📁 {selectedCategory?.name || 'Select Category'}</h2>
                          <p className="subtitle">{selectedCategory?.description}</p>
                        </div>
                        {selectedCategory && (
                          <button 
                            onClick={() => setShowNewThreadForm(!showNewThreadForm)}
                            className="btn btn-primary"
                          >
                            {showNewThreadForm ? 'Cancel' : '📝 Create Thread'}
                          </button>
                        )}
                      </div>

                      {showNewThreadForm ? (
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
                        <div className="threads-list">
                          {threads.length === 0 ? (
                            <div className="empty-state">
                              <p>No threads posted in this category yet. Be the first!</p>
                            </div>
                          ) : (
                            threads.map(thread => {
                              const authorRole = getMemberRole(thread.author);
                              return (
                              <div 
                                key={thread.id} 
                                className={`thread-list-item ${thread.is_pinned ? 'thread-pinned' : ''}`}
                                onClick={() => {
                                  setSelectedThread(thread);
                                  loadReplies(thread.id);
                                }}
                              >
                                <div className="thread-list-main">
                                  <div className="thread-title-row">
                                    {thread.is_pinned && <span className="pinned-badge">📌</span>}
                                    <h4 className="thread-title">{thread.title}</h4>
                                  </div>
                                  <div className="thread-meta">
                                    <div className="thread-author-info">
                                      {thread.author_avatar_id ? (
                                        <img src={`https://cdn.brawlify.com/profile-icons/regular/${thread.author_avatar_id}.png`} alt="" className="thread-author-avatar" />
                                      ) : (
                                        <div className="thread-author-avatar-fallback">👤</div>
                                      )}
                                      <strong>{thread.author_name}</strong>
                                      {authorRole && <span className={`role-badge ${authorRole}`}>{authorRole.replace('_', ' ')}</span>}
                                      <span className="thread-date">{new Date(thread.created_at).toLocaleDateString()}</span>
                                    </div>
                                  </div>
                                </div>
                                <div className="thread-list-actions">
                                  <div className="thread-replies-badge">
                                    💬 {thread.replies_count}
                                  </div>
                                  <button
                                    className={`like-btn ${thread.has_liked ? 'liked' : ''}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleToggleThreadLike(thread.id);
                                    }}
                                    title={thread.has_liked ? 'Unlike' : 'Like'}
                                  >
                                    {thread.has_liked ? '❤️' : '🤍'} {thread.likes_count || 0}
                                  </button>
                                </div>
                              </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </>
                  ) : (
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
                            <div className="thread-title-row">
                              {selectedThread.is_pinned && <span className="pinned-badge">📌</span>}
                              <h2 style={{ margin: 0, fontSize: '1.4rem' }}>{selectedThread.title}</h2>
                            </div>
                            <div className="post-meta">
                              <strong>{selectedThread.author_name}</strong>
                              {(() => { const ar = getMemberRole(selectedThread.author); return ar ? <span className={`role-badge ${ar}`}>{ar.replace('_', ' ')}</span> : null; })()}
                              <span className="reply-tag">{selectedThread.author_tag}</span>
                              <span className="reply-time">{new Date(selectedThread.created_at).toLocaleString()}</span>
                            </div>
                          </div>
                          <div className="post-actions">
                            <button
                              className={`like-btn ${selectedThread.has_liked ? 'liked' : ''}`}
                              onClick={(e) => { e.stopPropagation(); handleToggleThreadLike(selectedThread.id); }}
                              title={selectedThread.has_liked ? 'Unlike' : 'Like'}
                            >
                              {selectedThread.has_liked ? '❤️' : '🤍'} {selectedThread.likes_count || 0}
                            </button>
                            {(selectedThread.author === me.id || isAdmin) && (
                              <button 
                                onClick={() => handleDeleteThread(selectedThread.id)}
                                className="btn btn-sm btn-danger"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="post-body">
                          {selectedThread.content}
                        </div>
                      </div>

                      <div className="replies-section">
                        <h3>Replies ({replies.length})</h3>
                        <div className="replies-list">
                          {replies.map(reply => {
                            const replyRole = getMemberRole(reply.author);
                            return (
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
                                  <strong>{reply.author_name}</strong>
                                  {replyRole && <span className={`role-badge ${replyRole}`}>{replyRole.replace('_', ' ')}</span>}
                                  <span className="reply-tag">{reply.author_tag}</span>
                                  <span className="reply-time">{new Date(reply.created_at).toLocaleString()}</span>
                                </div>
                                <div className="post-actions">
                                  <button
                                    className={`like-btn ${reply.has_liked ? 'liked' : ''}`}
                                    onClick={(e) => { e.stopPropagation(); handleToggleReplyLike(reply.id); }}
                                    title={reply.has_liked ? 'Unlike' : 'Like'}
                                  >
                                    {reply.has_liked ? '❤️' : '🤍'} {reply.likes_count || 0}
                                  </button>
                                  {(reply.author === me.id || isAdmin) && (
                                    <button 
                                      onClick={() => handleDeleteReply(reply.id)}
                                      className="btn btn-sm btn-danger-text"
                                    >
                                      Delete
                                    </button>
                                  )}
                                </div>
                              </div>
                              <div className="reply-body">
                                {reply.content}
                              </div>
                            </div>
                            );
                          })}
                        </div>

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
      {view === 'settings' && (
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
