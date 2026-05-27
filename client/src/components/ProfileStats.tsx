'use client';

import { useAuth } from '@/context/AuthContext';
import { getUserStats, changePassword, getMyNexuses, getDailyStreak } from '@/services/api';
import { Nexus, UserStats } from '@/types/game';
import { Bell, ExternalLink, Lock, LogOut, MapPin, User as UserIcon } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import '../styles/ProfileStats.css';
import NotificationSettings from './NotificationSettings';
import StatsChart from './StatsChart';
import { usePageReady } from './NavigationProgress';
import PageSkeleton from './PageSkeleton';
import SupportTiersCard from './SupportTiersCard';
import Username from './Username';
import Avatar from './Avatar';
import AvatarUpload from './AvatarUpload';

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(Math.round(n));
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="ps-card">
      <div className="ps-card-value">{value}</div>
      <div className="ps-card-label">{label}</div>
      {sub && <div className="ps-card-sub">{sub}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="ps-section">
      <h3 className="ps-section-title">{title}</h3>
      <div className="ps-section-body">{children}</div>
    </div>
  );
}

export default function ProfileStats() {
  const { logout, updateUser } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [nexuses, setNexuses] = useState<Nexus[]>([]);
  const [streak, setStreak] = useState<{ currentStreak: number; longestStreak: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'stats' | 'notifications' | 'security'>('stats');
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  usePageReady(!loading, 'profile');

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError(null);
    setPwSuccess(false);
    if (pwNew !== pwConfirm) { setPwError('New passwords do not match.'); return; }
    if (pwNew.length < 8) { setPwError('New password must be at least 8 characters.'); return; }
    setPwLoading(true);
    try {
      await changePassword(pwCurrent, pwNew);
      setPwSuccess(true);
      setPwCurrent('');
      setPwNew('');
      setPwConfirm('');
    } catch (err: any) {
      setPwError(err?.response?.data?.error ?? err.message ?? 'Something went wrong.');
    } finally {
      setPwLoading(false);
    }
  }

  useEffect(() => {
    Promise.all([
      getUserStats().then((res) => setStats(res.data)),
      getMyNexuses().then((res) => setNexuses(res.data)).catch(() => {}),
      getDailyStreak().then((res) => setStreak(res.data)).catch(() => {}),
    ])
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <PageSkeleton variant="rows" count={5} />;
  if (error) return <div className="ps-error">Failed to load stats: {error}</div>;
  if (!stats) return <PageSkeleton variant="rows" count={5} />;

  const winRate =
    stats.combat.victories + stats.combat.defeats > 0
      ? Math.round((stats.combat.victories / (stats.combat.victories + stats.combat.defeats)) * 100)
      : 0;

  const kd =
    stats.combat.troopsLost > 0
      ? (stats.combat.troopsKilled / stats.combat.troopsLost).toFixed(2)
      : stats.combat.troopsKilled > 0
        ? '∞'
        : '.';

  const totalStolen =
    stats.combat.resourcesStolen.biomass +
    stats.combat.resourcesStolen.alloy +
    stats.combat.resourcesStolen.ore;

  const totalLost =
    stats.combat.resourcesLost.biomass +
    stats.combat.resourcesLost.alloy +
    stats.combat.resourcesLost.ore;

  const totalAvgDay =
    stats.resources.avgPerDay.biomass +
    stats.resources.avgPerDay.alloy +
    stats.resources.avgPerDay.ore;

  return (
    <div className="profile-stats">
      <div className="ps-tabs">
        <button
          className={`ps-tab ${tab === 'stats' ? 'ps-tab--active' : ''}`}
          onClick={() => setTab('stats')}
        >
          <UserIcon size={14} aria-hidden="true" />
          <span>Stats</span>
        </button>
        <button
          className={`ps-tab ${tab === 'notifications' ? 'ps-tab--active' : ''}`}
          onClick={() => setTab('notifications')}
        >
          <Bell size={14} aria-hidden="true" />
          <span>Notifications</span>
        </button>
        <button
          className={`ps-tab ${tab === 'security' ? 'ps-tab--active' : ''}`}
          onClick={() => setTab('security')}
        >
          <Lock size={14} aria-hidden="true" />
          <span>Security</span>
        </button>
        <button className="ps-tab ps-tab--logout" onClick={logout}>
          <LogOut size={14} aria-hidden="true" />
          <span>Logout</span>
        </button>
      </div>

      {tab === 'notifications' && (
        <div className="ps-notif-panel">
          <NotificationSettings />
        </div>
      )}

      {tab === 'security' && (
        <div className="ps-security-panel">
          <h3 className="ps-section-title">Change password</h3>
          <form className="ps-pw-form" onSubmit={handleChangePassword}>
            <div className="ps-pw-field">
              <label className="ps-pw-label" htmlFor="pw-current">Current password</label>
              <input
                id="pw-current"
                className="ps-pw-input"
                type="password"
                autoComplete="current-password"
                value={pwCurrent}
                onChange={(e) => setPwCurrent(e.target.value)}
                required
              />
            </div>
            <div className="ps-pw-field">
              <label className="ps-pw-label" htmlFor="pw-new">New password</label>
              <input
                id="pw-new"
                className="ps-pw-input"
                type="password"
                autoComplete="new-password"
                value={pwNew}
                onChange={(e) => setPwNew(e.target.value)}
                required
              />
            </div>
            <div className="ps-pw-field">
              <label className="ps-pw-label" htmlFor="pw-confirm">Confirm new password</label>
              <input
                id="pw-confirm"
                className="ps-pw-input"
                type="password"
                autoComplete="new-password"
                value={pwConfirm}
                onChange={(e) => setPwConfirm(e.target.value)}
                required
              />
            </div>
            {pwError && <p className="ps-pw-error">{pwError}</p>}
            {pwSuccess && <p className="ps-pw-success">Password changed. A confirmation email has been sent.</p>}
            <button className="ps-pw-submit" type="submit" disabled={pwLoading}>
              {pwLoading ? 'Saving…' : 'Change password'}
            </button>
          </form>
        </div>
      )}

      {tab === 'stats' && <>
      <div className="ps-header">
        <Avatar
          username={stats.username}
          avatarUrl={stats.avatarUrl ?? null}
          avatarUrlSm={stats.avatarUrlSm ?? null}
          size="lg"
          className={`ps-avatar${stats.supporterTier === 'officer' ? ' supporter-border supporter-border-officer' : ''}${stats.supporterTier === 'commander' ? ' supporter-border supporter-border-commander' : ''}`}
          ariaHidden
        />
        <div className="ps-header-info">
          <h2 className="ps-username">
            <Username
              name={stats.username}
              isSupporter={stats.isSupporter}
              supporterTier={stats.supporterTier ?? null}
              isFounder={stats.isFounder}
            />
          </h2>
          <span className="ps-meta">
            {stats.points.toLocaleString()} influence · {stats.nexusCount} nexus{stats.nexusCount !== 1 ? 'es' : ''} · {stats.accountAgeDays}d played
          </span>
          <Link
            href={`/u/${encodeURIComponent(stats.username)}`}
            className="ps-meta"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4 }}
          >
            <ExternalLink size={12} aria-hidden="true" />
            <span>View public profile</span>
          </Link>
        </div>
      </div>

      {(stats.supporterTier === 'officer' || stats.supporterTier === 'commander') && (
        <AvatarUpload
          username={stats.username}
          avatarUrl={stats.avatarUrl ?? null}
          avatarUrlSm={stats.avatarUrlSm ?? null}
          onChange={(next) => {
            setStats((prev) => (prev ? { ...prev, avatarUrl: next.avatarUrl, avatarUrlSm: next.avatarUrlSm } : prev));
            // Mirror the new URLs into AuthContext so the sidebar updates immediately.
            updateUser({ avatarUrl: next.avatarUrl, avatarUrlSm: next.avatarUrlSm });
          }}
        />
      )}

      {streak && streak.currentStreak > 0 && (
        <div className="ps-streak-card">
          <div className="ps-streak-fire-bg" />
          <div className="ps-streak-content">
            <div className="ps-streak-info">
              <span className="ps-streak-label">Current Streak</span>
              <span className="ps-streak-value">{streak.currentStreak} day{streak.currentStreak !== 1 ? 's' : ''}</span>
            </div>
            {streak.longestStreak > streak.currentStreak && (
              <div className="ps-streak-best">
                <span className="ps-streak-best-label">Best</span>
                <span className="ps-streak-best-value">{streak.longestStreak}</span>
              </div>
            )}
          </div>
        </div>
      )}

      <Section title="Resources">
        <div className="ps-cards">
          <StatCard
            label="Avg Production / Day"
            value={fmt(totalAvgDay)}
            sub={`B ${fmt(stats.resources.avgPerDay.biomass)} · A ${fmt(stats.resources.avgPerDay.alloy)} · O ${fmt(stats.resources.avgPerDay.ore)}`}
          />
          <StatCard
            label="Production / Hour"
            value={fmt(stats.resources.productionPerHour.biomass + stats.resources.productionPerHour.alloy + stats.resources.productionPerHour.ore)}
            sub={`B ${fmt(stats.resources.productionPerHour.biomass)} · A ${fmt(stats.resources.productionPerHour.alloy)} · O ${fmt(stats.resources.productionPerHour.ore)}`}
          />
          <StatCard
            label="Current Stockpile"
            value={fmt(stats.resources.current.biomass + stats.resources.current.alloy + stats.resources.current.ore)}
            sub={`B ${fmt(stats.resources.current.biomass)} · A ${fmt(stats.resources.current.alloy)} · O ${fmt(stats.resources.current.ore)}`}
          />
        </div>

        <div className="ps-resource-bars">
          {(['biomass', 'alloy', 'ore'] as const).map((r) => {
            const total = stats.resources.avgPerDay.biomass + stats.resources.avgPerDay.alloy + stats.resources.avgPerDay.ore;
            const pct = total > 0 ? Math.round((stats.resources.avgPerDay[r] / total) * 100) : 33;
            // Match the in-game resource palette: biomass=success, alloy=accent (amber), ore=warning
            const colors = { biomass: '#56D364', alloy: '#FF9E3D', ore: '#D29922' };
            const labels = { biomass: 'Biomass', alloy: 'Alloy', ore: 'Ore' };
            return (
              <div key={r} className="ps-bar-row">
                <span className="ps-bar-label" style={{ color: colors[r] }}>{labels[r]}</span>
                <div className="ps-bar-track">
                  <div className="ps-bar-fill" style={{ width: `${pct}%`, background: colors[r] }} />
                </div>
                <span className="ps-bar-pct">{pct}%</span>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Combat">
        <div className="ps-cards">
          <StatCard label="Victories" value={stats.combat.victories} sub={`Win rate ${winRate}%`} />
          <StatCard label="Defeats" value={stats.combat.defeats} />
          <StatCard label="Attacks Launched" value={stats.combat.attacksLaunched} />
          <StatCard label="Attacks Defended" value={stats.combat.attacksDefended} />
          <StatCard label="Troops Killed" value={fmt(stats.combat.troopsKilled)} sub={`K/D ${kd}`} />
          <StatCard label="Troops Lost" value={fmt(stats.combat.troopsLost)} />
          <StatCard
            label="Resources Stolen"
            value={fmt(totalStolen)}
            sub={`B ${fmt(stats.combat.resourcesStolen.biomass)} · A ${fmt(stats.combat.resourcesStolen.alloy)} · O ${fmt(stats.combat.resourcesStolen.ore)}`}
          />
          <StatCard
            label="Resources Lost"
            value={fmt(totalLost)}
            sub={`B ${fmt(stats.combat.resourcesLost.biomass)} · A ${fmt(stats.combat.resourcesLost.alloy)} · O ${fmt(stats.combat.resourcesLost.ore)}`}
          />
        </div>
      </Section>

      <Section title="Empire">
        <div className="ps-cards">
          <StatCard label="Total Nexuses" value={stats.nexusCount} />
          <StatCard label="Total Troops" value={fmt(stats.totalTroops)} />
          <StatCard label="Influence" value={stats.points.toLocaleString()} />
          <StatCard label="Account Age" value={`${stats.accountAgeDays}d`} />
        </div>
      </Section>

      {nexuses.length > 0 && (
        <Section title="Your Nexuses">
          <div className="ps-nexus-list">
            {nexuses.map((n: any) => (
              <div key={n.id ?? n._id} className="ps-nexus-row">
                <div className="ps-nexus-info">
                  <button
                    className="ps-nexus-name"
                    onClick={() => router.push(`/nexus/${n.id ?? n._id}`)}
                  >
                    {n.name}
                  </button>
                  <span className="ps-nexus-meta">
                    {n.nexusType && <span className="ps-nexus-type">{n.nexusType}</span>}
                    {n.points != null && <span>{n.points} pts</span>}
                  </span>
                </div>
                <button
                  className="ps-nexus-coords"
                  onClick={() => router.push(`/nexus/${n.id ?? n._id}?tab=map&cx=${n.x}&cy=${n.y}`)}
                  title="Open on Starfield map"
                >
                  <MapPin size={12} aria-hidden="true" />
                  {n.x}|{n.y}
                </button>
              </div>
            ))}
          </div>
        </Section>
      )}

      <div className="ps-section">
        <h3 className="ps-section-title">Activity Graph</h3>
        <div style={{ padding: '0' }}>
          <StatsChart />
        </div>
      </div>

      <SupportTiersCard
        variant="full"
        currentTier={stats.supporterTier ?? null}
        isFounder={stats.isFounder}
        isSupporter={stats.isSupporter}
      />
      </>}
    </div>
  );
}
