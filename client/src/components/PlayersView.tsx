'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { listPlayersInGalaxy } from '../services/api';
import { usePageReady } from './NavigationProgress';
import PageSkeleton from './PageSkeleton';
import Username from './Username';
import Avatar from './Avatar';
import type { SupporterTier } from '@/types/game';
import '../styles/Players.css';

interface GalaxyPlayer {
	userId: number;
	username: string;
	isSupporter: boolean;
	supporterTier?: SupporterTier | null;
	isFounder?: boolean;
	isAlphaFounder?: boolean;
	avatarUrl?: string | null;
	avatarUrlSm?: string | null;
	avatarBorder?: string | null;
	activeTitle?: string | null;
	points: number;
	joinedAt: string;
	nexuses: number;
	faction: { id: number; name: string; tag: string; role: string } | null;
}

type SortKey = 'points' | 'nexuses' | 'joinedAt' | 'username';

const MEDAL_LABELS = ['#1', '#2', '#3'] as const;

function PodiumCard({ player, rank }: { player: GalaxyPlayer; rank: 1 | 2 | 3 }) {
	return (
		<div className={`plb-pod plb-pod--${rank}`}>
			<span className="plb-pod-medal">{MEDAL_LABELS[rank - 1]}</span>

			<div className="plb-pod-avatar">
				<Avatar
					username={player.username}
					avatarUrl={player.avatarUrl ?? null}
					avatarUrlSm={player.avatarUrlSm ?? null}
					size="md"
					borderKey={player.avatarBorder ?? null}
					supporterTier={player.supporterTier ?? null}
					ariaHidden
				/>
			</div>

			{/* identity: name + faction always stack vertically */}
			<div className="plb-pod-identity">
				<div className="plb-pod-name">
					<Username
						name={player.username}
						isSupporter={player.isSupporter}
						supporterTier={player.supporterTier ?? null}
						linkToProfile
					/>
				</div>
				{player.activeTitle && <span className="plb-pod-title">{player.activeTitle}</span>}
				{player.faction ? (
					<Link href="/factions" className="plb-pod-faction">
						{player.faction.name}
						<span className="plb-pod-faction-tag">[{player.faction.tag}]</span>
					</Link>
				) : (
					<span className="plb-pod-unaffiliated">Unaffiliated</span>
				)}
			</div>

			<div className="plb-pod-stats">
				<span className="plb-pod-influence">{player.points.toLocaleString()} inf</span>
				<span className="plb-pod-sub">{player.nexuses} nexus{player.nexuses === 1 ? '' : 'es'}</span>
			</div>
		</div>
	);
}

export default function PlayersView() {
	const [players, setPlayers] = useState<GalaxyPlayer[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string>('');
	const [search, setSearch] = useState('');
	const [sortKey, setSortKey] = useState<SortKey>('points');

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const res = await listPlayersInGalaxy();
				if (cancelled) return;
				setPlayers(Array.isArray(res.data) ? res.data : []);
			} catch (e) {
				if (cancelled) return;
				setError(
					(e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
						'Failed to load players'
				);
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();
		return () => { cancelled = true; };
	}, []);

	usePageReady(!loading);

	const sorted = useMemo(() => {
		const list = [...players];
		list.sort((a, b) => {
			switch (sortKey) {
				case 'nexuses':  return b.nexuses - a.nexuses;
				case 'joinedAt': return new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
				case 'username': return a.username.localeCompare(b.username);
				case 'points':
				default:         return b.points - a.points;
			}
		});
		return list;
	}, [players, sortKey]);

	const filtered = useMemo(() => {
		const term = search.trim().toLowerCase();
		if (!term) return sorted;
		return sorted.filter(
			(p) =>
				p.username.toLowerCase().includes(term) ||
				(p.faction?.name.toLowerCase().includes(term) ?? false) ||
				(p.faction?.tag.toLowerCase().includes(term) ?? false)
		);
	}, [sorted, search]);

	const maxPoints = sorted[0]?.points ?? 1;

	// Podium only shows when sorted by influence (default) and no active search
	const showPodium = sortKey === 'points' && !search.trim() && sorted.length >= 1;
	const podiumPlayers = showPodium ? sorted.slice(0, Math.min(3, sorted.length)) : [];
	// Table starts after podium players (or from index 0 if search/other sort)
	const tableRows = showPodium ? filtered.slice(podiumPlayers.length) : filtered;
	// Rank in the full sorted list (not filtered) for accurate numbering
	const rankOf = (userId: number) => sorted.findIndex((p) => p.userId === userId) + 1;

	if (loading) return <PageSkeleton variant="rows" />;

	return (
		<div className="plb-page">
			{error && <div className="plb-error" role="alert">{error}</div>}

			{/* ── Header ─────────────────────────────────────────────────── */}
			<div className="plb-header">
				<div className="plb-heading">
					<span className="plb-eyebrow">Galaxy · Rankings</span>
					<h2 className="plb-title">Players</h2>
				</div>
				<span className="plb-count">{players.length} commanders</span>
			</div>

			{/* ── Toolbar ────────────────────────────────────────────────── */}
			<div className="plb-toolbar">
				<div className="plb-search-wrap">
					<span className="plb-search-icon" aria-hidden>⌕</span>
					<input
						type="text"
						className="plb-search"
						placeholder="Search by name or faction…"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						aria-label="Search players"
					/>
				</div>
				<label className="plb-sort">
					<span>Sort</span>
					<select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
						<option value="points">Influence</option>
						<option value="nexuses">Nexuses</option>
						<option value="username">Name (A–Z)</option>
						<option value="joinedAt">Joined (earliest)</option>
					</select>
				</label>
			</div>

			{filtered.length === 0 ? (
				<p className="plb-empty">
					{search ? 'No commanders match your search.' : 'No players in this galaxy yet.'}
				</p>
			) : (
				<>
					{/* ── Podium (top 3, influence sort only) ────────────── */}
					{podiumPlayers.length > 0 && (
						<div className="plb-podium">
							{podiumPlayers.map((p, i) => (
								<PodiumCard key={p.userId} player={p} rank={(i + 1) as 1 | 2 | 3} />
							))}
						</div>
					)}

					{/* ── Ranked table ────────────────────────────────────── */}
					{(tableRows.length > 0 || (showPodium && podiumPlayers.length === 0)) && (
						<div className="plb-table-panel">
							<div className="plb-thead" role="row">
								<span className="plb-th plb-th--rank">#</span>
								<span className="plb-th">Commander</span>
								<span className="plb-th plb-th--faction">Faction</span>
								<span className="plb-th plb-th--inf">Influence</span>
								<span className="plb-th plb-th--nex">Nexuses</span>
							</div>

							<div className="plb-tbody" role="rowgroup">
								{(showPodium ? tableRows : filtered).map((p) => {
									const rank = rankOf(p.userId);
									const pct = maxPoints > 0 ? (p.points / maxPoints) * 100 : 0;
									const rankClass =
										rank <= 3 ? ` plb-row--rank-${rank}` : '';

									return (
										<div key={p.userId} className={`plb-row${rankClass}`} role="row">
											{/* Rank */}
											<div className="plb-td plb-td--rank">
												{rank}
											</div>

											{/* Player identity */}
											<div className="plb-td plb-td--player">
												<Avatar
													username={p.username}
													avatarUrl={p.avatarUrl ?? null}
													avatarUrlSm={p.avatarUrlSm ?? null}
													size="sm"
													borderKey={p.avatarBorder ?? null}
													supporterTier={p.supporterTier ?? null}
													ariaHidden
												/>
												<div className="plb-td-identity">
													<Username
														name={p.username}
														isSupporter={p.isSupporter}
														supporterTier={p.supporterTier ?? null}
														linkToProfile
													/>
													{p.activeTitle && (
														<span className="plb-td-title">{p.activeTitle}</span>
													)}
												</div>
											</div>

											{/* Faction */}
											<div className="plb-td plb-td--faction">
												{p.faction ? (
													<Link href="/factions" className="plb-faction-chip">
														<span>{p.faction.name}</span>
														<span className="plb-faction-tag">[{p.faction.tag}]</span>
													</Link>
												) : (
													<span className="plb-unaffiliated">—</span>
												)}
											</div>

											{/* Influence + mini bar */}
											<div className="plb-td plb-td--inf">
												<span>{p.points.toLocaleString()}</span>
												<span className="plb-bar-track" aria-hidden>
													<span
														className="plb-bar-fill"
														style={{ width: `${pct}%` }}
													/>
												</span>
											</div>

											{/* Nexuses */}
											<div className="plb-td plb-td--nex">
												{p.nexuses}
											</div>
										</div>
									);
								})}
							</div>
						</div>
					)}
				</>
			)}
		</div>
	);
}
