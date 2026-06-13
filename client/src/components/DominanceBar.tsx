'use client';

import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Timer } from 'lucide-react';
import { getFactionLeaderboard, getMyFaction } from '../services/api';
import '../styles/DominanceBar.css';

interface FactionRow {
	id: number;
	name: string;
	tag: string;
	pct: number;
	isDominating: boolean;
	dominancePct: number;
	nexusCount: number;
	totalNexuses: number;
}

interface LeaderboardData {
	rows: FactionRow[];
	totalNexuses: number;
	dominanceThresholdPct: number;
	dominanceLocked: boolean;
	/** Hold window (hours) required to win; reflects per-galaxy admin override. */
	dominanceSustainHours?: number;
	/** ISO timestamp when this season ends; null if no timer set. */
	seasonEndsAt?: string | null;
}

function useSeasonCountdown(seasonEndsAt: string | null | undefined): string | null {
	const [label, setLabel] = useState<string | null>(null);

	useEffect(() => {
		if (!seasonEndsAt) { setLabel(null); return; }

		function tick() {
			const ms = new Date(seasonEndsAt!).getTime() - Date.now();
			if (ms <= 0) { setLabel(null); return; }
			const totalSecs = Math.floor(ms / 1000);
			const d = Math.floor(totalSecs / 86400);
			const h = Math.floor((totalSecs % 86400) / 3600);
			const m = Math.floor((totalSecs % 3600) / 60);
			if (d > 0) setLabel(`${d}d ${h}h`);
			else if (h > 0) setLabel(`${h}h ${m}m`);
			else setLabel(`${m}m`);
		}

		tick();
		const id = setInterval(tick, 60_000);
		return () => clearInterval(id);
	}, [seasonEndsAt]);

	return label;
}

const TOP_N = 4;
const VISIBILITY_THRESHOLD_PCT = 55;

const DominanceBar: React.FC = () => {
	const { data: factionData } = useQuery({
		queryKey: ['myFaction'],
		queryFn: () => getMyFaction().then((r) => r.data),
		staleTime: 60_000,
		refetchInterval: (query) => {
			if ((query.state.error as any)?.response?.status === 429) return false;
			return 120_000;
		}
	});

	const inFaction = !!factionData?.faction?.id;
	const myFactionId: number | null = factionData?.faction?.id ?? null;

	const { data } = useQuery<LeaderboardData>({
		queryKey: ['factionLeaderboard'],
		queryFn: () => getFactionLeaderboard().then((r) => r.data),
		staleTime: 60_000,
		refetchInterval: (query) => {
			if ((query.state.error as any)?.response?.status === 429) return false;
			return 120_000;
		},
		enabled: inFaction
	});

	if (!inFaction || !data || data.rows.length === 0) return null;
	if (data.dominanceLocked) return null;

	const leaderPct = data.rows[0]?.pct ?? 0;
	if (leaderPct < VISIBILITY_THRESHOLD_PCT) return null;

	const top = data.rows.slice(0, TOP_N);
	const threshold = data.dominanceThresholdPct;
	const sustainHours = data.dominanceSustainHours ?? 36;
	const dominator = top.find((f) => f.isDominating);
	const seasonCountdown = useSeasonCountdown(data.seasonEndsAt);

	return (
		<div className="dom-bar" role="status" aria-label="Galaxy dominance">
			<div className="dom-bar-inner">
				<span className="dom-bar-label">Galaxy Control</span>

				<div className="dom-bar-factions">
					{top.map((faction) => {
						const isMe = faction.id === myFactionId;
						const isDom = faction.isDominating;

						return (
							<div
								key={faction.id}
								className={`dom-faction ${isMe ? 'dom-faction--mine' : ''} ${isDom ? 'dom-faction--dominating' : ''}`}
								title={`${faction.name} · ${faction.pct}% (${faction.nexusCount}/${faction.totalNexuses} nexuses)`}
							>
								<span className="dom-faction-tag">[{faction.tag}]</span>
								<div className="dom-faction-bar-wrap">
									<div
										className="dom-threshold-marker"
										style={{ left: `${threshold}%` }}
										title={`Dominance threshold: ${threshold}%`}
									/>
									<div
										className={`dom-faction-bar-fill ${isDom ? 'dom-faction-bar-fill--dominating' : ''}`}
										style={{ width: `${Math.min(faction.pct, 100)}%` }}
									/>
								</div>
								<span className="dom-faction-pct">{faction.pct}%</span>

								{isDom && faction.dominancePct > 0 && (
									<div
										className="dom-sustain-track"
										title={`Holding ${Math.round(faction.dominancePct)}% of the ${sustainHours}h sustain window`}
									>
										<div
											className="dom-sustain-fill"
											style={{ width: `${faction.dominancePct}%` }}
										/>
									</div>
								)}
							</div>
						);
					})}
				</div>

				{seasonCountdown && (
					<span className="dom-season-timer" title="Season ends in">
						<Timer size={11} aria-hidden="true" />
						{seasonCountdown}
					</span>
				)}

				{dominator && (
					<span className="dom-bar-alert" aria-live="polite">
						<span className="dom-bar-alert-dot" />
						{dominator.tag} dominating
					</span>
				)}
			</div>
		</div>
	);
};

export default DominanceBar;
