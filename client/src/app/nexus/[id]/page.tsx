'use client';

import DominanceBar from '@/components/DominanceBar';
import HeaderResourceStrip from '@/components/HeaderResourceStrip';
import MobileNexusDrawer from '@/components/MobileNexusDrawer';
import NexusSidebar from '@/components/NexusSidebar';
import NexusView from '@/components/NexusView';
import PwaGuideModal from '@/components/PwaGuideModal';
import { useAuth } from '@/context/AuthContext';
import { useFriendsUnread } from '@/hooks/useFriendsUnread';
import { useUnreadReports } from '@/hooks/useUnreadReports';
import { getMyNexuses, getNexus } from '@/services/api';
import '@/styles/Game.css';
import { Nexus } from '@/types/game';
import { Building2, LayoutDashboard, LogOut, Map as MapIcon, Menu, ScrollText, ShoppingCart, User, Users } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

const PWA_GUIDE_SEEN_KEY = 'pwa_guide_seen';

const SELECTED_NEXUS_KEY = 'selectedNexusId';

type NexusTab = 'overview' | 'buildings' | 'troops' | 'map';

function parseTab(value: string | null): NexusTab {
  if (value === 'buildings' || value === 'troops' || value === 'map') {
    return value;
  }

  return 'overview';
}

export default function NexusPage() {
  const { hasUnreadReports, unreadNexusIds } = useUnreadReports();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isNexusDrawerOpen, setIsNexusDrawerOpen] = useState(false);
  const [showPwaGuide, setShowPwaGuide] = useState(false);
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const hasUnreadFriends = useFriendsUnread();
  const searchParams = useSearchParams();
  const params = useParams();
  const nexusId = params.id as string;
  const activeTab = parseTab(searchParams.get('tab'));

  const { data: nexusesData, refetch: refetchNexuses } = useQuery({
    queryKey: ['myNexuses'],
    queryFn: () => getMyNexuses().then((r) => r.data as Nexus[]),
    refetchInterval: 30000,
    enabled: typeof window !== 'undefined' && !!localStorage.getItem('token'),
  });

  const { data: selectedNexusData, refetch: refetchSelectedNexus } = useQuery({
    queryKey: ['nexus', nexusId],
    queryFn: () => getNexus(nexusId).then((r) => r.data as Nexus),
    refetchInterval: 30000,
    enabled: !!nexusId && typeof window !== 'undefined' && !!localStorage.getItem('token'),
  });

  const nexuses: Nexus[] = nexusesData ?? [];
  const selectedNexus: Nexus | null = selectedNexusData ?? null;
  const loading = !nexusesData && !selectedNexusData;

  const loadVillages = () => {
    refetchNexuses();
    refetchSelectedNexus();
  };

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!localStorage.getItem(PWA_GUIDE_SEEN_KEY)) {
      setShowPwaGuide(true);
      localStorage.setItem(PWA_GUIDE_SEEN_KEY, '1');
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (nexuses.length > 0) {
      const routeNexusId = nexuses.find((nexus: Nexus) => String(nexus._id) === nexusId)?._id;
      const storedNexusId = localStorage.getItem(SELECTED_NEXUS_KEY);
      const storedValidNexusId = nexuses.find((nexus: Nexus) => nexus._id === storedNexusId)?._id;
      const fallbackNexusId = routeNexusId ?? storedValidNexusId ?? nexuses[0]._id;
      localStorage.setItem(SELECTED_NEXUS_KEY, fallbackNexusId);
      if (!routeNexusId) {
        router.replace(`/nexus/${fallbackNexusId}`);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nexuses.length, nexusId]);

  useEffect(() => {
    if (selectedNexusData) {
      localStorage.setItem(SELECTED_NEXUS_KEY, String(selectedNexusData._id));
    }
  }, [selectedNexusData]);

  const handleSelectNexus = (nexus: Nexus) => {
    setIsMobileMenuOpen(false);
    localStorage.setItem(SELECTED_NEXUS_KEY, String(nexus._id));
    const tabParam = searchParams.get('tab');
    const query = tabParam ? `?tab=${tabParam}` : '';
    router.push(`/nexus/${nexus._id}${query}`);
  };

  const handleTabChange = (tab: NexusTab) => {
    const query = tab === 'overview' ? '' : `?tab=${tab}`;
    router.replace(`/nexus/${nexusId}${query}`);
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (!selectedNexus) {
    return <div className="loading">Nexus not found</div>;
  }

  return (
    <>
      {showPwaGuide && <PwaGuideModal onClose={() => setShowPwaGuide(false)} />}
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
            <div className="header-nav-btns">
              <button className="nav-btn active" onClick={() => router.push(`/nexus/${selectedNexus._id}`)}>
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
                  <Users size={14} /> Allies
                  {hasUnreadFriends && <span className="combat-report-dot" aria-label="Unread ally activity" />}
                </span>
              </button>
              <button className="nav-btn" onClick={() => router.push('/factions')}>
                <Users size={14} /> Factions
              </button>
              <button className="nav-btn" onClick={() => router.push('/profile')}>
                <User size={14} /> Profile
              </button>
            </div>
          </div>
          <div className="header-center">
            <HeaderResourceStrip nexus={selectedNexus} />
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
          </div>
        </header>

        <DominanceBar />

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
          {user && (
            <div className="commander-card commander-card-mobile">
              <div className="commander-avatar" aria-hidden="true">
                {(user.username ?? '?').slice(0, 1).toUpperCase()}
              </div>
              <div className="commander-info">
                <div className="commander-name">{user.username}</div>
                <div className="commander-meta">
                  Commander · {nexuses.reduce((s, n) => s + (n.points ?? 0), 0).toLocaleString()} inf
                </div>
              </div>
            </div>
          )}
          <div className="mobile-drawer-links">
            <button
              className="nav-btn"
              onClick={() => {
                setIsMobileMenuOpen(false);
                router.push(`/nexus/${selectedNexus._id}`);
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
                <Users size={14} /> Allies
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
              <Users size={14} /> Factions
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
            user={user}
          />

          <main className="main-content">
            <NexusView
              nexus={selectedNexus}
              onUpdate={loadVillages}
              initialTab={activeTab}
              onTabChange={handleTabChange}
            />
          </main>
        </div>
      </div>
    </>
  );
}
