'use client';

import { getAllAttacks } from '@/services/api';
import { Countdown } from './Countdown';
import { formatTimeOfDay } from '@/utils/date';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { startTransition } from 'react';
import { useStartProgress } from './NavigationProgress';
import '@/styles/TroopMovementsBar.css';

interface AttackNexus {
	_id: string;
	id: string;
	name?: string;
	x?: number;
	y?: number;
}

interface Attack {
	_id: string;
	status: string;
	arrivesAt: string;
	type?: string;
	attacker: {
		user: { _id: string | null; id: string | null; username?: string };
		nexus: AttackNexus;
	};
	defender: {
		user: { _id: string | null; id: string | null; username?: string };
		nexus: AttackNexus;
	};
}

export default function TroopMovementsBar() {
	const router = useRouter();
	const startProgress = useStartProgress();

	const { data } = useQuery<{ incoming: Attack[]; outgoing: Attack[] }>({
		queryKey: ['allAttacks'],
		queryFn: () => getAllAttacks().then((r) => r.data),
		refetchInterval: 15_000,
		staleTime: 10_000
	});

	const incoming = data?.incoming ?? [];

	if (incoming.length === 0) return null;

	const goToNexus = (nexusId: string) => {
		startProgress();
		startTransition(() => router.push(`/nexus/${nexusId}`));
	};

	const goToStarfield = (x: number, y: number) => {
		startProgress();
		startTransition(() => router.push(`/starfield?cx=${x}&cy=${y}`));
	};

	return (
		<div className="troop-movements-bar" role="alert" aria-label="Incoming strikes">
			{incoming.map((attack) => {
				const isScout = attack.type === 'scout';
				const defenderNexus = attack.defender.nexus;
				const attackerUsername = attack.attacker.user.username;
				const canShowOnStarfield =
					typeof defenderNexus.x === 'number' && typeof defenderNexus.y === 'number';
				return (
					<button
						key={`in-${attack._id}`}
						type="button"
						className={`tmb-item tmb-item--incoming${isScout ? ' tmb-item--scout' : ''}`}
						onClick={() => goToNexus(defenderNexus._id)}
						title={`${isScout ? 'Incoming scout' : 'Incoming attack'} on ${defenderNexus.name ?? 'your nexus'} — click to view nexus`}
					>
						<span className="tmb-pulse" aria-hidden="true" />
						<span className="tmb-icon" aria-hidden="true">
							{isScout ? '👁' : '⚠'}
						</span>
						<span className="tmb-label">
							<span className="tmb-verb">{isScout ? 'SCOUT' : 'INCOMING'}</span>
							{attackerUsername && (
								<span className="tmb-who">
									{' '}
									from <strong>{attackerUsername}</strong>
								</span>
							)}
							{defenderNexus.name && (
								<span className="tmb-target"> → {defenderNexus.name}</span>
							)}
						</span>
						<span className="tmb-countdown">
							<Countdown endAt={attack.arrivesAt} completedLabel="Arriving…" />
							{' @ '}
							{formatTimeOfDay(attack.arrivesAt, true)}
						</span>
						{canShowOnStarfield && (
							<button
								type="button"
								className="tmb-map-btn"
								onClick={(e) => {
									e.stopPropagation();
									goToStarfield(defenderNexus.x!, defenderNexus.y!);
								}}
								title="View on Starfield"
								aria-label="View on Starfield"
							>
								⊕
							</button>
						)}
					</button>
				);
			})}
		</div>
	);
}
