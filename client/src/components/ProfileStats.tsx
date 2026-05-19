'use client';

import { useAuth } from '@/context/AuthContext';
import { getUserStats } from '@/services/api';
import { UserStats } from '@/types/game';
import { Bell, LogOut, User as UserIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import '../styles/ProfileStats.css';
import NotificationSettings from './NotificationSettings';
import StatsChart from './StatsChart';
import { usePageReady } from './NavigationProgress';

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
  const { logout } = useAuth();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'stats' | 'notifications'>('stats');
  usePageReady(!loading, 'profile');

  useEffect(() => {
    getUserStats()
      .then((res) => setStats(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;
  if (error) return <div className="ps-error">Failed to load stats: {error}</div>;
  if (!stats) return null;

  const winRate =
    stats.combat.victories + stats.combat.defeats > 0
      ? Math.round((stats.combat.victories / (stats.combat.victories + stats.combat.defeats)) * 100)
      : 0;

  const kd =
    stats.combat.troopsLost > 0
      ? (stats.combat.troopsKilled / stats.combat.troopsLost).toFixed(2)
      : stats.combat.troopsKilled > 0
        ? '∞'
        : '—';

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

      {tab === 'stats' && <>
      <div className="ps-header">
        <div className="ps-avatar">{stats.username.charAt(0).toUpperCase()}</div>
        <div className="ps-header-info">
          <h2 className="ps-username">{stats.username}</h2>
          <span className="ps-meta">
            {stats.points.toLocaleString()} influence · {stats.nexusCount} nexus{stats.nexusCount !== 1 ? 'es' : ''} · {stats.accountAgeDays}d played
          </span>
        </div>
      </div>

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
            const colors = { biomass: '#4caf50', alloy: '#2196f3', ore: '#ff9800' };
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

      <div className="ps-section">
        <h3 className="ps-section-title">Activity Graph</h3>
        <div style={{ padding: '0' }}>
          <StatsChart />
        </div>
      </div>
      </>}
    </div>
  );
}
