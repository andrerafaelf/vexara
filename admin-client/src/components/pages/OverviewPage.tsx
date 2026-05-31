'use client';
import { Activity, AlertTriangle, Building2, Flag, Globe, ShoppingCart, Shield, Swords, Users } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AdminFetch } from '../../types/admin';

const API = process.env.NEXT_PUBLIC_ADMIN_API_URL || 'http://localhost:3002/api/admin';

interface OverviewData {
  totals: {
    users: number;
    nexuses: number;
    attacks: number;
    factions: number;
    activeGalaxies: number;
    marketListings: number;
    flaggedUsers: number;
    unverifiedUsers: number;
    activeSpyMissions: number;
    activeWarOps: number;
  };
  activityChart: { date: string; users: number; attacks: number }[];
  recentAttacks: {
    id: number;
    type: string;
    status: string;
    attackerNexus: string;
    defenderNexus: string;
    arrivesAt: string;
  }[];
}

interface Props { adminFetch: AdminFetch; }

const CHART_COLORS = { users: '#4A9EB0', attacks: '#F85149' };

export default function OverviewPage({ adminFetch }: Props) {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await adminFetch(`${API}/overview`);
      const json = await res.json().catch(() => null);
      if (json) setData(json);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [adminFetch]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="page-loading"><div className="spinner" /> Loading overview…</div>;
  if (!data)   return <div className="page-loading">Failed to load overview.</div>;

  const { totals, activityChart, recentAttacks } = data;

  const stats = [
    { label: 'Total Users',      value: totals.users,            icon: <Users size={17} />,      variant: 'default' },
    { label: 'Nexuses',          value: totals.nexuses,          icon: <Building2 size={17} />,  variant: 'default' },
    { label: 'Factions',         value: totals.factions,         icon: <Shield size={17} />,     variant: 'default' },
    { label: 'Active Galaxies',  value: totals.activeGalaxies,   icon: <Globe size={17} />,      variant: 'success' },
    { label: 'Total Attacks',    value: totals.attacks,          icon: <Swords size={17} />,     variant: 'danger'  },
    { label: 'Market Listings',  value: totals.marketListings,   icon: <ShoppingCart size={17}/>, variant: 'default' },
    { label: 'Active Spy Ops',   value: totals.activeSpyMissions,icon: <Activity size={17} />,   variant: 'warn'    },
    { label: 'Active War Ops',   value: totals.activeWarOps,     icon: <Swords size={17} />,     variant: 'warn'    },
    { label: 'Flagged Accounts', value: totals.flaggedUsers,     icon: <Flag size={17} />,       variant: totals.flaggedUsers > 0 ? 'danger' : 'muted' },
    { label: 'Unverified',       value: totals.unverifiedUsers,  icon: <AlertTriangle size={17}/>,variant: totals.unverifiedUsers > 0 ? 'warn' : 'muted' },
  ];

  const attackTypeColors: Record<string, string> = { attack: '#F85149', scout: '#4A9EB0', support: '#56D364' };

  return (
    <div className="page-body">
      {/* Stat cards */}
      <div className="stat-grid">
        {stats.map(({ label, value, icon, variant }) => (
          <div key={label} className="stat-card">
            <div className={`stat-card-icon ${variant === 'default' ? '' : variant}`}>{icon}</div>
            <div className="stat-card-body">
              <div className="stat-card-value">{value.toLocaleString()}</div>
              <div className="stat-card-label">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Activity chart */}
      <div className="chart-section">
        <div className="chart-header">
          <span className="chart-title"><Activity size={15} /> 14-Day Activity</span>
        </div>
        <div className="chart-legend">
          <span className="chart-legend-item">
            <span className="chart-legend-dot" style={{ background: CHART_COLORS.users }} /> New Users
          </span>
          <span className="chart-legend-item">
            <span className="chart-legend-dot" style={{ background: CHART_COLORS.attacks }} /> Attacks
          </span>
        </div>
        <div className="chart-body">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={activityChart} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gu" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={CHART_COLORS.users}   stopOpacity={0.25} />
                  <stop offset="95%" stopColor={CHART_COLORS.users}   stopOpacity={0} />
                </linearGradient>
                <linearGradient id="ga" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={CHART_COLORS.attacks} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={CHART_COLORS.attacks} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: '#6E7681', fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#6E7681', fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: '#1C232C', border: '1px solid #30363D', borderRadius: 4, fontSize: 12 }}
                labelStyle={{ color: '#C9D1D9', fontWeight: 700, marginBottom: 4 }}
                itemStyle={{ color: '#8B949E' }}
              />
              <Area type="monotone" dataKey="users"   name="New Users" stroke={CHART_COLORS.users}   fill="url(#gu)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="attacks" name="Attacks"   stroke={CHART_COLORS.attacks} fill="url(#ga)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent attacks */}
      {recentAttacks.length > 0 && (
        <div className="section">
          <div className="section-header">
            <span className="section-title"><Swords size={14} /> Live Strikes</span>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Arrives</th>
                </tr>
              </thead>
              <tbody>
                {recentAttacks.map((a) => {
                  const diff = new Date(a.arrivesAt).getTime() - Date.now();
                  const s = Math.max(0, Math.floor(diff / 1000));
                  const m = Math.floor(s / 60);
                  const h = Math.floor(m / 60);
                  const timeStr = h > 0 ? `${h}h ${m % 60}m` : m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
                  return (
                    <tr key={a.id}>
                      <td>
                        <span className={`attack-pill ${a.type}`}>{a.type}</span>
                      </td>
                      <td className="col-strong">{a.attackerNexus}</td>
                      <td>{a.defenderNexus}</td>
                      <td>
                        <span className={diff < 30000 ? 'time-urgent' : ''} style={{ color: attackTypeColors[a.type] ?? 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>
                          {timeStr}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
