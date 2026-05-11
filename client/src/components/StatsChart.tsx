'use client';

import { getStatsTimeline } from '@/services/api';
import { TimelineDay } from '@/types/game';
import { formatShortDate } from '@/utils/date';
import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
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

const TABS = [
  { id: 'combat', label: 'Combat', metricLabel: 'Net troops (killed − lost)', color: '#4ade80' },
  { id: 'resources', label: 'Resources', metricLabel: 'Resources produced', color: '#a8dadc' },
] as const;
type TabId = (typeof TABS)[number]['id'];

function fmtNum(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (abs >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(Math.round(n));
}

const TOOLTIP_STYLE = {
  backgroundColor: '#16213e',
  border: '1px solid #0f3460',
  borderRadius: 6,
  color: '#e2e8f0',
  fontSize: 12,
};

const CURSOR_STYLE = { stroke: 'rgba(255,255,255,0.15)', strokeWidth: 1 };

export default function StatsChart() {
  const [days, setDays] = useState(30);
  const [tab, setTab] = useState<TabId>('combat');
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

  const active = TABS.find((t) => t.id === tab)!;

  const chartData = useMemo(
    () =>
      data.map((d) => ({
        date: formatShortDate(d.date),
        value:
          tab === 'combat'
            ? d.troopsKilled - d.troopsLost
            : d.biomassProduced + d.alloyProduced + d.oreProduced,
      })),
    [data, tab]
  );

  return (
    <div className="sc-wrapper">
      <div className="sc-toolbar">
        <div className="sc-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`sc-tab ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
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

      <div className="sc-metric-label">{active.metricLabel}</div>

      <div className="sc-chart-area">
        {loading && <div className="sc-overlay">Loading...</div>}
        {error && <div className="sc-overlay sc-error">Failed to load: {error}</div>}

        {!loading && !error && (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="sc-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={active.color} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={active.color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#0f3460" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: '#6b7c9e', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                minTickGap={24}
              />
              <YAxis
                tick={{ fill: '#6b7c9e', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={fmtNum}
                width={44}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                cursor={CURSOR_STYLE}
                formatter={(val: number) => [fmtNum(val), active.metricLabel]}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={active.color}
                strokeWidth={2}
                fill="url(#sc-fill)"
                dot={false}
                activeDot={{ r: 4 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
