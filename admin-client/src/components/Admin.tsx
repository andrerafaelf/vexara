import React, { useEffect, useState } from 'react';
import '../styles/Admin.css';
import Toast from './Toast';

interface User {
  _id: string;
  username: string;
  email: string;
  points: number;
  createdAt: string;
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

const Admin: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [attacks, setAttacks] = useState<Attack[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<ToastMessage | null>(null);
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
        adminFetch('http://localhost:3002/api/admin/users'),
        adminFetch('http://localhost:3002/api/admin/stats'),
        adminFetch('http://localhost:3002/api/admin/attacks'),
      ]);

      const usersData = await usersRes.json();
      const statsData = await statsRes.json();
      const attacksData = await attacksRes.json();

      setUsers(usersData);
      setStats({ userCount: statsData.userCount, attackCount: statsData.attackCount });
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
      const res = await adminFetch(`http://localhost:3002/api/admin/users/${userId}`, {
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

  const handleCompleteAttack = async (attackId: string) => {
    try {
      const res = await adminFetch(`http://localhost:3002/api/admin/attacks/${attackId}/complete`, {
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

  if (loading) return <div className="loading">Loading admin panel...</div>;

  return (
    <div className="admin-panel">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <h2>Admin Controls</h2>

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

                  const totalTroops = Object.values(attack.troops).reduce((a, b) => a + b, 0);

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
    </div>
  );
};

export default Admin;
