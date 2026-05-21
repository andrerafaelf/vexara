const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

// Helper function to make API requests
const apiRequest = async (endpoint: string, options: RequestInit = {}) => {
  const token = localStorage.getItem('token');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const rawBody = await response.text();
  let data: any = {};
  if (rawBody) {
    try {
      data = JSON.parse(rawBody);
    } catch {
      data = { error: rawBody };
    }
  }

  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (typeof window !== 'undefined') {
        const here = window.location.pathname;
        if (here !== '/login' && here !== '/register') {
          window.location.href = '/login';
        }
      }
    }
    if (response.status === 409 && data?.code === 'no_active_galaxy' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('galaxy:needs-selection'));
    }
    const error = new Error(data.error || 'Request failed');
    (error as any).response = { data, status: response.status };
    throw error;
  }

  return { data };
};

// Auth
export const login = (username: string, password: string) =>
  apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });

export type Utm = { utm_source?: string; utm_medium?: string; utm_campaign?: string };

export const requestAlphaAccess = (email: string, utm?: Utm) =>
  apiRequest('/auth/alpha-signup', {
    method: 'POST',
    body: JSON.stringify({ email, ...(utm ?? {}) }),
  });

export const getAlphaSignupCount = () => apiRequest('/auth/alpha-signup/count');

export interface RegisterPayload {
  username: string;
  email: string;
  password: string;
  referralCode?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
}

export const register = (payload: RegisterPayload) =>
  apiRequest('/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const verifyEmail = (token: string) =>
  apiRequest('/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });

export const resendVerification = (email: string) =>
  apiRequest('/auth/resend-verification', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });

export const requestPasswordReset = (email: string) =>
  apiRequest('/auth/request-password-reset', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });

export const resetPassword = (token: string, newPassword: string) =>
  apiRequest('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, newPassword }),
  });

// Galaxies
export const getGalaxies = () => apiRequest('/galaxies');
export const getMyGalaxy = () => apiRequest('/galaxies/me');
export const selectGalaxy = (galaxyId: number | string) =>
  apiRequest(`/galaxies/${galaxyId}/select`, { method: 'POST' });
export const leaveGalaxy = (galaxyId: number | string) =>
  apiRequest(`/galaxies/${galaxyId}/leave`, { method: 'POST' });
export const getGalaxyWinResults = (galaxyId: number | string) =>
  apiRequest(`/galaxies/${galaxyId}/win-results`);

// Nexuses
export const createNexus = (name?: string) =>
  apiRequest('/nexus/create', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });

export const getMyNexuses = () => apiRequest('/nexus/my-nexuses');

export const getNexus = (nexusId: string) => apiRequest(`/nexus/${nexusId}`);

export const renameNexus = (nexusId: string, name: string) =>
  apiRequest(`/nexus/${nexusId}/name`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });

// Nexus groups
export const getNexusGroups = () => apiRequest('/nexus/groups');

export const createNexusGroup = (name: string) =>
  apiRequest('/nexus/groups', { method: 'POST', body: JSON.stringify({ name }) });

export const renameNexusGroup = (groupId: string, name: string) =>
  apiRequest(`/nexus/groups/${groupId}`, { method: 'PATCH', body: JSON.stringify({ name }) });

export const deleteNexusGroup = (groupId: string) =>
  apiRequest(`/nexus/groups/${groupId}`, { method: 'DELETE' });

export const setGroupNexuses = (groupId: string, nexusIds: string[]) =>
  apiRequest(`/nexus/groups/${groupId}/nexuses`, { method: 'PUT', body: JSON.stringify({ nexusIds }) });

export const transferResources = (fromNexusId: string, toNexusId: string, biomass: number, alloy: number, ore: number) =>
  apiRequest('/nexus/transfer-resources', {
    method: 'POST',
    body: JSON.stringify({ fromNexusId, toNexusId, biomass, alloy, ore }),
  });

// Buildings
export const upgradeBuilding = (nexusId: string, building: string) =>
  apiRequest('/building/upgrade', {
    method: 'POST',
    body: JSON.stringify({ nexusId, building }),
  });

export const checkBuildQueue = (nexusId: string) =>
  apiRequest('/building/check-queue', {
    method: 'POST',
    body: JSON.stringify({ nexusId }),
  });

export const cancelBuildQueueItem = (nexusId: string, index: number) =>
  apiRequest('/building/cancel-queue', {
    method: 'POST',
    body: JSON.stringify({ nexusId, index }),
  });

// Troops
export const trainTroops = (nexusId: string, troopType: string, amount: number) =>
  apiRequest('/troop/train', {
    method: 'POST',
    body: JSON.stringify({ nexusId, troopType, amount }),
  });

export const checkTrainingQueue = (nexusId: string) =>
  apiRequest('/troop/check-queue', {
    method: 'POST',
    body: JSON.stringify({ nexusId }),
  });

export const cancelTrainingQueueItem = (nexusId: string, index: number) =>
  apiRequest('/troop/cancel-queue', {
    method: 'POST',
    body: JSON.stringify({ nexusId, index }),
  });

// Map
export const getMapArea = (x: number, y: number) => apiRequest(`/map/area/${x}/${y}`);

export const getNexusInfo = (nexusId: string) => apiRequest(`/map/nexus/${nexusId}`);

// Attacks
export const sendAttack = (fromNexusId: string, toNexusId: string, troops: any, type: string = 'attack') =>
  apiRequest('/attack/send', {
    method: 'POST',
    body: JSON.stringify({ fromNexusId, toNexusId, troops, type }),
  });

export const getIncomingAttacks = (nexusId: string) => apiRequest(`/attack/incoming/${nexusId}`);

export const getOutgoingAttacks = (nexusId: string) => apiRequest(`/attack/outgoing/${nexusId}`);

// Troop transfers
export const sendTroops = (fromNexusId: string, toNexusId: string, troops: Record<string, number>) =>
  apiRequest('/troop-transfer/send', { method: 'POST', body: JSON.stringify({ fromNexusId, toNexusId, troops }) });

export const recallTroops = (transferId: string) =>
  apiRequest(`/troop-transfer/${transferId}/recall`, { method: 'POST' });

export const sendBackTroops = (transferId: string) =>
  apiRequest(`/troop-transfer/${transferId}/send-back`, { method: 'POST' });

export const getNexusTroopTransfers = (nexusId: string) =>
  apiRequest(`/troop-transfer/nexus/${nexusId}`);

// Reports
export const getReports = (nexusId: string) => apiRequest(`/report/reports/${nexusId}`);
export const markReportRead = (attackId: string) =>
  apiRequest(`/report/read/${attackId}`, { method: 'POST' });
export const markAllReportsRead = (nexusId: string) =>
  apiRequest(`/report/read-all/${nexusId}`, { method: 'POST' });
export const getReadReportIds = () => apiRequest('/report/read-ids');
export const getUnreadNexusIds = () => apiRequest('/report/unread-nexus-ids');

// Market
export const getMarketListings = () => apiRequest('/market');

export const createMarketListing = (
  nexusId: string,
  offerResource: string,
  offerAmount: number,
  wantResource: string,
  wantAmount: number,
) =>
  apiRequest('/market/list', {
    method: 'POST',
    body: JSON.stringify({ nexusId, offerResource, offerAmount, wantResource, wantAmount }),
  });

export const buyMarketListing = (listingId: number, buyerNexusId: string) =>
  apiRequest(`/market/buy/${listingId}`, {
    method: 'POST',
    body: JSON.stringify({ buyerNexusId }),
  });

export const cancelMarketListing = (listingId: number) => apiRequest(`/market/${listingId}`, { method: 'DELETE' });
export const getMarketHistory = () => apiRequest('/market/history');

// Factions
export const getMyFaction = () => apiRequest('/faction/my');
export const getFaction = (id: number) => apiRequest(`/faction/${id}`);
export const listFactionsInGalaxy = () => apiRequest('/faction/galaxy/list');
export const createFaction = (data: { name: string; tag: string; description?: string }) =>
  apiRequest('/faction', { method: 'POST', body: JSON.stringify(data) });
export const inviteToFaction = (factionId: number, username: string) =>
  apiRequest(`/faction/${factionId}/invite`, {
    method: 'POST',
    body: JSON.stringify({ username }),
  });
export const getMyFactionInvites = () => apiRequest('/faction/invites/list');
export const acceptFactionInvite = (inviteId: number) =>
  apiRequest(`/faction/invites/${inviteId}/accept`, { method: 'POST' });
export const declineFactionInvite = (inviteId: number) => apiRequest(`/faction/invites/${inviteId}`, { method: 'DELETE' });
export const kickFactionMember = (factionId: number, userId: number) =>
  apiRequest(`/faction/${factionId}/members/${userId}`, { method: 'DELETE' });
export const setFactionMemberRole = (factionId: number, userId: number, role: string) =>
  apiRequest(`/faction/${factionId}/members/${userId}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });
export const transferFactionLeader = (factionId: number, userId: number) =>
  apiRequest(`/faction/${factionId}/members/${userId}/transfer-leader`, { method: 'POST' });
export const leaveFaction = (factionId: number) => apiRequest(`/faction/${factionId}/leave`, { method: 'POST' });
export const disbandFaction = (factionId: number) => apiRequest(`/faction/${factionId}`, { method: 'DELETE' });
export const getFactionLeaderboard = () => apiRequest('/faction/leaderboard');
export const updateFactionMotd = (factionId: number, motd: string) =>
  apiRequest(`/faction/${factionId}/motd`, { method: 'PATCH', body: JSON.stringify({ motd }) });
export const getFactionChat = (factionId: number, before?: number) =>
  apiRequest(`/faction/${factionId}/chat${before ? `?before=${before}` : ''}`);
export const sendFactionMessage = (factionId: number, content: string) =>
  apiRequest(`/faction/${factionId}/chat`, { method: 'POST', body: JSON.stringify({ content }) });
export const getFactionEvents = (factionId: number, before?: number) =>
  apiRequest(`/faction/${factionId}/events${before ? `?before=${before}` : ''}`);
export const getFactionWars = (factionId: number) => apiRequest(`/faction/${factionId}/wars`);
export const declareWar = (factionId: number, targetFactionId: number) =>
  apiRequest(`/faction/${factionId}/wars/declare/${targetFactionId}`, { method: 'POST' });
export const acceptWar = (warId: number) => apiRequest(`/faction/wars/${warId}/accept`, { method: 'POST' });
export const declineWar = (warId: number) => apiRequest(`/faction/wars/${warId}/decline`, { method: 'POST' });
export const proposeCeasefire = (warId: number) => apiRequest(`/faction/wars/${warId}/ceasefire`, { method: 'POST' });
export const acceptCeasefire = (warId: number) => apiRequest(`/faction/wars/${warId}/ceasefire/accept`, { method: 'POST' });
export const declineCeasefire = (warId: number) => apiRequest(`/faction/wars/${warId}/ceasefire/decline`, { method: 'POST' });
export const requestToJoinFaction = (factionId: number, message?: string) =>
  apiRequest(`/faction/${factionId}/join-request`, { method: 'POST', body: JSON.stringify({ message }) });
export const cancelFactionJoinRequest = (factionId: number) =>
  apiRequest(`/faction/${factionId}/join-request`, { method: 'DELETE' });
export const getMyFactionJoinRequests = () => apiRequest('/faction/join-requests/my');
export const getFactionJoinRequests = (factionId: number) => apiRequest(`/faction/${factionId}/join-requests`);
export const approveJoinRequest = (factionId: number, requestId: number) =>
  apiRequest(`/faction/${factionId}/join-requests/${requestId}/approve`, { method: 'POST' });
export const declineJoinRequest = (factionId: number, requestId: number) =>
  apiRequest(`/faction/${factionId}/join-requests/${requestId}`, { method: 'DELETE' });

export const systemBuyResource = (
  nexusId: string,
  receiveResource: string,
  receiveAmount: number,
  payResource: string,
) =>
  apiRequest('/market/system/buy', {
    method: 'POST',
    body: JSON.stringify({ nexusId, receiveResource, receiveAmount, payResource }),
  });


// Friends
export const getFriends = () => apiRequest('/friends');
export const getFriendsBadges = () => apiRequest('/friends/badges');
export const getFriendRequests = () => apiRequest('/friends/requests');
export const sendFriendRequest = (username: string) =>
  apiRequest('/friends/request', { method: 'POST', body: JSON.stringify({ username }) });
export const acceptFriendRequest = (requestId: string) =>
  apiRequest(`/friends/request/${requestId}/accept`, { method: 'POST' });
export const declineFriendRequest = (requestId: string) =>
  apiRequest(`/friends/request/${requestId}/decline`, { method: 'POST' });
export const cancelFriendRequest = (requestId: string) =>
  apiRequest(`/friends/request/${requestId}/cancel`, { method: 'POST' });
export const removeFriend = (friendId: string) =>
  apiRequest(`/friends/${friendId}`, { method: 'DELETE' });

// Users (public profile)
export const getPublicProfile = (username: string) =>
  apiRequest(`/users/${encodeURIComponent(username)}/profile`);

// Stats
export const getUserStats = () => apiRequest('/stats/me');
export const getStatsTimeline = (days: number) => apiRequest(`/stats/timeline?days=${days}`);

// Chat
export const getConversations = () => apiRequest('/chat/conversations');
export const getChatUnreadCount = () => apiRequest('/chat/unread-count');
export const getChatMessages = (friendId: string, before?: string) =>
  apiRequest(`/chat/${friendId}/messages${before ? `?before=${before}` : ''}`);
export const sendChatMessage = (friendId: string, content: string) =>
  apiRequest(`/chat/${friendId}/messages`, { method: 'POST', body: JSON.stringify({ content }) });
export const markChatRead = (friendId: string) =>
  apiRequest(`/chat/${friendId}/read`, { method: 'POST' });

// Push Notifications
export const getVapidPublicKey = () => apiRequest('/notifications/vapid-public-key');

export const subscribePush = (subscription: PushSubscriptionJSON) =>
  apiRequest('/notifications/subscribe', {
    method: 'POST',
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      keys: subscription.keys,
    }),
  });

export const unsubscribePush = (endpoint: string) =>
  apiRequest('/notifications/subscribe', {
    method: 'DELETE',
    body: JSON.stringify({ endpoint }),
  });

export const getNotificationPreferences = () => apiRequest('/notifications/preferences');

export const updateNotificationPreferences = (prefs: Partial<Record<string, boolean>>) =>
  apiRequest('/notifications/preferences', {
    method: 'PATCH',
    body: JSON.stringify(prefs),
  });

export const getNotificationBadges = () => apiRequest('/notifications/badges');

// Referrals
export const getMyReferrals = () => apiRequest('/referral');
export const getMyPendingTokens = () => apiRequest('/referral/pending');
export const getMyReferralCode = () => apiRequest('/referral/my-code');
export const getMyReferrer = () => apiRequest('/referral/my-referrer');
export const redeemReferralToken = (
  tokenId: number,
  rewardType: 'building_instant' | 'troop_grant',
  nexusId: number,
  opts: { building?: string; troopType?: string },
) =>
  apiRequest(`/referral/tokens/${tokenId}/redeem`, {
    method: 'POST',
    body: JSON.stringify({ rewardType, nexusId, ...opts }),
  });
export const redeemMilestoneToken = (
  tokenId: number,
  rewardType: 'building_instant' | 'troop_grant',
  nexusId: number,
  opts: { building?: string; troopType?: string },
) =>
  apiRequest(`/referral/milestone-tokens/${tokenId}/redeem`, {
    method: 'POST',
    body: JSON.stringify({ rewardType, nexusId, ...opts }),
  });

// Nexus specialization
export const specializeNexus = (nexusId: string, nexusType: string) =>
  apiRequest(`/nexus/${nexusId}/specialize`, {
    method: 'POST',
    body: JSON.stringify({ nexusType }),
  });

// Espionage
export const sendSpyMission = (fromNexusId: string, toNexusId: string, type: 'sabotage' | 'embed', operatives: number, sabotageTarget?: string) =>
  apiRequest('/attack/spy', {
    method: 'POST',
    body: JSON.stringify({ fromNexusId, toNexusId, type, operatives, sabotageTarget }),
  });

export const getSpyMissions = (nexusId: string) =>
  apiRequest(`/attack/spy/missions/${nexusId}`);

export const getCompletedSpyMissions = (nexusId: string) =>
  apiRequest(`/attack/spy/missions/${nexusId}/completed`);

export const getSpyAssets = (nexusId: string) =>
  apiRequest(`/attack/spy/assets/${nexusId}`);

export const recallSpyAsset = (assetId: number) =>
  apiRequest(`/attack/spy/assets/${assetId}/recall`, { method: 'POST' });

export const getEmbedIntel = (assetId: number) =>
  apiRequest(`/attack/spy/assets/${assetId}/intel`);

// Galaxy events
export const getGalaxyEvents = () =>
  apiRequest('/map/events');

// Activity summary (While You Were Away)
export const getActivitySummary = (since?: string) =>
  apiRequest(`/report/summary${since ? `?since=${encodeURIComponent(since)}` : ''}`);

// War Room (real-time faction operation planning)
export const getWarRoomStarfield = () => apiRequest('/warroom/starfield');
export const listWarRoomOperations = () => apiRequest('/warroom/operations');
export const getWarRoomOperation = (operationId: number) => apiRequest(`/warroom/operations/${operationId}`);
export const createWarRoomOperation = (data: { name: string; targetNexusId: number; arrivalAt: string }) =>
  apiRequest('/warroom/operations', { method: 'POST', body: JSON.stringify(data) });
export const updateWarRoomOperation = (
  operationId: number,
  data: { name?: string; arrivalAt?: string; status?: 'planning' | 'locked' | 'cancelled' | 'completed' },
) =>
  apiRequest(`/warroom/operations/${operationId}`, { method: 'PATCH', body: JSON.stringify(data) });
export const deleteWarRoomOperation = (operationId: number) =>
  apiRequest(`/warroom/operations/${operationId}`, { method: 'DELETE' });
export const addWarRoomWave = (
  operationId: number,
  data: { label?: string; arrivalOffsetMs?: number; troops?: Record<string, number> },
) =>
  apiRequest(`/warroom/operations/${operationId}/waves`, { method: 'POST', body: JSON.stringify(data) });
export const updateWarRoomWave = (
  waveId: number,
  data: { label?: string; arrivalOffsetMs?: number; troops?: Record<string, number> },
) =>
  apiRequest(`/warroom/waves/${waveId}`, { method: 'PATCH', body: JSON.stringify(data) });
export const deleteWarRoomWave = (waveId: number) =>
  apiRequest(`/warroom/waves/${waveId}`, { method: 'DELETE' });
export const claimWarRoomSlot = (
  waveId: number,
  data: { fromNexusId: number; troops: Record<string, number>; note?: string },
) =>
  apiRequest(`/warroom/waves/${waveId}/slots`, { method: 'POST', body: JSON.stringify(data) });
export const releaseWarRoomSlot = (slotId: number) =>
  apiRequest(`/warroom/slots/${slotId}`, { method: 'DELETE' });
export const getWarRoomThread = (operationId: number, before?: number) =>
  apiRequest(`/warroom/operations/${operationId}/thread${before ? `?before=${before}` : ''}`);
export const postWarRoomThreadMessage = (operationId: number, content: string) =>
  apiRequest(`/warroom/operations/${operationId}/thread`, { method: 'POST', body: JSON.stringify({ content }) });

// Faction diplomacy
export const proposeTreaty = (factionId: number, targetFactionId: number, type: string, durationDays?: number) =>
  apiRequest(`/faction/${factionId}/treaties/propose`, {
    method: 'POST',
    body: JSON.stringify({ targetFactionId, type, durationDays }),
  });

export const acceptTreaty = (treatyId: number) =>
  apiRequest(`/faction/treaties/${treatyId}/accept`, { method: 'POST' });

export const cancelTreaty = (treatyId: number) =>
  apiRequest(`/faction/treaties/${treatyId}/cancel`, { method: 'POST' });

export const getActiveTreaties = (factionId: number) =>
  apiRequest(`/faction/${factionId}/treaties`);

export const getGalaxyDiplomacy = () =>
  apiRequest('/faction/diplomacy/galaxy');

// Diplomacy chat
export const getDiplomacyMessages = (treatyId: number, before?: number) =>
  apiRequest(`/faction/treaties/${treatyId}/chat${before ? `?before=${before}` : ''}`);

export const sendDiplomacyMessage = (treatyId: number, content: string) =>
  apiRequest(`/faction/treaties/${treatyId}/chat`, { method: 'POST', body: JSON.stringify({ content }) });

