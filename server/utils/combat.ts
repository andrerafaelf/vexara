import type { Attack, Nexus, Prisma } from '@prisma/client';
import prisma from '../lib/prisma.js';
import {
	notifyAttackUpdate,
	notifyFactionUpdated,
	notifyNexusConquered,
	notifyReportUpdate,
	notifyTransferUpdate
} from '../services/warRoomSocket.js';
import type { TroopKey } from '../types/index.js';
import {
	areAllDefendingTroopsEliminated,
	computeClassWeightedAttack,
	computeClassWeightedDefense,
	computeLootStolen,
	computeLossesForLoser,
	computeLossesForWinner,
	computeScoutCombat,
	computeTroopTotal,
	TROOP_STATS
} from './combatMath.js';
import { getMaxStorage, getNexusTypeEffectiveMultipliers } from './economy.js';
import { resolveEventForNexus } from './galaxyEvents.js';
import {
	getStealthScoutFailChance,
	partitionStealthVault,
	RETURN_TRAVEL_MULTIPLIER
} from './gameConstants.js';
import { logInfo, logWarn } from './logger.js';
import { computeNexusPopulation, getPopulationMax, loadAwayPopulation } from './population.js';
import { NOTIF, sendPushToUser } from './push.js';
import { aggregateStationedSupport, buildDetailedScoutIntel } from './scouting.js';

async function logFactionEvent(
	userId: number,
	galaxyId: number,
	type: string,
	actorName?: string,
	targetName?: string,
	meta?: string
) {
	const membership = await prisma.factionMember.findUnique({
		where: { userId_galaxyId: { userId, galaxyId } },
		select: { factionId: true }
	});
	if (!membership) return;
	await prisma.factionEvent.create({
		data: { factionId: membership.factionId, type, actorName, targetName, meta }
	});
}

const TROOP_KEYS = Object.keys(TROOP_STATS) as TroopKey[];

const TROOP_POPULATION_COST: Record<TroopKey, number> = {
	sentinelLancer: 1,
	assaultTrooper: 1,
	vanguardBreaker: 1,
	reconOperative: 1,
	wraithSkimmer: 3,
	siegeMech: 4,
	bulwarkGuard: 2,
	aegisSkirmisher: 2,
	pyreSuppressor: 2,
	arcDisruptor: 2,
	phantomLance: 3,
	annihilatorPlatform: 5,
	voidStalker: 3,
	plasmaTurret: 4,
	overseer: 5,
	siegeColossus: 5
};

type AttackWithNexuses = Attack & { attackerNexus: Nexus | null; defenderNexus: Nexus | null };

function countTroops(troops: unknown): number {
	const source =
		troops && typeof troops === 'object' ? (troops as Partial<Record<TroopKey, number>>) : {};
	return TROOP_KEYS.reduce((sum, key) => sum + Math.max(0, Number(source[key] || 0)), 0);
}

function troopPopulationCost(troops: unknown): number {
	const source =
		troops && typeof troops === 'object' ? (troops as Partial<Record<TroopKey, number>>) : {};
	return TROOP_KEYS.reduce(
		(sum, key) => sum + Math.max(0, Number(source[key] || 0)) * (TROOP_POPULATION_COST[key] || 1),
		0
	);
}

async function freePopulationForDestroyedTroops(
	nexusId: number,
	troops: unknown,
	context: Record<string, unknown>
): Promise<void> {
	const populationFreed = troopPopulationCost(troops);
	if (populationFreed <= 0) return;

	const nexus = await prisma.nexus.findUnique({ where: { id: nexusId } });
	if (!nexus) return;

	// Recompute from the post-mutation state rather than subtracting the freed
	// cost. By now the destroyed troops are already gone from their transfer/
	// attack row, so reading the nexus's troops + queue + remaining away-pop via
	// computeNexusPopulation yields the authoritative value and can't drift.
	const away = await loadAwayPopulation(prisma, nexusId);
	const populationCurrent = computeNexusPopulation({
		troops: nexus as unknown as Record<string, unknown>,
		trainingQueue: nexus.trainingQueue,
		populationMax: nexus.populationMax,
		...away
	});

	await prisma.nexus.update({
		where: { id: nexusId },
		data: { populationCurrent }
	});
	logInfo('destroyed_troops_population_freed', {
		nexusId,
		populationFreed,
		populationCurrent,
		...context
	});
}

async function destroyInvalidInboundSupport(
	nexusId: number,
	galaxyId: number,
	newOwnerId: number | null,
	capturedByAttackId: number
): Promise<number> {
	const supportAttacks = await prisma.attack.findMany({
		where: {
			galaxyId,
			defenderNexusId: nexusId,
			status: 'traveling',
			type: 'support'
		},
		select: {
			id: true,
			attackerUserId: true,
			attackerNexusId: true,
			defenderUserId: true,
			troops: true,
			createdAt: true,
			arrivesAt: true
		}
	});

	const invalidSupport = supportAttacks.filter((support) => support.defenderUserId !== newOwnerId);
	if (invalidSupport.length === 0) return 0;

	const now = Date.now();
	for (const support of invalidSupport) {
		// Troops were still in transit — bounce them home. Return time is the
		// one-way trip scaled by RETURN_TRAVEL_MULTIPLIER (0 = near-instant).
		const travelMs = support.arrivesAt!.getTime() - support.createdAt.getTime();
		const returnsAt = new Date(now + travelMs * RETURN_TRAVEL_MULTIPLIER);
		await prisma.attack.update({
			where: { id: support.id },
			data: {
				status: 'returning',
				returnsAt,
				result: {
					mission: 'support',
					victory: false,
					reason: 'host_conquered',
					survivingTroops: support.troops,
					attackerLosses: {},
					defenderLosses: {},
					resourcesStolen: { biomass: 0, alloy: 0, ore: 0 }
				} as Prisma.InputJsonObject
			}
		});
		notifyAttackUpdate(support.attackerUserId, support.defenderUserId, nexusId);
		if (support.attackerUserId) notifyReportUpdate(support.attackerUserId);
	}

	logInfo('conquest_bounced_inbound_support', {
		nexusId,
		galaxyId,
		newOwnerId,
		capturedByAttackId,
		supportAttackIds: invalidSupport.map((support) => support.id),
		troopsBounced: invalidSupport.reduce((sum, support) => sum + countTroops(support.troops), 0)
	});

	return invalidSupport.length;
}

async function destroyForeignTransfersAtConqueredNexus(
	nexusId: number,
	galaxyId: number,
	newOwnerId: number | null,
	capturedByAttackId: number
): Promise<number> {
	const transfers = await prisma.troopTransfer.findMany({
		where: {
			galaxyId,
			hostNexusId: nexusId,
			status: { in: ['traveling', 'stationed'] }
		},
		include: { ownerNexus: { select: { ownerId: true } } }
	});
	const foreignTransfers = transfers.filter(
		(transfer) => transfer.ownerNexus.ownerId !== newOwnerId
	);
	if (foreignTransfers.length === 0) return 0;

	await prisma.troopTransfer.deleteMany({
		where: { id: { in: foreignTransfers.map((transfer) => transfer.id) } }
	});
	logWarn('conquest_destroyed_foreign_transfers', {
		nexusId,
		galaxyId,
		newOwnerId,
		capturedByAttackId,
		transferIds: foreignTransfers.map((transfer) => transfer.id),
		troopsDestroyed: foreignTransfers.reduce(
			(sum, transfer) => sum + countTroops(transfer.troops),
			0
		)
	});

	for (const transfer of foreignTransfers) {
		await freePopulationForDestroyedTroops(transfer.ownerNexusId, transfer.troops, {
			reason: 'foreign_transfer_destroyed_by_conquest',
			transferId: transfer.id,
			conqueredNexusId: nexusId,
			capturedByAttackId
		});
		if (transfer.ownerNexus.ownerId)
			notifyTransferUpdate(transfer.ownerNexus.ownerId, transfer.ownerNexusId);
	}

	return foreignTransfers.length;
}

export async function processArrivedAttacks(): Promise<void> {
	try {
		const now = new Date();

		const arrivedAttacks = await prisma.attack.findMany({
			where: { status: 'traveling', arrivesAt: { lte: now } },
			include: { attackerNexus: true, defenderNexus: true }
		});
		// Support missions must be resolved before attacks so their TroopTransfer
		// records exist (status='stationed') when combat aggregates defender forces.
		const sorted = [
			...arrivedAttacks.filter((a) => a.type === 'support'),
			...arrivedAttacks.filter((a) => a.type !== 'support')
		];
		for (const attack of sorted) {
			await resolveCombat(attack as AttackWithNexuses);
		}

		const returningAttacks = await prisma.attack.findMany({
			where: { status: 'returning', returnsAt: { lte: now } }
		});
		for (const attack of returningAttacks) {
			await processReturnedTroops(attack);
		}
	} catch (err) {
		console.error('Error processing attacks:', err);
	}
}

async function resolveCombat(attack: AttackWithNexuses): Promise<void> {
	try {
		const defenderNexus = await prisma.nexus.findUnique({ where: { id: attack.defenderNexusId! } });
		let attackTroops = attack.troops as Record<TroopKey, number>;

		if (attack.type === 'support') {
			if (!defenderNexus || defenderNexus.ownerId !== attack.defenderUserId) {
				await prisma.attack.update({
					where: { id: attack.id },
					data: {
						status: 'completed',
						result: {
							mission: 'support',
							victory: false,
							destroyed: true,
							reason: 'host_owner_changed',
							troopsDestroyed: attackTroops,
							attackerLosses: {},
							defenderLosses: {},
							resourcesStolen: { biomass: 0, alloy: 0, ore: 0 }
						} as Prisma.InputJsonObject
					}
				});
				logWarn('support_destroyed_host_owner_changed', {
					attackId: attack.id,
					hostNexusId: attack.defenderNexusId,
					expectedOwnerId: attack.defenderUserId,
					currentOwnerId: defenderNexus?.ownerId ?? null,
					troopsDestroyed: countTroops(attackTroops)
				});
				await freePopulationForDestroyedTroops(attack.attackerNexusId!, attackTroops, {
					reason: 'support_host_owner_changed',
					attackId: attack.id,
					hostNexusId: attack.defenderNexusId
				});
				notifyAttackUpdate(attack.attackerUserId, attack.defenderUserId, attack.defenderNexusId!);
				if (attack.attackerUserId) notifyReportUpdate(attack.attackerUserId);
				return;
			}

			// Station the troops at the defender nexus via TroopTransfer.
			//
			// INVARIANT: a support mission must NOT change the host nexus's
			// population. Stationed support lives only on the TroopTransfer row, never
			// on the host's troop columns, and the host's populationCurrent is left
			// untouched here. The support troops still occupy the *sender's* housing
			// (population was committed when they were trained and is only released by
			// freePopulationForDestroyedTroops when they actually die in combat). Do
			// not add a host populationCurrent write to this branch.
			await prisma.$transaction([
				prisma.troopTransfer.create({
					data: {
						galaxyId: attack.galaxyId,
						ownerNexusId: attack.attackerNexusId!,
						hostNexusId: attack.defenderNexusId!,
						troops: attackTroops as unknown as Prisma.InputJsonObject,
						status: 'stationed'
					}
				}),
				prisma.attack.update({
					where: { id: attack.id },
					data: {
						status: 'completed',
						result: {
							mission: 'support',
							victory: true,
							troopsStationed: attackTroops,
							attackerLosses: {},
							defenderLosses: {},
							resourcesStolen: { biomass: 0, alloy: 0, ore: 0 }
						} as Prisma.InputJsonObject
					}
				})
			]);

			if (attack.attackerUserId) {
				void sendPushToUser(attack.attackerUserId, NOTIF.TROOP_TRANSFER, {
					title: 'Support Arrived',
					body: `Your support troops have arrived at the destination nexus.`,
					tag: `support-arrived-${attack.id}`,
					data: { url: '/' }
				});
			}
			if (attack.defenderUserId) {
				void sendPushToUser(attack.defenderUserId, NOTIF.TROOP_TRANSFER, {
					title: 'Reinforcements Arrived',
					body: `Allied support troops have arrived to defend your nexus.`,
					tag: `support-received-${attack.id}`,
					data: { url: '/' }
				});
			}
			notifyAttackUpdate(attack.attackerUserId, attack.defenderUserId, attack.defenderNexusId!);
			if (attack.attackerUserId) notifyReportUpdate(attack.attackerUserId);
			if (attack.defenderUserId) notifyReportUpdate(attack.defenderUserId);
			return;
		}

		if (attack.type === 'scout') {
			const travelMs = attack.arrivesAt!.getTime() - attack.createdAt.getTime();
			const returnsAt = new Date(Date.now() + travelMs * RETURN_TRAVEL_MULTIPLIER);

			const reconSent = attackTroops.reconOperative || 0;
			const defenderReconCount = defenderNexus
				? (((defenderNexus as unknown as Record<string, number>).reconOperative as number) ?? 0)
				: 0;

			// ─── GATE 1: Scout vs Scout Combat ───
			let reconAfterGate1 = reconSent;
			let defenderReconLost = 0;
			let scoutCombatDetail: {
				attackerSent: number;
				defenderGarrison: number;
				attackerSurvivorsGate1: number;
				defenderLost: number;
			} | null = null;

			if (defenderReconCount > 0 && reconSent > 0 && defenderNexus) {
				const seed = attack.id * 2654435761;
				const result = computeScoutCombat(reconSent, defenderReconCount, seed);
				reconAfterGate1 = result.attackerSurvivors;
				defenderReconLost = result.defenderLosses;
				scoutCombatDetail = {
					attackerSent: reconSent,
					defenderGarrison: defenderReconCount,
					attackerSurvivorsGate1: reconAfterGate1,
					defenderLost: defenderReconLost
				};

				if (defenderReconLost > 0) {
					const newReconCount = Math.max(0, defenderReconCount - defenderReconLost);
					const defenderAway = await loadAwayPopulation(prisma, defenderNexus.id);
					const nextPopulationCurrent = computeNexusPopulation({
						troops: {
							...(defenderNexus as unknown as Record<string, unknown>),
							reconOperative: newReconCount
						},
						trainingQueue: defenderNexus.trainingQueue,
						populationMax: defenderNexus.populationMax,
						...defenderAway
					});
					await prisma.nexus.update({
						where: { id: defenderNexus.id },
						data: { reconOperative: newReconCount, populationCurrent: nextPopulationCurrent }
					});
				}
			}

			const gate1Failed = reconAfterGate1 <= 0;

			// ─── GATE 2: Stealth Array Interception ───
			let scoutFailed = gate1Failed;
			let reconSurviving = reconAfterGate1;
			let defenderStealthLevel = 0;

			if (!gate1Failed && defenderNexus) {
				defenderStealthLevel =
					((defenderNexus as unknown as Record<string, number>).stealthArray as number) ?? 0;
				const scoutFailChance = getStealthScoutFailChance(defenderStealthLevel);
				const intercepted = Math.random() < scoutFailChance;
				if (intercepted) {
					scoutFailed = true;
					reconSurviving = 0;
				}
			}

			let scoutIntel =
				!scoutFailed && defenderNexus ? buildDetailedScoutIntel(defenderNexus) : null;
			if (scoutIntel && defenderNexus) {
				const support = await aggregateStationedSupport(defenderNexus.id);
				if (support) scoutIntel.supportTroops = support;

				scoutIntel = {
					...scoutIntel,
					resources: {
						biomass: partitionStealthVault(defenderNexus.biomass, defenderStealthLevel).visible,
						alloy: partitionStealthVault(defenderNexus.alloy, defenderStealthLevel).visible,
						ore: partitionStealthVault(defenderNexus.ore, defenderStealthLevel).visible
					}
				};
			}

			const attackerReconLost = reconSent - reconSurviving;

			await prisma.attack.update({
				where: { id: attack.id },
				data: {
					status: 'returning',
					returnsAt,
					result: {
						mission: 'scout',
						victory: !scoutFailed,
						scoutFailed,
						gate1Failed,
						scoutCombat: scoutCombatDetail,
						intel: scoutIntel,
						survivingTroops: { reconOperative: reconSurviving },
						attackerLosses: attackerReconLost > 0 ? { reconOperative: attackerReconLost } : {},
						defenderLosses: defenderReconLost > 0 ? { reconOperative: defenderReconLost } : {},
						resourcesStolen: { biomass: 0, alloy: 0, ore: 0 }
					} as Prisma.InputJsonObject
				}
			});

			if (attack.attackerUserId) {
				void sendPushToUser(attack.attackerUserId, NOTIF.ATTACK_RESOLVED, {
					title: '🛰️ Scout Returning',
					body: '🔭 Your scout mission is complete. combat log ready!',
					tag: `scout-${attack.id}`,
					data: { url: '/combat-logs' }
				});
			}
			notifyAttackUpdate(attack.attackerUserId, null, attack.attackerNexusId!);
			if (attack.attackerUserId) notifyReportUpdate(attack.attackerUserId);
			return;
		}

		if (!defenderNexus) return;

		// Target became attacker-owned mid-flight (e.g., a prior wave already
		// conquered it). Skip combat entirely and bounce the troops home — fighting
		// your own garrison would consume the Overseer and re-trigger conquest on
		// an already-owned nexus.
		if (
			attack.attackerUserId !== null &&
			defenderNexus.ownerId !== null &&
			defenderNexus.ownerId === attack.attackerUserId
		) {
			const travelMs = attack.arrivesAt!.getTime() - attack.createdAt.getTime();
			const returnsAt = new Date(Date.now() + travelMs * RETURN_TRAVEL_MULTIPLIER);
			await prisma.attack.update({
				where: { id: attack.id },
				data: {
					status: 'returning',
					returnsAt,
					result: {
						mission: 'attack',
						victory: false,
						reason: 'target_self_owned',
						survivingTroops: attackTroops,
						attackerLosses: {},
						defenderLosses: {},
						resourcesStolen: { biomass: 0, alloy: 0, ore: 0 }
					} as Prisma.InputJsonObject
				}
			});
			logInfo('attack_bounced_target_self_owned', {
				attackId: attack.id,
				attackerNexusId: attack.attackerNexusId,
				defenderNexusId: defenderNexus.id,
				attackerUserId: attack.attackerUserId,
				troopsReturning: countTroops(attackTroops)
			});
			notifyAttackUpdate(attack.attackerUserId, null, attack.attackerNexusId!);
			if (attack.attackerUserId) notifyReportUpdate(attack.attackerUserId);
			return;
		}

		// Plasma Turrets cannot leave their nexus, strip them from the attacking force.
		// They remain on the nexus and contribute to defense when under attack.
		const plasmaTurretsKept = attackTroops.plasmaTurret || 0;
		if (plasmaTurretsKept > 0) {
			attackTroops = { ...attackTroops, plasmaTurret: 0 };
		}

		// Aggregate support troops stationed at the defending nexus
		const supportTransfers = await prisma.troopTransfer.findMany({
			where: { hostNexusId: defenderNexus.id, status: 'stationed' },
			include: {
				ownerNexus: {
					select: { ownerId: true, name: true, owner: { select: { username: true } } }
				},
				hostNexus: { select: { name: true } }
			}
		});
		const supportTroops: Record<TroopKey, number> = {} as Record<TroopKey, number>;
		for (const transfer of supportTransfers) {
			const t = transfer.troops as Record<TroopKey, number>;
			for (const key of TROOP_KEYS) {
				supportTroops[key] = (supportTroops[key] || 0) + (t[key] || 0);
			}
		}

		// Diagnostic: capture which support records (if any) were considered, plus
		// any in-flight support attacks that arrived too late to be stationed.
		// Lets us reconstruct disputes like "my ally's stationed troops didn't help".
		const inFlightSupport = await prisma.attack.findMany({
			where: {
				defenderNexusId: defenderNexus.id,
				type: 'support',
				status: 'traveling'
			},
			select: { id: true, attackerNexusId: true, arrivesAt: true, troops: true }
		});
		logInfo('combat_defender_aggregation', {
			attackId: attack.id,
			defenderNexusId: defenderNexus.id,
			defenderOwnerId: defenderNexus.ownerId,
			garrisonTotal: TROOP_KEYS.reduce(
				(s, k) => s + ((defenderNexus as unknown as Record<TroopKey, number>)[k] || 0),
				0
			),
			supportTransferCount: supportTransfers.length,
			supportTransferIds: supportTransfers.map((t) => t.id),
			supportTroopsTotal: TROOP_KEYS.reduce((s, k) => s + (supportTroops[k] || 0), 0),
			inFlightSupportAttackIds: inFlightSupport.map((a) => a.id),
			inFlightSupportArrivesAt: inFlightSupport.map((a) => a.arrivesAt?.toISOString() ?? null)
		});

		// Merged defender force (garrison + support)
		const mergedDefenderForce: Record<string, number> = {};
		for (const key of TROOP_KEYS) {
			mergedDefenderForce[key] =
				((defenderNexus as unknown as Record<TroopKey, number>)[key] || 0) +
				(supportTroops[key] || 0);
		}

		// Attacker Targeting Core level amplifies class-counter bonuses
		const attackerNexusForTargeting = await prisma.nexus.findUnique({
			where: { id: attack.attackerNexusId! }
		});
		const attackerTargetingCoreLevel =
			(attackerNexusForTargeting as unknown as { targetingCore?: number } | null)?.targetingCore ??
			0;

		// Symmetric counter triangle (v0.22): BOTH attack and defense are now
		// class-weighted. The attacker's strikes are amplified against the classes
		// they counter (computeClassWeightedAttack), and the defender's garrison is
		// amplified when its class counters the incoming attacker
		// (computeClassWeightedDefense). This makes scouting + bringing the right
		// counter the deciding factor instead of raw stat stacking.
		let attackPower = computeClassWeightedAttack(
			attackTroops,
			mergedDefenderForce,
			attackerTargetingCoreLevel
		);
		let defensePower = computeClassWeightedDefense(mergedDefenderForce, attackTroops);

		const baseShieldEff = defenderNexus.nexusType === 'Military Outpost' ? 2.0 : 1;
		const nexusDoubled =
			(defenderNexus as unknown as { nexusTypeDoubled?: boolean }).nexusTypeDoubled ?? false;
		const shieldEfficiencyMultiplier =
			baseShieldEff === 1 ? 1 : 1 + (baseShieldEff - 1) * (nexusDoubled ? 2 : 1);
		// Shield Grid trimmed 0.02 → 0.015/level so a high-shield turtle can't stack
		// an unbreakable wall on top of class-counter-amplified anvil defense.
		defensePower *= 1 + defenderNexus.shieldGrid * 0.015 * shieldEfficiencyMultiplier;

		// An empty nexus (no defending troops) is taken unopposed. Without this an
		// attack with zero effective attack power — notably a lone follow-up
		// Overseer strike, since Overseers have 0 attack — would tie 0 vs 0 and
		// fail the strict `>` check, so sequential Overseer waves could never drive
		// an undefended nexus's control to 0. A force with any attack/units walking
		// into nothing should always win.
		const defenderHasNoTroops =
			TROOP_KEYS.reduce((s, t) => s + (mergedDefenderForce[t] || 0), 0) === 0;
		const attackerHasUnits = TROOP_KEYS.reduce((s, t) => s + (attackTroops[t] || 0), 0) > 0;
		const attackerWins = attackPower > defensePower || (defenderHasNoTroops && attackerHasUnits);
		// powerRatio is always loser/winner (0..1]; used to calibrate losses
		const powerRatio = attackerWins
			? Math.min(1, defensePower / Math.max(1, attackPower))
			: Math.min(1, attackPower / Math.max(1, defensePower));

		// Deterministic seed from attack id so replays are reproducible
		const seed = attack.id * 2654435761;

		// The loser's losses now scale with powerRatio (how close the fight was) so
		// a narrow defeat leaves a remnant instead of wiping the whole army. A
		// decisive win (low powerRatio) still drives the loser to ~0, which is what
		// lets a dominant strike clear the garrison and enable conquest.
		const attackerLosses: Partial<Record<TroopKey, number>> = attackerWins
			? computeLossesForWinner(attackTroops, powerRatio, seed, mergedDefenderForce)
			: computeLossesForLoser(attackTroops, powerRatio);

		const rawDefenderLosses = attackerWins
			? computeLossesForLoser(mergedDefenderForce, powerRatio)
			: computeLossesForWinner(mergedDefenderForce, powerRatio, seed ^ 0xabcd1234, attackTroops);

		const defenderLosses: Partial<Record<TroopKey, number>> = {};
		const defenderTroopUpdates: Record<string, unknown> = {};

		// Clamp losses to actual troops present; split between garrison and support.
		// Population freed by these losses is captured by the recompute that reads
		// defenderTroopUpdates below - no running delta needed.
		for (const troopType of TROOP_KEYS) {
			if (troopType === 'overseer') continue;
			const totalInForce = mergedDefenderForce[troopType] || 0;
			if (totalInForce <= 0) continue;
			const rawLoss = Math.min(rawDefenderLosses[troopType] ?? 0, totalInForce);
			defenderLosses[troopType] = rawLoss;
			const garrisonCount = (defenderNexus as unknown as Record<TroopKey, number>)[troopType] || 0;
			const garrisonLoss = Math.min(rawLoss, garrisonCount);
			defenderTroopUpdates[troopType] = Math.max(0, garrisonCount - garrisonLoss);
		}

		// Overseer: destroyed only if all escort is wiped
		const totalNonOverseerSent = TROOP_KEYS.filter((t) => t !== 'overseer').reduce(
			(sum, t) => sum + (attackTroops[t] || 0),
			0
		);
		const totalNonOverseerLost = TROOP_KEYS.filter((t) => t !== 'overseer').reduce(
			(sum, t) => sum + (attackerLosses[t] || 0),
			0
		);
		attackerLosses.overseer = 0;
		if (
			(attackTroops.overseer || 0) > 0 &&
			totalNonOverseerSent > 0 &&
			totalNonOverseerLost >= totalNonOverseerSent
		) {
			attackerLosses.overseer = attackTroops.overseer;
		}

		const totalDefenderNonOverseer = TROOP_KEYS.filter((t) => t !== 'overseer').reduce(
			(sum, t) => sum + (mergedDefenderForce[t] || 0),
			0
		);
		const totalDefenderNonOverseerLost = TROOP_KEYS.filter((t) => t !== 'overseer').reduce(
			(sum, t) => sum + (defenderLosses[t] || 0),
			0
		);
		const defenderOverseerCount = mergedDefenderForce.overseer || 0;
		const garrisonOverseerCount =
			(defenderNexus as unknown as Record<TroopKey, number>).overseer || 0;
		if (defenderOverseerCount > 0) {
			if (attackerWins && totalDefenderNonOverseerLost >= totalDefenderNonOverseer) {
				defenderLosses.overseer = defenderOverseerCount;
				defenderTroopUpdates['overseer'] = 0;
			} else {
				defenderTroopUpdates['overseer'] = garrisonOverseerCount;
			}
		}

		// Remove destroyed support troops from their TroopTransfer records.
		// Losses are applied garrison-first; the remainder is spread across transfers
		// in order. remainingSupportLosses tracks how many per-type losses are still
		// unallocated so each transfer only absorbs its fair share.
		// Per-owner loss totals are accumulated so each owner receives one
		// consolidated push notification after all transfers are processed.
		// alliedContributions is keyed by ownerNexusId so multiple transfers from the
		// same ally are merged into one entry for the combat log.
		type AlliedContribution = {
			ownerNexusId: number;
			ownerNexusName: string;
			ownerUsername: string | null;
			initial: Partial<Record<TroopKey, number>>;
			losses: Partial<Record<TroopKey, number>>;
			survivors: Partial<Record<TroopKey, number>>;
		};
		const alliedContribMap = new Map<number, AlliedContribution>();

		if (supportTransfers.length > 0) {
			const remainingSupportLosses: Record<string, number> = {};
			for (const key of TROOP_KEYS) {
				const garrisonCount = (defenderNexus as unknown as Record<TroopKey, number>)[key] || 0;
				const totalLost = defenderLosses[key] || 0;
				remainingSupportLosses[key] = Math.max(0, totalLost - garrisonCount);
			}

			// userId → { totalLost, totalRemaining, ownerNexusId, ownerNexusName, hostNexusName }
			const lossNotifMap = new Map<
				number,
				{
					totalLost: number;
					totalRemaining: number;
					ownerNexusId: number;
					ownerNexusName: string;
					hostNexusName: string;
				}
			>();

			for (const transfer of supportTransfers) {
				const t = transfer.troops as Record<TroopKey, number>;
				const updatedTroops: Record<string, number> = {};
				const lostTroops: Partial<Record<TroopKey, number>> = {};
				let anyRemain = false;
				let anyLost = false;
				for (const key of TROOP_KEYS) {
					const inTransfer = t[key] || 0;
					const lost = Math.min(inTransfer, remainingSupportLosses[key] || 0);
					remainingSupportLosses[key] = (remainingSupportLosses[key] || 0) - lost;
					if (lost > 0) {
						lostTroops[key] = lost;
						anyLost = true;
					}
					const remaining = inTransfer - lost;
					updatedTroops[key] = remaining;
					if (remaining > 0) anyRemain = true;
				}

				// Accumulate per-nexus allied contribution for the combat log.
				const existingContrib = alliedContribMap.get(transfer.ownerNexusId);
				if (existingContrib) {
					for (const key of TROOP_KEYS) {
						const init = t[key] || 0;
						if (init > 0) existingContrib.initial[key] = (existingContrib.initial[key] || 0) + init;
						const lost = lostTroops[key] || 0;
						if (lost > 0) existingContrib.losses[key] = (existingContrib.losses[key] || 0) + lost;
						const surv = updatedTroops[key] || 0;
						if (surv > 0)
							existingContrib.survivors[key] = (existingContrib.survivors[key] || 0) + surv;
					}
				} else {
					const initial: Partial<Record<TroopKey, number>> = {};
					const losses: Partial<Record<TroopKey, number>> = {};
					const survivors: Partial<Record<TroopKey, number>> = {};
					for (const key of TROOP_KEYS) {
						const init = t[key] || 0;
						if (init > 0) initial[key] = init;
						const lost = lostTroops[key] || 0;
						if (lost > 0) losses[key] = lost;
						const surv = updatedTroops[key] || 0;
						if (surv > 0) survivors[key] = surv;
					}
					alliedContribMap.set(transfer.ownerNexusId, {
						ownerNexusId: transfer.ownerNexusId,
						ownerNexusName: transfer.ownerNexus.name,
						ownerUsername:
							(transfer.ownerNexus as unknown as { owner?: { username: string } | null }).owner
								?.username ?? null,
						initial,
						losses,
						survivors
					});
				}

				if (!anyRemain) {
					await prisma.troopTransfer.delete({ where: { id: transfer.id } });
				} else {
					await prisma.troopTransfer.update({
						where: { id: transfer.id },
						data: { troops: updatedTroops as unknown as Prisma.InputJsonObject }
					});
				}
				if (anyLost) {
					await freePopulationForDestroyedTroops(transfer.ownerNexusId, lostTroops, {
						reason: 'support_transfer_combat_losses',
						transferId: transfer.id,
						attackId: attack.id,
						defenderNexusId: defenderNexus.id
					});

					const ownerId = transfer.ownerNexus.ownerId;
					if (ownerId) {
						const lostCount = Object.values(lostTroops).reduce((s, n) => s + (n || 0), 0);
						const remainingCount = Object.values(updatedTroops).reduce((s, n) => s + n, 0);
						const existing = lossNotifMap.get(ownerId);
						if (existing) {
							existing.totalLost += lostCount;
							existing.totalRemaining += remainingCount;
						} else {
							lossNotifMap.set(ownerId, {
								totalLost: lostCount,
								totalRemaining: remainingCount,
								ownerNexusId: transfer.ownerNexusId,
								ownerNexusName: transfer.ownerNexus.name,
								hostNexusName: transfer.hostNexus.name
							});
						}
					}
				}
			}

			// Send one push per affected owner and refresh their transfer view.
			for (const [ownerId, info] of lossNotifMap) {
				const body =
					info.totalRemaining > 0
						? `${info.totalLost} troop${info.totalLost !== 1 ? 's' : ''} lost at ${info.hostNexusName}. ${info.totalRemaining} survived.`
						: `All ${info.totalLost} troop${info.totalLost !== 1 ? 's' : ''} stationed at ${info.hostNexusName} were lost in combat.`;
				void sendPushToUser(ownerId, NOTIF.TROOP_TRANSFER, {
					title: '⚠️ Stationed Troops Lost',
					body,
					tag: `transfer-loss-${attack.id}-${ownerId}`,
					data: { url: '/' }
				});
				notifyTransferUpdate(ownerId, info.ownerNexusId);
			}
		}

		// Building damage: if attacker wins and all defender troops are wiped, overflow attack damages buildings.
		// shieldGrid is always hit first (it's the wall). Each "hit" reduces one building by 1 level.
		const buildingDamageUpdates: Record<string, number> = {};
		const totalDefenderTroopsInForce = computeTroopTotal(mergedDefenderForce, true);
		const totalDefenderTroopsLost = TROOP_KEYS.reduce(
			(s, t) => s + Math.min(mergedDefenderForce[t] || 0, defenderLosses[t] || 0),
			0
		);
		const allDefenderTroopsWiped = areAllDefendingTroopsEliminated(
			mergedDefenderForce,
			defenderLosses
		);
		const buildingDamageLog: { building: string; from: number; to: number }[] = [];
		// Building damage requires the attacker to bring real siege weight, not just
		// "win". Against an UNDEFENDED nexus the old code took a flat 0.5 overflow
		// fallback, so a single Lancer Drone (attack power ~3) flattened 2 building
		// levels. Now overflow is the surplus attack power over the defense as a
		// fraction of a siege baseline, and a minimum power floor gates it entirely
		// so trivial pokes do nothing.
		const BUILDING_DAMAGE_MIN_ATTACK_POWER = 2000; // ~ a real assault, not a poke
		const BUILDING_DAMAGE_FULL_OVERFLOW = 20000; // attack power for max (5) hits vs empty
		if (attackerWins && allDefenderTroopsWiped && attackPower >= BUILDING_DAMAGE_MIN_ATTACK_POWER) {
			// Overflow = surplus power past the defense, scaled to the siege baseline.
			// Vs a defended nexus this is (attack-defense)/baseline; vs an empty one
			// it's the attacker's raw power/baseline — so hits scale with how much
			// force was actually committed, never a flat fallback.
			const surplus = Math.max(0, attackPower - defensePower);
			const overflowRatio = Math.min(1, surplus / BUILDING_DAMAGE_FULL_OVERFLOW);
			const maxHits = Math.max(1, Math.floor(overflowRatio * 5)); // 1–5 levels total
			const BUILDING_PRIORITY = [
				'shieldGrid',
				'commandCore',
				// The retired RC sat at priority slot 3 (right after CC). Its three
				// replacements (Hangar Bay / Plasma Forge / Armor Foundry) inherit
				// that slot. They're hit in declaration order; with only 1-5 hits
				// per resolved attack the worst case is a max-overflow strike that
				// reaches the heavies, which mirrors the old RC-at-slot-3 behavior.
				'hangarBay',
				'plasmaForge',
				'armorFoundry',
				'lifeSupport',
				'storageVault',
				'biomassFarm',
				'alloyForge',
				'oreExtractor',
				'targetingCore',
				'stealthArray'
			] as const;
			type BuildingKey = (typeof BUILDING_PRIORITY)[number];
			let hitsRemaining = maxHits;
			for (const building of BUILDING_PRIORITY) {
				if (hitsRemaining <= 0) break;
				const currentLevel =
					(defenderNexus as unknown as Record<BuildingKey, number>)[building] ?? 0;
				if (currentLevel <= 0) continue;
				const newLevel = Math.max(0, currentLevel - 1);
				buildingDamageUpdates[building] = newLevel;
				if (building === 'lifeSupport') {
					buildingDamageUpdates['populationMax'] = getPopulationMax(newLevel);
				}
				buildingDamageLog.push({ building, from: currentLevel, to: newLevel });
				hitsRemaining--;
			}
		}

		let resourcesStolen = { biomass: 0, alloy: 0, ore: 0 };
		let conquered = false;
		const defenderResourceUpdates: Record<string, number> = {};

		// Market listings hold resources in escrow off the nexus row. Without this
		// step, players could trivially shield their stockpile from looting by
		// listing it. On any resolved attack the defender's active listings are
		// cancelled and the offered resources returned to the nexus, so combat
		// sees the full stockpile. The listing delete is folded into the same
		// transaction as the nexus update at the bottom of this block.
		const activeListings = await prisma.marketListing.findMany({
			where: { sellerNexusId: defenderNexus.id },
			select: { id: true, offerResource: true, offerAmount: true }
		});
		let cancelledListings = 0;
		if (activeListings.length > 0) {
			const refund: Record<'biomass' | 'alloy' | 'ore', number> = { biomass: 0, alloy: 0, ore: 0 };
			for (const l of activeListings) {
				const key = l.offerResource as 'biomass' | 'alloy' | 'ore';
				if (key === 'biomass' || key === 'alloy' || key === 'ore') {
					refund[key] += l.offerAmount;
				}
			}
			// Mutate the in-memory defender so the loot math reads the unlocked totals.
			(defenderNexus as unknown as { biomass: number }).biomass =
				defenderNexus.biomass + refund.biomass;
			(defenderNexus as unknown as { alloy: number }).alloy = defenderNexus.alloy + refund.alloy;
			(defenderNexus as unknown as { ore: number }).ore = defenderNexus.ore + refund.ore;
			cancelledListings = activeListings.length;
		}

		if (attackerWins) {
			let lootCapacity = 0;
			for (const troopType of TROOP_KEYS) {
				const count = attackTroops[troopType] || 0;
				if (count > 0) lootCapacity += TROOP_STATS[troopType].carry * count;
			}
			const totalTroopsSent = Object.values(attackTroops).reduce((a, b) => a + b, 0);
			const totalLost = Object.values(attackerLosses).reduce(
				(a: number, b) => a + (b || 0),
				0 as number
			);
			const surviveRatio = totalTroopsSent > 0 ? 1 - totalLost / totalTroopsSent : 0;
			const survivingCarry = lootCapacity * surviveRatio;

			const defenderBonuses = getNexusTypeEffectiveMultipliers(
				defenderNexus as Parameters<typeof getNexusTypeEffectiveMultipliers>[0]
			);
			const lootProtection = defenderBonuses?.lootProtection ?? 0;
			const lootableFraction = 1 - lootProtection;

			// Stealth Array hidden vault protects the first N units of each
			// resource from raids (Stage 2c). Only the portion ABOVE the per-
			// resource hidden cap is exposed to the loot calculation. The actual
			// stockpile on the nexus row stays intact - raiders can't loot what
			// they can't see, but the defender keeps the full balance.
			const defenderStealthLevel =
				((defenderNexus as unknown as Record<string, number>).stealthArray as number) ?? 0;
			const biomassVisible = partitionStealthVault(
				defenderNexus.biomass,
				defenderStealthLevel
			).visible;
			const alloyVisible = partitionStealthVault(defenderNexus.alloy, defenderStealthLevel).visible;
			const oreVisible = partitionStealthVault(defenderNexus.ore, defenderStealthLevel).visible;

			resourcesStolen = computeLootStolen(
				{
					biomass: biomassVisible,
					alloy: alloyVisible,
					ore: oreVisible
				},
				survivingCarry,
				lootableFraction
			);
			defenderResourceUpdates.biomass = defenderNexus.biomass - resourcesStolen.biomass;
			defenderResourceUpdates.alloy = defenderNexus.alloy - resourcesStolen.alloy;
			defenderResourceUpdates.ore = defenderNexus.ore - resourcesStolen.ore;
		}

		const remainingResources = {
			biomass: Math.max(0, defenderResourceUpdates.biomass ?? defenderNexus.biomass),
			alloy: Math.max(0, defenderResourceUpdates.alloy ?? defenderNexus.alloy),
			ore: Math.max(0, defenderResourceUpdates.ore ?? defenderNexus.ore)
		};

		let newControlLevel = defenderNexus.controlLevel ?? 100;
		const overseerSent = attackTroops.overseer || 0;
		// Conquest no longer requires a total wipe of the defending force. Instead,
		// the Overseer drains control proportionally to how dominant the strike was
		// (powerRatio = defender_power / attacker_power, lower = more dominant):
		//   - Crushing (ratio <= 0.33, i.e. 3:1+ power advantage): 50 drain → 2 waves
		//   - Clear     (0.33 < ratio <= 0.66): 34 drain → 3 waves
		//   - Narrow    (ratio > 0.66): 15 drain → ~7 waves, attrition path for coalitions
		// Surviving stragglers from rounding can no longer block conquest, and small
		// factions can grind down a bigger player by stacking narrow wins. Hourly
		// control regeneration (+10/hr) prevents griefing-by-trickle from a single
		// attacker — attrition only works when waves land faster than control recovers.
		const overseerCanAct = attackerWins && overseerSent > 0 && attackerLosses.overseer === 0;

		let controlDrain = 0;
		if (overseerCanAct) {
			if (powerRatio <= 0.33) {
				controlDrain = 50;
			} else if (powerRatio <= 0.66) {
				controlDrain = 34;
			} else {
				controlDrain = 15;
			}
			newControlLevel = Math.max(0, newControlLevel - controlDrain);
			logInfo('overseer_control_drained', {
				attackId: attack.id,
				defenderNexusId: defenderNexus.id,
				powerRatio: Number(powerRatio.toFixed(3)),
				controlDrain,
				previousControlLevel: defenderNexus.controlLevel ?? 100,
				newControlLevel,
				allDefenderTroopsWiped
			});
			if (newControlLevel <= 0) {
				const attackerNexus = await prisma.nexus.findUnique({
					where: { id: attack.attackerNexusId! }
				});
				const newOwnerId = attackerNexus!.ownerId;
				defenderTroopUpdates['ownerId'] = newOwnerId;
				// Preserve the nexus's existing name on conquest — the conqueror keeps
				// whatever it was called (player-given name or NPC type label), rather
				// than wiping it to a generic "Conquered Nexus".
				const NPC_TYPE_NAMES = [
					'Resource Depot',
					'Military Outpost',
					'Supply Cache',
					'Neutral Settlement',
					'Forward Base'
				];
				const preservedType =
					defenderNexus.nexusType ??
					(NPC_TYPE_NAMES.includes(defenderNexus.name) ? defenderNexus.name : null);
				defenderTroopUpdates['nexusType'] = preservedType;
				// Conquest always resets to base tier - nexusTypeDoubled is never inherited.
				// Player specialization (CC15) is the only path that grants doubled bonuses.
				defenderTroopUpdates['nexusTypeDoubled'] = false;
				defenderTroopUpdates['conqueredAt'] = new Date();
				conquered = true;
				await destroyForeignTransfersAtConqueredNexus(
					defenderNexus.id,
					attack.galaxyId,
					newOwnerId,
					attack.id
				);
				await destroyInvalidInboundSupport(
					defenderNexus.id,
					attack.galaxyId,
					newOwnerId,
					attack.id
				);
				// Auto-kick the defender from their faction if this was their last nexus.
				const prevOwnerId = defenderNexus.ownerId;
				if (prevOwnerId) {
					const remainingNexuses = await prisma.nexus.count({
						where: {
							galaxyId: attack.galaxyId,
							ownerId: prevOwnerId,
							id: { not: defenderNexus.id }
						}
					});
					if (remainingNexuses === 0) {
						const membership = await prisma.factionMember.findUnique({
							where: { userId_galaxyId: { userId: prevOwnerId, galaxyId: attack.galaxyId } },
							select: { factionId: true }
						});
						if (membership) {
							await prisma.factionMember.delete({
								where: { userId_galaxyId: { userId: prevOwnerId, galaxyId: attack.galaxyId } }
							});
							await prisma.factionEvent.create({
								data: {
									factionId: membership.factionId,
									type: 'member_removed_no_nexus',
									actorName: undefined,
									targetName: undefined
								}
							});
							try {
								notifyFactionUpdated(membership.factionId);
							} catch (_) {}
						}
					}
				}
				logInfo('nexus_conquest_owner_changed', {
					attackId: attack.id,
					defenderNexusId: defenderNexus.id,
					previousOwnerId: defenderNexus.ownerId,
					newOwnerId,
					totalDefenderTroopsInForce,
					totalDefenderTroopsLost
				});
				// Overseer is consumed on the final conquering strike.
				// Mark it as lost so it is excluded from survivingTroops and the
				// stationed TroopTransfer, and its population slot is freed.
				attackerLosses.overseer = overseerSent;
			}
		}

		// If CC is damaged below 15 on a conquered NPC nexus (nexusTypeLockedAt null = auto-granted, not player-chosen),
		// revoke the T2 bonus so it doesn't stay doubled after the CC threshold is lost.
		const damagedCC = buildingDamageUpdates['commandCore'] as number | undefined;
		const nexusTypeLockedAt = (defenderNexus as unknown as { nexusTypeLockedAt?: Date | null })
			.nexusTypeLockedAt;
		const nexusTypeDoubled =
			(defenderNexus as unknown as { nexusTypeDoubled?: boolean }).nexusTypeDoubled ?? false;
		const shouldRevokeDoubled =
			damagedCC !== undefined && damagedCC < 15 && nexusTypeDoubled && !nexusTypeLockedAt;
		const nextPopulationMax =
			(buildingDamageUpdates['populationMax'] as number | undefined) ?? defenderNexus.populationMax;
		// Recompute from the post-combat troop columns (defenderTroopUpdates already
		// holds the survivors) + queue + away-pop, capped at the possibly-reduced
		// max, instead of subtracting defenderPopLost from the stored value.
		const defenderAway = await loadAwayPopulation(prisma, defenderNexus.id);
		const nextPopulationCurrent = computeNexusPopulation({
			troops: { ...(defenderNexus as unknown as Record<string, unknown>), ...defenderTroopUpdates },
			trainingQueue: defenderNexus.trainingQueue,
			populationMax: nextPopulationMax,
			...defenderAway
		});

		const defenderUpdate = prisma.nexus.update({
			where: { id: defenderNexus.id },
			data: {
				...defenderTroopUpdates,
				...defenderResourceUpdates,
				...buildingDamageUpdates,
				...(shouldRevokeDoubled ? { nexusTypeDoubled: false } : {}),
				populationCurrent: nextPopulationCurrent,
				controlLevel: conquered ? 0 : newControlLevel,
				// Restart the regen clock from this strike whenever control was
				// drained (incl. conquest), so the next tick measures elapsed time
				// from the attack, not a stale anchor that would grant instant regen.
				...(controlDrain > 0 ? { lastControlRecoverAt: new Date() } : {})
			}
		});
		if (cancelledListings > 0) {
			// Atomic: delete the escrowed listings together with the resource write
			// that already includes the refunded amounts (via the refund applied to
			// defenderNexus.biomass/alloy/ore above). Out-of-band failure here would
			// otherwise leave listings live with no resources to back them.
			await prisma.$transaction([
				prisma.marketListing.deleteMany({ where: { sellerNexusId: defenderNexus.id } }),
				defenderUpdate
			]);
			logInfo('combat_cancelled_listings_on_strike', {
				attackId: attack.id,
				defenderNexusId: defenderNexus.id,
				cancelledListings
			});
		} else {
			await defenderUpdate;
		}

		if (conquered && attack.attackerUserId) {
			const attackerNexusInfo = await prisma.nexus.findUnique({
				where: { id: attack.attackerNexusId! },
				select: { galaxyId: true, owner: { select: { username: true } } }
			});
			const attackerUsername = (attackerNexusInfo?.owner as { username?: string } | null)?.username;
			const nexusName = defenderNexus.name;
			if (attackerNexusInfo?.galaxyId && attackerUsername) {
				void logFactionEvent(
					attack.attackerUserId,
					attackerNexusInfo.galaxyId,
					'nexus_captured',
					attackerUsername,
					undefined,
					nexusName
				);
			}
			// Resolve any galaxy events tied to this nexus (derelict ship / rogue AI captured)
			void resolveEventForNexus(defenderNexus.id);
		}

		const survivingTroops: Partial<Record<TroopKey, number>> = {};
		for (const troopType of TROOP_KEYS) {
			const sent = attackTroops[troopType] || 0;
			const lost = attackerLosses[troopType] || 0;
			const survived = Math.max(0, sent - lost);
			if (survived > 0) survivingTroops[troopType] = survived;
		}

		const travelMs = attack.arrivesAt!.getTime() - attack.createdAt.getTime();
		const returnsAt = new Date(Date.now() + travelMs * RETURN_TRAVEL_MULTIPLIER);

		// Capture the defender's force composition at engagement time so replays are
		// reproducible. Without this, an observer only knows defender *losses*, not
		// who survived, which would make the replay underwhelming.
		//
		// These fields describe the DEFENDER'S OWN GARRISON only — allied support is
		// tracked separately in alliedContributions. Previously they used the merged
		// force, so a supported defender's troops were double-counted in the combat
		// log (once mixed into "Defender Forces", once again in "Allied Forces").
		// Keeping defender* garrison-scoped lets the UI render a clean 2 lists
		// (attacker + defender) + 1 per supporting ally.
		const defenderGarrison = defenderNexus as unknown as Record<TroopKey, number>;
		const defenderInitial: Record<string, number> = {};
		const defenderSurvivors: Record<string, number> = {};
		const defenderGarrisonLosses: Record<string, number> = {};
		for (const k of TROOP_KEYS) {
			const garrisonCount = defenderGarrison[k] || 0;
			if (garrisonCount > 0) defenderInitial[k] = garrisonCount;
			// Garrison-only loss = the share of total losses borne by the garrison
			// (losses are applied garrison-first, same rule used for population/troop updates).
			const garrisonLoss = Math.min(garrisonCount, defenderLosses[k] || 0);
			if (garrisonLoss > 0) defenderGarrisonLosses[k] = garrisonLoss;
			const survived = Math.max(0, garrisonCount - garrisonLoss);
			if (survived > 0) defenderSurvivors[k] = survived;
		}

		// Conquest attacks complete immediately. Surviving troops are handled via
		// a stationed TroopTransfer (created above) so the player can recall them.
		// If no troops survived a regular attack there is nothing to return home.
		const hasSurvivors = Object.keys(survivingTroops).length > 0;
		const resolvedStatus = conquered || !hasSurvivors ? 'completed' : 'returning';

		if (conquered && Object.keys(survivingTroops).length > 0) {
			await prisma.troopTransfer.create({
				data: {
					galaxyId: attack.galaxyId,
					ownerNexusId: attack.attackerNexusId!,
					hostNexusId: attack.defenderNexusId!,
					troops: survivingTroops,
					status: 'stationed',
					arrivesAt: null,
					returnsAt: null
				}
			});
		}

		await prisma.attack.update({
			where: { id: attack.id },
			data: {
				status: resolvedStatus,
				returnsAt: conquered || !hasSurvivors ? null : returnsAt,
				result: {
					attackerLosses,
					// defenderLosses / defenderInitial / defenderSurvivors are GARRISON-ONLY
					// (the defender player's own troops). Allied support is reported solely
					// via alliedContributions, so the UI renders exactly attacker + defender
					// + one block per supporting ally — no double-counting.
					defenderLosses: defenderGarrisonLosses,
					resourcesStolen,
					remainingResources,
					survivingTroops,
					defenderSurvivors,
					victory: attackerWins,
					conquered,
					remainingControl: newControlLevel,
					// Per-strike control delta so the report is self-explanatory
					// (before -> after, -drain) without diffing against other reports.
					previousControl: defenderNexus.controlLevel ?? 100,
					controlDrain,
					combatSeed: seed,
					attackerInitial: attackTroops,
					defenderInitial,
					// Merged figures (garrison + all support) retained for the battle
					// replay's power curve and for combat-stat aggregation that must count
					// allied casualties too.
					mergedDefenderInitial: (() => {
						const m: Record<string, number> = {};
						for (const k of TROOP_KEYS) {
							const n = mergedDefenderForce[k] || 0;
							if (n > 0) m[k] = n;
						}
						return m;
					})(),
					mergedDefenderLosses: (() => {
						const m: Record<string, number> = {};
						for (const k of TROOP_KEYS) {
							const l = defenderLosses[k] || 0;
							if (l > 0) m[k] = l;
						}
						return m;
					})(),
					attackerPower: Math.round(attackPower),
					defenderPower: Math.round(defensePower),
					buildingDamage: buildingDamageLog.length > 0 ? buildingDamageLog : undefined,
					alliedContributions:
						alliedContribMap.size > 0 ? [...alliedContribMap.values()] : undefined,
					alliedNexusIds: alliedContribMap.size > 0 ? [...alliedContribMap.keys()] : undefined
				}
			}
		});

		// Reconcile the attacker's housing now that losses are final. Recompute from
		// the nexus's own troops + queue + still-away pop rather than subtracting the
		// dead. Survivors of a 'returning' attack live on no counted row yet: the
		// attack row's `troops` column still holds the FULL dispatched force (it is
		// never reduced to survivors), so loadAwayPopulation deliberately skips
		// 'returning' attacks to avoid counting the dead. Pass the actual survivors
		// as extraTroops instead; processReturnedTroops recomputes again on landing.
		// For 'completed' (conquest / no survivors) survivors are either in a
		// stationed transfer (already counted) or gone, so no extra is owed.
		const attackerNexus = await prisma.nexus.findUnique({
			where: { id: attack.attackerNexusId! }
		});
		if (attackerNexus) {
			const attackerAway = await loadAwayPopulation(prisma, attack.attackerNexusId!);
			await prisma.nexus.update({
				where: { id: attack.attackerNexusId! },
				data: {
					populationCurrent: computeNexusPopulation({
						troops: attackerNexus as unknown as Record<string, unknown>,
						trainingQueue: attackerNexus.trainingQueue,
						populationMax: attackerNexus.populationMax,
						...attackerAway,
						extraTroops: resolvedStatus === 'returning' ? survivingTroops : undefined
					})
				}
			});
		}

		const [attackerNexusForNotif, defenderNexusForNotif] = await Promise.all([
			prisma.nexus.findUnique({ where: { id: attack.attackerNexusId! }, select: { name: true } }),
			prisma.nexus.findUnique({
				where: { id: attack.defenderNexusId! },
				select: { name: true, ownerId: true }
			})
		]);

		if (attack.attackerUserId) {
			void sendPushToUser(attack.attackerUserId, NOTIF.ATTACK_RESOLVED, {
				title: attackerWins
					? conquered
						? 'Nexus Conquered!'
						: 'Attack Victorious'
					: 'Attack Repelled',
				body: attackerWins
					? conquered
						? `Your forces conquered ${defenderNexusForNotif?.name || 'a nexus'}! combat log ready.`
						: `You won the battle at ${defenderNexusForNotif?.name || 'a nexus'}. Troops returning, combat log ready!`
					: `Your attack on ${defenderNexusForNotif?.name || 'a nexus'} was repelled. combat log ready.`,
				tag: `attack-resolved-${attack.id}`,
				data: { url: '/combat-logs' }
			});
		}

		if (attack.defenderUserId) {
			void sendPushToUser(attack.defenderUserId, NOTIF.ATTACK_INCOMING, {
				title: attackerWins
					? conquered
						? 'Nexus Lost!'
						: 'Your Nexus Was Attacked!'
					: 'Attack Repelled',
				body: attackerWins
					? conquered
						? `${attackerNexusForNotif?.name || 'An enemy'} conquered your nexus! combat log ready.`
						: `${attackerNexusForNotif?.name || 'An enemy'} raided your nexus and stole resources. combat log ready.`
					: `You successfully defended against an attack on ${defenderNexusForNotif?.name || 'your nexus'}. combat log ready.`,
				tag: `defended-${attack.id}`,
				data: { url: '/combat-logs' }
			});
		}

		// Socket push: tell both players to refresh their attack lists and reports.
		notifyAttackUpdate(attack.attackerUserId, attack.defenderUserId, attack.defenderNexusId!);
		if (attack.attackerUserId) notifyReportUpdate(attack.attackerUserId);
		if (attack.defenderUserId) notifyReportUpdate(attack.defenderUserId);
		// Notify each ally whose troops participated so their Reports page updates.
		for (const contrib of alliedContribMap.values()) {
			const ownerId = supportTransfers.find((t) => t.ownerNexusId === contrib.ownerNexusId)
				?.ownerNexus.ownerId;
			if (ownerId && ownerId !== attack.defenderUserId) notifyReportUpdate(ownerId);
		}

		if (conquered && attack.defenderUserId) {
			notifyNexusConquered(
				attack.defenderUserId,
				defenderNexusForNotif?.name || 'Unknown Nexus',
				attackerNexusForNotif?.name || 'Unknown'
			);
		}

		console.log(
			`Combat resolved: Attack ${attack.id} - ${attackerWins ? 'Attacker' : 'Defender'} wins${conquered ? ' - NEXUS CONQUERED!' : ''}`
		);
	} catch (err) {
		console.error('Error resolving combat:', err);
	}
}

async function processReturnedTroops(attack: Attack): Promise<void> {
	try {
		const result = attack.result as {
			survivingTroops?: Partial<Record<TroopKey, number>>;
			resourcesStolen?: { biomass: number; alloy: number; ore: number };
		} | null;
		const survivingTroops = result?.survivingTroops || {};
		const resourcesStolen = result?.resourcesStolen || { biomass: 0, alloy: 0, ore: 0 };

		const attackerNexus = await prisma.nexus.findUnique({ where: { id: attack.attackerNexusId! } });
		if (!attackerNexus) {
			await prisma.attack.update({ where: { id: attack.id }, data: { status: 'completed' } });
			return;
		}

		const returnData: Record<string, unknown> = {};
		// Resolved (numeric) post-landing troop counts, used only for the population
		// recompute below. The DB write uses atomic { increment } so two attacks
		// returning to the same nexus in one pass can't clobber each other's
		// survivors; the population calc needs plain numbers, not increment objects.
		const resolvedTroops: Record<string, number> = {
			...(attackerNexus as unknown as Record<string, number>)
		};
		for (const [troopType, count] of Object.entries(survivingTroops)) {
			if ((count ?? 0) > 0) {
				returnData[troopType] = { increment: count! };
				resolvedTroops[troopType] =
					((attackerNexus as unknown as Record<string, number>)[troopType] || 0) + count!;
			}
		}
		const attackerMaxStorage = getMaxStorage(attackerNexus as Parameters<typeof getMaxStorage>[0]);
		returnData['biomass'] = Math.min(
			attackerNexus.biomass + (resourcesStolen.biomass || 0),
			attackerMaxStorage
		);
		returnData['alloy'] = Math.min(
			attackerNexus.alloy + (resourcesStolen.alloy || 0),
			attackerMaxStorage
		);
		returnData['ore'] = Math.min(
			attackerNexus.ore + (resourcesStolen.ore || 0),
			attackerMaxStorage
		);

		// Survivors are now back on the troop columns and this attack row is about to
		// be 'completed' (no longer counted as away). Recompute housing from the
		// post-landing state so the brief 'returning' window - where survivors lived
		// on no counted row - is reconciled exactly once, with no drift.
		const returnAway = await loadAwayPopulation(prisma, attack.attackerNexusId!);
		returnData['populationCurrent'] = computeNexusPopulation({
			troops: resolvedTroops,
			trainingQueue: attackerNexus.trainingQueue,
			populationMax: attackerNexus.populationMax,
			...returnAway
		});

		await prisma.$transaction([
			prisma.nexus.update({ where: { id: attack.attackerNexusId! }, data: returnData }),
			prisma.attack.update({ where: { id: attack.id }, data: { status: 'completed' } })
		]);

		const totalReturned = Object.values(survivingTroops).reduce((a, b) => a + (b || 0), 0);
		const loot = resourcesStolen;
		const hasLoot = (loot.biomass || 0) + (loot.alloy || 0) + (loot.ore || 0) > 0;

		if (attack.attackerUserId) {
			void sendPushToUser(attack.attackerUserId, NOTIF.TROOPS_RETURNED, {
				title: 'Troops Returned',
				body:
					totalReturned > 0
						? `${totalReturned} troop${totalReturned !== 1 ? 's' : ''} returned${hasLoot ? ' with loot' : ''}.`
						: 'Your troops have returned (no survivors).',
				tag: `returned-${attack.id}`,
				data: { url: '/combat-logs' }
			});
		}

		// Socket push: attacker sees their outgoing attack disappear and nexus resources update.
		notifyAttackUpdate(attack.attackerUserId, null, attack.attackerNexusId!);
	} catch (err) {
		console.error(`Error processing returned troops for attack ${attack.id}:`, err);
	}
}

export async function processArrivedTransfers(): Promise<void> {
	const now = new Date();

	const arriving = await prisma.troopTransfer.findMany({
		where: { status: 'traveling', arrivesAt: { lte: now } },
		include: { hostNexus: true, ownerNexus: { include: { owner: true } } }
	});

	for (const transfer of arriving) {
		try {
			const troops = transfer.troops as Record<TroopKey, number>;
			const ownerId = transfer.ownerNexus.ownerId;
			if (!ownerId || transfer.hostNexus.ownerId !== ownerId) {
				await prisma.troopTransfer.delete({ where: { id: transfer.id } });
				await freePopulationForDestroyedTroops(transfer.ownerNexusId, troops, {
					reason: 'transfer_host_owner_changed',
					transferId: transfer.id,
					hostNexusId: transfer.hostNexusId
				});
				logWarn('transfer_destroyed_host_owner_changed', {
					transferId: transfer.id,
					hostNexusId: transfer.hostNexusId,
					ownerNexusId: transfer.ownerNexusId,
					expectedOwnerId: ownerId,
					currentHostOwnerId: transfer.hostNexus.ownerId,
					troopsDestroyed: countTroops(troops)
				});
				if (ownerId) {
					notifyTransferUpdate(ownerId, transfer.ownerNexusId);
					void sendPushToUser(ownerId, NOTIF.TROOP_TRANSFER, {
						title: 'Troops Lost',
						body: `Troops en route to ${transfer.hostNexus.name} were destroyed after the nexus changed hands.`,
						tag: `transfer-destroyed-${transfer.id}`,
						data: { url: '/' }
					});
				}
				continue;
			}

			// Stationed troops live on the transfer record only, not in host nexus columns.
			// Combat aggregates them from troopTransfer (status='stationed') alongside the host's garrison.
			// Writing to host columns here previously caused duplication (visible in train UI + double-counted in combat + cloned on recall).
			await prisma.troopTransfer.update({
				where: { id: transfer.id },
				data: { status: 'stationed', arrivesAt: null }
			});

			if (ownerId) {
				const total = TROOP_KEYS.reduce((s, f) => s + (troops[f] || 0), 0);
				void sendPushToUser(ownerId, NOTIF.TROOP_TRANSFER, {
					title: '🚀 Troops Arrived',
					body: `📦 ${total} troop${total !== 1 ? 's' : ''} arrived at ${transfer.hostNexus.name}.`,
					tag: `transfer-arrived-${transfer.id}`,
					data: { url: '/' }
				});
				notifyTransferUpdate(ownerId, transfer.ownerNexusId);
			}
		} catch (err) {
			console.error(`Error processing arriving transfer ${transfer.id}:`, err);
		}
	}

	const returning = await prisma.troopTransfer.findMany({
		where: { status: 'returning', returnsAt: { lte: now } },
		include: { ownerNexus: { include: { owner: true } } }
	});

	for (const transfer of returning) {
		try {
			const troops = transfer.troops as Record<TroopKey, number>;

			// Re-read the destination from the DB rather than trusting the row loaded
			// at query time. If the owner lost this nexus (conquered) or it no longer
			// exists, the old code's blind nexus.update threw every tick and the
			// transfer was stuck in 'returning' forever - troops silently lost. Now we
			// detect that, delete the transfer, and free the population the troops were
			// still holding (symmetric with the arriving-block owner-changed guard).
			const destNexus = await prisma.nexus.findUnique({ where: { id: transfer.ownerNexusId } });
			const ownerId = (transfer.ownerNexus as unknown as { owner?: { id: number } })?.owner?.id;

			if (!destNexus || (ownerId != null && destNexus.ownerId !== ownerId)) {
				await prisma.troopTransfer.delete({ where: { id: transfer.id } });
				await freePopulationForDestroyedTroops(transfer.ownerNexusId, troops, {
					reason: 'returning_transfer_home_nexus_lost',
					transferId: transfer.id,
					ownerNexusId: transfer.ownerNexusId
				});
				logWarn('returning_transfer_home_lost', {
					transferId: transfer.id,
					ownerNexusId: transfer.ownerNexusId,
					troopsLost: countTroops(troops)
				});
				if (ownerId) {
					void sendPushToUser(ownerId, NOTIF.TROOP_TRANSFER, {
						title: 'Troops Lost',
						body: `Returning troops were lost - their home nexus is no longer yours.`,
						tag: `transfer-return-lost-${transfer.id}`,
						data: { url: '/' }
					});
					notifyTransferUpdate(ownerId, transfer.ownerNexusId);
				}
				continue;
			}

			// Credit surviving troops back onto the home nexus row. `troops` already
			// reflects combat survivors (combat rewrites the transfer blob to the
			// survivors and only deletes it when none remain), so a partially-wiped
			// support force returns exactly its survivors.
			//
			// Use atomic { increment } rather than reading the current count and
			// writing an absolute sum. The old absolute approach read the home
			// nexus's troop counts from a snapshot taken at query time; when two
			// transfers returned to the SAME nexus in one tick, the second write was
			// computed from the stale pre-first-write snapshot and silently clobbered
			// the first transfer's troops for any shared type. Increments compose
			// correctly no matter how many transfers land together.
			const returnData: Record<string, { increment: number }> = {};
			for (const field of TROOP_KEYS) {
				if (troops[field] > 0) returnData[field] = { increment: troops[field] };
			}
			await prisma.$transaction([
				prisma.nexus.update({ where: { id: transfer.ownerNexusId }, data: returnData }),
				prisma.troopTransfer.delete({ where: { id: transfer.id } })
			]);
			// Recompute housing now that the troops live on the row again and no longer
			// count as 'away' population - keeps populationCurrent authoritative.
			const away = await loadAwayPopulation(prisma, transfer.ownerNexusId);
			const refreshed = await prisma.nexus.findUnique({ where: { id: transfer.ownerNexusId } });
			if (refreshed) {
				await prisma.nexus.update({
					where: { id: transfer.ownerNexusId },
					data: {
						populationCurrent: computeNexusPopulation({
							troops: refreshed as unknown as Record<string, unknown>,
							trainingQueue: refreshed.trainingQueue,
							populationMax: refreshed.populationMax,
							...away
						})
					}
				});
			}

			if (ownerId) {
				const total = TROOP_KEYS.reduce((s, f) => s + (troops[f] || 0), 0);
				void sendPushToUser(ownerId, NOTIF.TROOP_TRANSFER, {
					title: '🏠 Troops Returned Home',
					body: `🪖 ${total} troop${total !== 1 ? 's' : ''} returned to ${transfer.ownerNexus.name}.`,
					tag: `transfer-returned-${transfer.id}`,
					data: { url: '/' }
				});
				notifyTransferUpdate(ownerId, transfer.ownerNexusId);
			}
		} catch (err) {
			console.error(`Error processing returning transfer ${transfer.id}:`, err);
		}
	}
}
