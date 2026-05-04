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
      window.location.href = '/auth';
    }
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

// Nexuses
export const createNexus = (name?: string) =>
  apiRequest('/nexus/create', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });

export const getMyNexuses = () => apiRequest('/nexus/my-nexuses');

export const getNexus = (nexusId: string) => apiRequest(`/nexus/${nexusId}`);

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

// Reports
export const getReports = (nexusId: string) => apiRequest(`/report/reports/${nexusId}`);
