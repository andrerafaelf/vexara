'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Trophy, Star, Shield, Crown } from 'lucide-react';
import { getHallOfFame } from '../services/api';
import '../styles/HallOfFameView.css';

interface Commander {
	rank: number;
	userId: number;
	username: string;
	avatarUrl: string;
	points: number;
	won: boolean;
	factionName: string | null;
	factionTag: string | null;
}

interface Season {
	id: number;
	name: string;
	endedAt: string;
	winnerFaction: { id: number; name: string; tag: string } | null;
	topCommanders: Commander[];
}

const RANK_ICONS = [
	<Crown key={1} size={14} />,
	<Star key={2} size={13} />,
	<Shield key={3} size={12} />
];

function SeasonCard({ season }: { season: Season }) {
	const endDate = new Date(season.endedAt).toLocaleDateString('en-US', {
		month: 'short',
		year: 'numeric'
	});

	return (
		<div className="hof-card">
			<div className="hof-card-header">
				<div className="hof-card-title-row">
					<Trophy size={16} className="hof-card-trophy" aria-hidden="true" />
					<span className="hof-card-name">{season.name}</span>
					<span className="hof-card-date">{endDate}</span>
				</div>
				{season.winnerFaction && (
					<div className="hof-card-winner">
						<span className="hof-card-winner-label">Victors</span>
						<span className="hof-card-winner-faction">
							[{season.winnerFaction.tag}] {season.winnerFaction.name}
						</span>
					</div>
				)}
			</div>

			{season.topCommanders.length > 0 && (
				<ol className="hof-commanders" aria-label="Top commanders">
					{season.topCommanders.map((cmd) => (
						<li key={cmd.userId} className={`hof-commander hof-commander--rank${cmd.rank}`}>
							<span className="hof-commander-rank" aria-label={`Rank ${cmd.rank}`}>
								{RANK_ICONS[cmd.rank - 1] ?? cmd.rank}
							</span>
							{cmd.avatarUrl && (
								<img
									src={cmd.avatarUrl}
									alt=""
									className="hof-commander-avatar"
									aria-hidden="true"
								/>
							)}
							<span className="hof-commander-name">{cmd.username}</span>
							{cmd.factionTag && (
								<span className="hof-commander-faction">[{cmd.factionTag}]</span>
							)}
							{cmd.won && <span className="hof-commander-won-badge">Winner</span>}
							<span className="hof-commander-points">{cmd.points.toLocaleString()} inf</span>
						</li>
					))}
				</ol>
			)}
		</div>
	);
}

export default function HallOfFameView() {
	const { data, isLoading } = useQuery({
		queryKey: ['hallOfFame'],
		queryFn: () => getHallOfFame().then((r) => r.data),
		staleTime: 5 * 60_000
	});

	const seasons: Season[] = data?.seasons ?? [];

	return (
		<div className="hof-view">
			<div className="hof-hero">
				<Trophy size={28} className="hof-hero-icon" aria-hidden="true" />
				<h1 className="hof-hero-title">Hall of Champions</h1>
				<p className="hof-hero-sub">
					Every season, one faction achieves galactic dominance. Their names endure.
				</p>
			</div>

			{isLoading && (
				<div className="hof-loading" aria-live="polite">Loading season records…</div>
			)}

			{!isLoading && seasons.length === 0 && (
				<div className="hof-empty">
					No seasons have ended yet. The first champions will be recorded here.
				</div>
			)}

			<div className="hof-grid">
				{seasons.map((s) => (
					<SeasonCard key={s.id} season={s} />
				))}
			</div>
		</div>
	);
}
