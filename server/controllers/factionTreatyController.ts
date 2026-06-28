import type { Response } from 'express';
import prisma from '../lib/prisma.js';
import type { AuthRequest } from '../types/index.js';
import { logError } from '../utils/logger.js';
import { NOTIF, sendPushToUser } from '../utils/push.js';
import { notifyBadgeUpdate } from '../services/warRoomSocket.js';
import { grantPassXp } from '../utils/battlePass.js';
import { NAP_BREAK_NOTICE_MS, NAP_RESIGN_COOLDOWN_MS } from '../utils/gameConstants.js';

const TREATY_LABELS: Record<string, string> = {
	nap: 'Non-Aggression Pact',
	trade: 'Trade Agreement',
	vassal: 'Vassalage'
};

async function notifyDiplomacyLeaders(
	factionId: number,
	galaxyId: number,
	title: string,
	body: string,
	tag: string
) {
	const leaders = await prisma.factionMember.findMany({
		where: { factionId, galaxyId, role: { in: ['leader', 'officer'] } },
		select: { userId: true }
	});
	for (const l of leaders) {
		void sendPushToUser(l.userId, NOTIF.FACTION_DIPLOMACY, {
			title,
			body,
			tag,
			data: { url: '/factions' }
		});
		notifyBadgeUpdate(l.userId);
	}
}

const VALID_TREATY_TYPES = ['nap', 'trade', 'vassal'] as const;
type TreatyType = (typeof VALID_TREATY_TYPES)[number];

const MAX_DURATION_DAYS = 90;
const MIN_DURATION_DAYS = 1;

async function getUserFaction(userId: number, galaxyId: number) {
	const member = await prisma.factionMember.findFirst({
		where: { userId, galaxyId },
		include: { faction: true }
	});
	return member;
}

// ---- proposeTreaty ----
export async function proposeTreaty(req: AuthRequest, res: Response): Promise<void> {
	try {
		const factionId = parseInt(req.params.factionId);
		const { targetFactionId, type, durationDays } = req.body as {
			targetFactionId?: unknown;
			type?: string;
			durationDays?: unknown;
		};

		if (!targetFactionId || isNaN(Number(targetFactionId))) {
			res.status(400).json({ error: 'Invalid targetFactionId' });
			return;
		}
		if (!type || !(VALID_TREATY_TYPES as readonly string[]).includes(type)) {
			res.status(400).json({ error: `type must be one of: ${VALID_TREATY_TYPES.join(', ')}` });
			return;
		}

		const parsedTarget = Number(targetFactionId);
		if (parsedTarget === factionId) {
			res.status(400).json({ error: 'Cannot propose a treaty with yourself' });
			return;
		}

		const member = await getUserFaction(req.userId, req.galaxyId);
		if (!member || member.factionId !== factionId) {
			res.status(403).json({ error: 'You are not a member of this faction' });
			return;
		}
		if (member.role !== 'leader' && member.role !== 'officer') {
			res.status(403).json({ error: 'Only faction leaders and officers can propose treaties' });
			return;
		}

		const targetFaction = await prisma.faction.findFirst({
			where: { id: parsedTarget, galaxyId: req.galaxyId }
		});
		if (!targetFaction) {
			res.status(404).json({ error: 'Target faction not found' });
			return;
		}

		const existingActive = await prisma.factionTreaty.findFirst({
			where: {
				galaxyId: req.galaxyId,
				type: type as TreatyType,
				status: { in: ['pending', 'active'] },
				OR: [
					{ proposerFactionId: factionId, targetFactionId: parsedTarget },
					{ proposerFactionId: parsedTarget, targetFactionId: factionId }
				]
			}
		});
		if (existingActive) {
			res
				.status(409)
				.json({
					error: 'A treaty of this type is already pending or active between these factions'
				});
			return;
		}

		// NAP re-sign cooldown. A broken NAP is no longer pending/active, so it
		// would slip through the existingActive check above. Block the pair from
		// signing a new NAP for NAP_RESIGN_COOLDOWN_MS after a break.
		if (type === 'nap') {
			const galaxy = await prisma.galaxy.findUnique({
				where: { id: req.galaxyId },
				select: { speedMultiplier: true }
			});
			const speedMultiplier = galaxy?.speedMultiplier ?? 1.0;
			const cooldownMs = NAP_RESIGN_COOLDOWN_MS / speedMultiplier;
			const cooldownCutoff = new Date(Date.now() - cooldownMs);

			const recentBreak = await prisma.factionTreaty.findFirst({
				where: {
					galaxyId: req.galaxyId,
					type: 'nap',
					status: 'broken',
					brokenAt: { gt: cooldownCutoff },
					OR: [
						{ proposerFactionId: factionId, targetFactionId: parsedTarget },
						{ proposerFactionId: parsedTarget, targetFactionId: factionId }
					]
				},
				select: { brokenAt: true }
			});
			if (recentBreak && recentBreak.brokenAt) {
				const canResignAt = new Date(recentBreak.brokenAt.getTime() + cooldownMs);
				res.status(409).json({
					error: `This NAP was recently broken. These factions cannot sign a new NAP until ${canResignAt.toISOString()}.`,
					canResignAt: canResignAt.toISOString()
				});
				return;
			}
		}

		let durDays: number | null = null;
		if (durationDays != null) {
			durDays = Math.floor(Number(durationDays));
			if (isNaN(durDays) || durDays < MIN_DURATION_DAYS || durDays > MAX_DURATION_DAYS) {
				res
					.status(400)
					.json({
						error: `durationDays must be between ${MIN_DURATION_DAYS} and ${MAX_DURATION_DAYS}`
					});
				return;
			}
		}

		const treaty = await prisma.factionTreaty.create({
			data: {
				galaxyId: req.galaxyId,
				type: type as TreatyType,
				status: 'pending',
				proposerFactionId: factionId,
				targetFactionId: parsedTarget,
				proposedByUserId: req.userId,
				durationDays: durDays
			}
		});

		void notifyDiplomacyLeaders(
			parsedTarget,
			req.galaxyId,
			'Treaty proposed',
			`[${member.faction.tag}] ${member.faction.name} proposed a ${TREATY_LABELS[type] ?? type}. Awaiting your response.`,
			`treaty-proposed-${treaty.id}`
		);

		res.json(treaty);
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'factionTreatyController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

// ---- acceptTreaty ----
export async function acceptTreaty(req: AuthRequest, res: Response): Promise<void> {
	try {
		const treatyId = parseInt(req.params.treatyId);

		const treaty = await prisma.factionTreaty.findFirst({
			where: { id: treatyId, galaxyId: req.galaxyId }
		});
		if (!treaty) {
			res.status(404).json({ error: 'Treaty not found' });
			return;
		}
		if (treaty.status !== 'pending') {
			res.status(400).json({ error: 'Treaty is not pending' });
			return;
		}

		const member = await getUserFaction(req.userId, req.galaxyId);
		if (!member || member.factionId !== treaty.targetFactionId) {
			res.status(403).json({ error: 'Only the target faction can accept this treaty' });
			return;
		}
		if (member.role !== 'leader' && member.role !== 'officer') {
			res.status(403).json({ error: 'Only faction leaders and officers can accept treaties' });
			return;
		}

		const now = new Date();
		const expiresAt = treaty.durationDays
			? new Date(now.getTime() + treaty.durationDays * 86400000)
			: null;

		const updated = await prisma.factionTreaty.update({
			where: { id: treatyId },
			data: {
				status: 'active',
				acceptedByUserId: req.userId,
				startsAt: now,
				expiresAt,
				updatedAt: now
			}
		});

		void notifyDiplomacyLeaders(
			treaty.proposerFactionId,
			req.galaxyId,
			'Treaty accepted',
			`[${member.faction.tag}] ${member.faction.name} accepted your ${TREATY_LABELS[treaty.type] ?? treaty.type}.`,
			`treaty-accepted-${treaty.id}`
		);

		// Battle pass XP for both sides when a treaty is signed
		void grantPassXp(req.userId, req.galaxyId, 'DIPLOMATIC_TREATY');
		const proposerLeader = await prisma.factionMember.findFirst({
			where: { factionId: treaty.proposerFactionId, galaxyId: req.galaxyId, role: 'leader' },
			select: { userId: true }
		});
		if (proposerLeader) void grantPassXp(proposerLeader.userId, req.galaxyId, 'DIPLOMATIC_TREATY');

		res.json(updated);
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'factionTreatyController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

// ---- cancelTreaty ----
export async function cancelTreaty(req: AuthRequest, res: Response): Promise<void> {
	try {
		const treatyId = parseInt(req.params.treatyId);

		const treaty = await prisma.factionTreaty.findFirst({
			where: { id: treatyId, galaxyId: req.galaxyId }
		});
		if (!treaty) {
			res.status(404).json({ error: 'Treaty not found' });
			return;
		}
		if (treaty.status !== 'pending' && treaty.status !== 'active') {
			res.status(400).json({ error: 'Treaty cannot be cancelled' });
			return;
		}
		// An active NAP must be formally BROKEN (opens the betrayal window, the
		// public nap_broken event, the victim notification, and the 24h re-sign
		// cooldown), never silently cancelled. Without this guard cancelTreaty is an
		// instant, warning-free NAP-gate bypass. Cancelling a PENDING nap (i.e.
		// withdrawing an un-accepted proposal) stays allowed: it blocks no attacks.
		if (treaty.type === 'nap' && treaty.status === 'active') {
			res.status(400).json({
				error:
					'An active Non-Aggression Pact must be formally broken, not cancelled. Use Break Pact.'
			});
			return;
		}

		const member = await getUserFaction(req.userId, req.galaxyId);
		if (
			!member ||
			(member.factionId !== treaty.proposerFactionId && member.factionId !== treaty.targetFactionId)
		) {
			res.status(403).json({ error: 'Not authorized' });
			return;
		}
		if (member.role !== 'leader' && member.role !== 'officer') {
			res.status(403).json({ error: 'Only leaders and officers can cancel treaties' });
			return;
		}

		const updated = await prisma.factionTreaty.update({
			where: { id: treatyId },
			data: { status: 'cancelled', updatedAt: new Date() }
		});

		res.json(updated);
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'factionTreatyController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

// ---- getActiveTreaties ----
export async function getActiveTreaties(req: AuthRequest, res: Response): Promise<void> {
	try {
		const factionId = parseInt(req.params.factionId);

		const faction = await prisma.faction.findFirst({
			where: { id: factionId, galaxyId: req.galaxyId }
		});
		if (!faction) {
			res.status(404).json({ error: 'Faction not found' });
			return;
		}

		// Auto-expire overdue treaties
		await prisma.factionTreaty.updateMany({
			where: {
				galaxyId: req.galaxyId,
				status: 'active',
				expiresAt: { not: null, lte: new Date() }
			},
			data: { status: 'expired', updatedAt: new Date() }
		});

		// Include broken NAPs that are still inside their betrayal window so the
		// diplomacy board can show both factions the live betrayal countdown.
		const now = new Date();
		const treaties = await prisma.factionTreaty.findMany({
			where: {
				galaxyId: req.galaxyId,
				AND: [
					{
						OR: [
							{ status: { in: ['pending', 'active'] } },
							{ status: 'broken', betrayalEndsAt: { gt: now } }
						]
					},
					{ OR: [{ proposerFactionId: factionId }, { targetFactionId: factionId }] }
				]
			},
			orderBy: { createdAt: 'desc' },
			take: 100
		});

		// Enrich with faction names
		const factionIds = new Set<number>();
		treaties.forEach((t) => {
			factionIds.add(t.proposerFactionId);
			factionIds.add(t.targetFactionId);
		});
		const factions = await prisma.faction.findMany({
			where: { id: { in: Array.from(factionIds) } },
			select: { id: true, name: true, tag: true }
		});
		const factionMap = new Map(factions.map((f) => [f.id, f]));

		const enriched = treaties.map((t) => ({
			...t,
			proposerFaction: factionMap.get(t.proposerFactionId),
			targetFaction: factionMap.get(t.targetFactionId)
		}));

		res.json(enriched);
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'factionTreatyController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

// ---- breakNap ----
// Formally break an active NAP. A leader or officer of EITHER signatory faction
// may call this. Sets the treaty to `broken`, records timestamps, opens the
// betrayal notice window (betrayalEndsAt), notifies the victim faction's
// leaders/officers, and logs faction events on both sides.
export async function breakNap(req: AuthRequest, res: Response): Promise<void> {
	try {
		const treatyId = parseInt(req.params.treatyId);
		if (!treatyId || isNaN(treatyId)) {
			res.status(400).json({ error: 'Invalid treatyId' });
			return;
		}

		const treaty = await prisma.factionTreaty.findFirst({
			where: { id: treatyId, galaxyId: req.galaxyId }
		});
		if (!treaty) {
			res.status(404).json({ error: 'Treaty not found' });
			return;
		}
		if (treaty.type !== 'nap') {
			res.status(400).json({ error: 'Only Non-Aggression Pacts can be broken with this endpoint' });
			return;
		}
		if (treaty.status !== 'active') {
			res.status(400).json({ error: 'Only an active NAP can be broken' });
			return;
		}

		const member = await getUserFaction(req.userId, req.galaxyId);
		if (
			!member ||
			(member.factionId !== treaty.proposerFactionId &&
				member.factionId !== treaty.targetFactionId)
		) {
			res.status(403).json({ error: 'Not authorized' });
			return;
		}
		if (member.role !== 'leader' && member.role !== 'officer') {
			res.status(403).json({ error: 'Only faction leaders and officers can break a NAP' });
			return;
		}

		const galaxy = await prisma.galaxy.findUnique({
			where: { id: req.galaxyId },
			select: { speedMultiplier: true }
		});
		const speedMultiplier = galaxy?.speedMultiplier ?? 1.0;

		const now = new Date();
		const betrayalEndsAt = new Date(now.getTime() + NAP_BREAK_NOTICE_MS / speedMultiplier);

		// Guarded transition: atomically claim active -> broken so concurrent break
		// calls (officer + leader double-fire, or a scripted double-fire) cannot both
		// pass a stale status read and double-log events / double-notify the victim.
		// Only the writer that flips the row proceeds to the side effects below.
		const claimed = await prisma.factionTreaty.updateMany({
			where: { id: treatyId, galaxyId: req.galaxyId, type: 'nap', status: 'active' },
			data: {
				status: 'broken',
				brokenAt: now,
				brokenByUserId: req.userId,
				betrayalEndsAt,
				updatedAt: now
			}
		});
		if (claimed.count !== 1) {
			res.status(409).json({ error: 'This NAP was already broken' });
			return;
		}
		const updated = await prisma.factionTreaty.findUnique({ where: { id: treatyId } });

		// Determine the breaker's faction and the victim's faction.
		const breakerFactionId = member.factionId;
		const victimFactionId =
			treaty.proposerFactionId === breakerFactionId
				? treaty.targetFactionId
				: treaty.proposerFactionId;

		// Log faction events on both sides (mirrors the war_declared/received pattern).
		await prisma.factionEvent.createMany({
			data: [
				{
					factionId: breakerFactionId,
					type: 'nap_broken',
					targetName: null,
					actorName: member.faction.name,
					meta: String(treatyId)
				},
				{
					factionId: victimFactionId,
					type: 'nap_broken_received',
					actorName: member.faction.name,
					meta: String(treatyId)
				}
			]
		});

		// Notify the victim's leaders/officers immediately.
		const etaStr = `${Math.round(NAP_BREAK_NOTICE_MS / speedMultiplier / 60000)} minutes`;
		void notifyDiplomacyLeaders(
			victimFactionId,
			req.galaxyId,
			'NAP broken',
			`[${member.faction.tag}] ${member.faction.name} has broken its Non-Aggression Pact with your faction. Attacks open in ${etaStr}.`,
			`nap-broken-${treatyId}`
		);

		res.json(updated);
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'factionTreatyController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

// ---- getGalaxyDiplomacy ----
// Public board: all active treaties in the galaxy
export async function getGalaxyDiplomacy(req: AuthRequest, res: Response): Promise<void> {
	try {
		await prisma.factionTreaty.updateMany({
			where: {
				galaxyId: req.galaxyId,
				status: 'active',
				expiresAt: { not: null, lte: new Date() }
			},
			data: { status: 'expired', updatedAt: new Date() }
		});

		// Broken NAPs still inside their betrayal window stay on the public board
		// (the galaxy can see a pact was broken and war is imminent).
		const now = new Date();
		const treaties = await prisma.factionTreaty.findMany({
			where: {
				galaxyId: req.galaxyId,
				OR: [
					{ status: { in: ['pending', 'active'] } },
					{ status: 'broken', betrayalEndsAt: { gt: now } }
				]
			},
			orderBy: { createdAt: 'desc' },
			take: 50
		});

		const factionIds = new Set<number>();
		treaties.forEach((t) => {
			factionIds.add(t.proposerFactionId);
			factionIds.add(t.targetFactionId);
		});
		const factions = await prisma.faction.findMany({
			where: { id: { in: Array.from(factionIds) } },
			select: { id: true, name: true, tag: true }
		});
		const factionMap = new Map(factions.map((f) => [f.id, f]));

		const enriched = treaties.map((t) => ({
			...t,
			proposerFaction: factionMap.get(t.proposerFactionId),
			targetFaction: factionMap.get(t.targetFactionId)
		}));

		res.json(enriched);
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'factionTreatyController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}
