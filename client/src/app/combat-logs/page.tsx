'use client';

import MobileNexusDrawer from '@/components/MobileNexusDrawer';
import NexusSidebar from '@/components/NexusSidebar';
import Reports from '@/components/Reports';
import { useAuth } from '@/context/AuthContext';
import { useFriendsUnread } from '@/hooks/useFriendsUnread';
import { getMyNexuses, getReadReportIds, getReports } from '@/services/api';
import '@/styles/Game.css';
import { Nexus } from '@/types/game';
import { Building2, LayoutDashboard, LogOut, Map as MapIcon, Menu, ScrollText, ShoppingCart, User, Users } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

export default function CombatLogsPage() {
  const [nexuses, setVillages] = useState<Nexus[]>([]);
  const [selectedNexus, setSelectedNexus] = useState<Nexus | null>(null);
  const [hasUnreadReports, setHasUnreadReports] = useState(false);
  const [unreadNexusIds, setUnreadNexusIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isNexusDrawerOpen, setIsNexusDrawerOpen] = useState(false);
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const hasUnreadFriends = useFriendsUnread();

  const refreshCombatReportNotification = useCallback(async (allNexuses: Nexus[]) => {
    if (allNexuses.length === 0) {
      setHasUnreadReports(false);
      setUnreadNexusIds(new Set());
      return;
    }

    try {
      const [readIdsRes, ...reportResults] = await Promise.allSettled([
        getReadReportIds(),
        ...allNexuses.map((nexus) => getReports(nexus._id)),
      ]);
      const readIds = new Set<string>(readIdsRes.status === 'fulfilled' ? readIdsRes.value.data : []);
      const unread = new Set<string>();
      reportResults.forEach((result, idx) => {
        if (result.status !== 'fulfilled') return;
        const reports = Array.isArray(result.value.data) ? result.value.data : [];
        if (reports.some((report: { _id: string }) => !readIds.has(report._id))) {
          unread.add(String(allNexuses[idx]._id));
        }
      });
      setUnreadNexusIds(unread);
      setHasUnreadReports(unread.size > 0);
    } catch {
      setHasUnreadReports(false);
      setUnreadNexusIds(new Set());
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
      <header className="game-header">
        <div className="header-left">
          <button
            className="menu-toggle"
            onClick={() => setIsMobileMenuOpen((prev) => !prev)}
            aria-label="Toggle navigation menu"
            aria-expanded={isMobileMenuOpen}
          >
            <Menu size={18} />
          </button>
          <h1>Vexara</h1>
          <span className="username">welcome, {user?.username}</span>
        </div>
        <div className="header-center">
          <button className="nav-btn" onClick={() => router.push('/')}>
            <LayoutDashboard size={14} /> Dashboard
          </button>
          <button className="nav-btn" onClick={() => router.push('/starfield')}>
            <MapIcon size={14} /> Starfield
          </button>
          <button className="nav-btn" onClick={() => router.push('/market')}>
            <ShoppingCart size={14} /> Market
          </button>
          <button className="nav-btn active">
            <span className="nav-btn-content">
              <ScrollText size={14} /> Combat Logs
              {hasUnreadReports && <span className="combat-report-dot" aria-label="Unread combat reports" />}
            </span>
          </button>
          <button className="nav-btn" onClick={() => router.push('/allies')}>
            <span className="nav-btn-content">
              <Users size={14} /> Allies
              {hasUnreadFriends && <span className="combat-report-dot" aria-label="Unread ally activity" />}
            </span>
          </button>
          <button className="nav-btn" onClick={() => router.push('/profile')}>
            <User size={14} /> Profile
          </button>
        </div>
        <div className="header-right">
          <button
            className="nexus-drawer-toggle"
            onClick={() => setIsNexusDrawerOpen((v) => !v)}
            aria-label="Toggle nexus panel"
            title="Your Nexuses"
          >
            <Building2 size={18} />
          </button>
          <button onClick={logout} className="logout-btn">
            Logout
          </button>
        </div>
      </header>

      <MobileNexusDrawer
        nexuses={nexuses}
        selectedNexusId={String(selectedNexus._id)}
        onSelectNexus={handleSelectNexus}
        isOpen={isNexusDrawerOpen}
        onClose={() => setIsNexusDrawerOpen(false)}
        unreadNexusIds={unreadNexusIds}
      />

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
            <LayoutDashboard size={14} /> Dashboard
          </button>
          <button
            className="nav-btn"
            onClick={() => {
              setIsMobileMenuOpen(false);
              router.push('/starfield');
            }}
          >
            <MapIcon size={14} /> Starfield
          </button>
          <button
            className="nav-btn"
            onClick={() => {
              setIsMobileMenuOpen(false);
              router.push('/market');
            }}
          >
            <ShoppingCart size={14} /> Market
          </button>
          <button className="nav-btn active" onClick={() => setIsMobileMenuOpen(false)}>
            <span className="nav-btn-content">
              <ScrollText size={14} /> Combat Logs
              {hasUnreadReports && <span className="combat-report-dot" aria-label="Unread combat reports" />}
            </span>
          </button>
          <button
            className="nav-btn"
            onClick={() => {
              setIsMobileMenuOpen(false);
              router.push('/allies');
            }}
          >
            <span className="nav-btn-content">
              <Users size={14} /> Allies
              {hasUnreadFriends && <span className="combat-report-dot" aria-label="Unread ally activity" />}
            </span>
          </button>
          <button
            className="nav-btn"
            onClick={() => {
              setIsMobileMenuOpen(false);
              router.push('/profile');
            }}
          >
            <User size={14} /> Profile
          </button>
          <button className="nav-btn mobile-drawer-logout" onClick={logout}>
            <LogOut size={14} /> Logout
          </button>
        </div>
      </aside>

      <div className="game-content">
        <NexusSidebar
          nexuses={nexuses}
          selectedNexusId={String(selectedNexus._id)}
          onSelectNexus={handleSelectNexus}
          unreadNexusIds={unreadNexusIds}
        />

        <main className="main-content">
          <Reports nexus={selectedNexus} onReadStateChange={() => refreshCombatReportNotification(nexuses)} />
        </main>
      </div>
    </div>
  );
}
