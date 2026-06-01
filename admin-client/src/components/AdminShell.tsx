'use client';
import {
  // nav icons
  Activity, BarChart2, Flag, Globe, LogOut, Menu, Radio, Shield,
  Users, X
} from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import '../styles/Admin.css';
import type { AdminFaction, AllUser, Galaxy } from '../types/admin';
import AnalyticsPage from './pages/AnalyticsPage';
import BroadcastPage from './pages/BroadcastPage';
import FactionsPage from './pages/FactionsPage';
import GalaxiesPage from './pages/GalaxiesPage';
import OverviewPage from './pages/OverviewPage';
import PlayersPage from './pages/PlayersPage';
import ToastStack, { type ToastMessage, mkToastId } from './shared/Toast';

const API = process.env.NEXT_PUBLIC_ADMIN_API_URL || 'http://localhost:3002/api/admin';

type Page = 'overview' | 'analytics' | 'galaxies' | 'players' | 'factions' | 'broadcast';

const NAV_ITEMS: { page: Page; label: string; icon: React.ReactNode }[] = [
  { page: 'overview',   label: 'Overview',   icon: <Activity size={15} /> },
  { page: 'analytics',  label: 'Analytics',  icon: <BarChart2 size={15} /> },
  { page: 'galaxies',   label: 'Galaxies',   icon: <Globe size={15} /> },
  { page: 'players',    label: 'Players',    icon: <Users size={15} /> },
  { page: 'factions',   label: 'Factions',   icon: <Shield size={15} /> },
  { page: 'broadcast',  label: 'Broadcast',  icon: <Radio size={15} /> },
];

const PAGE_TITLES: Record<Page, string> = {
  overview:  'Overview',
  analytics: 'Analytics',
  galaxies:  'Galaxies',
  players:   'Players',
  factions:  'Factions',
  broadcast: 'Broadcast',
};

interface Props { onLogout: () => void; }

export default function AdminShell({ onLogout }: Props) {
  const [page, setPage]       = useState<Page>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toasts, setToasts]   = useState<ToastMessage[]>([]);

  // Cross-page data
  const [allUsers, setAllUsers]     = useState<AllUser[]>([]);
  const [galaxies, setGalaxies]     = useState<Galaxy[]>([]);
  const [factions, setFactions]     = useState<AdminFaction[]>([]);
  const [selectedGalaxyId, setSelectedGalaxyId] = useState<number | null>(null);

  const adminFetch = useCallback(async (url: string, options: RequestInit = {}): Promise<Response> => {
    const token = sessionStorage.getItem('admin_basic_auth');
    const headers = new Headers(options.headers || {});
    if (token) headers.set('Authorization', `Basic ${token}`);
    if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const response = await fetch(url, { ...options, headers });
    if (response.status === 401) {
      sessionStorage.removeItem('admin_basic_auth');
      onLogout();
    }
    return response;
  }, [onLogout]);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info') => {
    const id = mkToastId();
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const loadAllUsers = useCallback(async () => {
    try {
      const res = await adminFetch(`${API}/users/all`);
      const data = await res.json().catch(() => null);
      setAllUsers(Array.isArray(data) ? data : []);
    } catch { /* silent */ }
  }, [adminFetch]);

  const loadGalaxies = useCallback(async () => {
    try {
      const res = await adminFetch(`${API}/galaxies`);
      const data = await res.json().catch(() => null);
      const list: Galaxy[] = Array.isArray(data) ? data : [];
      setGalaxies(list);
      if (list.length > 0 && selectedGalaxyId == null) {
        const sorted = [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        const preferred = sorted.find((g) => g.status === 'active') ?? sorted[0];
        setSelectedGalaxyId(preferred.id);
      }
    } catch { /* silent */ }
  }, [adminFetch, selectedGalaxyId]);

  const loadFactions = useCallback(async () => {
    if (selectedGalaxyId == null) return;
    try {
      const res = await adminFetch(`${API}/factions?galaxyId=${selectedGalaxyId}`);
      const data = await res.json().catch(() => null);
      setFactions(Array.isArray(data) ? data : []);
    } catch { /* silent */ }
  }, [adminFetch, selectedGalaxyId]);

  useEffect(() => {
    loadAllUsers();
    loadGalaxies();
  }, []);

  useEffect(() => {
    if (selectedGalaxyId != null) loadFactions();
  }, [selectedGalaxyId, loadFactions]);

  // Close sidebar on page change (mobile)
  const navigate = (p: Page) => {
    setPage(p);
    setSidebarOpen(false);
  };

  const flaggedCount   = allUsers.filter((u) => u.isFlagged).length;
  const unverified     = allUsers.filter((u) => !u.emailVerified).length;

  const reloadFactions = useCallback(() => {
    loadFactions();
    loadGalaxies();
  }, [loadFactions, loadGalaxies]);

  return (
    <div className="shell">
      {/* Sidebar overlay (mobile) */}
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
        <div className="sidebar-brand">
          <div className="sidebar-logo">
            <img src="/vexara-logo.png" alt="Vexara" />
          </div>
          <div className="sidebar-brand-text">
            <span className="sidebar-brand-name">Vexara</span>
            <span className="sidebar-brand-sub">Admin Console</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <span className="sidebar-section-label">Navigation</span>
          {NAV_ITEMS.map(({ page: p, label, icon }) => {
            let badge: React.ReactNode = null;
            if (p === 'players' && (unverified > 0 || flaggedCount > 0)) {
              if (flaggedCount > 0)   badge = <span className="sidebar-badge sidebar-badge-warn">{flaggedCount}</span>;
              else if (unverified > 0) badge = <span className="sidebar-badge">{unverified}</span>;
            }
            if (p === 'factions' && factions.length > 0) {
              badge = <span className="sidebar-badge">{factions.length}</span>;
            }
            return (
              <button
                key={p}
                className={`sidebar-link${page === p ? ' active' : ''}`}
                onClick={() => navigate(p)}
              >
                <span className="sidebar-link-icon">{icon}</span>
                <span className="sidebar-link-label">{label}</span>
                {badge}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <button className="sidebar-link" onClick={onLogout} style={{ color: 'var(--danger)' }}>
            <span className="sidebar-link-icon" style={{ color: 'var(--danger)' }}><LogOut size={15} /></span>
            <span className="sidebar-link-label">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="shell-main">
        <header className="shell-topbar">
          <div className="shell-topbar-left">
            <button className="shell-hamburger" onClick={() => setSidebarOpen((v) => !v)} aria-label="Toggle menu">
              {sidebarOpen ? <X size={16} /> : <Menu size={16} />}
            </button>
            <span className="shell-page-title">{PAGE_TITLES[page]}</span>
          </div>
          <div className="shell-topbar-right">
            {flaggedCount > 0 && (
              <button
                className="btn btn-warning btn-sm"
                onClick={() => navigate('players')}
                title="Flagged accounts need review"
              >
                <Flag size={12} /> {flaggedCount} flagged
              </button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={onLogout}>
              <LogOut size={12} /> Sign out
            </button>
          </div>
        </header>

        <div className="shell-content">
          {page === 'overview'  && <OverviewPage  adminFetch={adminFetch} />}
          {page === 'analytics' && <AnalyticsPage adminFetch={adminFetch} />}
          {page === 'galaxies'  && <GalaxiesPage adminFetch={adminFetch} showToast={showToast} />}
          {page === 'players'   && <PlayersPage  adminFetch={adminFetch} showToast={showToast} />}
          {page === 'factions'  && (
            <FactionsPage
              adminFetch={adminFetch}
              showToast={showToast}
              galaxies={galaxies}
              selectedGalaxyId={selectedGalaxyId}
              onSelectGalaxy={setSelectedGalaxyId}
              factions={factions}
              onChanged={reloadFactions}
            />
          )}
          {page === 'broadcast' && <BroadcastPage adminFetch={adminFetch} showToast={showToast} />}
        </div>
      </div>

      <ToastStack toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
