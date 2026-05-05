'use client';

import AdBanner from '@/components/AdBanner';
import { useAuth } from '@/context/AuthContext';
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
  const router = useRouter();

  const loadNexuses = useCallback(async () => {
    try {
      const response = await getMyNexuses();
      const allNexuses = response.data;
      setNexuses(allNexuses);

      if (allNexuses.length > 0) {
        const storedNexusId = localStorage.getItem(SELECTED_NEXUS_KEY);
        const preferredNexus =
          allNexuses.find((nexus: { _id: string | null }) => nexus._id === storedNexusId) ?? allNexuses[0];
        localStorage.setItem(SELECTED_NEXUS_KEY, preferredNexus._id);
        router.replace(`/nexus/${preferredNexus._id}`);
      }

      setLoading(false);
    } catch (err) {
      console.error('Error loading nexuses:', err);
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/auth');
      return;
    }
    loadNexuses();
    const interval = setInterval(loadNexuses, 30000);
    return () => clearInterval(interval);
  }, [loadNexuses, router]);

  const handleCreateNexus = async () => {
    if (creating) return;
    setCreating(true);
    try {
      await createNexus();
      await loadNexuses();
    } catch (err) {
      console.error('Error creating nexus:', err);
      alert('Failed to create nexus');
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
            <button onClick={handleCreateNexus} className="create-nexus-btn" disabled={creating}>
              {creating ? 'Creating...' : 'Create Your First Nexus'}
            </button>
          </div>
        </main>

        <AdBanner slot="0987654321" className="ad-banner-bottom" />
      </div>
    );
  }

  return <div className="loading">Redirecting to your selected nexus...</div>;
}
