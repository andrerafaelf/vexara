import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { createVillage, getMyVillages } from '../services/api';
import '../styles/Game.css';
import { Village } from '../types/game';
import AdBanner from './AdBanner';
import Admin from './Admin';
import Dashboard from './Dashboard';
import Map from './Map';
import NodeView from './NodeView';
import Reports from './Reports';

const Game: React.FC = () => {
  const [villages, setVillages] = useState<Village[]>([]);
  const [selectedVillage, setSelectedVillage] = useState<Village | null>(null);
  const [view, setView] = useState<'dashboard' | 'village' | 'map' | 'reports' | 'admin'>('dashboard');
  const [loading, setLoading] = useState(true);
  const { user, logout } = useAuth();

  const loadVillages = useCallback(async () => {
    try {
      const response = await getMyVillages();
      setVillages(response.data);

      // Update selected village with fresh data
      setSelectedVillage((prev) => {
        if (prev) {
          const updatedSelected = response.data.find((v: Village) => v._id === prev._id);
          return updatedSelected || prev;
        } else if (response.data.length > 0) {
          return response.data[0];
        }
        return null;
      });

      setLoading(false);
    } catch (err) {
      console.error('Error loading villages:', err);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadVillages();
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadVillages, 30000);
    return () => clearInterval(interval);
  }, [loadVillages]);

  const handleSelectVillage = (village: Village) => {
    setSelectedVillage(village);
    setView('village');
  };

  const handleViewChange = (newView: 'dashboard' | 'village' | 'map' | 'reports' | 'admin') => {
    // Reload villages when navigating away from admin
    if (view === 'admin' && newView !== 'admin') {
      loadVillages();
    }
    setView(newView);
  };

  const handleCreateVillage = async () => {
    try {
      await createVillage();
      await loadVillages();
    } catch (err) {
      console.error('Error creating node:', err);
      alert('Failed to create node');
    }
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  // Show create village prompt if user has no villages
  if (villages.length === 0) {
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
          <div className="no-villages">
            <h2>Welcome to Neon Dominion!</h2>
            <p>You don't have any nodes yet. Let's create your first node to start your empire!</p>
            <button onClick={handleCreateVillage} className="create-village-btn">
              Create Your First Node
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
            className={`nav-btn ${view === 'village' ? 'active' : ''}`}
            onClick={() => handleViewChange('village')}
            disabled={!selectedVillage}
          >
            🏛️ Node
          </button>
          <button
            className={`nav-btn ${view === 'map' ? 'active' : ''}`}
            onClick={() => handleViewChange('map')}
            disabled={!selectedVillage}
          >
            🗺️ Starfield
          </button>
          <button
            className={`nav-btn ${view === 'reports' ? 'active' : ''}`}
            onClick={() => handleViewChange('reports')}
            disabled={!selectedVillage}
          >
            📜 Combat Logs
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
        <nav className="village-nav">
          <h3>Your Nodes</h3>
          {villages.map((village) => (
            <div
              key={village._id}
              className={`village-item ${selectedVillage?._id === village._id ? 'active' : ''}`}
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
          {view === 'dashboard' && <Dashboard villages={villages} onSelectVillage={handleSelectVillage} />}
          {view === 'village' && selectedVillage && <NodeView village={selectedVillage} onUpdate={loadVillages} />}
          {view === 'map' && selectedVillage && <Map currentVillage={selectedVillage} onRefresh={loadVillages} />}
          {view === 'reports' && selectedVillage && <Reports village={selectedVillage} />}
          {view === 'admin' && <Admin />}
        </main>
      </div>

      {/* Bottom Ad Banner */}
      <AdBanner slot="0987654321" className="ad-banner-bottom" />
    </div>
  );
};

export default Game;
