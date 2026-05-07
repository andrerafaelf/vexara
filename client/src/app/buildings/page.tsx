'use client';

import { DocsDropdown, DocsMobileLinks } from '@/components/DocsDropdown';
import MobileNexusDrawer from '@/components/MobileNexusDrawer';
import NexusSidebar from '@/components/NexusSidebar';
import { useAuth } from '@/context/AuthContext';
import { BUILDINGS_DOC, BUILDING_SCALING_DOC } from '@/data/gameDocs';
import { getMyNexuses, getReadReportIds, getReports } from '@/services/api';
import '@/styles/Game.css';
import { Nexus } from '@/types/game';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

export default function BuildingsPage() {
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
          <span className="username">Welcome, {user?.username}</span>
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
          <section className="docs-page-card">
            <h2>Building Compendium</h2>
            <p className="docs-subtitle">Deep reference for building costs, unlock gates, milestones, and impact.</p>

            <article className="docs-item-card docs-scaling-card">
              <h3>Scaling Rules</h3>
              <p className="docs-line">
                <strong>Cost multipliers:</strong> early {BUILDING_SCALING_DOC.costScaling.early}, mid{' '}
                {BUILDING_SCALING_DOC.costScaling.mid}, late {BUILDING_SCALING_DOC.costScaling.late}
              </p>
              <p className="docs-line">
                <strong>Time multipliers:</strong> early {BUILDING_SCALING_DOC.timeScaling.early}, mid{' '}
                {BUILDING_SCALING_DOC.timeScaling.mid}, late {BUILDING_SCALING_DOC.timeScaling.late}
              </p>
              <ul className="docs-notes">
                {BUILDING_SCALING_DOC.stages.map((stage) => (
                  <li key={stage}>{stage}</li>
                ))}
              </ul>
            </article>

            <div className="docs-grid">
              {BUILDINGS_DOC.map((building) => (
                <article key={building.key} className="docs-item-card">
                  <h3>
                    {building.icon} {building.name}
                  </h3>
                  <p className="docs-role">
                    <strong>Role:</strong> {building.role}
                  </p>
                  <p className="docs-description">{building.description}</p>
                  <p className="docs-line">
                    <strong>Base Cost:</strong> 🧬 {building.baseCost.biomass} | ⚙️ {building.baseCost.alloy} | 💎{' '}
                    {building.baseCost.ore} | ⏱️ {building.baseCost.timeSeconds}s
                  </p>
                  <p className="docs-line">
                    <strong>Max Level:</strong> {building.maxLevel}
                  </p>
                  {building.unlock && (
                    <p className="docs-line">
                      <strong>Unlock:</strong> {building.unlock}
                    </p>
                  )}
                  <p className="docs-line">
                    <strong>Milestones:</strong>
                  </p>
                  <ul className="docs-notes">
                    {building.milestones.map((m) => (
                      <li key={`${building.key}-${m.level}`}>
                        Lv{m.level}: {m.requires.join(', ')}
                      </li>
                    ))}
                  </ul>
                  <p className="docs-line">
                    <strong>Impact:</strong>
                  </p>
                  <ul className="docs-notes">
                    {building.impact.map((effect) => (
                      <li key={effect}>{effect}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </section>
        </main>
      </div>

    </div>
  );
}
