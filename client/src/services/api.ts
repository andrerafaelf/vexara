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

export const requestAlphaAccess = (email: string) =>
  apiRequest('/auth/alpha-signup', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });

export const getAlphaSignupCount = () => apiRequest('/auth/alpha-signup/count');

// Galaxies
export const getGalaxies = () => apiRequest('/galaxies');
export const getMyGalaxy = () => apiRequest('/galaxies/me');
export const selectGalaxy = (galaxyId: number | string) =>
  apiRequest(`/galaxies/${galaxyId}/select`, { method: 'POST' });
export const leaveGalaxy = (galaxyId: number | string) =>
  apiRequest(`/galaxies/${galaxyId}/leave`, { method: 'POST' });

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
