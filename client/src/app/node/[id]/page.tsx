'use client';

import AdBanner from '@/components/AdBanner';
import NodeView from '@/components/NodeView';
import { useAuth } from '@/context/AuthContext';
import { getMyVillages } from '@/services/api';
import '@/styles/Game.css';
import { Village } from '@/types/game';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

export default function NodePage() {
  const [villages, setVillages] = useState<Village[]>([]);
  const [selectedVillage, setSelectedVillage] = useState<Village | null>(null);
  const [loading, setLoading] = useState(true);
  const { user, logout } = useAuth();
  const router = useRouter();
  const params = useParams();
  const nodeId = params.id as string;

  const loadVillages = useCallback(async () => {
    try {
      const response = await getMyVillages();
      setVillages(response.data);
      const village = response.data.find((v: Village) => v._id === nodeId);
      setSelectedVillage(village || null);
      setLoading(false);
    } catch (err) {
      console.error('Error loading nodes:', err);
      setLoading(false);
    }
  }, [nodeId]);

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
    router.push(`/node/${village._id}`);
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (!selectedVillage) {
    return <div className="loading">Node not found</div>;
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
          <NodeView village={selectedVillage} onUpdate={loadVillages} />
        </main>
      </div>

      <AdBanner slot="0987654321" className="ad-banner-bottom" />
    </div>
  );
}
