import prisma from '../lib/prisma.js';
import { MAP_SIZE, MIN_NEXUS_SPACING } from '../utils/neutralNexuses.js';

// One-time newbie relocation. The player picks an existing nexus (any owner -
// NPC, another player, even a "big fish") as an ANCHOR; we never touch the
// anchor itself, we just drop the player's single nexus onto the nearest open,
// spacing-valid tile around it. The first-strike worry that "relocate next to a
// whale" might imply is already neutralised upstream: a still-protected attacker
// cannot attack or scout any owned nexus (see attackService), so proximity buys
// nothing until protection lapses - by which point the token is dead anyway.

export type RelocationError =
	| 'NO_NEXUS'
	| 'MULTIPLE_NEXUSES'
	| 'NO_TOKEN'
	| 'PROTECTION_EXPIRED'
	| 'IN_TRANSIT'
	| 'ANCHOR_NOT_FOUND'
	| 'ANCHOR_IS_SELF'
	| 'NO_OPEN_TILE';

export class RelocationFailure extends Error {
	constructor(
		public code: RelocationError,
		message: string
	) {
		super(message);
		this.name = 'RelocationFailure';
	}
}

// Spiral outward from (cx, cy) in growing Chebyshev rings, returning candidate
// cells nearest-first. Bounded by the map so it always terminates.
function* spiralFrom(cx: number, cy: number): Generator<{ x: number; y: number }> {
	yield { x: cx, y: cy };
	for (let r = 1; r < MAP_SIZE; r++) {
		for (let dx = -r; dx <= r; dx++) {
			for (let dy = -r; dy <= r; dy++) {
				// Only the ring at exactly Chebyshev distance r (the perimeter).
				if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
				yield { x: cx + dx, y: cy + dy };
			}
		}
	}
}

function inBounds(x: number, y: number): boolean {
	return x >= 0 && y >= 0 && x < MAP_SIZE && y < MAP_SIZE;
}

/**
 * Relocate the caller's single nexus to the nearest open tile around `anchorNexusId`.
 * Runs in a transaction with a re-check of tile occupancy at write time so two
 * concurrent relocations can't claim the same cell.
 */
export async function relocateNexus(userId: number, galaxyId: number, anchorNexusId: number) {
	return prisma.$transaction(async (tx) => {
		const owned = await tx.nexus.findMany({
			where: { ownerId: userId, galaxyId },
			select: {
				id: true,
				newbieProtectionEndsAt: true,
				relocationTokenAvailable: true,
				relocationTokenUsedAt: true
			}
		});

		if (owned.length === 0) {
			throw new RelocationFailure('NO_NEXUS', 'You have no nexus to relocate.');
		}
		// The token only exists during the single-nexus newbie window; relocating
		// is meaningless (and ambiguous) once you hold several.
		if (owned.length > 1) {
			throw new RelocationFailure(
				'MULTIPLE_NEXUSES',
				'Relocation is only available while you have a single nexus.'
			);
		}

		const nexus = owned[0];
		if (!nexus.relocationTokenAvailable || nexus.relocationTokenUsedAt) {
			throw new RelocationFailure('NO_TOKEN', 'You have no relocation token to use.');
		}
		if (!nexus.newbieProtectionEndsAt || new Date(nexus.newbieProtectionEndsAt) <= new Date()) {
			throw new RelocationFailure(
				'PROTECTION_EXPIRED',
				'Your relocation token expired when newbie protection ended.'
			);
		}

		if (anchorNexusId === nexus.id) {
			throw new RelocationFailure('ANCHOR_IS_SELF', 'Pick a different nexus to relocate near.');
		}

		// Block relocation while anything is in flight to/from this nexus - moving
		// the source mid-transit would corrupt the distance-based travel maths.
		const [activeAttacks, activeTransfers] = await Promise.all([
			tx.attack.count({
				where: {
					galaxyId,
					status: { in: ['traveling', 'returning'] },
					OR: [{ attackerNexusId: nexus.id }, { defenderNexusId: nexus.id }]
				}
			}),
			tx.troopTransfer.count({
				where: {
					galaxyId,
					status: { in: ['traveling', 'stationed', 'returning'] },
					OR: [{ ownerNexusId: nexus.id }, { hostNexusId: nexus.id }]
				}
			})
		]);
		if (activeAttacks > 0 || activeTransfers > 0) {
			throw new RelocationFailure(
				'IN_TRANSIT',
				'Cannot relocate while troops or attacks are in transit. Wait for them to resolve.'
			);
		}

		const anchor = await tx.nexus.findUnique({
			where: { id: anchorNexusId },
			select: { id: true, galaxyId: true, x: true, y: true }
		});
		if (!anchor || anchor.galaxyId !== galaxyId) {
			throw new RelocationFailure('ANCHOR_NOT_FOUND', 'That nexus could not be found.');
		}

		// All occupied/near tiles in the galaxy, used for the spacing check. We
		// exclude our own nexus (it's about to move) so it doesn't block its own
		// destination.
		const occupied = await tx.nexus.findMany({
			where: { galaxyId, id: { not: nexus.id } },
			select: { x: true, y: true }
		});
		const fits = (x: number, y: number) =>
			!occupied.some((n) => Math.max(Math.abs(n.x - x), Math.abs(n.y - y)) < MIN_NEXUS_SPACING);

		let dest: { x: number; y: number } | null = null;
		for (const cell of spiralFrom(anchor.x, anchor.y)) {
			if (!inBounds(cell.x, cell.y)) continue;
			if (fits(cell.x, cell.y)) {
				dest = cell;
				break;
			}
		}
		if (!dest) {
			throw new RelocationFailure(
				'NO_OPEN_TILE',
				'No open tile is available near that nexus. Try a different anchor.'
			);
		}

		// Re-assert the chosen cell is still exactly free at write time (another
		// relocation/spawn in a racing transaction could have taken it). If so,
		// fail closed rather than stacking two nexuses on one tile.
		const taken = await tx.nexus.findFirst({
			where: { galaxyId, x: dest.x, y: dest.y, id: { not: nexus.id } },
			select: { id: true }
		});
		if (taken) {
			throw new RelocationFailure(
				'NO_OPEN_TILE',
				'That spot was just claimed. Try relocating again.'
			);
		}

		return tx.nexus.update({
			where: { id: nexus.id },
			data: {
				x: dest.x,
				y: dest.y,
				relocationTokenAvailable: false,
				relocationTokenUsedAt: new Date()
			}
		});
	});
}
