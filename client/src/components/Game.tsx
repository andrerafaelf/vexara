import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { createNexus, getMyNexuses } from '../services/api';
import '../styles/Game.css';
import { Nexus } from '../types/game';
import AdBanner from './AdBanner';
import Admin from './Admin';
import Dashboard from './Dashboard';
import Map from './Map';
import Market from './Market';
import NexusView from './NexusView';
import Reports from './Reports';

const Game: React.FC = () => {
  const [nexuses, setVillages] = useState<Nexus[]>([]);
  const [selectedNexus, setSelectedNexus] = useState<Nexus | null>(null);
  const [view, setView] = useState<'dashboard' | 'nexus' | 'map' | 'reports' | 'market' | 'admin'>('dashboard');
  const [loading, setLoading] = useState(true);
  const { user, logout } = useAuth();

  const loadVillages = useCallback(async () => {
    try {
      const response = await getMyNexuses();
      setVillages(response.data);

      // Update selected nexus with fresh data
      setSelectedNexus((prev) => {
        if (prev) {
          const updatedSelected = response.data.find((v: Nexus) => v._id === prev._id);
          return updatedSelected || prev;
        } else if (response.data.length > 0) {
          return response.data[0];
        }
        return null;
      });

      setLoading(false);
    } catch (err) {
      console.error('Error loading nexuses:', err);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadVillages();
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadVillages, 30000);
    return () => clearInterval(interval);
  }, [loadVillages]);

  const handleSelectNexus = (nexus: Nexus) => {
    setSelectedNexus(nexus);
    setView('nexus');
  };

  const handleViewChange = (newView: 'dashboard' | 'nexus' | 'map' | 'reports' | 'market' | 'admin') => {
    // Reload nexuses when navigating away from admin
    if (view === 'admin' && newView !== 'admin') {
      loadVillages();
    }
    setView(newView);
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

  // Show create nexus prompt if user has no nexuses
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
            <p>You don't have any nexuses yet. Let's create your first nexus to start your empire!</p>
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
      {/* Top Ad Banner */}
      <AdBanner slot="1234567890" className="ad-banner-top" />

      <header className="game-header">
        <div className="header-left">
          <h1>Neon Dominion</h1>
          <span className="username">Welcome, {user?.username}</span>
        </div>
        <div className="header-center">
          <button
            className={`nav-btn ${view === 'dashboard' ? 'active' : ''}`}
            onClick={() => handleViewChange('dashboard')}
          >
            📊 Dashboard
          </button>
          <button
            className={`nav-btn ${view === 'nexus' ? 'active' : ''}`}
            onClick={() => handleViewChange('nexus')}
            disabled={!selectedNexus}
          >
            🏛️ Nexus
          </button>
          <button
            className={`nav-btn ${view === 'map' ? 'active' : ''}`}
            onClick={() => handleViewChange('map')}
            disabled={!selectedNexus}
          >
            🗺️ Starfield
          </button>
          <button
            className={`nav-btn ${view === 'reports' ? 'active' : ''}`}
            onClick={() => handleViewChange('reports')}
            disabled={!selectedNexus}
          >
            📜 Combat Logs
          </button>
          <button
            className={`nav-btn ${view === 'market' ? 'active' : ''}`}
            onClick={() => handleViewChange('market')}
          >
            🏪 Market
          </button>
          <button className={`nav-btn ${view === 'admin' ? 'active' : ''}`} onClick={() => handleViewChange('admin')}>
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
              className={`nexus-item ${selectedNexus?._id === nexus._id ? 'active' : ''}`}
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
          {view === 'dashboard' && <Dashboard nexuses={nexuses} onSelectNexus={handleSelectNexus} />}
          {view === 'nexus' && selectedNexus && <NexusView nexus={selectedNexus} onUpdate={loadVillages} />}
          {view === 'map' && selectedNexus && <Map currentNexus={selectedNexus} onRefresh={loadVillages} />}
          {view === 'reports' && selectedNexus && <Reports nexus={selectedNexus} />}
          {view === 'market' && <Market nexuses={nexuses} onRefresh={loadVillages} />}
          {view === 'admin' && <Admin />}
        </main>
      </div>

      {/* Bottom Ad Banner */}
      <AdBanner slot="0987654321" className="ad-banner-bottom" />
    </div>
  );
};

export default Game;
