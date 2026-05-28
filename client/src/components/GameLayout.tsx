'use client';

import ConnectionStatusBar from '@/components/ConnectionStatusBar';
import ConqueredModal from '@/components/ConqueredModal';
import DominanceBar from '@/components/DominanceBar';
import TroopMovementsBar from '@/components/TroopMovementsBar';
import '@/styles/ConnectionStatusBar.css';
import MobileNexusDrawer from '@/components/MobileNexusDrawer';
import NexusSidebar from '@/components/NexusSidebar';
import { useAuth } from '@/context/AuthContext';
import { useFriendsUnread } from '@/hooks/useFriendsUnread';
import { useMyNexuses } from '@/hooks/useMyNexuses';
import { useNotificationBadges } from '@/hooks/useNotificationBadges';
import { useUnreadReports } from '@/hooks/useUnreadReports';
import '@/styles/Game.css';
import '@/styles/InGameIdentity.css';
import { Nexus } from '@/types/game';
import { Building2, Menu } from 'lucide-react';
import SupportTiersCard from '@/components/SupportTiersCard';
import Avatar from '@/components/Avatar';
import { usePathname, useRouter } from 'next/navigation';
import { startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import { useStartProgress } from './NavigationProgress';
import { useUserStats } from '@/features/social/useSocial';

type ActivePage = 'dashboard' | 'starfield' | 'market' | 'combat-logs' | 'allies' | 'factions' | 'players' | 'profile';

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
  const { user } = useAuth();
  useUserStats();
  const router = useRouter();
  const pathname = usePathname();
  const startProgress = useStartProgress();
  const hasUnreadFriends = useFriendsUnread();
  const { hasTokens, hasFactionAttention } = useNotificationBadges();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isNexusDrawerOpen, setIsNexusDrawerOpen] = useState(false);

  const resolvedSelectedId = externalSelectedId ?? (hookSelectedNexus ? String(hookSelectedNexus._id) : null);

  // Prefetch all sibling routes on mount so cross-page navigation is instant. Next caches
  // these aggressively (RSC payloads + JS chunks). Doing it once per layout mount is cheap.
  const prefetchTargets = useMemo(
    () => [
      resolvedSelectedId ? `/nexus/${resolvedSelectedId}` : null,
      '/starfield',
      '/market',
      '/combat-logs',
      '/allies',
      '/factions',
      '/players',
      '/profile',
    ].filter(Boolean) as string[],
    [resolvedSelectedId],
  );

  useEffect(() => {
    for (const href of prefetchTargets) {
      try { router.prefetch(href); } catch { /* prefetch is best-effort */ }
    }
  }, [prefetchTargets, router]);

  useEffect(() => {
    setIsMobileMenuOpen(false);
    setIsNexusDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (onNexusesReady) {
      onNexusesReady(nexuses, hookSelectedNexus, refetch);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nexuses.length, hookSelectedNexus?._id]);

  const handleSelectNexus = useCallback(
    (nexus: Nexus) => {
      localStorage.setItem('selectedNexusId', String(nexus._id));
      setIsMobileMenuOpen(false);
      if (onSelectNexus) {
        onSelectNexus(nexus);
      } else {
        startProgress();
        startTransition(() => router.push(`/nexus/${nexus._id}`));
      }
    },
    [onSelectNexus, router, startProgress],
  );

  const nav = useCallback(
    (href: string) => () => {
      setIsMobileMenuOpen(false);
      if (href === pathname) return;
      startProgress();
      startTransition(() => router.push(href));
    },
    [pathname, router, startProgress],
  );

  // Hover/focus prefetch on individual nav buttons, top-up over the mount-time prefetch
  // for cases where chunks may have been evicted, and a cheap signal that a click is coming.
  const prefetchOnHover = useCallback(
    (href: string) => () => {
      try { router.prefetch(href); } catch { /* best-effort */ }
    },
    [router],
  );

  const closeNexusDrawer = useCallback(() => setIsNexusDrawerOpen(false), []);

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
          <h1 className="vx-wordmark game-wordmark">
            <span className="vx-wordmark-stamp" aria-hidden="true">VX</span>
            <span className="vx-wordmark-name">Vexara</span>
          </h1>
        </div>

        <div className="header-center">
          <button className={`nav-btn${is('dashboard') ? ' active' : ''}`} onClick={nav(`/nexus/${resolvedSelectedId ?? ''}`)} onMouseEnter={prefetchOnHover(`/nexus/${resolvedSelectedId ?? ''}`)} onFocus={prefetchOnHover(`/nexus/${resolvedSelectedId ?? ''}`)}>
            Dashboard
          </button>
          <button className={`nav-btn${is('starfield') ? ' active' : ''}`} onClick={nav('/starfield')} onMouseEnter={prefetchOnHover('/starfield')} onFocus={prefetchOnHover('/starfield')}>
            Starfield
          </button>
          <button className={`nav-btn${is('market') ? ' active' : ''}`} onClick={nav('/market')} onMouseEnter={prefetchOnHover('/market')} onFocus={prefetchOnHover('/market')}>
            Market
          </button>
          <button className={`nav-btn${is('combat-logs') ? ' active' : ''}`} onClick={nav('/combat-logs')} onMouseEnter={prefetchOnHover('/combat-logs')} onFocus={prefetchOnHover('/combat-logs')}>
            <span className="nav-btn-content">
              Combat Logs
              {hasUnreadReports && <span className="nav-attention-mark" aria-label="Unread combat reports" />}
            </span>
          </button>
          <button className={`nav-btn${is('allies') ? ' active' : ''}`} onClick={nav('/allies')} onMouseEnter={prefetchOnHover('/allies')} onFocus={prefetchOnHover('/allies')}>
            <span className="nav-btn-content">
              Allies
              {(hasUnreadFriends || hasTokens) && <span className="nav-attention-mark" aria-label="Unread ally activity or tokens to redeem" />}
            </span>
          </button>
          <button className={`nav-btn${is('factions') ? ' active' : ''}`} onClick={nav('/factions')} onMouseEnter={prefetchOnHover('/factions')} onFocus={prefetchOnHover('/factions')}>
            <span className="nav-btn-content">
              Factions
              {hasFactionAttention && <span className="nav-attention-mark" aria-label="Faction action required" />}
            </span>
          </button>
          <button className={`nav-btn${is('players') ? ' active' : ''}`} onClick={nav('/players')} onMouseEnter={prefetchOnHover('/players')} onFocus={prefetchOnHover('/players')}>
            Players
          </button>
          <button className={`nav-btn${is('profile') ? ' active' : ''}`} onClick={nav('/profile')} onMouseEnter={prefetchOnHover('/profile')} onFocus={prefetchOnHover('/profile')}>
            Profile
          </button>
          <a href="/codex" target="_blank" rel="noopener noreferrer" className="nav-btn">
            Codex
          </a>
        </div>

        <div className="header-right">
          <button
            className={`nexus-drawer-toggle${isNexusDrawerOpen ? ' active' : ''}`}
            onClick={() => setIsNexusDrawerOpen((v) => !v)}
            aria-label="Toggle nexus panel"
            aria-expanded={isNexusDrawerOpen}
            title="Your Nexuses"
          >
            <Building2 size={18} />
          </button>
        </div>
      </header>

      <ConnectionStatusBar />
      <TroopMovementsBar />
      <DominanceBar />
      <ConqueredModal />

      <MobileNexusDrawer
        nexuses={nexuses}
        selectedNexusId={resolvedSelectedId}
        onSelectNexus={handleSelectNexus}
        isOpen={isNexusDrawerOpen}
        onClose={closeNexusDrawer}
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
            <Avatar
              username={user.username}
              avatarUrl={user.avatarUrl ?? null}
              avatarUrlSm={user.avatarUrlSm ?? null}
              size="md"
              className={`commander-avatar${user.supporterTier === 'officer' ? ' supporter-border supporter-border-officer' : ''}${user.supporterTier === 'commander' ? ' supporter-border supporter-border-commander' : ''}`}
              ariaHidden
            />
            <div className="commander-info">
              <div className={[
                'commander-name',
                user.isSupporter ? 'supporter-name' : null,
                user.supporterTier === 'recruit' ? 'supporter-tier-recruit' : null,
                user.supporterTier === 'officer' ? 'supporter-tier-officer' : null,
                user.supporterTier === 'commander' ? 'supporter-tier-commander' : null,
              ].filter(Boolean).join(' ')}>{user.username}</div>
              <div className="commander-meta">
                Commander · {nexuses.reduce((s, n) => s + (n.points ?? 0), 0).toLocaleString()} inf
              </div>
            </div>
          </div>
        )}
        <div className="mobile-drawer-links">
          <button className={`nav-btn${is('dashboard') ? ' active' : ''}`} onClick={nav(`/nexus/${resolvedSelectedId ?? ''}`)}>
            Dashboard
          </button>
          <button className={`nav-btn${is('starfield') ? ' active' : ''}`} onClick={nav('/starfield')}>
            Starfield
          </button>
          <button className={`nav-btn${is('market') ? ' active' : ''}`} onClick={nav('/market')}>
            Market
          </button>
          <button className={`nav-btn${is('combat-logs') ? ' active' : ''}`} onClick={nav('/combat-logs')}>
            <span className="nav-btn-content">
              Combat Logs
              {hasUnreadReports && <span className="nav-attention-mark" aria-label="Unread combat reports" />}
            </span>
          </button>
          <button className={`nav-btn${is('allies') ? ' active' : ''}`} onClick={nav('/allies')}>
            <span className="nav-btn-content">
              Allies
              {(hasUnreadFriends || hasTokens) && <span className="nav-attention-mark" aria-label="Unread ally activity or tokens to redeem" />}
            </span>
          </button>
          <button className={`nav-btn${is('factions') ? ' active' : ''}`} onClick={nav('/factions')}>
            <span className="nav-btn-content">
              Factions
              {hasFactionAttention && <span className="nav-attention-mark" aria-label="Faction action required" />}
            </span>
          </button>
          <button className={`nav-btn${is('players') ? ' active' : ''}`} onClick={nav('/players')}>
            Players
          </button>
          <button className={`nav-btn${is('profile') ? ' active' : ''}`} onClick={nav('/profile')}>
            Profile
          </button>
          <a href="/codex" target="_blank" rel="noopener noreferrer" className="nav-btn">
            Codex
          </a>
          <SupportTiersCard
            variant="compact"
            currentTier={user?.supporterTier ?? null}
            isFounder={user?.isFounder}
            isSupporter={user?.isSupporter}
          />
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
