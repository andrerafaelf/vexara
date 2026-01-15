const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

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

  const data = await response.json();

  if (!response.ok) {
    const error = new Error(data.error || 'Request failed');
    (error as any).response = { data };
    throw error;
  }

  return { data };
};

// Auth
export const register = (username: string, email: string, password: string) =>
  apiRequest('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, email, password }),
  });

export const login = (email: string, password: string) =>
  apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

// Villages
export const createVillage = (name?: string) =>
  apiRequest('/village/create', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });

export const getMyVillages = () => apiRequest('/village/my-villages');

export const getVillage = (villageId: string) => apiRequest(`/village/${villageId}`);

// Buildings
export const upgradeBuilding = (villageId: string, building: string) =>
  apiRequest('/building/upgrade', {
    method: 'POST',
    body: JSON.stringify({ villageId, building }),
  });

export const checkBuildQueue = (villageId: string) =>
  apiRequest('/building/check-queue', {
    method: 'POST',
    body: JSON.stringify({ villageId }),
  });

// Troops
export const trainTroops = (villageId: string, troopType: string, amount: number) =>
  apiRequest('/troop/train', {
    method: 'POST',
    body: JSON.stringify({ villageId, troopType, amount }),
  });

export const checkTrainingQueue = (villageId: string) =>
  apiRequest('/troop/check-queue', {
    method: 'POST',
    body: JSON.stringify({ villageId }),
  });

// Map
export const getMapArea = (x: number, y: number) => apiRequest(`/map/area/${x}/${y}`);

export const getVillageInfo = (villageId: string) => apiRequest(`/map/village/${villageId}`);

// Attacks
export const sendAttack = (fromVillageId: string, toVillageId: string, troops: any, type: string = 'attack') =>
  apiRequest('/attack/send', {
    method: 'POST',
    body: JSON.stringify({ fromVillageId, toVillageId, troops, type }),
  });

export const getIncomingAttacks = (villageId: string) => apiRequest(`/attack/incoming/${villageId}`);

export const getOutgoingAttacks = (villageId: string) => apiRequest(`/attack/outgoing/${villageId}`);

// Reports
export const getReports = (villageId: string) => apiRequest(`/report/reports/${villageId}`);
