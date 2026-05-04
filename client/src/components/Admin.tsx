import React, { useEffect, useState } from 'react';
import '../styles/Admin.css';
import Toast from './Toast';

interface User {
  _id: string;
  username: string;
  email: string;
  points: number;
  nexuses: any[];
  createdAt: string;
}

interface Stats {
  userCount: number;
  villageCount: number;
  attackCount: number;
  topUsers: { username: string; points: number }[];
}

interface Attack {
  _id: string;
  attacker: {
    user: { username: string };
    nexus: { _id: string; name: string; x: number; y: number };
  };
  defender: {
    user: { username: string };
    nexus: { _id: string; name: string; x: number; y: number };
  };
  troops: {
    lancerDrone: number;
    assaultTrooper: number;
    breakerUnit: number;
    reconDrone: number;
    skimmerBike: number;
    siegeMech: number;
  };
  arrivesAt: string;
  status: string;
}

interface ToastMessage {
  message: string;
  type: 'success' | 'error' | 'info';
}

interface Modal {
  type: 'resources' | 'troops' | 'buildings' | null;
  nexusId: string | null;
}

const ADMIN_API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL || 'http://localhost:3002/api/admin';

const Admin: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [attacks, setAttacks] = useState<Attack[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [modal, setModal] = useState<Modal>({ type: null, nexusId: null });
  const [formData, setFormData] = useState<any>({});
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timeInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timeInterval);
  }, []);

  useEffect(() => {
    loadData();
  }, []);

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ message, type });
  };

  const loadData = async () => {
    try {
      const [usersRes, statsRes, attacksRes] = await Promise.all([
        fetch(`${ADMIN_API_URL}/users`),
        fetch(`${ADMIN_API_URL}/stats`),
        fetch(`${ADMIN_API_URL}/attacks`),
      ]);

      const usersData = await usersRes.json();
      const statsData = await statsRes.json();
      const attacksData = await attacksRes.json();

      setUsers(usersData);
      setStats(statsData);
      setAttacks(attacksData);
      setLoading(false);
    } catch (err) {
      console.error('Error loading admin data:', err);
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId: string, username: string) => {
    if (!window.confirm(`Delete user "${username}"?`)) return;

    try {
      const res = await fetch(`${ADMIN_API_URL}/users/${userId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        showToast(`User "${username}" deleted`, 'success');
        loadData();
      } else {
        showToast('Failed to delete user', 'error');
      }
    } catch (err) {
      showToast('Error deleting user', 'error');
    }
  };

  const openResourceModal = (nexusId: string) => {
    setModal({ type: 'resources', nexusId });
    setFormData({ biomass: 1000, alloy: 1000, ore: 1000 });
  };

  const openTroopModal = (nexusId: string) => {
    setModal({ type: 'troops', nexusId });
    setFormData({
      lancerDrone: 0,
      assaultTrooper: 0,
      breakerUnit: 0,
      reconOperative: 0,
      skimmerBike: 0,
      siegeMech: 0,
      bulwarkGuard: 0,
      suppressorTeam: 0,
      disruptorUnit: 0,
      interceptorBike: 0,
      annihilatorPlatform: 0,
      overseer: 0,
    });
  };

  const openBuildingModal = (nexusId: string) => {
    setModal({ type: 'buildings', nexusId });
    setFormData({
      commandCore: 0,
      troopFabricator: 0,
      lifeSupport: 0,
      storageVault: 0,
      biomassFarm: 0,
      alloyForge: 0,
      oreExtractor: 0,
      shieldGrid: 0,
    });
  };

  const closeModal = () => {
    setModal({ type: null, nexusId: null });
    setFormData({});
  };

  const handleSubmitResources = async () => {
    if (!modal.nexusId) return;

    try {
      const res = await fetch(`${ADMIN_API_URL}/nexuses/${modal.nexusId}/resources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        showToast('Resources added', 'success');
        loadData();
        closeModal();
      } else {
        showToast('Failed to add resources', 'error');
      }
    } catch (err) {
      showToast('Error adding resources', 'error');
    }
  };

  const handleSubmitTroops = async () => {
    if (!modal.nexusId) return;

    try {
      const res = await fetch(`${ADMIN_API_URL}/nexuses/${modal.nexusId}/troops`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        showToast('Troops added', 'success');
        loadData();
        closeModal();
      } else {
        showToast('Failed to add troops', 'error');
      }
    } catch (err) {
      showToast('Error adding troops', 'error');
    }
  };

  const handleSubmitBuildings = async () => {
    if (!modal.nexusId) return;

    try {
      const res = await fetch(`${ADMIN_API_URL}/nexuses/${modal.nexusId}/buildings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        showToast('Building levels added', 'success');
        loadData();
        closeModal();
      } else {
        showToast('Failed to add building levels', 'error');
      }
    } catch (err) {
      showToast('Error adding building levels', 'error');
    }
  };

  const handleCompleteBuild = async (nexusId: string) => {
    try {
      const res = await fetch(`${ADMIN_API_URL}/nexuses/${nexusId}/complete-build`, {
        method: 'POST',
      });

      if (res.ok) {
        showToast('Building completed', 'success');
        loadData();
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to complete building', 'error');
      }
    } catch (err) {
      showToast('Error completing building', 'error');
    }
  };

  const handleCompleteTraining = async (nexusId: string) => {
    try {
      const res = await fetch(`${ADMIN_API_URL}/nexuses/${nexusId}/complete-training`, {
        method: 'POST',
      });

      if (res.ok) {
        showToast('Training completed', 'success');
        loadData();
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to complete training', 'error');
      }
    } catch (err) {
      showToast('Error completing training', 'error');
    }
  };

  const handleCompleteAttack = async (attackId: string) => {
    try {
      const res = await fetch(`${ADMIN_API_URL}/attacks/${attackId}/complete`, {
        method: 'POST',
      });

      if (res.ok) {
        showToast('⚡ Strike completed instantly!', 'success');
        loadData();
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to complete strike', 'error');
      }
    } catch (err) {
      showToast('Error completing strike', 'error');
    }
  };

  const handleDeleteNexus = async (nexusId: string, villageName: string) => {
    if (!window.confirm(`Delete nexus "${villageName}"?`)) return;

    try {
      const res = await fetch(`${ADMIN_API_URL}/nexuses/${nexusId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        showToast(`Nexus "${villageName}" deleted`, 'success');
        loadData();
      } else {
        showToast('Failed to delete nexus', 'error');
      }
    } catch (err) {
      showToast('Error deleting nexus', 'error');
    }
  };

  if (loading) return <div className="loading">Loading admin panel...</div>;

  return (
    <div className="admin-panel">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {modal.type && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                {modal.type === 'resources'
                  ? '💰 Add Resources'
                  : modal.type === 'troops'
                    ? '⚔️ Add Troops'
                    : '🏗️ Add Building Levels'}
              </h3>
              <button className="modal-close" onClick={closeModal}>
                ×
              </button>
            </div>
            <div className="modal-body">
              {modal.type === 'resources' ? (
                <div className="form-grid">
                  <div className="form-group">
                    <label>🌿 Biomass</label>
                    <input
                      type="number"
                      value={formData.biomass || 0}
                      onChange={(e) => setFormData({ ...formData, biomass: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="form-group">
                    <label>🔩 Alloy</label>
                    <input
                      type="number"
                      value={formData.alloy || 0}
                      onChange={(e) => setFormData({ ...formData, alloy: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="form-group">
                    <label>⛏️ Ore</label>
                    <input
                      type="number"
                      value={formData.ore || 0}
                      onChange={(e) => setFormData({ ...formData, ore: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                </div>
              ) : modal.type === 'troops' ? (
                <div className="form-grid">
                  <div className="form-group">
                    <label>⚔️ Assault Trooper</label>
                    <input
                      type="number"
                      value={formData.assaultTrooper || 0}
                      onChange={(e) => setFormData({ ...formData, assaultTrooper: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="form-group">
                    <label>🛡️ Lancer Drone</label>
                    <input
                      type="number"
                      value={formData.lancerDrone || 0}
                      onChange={(e) => setFormData({ ...formData, lancerDrone: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="form-group">
                    <label>🔨 Breaker Unit</label>
                    <input
                      type="number"
                      value={formData.breakerUnit || 0}
                      onChange={(e) => setFormData({ ...formData, breakerUnit: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="form-group">
                    <label>🔍 Recon Operative</label>
                    <input
                      type="number"
                      value={formData.reconOperative || 0}
                      onChange={(e) => setFormData({ ...formData, reconOperative: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="form-group">
                    <label>🏍️ Skimmer Bike</label>
                    <input
                      type="number"
                      value={formData.skimmerBike || 0}
                      onChange={(e) => setFormData({ ...formData, skimmerBike: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="form-group">
                    <label>🤖 Siege Mech</label>
                    <input
                      type="number"
                      value={formData.siegeMech || 0}
                      onChange={(e) => setFormData({ ...formData, siegeMech: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="form-group">
                    <label>🛡️ Bulwark Guard</label>
                    <input
                      type="number"
                      value={formData.bulwarkGuard || 0}
                      onChange={(e) => setFormData({ ...formData, bulwarkGuard: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="form-group">
                    <label>🎯 Suppressor Team</label>
                    <input
                      type="number"
                      value={formData.suppressorTeam || 0}
                      onChange={(e) => setFormData({ ...formData, suppressorTeam: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="form-group">
                    <label>⚡ Disruptor Unit</label>
                    <input
                      type="number"
                      value={formData.disruptorUnit || 0}
                      onChange={(e) => setFormData({ ...formData, disruptorUnit: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="form-group">
                    <label>🏍️ Interceptor Bike</label>
                    <input
                      type="number"
                      value={formData.interceptorBike || 0}
                      onChange={(e) => setFormData({ ...formData, interceptorBike: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="form-group">
                    <label>💀 Annihilator Platform</label>
                    <input
                      type="number"
                      value={formData.annihilatorPlatform || 0}
                      onChange={(e) => setFormData({ ...formData, annihilatorPlatform: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="form-group">
                    <label>👁️ Overseer</label>
                    <input
                      type="number"
                      value={formData.overseer || 0}
                      onChange={(e) => setFormData({ ...formData, overseer: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                </div>
              ) : (
                <div className="form-grid">
                  <div className="form-group">
                    <label>🏛️ Command Core</label>
                    <input
                      type="number"
                      value={formData.commandCore || 0}
                      onChange={(e) => setFormData({ ...formData, commandCore: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="form-group">
                    <label>⚙️ Recruitment Core</label>
                    <input
                      type="number"
                      value={formData.troopFabricator || 0}
                      onChange={(e) => setFormData({ ...formData, troopFabricator: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="form-group">
                    <label>💊 Life Support</label>
                    <input
                      type="number"
                      value={formData.lifeSupport || 0}
                      onChange={(e) => setFormData({ ...formData, lifeSupport: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="form-group">
                    <label>📦 Storage Vault</label>
                    <input
                      type="number"
                      value={formData.storageVault || 0}
                      onChange={(e) => setFormData({ ...formData, storageVault: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="form-group">
                    <label>🌿 Biomass Farm</label>
                    <input
                      type="number"
                      value={formData.biomassFarm || 0}
                      onChange={(e) => setFormData({ ...formData, biomassFarm: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="form-group">
                    <label>🔩 Alloy Forge</label>
                    <input
                      type="number"
                      value={formData.alloyForge || 0}
                      onChange={(e) => setFormData({ ...formData, alloyForge: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="form-group">
                    <label>⛏️ Ore Extractor</label>
                    <input
                      type="number"
                      value={formData.oreExtractor || 0}
                      onChange={(e) => setFormData({ ...formData, oreExtractor: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="form-group">
                    <label>🛡️ Shield Grid</label>
                    <input
                      type="number"
                      value={formData.shieldGrid || 0}
                      onChange={(e) => setFormData({ ...formData, shieldGrid: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={closeModal}>
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={
                  modal.type === 'resources'
                    ? handleSubmitResources
                    : modal.type === 'troops'
                      ? handleSubmitTroops
                      : handleSubmitBuildings
                }
              >
                Add {modal.type === 'resources' ? 'Resources' : modal.type === 'troops' ? 'Troops' : 'Levels'}
              </button>
            </div>
          </div>
        </div>
      )}

      <h2>🛠️ Admin Panel</h2>

      {stats && (
        <div className="admin-stats">
          <div className="stat-card">
            <h3>👥 {stats.userCount}</h3>
            <p>Total Commanders</p>
          </div>
          <div className="stat-card">
            <h3>🏘️ {stats.villageCount}</h3>
            <p>Total Nexuses</p>
          </div>
          <div className="stat-card">
            <h3>⚔️ {stats.attackCount}</h3>
            <p>Total Strikes</p>
          </div>
        </div>
      )}

      <div className="admin-section">
        <h3>👥 All Commanders ({users.length})</h3>
        <div className="users-table">
          <table>
            <thead>
              <tr>
                <th>Username</th>
                <th>Email</th>
                <th>Influence</th>
                <th>Nexuses</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user._id}>
                  <td>{user.username}</td>
                  <td>{user.email}</td>
                  <td>{user.points}</td>
                  <td>
                    {user.nexuses.length}
                    {user.nexuses.length > 0 && (
                      <div className="nexus-actions">
                        <button className="btn-small" onClick={() => openResourceModal(user.nexuses[0]._id)}>
                          💰 Resources
                        </button>
                        <button className="btn-small" onClick={() => openTroopModal(user.nexuses[0]._id)}>
                          ⚔️ Troops
                        </button>
                        <button className="btn-small" onClick={() => openBuildingModal(user.nexuses[0]._id)}>
                          🏗️ Buildings
                        </button>
                        <button className="btn-small" onClick={() => handleCompleteBuild(user.nexuses[0]._id)}>
                          ⚡ Build
                        </button>
                        <button className="btn-small" onClick={() => handleCompleteTraining(user.nexuses[0]._id)}>
                          🎖️ Train
                        </button>
                        <button
                          className="btn-small btn-warning"
                          onClick={() => handleDeleteNexus(user.nexuses[0]._id, user.nexuses[0].name)}
                        >
                          🗑️ Nexus
                        </button>
                      </div>
                    )}
                  </td>
                  <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                  <td>
                    <button className="btn-danger" onClick={() => handleDeleteUser(user._id, user.username)}>
                      🗑️ Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {attacks.length > 0 && (
        <div className="admin-section">
          <h3>⚔️ Traveling Strikes ({attacks.length})</h3>
          <div className="attacks-table">
            <table>
              <thead>
                <tr>
                  <th>Attacker</th>
                  <th>→</th>
                  <th>Defender</th>
                  <th>Troops</th>
                  <th>Arrives In</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {attacks.map((attack) => {
                  const diff = new Date(attack.arrivesAt).getTime() - currentTime.getTime();
                  const seconds = Math.max(0, Math.floor(diff / 1000));
                  const minutes = Math.floor(seconds / 60);
                  const hours = Math.floor(minutes / 60);
                  const timeStr =
                    hours > 0
                      ? `${hours}h ${minutes % 60}m ${seconds % 60}s`
                      : minutes > 0
                        ? `${minutes}m ${seconds % 60}s`
                        : `${seconds}s`;

                  const totalTroops = Object.values(attack.troops).reduce((a, b) => a + b, 0);

                  return (
                    <tr key={attack._id}>
                      <td>
                        <strong>{attack.attacker?.user?.username || 'Unknown'}</strong>
                        <br />
                        <small>
                          {attack.attacker?.nexus?.name || 'Deleted'} ({attack.attacker?.nexus?.x || '?'}|
                          {attack.attacker?.nexus?.y || '?'})
                        </small>
                      </td>
                      <td style={{ textAlign: 'center', fontSize: '20px' }}>→</td>
                      <td>
                        <strong>{attack.defender?.user?.username || 'Unknown'}</strong>
                        <br />
                        <small>
                          {attack.defender?.nexus?.name || 'Deleted'} ({attack.defender?.nexus?.x || '?'}|
                          {attack.defender?.nexus?.y || '?'})
                        </small>
                      </td>
                      <td>{totalTroops} troops</td>
                      <td>
                        <span className={diff <= 10000 ? 'time-urgent' : ''}>{timeStr}</span>
                      </td>
                      <td>
                        <button className="btn-small btn-primary" onClick={() => handleCompleteAttack(attack._id)}>
                          ⚡ Complete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {stats && stats.topUsers && stats.topUsers.length > 0 && (
        <div className="admin-section">
          <h3>🏆 Top Players</h3>
          <ol className="top-players">
            {stats.topUsers.map((user, idx) => (
              <li key={idx}>
                <span className="rank">#{idx + 1}</span>
                <span className="name">{user.username}</span>
                <span className="points">{user.points} pts</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
};

export default Admin;
