'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Swords, Send, Radio } from 'lucide-react';
import { getAllAttacks } from '../services/api';
import { Countdown } from './Countdown';

interface AttackLike {
	_id: string;
	type?: string;
	status?: string;
	arrivesAt?: string;
	returnsAt?: string;
	attackerNexus?: { name?: string };
	defenderNexus?: { name?: string; x?: number; y?: number };
	attacker?: { nexus?: { name?: string }; user?: { username?: string } };
	defender?: { nexus?: { name?: string; x?: number; y?: number } };
}

/**
 * Right-rail "Movements" widget (beta). Surfaces the player's live attack
 * movements — incoming threats and outgoing strikes — across all their nexuses,
 * with the soonest arrival countdown. This is the most time-sensitive info a
 * player has, so it earns a permanent rail slot instead of leaving the rail
 * mostly empty below the daily quests. Polls cheaply; clicking jumps to Reports.
 */
function RailMovementsInner() {
	const router = useRouter();
	const { data } = useQuery({
		queryKey: ['allAttacks'],
		queryFn: () => getAllAttacks().then((r) => r.data),
		staleTime: 10_000,
		refetchInterval: 15_000
	});

	const incoming: AttackLike[] = (data?.incoming ?? []).filter(
		(a: AttackLike) => a.type !== 'scout' && a.status !== 'returning'
	);
	const outgoing: AttackLike[] = (data?.outgoing ?? []).filter(
		(a: AttackLike) => a.status !== 'returning'
	);

	// Nothing in motion → render nothing (keeps the rail honest, not padded with
	// an empty "no movements" box).
	if (incoming.length === 0 && outgoing.length === 0) return null;

	const soonestIncoming = incoming
		.map((a) => a.arrivesAt)
		.filter(Boolean)
		.sort()[0];

	return (
		<div className="rail-card rail-movements">
			<div className="rail-card-head">
				<Radio size={12} aria-hidden="true" />
				<span className="rail-card-title">Movements</span>
			</div>

			{incoming.length > 0 && (
				<button
					type="button"
					className="rail-movements-row rail-movements-row--incoming"
					onClick={() => router.push('/reports')}
				>
					<span className="rail-movements-icon">
						<Swords size={13} aria-hidden="true" />
					</span>
					<span className="rail-movements-label">
						{incoming.length} incoming {incoming.length === 1 ? 'strike' : 'strikes'}
					</span>
					{soonestIncoming && (
						<Countdown endAt={soonestIncoming} className="rail-movements-eta" />
					)}
				</button>
			)}

			{outgoing.length > 0 && (
				<button
					type="button"
					className="rail-movements-row"
					onClick={() => router.push('/reports')}
				>
					<span className="rail-movements-icon">
						<Send size={13} aria-hidden="true" />
					</span>
					<span className="rail-movements-label">
						{outgoing.length} outgoing {outgoing.length === 1 ? 'move' : 'moves'}
					</span>
				</button>
			)}
		</div>
	);
}

export const RailMovements = React.memo(RailMovementsInner);
