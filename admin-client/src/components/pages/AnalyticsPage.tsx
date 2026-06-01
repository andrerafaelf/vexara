'use client';
import {
	Activity,
	AlertTriangle,
	Eye,
	Shield,
	Swords,
	TrendingUp,
	Users,
	UserCheck,
	GitMerge,
	Link
} from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import {
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
	Area,
	AreaChart
} from 'recharts';
import type { AdminFetch } from '../../types/admin';

const API = process.env.NEXT_PUBLIC_ADMIN_API_URL || 'http://localhost:3002/api/admin';

interface FunnelStep {
	step: string;
	count: number;
	pct: number;
}
interface CohortResult {
	cohort: number;
	returned: number;
	rate: number;
}
interface ActivationData {
	funnel: FunnelStep[];
	retention: { d1: CohortResult; d3: CohortResult; d7: CohortResult };
	avgMinutesToFirstAction: number;
}
interface AttackDay {
	date: string;
	attacks: number;
	pvp: number;
	pve: number;
}
interface EngagementData {
	activePlayers: { last24h: number; last7d: number; last30d: number };
	attacks: {
		last7d: number;
		pvpLast7d: number;
		pveLast7d: number;
		attackersLast7d: number;
		defendersLast7d: number;
	};
	attacksPerDay: AttackDay[];
	playerHealth: { zeroAttackPlayers: number; stuckOnOnboarding: number; dismissedTips: number };
}
interface ReferralLeaderboardEntry {
	userId: number;
	username: string;
	clicks: number;
	activated: number;
	converted: number;
}
interface ReferralData {
	funnel: { clicks: number; registered: number; activated: number; converted: number };
	leaderboard: ReferralLeaderboardEntry[];
}

interface Props {
	adminFetch: AdminFetch;
}

const FUNNEL_COLORS = [
	'#4A9EB0',
	'#5BB8CC',
	'#6FCCE0',
	'#3D8FA0',
	'#2D7080',
	'#1D6070',
	'#0D5060',
	'#4ade80'
];
const CHART_COLORS = { pvp: '#F85149', pve: '#4A9EB0' };

function StatCard({
	label,
	value,
	icon,
	variant = 'default'
}: {
	label: string;
	value: string | number;
	icon: React.ReactNode;
	variant?: string;
}) {
	return (
		<div className="stat-card">
			<div className={`stat-card-icon ${variant === 'default' ? '' : variant}`}>{icon}</div>
			<div className="stat-card-body">
				<div className="stat-card-value">
					{typeof value === 'number' ? value.toLocaleString() : value}
				</div>
				<div className="stat-card-label">{label}</div>
			</div>
		</div>
	);
}

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
	return (
		<div className="chart-header" style={{ marginBottom: 12 }}>
			<span className="chart-title">
				{icon} {title}
			</span>
		</div>
	);
}

export default function AnalyticsPage({ adminFetch }: Props) {
	const [activation, setActivation] = useState<ActivationData | null>(null);
	const [engagement, setEngagement] = useState<EngagementData | null>(null);
	const [referral, setReferral] = useState<ReferralData | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const load = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const [aRes, eRes, rRes] = await Promise.all([
				adminFetch(`${API}/analytics/activation`),
				adminFetch(`${API}/analytics/engagement`),
				adminFetch(`${API}/analytics/referrals`)
			]);
			const [aData, eData, rData] = await Promise.all([aRes.json(), eRes.json(), rRes.json()]);
			setActivation(aData);
			setEngagement(eData);
			setReferral(rData);
		} catch (err) {
			setError((err as Error).message);
		} finally {
			setLoading(false);
		}
	}, [adminFetch]);

	useEffect(() => {
		load();
	}, [load]);

	if (loading)
		return (
			<div className="page-loading">
				<div className="spinner" /> Loading analytics…
			</div>
		);
	if (error)
		return (
			<div className="page-loading" style={{ color: 'var(--danger)' }}>
				{error}
			</div>
		);
	if (!activation || !engagement || !referral) return null;

	const maxFunnelCount = activation.funnel[0]?.count ?? 1;

	return (
		<div className="page-body">
			{/* ── Activation Funnel ── */}
			<div className="chart-section">
				<SectionHeader icon={<TrendingUp size={15} />} title="Activation Funnel" />
				<div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
					Avg time to first nexus:{' '}
					<strong style={{ color: 'var(--text-primary)' }}>
						{activation.avgMinutesToFirstAction}m
					</strong>
				</div>
				<div className="table-wrap">
					<table className="data-table">
						<thead>
							<tr>
								<th>Step</th>
								<th>Users</th>
								<th>% of Registered</th>
								<th style={{ width: 200 }}>Bar</th>
							</tr>
						</thead>
						<tbody>
							{activation.funnel.map((step, i) => (
								<tr key={step.step}>
									<td
										className="col-strong"
										style={{ color: FUNNEL_COLORS[i % FUNNEL_COLORS.length] }}
									>
										{step.step}
									</td>
									<td>{step.count.toLocaleString()}</td>
									<td>
										<span
											style={{
												color: step.pct >= 50 ? '#4ade80' : step.pct >= 20 ? '#facc15' : '#f87171',
												fontWeight: 700
											}}
										>
											{step.pct}%
										</span>
									</td>
									<td>
										<div
											style={{
												height: 8,
												background: 'var(--color-navy-700)',
												borderRadius: 4,
												overflow: 'hidden'
											}}
										>
											<div
												style={{
													height: '100%',
													borderRadius: 4,
													width: `${Math.round((step.count / maxFunnelCount) * 100)}%`,
													background: FUNNEL_COLORS[i % FUNNEL_COLORS.length],
													transition: 'width 0.4s'
												}}
											/>
										</div>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</div>

			{/* ── Retention Cohorts ── */}
			<div className="chart-section">
				<SectionHeader
					icon={<UserCheck size={15} />}
					title="Retention Cohorts (last 14-day registrations)"
				/>
				<div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
					{(
						[
							['D1', activation.retention.d1],
							['D3', activation.retention.d3],
							['D7', activation.retention.d7]
						] as const
					).map(([label, c]) => (
						<div key={label} className="stat-card">
							<div className="stat-card-body" style={{ gap: 4 }}>
								<div
									className="stat-card-value"
									style={{ color: c.rate >= 40 ? '#4ade80' : c.rate >= 15 ? '#facc15' : '#f87171' }}
								>
									{c.rate}%
								</div>
								<div className="stat-card-label">{label} Retention</div>
								<div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
									{c.returned}/{c.cohort} returned
								</div>
							</div>
						</div>
					))}
				</div>
			</div>

			{/* ── Active Players ── */}
			<div className="stat-grid">
				<StatCard
					label="Active (24h)"
					value={engagement.activePlayers.last24h}
					icon={<Activity size={17} />}
					variant="success"
				/>
				<StatCard
					label="Active (7d)"
					value={engagement.activePlayers.last7d}
					icon={<Activity size={17} />}
				/>
				<StatCard
					label="Active (30d)"
					value={engagement.activePlayers.last30d}
					icon={<Activity size={17} />}
				/>
				<StatCard
					label="Attacks (7d)"
					value={engagement.attacks.last7d}
					icon={<Swords size={17} />}
					variant="danger"
				/>
				<StatCard
					label="PvP (7d)"
					value={engagement.attacks.pvpLast7d}
					icon={<Swords size={17} />}
					variant="danger"
				/>
				<StatCard
					label="PvE (7d)"
					value={engagement.attacks.pveLast7d}
					icon={<Shield size={17} />}
				/>
				<StatCard
					label="Attackers (7d)"
					value={engagement.attacks.attackersLast7d}
					icon={<Users size={17} />}
				/>
				<StatCard
					label="Defenders (7d)"
					value={engagement.attacks.defendersLast7d}
					icon={<Users size={17} />}
				/>
			</div>

			{/* ── Attacks Per Day chart ── */}
			<div className="chart-section">
				<SectionHeader icon={<Swords size={15} />} title="Attacks Per Day (14d)" />
				<div className="chart-legend">
					<span className="chart-legend-item">
						<span className="chart-legend-dot" style={{ background: CHART_COLORS.pvp }} /> PvP
					</span>
					<span className="chart-legend-item">
						<span className="chart-legend-dot" style={{ background: CHART_COLORS.pve }} /> PvE
					</span>
				</div>
				<div className="chart-body">
					<ResponsiveContainer width="100%" height={220}>
						<AreaChart
							data={engagement.attacksPerDay}
							margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
						>
							<defs>
								<linearGradient id="gpvp" x1="0" y1="0" x2="0" y2="1">
									<stop offset="5%" stopColor={CHART_COLORS.pvp} stopOpacity={0.25} />
									<stop offset="95%" stopColor={CHART_COLORS.pvp} stopOpacity={0} />
								</linearGradient>
								<linearGradient id="gpve" x1="0" y1="0" x2="0" y2="1">
									<stop offset="5%" stopColor={CHART_COLORS.pve} stopOpacity={0.25} />
									<stop offset="95%" stopColor={CHART_COLORS.pve} stopOpacity={0} />
								</linearGradient>
							</defs>
							<CartesianGrid
								strokeDasharray="3 3"
								stroke="rgba(255,255,255,0.05)"
								vertical={false}
							/>
							<XAxis
								dataKey="date"
								tick={{ fill: '#6E7681', fontSize: 10 }}
								tickLine={false}
								axisLine={false}
							/>
							<YAxis
								tick={{ fill: '#6E7681', fontSize: 10 }}
								tickLine={false}
								axisLine={false}
								allowDecimals={false}
							/>
							<Tooltip
								contentStyle={{
									background: '#1C232C',
									border: '1px solid #30363D',
									borderRadius: 4,
									fontSize: 12
								}}
								labelStyle={{ color: '#C9D1D9', fontWeight: 700 }}
								itemStyle={{ color: '#8B949E' }}
							/>
							<Area
								type="monotone"
								dataKey="pvp"
								name="PvP"
								stroke={CHART_COLORS.pvp}
								fill="url(#gpvp)"
								strokeWidth={2}
								dot={false}
							/>
							<Area
								type="monotone"
								dataKey="pve"
								name="PvE"
								stroke={CHART_COLORS.pve}
								fill="url(#gpve)"
								strokeWidth={2}
								dot={false}
							/>
						</AreaChart>
					</ResponsiveContainer>
				</div>
			</div>

			{/* ── Player Health ── */}
			<div className="chart-section">
				<SectionHeader icon={<AlertTriangle size={15} />} title="Player Health Flags" />
				<div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
					<StatCard
						label="Zero-attack players"
						value={engagement.playerHealth.zeroAttackPlayers}
						icon={<AlertTriangle size={17} />}
						variant={engagement.playerHealth.zeroAttackPlayers > 5 ? 'warn' : 'muted'}
					/>
					<StatCard
						label="Stuck on onboarding"
						value={engagement.playerHealth.stuckOnOnboarding}
						icon={<AlertTriangle size={17} />}
						variant={engagement.playerHealth.stuckOnOnboarding > 3 ? 'warn' : 'muted'}
					/>
					<StatCard
						label="Dismissed tips"
						value={engagement.playerHealth.dismissedTips}
						icon={<Eye size={17} />}
					/>
				</div>
			</div>

			{/* ── Referral Funnel ── */}
			<div className="chart-section">
				<SectionHeader icon={<Link size={15} />} title="Referral Funnel" />
				<div className="stat-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
					<StatCard label="Link clicks" value={referral.funnel.clicks} icon={<Link size={17} />} />
					<StatCard
						label="Registered (ref)"
						value={referral.funnel.registered}
						icon={<Users size={17} />}
					/>
					<StatCard
						label="Activated (100pt)"
						value={referral.funnel.activated}
						icon={<UserCheck size={17} />}
						variant="success"
					/>
					<StatCard
						label="Converted (1kpt)"
						value={referral.funnel.converted}
						icon={<GitMerge size={17} />}
						variant="success"
					/>
				</div>
			</div>

			{/* ── Referral Leaderboard ── */}
			{referral.leaderboard.length > 0 && (
				<div className="chart-section">
					<SectionHeader
						icon={<TrendingUp size={15} />}
						title="Top Referrers (by activated players)"
					/>
					<div className="table-wrap">
						<table className="data-table">
							<thead>
								<tr>
									<th>#</th>
									<th>Player</th>
									<th>Link Clicks</th>
									<th>Activated</th>
									<th>Converted (1k pts)</th>
								</tr>
							</thead>
							<tbody>
								{referral.leaderboard.map((r, i) => (
									<tr key={r.userId}>
										<td style={{ color: 'var(--text-muted)', width: 32 }}>{i + 1}</td>
										<td className="col-strong">{r.username}</td>
										<td>{r.clicks.toLocaleString()}</td>
										<td>
											<span style={{ color: '#4ade80', fontWeight: 700 }}>{r.activated}</span>
										</td>
										<td>{r.converted}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			)}

			{referral.leaderboard.length === 0 && (
				<div className="chart-section">
					<SectionHeader icon={<TrendingUp size={15} />} title="Top Referrers" />
					<div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '12px 0' }}>
						No referral data yet.
					</div>
				</div>
			)}
		</div>
	);
}
