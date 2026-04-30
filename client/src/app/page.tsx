'use client';

import AdBanner from '@/components/AdBanner';
import Dashboard from '@/components/Dashboard';
import { useAuth } from '@/context/AuthContext';
import { createNexus, getMyNexuses } from '@/services/api';
import '@/styles/Game.css';
import { Nexus } from '@/types/game';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

export default function Home() {
  const [nexuses, setVillages] = useState<Nexus[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, logout } = useAuth();
  const router = useRouter();

  const loadVillages = useCallback(async () => {
    try {
      const response = await getMyNexuses();
      setVillages(response.data);
      setLoading(false);
    } catch (err) {
      console.error('Error loading nexuses:', err);
      const token = localStorage.getItem('token');
      if (!token) {
        router.push('/auth');
      }
      setLoading(false);
    }
  }, [router]);

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
    router.push(`/nexus/${nexus._id}`);
  };

  const handleCreateNexus = async () => {
    try {
      await createNexus();
      await loadVillages();
    } catch (err) {
      console.error('Error creating nexus:', err);
      alert('Failed to create nexus');
    }
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (nexuses.length === 0) {
    return (
      <div className="game-container">
        <AdBanner slot="1234567890" className="ad-banner-top" />
        <header className="game-header">
          <div className="header-left">
            <h1>Neon Dominion</h1>
            <span className="username">Welcome, {user?.username}</span>
          </div>
          <div className="header-right">
            <button onClick={logout} className="logout-btn">
              Logout
            </button>
          </div>
        </header>

        <main className="game-main">
          <div className="no-nexuses">
            <h2>Welcome to Neon Dominion!</h2>
            <p>You don&apos;t have any nexuses yet. Let&apos;s create your first nexus to start your empire!</p>
            <button onClick={handleCreateNexus} className="create-nexus-btn">
              Create Your First Nexus
            </button>
          </div>
        </main>

        <AdBanner slot="0987654321" className="ad-banner-bottom" />
      </div>
    );
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
          <button className="nav-btn active" onClick={() => router.push('/')}>
            📊 Dashboard
          </button>
          <button className="nav-btn" onClick={() => router.push('/map')}>
            🗺️ Starfield
          </button>
          <button className="nav-btn" onClick={() => router.push('/reports')}>
            📜 Combat Logs
          </button>
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
            <div key={nexus._id} className="nexus-item" onClick={() => handleSelectNexus(nexus)}>
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
          <Dashboard nexuses={nexuses} onSelectNexus={handleSelectNexus} />
        </main>
      </div>

      <AdBanner slot="0987654321" className="ad-banner-bottom" />
    </div>
  );
}
