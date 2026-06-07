'use client';

import { getAllAttacks } from '@/services/api';
import '@/styles/TroopMovementsBar.css';
import { formatTimeOfDay } from '@/utils/date';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { startTransition } from 'react';
import { AlertTriangle, MapPin, Shield } from 'lucide-react';
import { Countdown } from './Countdown';
import { useStartProgress } from './NavigationProgress';

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

type Kind = 'attack' | 'support';

// Resolve the mission kind once so the verb, colour class, and icon all agree.
// Scouts are deliberately surfaced to the DEFENDER as a generic incoming attack:
// the target should not be able to tell a recon mission from a real strike and
// safely ignore it. (Mechanics are unchanged — it's still a no-damage scout.)
function kindOf(type?: string): Kind {
	if (type === 'support') return 'support';
	return 'attack';
}

const VERB: Record<Kind, string> = {
	attack: 'INCOMING ATTACK',
	support: 'INCOMING SUPPORT'
};

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

	// Hostile movements (attacks + scouts) lead; friendly support follows. A real
	// strike is the thing the player must react to, so it should never be visually
	// buried under reinforcements.
	const sorted = [...incoming].sort((a, b) => {
		const rank = (t?: string) => (kindOf(t) === 'support' ? 1 : 0);
		const r = rank(a.type) - rank(b.type);
		if (r !== 0) return r;
		return new Date(a.arrivesAt).getTime() - new Date(b.arrivesAt).getTime();
	});

	const hostileCount = incoming.filter((a) => kindOf(a.type) !== 'support').length;

	const goToNexus = (nexusId: string) => {
		startProgress();
		startTransition(() => router.push(`/nexus/${nexusId}`));
	};

	const goToStarfield = (x: number, y: number) => {
		startProgress();
		startTransition(() => router.push(`/starfield?cx=${x}&cy=${y}`));
	};

	return (
		<div
			className="troop-movements-bar"
			role="alert"
			aria-label={`${hostileCount} incoming hostile movement${hostileCount === 1 ? '' : 's'}`}
		>
			{sorted.map((attack) => {
				const kind = kindOf(attack.type);
				const target = attack.defender.nexus;
				const source = attack.attacker.nexus;
				const attackerUsername = attack.attacker.user.username;
				const canShowOnStarfield = typeof target.x === 'number' && typeof target.y === 'number';
				const Icon = kind === 'support' ? Shield : AlertTriangle;
				return (
					<button
						key={`in-${attack._id}`}
						type="button"
						className={`tmb-item tmb-item--${kind}`}
						onClick={() => goToNexus(target._id)}
						title={`${VERB[kind]}${attackerUsername ? ` from ${attackerUsername}` : ''} → ${target.name ?? 'your nexus'}. Click to open it.`}
					>
						{kind !== 'support' && <span className="tmb-pulse" aria-hidden="true" />}
						<span className="tmb-icon" aria-hidden="true">
							<Icon size={13} />
						</span>
						<span className="tmb-label">
							<span className="tmb-verb">{VERB[kind]}</span>
							{/* From: who + which enemy nexus it launched from. */}
							<span className="tmb-from">
								{attackerUsername ? <strong>{attackerUsername}</strong> : 'Unknown'}
								{source?.name ? ` · ${source.name}` : ''}
								{typeof source?.x === 'number' ? ` (${source.x}|${source.y})` : ''}
							</span>
							{/* To: which of YOUR nexuses is the target. */}
							<span className="tmb-arrow" aria-hidden="true">
								→
							</span>
							<span className="tmb-target">
								{target.name ?? 'your nexus'}
								{typeof target.x === 'number' ? ` (${target.x}|${target.y})` : ''}
							</span>
						</span>
						<span className="tmb-countdown">
							<Countdown endAt={attack.arrivesAt} completedLabel="Arriving…" />
							{' @ '}
							{formatTimeOfDay(attack.arrivesAt, true)}
						</span>
						{canShowOnStarfield && (
							<span
								role="button"
								tabIndex={0}
								className="tmb-map-btn"
								onClick={(e) => {
									e.stopPropagation();
									goToStarfield(target.x!, target.y!);
								}}
								onKeyDown={(e) => {
									if (e.key === 'Enter' || e.key === ' ') {
										e.preventDefault();
										e.stopPropagation();
										goToStarfield(target.x!, target.y!);
									}
								}}
								title="View target on Starfield"
								aria-label="View target on Starfield"
							>
								<MapPin size={12} />
							</span>
						)}
					</button>
				);
			})}
		</div>
	);
}
