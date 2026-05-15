'use client';

import DominanceBar from '@/components/DominanceBar';
import MobileNexusDrawer from '@/components/MobileNexusDrawer';
import NexusSidebar from '@/components/NexusSidebar';
import ProfileStats from '@/components/ProfileStats';
import { useAuth } from '@/context/AuthContext';
import { useFriendsUnread } from '@/hooks/useFriendsUnread';
import { useUnreadReports } from '@/hooks/useUnreadReports';
import { getMyNexuses } from '@/services/api';
import '@/styles/Game.css';
import { Nexus } from '@/types/game';
import {
  Building2,
  Flag,
  Handshake,
  LayoutDashboard,
  LogOut,
  Map as MapIcon,
  Menu,
  ScrollText,
  ShoppingCart,
  User,
} from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

export default function ProfilePage() {
  const [nexuses, setNexuses] = useState<Nexus[]>([]);
  const [selectedNexus, setSelectedNexus] = useState<Nexus | null>(null);
  const { hasUnreadReports, unreadNexusIds } = useUnreadReports();
  const selectedInitialized = useRef(false);
  const [loading, setLoading] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isNexusDrawerOpen, setIsNexusDrawerOpen] = useState(false);
  const { logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const hasUnreadFriends = useFriendsUnread();

  const loadNexuses = useCallback(async () => {
    try {
      const response = await getMyNexuses();
      setNexuses(response.data);
      if (!selectedInitialized.current && response.data.length > 0) {
        selectedInitialized.current = true;
        const storedId = localStorage.getItem('selectedNexusId');
        const nexus = (storedId && response.data.find((n: Nexus) => String(n._id) === storedId)) || response.data[0];
        setSelectedNexus(nexus);
      }
      setLoading(false);
    } catch {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
      return;
    }
    loadNexuses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadNexuses]);

  const handleSelectNexus = (nexus: Nexus) => {
    localStorage.setItem('selectedNexusId', String(nexus._id));
    setSelectedNexus(nexus);
    setIsMobileMenuOpen(false);
  };

  if (loading) return <div className="loading">Loading...</div>;

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
          <button className="nav-btn" onClick={() => router.push('/combat-logs')}>
            <span className="nav-btn-content">
              <ScrollText size={14} /> Combat Logs
              {hasUnreadReports && <span className="combat-report-dot" aria-label="Unread combat reports" />}
            </span>
          </button>
          <button className="nav-btn" onClick={() => router.push('/allies')}>
            <span className="nav-btn-content">
              <Handshake size={14} /> Allies
              {hasUnreadFriends && <span className="combat-report-dot" aria-label="Unread ally activity" />}
            </span>
          </button>
          <button className="nav-btn" onClick={() => router.push('/factions')}>
            <Flag size={14} /> Factions
          </button>
          <button className="nav-btn active">
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

      <DominanceBar />

      {selectedNexus && (
        <MobileNexusDrawer
          nexuses={nexuses}
          selectedNexusId={String(selectedNexus._id)}
          onSelectNexus={handleSelectNexus}
          isOpen={isNexusDrawerOpen}
          onClose={() => setIsNexusDrawerOpen(false)}
          unreadNexusIds={unreadNexusIds}
        />
      )}

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
          <button
            className="nav-btn"
            onClick={() => {
              setIsMobileMenuOpen(false);
              router.push('/combat-logs');
            }}
          >
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
              <Handshake size={14} /> Allies
              {hasUnreadFriends && <span className="combat-report-dot" aria-label="Unread ally activity" />}
            </span>
          </button>
          <button
            className="nav-btn"
            onClick={() => {
              setIsMobileMenuOpen(false);
              router.push('/factions');
            }}
          >
            <Flag size={14} /> Factions
          </button>
          <button className="nav-btn active" onClick={() => setIsMobileMenuOpen(false)}>
            <User size={14} /> Profile
          </button>
          <button className="nav-btn mobile-drawer-logout" onClick={logout}>
            <LogOut size={14} /> Logout
          </button>
        </div>
      </aside>

      <div className="game-content">
        {selectedNexus && (
          <NexusSidebar
            nexuses={nexuses}
            selectedNexusId={String(selectedNexus._id)}
            onSelectNexus={handleSelectNexus}
            unreadNexusIds={unreadNexusIds}
          />
        )}
        <main className="main-content">
          <ProfileStats />
        </main>
      </div>
    </div>
  );
}
