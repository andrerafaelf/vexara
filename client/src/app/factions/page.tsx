'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import FactionsView from '../../components/FactionsView';
import { useAuth } from '../../context/AuthContext';

export default function FactionsPage() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && !user) {
      router.push('/login');
    }
  }, [user, mounted, router]);

  if (!mounted || !user) {
    return <div className="game-container">Loading...</div>;
  }

  return (
    <div className="game-container">
      <header className="game-header">
        <div className="header-left">
          <button className="menu-toggle" onClick={() => alert('Mobile menu')} aria-label="Menu">
            ☰
          </button>
          <h1>Vexara</h1>
          <span>{user.username}</span>
        </div>
        <nav className="header-center">
          <a href="/nexus/1" className="nav-link">Dashboard</a>
          <a href="/starfield" className="nav-link">Starfield</a>
          <a href="/market" className="nav-link">Market</a>
          <a href="/combat-logs" className="nav-link">Combat Logs</a>
          <a href="/allies" className="nav-link">Allies</a>
          <a href="/factions" className="nav-link active">Factions</a>
          <a href="/profile" className="nav-link">Profile</a>
        </nav>
        <div className="header-right">
          <button onClick={logout}>Logout</button>
        </div>
      </header>

      <div className="game-content">
        <FactionsView />
      </div>
    </div>
  );
}
