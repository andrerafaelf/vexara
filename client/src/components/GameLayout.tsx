'use client';

import DominanceBar from '@/components/DominanceBar';
import MobileNexusDrawer from '@/components/MobileNexusDrawer';
import NexusSidebar from '@/components/NexusSidebar';
import { useAuth } from '@/context/AuthContext';
import { useFriendsUnread } from '@/hooks/useFriendsUnread';
import { useMyNexuses } from '@/hooks/useMyNexuses';
import { useUnreadReports } from '@/hooks/useUnreadReports';
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
import { useEffect, useState } from 'react';

type ActivePage = 'dashboard' | 'starfield' | 'market' | 'combat-logs' | 'allies' | 'factions' | 'profile';

interface GameLayoutProps {
  children: React.ReactNode;
  activePage?: ActivePage;
  /** Extra class(es) added to the <main> element */
  mainClassName?: string;
  /** Override which nexus is "selected" (nexus page drives this externally) */
  selectedNexusId?: string | null;
  onSelectNexus?: (nexus: Nexus) => void;
  /** Expose refetch to child page */
  onNexusesReady?: (nexuses: Nexus[], selectedNexus: Nexus | null, refetch: () => void) => void;
}

export default function GameLayout({
  children,
  activePage,
  mainClassName,
  selectedNexusId: externalSelectedId,
  onSelectNexus,
  onNexusesReady,
}: GameLayoutProps) {
  const { nexuses, selectedNexus: hookSelectedNexus, refetch } = useMyNexuses();
  const { hasUnreadReports, unreadNexusIds: _unreadNexusIds } = useUnreadReports();
  const unreadNexusIds = _unreadNexusIds as Set<string>;
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const hasUnreadFriends = useFriendsUnread();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isNexusDrawerOpen, setIsNexusDrawerOpen] = useState(false);

  const resolvedSelectedId = externalSelectedId ?? (hookSelectedNexus ? String(hookSelectedNexus._id) : null);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (onNexusesReady) {
      onNexusesReady(nexuses, hookSelectedNexus, refetch);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nexuses.length, hookSelectedNexus?._id]);

  const handleSelectNexus = (nexus: Nexus) => {
    localStorage.setItem('selectedNexusId', String(nexus._id));
    setIsMobileMenuOpen(false);
    if (onSelectNexus) {
      onSelectNexus(nexus);
    } else {
      router.push(`/nexus/${nexus._id}`);
    }
  };

  const nav = (href: string) => () => {
    setIsMobileMenuOpen(false);
    router.push(href);
  };

  const is = (page: ActivePage) => activePage === page;

  return (
    <div className="game-container">
      <header className="game-header">
        <div className="header-left">
          <button
            className="menu-toggle"
            onClick={() => setIsMobileMenuOpen((p) => !p)}
            aria-label="Toggle navigation menu"
            aria-expanded={isMobileMenuOpen}
          >
            <Menu size={18} />
          </button>
          <h1>Vexara</h1>
        </div>

        <div className="header-center">
          <button className={`nav-btn${is('dashboard') ? ' active' : ''}`} onClick={nav(`/nexus/${resolvedSelectedId ?? ''}`)}>
            <LayoutDashboard size={14} /> Dashboard
          </button>
          <button className={`nav-btn${is('starfield') ? ' active' : ''}`} onClick={nav('/starfield')}>
            <MapIcon size={14} /> Starfield
          </button>
          <button className={`nav-btn${is('market') ? ' active' : ''}`} onClick={nav('/market')}>
            <ShoppingCart size={14} /> Market
          </button>
          <button className={`nav-btn${is('combat-logs') ? ' active' : ''}`} onClick={nav('/combat-logs')}>
            <span className="nav-btn-content">
              <ScrollText size={14} /> Combat Logs
              {hasUnreadReports && <span className="combat-report-dot" aria-label="Unread combat reports" />}
            </span>
          </button>
          <button className={`nav-btn${is('allies') ? ' active' : ''}`} onClick={nav('/allies')}>
            <span className="nav-btn-content">
              <Handshake size={14} /> Allies
              {hasUnreadFriends && <span className="combat-report-dot" aria-label="Unread ally activity" />}
            </span>
          </button>
          <button className={`nav-btn${is('factions') ? ' active' : ''}`} onClick={nav('/factions')}>
            <Flag size={14} /> Factions
          </button>
          <button className={`nav-btn${is('profile') ? ' active' : ''}`} onClick={nav('/profile')}>
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
          {activePage !== 'dashboard' && (
            <button onClick={logout} className="logout-btn">
              Logout
            </button>
          )}
        </div>
      </header>

      <DominanceBar />

      <MobileNexusDrawer
        nexuses={nexuses}
        selectedNexusId={resolvedSelectedId}
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
          <button className={`nav-btn${is('dashboard') ? ' active' : ''}`} onClick={nav(`/nexus/${resolvedSelectedId ?? ''}`)}>
            <LayoutDashboard size={14} /> Dashboard
          </button>
          <button className={`nav-btn${is('starfield') ? ' active' : ''}`} onClick={nav('/starfield')}>
            <MapIcon size={14} /> Starfield
          </button>
          <button className={`nav-btn${is('market') ? ' active' : ''}`} onClick={nav('/market')}>
            <ShoppingCart size={14} /> Market
          </button>
          <button className={`nav-btn${is('combat-logs') ? ' active' : ''}`} onClick={nav('/combat-logs')}>
            <span className="nav-btn-content">
              <ScrollText size={14} /> Combat Logs
              {hasUnreadReports && <span className="combat-report-dot" aria-label="Unread combat reports" />}
            </span>
          </button>
          <button className={`nav-btn${is('allies') ? ' active' : ''}`} onClick={nav('/allies')}>
            <span className="nav-btn-content">
              <Handshake size={14} /> Allies
              {hasUnreadFriends && <span className="combat-report-dot" aria-label="Unread ally activity" />}
            </span>
          </button>
          <button className={`nav-btn${is('factions') ? ' active' : ''}`} onClick={nav('/factions')}>
            <Flag size={14} /> Factions
          </button>
          <button className={`nav-btn${is('profile') ? ' active' : ''}`} onClick={nav('/profile')}>
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
          selectedNexusId={resolvedSelectedId}
          onSelectNexus={handleSelectNexus}
          unreadNexusIds={unreadNexusIds}
          user={user}
        />
        <main className={`main-content${mainClassName ? ` ${mainClassName}` : ''}`}>
          {children}
        </main>
      </div>
    </div>
  );
}
