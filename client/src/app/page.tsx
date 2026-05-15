'use client';

import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { createNexus, getMyNexuses } from '@/services/api';
import '@/styles/Game.css';
import { Nexus } from '@/types/game';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

const SELECTED_NEXUS_KEY = 'selectedNexusId';

export default function Home() {
  const [nexuses, setNexuses] = useState<Nexus[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const { user, logout } = useAuth();
  const toast = useToast();
  const router = useRouter();

  const loadNexuses = useCallback(async () => {
    try {
      const response = await getMyNexuses();
      const allNexuses = response.data;
      setNexuses(allNexuses);
      setLoading(false);
      return allNexuses as Nexus[];
    } catch (err) {
      console.error('Error loading nexuses:', err);
      setLoading(false);
      return [];
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
      return;
    }
    loadNexuses().then((allNexuses) => {
      if (allNexuses.length > 0) {
        const storedNexusId = localStorage.getItem(SELECTED_NEXUS_KEY);
        const preferredNexus = allNexuses.find((n) => n._id === storedNexusId) ?? allNexuses[0];
        localStorage.setItem(SELECTED_NEXUS_KEY, preferredNexus._id);
        router.replace(`/nexus/${preferredNexus._id}`);
      }
    });
    const interval = setInterval(loadNexuses, 30000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreateNexus = async () => {
    if (creating) return;
    setCreating(true);
    try {
      await createNexus();
      await loadNexuses();
    } catch (err) {
      console.error('Error creating nexus:', err);
      toast('Failed to create nexus', 'error');
    } finally {
      setCreating(false);
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
            <h1>Vexara</h1>
            <span className="username">welcome, {user?.username}</span>
          </div>
          <div className="header-right">
            <button onClick={logout} className="logout-btn">
              Logout
            </button>
          </div>
        </header>

        <main className="game-main">
          <div className="no-nexuses">
            <h2>Welcome to Vexara!</h2>
            <p>You don&apos;t have any nexuses yet. Let&apos;s create your first nexus to start your empire!</p>
            <button onClick={handleCreateNexus} className="create-nexus-btn" disabled={creating}>
              {creating ? 'Creating...' : 'Create Your First Nexus'}
            </button>
          </div>
        </main>
      </div>
    );
  }

  return <div className="loading">Redirecting to your selected nexus...</div>;
}
