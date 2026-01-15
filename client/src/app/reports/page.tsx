'use client';

import AdBanner from '@/components/AdBanner';
import Reports from '@/components/Reports';
import { useAuth } from '@/context/AuthContext';
import { getMyVillages } from '@/services/api';
import '@/styles/Game.css';
import { Village } from '@/types/game';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

export default function ReportsPage() {
  const [villages, setVillages] = useState<Village[]>([]);
  const [selectedVillage, setSelectedVillage] = useState<Village | null>(null);
  const [loading, setLoading] = useState(true);
  const { user, logout } = useAuth();
  const router = useRouter();

  const loadVillages = useCallback(async () => {
    try {
      const response = await getMyVillages();
      setVillages(response.data);
      if (!selectedVillage && response.data.length > 0) {
        setSelectedVillage(response.data[0]);
      }
      setLoading(false);
    } catch (err) {
      console.error('Error loading nodes:', err);
      setLoading(false);
    }
  }, [selectedVillage]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/auth');
      return;
    }
    loadVillages();
    const interval = setInterval(loadVillages, 30000);
    return () => clearInterval(interval);
  }, [loadVillages, router]);

  const handleSelectVillage = (village: Village) => {
    setSelectedVillage(village);
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (!selectedVillage) {
    return <div className="loading">No nodes available</div>;
  }

  return (
    <div className="game-container">
      <AdBanner slot="1234567890" className="ad-banner-top" />

      <header className="game-header">
        <div className="header-left">
          <h1>Neon Dominion</h1>
          <span className="username">Welcome, {user?.username}</span>
        </div>
        <div className="header-center">
          <button className="nav-btn" onClick={() => router.push('/')}>
            📊 Dashboard
          </button>
          <button className="nav-btn" onClick={() => router.push('/map')}>
            🗺️ Starfield
          </button>
          <button className="nav-btn active">📜 Combat Logs</button>
          <button className="nav-btn" onClick={() => router.push('/admin')}>
            🛠️ Admin
          </button>
        </div>
        <div className="header-right">
          <button onClick={logout} className="logout-btn">
            Logout
          </button>
        </div>
      </header>

      <div className="game-content">
        <nav className="village-nav">
          <h3>Your Nodes</h3>
          {villages.map((village) => (
            <div
              key={village._id}
              className={`village-item ${selectedVillage._id === village._id ? 'active' : ''}`}
              onClick={() => handleSelectVillage(village)}
            >
              <div className="village-name">{village.name}</div>
              <div className="village-coords">
                ({village.x}|{village.y})
              </div>
              <div className="village-points">{village.points} inf</div>
              {village.buildQueue.length > 0 && <div className="village-badge">🏗️</div>}
              {village.trainingQueue.length > 0 && <div className="village-badge">🎖️</div>}
            </div>
          ))}
        </nav>

        <main className="main-content">
          <Reports village={selectedVillage} />
        </main>
      </div>

      <AdBanner slot="0987654321" className="ad-banner-bottom" />
    </div>
  );
}
