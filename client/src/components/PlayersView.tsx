'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { listPlayersInGalaxy } from '../services/api';
import { usePageReady } from './NavigationProgress';
import PageSkeleton from './PageSkeleton';
import Username from './Username';
import Avatar from './Avatar';
import type { SupporterTier } from '@/types/game';
import '../styles/Factions.css';

interface GalaxyPlayer {
	userId: number;
	username: string;
	isSupporter: boolean;
	supporterTier?: SupporterTier | null;
	isFounder?: boolean;
	avatarUrl?: string | null;
	avatarUrlSm?: string | null;
	points: number;
	joinedAt: string;
	nexuses: number;
	faction: { id: number; name: string; tag: string; role: string } | null;
}

type SortKey = 'points' | 'nexuses' | 'joinedAt' | 'username';

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
		return () => {
			cancelled = true;
		};
	}, []);

	usePageReady(!loading);

	const filtered = useMemo(() => {
		const term = search.trim().toLowerCase();
		const matches = term
			? players.filter(
					(p) =>
						p.username.toLowerCase().includes(term) ||
						(p.faction?.name.toLowerCase().includes(term) ?? false) ||
						(p.faction?.tag.toLowerCase().includes(term) ?? false)
				)
			: players;

		const sorted = [...matches];
		sorted.sort((a, b) => {
			switch (sortKey) {
				case 'nexuses':
					return b.nexuses - a.nexuses;
				case 'joinedAt':
					return new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
				case 'username':
					return a.username.localeCompare(b.username);
				case 'points':
				default:
					return b.points - a.points;
			}
		});
		return sorted;
	}, [players, search, sortKey]);

	if (loading) return <PageSkeleton variant="rows" />;

	return (
		<div className="factions-container">
			{error && (
				<div className="factions-error" role="alert">
					{error}
				</div>
			)}

			<section className="factions-panel factions-browser">
				<h2>All Players ({players.length})</h2>

				<div className="players-toolbar">
					<input
						type="text"
						className="players-search"
						placeholder="Search by name or faction…"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						aria-label="Search players"
					/>
					<label className="players-sort">
						<span>Sort by</span>
						<select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
							<option value="points">Influence</option>
							<option value="nexuses">Nexuses</option>
							<option value="username">Name (A–Z)</option>
							<option value="joinedAt">Joined (earliest first)</option>
						</select>
					</label>
				</div>

				{filtered.length === 0 ? (
					<p className="factions-browser-empty">
						{search ? 'No players match your search.' : 'No players in this galaxy yet.'}
					</p>
				) : (
					<div className="factions-browser-list">
						{filtered.map((p, idx) => (
							<div key={p.userId} className="factions-browser-card players-card">
								<div className="factions-browser-card-header">
									<div className="factions-browser-card-identity">
										<span className="players-card-rank">#{idx + 1}</span>
										<Avatar
											username={p.username}
											avatarUrl={p.avatarUrl ?? null}
											avatarUrlSm={p.avatarUrlSm ?? null}
											size="sm"
											className="players-card-avatar"
											ariaHidden
										/>
										<Username
											name={p.username}
											isSupporter={p.isSupporter}
											supporterTier={p.supporterTier ?? null}
											isFounder={p.isFounder}
											linkToProfile
											className="factions-browser-card-name"
										/>
									</div>
									<span className="factions-browser-card-members">
										{p.points.toLocaleString()} inf
									</span>
								</div>
								<div className="players-card-meta">
									<span className="players-card-meta-item">
										<strong>{p.nexuses}</strong> nexus{p.nexuses === 1 ? '' : 'es'}
									</span>
									{p.faction ? (
										<span className="players-card-meta-item">
											Faction{' '}
											<Link href="/factions" className="players-card-faction-link">
												{p.faction.name}{' '}
												<span className="players-card-faction-tag">[{p.faction.tag}]</span>
											</Link>
										</span>
									) : (
										<span className="players-card-meta-item players-card-meta-dim">
											Unaffiliated
										</span>
									)}
								</div>
							</div>
						))}
					</div>
				)}
			</section>
		</div>
	);
}
