import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { api, setGlobalActiveUser } from './services/api';
import './App.css';
import StatsDashboard from './StatsDashboard';
import BrawlerProfile from './BrawlerProfile';
import MapProfile from './MapProfile';
import ModeProfile from './ModeProfile';
import ClubDashboard from './ClubDashboard';
import BattleLog from './components/BattleLog';
import { deduplicateMaps, getMapName, getBrawlerName, getBrawlerAvatar, getModeIcon, getRankById, getRankIconUrl } from './utils/helpers';
import MatchTeamsBanner from './components/MatchTeamsBanner';
import AlertModal from './components/AlertModal';
import MapSelectorModal from './components/MapSelectorModal';
import { useFilters } from './context/FilterContext';
import GlobalFilterBar from './components/GlobalFilterBar';

function App() {
  const { showGlobalFilters, setShowGlobalFilters } = useFilters();
  const filterBarRef = useRef(null);
  const filterBtnRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (
        showGlobalFilters &&
        filterBarRef.current &&
        !filterBarRef.current.contains(event.target) &&
        filterBtnRef.current &&
        !filterBtnRef.current.contains(event.target)
      ) {
        setShowGlobalFilters(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showGlobalFilters, setShowGlobalFilters]);

  // Authentication & Users
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem('brawl_active_user');
    return saved ? JSON.parse(saved) : null;
  });

  const [me, setMe] = useState(null);
  const [authError, setAuthError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const [selectedProfileBrawlerId, setSelectedProfileBrawlerId] = useState(null);
  const [selectedMapId, setSelectedMapId] = useState(null);
  const [selectedMode, setSelectedMode] = useState(null);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [showHomeMapBrowser, setShowHomeMapBrowser] = useState(false);
  const [authTab, setAuthTab] = useState('passwordless'); // 'passwordless', 'login', 'register'
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [registerUsername, setRegisterUsername] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');

  // Connection State
  const [backendConnected, setBackendConnected] = useState(true);

  // Catalogs
  const [brawlers, setBrawlers] = useState([]);
  const [maps, setMaps] = useState([]);
  const [allMaps, setAllMaps] = useState([]);
  const [brawlerMeta, setBrawlerMeta] = useState([]);
  const [selectedMap, setSelectedMap] = useState(null);
  const [showMapModal, setShowMapModal] = useState(false);
  const [modalAlert, setModalAlert] = useState({
    isOpen: false,
    title: '',
    message: '',
    type: 'info',
    onDismiss: null
  });

  const triggerAlert = (title, message, type = 'info', onDismiss = null) => {
    setModalAlert({
      isOpen: true,
      title,
      message,
      type,
      onDismiss
    });
  };

  const handleCloseAlert = () => {
    if (modalAlert.onDismiss) {
      modalAlert.onDismiss();
    }
    setModalAlert(prev => ({ ...prev, isOpen: false, onDismiss: null }));
  };
  const [draftType, setDraftType] = useState('ranked'); // 'ranked' or 'normal'
  const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = useState(false);
  const [firstPickTeam, setFirstPickTeam] = useState('allies'); // 'allies' or 'enemies'
  const [enableBans, setEnableBans] = useState(true);
  const [enableTurns, setEnableTurns] = useState(true);

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClass, setSelectedClass] = useState('All');

  // Personal Logs
  const [matches, setMatches] = useState([]);
  const [perceptions, setPerceptions] = useState([]);

  // Draft State
  const [draft, setDraft] = useState({
    allies_banned: [null, null, null],
    enemies_banned: [null, null, null],
    allies_picked: [null, null, null],
    enemies_picked: [null, null, null],
  });

  const [activeSlot, setActiveSlot] = useState({ type: 'allies_banned', index: 0 });
  const [suggestions, setSuggestions] = useState([]);

  // Post match Logger Modal State
  const [showMatchLogger, setShowMatchLogger] = useState(false);
  const [matchResult, setMatchResult] = useState('victory');
  const [myBrawler, setMyBrawler] = useState(null);
  const [opponentPerceptions, setOpponentPerceptions] = useState({});
  const [editingMatchId, setEditingMatchId] = useState(null);
  const [apiMatchId, setApiMatchId] = useState(null);
  const [sets, setSets] = useState([]);
  const [linkingMatch, setLinkingMatch] = useState(false);
  const [linkingMatchId, setLinkingMatchId] = useState(null);
  const [syncingHistory, setSyncingHistory] = useState(false);
  const [submittingMatch, setSubmittingMatch] = useState(false);
  const [ratingMatchId, setRatingMatchId] = useState(null);


  const [minNormalTrophies, setMinNormalTrophies] = useState(750);
  const [suggestionTrophyThreshold, setSuggestionTrophyThreshold] = useState(1000);
  const [debouncedSuggestionTrophyThreshold, setDebouncedSuggestionTrophyThreshold] = useState(1000);
  const [myBrawlerTrophies, setMyBrawlerTrophies] = useState(null);
  const [isStarPlayer, setIsStarPlayer] = useState(false);

  const [profileName, setProfileName] = useState('');
  const [profileTag, setProfileTag] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState(false);

  const [availablePlayers, setAvailablePlayers] = useState([]);
  const [newPlayerTag, setNewPlayerTag] = useState('');
  const [loadingPlayers, setLoadingPlayers] = useState(false);

  // Load available profiles for passwordless login screen
  useEffect(() => {
    if (!currentUser) {
      const loadPlayers = async () => {
        setLoadingPlayers(true);
        try {
          const list = await api.fetchPlayerList();
          setAvailablePlayers(list);
        } catch (err) {
          console.error("Failed to load player profiles:", err);
        } finally {
          setLoadingPlayers(false);
        }
      };
      loadPlayers();
    }
  }, [currentUser]);

  useEffect(() => {
    if (me) {
      setProfileName(me.name || '');
      setProfileTag(me.player_tag || '');
      setMinNormalTrophies(me.min_normal_trophies !== undefined && me.min_normal_trophies !== null ? me.min_normal_trophies : 750);
    }
  }, [me]);

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    setProfileError('');
    setProfileSuccess(false);
    try {
      const updated = await api.updateMe({
        name: profileName,
        player_tag: profileTag,
        min_normal_trophies: minNormalTrophies
      });
      setMe(updated);
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3000);
    } catch (err) {
      console.error(err);
      setProfileError(err.message || 'Failed to update profile settings.');
    } finally {
      setSavingProfile(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('brawl_active_user', JSON.stringify(currentUser));
      loadCatalogs();
    } else {
      localStorage.removeItem('brawl_active_user');
      setMe(null);
      setMatches([]);
      setPerceptions([]);
    }
  }, [currentUser]);

  // Debounce the suggestions trophy threshold to prevent UI lag on range slider drag
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSuggestionTrophyThreshold(suggestionTrophyThreshold);
    }, 300);
    return () => {
      clearTimeout(handler);
    };
  }, [suggestionTrophyThreshold]);

  // Load recommendations whenever draft selections or map changes
  useEffect(() => {
    if (selectedMap && currentUser && backendConnected) {
      loadSuggestions();
    } else {
      setSuggestions([]);
    }
  }, [draft, selectedMap, currentUser, backendConnected, enableTurns, activeSlot, debouncedSuggestionTrophyThreshold]);

  const loadCatalogs = async () => {
    if (!currentUser) return;
    try {
      setGlobalActiveUser(currentUser.token, currentUser.name);

      // Load user details
      const playerProfile = await api.fetchMe();
      setMe(playerProfile);

      // Load catalogs
      const brawlerList = await api.fetchBrawlers();
      setBrawlers(brawlerList);

      // Load maps
      const allMapList = await api.fetchMaps(null);
      const uniqueAllMaps = deduplicateMaps(allMapList);
      setAllMaps(uniqueAllMaps);

      const mapList = await api.fetchMaps(true);
      const uniqueMaps = deduplicateMaps(mapList);
      setMaps(uniqueMaps);
      setSelectedMap(null);
      setBackendConnected(true);
      loadUserStats();
      api.fetchBrawlerMeta().then(setBrawlerMeta).catch(() => {});
    } catch (err) {
      console.error("Error loading catalogs:", err);
      setBackendConnected(false);
    }
  };

  const loadMapsForDraft = async (isRanked) => {
    try {
      const mapList = await api.fetchMaps(isRanked ? true : null);
      const uniqueMaps = deduplicateMaps(mapList);
      setMaps(uniqueMaps);
      if (uniqueMaps.length > 0) {
        if (selectedMap && !uniqueMaps.some(m => m.id === selectedMap.id)) {
          setSelectedMap(null);
        }
      } else {
        setSelectedMap(null);
      }
    } catch (err) {
      console.error("Error loading maps:", err);
    }
  };

  const enterDraftMode = async (type) => {
    await loadMapsForDraft(type === 'ranked');
    setDraftType(type);
    resetDraft(type, firstPickTeam, type === 'ranked' ? enableBans : false);
    navigate('/draft');
  };

  const loadUserStats = async () => {
    try {
      const matchHistory = await api.fetchMatches();
      setMatches(matchHistory);
      const perceptionList = await api.fetchPerceptions();
      setPerceptions(perceptionList);
    } catch (err) {
      console.error("Error loading user logs:", err);
    }
  };

  const loadSuggestions = async () => {
    try {
      const alliesPicked = draft.allies_picked.filter(Boolean).map(b => b.id);
      const enemiesPicked = draft.enemies_picked.filter(Boolean).map(b => b.id);
      const alliesBanned = draft.allies_banned.filter(Boolean).map(b => b.id);
      const enemiesBanned = draft.enemies_banned.filter(Boolean).map(b => b.id);

      const activeTeam = activeSlot.type.startsWith('allies') ? 'allied' : 'enemy';
      const res = await api.fetchSuggestions(
        selectedMap.id,
        alliesPicked,
        enemiesPicked,
        alliesBanned,
        enemiesBanned,
        draftType === 'ranked' ? enableTurns : false,
        activeTeam,
        draftType,
        debouncedSuggestionTrophyThreshold
      );
      setSuggestions(res.suggestions || []);
    } catch (err) {
      console.error("Error fetching suggestions:", err);
    }
  };

  const handleSelectProfile = async (player) => {
    setAuthError('');
    try {
      const data = await api.accessPlayerProfile(player.player_tag);
      const userSession = { id: data.token, token: data.token, name: data.username };
      setGlobalActiveUser(data.token, data.username);
      setCurrentUser(userSession);
      navigate('/');
    } catch (err) {
      setAuthError(err.message || 'Failed to login with selected profile.');
    }
  };

  const handleCreateProfileSubmit = async (e) => {
    e.preventDefault();
    if (!newPlayerTag.trim()) return;
    setAuthError('');
    try {
      const data = await api.accessPlayerProfile(newPlayerTag.trim());
      const userSession = { id: data.token, token: data.token, name: data.username };
      setGlobalActiveUser(data.token, data.username);
      setCurrentUser(userSession);
      setNewPlayerTag('');
      navigate('/');
    } catch (err) {
      setAuthError(err.message || 'Failed to register with tag. Make sure it is valid.');
    }
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    if (!loginUsername.trim() || !loginPassword) return;
    setAuthError('');
    try {
      const data = await api.login(loginUsername.trim(), loginPassword);
      const userSession = { id: data.token, token: data.token, name: data.username };
      setGlobalActiveUser(data.token, data.username);
      setCurrentUser(userSession);
      setLoginUsername('');
      setLoginPassword('');
      navigate('/');
    } catch (err) {
      setAuthError(err.message || 'Login failed. Check credentials.');
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    if (!registerUsername.trim() || !registerPassword) return;
    setAuthError('');
    try {
      const data = await api.register(registerUsername.trim(), registerPassword);
      const userSession = { id: data.token, token: data.token, name: data.username };
      setGlobalActiveUser(data.token, data.username);
      setCurrentUser(userSession);
      setRegisterUsername('');
      setRegisterPassword('');
      navigate('/');
    } catch (err) {
      setAuthError(err.message || 'Registration failed. Username may be taken.');
    }
  };

  const handleLogout = () => {
    setGlobalActiveUser('', '');
    setCurrentUser(null);
    setShowProfileDropdown(false);
    navigate('/');
    resetDraft();
  };

  const handleMapChange = (e) => {
    const mapId = e.target.value;
    const foundMap = maps.find(m => m.id === mapId);
    if (foundMap) {
      setSelectedMap(foundMap);
    }
  };

  const selectSlot = (type, index) => {
    if ((draftType === 'normal' || !enableBans) && (type === 'allies_banned' || type === 'enemies_banned')) {
      return;
    }
    setActiveSlot({ type, index });
  };

  const clearSlot = (type, index, e) => {
    e.stopPropagation();
    const list = [...draft[type]];
    list[index] = null;
    setDraft({ ...draft, [type]: list });
  };

  const getDraftSteps = (type = draftType, firstPick = firstPickTeam, bansEnabled = enableBans) => {
    const steps = [];
    if (type === 'ranked') {
      if (bansEnabled) {
        // 3 Allies bans
        steps.push(
          { type: 'allies_banned', index: 0 },
          { type: 'allies_banned', index: 1 },
          { type: 'allies_banned', index: 2 },
          // 3 Enemies bans
          { type: 'enemies_banned', index: 0 },
          { type: 'enemies_banned', index: 1 },
          { type: 'enemies_banned', index: 2 }
        );
      }
      
      // 1-2-2-1 picks
      if (firstPick === 'allies') {
        steps.push(
          { type: 'allies_picked', index: 0 },
          { type: 'enemies_picked', index: 0 },
          { type: 'enemies_picked', index: 1 },
          { type: 'allies_picked', index: 1 },
          { type: 'allies_picked', index: 2 },
          { type: 'enemies_picked', index: 2 }
        );
      } else {
        steps.push(
          { type: 'enemies_picked', index: 0 },
          { type: 'allies_picked', index: 0 },
          { type: 'allies_picked', index: 1 },
          { type: 'enemies_picked', index: 1 },
          { type: 'enemies_picked', index: 2 },
          { type: 'allies_picked', index: 2 }
        );
      }
    } else {
      // Normal: Pick 1, 2, 3 Allies then Pick 1, 2, 3 Enemies
      steps.push(
        { type: 'allies_picked', index: 0 },
        { type: 'allies_picked', index: 1 },
        { type: 'allies_picked', index: 2 },
        { type: 'enemies_picked', index: 0 },
        { type: 'enemies_picked', index: 1 },
        { type: 'enemies_picked', index: 2 }
      );
    }
    return steps;
  };

  const handleFirstPickChange = (team) => {
    setFirstPickTeam(team);
    resetDraft(draftType, team);
  };

  const flipCoin = () => {
    const result = Math.random() < 0.5 ? 'allies' : 'enemies';
    handleFirstPickChange(result);
  };

  const placeBrawler = (brawler) => {
    const { type, index } = activeSlot;
    
    // Check if brawler is already picked
    let isAlreadyPicked = false;
    if (draftType === 'ranked') {
      if (enableTurns) {
        isAlreadyPicked = [
          ...draft.allies_picked,
          ...draft.enemies_picked
        ].some(b => b && b.id === brawler.id);
      } else {
        if (type === 'allies_picked') {
          isAlreadyPicked = draft.allies_picked.some(b => b && b.id === brawler.id);
        } else if (type === 'enemies_picked') {
          isAlreadyPicked = draft.enemies_picked.some(b => b && b.id === brawler.id);
        } else {
          isAlreadyPicked = [
            ...draft.allies_picked,
            ...draft.enemies_picked
          ].some(b => b && b.id === brawler.id);
        }
      }
    }
    if (isAlreadyPicked) return;

    // Check ban status depending on active slot type
    if (type === 'allies_banned') {
      const isAlreadyBannedByAllies = draft.allies_banned.some(b => b && b.id === brawler.id);
      if (isAlreadyBannedByAllies) return;
    } else if (type === 'enemies_banned') {
      const isAlreadyBannedByEnemies = draft.enemies_banned.some(b => b && b.id === brawler.id);
      if (isAlreadyBannedByEnemies) return;
    } else {
      // Pick slots: cannot select a brawler banned by either team
      const isBanned = [
        ...draft.allies_banned,
        ...draft.enemies_banned
      ].some(b => b && b.id === brawler.id);
      if (isBanned) return;
    }

    const list = [...draft[type]];
    list[index] = brawler;

    const newDraft = { ...draft, [type]: list };
    setDraft(newDraft);
    advanceSlot(type, index, newDraft);
  };

  const advanceSlot = (type, index, currentDraft) => {
    const steps = getDraftSteps();
    const currentStepIdx = steps.findIndex(s => s.type === type && s.index === index);
    if (currentStepIdx === -1) return;

    let nextStep = null;
    for (let i = currentStepIdx + 1; i < steps.length; i++) {
      const step = steps[i];
      if (!currentDraft[step.type][step.index]) {
        nextStep = step;
        break;
      }
    }
    
    if (!nextStep) {
      for (let i = 0; i < currentStepIdx; i++) {
        const step = steps[i];
        if (!currentDraft[step.type][step.index]) {
          nextStep = step;
          break;
        }
      }
    }

    if (nextStep) {
      setActiveSlot({ type: nextStep.type, index: nextStep.index });
    }
  };

  const resetDraft = (type = draftType, firstPick = firstPickTeam, bansEnabled = enableBans) => {
    setDraft({
      allies_banned: [null, null, null],
      enemies_banned: [null, null, null],
      allies_picked: [null, null, null],
      enemies_picked: [null, null, null],
    });
    setApiMatchId(null);
    setMyBrawlerTrophies(null);
    setIsStarPlayer(false);
    const steps = getDraftSteps(type, firstPick, bansEnabled);
    if (steps.length > 0) {
      setActiveSlot({ type: steps[0].type, index: steps[0].index });
    }
  };

  const openLogMatch = () => {
    setMyBrawler(null);
    setSets([]);

    const enemies = draft.enemies_picked.filter(Boolean);
    const initialPerceptions = {};
    enemies.forEach((enemy, idx) => {
      initialPerceptions[`${enemy.id}-${idx}`] = 0;
    });
    setOpponentPerceptions(initialPerceptions);
    setShowMatchLogger(true);
  };

  const [ingesting, setIngesting] = useState(false);

  const ingestLastBattle = async () => {
    setIngesting(true);
    try {
      const data = await api.fetchLastBattle();
      
      setSelectedMap(data.map);
      if (data.draft_type) {
        setDraftType(data.draft_type);
      } else if (data.map && data.map.is_ranked) {
        setDraftType('ranked');
      } else {
        setDraftType('normal');
      }
      navigate('/draft');

      const paddedAllies = [...data.allies_picked];
      while (paddedAllies.length < 3) paddedAllies.push(null);
      const paddedEnemies = [...data.enemies_picked];
      while (paddedEnemies.length < 3) paddedEnemies.push(null);

      const newDraft = {
        allies_banned: [null, null, null],
        enemies_banned: [null, null, null],
        allies_picked: paddedAllies,
        enemies_picked: paddedEnemies
      };
      setDraft(newDraft);

      setMyBrawler(data.my_brawler);

      // Extract set results
      const fetchedSets = data.sets || [];
      setSets(fetchedSets);

      const victoriesCount = fetchedSets.filter(s => s.result === 'victory').length;
      const defeatsCount = fetchedSets.filter(s => s.result === 'defeat').length;
      const overallResult = victoriesCount > defeatsCount ? 'victory' : 'defeat';
      setMatchResult(overallResult);

      const lastSet = fetchedSets[fetchedSets.length - 1];
      setApiMatchId(fetchedSets[0]?.api_match_id || null);
      setMyBrawlerTrophies(lastSet ? lastSet.my_brawler_trophies : null);
      setIsStarPlayer(fetchedSets.some(s => s.is_star_player));

      const initialPerceptions = {};
      data.enemies_picked.filter(Boolean).forEach((enemy, idx) => {
        initialPerceptions[`${enemy.id}-${idx}`] = 0;
      });
      setOpponentPerceptions(initialPerceptions);

      setShowMatchLogger(true);
    } catch (err) {
      console.error(err);
      triggerAlert("Ingest Battle Failed", err.message || "Failed to ingest last battle from API.", "error");
    } finally {
      setIngesting(false);
    }
  };

  const handleSyncHistory = async () => {
    setSyncingHistory(true);
    try {
      const res = await api.syncMatchesAPI();
      triggerAlert("Sync Successful", res.message || `Successfully synchronized ${res.synced_count || 0} match(es)!`, "success");
      await loadUserStats();
    } catch (err) {
      console.error(err);
      triggerAlert("Sync Failed", err.message || "Failed to synchronize matches from API.", "error");
    } finally {
      setSyncingHistory(false);
    }
  };

  const startEditMatch = (match) => {
    setEditingMatchId(match.id);
    setDraftType(match.draft_type);
    loadMapsForDraft(match.draft_type === 'ranked');
    
    // Find map in allMaps
    const m_map = allMaps.find(m => String(m.id) === String(match.map_id));
    if (m_map) {
      setSelectedMap(m_map);
    }

    // Set my brawler
    const my_b = brawlers.find(b => String(b.id) === String(match.my_brawler_id));
    setMyBrawler(my_b || null);

    // Reconstruct draft from draft events
    const allies_picked = [null, null, null];
    const enemies_picked = [null, null, null];
    const allies_banned = [null, null, null];
    const enemies_banned = [null, null, null];

    let alliedPickIdx = 0;
    let enemyPickIdx = 0;
    let alliedBanIdx = 0;
    let enemyBanIdx = 0;

    const sortedEvents = [...match.draft_events].sort((a, b) => a.order - b.order);
    sortedEvents.forEach(evt => {
      const brawler = brawlers.find(b => String(b.id) === String(evt.brawler_id));
      if (evt.type === 'pick') {
        if (evt.team === 'allied' && alliedPickIdx < 3) {
          allies_picked[alliedPickIdx++] = brawler || null;
        } else if (evt.team === 'enemy' && enemyPickIdx < 3) {
          enemies_picked[enemyPickIdx++] = brawler || null;
        }
      } else if (evt.type === 'ban') {
        if (evt.team === 'allied' && alliedBanIdx < 3) {
          allies_banned[alliedBanIdx++] = brawler || null;
        } else if (evt.team === 'enemy' && enemyBanIdx < 3) {
          enemies_banned[enemyBanIdx++] = brawler || null;
        }
      }
    });

    setDraft({
      allies_picked,
      enemies_picked,
      allies_banned,
      enemies_banned
    });

    setMatchResult(match.result);

    // Load perceptions for this specific match and enemy rivals
    const initialPerceptions = {};
    enemies_picked.filter(Boolean).forEach((enemy, idx) => {
      const opponentKey = `${enemy.id}-${idx}`;
      const existing = perceptions.find(p => 
        String(p.match_id) === String(match.id) && 
        String(p.brawler_rival_id) === String(enemy.id)
      );
      initialPerceptions[opponentKey] = existing ? existing.value : 0;
    });
    setOpponentPerceptions(initialPerceptions);

    setShowMatchLogger(true);
  };

  const handleLinkWithAPI = async () => {
    if (!selectedMap || !myBrawler) {
      triggerAlert("Error", "Please select your brawler before linking with API.", "error");
      return;
    }
    setLinkingMatch(true);
    try {
      const payload = {
        map_id: selectedMap.id,
        my_brawler_id: myBrawler.id,
        allies_picked: draft.allies_picked.filter(Boolean).map(b => b.id),
        enemies_picked: draft.enemies_picked.filter(Boolean).map(b => b.id)
      };
      
      const data = await api.linkDraftBattle(payload);
      const fetchedSets = data.sets || [];
      
      if (fetchedSets.length > 0) {
        setSets(fetchedSets);
        const victoriesCount = fetchedSets.filter(s => s.result === 'victory').length;
        const defeatsCount = fetchedSets.filter(s => s.result === 'defeat').length;
        const overallResult = victoriesCount > defeatsCount ? 'victory' : 'defeat';
        setMatchResult(overallResult);
        
        const lastSet = fetchedSets[fetchedSets.length - 1];
        setApiMatchId(fetchedSets[0]?.api_match_id || null);
        setMyBrawlerTrophies(lastSet ? lastSet.my_brawler_trophies : null);
        setIsStarPlayer(fetchedSets.some(s => s.is_star_player));
        
        triggerAlert("Link Successful", `Found and linked ${fetchedSets.length} sets from your battle log!`, "success");
      } else {
        triggerAlert("Not Found", "No recent matching battle found in your battle log.", "warning");
      }
    } catch (err) {
      console.error(err);
      triggerAlert("Link Failed", err.message || "Failed to find a matching battle in your log.", "error");
    } finally {
      setLinkingMatch(false);
    }
  };

  const handleLinkMatchAPI = async (matchId) => {
    setLinkingMatchId(matchId);
    try {
      await api.linkMatchAPI(matchId);
      loadUserStats();
      triggerAlert("Match Linked", "Successfully linked match series with Brawl Stars API battle logs!", "success");
    } catch (err) {
      console.error(err);
      triggerAlert("Linking Failed", err.message || "Failed to link match with API.", "error");
    } finally {
      setLinkingMatchId(null);
    }
  };

  const submitMatch = async () => {
    if (!selectedMap || !myBrawler) return;
    if (submittingMatch) return;

    setSubmittingMatch(true);
    try {
      const matchPayload = {
        map_id: selectedMap.id,
        my_brawler_id: myBrawler.id,
        mode: selectedMap.mode,
        result: matchResult,
        draft_type: draftType,
        draft_events: [],
        api_match_id: apiMatchId,
        my_brawler_trophies: myBrawlerTrophies,
        is_star_player: isStarPlayer
      };

      let order = 1;
      const addEvents = (list, type, team) => {
        list.forEach(b => {
          if (b) {
            matchPayload.draft_events.push({
              type: type,
              brawler_id: b.id,
              team: team,
              order: order++
            });
          }
        });
      };

      addEvents(draft.allies_banned, 'ban', 'allied');
      addEvents(draft.enemies_banned, 'ban', 'enemy');
      addEvents(draft.allies_picked, 'pick', 'allied');
      addEvents(draft.enemies_picked, 'pick', 'enemy');

      if (editingMatchId) {
        // Edit flow
        const savedMatch = await api.updateMatch(editingMatchId, matchPayload);
        const matchId = savedMatch.id;
        for (const [key, ratingVal] of Object.entries(opponentPerceptions)) {
          const enemyId = key.split('-')[0];
          await api.savePerception(matchId, myBrawler.id, enemyId, ratingVal);
        }
      } else {
        // Series / multi-set creation flow
        const seriesPayload = {
          map_id: selectedMap.id,
          my_brawler_id: myBrawler.id,
          mode: selectedMap.mode,
          draft_type: draftType,
          draft_events: matchPayload.draft_events,
          perceptions: [],
          sets: sets.length > 0 ? sets : [{
            api_match_id: apiMatchId,
            result: matchResult,
            my_brawler_trophies: myBrawlerTrophies,
            is_star_player: isStarPlayer
          }]
        };

        for (const [key, ratingVal] of Object.entries(opponentPerceptions)) {
          const enemyId = key.split('-')[0];
          seriesPayload.perceptions.push({
            brawler_rival_id: enemyId,
            value: ratingVal
          });
        }

        await api.submitMatchSeries(seriesPayload);
      }

      setShowMatchLogger(false);
      setEditingMatchId(null);
      setSets([]);
      resetDraft();
      loadUserStats();
      triggerAlert(
        editingMatchId ? "Match Updated" : "Match Logged", 
        editingMatchId ? "Match data and matchup perceptions updated successfully!" : "Match and matchup perceptions logged successfully!", 
        "success",
        () => navigate('/')
      );
    } catch (err) {
      console.error(err);
      triggerAlert(
        "Save Failed", 
        editingMatchId ? "Failed to update match logs." : "Failed to save match logs.", 
        "error"
      );
    } finally {
      setSubmittingMatch(false);
    }
  };

  const displayedMatches = matches.filter(m => {
    const matchesMap = !selectedMap || String(m.map_id) === String(selectedMap.id);
    const matchesDraftType = m.draft_type === draftType;
    return matchesMap && matchesDraftType;
  });

  const displayedPerceptions = perceptions.filter(p => {
    const myBrawlerName = getBrawlerName(brawlers, p.my_brawler_id).toLowerCase();
    const rivalBrawlerName = getBrawlerName(brawlers, p.brawler_rival_id).toLowerCase();
    const matchesSearch = !searchQuery || 
      myBrawlerName.includes(searchQuery.toLowerCase()) || 
      rivalBrawlerName.includes(searchQuery.toLowerCase());

    let matchesMap = true;
    if (selectedMap) {
      const brawlersPlayedOnMap = new Set(
        matches
          .filter(m => String(m.map_id) === String(selectedMap.id))
          .map(m => String(m.my_brawler_id))
      );
      if (myBrawler) {
        brawlersPlayedOnMap.add(String(myBrawler.id));
      }
      matchesMap = brawlersPlayedOnMap.size === 0 || brawlersPlayedOnMap.has(String(p.my_brawler_id));
    }

    return matchesSearch && matchesMap;
  });

  const filteredBrawlers = brawlers.filter(b => {
    const matchesSearch = b.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesClass = selectedClass === 'All' || b.class_name === selectedClass;
    return matchesSearch && matchesClass;
  });

  const brawlerClasses = ['All', 'Damage Dealer', 'Tank', 'Marksman', 'Assassin', 'Support', 'Controller', 'Artillery'];

  // Auth Guard
  if (!currentUser) {
    return (
      <div className="login-screen">
        <div className="login-card glass-panel" style={{ maxWidth: '600px', width: '100%', padding: '40px' }}>
          <h1>BRAWL STATS</h1>
          <p className="subtitle">Game Hub & Analytics</p>

          {/* Auth Tab Selector */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '1px solid var(--border-glass)', paddingBottom: '10px' }}>
            <button
              onClick={() => { setAuthTab('passwordless'); setAuthError(''); }}
              style={{
                background: 'none', border: 'none', color: authTab === 'passwordless' ? 'var(--color-ally)' : 'var(--color-text-muted)',
                fontWeight: 'bold', cursor: 'pointer', padding: '6px 12px', fontSize: '14px',
                borderBottom: authTab === 'passwordless' ? '2px solid var(--color-ally)' : 'none'
              }}
            >
              ⚡ Quick Access (Tag)
            </button>
            <button
              onClick={() => { setAuthTab('login'); setAuthError(''); }}
              style={{
                background: 'none', border: 'none', color: authTab === 'login' ? 'var(--color-ally)' : 'var(--color-text-muted)',
                fontWeight: 'bold', cursor: 'pointer', padding: '6px 12px', fontSize: '14px',
                borderBottom: authTab === 'login' ? '2px solid var(--color-ally)' : 'none'
              }}
            >
              🔑 Log In
            </button>
            <button
              onClick={() => { setAuthTab('register'); setAuthError(''); }}
              style={{
                background: 'none', border: 'none', color: authTab === 'register' ? 'var(--color-ally)' : 'var(--color-text-muted)',
                fontWeight: 'bold', cursor: 'pointer', padding: '6px 12px', fontSize: '14px',
                borderBottom: authTab === 'register' ? '2px solid var(--color-ally)' : 'none'
              }}
            >
              👤 Sign Up
            </button>
          </div>

          {authError && (
            <div className="auth-error-banner" style={{ margin: '15px 0', borderRadius: '8px', padding: '12px', background: 'rgba(255, 0, 127, 0.1)', border: '1px solid rgba(255, 0, 127, 0.3)', color: 'var(--color-enemy)', fontWeight: 'bold' }}>
              ❌ {authError}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '30px', marginTop: '20px' }}>
            {/* Tab 1: Passwordless Tag Selection */}
            {authTab === 'passwordless' && (
              <>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: '800', marginBottom: '15px', color: '#fff', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Select Player Profile
                  </h3>
                  {loadingPlayers ? (
                    <div style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>Loading profiles...</div>
                  ) : availablePlayers.length === 0 ? (
                    <div style={{ color: 'var(--color-text-muted)', fontSize: '13px', background: 'rgba(255,255,255,0.03)', padding: '15px', borderRadius: '8px', border: '1px dashed var(--border-glass)' }}>
                      No player profiles found. Register your Brawl Stars Player Tag below to get started!
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px' }}>
                      {availablePlayers.map(player => (
                        <button
                          key={player.id}
                          onClick={() => handleSelectProfile(player)}
                          style={{
                            background: 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid var(--border-glass)',
                            borderRadius: '10px',
                            padding: '16px',
                            color: '#fff',
                            cursor: 'pointer',
                            textAlign: 'center',
                            transition: 'all 0.2s ease',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)';
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.borderColor = 'var(--color-ally)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.borderColor = 'var(--border-glass)';
                          }}
                        >
                          {player.avatar_id ? (
                            <img 
                              src={`https://cdn.brawlify.com/profile-icons/regular/${player.avatar_id}.png`} 
                              alt="" 
                              style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(0, 229, 255, 0.3)' }} 
                            />
                          ) : (
                            <div style={{ fontSize: '24px' }}>👤</div>
                          )}
                          <div style={{ fontWeight: 'bold', fontSize: '14px', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {player.name}
                          </div>
                          <div style={{
                            fontSize: '10px',
                            background: 'rgba(0, 229, 255, 0.15)',
                            color: 'var(--color-ally)',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontWeight: '700',
                            marginTop: '2px'
                          }}>
                            {player.player_tag}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ height: '1px', background: 'var(--border-glass)' }}></div>

                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: '800', marginBottom: '12px', color: '#fff', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Create New Profile
                  </h3>
                  <form onSubmit={handleCreateProfileSubmit} style={{ display: 'flex', gap: '10px' }}>
                    <input
                      type="text"
                      placeholder="Enter Player Tag (e.g. #GQ9u8vr8)"
                      value={newPlayerTag}
                      onChange={(e) => setNewPlayerTag(e.target.value)}
                      style={{
                        flex: 1,
                        background: 'rgba(0, 0, 0, 0.2)',
                        border: '1px solid var(--border-glass)',
                        borderRadius: '8px',
                        padding: '12px 14px',
                        color: '#fff',
                        fontSize: '14px',
                        outline: 'none'
                      }}
                      required
                    />
                    <button
                      type="submit"
                      className="btn btn-primary"
                      style={{
                        padding: '12px 20px',
                        background: 'linear-gradient(135deg, var(--color-ally) 0%, #00838f 100%)',
                        border: 'none',
                        borderRadius: '8px',
                        fontWeight: 'bold',
                        cursor: 'pointer'
                      }}
                    >
                      🚀 Load Profile
                    </button>
                  </form>
                  <small style={{ display: 'block', fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '8px', lineHeight: '1.4' }}>
                    We will contact the Brawl Stars API to fetch your official username automatically.
                  </small>
                </div>
              </>
            )}

            {/* Tab 2: Username & Password Login */}
            {authTab === 'login' && (
              <form onSubmit={handleLoginSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Username / Email</label>
                  <input
                    type="text"
                    placeholder="Enter username or email"
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                    style={{
                      background: 'rgba(0, 0, 0, 0.2)', border: '1px solid var(--border-glass)',
                      borderRadius: '8px', padding: '12px 14px', color: '#fff', fontSize: '14px', outline: 'none'
                    }}
                    required
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Password</label>
                  <input
                    type="password"
                    placeholder="Enter password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    style={{
                      background: 'rgba(0, 0, 0, 0.2)', border: '1px solid var(--border-glass)',
                      borderRadius: '8px', padding: '12px 14px', color: '#fff', fontSize: '14px', outline: 'none'
                    }}
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: '100%', padding: '12px', fontWeight: 'bold', marginTop: '10px' }}
                >
                  🔑 Secure Log In
                </button>
              </form>
            )}

            {/* Tab 3: Email & Password Signup */}
            {authTab === 'register' && (
              <form onSubmit={handleRegisterSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Email Address</label>
                  <input
                    type="email"
                    placeholder="Enter email address"
                    value={registerUsername}
                    onChange={(e) => setRegisterUsername(e.target.value)}
                    style={{
                      background: 'rgba(0, 0, 0, 0.2)', border: '1px solid var(--border-glass)',
                      borderRadius: '8px', padding: '12px 14px', color: '#fff', fontSize: '14px', outline: 'none'
                    }}
                    required
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Password</label>
                  <input
                    type="password"
                    placeholder="Choose secure password"
                    value={registerPassword}
                    onChange={(e) => setRegisterPassword(e.target.value)}
                    style={{
                      background: 'rgba(0, 0, 0, 0.2)', border: '1px solid var(--border-glass)',
                      borderRadius: '8px', padding: '12px 14px', color: '#fff', fontSize: '14px', outline: 'none'
                    }}
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: '100%', padding: '12px', fontWeight: 'bold', marginTop: '10px' }}
                >
                  🚀 Register Account
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Backend connection failure banner */}
      {!backendConnected && (
        <div className="connection-error-banner pulse glow-enemy">
          ⚠️ Cannot connect to backend server. Please verify Django is running at http://localhost:8000/
          <button className="btn btn-sm btn-primary" onClick={loadCatalogs} style={{ marginLeft: '15px' }}>
            Retry
          </button>
        </div>
      )}

      {/* Header */}
      <header className="app-header glass-panel">
        <div className="logo-section" style={{ cursor: 'pointer' }} onClick={() => navigate('/')}>
          <h1>BRAWL STATS</h1>
          <p className="subtitle">Game Hub & Analytics</p>
        </div>

        <nav className="global-navbar">
          <button 
            className={`nav-link ${location.pathname === '/' || (location.pathname.startsWith('/stats') && !location.pathname.startsWith('/stats/member') && !location.pathname.startsWith('/club')) ? 'active' : ''}`}
            onClick={() => navigate('/')}
          >
            📊 My Stats
          </button>
          <button 
            className={`nav-link ${location.pathname.startsWith('/club') || location.pathname.startsWith('/stats/member') ? 'active' : ''}`}
            onClick={() => navigate('/club')}
          >
            🛡️ My Club
          </button>
          <button 
            className={`nav-link ${location.pathname === '/forum' ? 'active' : ''}`}
            onClick={() => navigate('/forum')}
          >
            💬 Forum
          </button>
          <button 
            className={`nav-link ${location.pathname === '/battle-log' ? 'active' : ''}`}
            onClick={() => navigate('/battle-log')}
          >
            📜 Battle Log
          </button>
        </nav>

        <div className="header-actions-group" style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          <button 
            ref={filterBtnRef}
            className={`btn ${showGlobalFilters ? 'btn-filter-active' : ''}`}
            onClick={() => setShowGlobalFilters(!showGlobalFilters)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', padding: '6px 12px' }}
          >
            {showGlobalFilters ? '✕ Close Filters' : '🔍 Filters'}
          </button>
          <button 
            className="btn"
            onClick={() => setShowHomeMapBrowser(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', padding: '6px 12px' }}
          >
            🗺️ Browse Maps
          </button>
          <button 
            className="btn btn-primary"
            onClick={handleSyncHistory}
            disabled={syncingHistory}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', padding: '6px 12px' }}
          >
            {syncingHistory ? '⏳ Syncing...' : '🔄 Sync Battle Log'}
          </button>

          {/* Dynamic User Profile Selector */}
          <div className="profile-selector-menu">
            <button 
              className="btn btn-profile-trigger" 
              onClick={() => setShowProfileDropdown(!showProfileDropdown)}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px' }}
            >
              {me?.avatar_id ? (
                <img 
                  src={`https://cdn.brawlify.com/profile-icons/regular/${me.avatar_id}.png`} 
                  alt="" 
                  style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover', border: '1px solid rgba(0, 229, 255, 0.4)' }} 
                />
              ) : (
                <span>👤</span>
              )}
              <span>Player: <strong>{me?.name || currentUser.name}</strong> ▾</span>
            </button>
            
            {showProfileDropdown && (
              <div className="profile-dropdown-menu glass-panel">
                <div className="dropdown-title">Options</div>
                <button 
                  className="dropdown-item"
                  onClick={() => {
                    navigate('/');
                    setShowProfileDropdown(false);
                  }}
                >
                  👤 View Profile
                </button>
                <button 
                  className="dropdown-item"
                  onClick={() => {
                    navigate('/settings');
                    setShowProfileDropdown(false);
                  }}
                >
                  ⚙️ Settings
                </button>
                <div className="dropdown-divider"></div>
                <div className="dropdown-title">Session</div>
                <div style={{ padding: '8px 15px', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                  Logged in as <strong>{me?.name || currentUser.name}</strong>
                </div>
                <div className="dropdown-divider"></div>
                <button 
                  className="dropdown-item logout-btn"
                  onClick={handleLogout}
                >
                  🚪 Log Out
                </button>
              </div>
            )}
          </div>
        </div>
        {showGlobalFilters && <GlobalFilterBar minNormalTrophies={minNormalTrophies} containerRef={filterBarRef} />}
      </header>

      {/* Test / Dev Triggers (Hidden in UI, used for unit tests) */}
      <div style={{ display: 'none' }}>
        <button onClick={() => enterDraftMode('ranked')}>Competitive Draft (Ranked)</button>
        <button onClick={() => enterDraftMode('normal')}>Normal Draft (No Bans)</button>
        <button onClick={() => navigate('/')}>Stats Dashboard</button>
      </div>

      {/* Main Grid / Dashboard Hub */}
      <Routes>
        <Route path="/draft" element={
        <div className={`main-grid ${isLeftPanelCollapsed ? 'left-collapsed' : ''}`}>

        {/* Left Panel: History & Perceptions */}
        <section className={`left-panel glass-panel ${isLeftPanelCollapsed ? 'collapsed' : ''}`}>
          <button 
            type="button" 
            className="collapse-panel-btn"
            onClick={() => setIsLeftPanelCollapsed(!isLeftPanelCollapsed)}
            title={isLeftPanelCollapsed ? "Expand panel" : "Collapse panel"}
          >
            {isLeftPanelCollapsed ? "▶" : "◀"}
          </button>

          {!isLeftPanelCollapsed && (
            <>
              <h2>Player Performance {selectedMap ? `(${selectedMap.name})` : ''}</h2>

              <div className="stats-summary">
                <div className="stat-card">
                  <span className="stat-num">{displayedMatches.length}</span>
                  <span className="stat-lbl">Matches</span>
                </div>
                <div className="stat-card">
                  <span className="stat-num">
                    {displayedMatches.length > 0
                      ? `${Math.round((displayedMatches.filter(m => m.result === 'victory').length / displayedMatches.length) * 100)}%`
                      : 'N/A'
                    }
                  </span>
                  <span className="stat-lbl">Win Rate</span>
                </div>
              </div>

              <div className="history-section">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <h3 style={{ margin: 0 }}>Recent Matches</h3>
                </div>
                <div className="match-list">
                  {displayedMatches.slice(0, 5).map((m) => (
                    <div key={m.id} style={{ display: 'flex', flexDirection: 'column', marginBottom: '6px' }}>
                      <div className={`match-item ${m.result === 'victory' ? 'win' : 'loss'}`} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', fontSize: '11px', borderRadius: '6px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-glass)' }}>
                        <MatchTeamsBanner 
                          match={m} 
                          brawlers={brawlers} 
                          onBrawlerClick={(brawlerId) => {
                            setSelectedProfileBrawlerId(brawlerId);
                            navigate(`/stats/brawler/${brawlerId}`);
                          }}
                        />
                        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span 
                              className="map-name" 
                              onClick={() => {
                                setSelectedMapId(m.map_id);
                                navigate(`/stats/map/${m.map_id}`);
                              }}
                              onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
                              onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
                              style={{ fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--color-text)', cursor: 'pointer' }}
                            >
                              {getMapName(allMaps, m.map_id)}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: 'var(--color-text-muted)' }}>
                            <span 
                              onClick={() => {
                                setSelectedMode(m.mode);
                                navigate(`/stats/mode/${m.mode}`);
                              }}
                              onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
                              onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
                              style={{ textTransform: 'capitalize', cursor: 'pointer' }}
                            >
                              {getModeIcon(m.mode)} {m.mode}
                            </span>
                            <span>•</span>
                            <span 
                              onClick={() => {
                                setSelectedProfileBrawlerId(m.my_brawler_id);
                                navigate(`/stats/brawler/${m.my_brawler_id}`);
                              }}
                              onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
                              onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
                              style={{ cursor: 'pointer' }}
                            >
                              {getBrawlerName(brawlers, m.my_brawler_id)}
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {!m.api_match_id && (
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (confirm("Do you want to link this match with your latest unlinked game from the Brawl Stars API?")) {
                                  try {
                                    await api.linkMatchAPI(m.id);
                                    triggerAlert("Link Successful", "Match linked successfully with Brawl Stars API match ID!", "success");
                                    loadUserStats();
                                  } catch (err) {
                                    triggerAlert("Link Failed", err.message || "Failed to link match with API.", "error");
                                  }
                                }
                              }}
                              style={{
                                background: 'rgba(0, 229, 255, 0.1)',
                                border: '1px solid rgba(0, 229, 255, 0.3)',
                                color: 'var(--color-ally)',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                padding: '2px 6px',
                                fontSize: '9px',
                                fontWeight: '600',
                                transition: 'all 0.2s'
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0, 229, 255, 0.2)'}
                              onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(0, 229, 255, 0.1)'}
                              title="Link this match with the official Brawl Stars API game ID"
                            >
                              🔗 Link API
                            </button>
                          )}
                          <span className="result-badge" style={{ fontSize: '9px', fontWeight: 'bold', padding: '2px 6px', borderRadius: '4px', background: m.result === 'victory' ? 'rgba(0,229,255,0.15)' : 'rgba(255,0,127,0.15)', color: m.result === 'victory' ? 'var(--color-ally)' : 'var(--color-enemy)' }}>
                            {m.result === 'victory' ? 'WIN' : 'LOSS'}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {displayedMatches.length === 0 && <p className="empty-msg">No matches logged yet.</p>}
                </div>
              </div>

              <div className="perceptions-section">
                <h3>Matchup Comforts</h3>
                <div className="perception-list">
                  {displayedPerceptions.slice(0, 5).map((p) => (
                    <div key={p.id} className="perception-item">
                      <span className="my-b">{getBrawlerName(brawlers, p.my_brawler_id)}</span>
                      <span className="vs-lbl">vs</span>
                      <span className="rival-b">{getBrawlerName(brawlers, p.brawler_rival_id)}</span>
                      <span className={`rating-badge val-${p.value}`}>
                        {p.value === 1 && 'Easy'}
                        {p.value === 0 && 'Neutral'}
                        {p.value === -1 && 'Hard'}
                        {p.value === -2 && 'Counter'}
                      </span>
                    </div>
                  ))}
                  {displayedPerceptions.length === 0 && <p className="empty-msg">No matchup comforts found.</p>}
                </div>
              </div>
            </>
          )}
        </section>

        {/* Center Panel: Interactive Draft Lobby */}
        <section className="center-panel">
          {editingMatchId && (
            <div 
              style={{
                background: 'rgba(255, 152, 0, 0.15)',
                border: '1px solid #ff9800',
                borderRadius: '8px',
                padding: '10px 16px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                color: '#fff',
                fontSize: '12px',
                fontWeight: '600'
              }}
            >
              <span>⚠️ Editing Match #{editingMatchId}. Modify details below and click Save.</span>
              <button
                className="btn btn-sm btn-danger"
                onClick={() => {
                  setEditingMatchId(null);
                  resetDraft();
                }}
                style={{ marginLeft: '12px', padding: '3px 8px', fontSize: '11px' }}
              >
                Exit Edit Mode
              </button>
            </div>
          )}

          {/* Map Select */}
          <div className="map-selector-bar glass-panel">
            <label>Map:</label>
            <button 
              type="button" 
              className="map-selector-btn"
              onClick={() => setShowMapModal(true)}
            >
              {selectedMap?.image_url && (
                <img 
                  src={selectedMap.image_url} 
                  alt={selectedMap.name} 
                  className="map-btn-thumb" 
                />
              )}
              <div className="map-btn-info">
                <span className="map-btn-name">{selectedMap?.name || 'Select a Map'}</span>
                <span className="map-btn-mode">{selectedMap?.mode || 'No mode'}</span>
              </div>
              <span className="map-btn-chevron">▼</span>
            </button>
          </div>

          {/* Coin Flip Selector / Indicator */}
          {draftType === 'ranked' && (
            <div className="coin-flip-bar glass-panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '15px', marginBottom: '15px', padding: '10px' }}>
              <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--color-text-muted)', letterSpacing: '0.5px' }}>FIRST PICK:</span>
              <button
                type="button"
                className={`btn-coin ${firstPickTeam === 'allies' ? 'active' : ''}`}
                onClick={() => handleFirstPickChange('allies')}
                style={{
                  padding: '5px 12px',
                  borderRadius: '6px',
                  border: '1px solid',
                  borderColor: firstPickTeam === 'allies' ? 'var(--color-ally)' : 'var(--border-glass)',
                  background: firstPickTeam === 'allies' ? 'rgba(0, 229, 255, 0.15)' : 'transparent',
                  color: firstPickTeam === 'allies' ? '#fff' : 'var(--color-text-muted)',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: '600',
                  transition: 'all 0.2s ease'
                }}
              >
                🔵 Blue Team (Allies)
              </button>
              <button
                type="button"
                className={`btn-coin ${firstPickTeam === 'enemies' ? 'active' : ''}`}
                onClick={() => handleFirstPickChange('enemies')}
                style={{
                  padding: '5px 12px',
                  borderRadius: '6px',
                  border: '1px solid',
                  borderColor: firstPickTeam === 'enemies' ? 'var(--color-enemy)' : 'var(--border-glass)',
                  background: firstPickTeam === 'enemies' ? 'rgba(255, 0, 127, 0.15)' : 'transparent',
                  color: firstPickTeam === 'enemies' ? '#fff' : 'var(--color-text-muted)',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: '600',
                  transition: 'all 0.2s ease'
                }}
              >
                🔴 Red Team (Enemies)
              </button>
              <button
                type="button"
                className={`btn-coin ${enableBans ? 'active' : ''}`}
                onClick={() => {
                  const newEnable = !enableBans;
                  setEnableBans(newEnable);
                  resetDraft(draftType, firstPickTeam, newEnable);
                }}
                style={{
                  padding: '5px 12px',
                  borderRadius: '6px',
                  border: '1px solid',
                  borderColor: enableBans ? 'var(--color-ally)' : 'var(--border-glass)',
                  background: enableBans ? 'rgba(0, 229, 255, 0.15)' : 'transparent',
                  color: enableBans ? '#fff' : 'var(--color-text-muted)',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: '600',
                  transition: 'all 0.2s ease',
                  marginLeft: '15px'
                }}
              >
                🚫 Bans: {enableBans ? 'ON' : 'OFF'}
              </button>
              <button
                type="button"
                className={`btn-coin ${enableTurns ? 'active' : ''}`}
                onClick={() => {
                  const newEnable = !enableTurns;
                  setEnableTurns(newEnable);
                  resetDraft(draftType, firstPickTeam, enableBans);
                }}
                style={{
                  padding: '5px 12px',
                  borderRadius: '6px',
                  border: '1px solid',
                  borderColor: enableTurns ? 'var(--color-ally)' : 'var(--border-glass)',
                  background: enableTurns ? 'rgba(0, 229, 255, 0.15)' : 'transparent',
                  color: enableTurns ? '#fff' : 'var(--color-text-muted)',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: '600',
                  transition: 'all 0.2s ease',
                  marginLeft: '10px'
                }}
              >
                🔄 Turns: {enableTurns ? 'ON' : 'OFF'}
              </button>
            </div>
          )}

          {/* Draft Selection HUD */}
          <div className="draft-hud glass-panel">
            <div className="allies-column">
              <h3>Blue Team (Allies)</h3>

              {draftType === 'ranked' && enableBans && (
                <div className="slots-row bans small-bans">
                  {draft.allies_banned.map((b, idx) => (
                    <div
                      key={`ally-ban-${idx}`}
                      className={`draft-slot ban-slot ${activeSlot.type === 'allies_banned' && activeSlot.index === idx ? 'active-slot glow-ally' : ''}`}
                      onClick={() => selectSlot('allies_banned', idx)}
                    >
                      {b ? (
                        <div className="filled-slot">
                          <img src={b.image_url} alt={b.name} className="banned-img" />
                          <button className="clear-btn" onClick={(e) => clearSlot('allies_banned', idx, e)}>×</button>
                        </div>
                      ) : (
                        <span className="slot-placeholder">BAN {idx + 1}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="slots-row picks">
                {draft.allies_picked.map((b, idx) => (
                  <div
                    key={`ally-pick-${idx}`}
                    className={`draft-slot pick-slot ${activeSlot.type === 'allies_picked' && activeSlot.index === idx ? 'active-slot glow-ally' : ''}`}
                    onClick={() => selectSlot('allies_picked', idx)}
                  >
                    {b ? (
                      <div className="filled-slot">
                        <img src={b.image_url} alt={b.name} />
                        <span className="slot-name">{b.name}</span>
                        <button className="clear-btn" onClick={(e) => clearSlot('allies_picked', idx, e)}>×</button>
                      </div>
                    ) : (
                      <span className="slot-placeholder">PICK {idx + 1}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="enemies-column">
              <h3>Red Team (Enemies)</h3>

              {draftType === 'ranked' && enableBans && (
                <div className="slots-row bans small-bans">
                  {draft.enemies_banned.map((b, idx) => (
                    <div
                      key={`enemy-ban-${idx}`}
                      className={`draft-slot ban-slot ${activeSlot.type === 'enemies_banned' && activeSlot.index === idx ? 'active-slot glow-enemy' : ''}`}
                      onClick={() => selectSlot('enemies_banned', idx)}
                    >
                      {b ? (
                        <div className="filled-slot">
                          <img src={b.image_url} alt={b.name} className="banned-img" />
                          <button className="clear-btn" onClick={(e) => clearSlot('enemies_banned', idx, e)}>×</button>
                        </div>
                      ) : (
                        <span className="slot-placeholder">BAN {idx + 1}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="slots-row picks">
                {draft.enemies_picked.map((b, idx) => (
                  <div
                    key={`enemy-pick-${idx}`}
                    className={`draft-slot pick-slot ${activeSlot.type === 'enemies_picked' && activeSlot.index === idx ? 'active-slot glow-enemy' : ''}`}
                    onClick={() => selectSlot('enemies_picked', idx)}
                  >
                    {b ? (
                      <div className="filled-slot">
                        <img src={b.image_url} alt={b.name} />
                        <span className="slot-name">{b.name}</span>
                        <button className="clear-btn" onClick={(e) => clearSlot('enemies_picked', idx, e)}>×</button>
                      </div>
                    ) : (
                      <span className="slot-placeholder">PICK {idx + 1}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Brawler Selector Grid */}
          <div className="brawler-selector-container glass-panel">
            <div className="filter-controls">
              <input
                type="text"
                placeholder="Search Brawler..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-input"
              />
              <div className="class-tabs">
                {brawlerClasses.map(cls => (
                  <button
                    key={cls}
                    className={`tab-btn ${selectedClass === cls ? 'active' : ''}`}
                    onClick={() => setSelectedClass(cls)}
                  >
                    {cls}
                  </button>
                ))}
              </div>
            </div>

            <div className="brawler-grid">
              {filteredBrawlers.map(b => {
                let isPicked = false;
                if (draftType === 'ranked') {
                  if (enableTurns) {
                    isPicked = [
                      ...draft.allies_picked,
                      ...draft.enemies_picked
                    ].some(p => p && p.id === b.id);
                  } else {
                    if (activeSlot.type === 'allies_picked') {
                      isPicked = draft.allies_picked.some(p => p && p.id === b.id);
                    } else if (activeSlot.type === 'enemies_picked') {
                      isPicked = draft.enemies_picked.some(p => p && p.id === b.id);
                    } else {
                      isPicked = [
                        ...draft.allies_picked,
                        ...draft.enemies_picked
                      ].some(p => p && p.id === b.id);
                    }
                  }
                }

                let isBanned = false;
                if (activeSlot.type === 'allies_banned') {
                  isBanned = draft.allies_banned.some(ban => ban && ban.id === b.id);
                } else if (activeSlot.type === 'enemies_banned') {
                  isBanned = draft.enemies_banned.some(ban => ban && ban.id === b.id);
                } else {
                  isBanned = [
                    ...draft.allies_banned,
                    ...draft.enemies_banned
                  ].some(ban => ban && ban.id === b.id);
                }

                return (
                  <div
                    key={b.id}
                    className={`brawler-card ${isBanned ? 'banned-card' : ''} ${isPicked ? 'picked-card' : ''}`}
                    onClick={() => placeBrawler(b)}
                  >
                    <img src={b.image_url} alt={b.name} />
                    <span className="brawler-name">{b.name}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="action-buttons-row">
            <button className="btn btn-danger" onClick={resetDraft}>Reset Draft</button>
            <button
              className="btn btn-secondary"
              onClick={() => triggerAlert("Draft Simulation Complete", "Play the match in Brawl Stars, then use 'Sync Battle Log' in the top bar to record your stats!", "success")}
              disabled={!draft.allies_picked.some(Boolean)}
              style={{ marginLeft: '10px' }}
            >
              Draft Complete
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => navigate('/')}
              style={{ marginLeft: '10px' }}
            >
              Exit Draft Tool
            </button>
          </div>
        </section>

        {/* Right Panel: Recommendations Suggestions */}
        <section className="right-panel glass-panel">
          <h2>Suggestions</h2>
          <p className="suggestions-meta">Powered by Bayesian Smoothing</p>

          <div style={{
            background: 'rgba(0, 0, 0, 0.2)',
            border: '1px solid var(--border-glass)',
            borderRadius: '8px',
            padding: '10px 14px',
            marginBottom: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', fontWeight: '800', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Matchup Trophy Threshold</span>
              <span style={{ fontSize: '13px', fontWeight: '800', color: 'var(--color-ally)' }}>{suggestionTrophyThreshold}🏆+</span>
            </div>
            <input 
              type="range" 
              min="0" 
              max="1250" 
              step="50"
              value={suggestionTrophyThreshold} 
              onChange={(e) => setSuggestionTrophyThreshold(parseInt(e.target.value))}
              style={{
                accentColor: 'var(--color-ally)',
                background: 'rgba(255,255,255,0.1)',
                height: '4px',
                borderRadius: '2px',
                outline: 'none',
                cursor: 'pointer',
                width: '100%'
              }}
            />
            <span style={{ fontSize: '9px', color: 'var(--color-text-muted)', lineHeight: '1.3' }}>
              Only analyzes normal matches played at/above this trophy level. (Ranked games always pass).
            </span>
          </div>

          <div className="suggestions-list">
            {suggestions.map((item, index) => (
              <div
                key={item.brawler.id}
                className={`suggestion-card ${index < 3 ? 'top-pick glow-gold' : ''}`}
              >
                <div className="suggestion-rank">#{index + 1}</div>
                <img src={item.brawler.image_url} alt={item.brawler.name} className="sug-img" />

                <div className="suggestion-details">
                  <span className="sug-name">{item.brawler.name}</span>
                  <span className="sug-class">{item.brawler.class_name}</span>
                </div>

                <div className="suggestion-score-container">
                  <span className="sug-score">{item.score.toFixed(3)}</span>
                  <div className="tooltip-breakdown">
                    <p><strong>Breakdown:</strong></p>
                    <p>A (Win rate): {item.components.A_adjusted_win_rate}</p>
                    <p>B (Matchup): {item.components.B_matchup_factor}</p>
                    <p>C (Synergy): {item.components.C_synergy_factor}</p>
                    <p>D (Meta): {item.components.D_meta_relevance}</p>
                    <p>E (Confidence): {item.components.E_confidence_penalty}</p>
                  </div>
                </div>
              </div>
            ))}

            {suggestions.length === 0 && (
              <div className="suggestions-placeholder">
                <div className="pulse">💡</div>
                <p>Select a Map and assign picks/bans to load suggestions in real time.</p>
              </div>
            )}
          </div>
        </section>
      </div>
        } />
        <Route path="/settings" element={
          <div className="settings-page-container" style={{ display: 'flex', flexDirection: 'column', gap: '30px', padding: '30px 20px', maxWidth: '1200px', margin: '0 auto' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '30px', justifyContent: 'center', alignItems: 'flex-start' }}>
              
              {/* Player Profile Settings Card */}
              <div className="welcome-card glass-panel" style={{ flex: '1 1 450px', maxWidth: '500px', margin: '0', textAlign: 'left' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '25px' }}>
                  {me?.avatar_id ? (
                    <img 
                      src={`https://cdn.brawlify.com/profile-icons/regular/${me.avatar_id}.png`} 
                      alt="" 
                      style={{ width: '56px', height: '56px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--color-ally)' }} 
                    />
                  ) : (
                    <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', border: '1px solid var(--border-glass)' }}>👤</div>
                  )}
                  <div>
                    <h2 style={{ fontSize: '24px', fontWeight: '800', margin: 0, color: '#fff' }}>⚙️ Player Profile</h2>
                    <p className="welcome-subtitle" style={{ color: 'var(--color-text-muted)', fontSize: '13px', margin: '4px 0 0 0' }}>Configure your Brawl Stats profile settings</p>
                  </div>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '12px', fontWeight: '800', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Display Name</label>
                    <input 
                      type="text" 
                      value={profileName} 
                      onChange={(e) => setProfileName(e.target.value)}
                      style={{
                        background: 'rgba(0, 0, 0, 0.25)',
                        border: '1px solid var(--border-glass)',
                        borderRadius: '8px',
                        padding: '12px 14px',
                        color: '#fff',
                        fontSize: '14px',
                        outline: 'none',
                        transition: 'border-color 0.2s'
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '12px', fontWeight: '800', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Player Tag</label>
                    <input 
                      type="text" 
                      placeholder="e.g. #9QY8Q98" 
                      value={profileTag} 
                      onChange={(e) => setProfileTag(e.target.value)}
                      style={{
                        background: 'rgba(0, 0, 0, 0.25)',
                        border: '1px solid var(--border-glass)',
                        borderRadius: '8px',
                        padding: '12px 14px',
                        color: '#fff',
                        fontSize: '14px',
                        outline: 'none',
                        transition: 'border-color 0.2s'
                      }}
                    />
                    <small style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px', lineHeight: '1.4' }}>
                      This tag will be used to automatically ingest your battles from the official Brawl Stars API.
                    </small>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label style={{ fontSize: '12px', fontWeight: '800', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Min Ingest Trophies (Normal Matches)</label>
                      <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--color-ally)' }}>{minNormalTrophies} 🏆</span>
                    </div>
                    <input 
                      type="range" 
                      min="0" 
                      max="1250" 
                      step="50"
                      value={minNormalTrophies} 
                      onChange={(e) => setMinNormalTrophies(parseInt(e.target.value))}
                      style={{
                        accentColor: 'var(--color-ally)',
                        background: 'rgba(0, 0, 0, 0.25)',
                        height: '6px',
                        borderRadius: '3px',
                        outline: 'none',
                        cursor: 'pointer'
                      }}
                    />
                    <small style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px', lineHeight: '1.4' }}>
                      Normal matches will only be auto-imported if your brawler has at least this many trophies (unless you already played a ranked match with that brawler).
                    </small>
                  </div>

                  {profileError && (
                    <div style={{ color: 'var(--color-enemy)', fontSize: '13px', fontWeight: '700', padding: '10px', background: 'rgba(255, 0, 127, 0.1)', borderRadius: '6px', border: '1px solid rgba(255, 0, 127, 0.2)' }}>
                      ❌ {profileError}
                    </div>
                  )}
                  {profileSuccess && (
                    <div style={{ color: 'var(--color-ally)', fontSize: '13px', fontWeight: '700', padding: '10px', background: 'rgba(0, 229, 255, 0.1)', borderRadius: '6px', border: '1px solid rgba(0, 229, 255, 0.2)' }}>
                      ✅ Settings saved successfully!
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
                    <button 
                      className="btn"
                      onClick={handleSaveProfile}
                      disabled={savingProfile}
                      style={{
                        flex: 1,
                        background: 'linear-gradient(135deg, var(--color-ally) 0%, #00838f 100%)',
                        border: 'none',
                        color: '#fff',
                        padding: '12px 20px',
                        fontSize: '13px',
                        fontWeight: '700',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        boxShadow: '0 4px 15px rgba(0, 229, 255, 0.2)'
                      }}
                    >
                      {savingProfile ? 'Saving...' : '💾 Save Settings'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Club Settings Component */}
              <div style={{ flex: '1 1 500px', maxWidth: '600px', width: '100%' }}>
                <ClubDashboard 
                  me={me} 
                  setMe={setMe}
                  brawlers={brawlers}
                  allMaps={allMaps}
                  brawlerMeta={brawlerMeta}
                  matches={matches}
                  setMatches={setMatches}
                  perceptions={perceptions}
                  handleSyncHistory={handleSyncHistory}
                  syncingHistory={syncingHistory}
                  minNormalTrophies={minNormalTrophies}
                  enterDraftMode={enterDraftMode}
                  view="settings"
                />
              </div>

            </div>
          </div>
        } />
        <Route path="/club" element={
          <ClubDashboard 
            me={me} 
            setMe={setMe} 
            brawlers={brawlers}
            allMaps={allMaps}
            brawlerMeta={brawlerMeta}
            matches={matches}
            setMatches={setMatches}
            perceptions={perceptions}
            handleSyncHistory={handleSyncHistory}
            syncingHistory={syncingHistory}
            minNormalTrophies={minNormalTrophies}
            enterDraftMode={enterDraftMode}
            view="stats"
          />
        } />
        <Route path="/club/roster" element={
          <ClubDashboard 
            me={me} 
            setMe={setMe} 
            brawlers={brawlers}
            allMaps={allMaps}
            brawlerMeta={brawlerMeta}
            matches={matches}
            setMatches={setMatches}
            perceptions={perceptions}
            handleSyncHistory={handleSyncHistory}
            syncingHistory={syncingHistory}
            minNormalTrophies={minNormalTrophies}
            enterDraftMode={enterDraftMode}
            view="roster"
          />
        } />
        <Route path="/forum" element={
          <ClubDashboard 
            me={me} 
            setMe={setMe} 
            brawlers={brawlers}
            allMaps={allMaps}
            brawlerMeta={brawlerMeta}
            matches={matches}
            setMatches={setMatches}
            perceptions={perceptions}
            handleSyncHistory={handleSyncHistory}
            syncingHistory={syncingHistory}
            minNormalTrophies={minNormalTrophies}
            enterDraftMode={enterDraftMode}
            view="forum"
          />
        } />
        <Route path="/stats" element={<Navigate to="/" replace />} />
        <Route path="/stats/brawler/:brawlerId" element={
        <BrawlerProfile
          brawlerId={selectedProfileBrawlerId}
          matches={matches}
          perceptions={perceptions}
          brawlers={brawlers}
          allMaps={allMaps}
          brawlerMeta={brawlerMeta}
          minNormalTrophies={minNormalTrophies}
          onBack={() => navigate(-1)}
          onBrawlerClick={(brawlerId) => {
            setSelectedProfileBrawlerId(brawlerId);
            navigate(`/stats/brawler/${brawlerId}`);
          }}
          onMapClick={(mapId) => {
            setSelectedMapId(mapId);
            navigate(`/stats/map/${mapId}`);
          }}
          onModeClick={(mode) => {
            setSelectedMode(mode);
            navigate(`/stats/mode/${mode}`);
          }}
        />
        } />
        <Route path="/stats/map/:mapId" element={
        <MapProfile
          mapId={selectedMapId}
          matches={matches}
          brawlers={brawlers}
          allMaps={allMaps}
          brawlerMeta={brawlerMeta}
          minNormalTrophies={minNormalTrophies}
          onBack={() => navigate(-1)}
          onBrawlerClick={(brawlerId) => {
            setSelectedProfileBrawlerId(brawlerId);
            navigate(`/stats/brawler/${brawlerId}`);
          }}
        />
        } />
        <Route path="/stats/mode/:modeName" element={
        <ModeProfile
          mode={selectedMode}
          matches={matches}
          brawlers={brawlers}
          allMaps={allMaps}
          brawlerMeta={brawlerMeta}
          minNormalTrophies={minNormalTrophies}
          onBack={() => navigate(-1)}
          onBrawlerClick={(brawlerId) => {
            setSelectedProfileBrawlerId(brawlerId);
            navigate(`/stats/brawler/${brawlerId}`);
          }}
          onMapClick={(mapId) => {
            setSelectedMapId(mapId);
            navigate(`/stats/map/${mapId}`);
          }}
        />
        } />
        <Route path="/" element={
          <div style={{ display: 'flex', flexDirection: 'column', gap: '30px', padding: '30px 20px', maxWidth: '1200px', margin: '0 auto' }}>
            <StatsDashboard
              playerName={me?.name || currentUser.name}
              playerAvatar={me?.avatar_id}
              playerTag={me?.player_tag}
              matches={matches}
              perceptions={perceptions}
              brawlers={brawlers}
              allMaps={allMaps}
              brawlerMeta={brawlerMeta}
              minNormalTrophies={minNormalTrophies}
              onClose={null}
              onBrowseMaps={() => setShowHomeMapBrowser(true)}
              onBrawlerClick={(brawlerId) => {
                setSelectedProfileBrawlerId(brawlerId);
                navigate(`/stats/brawler/${brawlerId}`);
              }}
              onMapClick={(mapId) => {
                setSelectedMapId(mapId);
                navigate(`/stats/map/${mapId}`);
              }}
              onModeClick={(mode) => {
                setSelectedMode(mode);
                navigate(`/stats/mode/${mode}`);
              }}
            />
          </div>
        } />
        <Route path="/battle-log" element={
          <div style={{ display: 'flex', flexDirection: 'column', gap: '30px', padding: '30px 20px', maxWidth: '1200px', margin: '0 auto' }}>
            <BattleLog
              matches={matches}
              brawlers={brawlers}
              allMaps={allMaps}
              isOwnProfile={true}
              handleSyncHistory={handleSyncHistory}
              syncingHistory={syncingHistory}
              onMatchesChange={setMatches}
              onBrawlerClick={(brawlerId) => {
                setSelectedProfileBrawlerId(brawlerId);
                navigate(`/stats/brawler/${brawlerId}`);
              }}
              onMapClick={(mapId) => {
                setSelectedMapId(mapId);
                navigate(`/stats/map/${mapId}`);
              }}
              onModeClick={(mode) => {
                setSelectedMode(mode);
                navigate(`/stats/mode/${mode}`);
              }}
            />
          </div>
        } />
        <Route path="/stats/member/:memberId" element={
          <MemberStatsView
            brawlers={brawlers}
            allMaps={allMaps}
            brawlerMeta={brawlerMeta}
            minNormalTrophies={minNormalTrophies}
            setSelectedProfileBrawlerId={setSelectedProfileBrawlerId}
            setSelectedMapId={setSelectedMapId}
            setSelectedMode={setSelectedMode}
          />
        } />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <MapSelectorModal
        isOpen={showMapModal}
        maps={maps}
        selectedMap={selectedMap}
        onSelectMap={(m) => {
          setSelectedMap(m);
          setShowMapModal(false);
        }}
        onClose={() => setShowMapModal(false)}
      />

      <MapSelectorModal
        isOpen={showHomeMapBrowser}
        maps={allMaps.filter(m => ['Gem Grab', 'Brawl Ball', 'Heist', 'Hot Zone', 'Knockout', 'Bounty'].includes(m.mode))}
        selectedMap={null}
        onSelectMap={(m) => {
          setShowHomeMapBrowser(false);
          setSelectedMapId(m.id);
          navigate(`/stats/map/${m.id}`);
        }}
        onClose={() => setShowHomeMapBrowser(false)}
      />



      <AlertModal
        isOpen={modalAlert.isOpen}
        type={modalAlert.type}
        title={modalAlert.title}
        message={modalAlert.message}
        onClose={handleCloseAlert}
      />
    </div>
  );
}

function MemberStatsView({ brawlers, allMaps, brawlerMeta, minNormalTrophies, setSelectedProfileBrawlerId, setSelectedMapId, setSelectedMode }) {
  const { memberId } = useParams();
  const navigate = useNavigate();
  const [memberProfile, setMemberProfile] = useState(null);
  const [memberMatches, setMemberMatches] = useState([]);
  const [memberPerceptions, setMemberPerceptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    const fetchMemberData = async () => {
      setLoading(true);
      setError(null);
      try {
        const profile = await api.fetchPlayerDetails(memberId);
        const [matchHistory, perceptionList] = await Promise.all([
          api.fetchMatches(profile.id),
          api.fetchPerceptions(profile.id)
        ]);
        if (active) {
          setMemberProfile(profile);
          setMemberMatches(matchHistory);
          setMemberPerceptions(perceptionList);
          setLoading(false);
        }
      } catch (err) {
        if (active) {
          console.error("Error loading member data:", err);
          setError(err.message || "Failed to load member statistics.");
          setLoading(false);
        }
      }
    };

    fetchMemberData();
    return () => {
      active = false;
    };
  }, [memberId]);

  if (loading) {
    return (
      <div className="empty-state" style={{ padding: '60px 20px', textAlign: 'center' }}>
        <div className="spinner" style={{ margin: '0 auto 20px auto', width: '40px', height: '40px', border: '4px solid rgba(255,255,255,0.1)', borderTopColor: '#00f6ff', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
        <p>Loading member statistics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="empty-state" style={{ padding: '60px 20px', textAlign: 'center' }}>
        <p style={{ color: '#ff4d4d', marginBottom: '15px' }}>❌ {error}</p>
        <button className="btn btn-secondary" onClick={() => navigate('/club')}>Back to Club</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '30px', padding: '30px 20px', maxWidth: '1200px', margin: '0 auto' }}>
      <StatsDashboard
        playerName={memberProfile?.name}
        playerAvatar={memberProfile?.avatar_id}
        playerTag={memberProfile?.player_tag}
        matches={memberMatches}
        perceptions={memberPerceptions}
        brawlers={brawlers}
        allMaps={allMaps}
        brawlerMeta={brawlerMeta}
        minNormalTrophies={minNormalTrophies}
        onClose={null}
        onBrowseMaps={null}
        isOwnProfile={false}
        onBrawlerClick={(brawlerId) => {
          setSelectedProfileBrawlerId(brawlerId);
          navigate(`/stats/brawler/${brawlerId}`);
        }}
        onMapClick={(mapId) => {
          setSelectedMapId(mapId);
          navigate(`/stats/map/${mapId}`);
        }}
        onModeClick={(mode) => {
          setSelectedMode(mode);
          navigate(`/stats/mode/${mode}`);
        }}
      />
    </div>
  );
}

export default App;
