import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  createNexus,
  createNexusGroup,
  deleteNexusGroup,
  getMyNexuses,
  getNexusGroups,
  renameNexusGroup,
  setGroupNexuses,
} from '../services/api';
import '../styles/Game.css';
import { Nexus, NexusGroup } from '../types/game';
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
  const [groups, setGroups] = useState<NexusGroup[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [showGroupManager, setShowGroupManager] = useState(false);
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

  const loadGroups = useCallback(async () => {
    try {
      const response = await getNexusGroups();
      setGroups(response.data ?? []);
    } catch (err) {
      console.error('Error loading groups:', err);
    }
  }, []);

  useEffect(() => {
    loadVillages();
    loadGroups();
    const interval = setInterval(loadVillages, 30000);
    return () => clearInterval(interval);
  }, [loadVillages, loadGroups]);

  const handleSelectNexus = (nexus: Nexus) => {
    setSelectedNexus(nexus);
    setView('nexus');
    mainRef.current?.scrollTo({ top: 0 });
  };

  const handleViewChange = (newView: 'dashboard' | 'nexus' | 'map' | 'reports' | 'market' | 'admin') => {
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

  const visibleNexuses =
    activeGroupId !== null
      ? nexuses.filter((n) => groups.find((g) => g.id === activeGroupId)?.nexusIds.includes(n._id))
      : nexuses;

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
            <p>You don't have any nexuses yet. Let's create your first nexus to start your empire!</p>
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
          <button onClick={logout} className="logout-btn">
            Logout
          </button>
        </div>
      </header>

      <div className="game-content">
        <nav className="nexus-nav">
          <div className="nexus-nav-header">
            <h3>Your Nexuses</h3>
            {nexuses.length >= 5 && (
              <button className="group-manage-btn" onClick={() => setShowGroupManager(true)} title="Manage groups">
                ⚙
              </button>
            )}
          </div>

          {/* Group filter tabs — only shown when groups exist */}
          {groups.length > 0 && (
            <div className="nexus-group-tabs">
              <button
                className={`nexus-group-tab${activeGroupId === null ? ' active' : ''}`}
                onClick={() => setActiveGroupId(null)}
              >
                All
              </button>
              {groups.map((g) => (
                <button
                  key={g.id}
                  className={`nexus-group-tab${activeGroupId === g.id ? ' active' : ''}`}
                  onClick={() => setActiveGroupId(g.id)}
                >
                  {g.name}
                </button>
              ))}
            </div>
          )}

          {visibleNexuses.map((nexus) => (
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
        </main>
      </div>

      {showGroupManager && (
        <GroupManagerModal
          groups={groups}
          nexuses={nexuses}
          onClose={() => setShowGroupManager(false)}
          onGroupsChange={(updated) => setGroups(updated)}
        />
      )}
    </div>
  );
};

// ── Group Manager Modal ──────────────────────────────────────────────────────

interface GroupManagerModalProps {
  groups: NexusGroup[];
  nexuses: Nexus[];
  onClose: () => void;
  onGroupsChange: (groups: NexusGroup[]) => void;
}

const GroupManagerModal: React.FC<GroupManagerModalProps> = ({ groups, nexuses, onClose, onGroupsChange }) => {
  const [localGroups, setLocalGroups] = useState<NexusGroup[]>(groups);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(localGroups[0]?.id ?? null);
  const [saving, setSaving] = useState(false);

  const selectedGroup = localGroups.find((g) => g.id === selectedGroupId) ?? null;

  const handleCreate = async () => {
    const name = newGroupName.trim();
    if (!name) return;
    setSaving(true);
    try {
      const res = await createNexusGroup(name);
      setLocalGroups(res.data);
      onGroupsChange(res.data);
      setSelectedGroupId(res.data[res.data.length - 1]?.id ?? null);
      setNewGroupName('');
    } finally {
      setSaving(false);
    }
  };

  const handleRename = async (groupId: string) => {
    const name = editName.trim();
    if (!name) return;
    setSaving(true);
    try {
      const res = await renameNexusGroup(groupId, name);
      setLocalGroups(res.data);
      onGroupsChange(res.data);
      setEditingId(null);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (groupId: string) => {
    if (!confirm('Delete this group? Nexuses will not be affected.')) return;
    setSaving(true);
    try {
      const res = await deleteNexusGroup(groupId);
      setLocalGroups(res.data);
      onGroupsChange(res.data);
      setSelectedGroupId(res.data[0]?.id ?? null);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleNexus = async (nexusId: string) => {
    if (!selectedGroup) return;
    const already = selectedGroup.nexusIds.includes(nexusId);
    const newIds = already
      ? selectedGroup.nexusIds.filter((id) => id !== nexusId)
      : [...selectedGroup.nexusIds, nexusId];
    setSaving(true);
    try {
      const res = await setGroupNexuses(selectedGroup.id, newIds);
      setLocalGroups(res.data);
      onGroupsChange(res.data);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="group-modal-overlay" onClick={onClose}>
      <div className="group-modal" onClick={(e) => e.stopPropagation()}>
        <div className="group-modal-header">
          <h2>Manage Nexus Groups</h2>
          <button className="group-modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="group-modal-body">
          {/* Left: group list */}
          <div className="group-modal-left">
            <div className="group-list">
              {localGroups.map((g) => (
                <div
                  key={g.id}
                  className={`group-list-item${selectedGroupId === g.id ? ' active' : ''}`}
                  onClick={() => { setSelectedGroupId(g.id); setEditingId(null); }}
                >
                  {editingId === g.id ? (
                    <div className="group-edit-row" onClick={(e) => e.stopPropagation()}>
                      <input
                        className="group-name-input"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleRename(g.id); if (e.key === 'Escape') setEditingId(null); }}
                        autoFocus
                        maxLength={32}
                      />
                      <button className="group-save-btn" disabled={saving} onClick={() => handleRename(g.id)}>✓</button>
                      <button className="group-cancel-btn" onClick={() => setEditingId(null)}>✕</button>
                    </div>
                  ) : (
                    <>
                      <span className="group-list-name">{g.name}</span>
                      <span className="group-list-count">{g.nexusIds.length}</span>
                      <button className="group-edit-btn" onClick={(e) => { e.stopPropagation(); setEditingId(g.id); setEditName(g.name); }}>✏</button>
                      <button className="group-delete-btn" disabled={saving} onClick={(e) => { e.stopPropagation(); handleDelete(g.id); }}>🗑</button>
                    </>
                  )}
                </div>
              ))}
            </div>

            {/* Create new group */}
            {localGroups.length < 10 && (
              <div className="group-create-row">
                <input
                  className="group-name-input"
                  placeholder="New group name…"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
                  maxLength={32}
                />
                <button className="group-create-btn" disabled={saving || !newGroupName.trim()} onClick={handleCreate}>
                  + Add
                </button>
              </div>
            )}
          </div>

          {/* Right: nexus assignment */}
          <div className="group-modal-right">
            {selectedGroup ? (
              <>
                <h3 className="group-assign-title">Nexuses in "{selectedGroup.name}"</h3>
                <div className="group-nexus-list">
                  {nexuses.map((n) => {
                    const inGroup = selectedGroup.nexusIds.includes(n._id);
                    return (
                      <label key={n._id} className={`group-nexus-item${inGroup ? ' in-group' : ''}`}>
                        <input
                          type="checkbox"
                          checked={inGroup}
                          disabled={saving}
                          onChange={() => handleToggleNexus(n._id)}
                        />
                        <span className="group-nexus-name">{n.name}</span>
                        <span className="group-nexus-coords">({n.x}|{n.y})</span>
                      </label>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="group-empty-hint">Create or select a group to assign nexuses.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Game;
