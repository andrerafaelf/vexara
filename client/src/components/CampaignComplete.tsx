'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Trophy, Star, Swords } from 'lucide-react';
import { getMyGalaxy, getGalaxyWinResults } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { MY_GALAXY_KEY } from './GalaxyChip';
import '../styles/CampaignComplete.css';

interface WinResults {
	galaxy: { id: number; name: string; winnerFactionId: number | null };
	factionLeaderboard: { id: number; name: string; tag: string; points: number; isWinner: boolean }[];
	topPlayers: { userId: number; username: string; points: number; factionId: number | null }[];
}

export default function CampaignComplete() {
	const router = useRouter();
	const { user } = useAuth();
	const queryClient = useQueryClient();

	const [endedGalaxyId, setEndedGalaxyId] = useState<number | null>(null);
	const [dismissed, setDismissed] = useState(false);

	// Track the last galaxy the player was in so we know what to fetch
	const lastGalaxyRef = useRef<{ id: number; name: string } | null>(null);

	const { data: galaxyData } = useQuery({
		queryKey: MY_GALAXY_KEY,
		queryFn: () => getMyGalaxy().then((r) => r.data),
		staleTime: 5 * 60_000
	});

	useEffect(() => {
		if (!galaxyData) return;
		const active = galaxyData.activeGalaxy;
		if (active) {
			// Still in a galaxy — track it
			lastGalaxyRef.current = { id: active.id, name: active.name };
			setEndedGalaxyId(null);
			setDismissed(false);
		} else if (lastGalaxyRef.current && !endedGalaxyId) {
			// Transitioned from a galaxy to null — galaxy just ended
			setEndedGalaxyId(lastGalaxyRef.current.id);
		}
	}, [galaxyData, endedGalaxyId]);

	const { data: winData } = useQuery<WinResults>({
		queryKey: ['galaxyWinResults', endedGalaxyId],
		queryFn: () => getGalaxyWinResults(endedGalaxyId!).then((r) => r.data),
		enabled: endedGalaxyId != null && !dismissed,
		staleTime: Infinity
	});

	if (!endedGalaxyId || dismissed || !winData) return null;

	const galaxyName = winData.galaxy.name;
	const winnerFaction = winData.factionLeaderboard.find((f) => f.isWinner);

	// Find this player's result
	const myEntry = winData.topPlayers.find((p) => String(p.userId) === String(user?.id));
	const myFactionId = myEntry?.factionId;
	const isWinner = myFactionId != null && myFactionId === winData.galaxy.winnerFactionId;
	const myPoints = myEntry?.points ?? 0;

	// All-time record comes from the refreshed user object (getMe runs at mount
	// and after updateUser patches, so it will reflect the just-incremented values
	// once the server's dominance job runs and the next getMe fires).
	const totalWins = user?.galaxiesWon ?? 0;
	const totalPlayed = user?.galaxiesPlayed ?? 0;
	const lifetimePoints = user?.lifetimePoints ?? 0;

	const handleJoinNext = () => {
		setDismissed(true);
		queryClient.invalidateQueries({ queryKey: MY_GALAXY_KEY });
		router.push('/play');
	};

	return (
		<div className="cc-backdrop" role="dialog" aria-modal="true" aria-label="Campaign complete">
			<div className="cc-modal">
				<div className={`cc-header ${isWinner ? 'cc-header--victory' : 'cc-header--defeat'}`}>
					{isWinner ? (
						<Trophy className="cc-header-icon" size={32} aria-hidden="true" />
					) : (
						<Swords className="cc-header-icon" size={28} aria-hidden="true" />
					)}
					<span className="cc-eyebrow">
						{isWinner ? 'Campaign Won' : 'Campaign Ended'}
					</span>
					<h2 className="cc-galaxy-name">{galaxyName}</h2>
				</div>

				<div className="cc-body">
					{winnerFaction && (
						<div className="cc-winner-row">
							<Star size={13} aria-hidden="true" />
							<span>
								<strong>[{winnerFaction.tag}] {winnerFaction.name}</strong> achieved galactic dominance
							</span>
						</div>
					)}

					<div className="cc-stats-grid">
						<div className="cc-stat">
							<span className="cc-stat-label">Your influence</span>
							<span className="cc-stat-value">{myPoints.toLocaleString()}</span>
						</div>
						<div className="cc-stat">
							<span className="cc-stat-label">Campaigns won</span>
							<span className="cc-stat-value">{totalWins}</span>
						</div>
						<div className="cc-stat">
							<span className="cc-stat-label">Campaigns played</span>
							<span className="cc-stat-value">{totalPlayed}</span>
						</div>
						<div className="cc-stat">
							<span className="cc-stat-label">Lifetime influence</span>
							<span className="cc-stat-value">{lifetimePoints.toLocaleString()}</span>
						</div>
					</div>
				</div>

				<div className="cc-actions">
					<button className="cc-btn cc-btn--primary" onClick={handleJoinNext}>
						Join Next Campaign
					</button>
					<button
						className="cc-btn cc-btn--ghost"
						onClick={() => setDismissed(true)}
					>
						Close
					</button>
				</div>
			</div>
		</div>
	);
}
