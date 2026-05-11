import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { createNexus, getMyNexuses } from '../services/api';
import '../styles/Game.css';
import { Nexus, NexusGroup } from '../types/game';
import Admin from './Admin';
import Dashboard from './Dashboard';
import Map from './Map';
import Market from './Market';
import NexusSidebar from './NexusSidebar';
import NexusView from './NexusView';
import NotificationSettings from './NotificationSettings';
import Reports from './Reports';

const Game: React.FC = () => {
  const [nexuses, setVillages] = useState<Nexus[]>([]);
  const [selectedNexus, setSelectedNexus] = useState<Nexus | null>(null);
  const [view, setView] = useState<'dashboard' | 'nexus' | 'map' | 'reports' | 'market' | 'admin' | 'settings'>('dashboard');
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<NexusGroup[]>([]);
  const mainRef = useRef<HTMLElement>(null);
  const { user, logout } = useAuth();

  const loadVillages = useCallback(async () => {
    try {
      const response = await getMyNexuses();
      setVillages(response.data);

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
    const interval = setInterval(loadVillages, 30000);
    return () => clearInterval(interval);
  }, [loadVillages]);

  const handleSelectNexus = (nexus: Nexus) => {
    setSelectedNexus(nexus);
    setView('nexus');
    mainRef.current?.scrollTo({ top: 0 });
  };

  const handleViewChange = (newView: 'dashboard' | 'nexus' | 'map' | 'reports' | 'market' | 'admin' | 'settings') => {
    if (view === 'admin' && newView !== 'admin') {
      loadVillages();
    }
    setView(newView);
    mainRef.current?.scrollTo({ top: 0 });
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
      </div>
    );
  }

  return (
    <div className="game-container">
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
          <button
            className={`nav-btn ${view === 'settings' ? 'active' : ''}`}
            onClick={() => handleViewChange('settings')}
            title="Notification Settings"
          >
            🔔
          </button>
          <button onClick={logout} className="logout-btn">
            Logout
          </button>
        </div>
      </header>

      <div className="game-content">
        <NexusSidebar
          nexuses={nexuses}
          selectedNexusId={selectedNexus ? String(selectedNexus._id) : null}
          onSelectNexus={handleSelectNexus}
          onGroupsChange={setGroups}
        />

        <main className="main-content" ref={mainRef}>
          {view === 'dashboard' && (
            <Dashboard
              nexuses={nexuses}
              groups={groups}
              onSelectNexus={handleSelectNexus}
            />
          )}
          {view === 'nexus' && selectedNexus && <NexusView nexus={selectedNexus} onUpdate={loadVillages} />}
          {view === 'map' && selectedNexus && <Map currentNexus={selectedNexus} onRefresh={loadVillages} />}
          {view === 'reports' && selectedNexus && <Reports nexus={selectedNexus} />}
          {view === 'market' && <Market nexuses={nexuses} onRefresh={loadVillages} />}
          {view === 'admin' && <Admin />}
          {view === 'settings' && (
            <div className="settings-view">
              <h2 className="settings-heading">Settings</h2>
              <NotificationSettings />
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default Game;
