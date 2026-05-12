'use client';

import { DocsDropdown, DocsMobileLinks } from '@/components/DocsDropdown';
import MobileNexusDrawer from '@/components/MobileNexusDrawer';
import NexusSidebar from '@/components/NexusSidebar';
import { useAuth } from '@/context/AuthContext';
import { TROOPS_DOC } from '@/data/gameDocs';
import { useFriendsUnread } from '@/hooks/useFriendsUnread';
import { getMyNexuses, getReadReportIds, getReports } from '@/services/api';
import '@/styles/Game.css';
import { Nexus } from '@/types/game';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import annihilatorplatformImg from '@/assets/troops/annihilatorplatform.png';
import assaulttrooperImg from '@/assets/troops/assaulttrooper.png';
import breakerunitImg from '@/assets/troops/breakerunit.png';
import bulwarkguardImg from '@/assets/troops/bulwarkguard.png';
import disruptorunitImg from '@/assets/troops/disruptorunit.png';
import interceptorbikeImg from '@/assets/troops/interceptorbike.png';
import lancerdroneImg from '@/assets/troops/lancerdrone.png';
import overseerImg from '@/assets/troops/overseer.png';
import reconoperativeImg from '@/assets/troops/reconoperative.png';
import siegemechImg from '@/assets/troops/siegemech.png';
import skimmerbikeImg from '@/assets/troops/skimmerbike.png';
import suppressorteamImg from '@/assets/troops/suppressorteam.png';

const STAT_LABELS = ['Attack', 'Defense', 'Speed', 'Carry'] as const;

const TROOP_IMAGES: Record<string, { src?: string } | string> = {
  assaultTrooper: assaulttrooperImg,
  lancerDrone: lancerdroneImg,
  breakerUnit: breakerunitImg,
  reconOperative: reconoperativeImg,
  skimmerBike: skimmerbikeImg,
  siegeMech: siegemechImg,
  bulwarkGuard: bulwarkguardImg,
  suppressorTeam: suppressorteamImg,
  disruptorUnit: disruptorunitImg,
  interceptorBike: interceptorbikeImg,
  annihilatorPlatform: annihilatorplatformImg,
  overseer: overseerImg,
};

const TROOP_ORDER = TROOPS_DOC.map((t) => t.key);
const TROOP_NAME_BY_KEY: Record<string, string> = Object.fromEntries(TROOPS_DOC.map((t) => [t.key, t.name]));

export default function TroopsPage() {
  const [nexuses, setNexuses] = useState<Nexus[]>([]);
  const [selectedNexusId, setSelectedNexusId] = useState<string | null>(null);
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

  const loadNexuses = useCallback(async () => {
    try {
      const response = await getMyNexuses();
      const all = response.data;
      setNexuses(all);
      await refreshCombatReportNotification(all);

      const stored = localStorage.getItem('selectedNexusId');
      if (stored) setSelectedNexusId(stored);
      else if (all.length > 0) setSelectedNexusId(String(all[0]._id));

      setLoading(false);
    } catch (err) {
      console.error('Error loading nexuses:', err);
      setLoading(false);
    }
  }, [refreshCombatReportNotification]);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

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

  const handleSelectNexus = (nexus: Nexus) => {
    localStorage.setItem('selectedNexusId', String(nexus._id));
    setSelectedNexusId(String(nexus._id));
    setIsMobileMenuOpen(false);
    router.push(`/nexus/${nexus._id}`);
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
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
            ☰
          </button>
          <h1>Neon Dominion</h1>
          <span className="username">NOTwelcome, {user?.username}</span>
        </div>
        <div className="header-center">
          <button className="nav-btn" onClick={() => router.push('/')}>
            📊 Dashboard
          </button>
          <button className="nav-btn" onClick={() => router.push('/starfield')}>
            🗺️ Starfield
          </button>
          <button className="nav-btn" onClick={() => router.push('/market')}>
            🏪 Market
          </button>
          <button className="nav-btn" onClick={() => router.push('/combat-logs')}>
            <span className="nav-btn-content">
              📜 Combat Logs
              {hasUnreadReports && <span className="combat-report-dot" aria-label="Unread combat reports" />}
            </span>
          </button>
          <button className="nav-btn" onClick={() => router.push('/allies')}>
            <span className="nav-btn-content">
              🤝 Allies
              {hasUnreadFriends && <span className="combat-report-dot" aria-label="Unread ally activity" />}
            </span>
          </button>
          <button className="nav-btn" onClick={() => router.push('/profile')}>
            👤 Profile
          </button>
          <DocsDropdown />
        </div>
        <div className="header-right">
          <button
            className="nexus-drawer-toggle"
            onClick={() => setIsNexusDrawerOpen((v) => !v)}
            aria-label="Toggle nexus panel"
            title="Your Nexuses"
          >
            🏛️
          </button>
          <button onClick={logout} className="logout-btn">
            Logout
          </button>
        </div>
      </header>

      <MobileNexusDrawer
        nexuses={nexuses}
        selectedNexusId={selectedNexusId}
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
            📊 Dashboard
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
          <button
            className="nav-btn"
            onClick={() => {
              setIsMobileMenuOpen(false);
              router.push('/combat-logs');
            }}
          >
            <span className="nav-btn-content">
              📜 Combat Logs
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
              🤝 Allies
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
            👤 Profile
          </button>
          <DocsMobileLinks onNavigate={() => setIsMobileMenuOpen(false)} />
          <button className="nav-btn mobile-drawer-logout" onClick={logout}>
            🚪 Logout
          </button>
        </div>
      </aside>

      <div className="game-content">
        <NexusSidebar
          nexuses={nexuses}
          selectedNexusId={selectedNexusId}
          onSelectNexus={handleSelectNexus}
          unreadNexusIds={unreadNexusIds}
        />

        <main className="main-content">
          <section className="docs-page-card my-forces-card">
            <h2>My Forces</h2>
            <p className="docs-subtitle">All troops stationed across your nexuses, grouped per nexus.</p>

            {nexuses.length === 0 ? (
              <p className="my-forces-empty">You have no nexuses yet.</p>
            ) : (
              (() => {
                const nexusesWithTroops = nexuses.filter((n) =>
                  TROOP_ORDER.some((key) => Number((n.troops as Record<string, number>)?.[key] || 0) > 0),
                );
                if (nexusesWithTroops.length === 0) {
                  return (
                    <p className="my-forces-empty">No troops stationed yet. Train some from the nexus Troops tab.</p>
                  );
                }
                return (
                  <div className="my-forces-list">
                    {nexusesWithTroops.map((nexus) => {
                      const entries = TROOP_ORDER.map((key) => ({
                        key,
                        count: Number((nexus.troops as Record<string, number>)?.[key] || 0),
                      })).filter((e) => e.count > 0);
                      const total = entries.reduce((sum, e) => sum + e.count, 0);
                      return (
                        <div key={String(nexus._id)} className="my-forces-nexus">
                          <button
                            type="button"
                            className="my-forces-nexus-header"
                            onClick={() => router.push(`/nexus/${nexus._id}?tab=troops`)}
                            aria-label={`Open ${nexus.name} troops tab`}
                          >
                            <span className="my-forces-nexus-name">
                              🏛️ {nexus.name}
                              <span className="my-forces-nexus-coords">
                                {' '}
                                ({nexus.x}, {nexus.y})
                              </span>
                            </span>
                            <span className="my-forces-nexus-total">{total.toLocaleString()} troops</span>
                          </button>
                          <div className="my-forces-grid">
                            {entries.map(({ key, count }) => {
                              const img = TROOP_IMAGES[key];
                              const src = typeof img === 'string' ? img : img?.src;
                              return (
                                <div key={key} className="my-forces-troop">
                                  <div className="troop-card-image-wrap">
                                    {src && (
                                      <img src={src} alt={TROOP_NAME_BY_KEY[key] || key} className="troop-card-image" />
                                    )}
                                    <span className="troop-stationed-overlay">
                                      <span className="troop-stationed-dot" />
                                      {count} stationed
                                    </span>
                                  </div>
                                  <div className="my-forces-troop-name">{TROOP_NAME_BY_KEY[key] || key}</div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()
            )}
          </section>

          <section className="docs-page-card">
            <h2>Troop Compendium</h2>
            <p className="docs-subtitle">
              Full reference for every unit: role, combat profile, costs, and unlock requirements.
            </p>

            <div className="docs-grid">
              {TROOPS_DOC.map((troop) => (
                <article key={troop.key} className="docs-item-card">
                  <h3>
                    {troop.icon} {troop.name}
                  </h3>
                  <p className="docs-role">
                    <strong>Role:</strong> {troop.role}
                  </p>
                  <p className="docs-description">{troop.description}</p>

                  <div className="docs-tags">
                    {STAT_LABELS.map((label) => {
                      const value =
                        label === 'Attack'
                          ? troop.stats.attack
                          : label === 'Defense'
                            ? troop.stats.defense
                            : label === 'Speed'
                              ? troop.stats.speed
                              : troop.stats.carry;
                      return (
                        <span key={label} className="docs-tag">
                          {label}: {value}
                        </span>
                      );
                    })}
                  </div>

                  <p className="docs-line">
                    <strong>Cost:</strong> 🧬 {troop.cost.biomass} | ⚙️ {troop.cost.alloy} | 💎 {troop.cost.ore} | 👥{' '}
                    {troop.cost.population} | ⏱️ {troop.cost.time}
                  </p>
                  <p className="docs-line">
                    <strong>Requirements:</strong> {troop.requirements.join(', ')}
                  </p>

                  {troop.notes && troop.notes.length > 0 && (
                    <ul className="docs-notes">
                      {troop.notes.map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                  )}
                </article>
              ))}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
