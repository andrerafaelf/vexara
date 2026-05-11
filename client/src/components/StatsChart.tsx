'use client';

import { getStatsTimeline } from '@/services/api';
import { TimelineDay } from '@/types/game';
import { useEffect, useState } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import '../styles/StatsChart.css';

const RANGES = [
  { label: '7d', value: 7 },
  { label: '30d', value: 30 },
  { label: '90d', value: 90 },
];

const TABS = ['Combat', 'Resources'] as const;
type Tab = (typeof TABS)[number];

function fmtDate(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  if (days <= 7) return d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(Math.round(n));
}

const TOOLTIP_STYLE = {
  backgroundColor: '#16213e',
  border: '1px solid #0f3460',
  borderRadius: 6,
  color: '#e2e8f0',
  fontSize: 12,
};

const CURSOR_STYLE = { fill: 'rgba(255,255,255,0.04)' };

export default function StatsChart() {
  const [days, setDays] = useState(30);
  const [tab, setTab] = useState<Tab>('Combat');
  const [data, setData] = useState<TimelineDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getStatsTimeline(days)
      .then((res) => setData(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [days]);

  const chartData = data.map((d) => ({
    ...d,
    date: fmtDate(d.date, days),
    totalProduced: d.biomassProduced + d.alloyProduced + d.oreProduced,
  }));

  return (
    <div className="sc-wrapper">
      <div className="sc-toolbar">
        <div className="sc-tabs">
          {TABS.map((t) => (
            <button
              key={t}
              className={`sc-tab ${tab === t ? 'active' : ''}`}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="sc-ranges">
          {RANGES.map((r) => (
            <button
              key={r.value}
              className={`sc-range ${days === r.value ? 'active' : ''}`}
              onClick={() => setDays(r.value)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="sc-chart-area">
        {loading && <div className="sc-overlay">Loading...</div>}
        {error && <div className="sc-overlay sc-error">Failed to load: {error}</div>}

        {!loading && !error && tab === 'Combat' && (
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#0f3460" />
              <XAxis dataKey="date" tick={{ fill: '#6b7c9e', fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="attacks" tick={{ fill: '#6b7c9e', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={fmtNum} width={40} />
              <YAxis yAxisId="troops" orientation="right" tick={{ fill: '#6b7c9e', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={fmtNum} width={44} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                cursor={CURSOR_STYLE}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(val: any, name: any) => [typeof val === 'number' ? fmtNum(val) : String(val ?? ''), name ?? '']}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: '#a8dadc', paddingTop: 8 }} />
              <Bar yAxisId="attacks" dataKey="attacksLaunched" name="Attacks Launched" fill="#e94560" opacity={0.85} radius={[2, 2, 0, 0]} maxBarSize={18} />
              <Bar yAxisId="attacks" dataKey="attacksDefended" name="Attacks Defended" fill="#7b4f2e" opacity={0.85} radius={[2, 2, 0, 0]} maxBarSize={18} />
              <Line yAxisId="troops" type="monotone" dataKey="troopsKilled" name="Troops Killed" stroke="#4ade80" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              <Line yAxisId="troops" type="monotone" dataKey="troopsLost" name="Troops Lost" stroke="#f87171" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            </ComposedChart>
          </ResponsiveContainer>
        )}

        {!loading && !error && tab === 'Resources' && (
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#0f3460" />
              <XAxis dataKey="date" tick={{ fill: '#6b7c9e', fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="prod" tick={{ fill: '#6b7c9e', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={fmtNum} width={40} />
              <YAxis yAxisId="combat" orientation="right" tick={{ fill: '#6b7c9e', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={fmtNum} width={44} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                cursor={CURSOR_STYLE}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(val: any, name: any) => [typeof val === 'number' ? fmtNum(val) : String(val ?? ''), name ?? '']}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: '#a8dadc', paddingTop: 8 }} />
              <Line yAxisId="prod" type="monotone" dataKey="biomassProduced" name="Biomass/day" stroke="#4caf50" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              <Line yAxisId="prod" type="monotone" dataKey="alloyProduced" name="Alloy/day" stroke="#2196f3" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              <Line yAxisId="prod" type="monotone" dataKey="oreProduced" name="Ore/day" stroke="#ff9800" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              <Bar yAxisId="combat" dataKey="resourcesStolen" name="Stolen" fill="#4ade80" opacity={0.75} radius={[2, 2, 0, 0]} maxBarSize={18} />
              <Bar yAxisId="combat" dataKey="resourcesLost" name="Lost" fill="#f87171" opacity={0.75} radius={[2, 2, 0, 0]} maxBarSize={18} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
