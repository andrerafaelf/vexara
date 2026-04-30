'use client';

import AdBanner from '@/components/AdBanner';
import Reports from '@/components/Reports';
import { useAuth } from '@/context/AuthContext';
import { getMyNexuses } from '@/services/api';
import '@/styles/Game.css';
import { Nexus } from '@/types/game';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

export default function ReportsPage() {
  const [nexuses, setVillages] = useState<Nexus[]>([]);
  const [selectedNexus, setSelectedNexus] = useState<Nexus | null>(null);
  const [loading, setLoading] = useState(true);
  const { user, logout } = useAuth();
  const router = useRouter();

  const loadVillages = useCallback(async () => {
    try {
      const response = await getMyNexuses();
      setVillages(response.data);
      if (!selectedNexus && response.data.length > 0) {
        setSelectedNexus(response.data[0]);
      }
      setLoading(false);
    } catch (err) {
      console.error('Error loading nexuses:', err);
      setLoading(false);
    }
  }, [selectedNexus]);

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

  const handleSelectNexus = (nexus: Nexus) => {
    setSelectedNexus(nexus);
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (!selectedNexus) {
    return <div className="loading">No nexuses available</div>;
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
        <nav className="nexus-nav">
          <h3>Your Nexuses</h3>
          {nexuses.map((nexus) => (
            <div
              key={nexus._id}
              className={`nexus-item ${selectedNexus._id === nexus._id ? 'active' : ''}`}
              onClick={() => handleSelectNexus(nexus)}
            >
              <div className="nexus-name">{nexus.name}</div>
              <div className="nexus-coords">
                ({nexus.x}|{nexus.y})
              </div>
              <div className="nexus-points">{nexus.points} inf</div>
              {nexus.buildQueue.length > 0 && <div className="nexus-badge">🏗️</div>}
              {nexus.trainingQueue.length > 0 && <div className="nexus-badge">🎖️</div>}
            </div>
          ))}
        </nav>

        <main className="main-content">
          <Reports nexus={selectedNexus} />
        </main>
      </div>

      <AdBanner slot="0987654321" className="ad-banner-bottom" />
    </div>
  );
}
