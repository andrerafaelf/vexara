import React, { useEffect, useState } from 'react';
import '../styles/Admin.css';
import Toast from './Toast';

interface UserNexus {
  _id: string;
  name: string;
}

interface User {
  _id: string;
  username: string;
  email: string;
  points: number;
  createdAt: string;
  nexuses: UserNexus[];
}

interface Stats {
  userCount: number;
  attackCount: number;
}

interface Attack {
  _id: string;
  attacker: {
    user: { username: string };
  };
  defender: {
    user: { username: string };
  };
  troops: Record<string, number>;
  arrivesAt: string;
}

interface ToastMessage {
  message: string;
  type: 'success' | 'error' | 'info';
}

type AdminModal = 'addUser' | 'editUser' | 'resources' | 'troops' | 'buildings' | null;

const TROOP_OPTIONS: Array<{ key: string; label: string }> = [
  { key: 'lancerDrone', label: 'Lancer Drone' },
  { key: 'assaultTrooper', label: 'Assault Trooper' },
  { key: 'breakerUnit', label: 'Breaker Unit' },
  { key: 'reconOperative', label: 'Recon Operative' },
  { key: 'skimmerBike', label: 'Skimmer Bike' },
  { key: 'siegeMech', label: 'Siege Mech' },
  { key: 'bulwarkGuard', label: 'Bulwark Guard' },
  { key: 'suppressorTeam', label: 'Suppressor Team' },
  { key: 'disruptorUnit', label: 'Disruptor Unit' },
  { key: 'interceptorBike', label: 'Interceptor Bike' },
  { key: 'annihilatorPlatform', label: 'Annihilator Platform' },
  { key: 'overseer', label: 'Overseer' },
];

const BUILDING_OPTIONS: Array<{ key: string; label: string }> = [
  { key: 'commandCore', label: 'Command Core' },
  { key: 'troopFabricator', label: 'Recruitment Core' },
  { key: 'lifeSupport', label: 'Life Support' },
  { key: 'storageVault', label: 'Storage Vault' },
  { key: 'biomassFarm', label: 'Biomass Farm' },
  { key: 'alloyForge', label: 'Alloy Forge' },
  { key: 'oreExtractor', label: 'Ore Extractor' },
  { key: 'shieldGrid', label: 'Shield Grid' },
];

const ADMIN_API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL || 'http://localhost:3002/api/admin';

const Admin: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [attacks, setAttacks] = useState<Attack[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [modal, setModal] = useState<AdminModal>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const [addUserForm, setAddUserForm] = useState({ username: '', email: '', password: '' });
  const [editUserForm, setEditUserForm] = useState({ email: '', password: '' });
  const [resourcesForm, setResourcesForm] = useState({ nexusId: '', biomass: 0, alloy: 0, ore: 0 });
  const [troopsForm, setTroopsForm] = useState({ nexusId: '', troopType: 'reconOperative', amount: 0 });
  const [buildingsForm, setBuildingsForm] = useState({ nexusId: '', building: 'shieldGrid', level: 0 });

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

  const adminFetch = async (url: string, options: RequestInit = {}) => {
    const token = sessionStorage.getItem('admin_basic_auth');
    const headers = new Headers(options.headers || {});

    if (token) {
      headers.set('Authorization', `Basic ${token}`);
    }

    if (options.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(url, { ...options, headers });

    if (response.status === 401) {
      sessionStorage.removeItem('admin_basic_auth');
      window.location.href = '/auth';
    }

    return response;
  };

  const loadData = async () => {
    try {
      const [usersRes, statsRes, attacksRes] = await Promise.all([
        adminFetch(`${ADMIN_API_URL}/users`),
        adminFetch(`${ADMIN_API_URL}/stats`),
        adminFetch(`${ADMIN_API_URL}/attacks`),
      ]);

      const [usersData, statsData, attacksData] = await Promise.all([
        usersRes.json().catch(() => null),
        statsRes.json().catch(() => null),
        attacksRes.json().catch(() => null),
      ]);

      const normalizedUsers = Array.isArray(usersData)
        ? usersData.map((user) => ({
            ...user,
            nexuses: Array.isArray(user?.nexuses) ? user.nexuses : [],
          }))
        : [];
      const normalizedAttacks = Array.isArray(attacksData) ? attacksData : [];
      const normalizedStats =
        statsData && typeof statsData === 'object'
          ? {
              userCount: Number((statsData as { userCount?: number }).userCount ?? 0),
              attackCount: Number((statsData as { attackCount?: number }).attackCount ?? 0),
            }
          : null;

      setUsers(normalizedUsers);
      setStats(normalizedStats);
      setAttacks(normalizedAttacks);
      setLoading(false);
    } catch (err) {
      console.error('Error loading admin data:', err);
      setUsers([]);
      setStats(null);
      setAttacks([]);
      setLoading(false);
    }
  };

  const openUserModal = (type: Exclude<AdminModal, 'addUser' | null>, user: User) => {
    setSelectedUser(user);
    const defaultNexusId = user.nexuses?.[0]?._id || '';

    if (type === 'editUser') {
      setEditUserForm({ email: user.email, password: '' });
    }

    if (type === 'resources') {
      setResourcesForm({ nexusId: defaultNexusId, biomass: 0, alloy: 0, ore: 0 });
    }

    if (type === 'troops') {
      setTroopsForm({ nexusId: defaultNexusId, troopType: 'reconOperative', amount: 0 });
    }

    if (type === 'buildings') {
      setBuildingsForm({ nexusId: defaultNexusId, building: 'shieldGrid', level: 0 });
    }

    setModal(type);
  };

  const closeModal = () => {
    setModal(null);
    setSelectedUser(null);
  };

  const handleAddUser = async () => {
    if (!addUserForm.username || !addUserForm.email || !addUserForm.password) {
      showToast('Username, email and password are required', 'error');
      return;
    }

    try {
      const res = await adminFetch(`${ADMIN_API_URL}/users`, {
        method: 'POST',
        body: JSON.stringify(addUserForm),
      });

      if (!res.ok) {
        const data = await res.json();
        showToast(data.error || 'Failed to add user', 'error');
        return;
      }

      showToast(`User "${addUserForm.username}" created`, 'success');
      setAddUserForm({ username: '', email: '', password: '' });
      closeModal();
      loadData();
    } catch (err) {
      showToast('Error adding user', 'error');
    }
  };

  const handleUpdateUser = async () => {
    if (!selectedUser) return;

    if (!editUserForm.email && !editUserForm.password) {
      showToast('Provide a new email or password', 'error');
      return;
    }

    try {
      const payload: { email?: string; password?: string } = {};
      if (editUserForm.email) payload.email = editUserForm.email;
      if (editUserForm.password) payload.password = editUserForm.password;

      const res = await adminFetch(`${ADMIN_API_URL}/users/${selectedUser._id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        showToast(data.error || 'Failed to update user', 'error');
        return;
      }

      showToast(`Updated credentials for ${selectedUser.username}`, 'success');
      closeModal();
      loadData();
    } catch (err) {
      showToast('Error updating user', 'error');
    }
  };

  const handleAddResources = async () => {
    if (!selectedUser) return;

    try {
      const res = await adminFetch(`${ADMIN_API_URL}/users/${selectedUser._id}/resources`, {
        method: 'POST',
        body: JSON.stringify(resourcesForm),
      });

      if (!res.ok) {
        const data = await res.json();
        showToast(data.error || 'Failed to add resources', 'error');
        return;
      }

      showToast(`Resources added for ${selectedUser.username}`, 'success');
      closeModal();
      loadData();
    } catch (err) {
      showToast('Error adding resources', 'error');
    }
  };

  const handleAddTroops = async () => {
    if (!selectedUser) return;

    try {
      const res = await adminFetch(`${ADMIN_API_URL}/users/${selectedUser._id}/troops`, {
        method: 'POST',
        body: JSON.stringify(troopsForm),
      });

      if (!res.ok) {
        const data = await res.json();
        showToast(data.error || 'Failed to add troops', 'error');
        return;
      }

      showToast(`Troops added for ${selectedUser.username}`, 'success');
      closeModal();
      loadData();
    } catch (err) {
      showToast('Error adding troops', 'error');
    }
  };

  const handleSetBuildingLevel = async () => {
    if (!selectedUser) return;

    try {
      const res = await adminFetch(`${ADMIN_API_URL}/users/${selectedUser._id}/buildings`, {
        method: 'POST',
        body: JSON.stringify(buildingsForm),
      });

      if (!res.ok) {
        const data = await res.json();
        showToast(data.error || 'Failed to update building level', 'error');
        return;
      }

      showToast(`Building updated for ${selectedUser.username}`, 'success');
      closeModal();
      loadData();
    } catch (err) {
      showToast('Error updating building', 'error');
    }
  };

  const handleDeleteUser = async (userId: string, username: string) => {
    if (!window.confirm(`Delete user "${username}"?`)) return;

    try {
      const res = await adminFetch(`${ADMIN_API_URL}/users/${userId}`, {
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

  const handleResetUser = async (user: User) => {
    const confirmed = window.confirm(
      `Reset account "${user.username}" to starter state? This will remove all nexuses, attacks, queues, troops, and resources progress.`,
    );
    if (!confirmed) return;

    try {
      const res = await adminFetch(`${ADMIN_API_URL}/users/${user._id}/reset-account`, {
        method: 'POST',
      });

      if (res.ok) {
        showToast(`Account reset for ${user.username}`, 'success');
        loadData();
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to reset account', 'error');
      }
    } catch (err) {
      showToast('Error resetting account', 'error');
    }
  };

  const handleCompleteAttack = async (attackId: string) => {
    try {
      const res = await adminFetch(`${ADMIN_API_URL}/attacks/${attackId}/complete`, {
        method: 'POST',
      });

      if (res.ok) {
        showToast('Strike completed instantly', 'success');
        loadData();
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to complete strike', 'error');
      }
    } catch (err) {
      showToast('Error completing strike', 'error');
    }
  };

  const handleCompleteUserStrike = async (user: User) => {
    try {
      const res = await adminFetch(`${ADMIN_API_URL}/users/${user._id}/complete-strike`, {
        method: 'POST',
      });

      if (res.ok) {
        showToast(`Completed active strike for ${user.username}`, 'success');
        loadData();
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to complete active strike', 'error');
      }
    } catch (err) {
      showToast('Error completing user strike', 'error');
    }
  };

  const handleCompleteUserBuild = async (user: User) => {
    const targetNexusId = user.nexuses?.[0]?._id;
    if (!targetNexusId) {
      showToast('User has no nexus to complete build for', 'error');
      return;
    }

    try {
      const res = await adminFetch(`${ADMIN_API_URL}/users/${user._id}/complete-build`, {
        method: 'POST',
        body: JSON.stringify({ nexusId: targetNexusId }),
      });

      if (res.ok) {
        showToast(`Completed current build for ${user.username}`, 'success');
        loadData();
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to complete build', 'error');
      }
    } catch (err) {
      showToast('Error completing build', 'error');
    }
  };

  const handleCompleteUserTraining = async (user: User) => {
    const targetNexusId = user.nexuses?.[0]?._id;
    if (!targetNexusId) {
      showToast('User has no nexus to complete training for', 'error');
      return;
    }

    try {
      const res = await adminFetch(`${ADMIN_API_URL}/users/${user._id}/complete-training`, {
        method: 'POST',
        body: JSON.stringify({ nexusId: targetNexusId }),
      });

      if (res.ok) {
        showToast(`Completed all queued training for ${user.username}`, 'success');
        loadData();
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to complete troop queue', 'error');
      }
    } catch (err) {
      showToast('Error completing troop queue', 'error');
    }
  };

  if (loading) return <div className="loading">Loading admin panel...</div>;

  return (
    <div className="admin-panel">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <h2>Admin Controls</h2>

      <div style={{ marginBottom: '20px' }}>
        <button className="btn-primary" onClick={() => setModal('addUser')}>
          + Add User
        </button>
      </div>

      {stats && (
        <div className="admin-stats">
          <div className="stat-card">
            <h3>{stats.userCount}</h3>
            <p>Total Users</p>
          </div>
          <div className="stat-card">
            <h3>{stats.attackCount}</h3>
            <p>Traveling Strikes</p>
          </div>
        </div>
      )}

      <div className="admin-section">
        <h3>All Users ({users.length})</h3>
        <div className="users-table">
          <table>
            <thead>
              <tr>
                <th>Username</th>
                <th>Email</th>
                <th>Influence</th>
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
                  <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                  <td>
                    <button className="btn-small" onClick={() => openUserModal('editUser', user)}>
                      Edit Login
                    </button>
                    <button className="btn-small" onClick={() => openUserModal('resources', user)}>
                      Add Resources
                    </button>
                    <button className="btn-small" onClick={() => openUserModal('troops', user)}>
                      Add Troops
                    </button>
                    <button className="btn-small" onClick={() => openUserModal('buildings', user)}>
                      Set Building
                    </button>
                    <button className="btn-small" onClick={() => handleCompleteUserStrike(user)}>
                      Complete Strike
                    </button>
                    <button className="btn-small" onClick={() => handleCompleteUserBuild(user)}>
                      Complete Build
                    </button>
                    <button className="btn-small" onClick={() => handleCompleteUserTraining(user)}>
                      Complete Troops
                    </button>
                    <button className="btn-small btn-warning" onClick={() => handleResetUser(user)}>
                      Reset Account
                    </button>
                    <button className="btn-danger" onClick={() => handleDeleteUser(user._id, user.username)}>
                      Delete
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
          <h3>Traveling Strikes ({attacks.length})</h3>
          <div className="attacks-table">
            <table>
              <thead>
                <tr>
                  <th>Attacker</th>
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

                  const totalTroops = Object.values(attack.troops || {}).reduce((a, b) => a + Number(b || 0), 0);

                  return (
                    <tr key={attack._id}>
                      <td>{attack.attacker?.user?.username || 'Unknown'}</td>
                      <td>{attack.defender?.user?.username || 'Unknown'}</td>
                      <td>{totalTroops}</td>
                      <td>
                        <span className={diff <= 10000 ? 'time-urgent' : ''}>{timeStr}</span>
                      </td>
                      <td>
                        <button className="btn-small btn-primary" onClick={() => handleCompleteAttack(attack._id)}>
                          Complete
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

      {modal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                {modal === 'addUser' && 'Add User'}
                {modal === 'editUser' && `Edit Login: ${selectedUser?.username}`}
                {modal === 'resources' && `Add Resources: ${selectedUser?.username}`}
                {modal === 'troops' && `Add Troops: ${selectedUser?.username}`}
                {modal === 'buildings' && `Set Building Level: ${selectedUser?.username}`}
              </h3>
              <button className="modal-close" onClick={closeModal}>
                ×
              </button>
            </div>

            <div className="modal-body">
              {modal === 'addUser' && (
                <div className="form-grid">
                  <div className="form-group">
                    <label>Username</label>
                    <input
                      value={addUserForm.username}
                      onChange={(e) => setAddUserForm({ ...addUserForm, username: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Email</label>
                    <input
                      value={addUserForm.email}
                      onChange={(e) => setAddUserForm({ ...addUserForm, email: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Password</label>
                    <input
                      type="password"
                      value={addUserForm.password}
                      onChange={(e) => setAddUserForm({ ...addUserForm, password: e.target.value })}
                    />
                  </div>
                </div>
              )}

              {modal === 'editUser' && (
                <div className="form-grid">
                  <div className="form-group">
                    <label>Email</label>
                    <input
                      value={editUserForm.email}
                      onChange={(e) => setEditUserForm({ ...editUserForm, email: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>New Password</label>
                    <input
                      type="password"
                      placeholder="Leave blank to keep current"
                      value={editUserForm.password}
                      onChange={(e) => setEditUserForm({ ...editUserForm, password: e.target.value })}
                    />
                  </div>
                </div>
              )}

              {modal === 'resources' && selectedUser && (
                <div className="form-grid">
                  <div className="form-group">
                    <label>Nexus</label>
                    <select
                      value={resourcesForm.nexusId}
                      onChange={(e) => setResourcesForm({ ...resourcesForm, nexusId: e.target.value })}
                    >
                      {(selectedUser.nexuses || []).map((nexus) => (
                        <option key={nexus._id} value={nexus._id}>
                          {nexus.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Biomass</label>
                    <input
                      type="number"
                      value={resourcesForm.biomass}
                      onChange={(e) => setResourcesForm({ ...resourcesForm, biomass: Number(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Alloy</label>
                    <input
                      type="number"
                      value={resourcesForm.alloy}
                      onChange={(e) => setResourcesForm({ ...resourcesForm, alloy: Number(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Ore</label>
                    <input
                      type="number"
                      value={resourcesForm.ore}
                      onChange={(e) => setResourcesForm({ ...resourcesForm, ore: Number(e.target.value) || 0 })}
                    />
                  </div>
                </div>
              )}

              {modal === 'troops' && selectedUser && (
                <div className="form-grid">
                  <div className="form-group">
                    <label>Nexus</label>
                    <select
                      value={troopsForm.nexusId}
                      onChange={(e) => setTroopsForm({ ...troopsForm, nexusId: e.target.value })}
                    >
                      {(selectedUser.nexuses || []).map((nexus) => (
                        <option key={nexus._id} value={nexus._id}>
                          {nexus.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Troop</label>
                    <select
                      value={troopsForm.troopType}
                      onChange={(e) => setTroopsForm({ ...troopsForm, troopType: e.target.value })}
                    >
                      {TROOP_OPTIONS.map((troop) => (
                        <option key={troop.key} value={troop.key}>
                          {troop.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Amount</label>
                    <input
                      type="number"
                      value={troopsForm.amount}
                      onChange={(e) => setTroopsForm({ ...troopsForm, amount: Number(e.target.value) || 0 })}
                    />
                  </div>
                </div>
              )}

              {modal === 'buildings' && selectedUser && (
                <div className="form-grid">
                  <div className="form-group">
                    <label>Nexus</label>
                    <select
                      value={buildingsForm.nexusId}
                      onChange={(e) => setBuildingsForm({ ...buildingsForm, nexusId: e.target.value })}
                    >
                      {(selectedUser.nexuses || []).map((nexus) => (
                        <option key={nexus._id} value={nexus._id}>
                          {nexus.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Building</label>
                    <select
                      value={buildingsForm.building}
                      onChange={(e) => setBuildingsForm({ ...buildingsForm, building: e.target.value })}
                    >
                      {BUILDING_OPTIONS.map((building) => (
                        <option key={building.key} value={building.key}>
                          {building.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Level</label>
                    <input
                      type="number"
                      min="0"
                      value={buildingsForm.level}
                      onChange={(e) => setBuildingsForm({ ...buildingsForm, level: Number(e.target.value) || 0 })}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={closeModal}>
                Cancel
              </button>
              {modal === 'addUser' && (
                <button className="btn-primary" onClick={handleAddUser}>
                  Create User
                </button>
              )}
              {modal === 'editUser' && (
                <button className="btn-primary" onClick={handleUpdateUser}>
                  Save Changes
                </button>
              )}
              {modal === 'resources' && (
                <button className="btn-primary" onClick={handleAddResources}>
                  Add Resources
                </button>
              )}
              {modal === 'troops' && (
                <button className="btn-primary" onClick={handleAddTroops}>
                  Add Troops
                </button>
              )}
              {modal === 'buildings' && (
                <button className="btn-primary" onClick={handleSetBuildingLevel}>
                  Set Level
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Admin;
