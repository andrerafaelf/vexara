'use client';

import AdBanner from '@/components/AdBanner';
import Reports from '@/components/Reports';
import { useAuth } from '@/context/AuthContext';
import { getMyNexuses, getReports } from '@/services/api';
import '@/styles/Game.css';
import { Nexus } from '@/types/game';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

export default function CombatLogsPage() {
  const [nexuses, setVillages] = useState<Nexus[]>([]);
  const [selectedNexus, setSelectedNexus] = useState<Nexus | null>(null);
  const [hasUnreadReports, setHasUnreadReports] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const refreshCombatReportNotification = useCallback(async (allNexuses: Nexus[]) => {
    if (allNexuses.length === 0) {
      setHasUnreadReports(false);
      return;
    }

    try {
      const viewedReports = new Set<string>(JSON.parse(localStorage.getItem('viewedReports') || '[]'));
      const reportResults = await Promise.allSettled(allNexuses.map((nexus) => getReports(nexus._id)));
      const hasUnread = reportResults.some((result) => {
        if (result.status !== 'fulfilled') {
          return false;
        }

        const reports = Array.isArray(result.value.data) ? result.value.data : [];
        return reports.some((report: { _id: string }) => !viewedReports.has(report._id));
      });

      setHasUnreadReports(hasUnread);
    } catch {
      setHasUnreadReports(false);
    }
  }, []);

  const loadVillages = useCallback(async () => {
    try {
      const response = await getMyNexuses();
      setVillages(response.data);
      await refreshCombatReportNotification(response.data);
      if (!selectedNexus && response.data.length > 0) {
        const storedId = localStorage.getItem('selectedNexusId');
        const nexus = (storedId && response.data.find((n: Nexus) => String(n._id) === storedId)) || response.data[0];
        setSelectedNexus(nexus);
      }
      setLoading(false);
    } catch (err) {
      console.error('Error loading nexuses:', err);
      setLoading(false);
    }
  }, [refreshCombatReportNotification, selectedNexus]);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/auth');
      return;
    }
    loadVillages();
    const interval = setInterval(loadVillages, 30000);
    return () => clearInterval(interval);
  }, [loadVillages, router]);

  const handleSelectNexus = (nexus: Nexus) => {
    localStorage.setItem('selectedNexusId', String(nexus._id));
    setSelectedNexus(nexus);
    setIsMobileMenuOpen(false);
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (!selectedNexus) {
    return <div className="loading">No nexuses available</div>;
  }

  return (
    <div className="game-container">
      <AdBanner slot="1234567890" className="ad-banner-top" />

      <header className="game-header">
        <div className="header-left">
          <button
            className="menu-toggle"
            onClick={() => setIsMobileMenuOpen((prev) => !prev)}
            aria-label="Toggle navigation menu"
            aria-expanded={isMobileMenuOpen}
          >
            ☰
          </button>
          <h1>Neon Dominion</h1>
          <span className="username">Welcome, {user?.username}</span>
        </div>
        <div className="header-center">
          <button className="nav-btn" onClick={() => router.push('/')}>
            📊 All Nexuses
          </button>
          <button className="nav-btn" onClick={() => router.push('/starfield')}>
            🗺️ Starfield
          </button>
          <button className="nav-btn" onClick={() => router.push('/market')}>
            🏪 Market
          </button>
          <button className="nav-btn active">
            <span className="nav-btn-content">
              📜 Combat Logs
              {hasUnreadReports && <span className="combat-report-dot" aria-label="Unread combat reports" />}
            </span>
          </button>
        </div>
        <div className="header-right">
          <button onClick={logout} className="logout-btn">
            Logout
          </button>
        </div>
      </header>

      <button
        type="button"
        className={`mobile-drawer-backdrop ${isMobileMenuOpen ? 'open' : ''}`}
        aria-label="Close navigation menu"
        onClick={() => setIsMobileMenuOpen(false)}
      />

      <aside className={`mobile-drawer ${isMobileMenuOpen ? 'open' : ''}`}>
        <div className="mobile-drawer-links">
          <button
            className="nav-btn"
            onClick={() => {
              setIsMobileMenuOpen(false);
              router.push('/');
            }}
          >
            📊 All Nexuses
          </button>
          <button
            className="nav-btn"
            onClick={() => {
              setIsMobileMenuOpen(false);
              router.push('/starfield');
            }}
          >
            🗺️ Starfield
          </button>
          <button
            className="nav-btn"
            onClick={() => {
              setIsMobileMenuOpen(false);
              router.push('/market');
            }}
          >
            🏪 Market
          </button>
          <button className="nav-btn active" onClick={() => setIsMobileMenuOpen(false)}>
            <span className="nav-btn-content">
              📜 Combat Logs
              {hasUnreadReports && <span className="combat-report-dot" aria-label="Unread combat reports" />}
            </span>
          </button>
        </div>
        <div className="mobile-drawer-nexuses">
          <h3>Your Nexuses</h3>
          {nexuses.map((nexus) => (
            <div
              key={nexus._id}
              className={`nexus-item ${selectedNexus._id === nexus._id ? 'active' : ''}`}
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
        </div>
      </aside>

      <div className="game-content">
        <nav className="nexus-nav">
          <h3>Your Nexuses</h3>
          {nexuses.map((nexus) => (
            <div
              key={nexus._id}
              className={`nexus-item ${selectedNexus._id === nexus._id ? 'active' : ''}`}
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
          <Reports nexus={selectedNexus} />
        </main>
      </div>

      <AdBanner slot="0987654321" className="ad-banner-bottom" />
    </div>
  );
}
