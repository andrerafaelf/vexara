import type { Nexus } from '@prisma/client';
import prisma from '../lib/prisma.js';
import { type BuildingLevels, type ResourceAmounts, type TroopCounts, TROOP_KEYS } from '../types/index.js';
import { avatarUrl, avatarUrlSm } from '../lib/r2.js';
import { NEXUS_ACTIVE_WINDOW_MS } from './gameConstants.js';
// BuildingLevels and TroopCounts are extended via their interfaces to include targetingCore/voidStalker/plasmaTurret

interface PublicNexusData {
	_id: number;
	id: number;
	name: string;
	x: number;
	y: number;
	points: number;
	// Nexus specialisation type (e.g. 'citadel', 'forge'). Part of the public
	// identity visible to all players including allies without a scout report.
	nexusType: string | null;
	owner: {
		_id: number;
		id: number;
		username: string;
		isSupporter: boolean;
		supporterTier: string | null;
		avatarUrl: string | null;
		avatarUrlSm: string | null;
		points: number;
	} | null;
	intelLevel: string;
	// Presence signal: owner took a deliberate action within the active window.
	active: boolean;
}

export interface ScoutIntel {
	resources: ResourceAmounts;
	buildings: BuildingLevels;
	troops: TroopCounts;
	// Allied support currently stationed at this nexus (faction members / friends
	// reinforcing it). Lives on TroopTransfer rows, NOT the nexus troop columns, so
	// it must be aggregated separately - omitting it made scouts under-report the
	// real defensive force (e.g. "5 Breakers" while 1000 Bulwark sat in support).
	// Present and > 0 only when reinforcements exist.
	supportTroops?: Partial<TroopCounts>;
	population: { current: number; max: number };
	controlLevel: number;
	nexusName: string;
	nexusX: number;
	nexusY: number;
}

// Sum all troops stationed at `hostNexusId` via support missions (status
// 'stationed'). Returns the merged counts (only keys with > 0), or undefined if
// there's no support — so callers can spread it onto a ScoutIntel without adding
// an empty object. Mirrors the supportTransfers aggregation combat uses, so what
// a scout shows matches what the attacker will actually face.
export async function aggregateStationedSupport(
	hostNexusId: number
): Promise<Partial<TroopCounts> | undefined> {
	const transfers = await prisma.troopTransfer.findMany({
		where: { hostNexusId, status: 'stationed' },
		select: { troops: true }
	});
	if (transfers.length === 0) return undefined;
	const merged: Partial<Record<keyof TroopCounts, number>> = {};
	for (const t of transfers) {
		const troops = (t.troops ?? {}) as Record<string, number>;
		for (const key of TROOP_KEYS) {
			const n = Math.max(0, Math.floor(Number(troops[key]) || 0));
			if (n > 0) merged[key] = (merged[key] ?? 0) + n;
		}
	}
	return Object.keys(merged).length > 0 ? merged : undefined;
}

function buildPublicNexusData(
	nexus: Nexus & {
		owner?: {
			id: number;
			username: string;
			isSupporter: boolean;
			supporterTier: string | null;
			avatarKey?: string | null;
		} | null;
	},
	ownerPoints?: number | null
): PublicNexusData {
	return {
		_id: nexus.id,
		id: nexus.id,
		name: nexus.name,
		x: nexus.x,
		y: nexus.y,
		points: nexus.points,
		nexusType: nexus.nexusType ?? null,
		owner: nexus.owner
			? {
					_id: nexus.owner.id,
					id: nexus.owner.id,
					username: nexus.owner.username,
					isSupporter: nexus.owner.isSupporter,
					supporterTier: nexus.owner.supporterTier,
					avatarUrl: avatarUrl(nexus.owner.id, nexus.owner.avatarKey ?? null),
					avatarUrlSm: avatarUrlSm(nexus.owner.id, nexus.owner.avatarKey ?? null),
					points: ownerPoints ?? 0
				}
			: null,
		intelLevel: 'public',
		active:
			nexus.ownerId != null &&
			nexus.lastActivityAt != null &&
			nexus.lastActivityAt.getTime() >= Date.now() - NEXUS_ACTIVE_WINDOW_MS
	};
}

export function buildDetailedScoutIntel(nexus: Nexus): ScoutIntel {
	const n = nexus as unknown as Record<string, number>;
	return {
		resources: {
			biomass: Math.floor(nexus.biomass),
			alloy: Math.floor(nexus.alloy),
			ore: Math.floor(nexus.ore)
		},
		buildings: {
			commandCore: nexus.commandCore,
			hangarBay: n['hangarBay'] ?? 0,
			plasmaForge: n['plasmaForge'] ?? 0,
			armorFoundry: n['armorFoundry'] ?? 0,
			lifeSupport: nexus.lifeSupport,
			storageVault: nexus.storageVault,
			biomassFarm: nexus.biomassFarm,
			alloyForge: nexus.alloyForge,
			oreExtractor: nexus.oreExtractor,
			shieldGrid: nexus.shieldGrid,
			targetingCore: n['targetingCore'] ?? 0,
			stealthArray: n['stealthArray'] ?? 0
		},
		// Build from the canonical TROOP_KEYS so a new unit is reported
		// automatically. The cast is safe: TROOP_KEYS is exactly keyof TroopCounts.
		troops: TROOP_KEYS.reduce((acc, key) => {
			acc[key] = Math.max(0, Math.floor(Number(n[key]) || 0));
			return acc;
		}, {} as TroopCounts),
		population: {
			current: nexus.populationCurrent,
			max: nexus.populationMax
		},
		controlLevel: nexus.controlLevel,
		nexusName: nexus.name,
		nexusX: nexus.x,
		nexusY: nexus.y
	};
}

// Priority order: faction > friend > ally > null.
// 'ally' is returned only when the viewer's faction has an active nap, trade,
// or vassal treaty with the nexus owner's faction. A broken NAP does not grant
// ally vision (status='active' filter excludes 'broken'). Scoped by galaxyId.
export type FriendlyRelation = 'faction' | 'friend' | 'ally' | null;

async function getFriendlyRelation(
	userId: number,
	galaxyId: number,
	ownerUserId: number
): Promise<FriendlyRelation> {
	const [viewerMembership, ownerMembership, areFriends] = await Promise.all([
		prisma.factionMember.findFirst({
			where: { galaxyId, userId },
			select: { factionId: true }
		}),
		prisma.factionMember.findFirst({
			where: { galaxyId, userId: ownerUserId },
			select: { factionId: true }
		}),
		prisma.friendship
			.findFirst({
				where: {
					OR: [
						{ userAId: userId, userBId: ownerUserId },
						{ userAId: ownerUserId, userBId: userId }
					]
				}
			})
			.then(Boolean)
	]);

	// Faction takes priority over friend so the map can colour shared-faction
	// nexuses differently from individual allies.
	if (
		viewerMembership &&
		ownerMembership &&
		viewerMembership.factionId === ownerMembership.factionId
	) {
		return 'faction';
	}
	if (areFriends) return 'friend';

	// Ally: active nap, trade, or vassal treaty between the two factions.
	// Requires both players to be in factions; a broken NAP is excluded because
	// ally vision from a pact that is ending would let the breaker x-ray defenses
	// and then immediately alpha-strike (the exploit the design is closing).
	if (viewerMembership && ownerMembership) {
		const treaty = await prisma.factionTreaty.findFirst({
			where: {
				galaxyId,
				status: 'active',
				type: { in: ['nap', 'trade', 'vassal'] },
				OR: [
					{
						proposerFactionId: viewerMembership.factionId,
						targetFactionId: ownerMembership.factionId
					},
					{
						proposerFactionId: ownerMembership.factionId,
						targetFactionId: viewerMembership.factionId
					}
				]
			},
			select: { id: true }
		});
		if (treaty) return 'ally';
	}

	return null;
}

export async function getNexusIntelForUser(
	userId: number,
	nexusId: number,
	galaxyId: number | null
): Promise<
	| (PublicNexusData &
			Partial<ScoutIntel> & {
				intelLevel: string;
				scoutedAt?: unknown;
				isFriendly?: boolean;
				relation?: FriendlyRelation;
				newbieProtectionEndsAt?: string | null;
				isFactionTarget?: boolean;
				factionTargetMarkedBy?: string | null;
			})
	| null
> {
	const nexus = await prisma.nexus.findUnique({
		where: { id: nexusId },
		include: {
			owner: {
				select: {
					id: true,
					username: true,
					isSupporter: true,
					supporterTier: true,
					avatarKey: true
				}
			}
		}
	});

	if (!nexus) return null;
	if (galaxyId != null && nexus.galaxyId !== galaxyId) return null;

	const ownerPlayer = nexus.owner
		? await prisma.galaxyPlayer.findUnique({
				where: { userId_galaxyId: { userId: nexus.owner.id, galaxyId: nexus.galaxyId } },
				select: { points: true }
			})
		: null;

	const publicData = buildPublicNexusData(nexus, ownerPlayer?.points);
	const newbieProtectionEndsAt = nexus.newbieProtectionEndsAt
		? nexus.newbieProtectionEndsAt.toISOString()
		: null;

	if (nexus.ownerId === userId) {
		return {
			...publicData,
			...buildDetailedScoutIntel(nexus),
			supportTroops: await aggregateStationedSupport(nexus.id),
			intelLevel: 'owned',
			scoutedAt: new Date().toISOString(),
			newbieProtectionEndsAt
		};
	}

	const relation =
		nexus.ownerId && galaxyId != null
			? await getFriendlyRelation(userId, galaxyId, nexus.ownerId)
			: null;
	const friendly = relation !== null;

	// Faction target state for the viewer's faction. The inspect drawer needs both
	// the flag (so the Mark/Unmark button reflects reality) and who marked it (shown
	// as "Targeted by"). The map list already flags targets, but a fresh getNexusInfo
	// fetch on click would otherwise drop the flag, which is what broke unmark.
	const { isFactionTarget, factionTargetMarkedBy } = await resolveFactionTarget(
		userId,
		nexus.galaxyId,
		nexusId
	);

	const scoutReport = await prisma.attack.findFirst({
		where: { attackerUserId: userId, defenderNexusId: nexusId, type: 'scout', status: 'completed' },
		orderBy: { arrivesAt: 'desc' }
	});

	const intel = (scoutReport?.result as { intel?: ScoutIntel } | null)?.intel;
	if (!intel)
		return {
			...publicData,
			isFriendly: friendly,
			relation,
			newbieProtectionEndsAt,
			isFactionTarget,
			factionTargetMarkedBy
		};

	return {
		...publicData,
		...intel,
		intelLevel: 'scouted',
		scoutedAt: scoutReport!.arrivesAt,
		isFriendly: friendly,
		relation,
		newbieProtectionEndsAt,
		isFactionTarget,
		factionTargetMarkedBy
	};
}

// Look up whether `nexusId` is a faction target for the caller's faction, and if
// so who marked it. Returns false/null when the caller isn't in a faction or the
// nexus isn't targeted. FactionTarget has no User relation (markedById is a bare
// FK), so the marker's username is resolved in a second lookup.
async function resolveFactionTarget(
	userId: number,
	galaxyId: number,
	nexusId: number
): Promise<{ isFactionTarget: boolean; factionTargetMarkedBy: string | null }> {
	const membership = await prisma.factionMember.findUnique({
		where: { userId_galaxyId: { userId, galaxyId } },
		select: { factionId: true }
	});
	if (!membership) return { isFactionTarget: false, factionTargetMarkedBy: null };

	const target = await prisma.factionTarget.findUnique({
		where: { factionId_nexusId: { factionId: membership.factionId, nexusId } },
		select: { markedById: true }
	});
	if (!target) return { isFactionTarget: false, factionTargetMarkedBy: null };

	const marker = await prisma.user.findUnique({
		where: { id: target.markedById },
		select: { username: true }
	});
	return { isFactionTarget: true, factionTargetMarkedBy: marker?.username ?? null };
}
