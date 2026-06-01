import type { Response } from 'express';
import prisma from '../lib/prisma.js';
import {
	notifyBadgeUpdate,
	notifyFactionChat,
	notifyFactionInviteUpdate,
	notifyFactionUpdated
} from '../services/warRoomSocket.js';
import type { AuthRequest } from '../types/index.js';
import { logError, logGameEvent } from '../utils/logger.js';
import { containsBlockedChatWord } from '../utils/profanity.js';
import { NOTIF, sendPushToUser } from '../utils/push.js';
import { avatarUrl, avatarUrlSm } from '../lib/r2.js';

const FACTION_NAME_MIN = 3;
const FACTION_NAME_MAX = 32;
const FACTION_TAG_MIN = 2;
const FACTION_TAG_MAX = 6;
const FACTION_DESC_MAX = 256;
const FACTION_MOTD_MAX = 512;
const FACTION_MSG_MAX = 4000;
const CHAT_PAGE_SIZE = 50;
const EVENTS_PAGE_SIZE = 50;
const INVITE_EXPIRY_HOURS = 48;
const FACTION_MAX_MEMBERS = 10;

async function logEvent(
	factionId: number,
	type: string,
	actorName?: string,
	targetName?: string,
	meta?: string
) {
	await prisma.factionEvent.create({ data: { factionId, type, actorName, targetName, meta } });
}

function validateFactionName(name?: string): boolean {
	if (!name || typeof name !== 'string') return false;
	const trimmed = name.trim();
	return (
		trimmed.length >= FACTION_NAME_MIN &&
		trimmed.length <= FACTION_NAME_MAX &&
		/^[a-zA-Z0-9\s]+$/.test(trimmed)
	);
}

function validateFactionTag(tag?: string): boolean {
	if (!tag || typeof tag !== 'string') return false;
	const trimmed = tag.trim();
	return (
		trimmed.length >= FACTION_TAG_MIN &&
		trimmed.length <= FACTION_TAG_MAX &&
		/^[a-zA-Z0-9]+$/.test(trimmed)
	);
}

export async function getMyFaction(req: AuthRequest, res: Response): Promise<void> {
	try {
		const user = await prisma.user.findUnique({
			where: { id: req.userId },
			select: { activeGalaxyId: true }
		});
		if (!user?.activeGalaxyId) {
			res.json({ faction: null });
			return;
		}

		const member = await prisma.factionMember.findUnique({
			where: { userId_galaxyId: { userId: req.userId, galaxyId: user.activeGalaxyId } },
			select: {
				factionId: true,
				role: true,
				faction: {
					select: {
						id: true,
						name: true,
						tag: true,
						description: true,
						motd: true,
						createdAt: true,
						members: {
							select: {
								id: true,
								userId: true,
								role: true,
								user: {
									select: {
										id: true,
										username: true,
										isSupporter: true,
										supporterTier: true,
										avatarKey: true,
										lastPlayedAt: true
									}
								}
							}
						}
					}
				}
			}
		});

		if (!member) {
			res.json({ faction: null });
			return;
		}

		const showLastPlayed = member.role === 'leader' || member.role === 'officer';
		res.json({
			faction: {
				...member.faction,
				myRole: member.role,
				members: member.faction.members.map((m: any) => ({
					id: m.id,
					userId: m.userId,
					username: m.user.username,
					isSupporter: m.user.isSupporter,
					supporterTier: m.user.supporterTier,
					avatarUrl: avatarUrl(m.user.id, m.user.avatarKey),
					avatarUrlSm: avatarUrlSm(m.user.id, m.user.avatarKey),
					role: m.role,
					...(showLastPlayed ? { lastPlayedAt: m.user.lastPlayedAt } : {})
				}))
			}
		});
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'factionController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function getFaction(req: AuthRequest, res: Response): Promise<void> {
	try {
		const factionId = parseInt(req.params.id, 10);
		if (!Number.isFinite(factionId)) {
			res.status(400).json({ error: 'Invalid faction id' });
			return;
		}

		const faction = await prisma.faction.findUnique({
			where: { id: factionId },
			select: {
				id: true,
				name: true,
				tag: true,
				description: true,
				createdAt: true,
				galaxyId: true,
				members: {
					select: {
						id: true,
						userId: true,
						role: true,
						user: {
							select: {
								id: true,
								username: true,
								isSupporter: true,
								supporterTier: true,
								avatarKey: true
							}
						}
					}
				}
			}
		});

		if (!faction) {
			res.status(404).json({ error: 'Faction not found' });
			return;
		}

		const userIds = faction.members.map((m: any) => m.userId);
		const [players, nexusCounts] = await Promise.all([
			prisma.galaxyPlayer.findMany({
				where: { galaxyId: faction.galaxyId, userId: { in: userIds } },
				select: { userId: true, points: true, joinedAt: true }
			}),
			prisma.nexus.groupBy({
				by: ['ownerId'],
				where: { galaxyId: faction.galaxyId, ownerId: { in: userIds } },
				_count: { id: true }
			})
		]);
		const playerByUserId = new Map(players.map((p: any) => [p.userId, p]));
		const nexusCountByUserId = new Map(nexusCounts.map((n: any) => [n.ownerId, n._count.id]));

		res.json({
			...faction,
			members: faction.members.map((m: any) => {
				const player = playerByUserId.get(m.userId);
				return {
					id: m.id,
					userId: m.userId,
					username: m.user.username,
					isSupporter: m.user.isSupporter,
					supporterTier: m.user.supporterTier,
					avatarUrl: avatarUrl(m.user.id, m.user.avatarKey),
					avatarUrlSm: avatarUrlSm(m.user.id, m.user.avatarKey),
					role: m.role,
					points: player?.points ?? 0,
					nexusCount: nexusCountByUserId.get(m.userId) ?? 0,
					joinedAt: player?.joinedAt ?? null
				};
			})
		});
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'factionController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function listFactionsInGalaxy(req: AuthRequest, res: Response): Promise<void> {
	try {
		const user = await prisma.user.findUnique({
			where: { id: req.userId },
			select: { activeGalaxyId: true }
		});
		if (!user?.activeGalaxyId) {
			res.status(409).json({ error: 'No active galaxy' });
			return;
		}

		const factions = await prisma.faction.findMany({
			where: { galaxyId: user.activeGalaxyId },
			select: {
				id: true,
				name: true,
				tag: true,
				description: true,
				createdAt: true,
				_count: { select: { members: true } }
			},
			orderBy: { createdAt: 'asc' }
		});

		res.json(factions.map((f: any) => ({ ...f, memberCount: f._count.members })));
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'factionController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function createFaction(req: AuthRequest, res: Response): Promise<void> {
	try {
		const { name, tag, description } = req.body as {
			name?: string;
			tag?: string;
			description?: string;
		};

		if (!validateFactionName(name)) {
			res
				.status(400)
				.json({
					error: `Faction name must be ${FACTION_NAME_MIN}-${FACTION_NAME_MAX} characters, alphanumeric + spaces only`
				});
			return;
		}
		if (!validateFactionTag(tag)) {
			res
				.status(400)
				.json({
					error: `Faction tag must be ${FACTION_TAG_MIN}-${FACTION_TAG_MAX} characters, alphanumeric only`
				});
			return;
		}
		if (description && typeof description === 'string' && description.length > FACTION_DESC_MAX) {
			res
				.status(400)
				.json({ error: `Faction description must be ${FACTION_DESC_MAX} characters or less` });
			return;
		}

		const user = await prisma.user.findUnique({
			where: { id: req.userId },
			select: { activeGalaxyId: true }
		});
		if (!user?.activeGalaxyId) {
			res.status(409).json({ error: 'No active galaxy' });
			return;
		}

		const existing = await prisma.factionMember.findUnique({
			where: { userId_galaxyId: { userId: req.userId, galaxyId: user.activeGalaxyId } }
		});
		if (existing) {
			res.status(400).json({ error: 'You are already in a faction' });
			return;
		}

		const normalizedName = name!.trim();
		const normalizedTag = tag!.trim().toUpperCase();

		const nameConflict = await prisma.faction.findFirst({
			where: {
				galaxyId: user.activeGalaxyId,
				name: { equals: normalizedName, mode: 'insensitive' }
			},
			select: { id: true }
		});
		if (nameConflict) {
			res.status(400).json({ error: 'A faction with that name already exists in this galaxy' });
			return;
		}

		const tagConflict = await prisma.faction.findFirst({
			where: { galaxyId: user.activeGalaxyId, tag: { equals: normalizedTag, mode: 'insensitive' } },
			select: { id: true }
		});
		if (tagConflict) {
			res.status(400).json({ error: 'A faction with that tag already exists in this galaxy' });
			return;
		}

		const callerUser = await prisma.user.findUnique({
			where: { id: req.userId },
			select: { username: true }
		});

		const [faction] = await prisma.$transaction([
			prisma.faction.create({
				data: {
					galaxyId: user.activeGalaxyId,
					name: normalizedName,
					tag: normalizedTag,
					description: description?.trim() || null,
					members: {
						create: {
							userId: req.userId,
							galaxyId: user.activeGalaxyId,
							role: 'leader'
						}
					}
				},
				select: { id: true, name: true, tag: true, description: true, createdAt: true }
			}),
			prisma.factionJoinRequest.deleteMany({
				where: { userId: req.userId, galaxyId: user.activeGalaxyId }
			}),
			prisma.factionInvite.deleteMany({
				where: { invitedUserId: req.userId, galaxyId: user.activeGalaxyId }
			})
		]);

		await logEvent(faction.id, 'faction_created', callerUser?.username);
		logGameEvent('created_faction', req.userId, req.galaxyId, { factionId: faction.id });

		res.status(201).json(faction);
	} catch (error) {
		const err = error as any;
		if (err?.code === 'P2002') {
			const field = err.meta?.target?.[2] === 'tag' ? 'tag' : 'name';
			res.status(400).json({ error: `A faction with that ${field} already exists in this galaxy` });
			return;
		}
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function inviteToFaction(req: AuthRequest, res: Response): Promise<void> {
	try {
		const factionId = parseInt(req.params.id, 10);
		const { username } = req.body as { username?: string };

		if (!Number.isFinite(factionId)) {
			res.status(400).json({ error: 'Invalid faction id' });
			return;
		}
		if (!username || typeof username !== 'string') {
			res.status(400).json({ error: 'Username required' });
			return;
		}

		const faction = await prisma.faction.findUnique({
			where: { id: factionId },
			select: { galaxyId: true, members: { select: { userId: true, role: true } } }
		});
		if (!faction) {
			res.status(404).json({ error: 'Faction not found' });
			return;
		}

		const member = faction.members.find((m: any) => m.userId === req.userId);
		if (!member || (member.role !== 'leader' && member.role !== 'officer')) {
			res.status(403).json({ error: 'Only leader and officers can invite' });
			return;
		}

		if (faction.members.length >= FACTION_MAX_MEMBERS) {
			res
				.status(400)
				.json({ error: `Faction is at the maximum of ${FACTION_MAX_MEMBERS} members` });
			return;
		}

		const invitedUser = await prisma.user.findFirst({
			where: { username: { equals: username.trim(), mode: 'insensitive' } },
			select: { id: true }
		});
		if (!invitedUser) {
			res.status(404).json({ error: 'User not found' });
			return;
		}

		const existing = await prisma.factionMember.findUnique({
			where: { userId_galaxyId: { userId: invitedUser.id, galaxyId: faction.galaxyId } }
		});
		if (existing) {
			res.status(400).json({ error: 'User is already in a faction in this galaxy' });
			return;
		}

		const expiresAt = new Date();
		expiresAt.setHours(expiresAt.getHours() + INVITE_EXPIRY_HOURS);

		const invite = await prisma.factionInvite.create({
			data: {
				factionId,
				invitedUserId: invitedUser.id,
				invitedByUserId: req.userId,
				galaxyId: faction.galaxyId,
				expiresAt
			}
		});

		const [factionRow, inviter] = await Promise.all([
			prisma.faction.findUnique({ where: { id: factionId }, select: { name: true, tag: true } }),
			prisma.user.findUnique({ where: { id: req.userId }, select: { username: true } })
		]);
		void sendPushToUser(invitedUser.id, NOTIF.FACTION_INVITE, {
			title: 'Faction invite',
			body: `${inviter?.username ?? 'A leader'} invited you to ${factionRow?.name ? `[${factionRow.tag}] ${factionRow.name}` : 'a faction'}.`,
			tag: `faction-invite-${invite.id}`,
			data: { url: '/factions' }
		});
		notifyBadgeUpdate(invitedUser.id);
		try {
			notifyFactionInviteUpdate(invitedUser.id);
		} catch (emitErr) {
			logError('faction_emit_failed', {
				message: (emitErr as Error).message,
				op: 'inviteToFaction'
			});
		}

		res.status(201).json({ id: invite.id, expiresAt: invite.expiresAt });
	} catch (error) {
		const err = error as any;
		if (err?.code === 'P2002') {
			res.status(400).json({ error: 'Invite already pending for this user' });
			return;
		}
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function getMyInvites(req: AuthRequest, res: Response): Promise<void> {
	try {
		const invites = await prisma.factionInvite.findMany({
			where: {
				invitedUserId: req.userId,
				expiresAt: { gt: new Date() }
			},
			include: {
				faction: { select: { name: true, tag: true } }
			},
			orderBy: { createdAt: 'desc' }
		});

		const invitesWithUsers = await Promise.all(
			invites.map(async (i: any) => {
				const invitedBy = await prisma.user.findUnique({
					where: { id: i.invitedByUserId },
					select: { username: true }
				});
				return {
					id: i.id,
					factionId: i.factionId,
					galaxyId: i.galaxyId,
					factionName: i.faction.name,
					factionTag: i.faction.tag,
					invitedByUsername: invitedBy?.username || 'unknown',
					expiresAt: i.expiresAt
				};
			})
		);

		res.json(invitesWithUsers);
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'factionController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function acceptInvite(req: AuthRequest, res: Response): Promise<void> {
	try {
		const inviteId = parseInt(req.params.inviteId, 10);
		if (!Number.isFinite(inviteId)) {
			res.status(400).json({ error: 'Invalid invite id' });
			return;
		}

		const invite = await prisma.factionInvite.findUnique({
			where: { id: inviteId },
			select: { invitedUserId: true, factionId: true, galaxyId: true, expiresAt: true }
		});
		if (!invite) {
			res.status(404).json({ error: 'Invite not found' });
			return;
		}
		if (invite.invitedUserId !== req.userId) {
			res.status(403).json({ error: 'This invite is not for you' });
			return;
		}
		if (new Date() > invite.expiresAt) {
			res.status(400).json({ error: 'Invite expired' });
			return;
		}

		const existing = await prisma.factionMember.findUnique({
			where: { userId_galaxyId: { userId: req.userId, galaxyId: invite.galaxyId } }
		});
		if (existing) {
			res.status(400).json({ error: 'You are already in a faction in this galaxy' });
			return;
		}

		const memberCount = await prisma.factionMember.count({
			where: { factionId: invite.factionId }
		});
		if (memberCount >= FACTION_MAX_MEMBERS) {
			res
				.status(400)
				.json({ error: `This faction is at the maximum of ${FACTION_MAX_MEMBERS} members` });
			return;
		}

		const joiner = await prisma.user.findUnique({
			where: { id: req.userId },
			select: { username: true }
		});

		await prisma.$transaction([
			prisma.factionMember.create({
				data: {
					factionId: invite.factionId,
					userId: req.userId,
					galaxyId: invite.galaxyId
				}
			}),
			prisma.factionInvite.deleteMany({
				where: { invitedUserId: req.userId, galaxyId: invite.galaxyId }
			}),
			prisma.factionJoinRequest.deleteMany({
				where: { userId: req.userId, galaxyId: invite.galaxyId }
			})
		]);

		await logEvent(invite.factionId, 'member_joined', joiner?.username);
		logGameEvent('joined_faction', req.userId, req.galaxyId, { factionId: invite.factionId });

		try {
			notifyFactionUpdated(invite.factionId);
			notifyFactionInviteUpdate(req.userId);
		} catch (emitErr) {
			logError('faction_emit_failed', { message: (emitErr as Error).message, op: 'acceptInvite' });
		}

		res.json({ success: true });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'factionController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function declineInvite(req: AuthRequest, res: Response): Promise<void> {
	try {
		const inviteId = parseInt(req.params.inviteId, 10);
		if (!Number.isFinite(inviteId)) {
			res.status(400).json({ error: 'Invalid invite id' });
			return;
		}

		const invite = await prisma.factionInvite.findUnique({
			where: { id: inviteId },
			select: { invitedUserId: true }
		});
		if (!invite) {
			res.status(404).json({ error: 'Invite not found' });
			return;
		}
		if (invite.invitedUserId !== req.userId) {
			res.status(403).json({ error: 'This invite is not for you' });
			return;
		}

		await prisma.factionInvite.delete({ where: { id: inviteId } });
		try {
			notifyFactionInviteUpdate(req.userId);
		} catch (emitErr) {
			logError('faction_emit_failed', { message: (emitErr as Error).message, op: 'declineInvite' });
		}
		res.json({ success: true });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'factionController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function setMemberRole(req: AuthRequest, res: Response): Promise<void> {
	try {
		const factionId = parseInt(req.params.id, 10);
		const targetUserId = parseInt(req.params.userId, 10);
		const { role } = req.body as { role?: string };

		if (!Number.isFinite(factionId) || !Number.isFinite(targetUserId)) {
			res.status(400).json({ error: 'Invalid faction or user id' });
			return;
		}
		if (!['leader', 'officer', 'member'].includes(role || '')) {
			res.status(400).json({ error: 'Invalid role' });
			return;
		}

		const faction = await prisma.faction.findUnique({
			where: { id: factionId },
			select: { members: { select: { userId: true, role: true } } }
		});
		if (!faction) {
			res.status(404).json({ error: 'Faction not found' });
			return;
		}

		const caller = faction.members.find((m: any) => m.userId === req.userId);
		if (!caller || caller.role !== 'leader') {
			res.status(403).json({ error: 'Only leaders can change roles' });
			return;
		}

		const target = faction.members.find((m: any) => m.userId === targetUserId);
		if (!target) {
			res.status(404).json({ error: 'Member not found' });
			return;
		}

		const [callerUser, targetUser] = await Promise.all([
			prisma.user.findUnique({ where: { id: req.userId }, select: { username: true } }),
			prisma.user.findUnique({ where: { id: targetUserId }, select: { username: true } })
		]);

		await prisma.factionMember.updateMany({
			where: { factionId, userId: targetUserId },
			data: { role: role as any }
		});

		const eventType = role === 'officer' ? 'member_promoted' : 'member_demoted';
		await logEvent(factionId, eventType, callerUser?.username, targetUser?.username);
		try {
			notifyFactionUpdated(factionId);
		} catch (emitErr) {
			logError('faction_emit_failed', { message: (emitErr as Error).message, op: 'setMemberRole' });
		}

		if (role === 'officer' && target.role !== 'officer') {
			const factionRow = await prisma.faction.findUnique({
				where: { id: factionId },
				select: { name: true, tag: true }
			});
			void sendPushToUser(targetUserId, NOTIF.FACTION_PROMOTION, {
				title: 'Promoted to officer',
				body: `${callerUser?.username ?? 'Your leader'} promoted you to officer in ${factionRow ? `[${factionRow.tag}] ${factionRow.name}` : 'your faction'}.`,
				tag: `faction-promotion-${factionId}-${targetUserId}`,
				data: { url: '/factions' }
			});
		}

		res.json({ success: true });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'factionController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function kickMember(req: AuthRequest, res: Response): Promise<void> {
	try {
		const factionId = parseInt(req.params.id, 10);
		const targetUserId = parseInt(req.params.userId, 10);

		if (!Number.isFinite(factionId) || !Number.isFinite(targetUserId)) {
			res.status(400).json({ error: 'Invalid faction or user id' });
			return;
		}

		const faction = await prisma.faction.findUnique({
			where: { id: factionId },
			select: { members: { select: { userId: true, role: true } } }
		});
		if (!faction) {
			res.status(404).json({ error: 'Faction not found' });
			return;
		}

		const caller = faction.members.find((m: any) => m.userId === req.userId);
		if (!caller || (caller.role !== 'leader' && caller.role !== 'officer')) {
			res.status(403).json({ error: 'Only leaders and officers can kick' });
			return;
		}

		const target = faction.members.find((m: any) => m.userId === targetUserId);
		if (!target) {
			res.status(404).json({ error: 'Member not found' });
			return;
		}

		if (target.role === 'leader') {
			res.status(400).json({ error: 'Cannot kick the leader' });
			return;
		}

		if (caller.role === 'officer' && target.role === 'officer') {
			res.status(403).json({ error: 'Officers cannot kick other officers' });
			return;
		}

		const [callerUser, targetUser] = await Promise.all([
			prisma.user.findUnique({ where: { id: req.userId }, select: { username: true } }),
			prisma.user.findUnique({ where: { id: targetUserId }, select: { username: true } })
		]);

		await prisma.factionMember.deleteMany({
			where: { factionId, userId: targetUserId }
		});

		await logEvent(factionId, 'member_kicked', callerUser?.username, targetUser?.username);
		try {
			notifyFactionUpdated(factionId);
		} catch (emitErr) {
			logError('faction_emit_failed', { message: (emitErr as Error).message, op: 'kickMember' });
		}

		res.json({ success: true });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'factionController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function leaveFaction(req: AuthRequest, res: Response): Promise<void> {
	try {
		const factionId = parseInt(req.params.id, 10);
		if (!Number.isFinite(factionId)) {
			res.status(400).json({ error: 'Invalid faction id' });
			return;
		}

		const member = await prisma.factionMember.findFirst({
			where: { factionId, userId: req.userId },
			select: { role: true }
		});
		if (!member) {
			res.status(404).json({ error: 'You are not in this faction' });
			return;
		}

		if (member.role === 'leader') {
			res
				.status(400)
				.json({ error: 'Leader cannot leave. Disband the faction or transfer leadership first.' });
			return;
		}

		const leaver = await prisma.user.findUnique({
			where: { id: req.userId },
			select: { username: true }
		});

		await prisma.factionMember.deleteMany({
			where: { factionId, userId: req.userId }
		});

		await logEvent(factionId, 'member_left', leaver?.username);
		try {
			notifyFactionUpdated(factionId);
		} catch (emitErr) {
			logError('faction_emit_failed', { message: (emitErr as Error).message, op: 'leaveFaction' });
		}

		res.json({ success: true });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'factionController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function transferLeader(req: AuthRequest, res: Response): Promise<void> {
	try {
		const factionId = parseInt(req.params.id, 10);
		const targetUserId = parseInt(req.params.userId, 10);

		if (!Number.isFinite(factionId) || !Number.isFinite(targetUserId)) {
			res.status(400).json({ error: 'Invalid faction or user id' });
			return;
		}

		const faction = await prisma.faction.findUnique({
			where: { id: factionId },
			select: { members: { select: { userId: true, role: true } } }
		});
		if (!faction) {
			res.status(404).json({ error: 'Faction not found' });
			return;
		}

		const caller = faction.members.find((m: any) => m.userId === req.userId);
		if (!caller || caller.role !== 'leader') {
			res.status(403).json({ error: 'Only the leader can transfer leadership' });
			return;
		}

		const target = faction.members.find((m: any) => m.userId === targetUserId);
		if (!target) {
			res.status(404).json({ error: 'Member not found' });
			return;
		}
		if (target.role === 'leader') {
			res.status(400).json({ error: 'That member is already the leader' });
			return;
		}

		const [callerUser, targetUser] = await Promise.all([
			prisma.user.findUnique({ where: { id: req.userId }, select: { username: true } }),
			prisma.user.findUnique({ where: { id: targetUserId }, select: { username: true } })
		]);

		await prisma.$transaction([
			prisma.factionMember.updateMany({
				where: { factionId, userId: req.userId },
				data: { role: 'member' }
			}),
			prisma.factionMember.updateMany({
				where: { factionId, userId: targetUserId },
				data: { role: 'leader' }
			})
		]);

		await logEvent(factionId, 'leader_transferred', callerUser?.username, targetUser?.username);
		try {
			notifyFactionUpdated(factionId);
		} catch (emitErr) {
			logError('faction_emit_failed', {
				message: (emitErr as Error).message,
				op: 'transferLeader'
			});
		}

		res.json({ success: true });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'factionController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function disbandFaction(req: AuthRequest, res: Response): Promise<void> {
	try {
		const factionId = parseInt(req.params.id, 10);
		if (!Number.isFinite(factionId)) {
			res.status(400).json({ error: 'Invalid faction id' });
			return;
		}

		const faction = await prisma.faction.findUnique({
			where: { id: factionId },
			select: { members: { select: { userId: true, role: true } } }
		});
		if (!faction) {
			res.status(404).json({ error: 'Faction not found' });
			return;
		}

		const member = faction.members.find((m: any) => m.userId === req.userId);
		if (!member || member.role !== 'leader') {
			res.status(403).json({ error: 'Only the leader can disband the faction' });
			return;
		}

		// Emit *before* deletion so the faction:* room subscribers still exist.
		// Members will leave the room on their next reconnect anyway.
		try {
			notifyFactionUpdated(factionId);
		} catch (emitErr) {
			logError('faction_emit_failed', {
				message: (emitErr as Error).message,
				op: 'disbandFaction'
			});
		}
		await prisma.faction.delete({ where: { id: factionId } });
		res.json({ success: true });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'factionController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

// ── LEADERBOARD ───────────────────────────────────────────────────────────────

const DOMINANCE_THRESHOLD = 0.65;
const DOMINANCE_SUSTAIN_MS = 36 * 60 * 60 * 1000;
const DOMINANCE_MIN_PLAYERS = 10;
const DOMINANCE_MIN_FACTIONS = 4;

export async function getLeaderboard(req: AuthRequest, res: Response): Promise<void> {
	try {
		const user = await prisma.user.findUnique({
			where: { id: req.userId },
			select: { activeGalaxyId: true }
		});
		if (!user?.activeGalaxyId) {
			res.status(409).json({ error: 'No active galaxy' });
			return;
		}

		const galaxyId = user.activeGalaxyId;

		const [totalNexuses, galaxyPlayerCount, allFactions, memberRows, nexuses] = await Promise.all([
			prisma.nexus.count({ where: { galaxyId } }),
			prisma.galaxyPlayer.count({ where: { galaxyId } }),
			prisma.faction.findMany({
				where: { galaxyId },
				select: {
					id: true,
					name: true,
					tag: true,
					description: true,
					dominanceSince: true,
					_count: { select: { members: true } }
				},
				orderBy: { createdAt: 'asc' }
			}),
			prisma.factionMember.findMany({
				where: { galaxyId },
				select: { userId: true, factionId: true }
			}),
			prisma.nexus.findMany({
				where: { galaxyId, ownerId: { not: null } },
				select: { ownerId: true }
			})
		]);

		const userToFaction = new Map(memberRows.map((m: any) => [m.userId, m.factionId]));

		const factionNexusCounts = new Map<number, number>();
		for (const n of nexuses) {
			const fid = userToFaction.get(n.ownerId!);
			if (fid) factionNexusCounts.set(fid, (factionNexusCounts.get(fid) ?? 0) + 1);
		}

		const factionCount = allFactions.length;
		const dominanceLocked =
			galaxyPlayerCount < DOMINANCE_MIN_PLAYERS || factionCount < DOMINANCE_MIN_FACTIONS;
		const now = Date.now();

		const rows = allFactions.map((f: any) => {
			const nexusCount = factionNexusCounts.get(f.id) ?? 0;
			const pct = totalNexuses > 0 ? nexusCount / totalNexuses : 0;
			const isDominating = !dominanceLocked && pct >= DOMINANCE_THRESHOLD;
			let dominancePct = 0;
			if (isDominating && f.dominanceSince) {
				const dominanceMs = now - new Date(f.dominanceSince).getTime();
				dominancePct = Math.min(dominanceMs / DOMINANCE_SUSTAIN_MS, 1);
			}
			return {
				id: f.id,
				name: f.name,
				tag: f.tag,
				description: f.description ?? null,
				memberCount: f._count.members,
				nexusCount,
				totalNexuses,
				pct: Math.round(pct * 1000) / 10,
				isDominating,
				dominanceSince: f.dominanceSince,
				dominancePct: Math.round(dominancePct * 1000) / 10
			};
		});

		rows.sort((a: any, b: any) => b.nexusCount - a.nexusCount);

		res.json({
			rows,
			totalNexuses,
			dominanceThresholdPct: DOMINANCE_THRESHOLD * 100,
			dominanceLocked,
			galaxyPlayerCount,
			factionCount,
			dominanceMinPlayers: DOMINANCE_MIN_PLAYERS,
			dominanceMinFactions: DOMINANCE_MIN_FACTIONS
		});
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'factionController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

// ── JOIN REQUESTS ─────────────────────────────────────────────────────────────

export async function requestToJoin(req: AuthRequest, res: Response): Promise<void> {
	try {
		const factionId = parseInt(req.params.id, 10);
		if (!Number.isFinite(factionId)) {
			res.status(400).json({ error: 'Invalid faction id' });
			return;
		}

		const { message } = req.body as { message?: string };
		if (message && typeof message === 'string' && message.length > 256) {
			res.status(400).json({ error: 'Message must be 256 characters or less' });
			return;
		}

		const user = await prisma.user.findUnique({
			where: { id: req.userId },
			select: { activeGalaxyId: true }
		});
		if (!user?.activeGalaxyId) {
			res.status(409).json({ error: 'No active galaxy' });
			return;
		}

		const faction = await prisma.faction.findUnique({
			where: { id: factionId },
			select: { galaxyId: true }
		});
		if (!faction) {
			res.status(404).json({ error: 'Faction not found' });
			return;
		}
		if (faction.galaxyId !== user.activeGalaxyId) {
			res.status(400).json({ error: 'Faction is not in your active galaxy' });
			return;
		}

		const alreadyMember = await prisma.factionMember.findUnique({
			where: { userId_galaxyId: { userId: req.userId, galaxyId: user.activeGalaxyId } }
		});
		if (alreadyMember) {
			res.status(400).json({ error: 'You are already in a faction' });
			return;
		}

		const joinRequest = await prisma.factionJoinRequest.create({
			data: {
				factionId,
				userId: req.userId,
				galaxyId: user.activeGalaxyId,
				message: message?.trim() || null
			}
		});

		// Bump badge for every leader/officer of the target faction so the
		// Factions nav dot lights up live (the count itself comes from /badges).
		const leaders = await prisma.factionMember.findMany({
			where: { factionId, role: { in: ['leader', 'officer'] } },
			select: { userId: true }
		});
		for (const l of leaders) notifyBadgeUpdate(l.userId);

		res.status(201).json({ id: joinRequest.id });
	} catch (error) {
		const err = error as any;
		if (err?.code === 'P2002') {
			res.status(400).json({ error: 'You already have a pending request to join this faction' });
			return;
		}
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function cancelJoinRequest(req: AuthRequest, res: Response): Promise<void> {
	try {
		const factionId = parseInt(req.params.id, 10);
		if (!Number.isFinite(factionId)) {
			res.status(400).json({ error: 'Invalid faction id' });
			return;
		}

		const deleted = await prisma.factionJoinRequest.deleteMany({
			where: { factionId, userId: req.userId }
		});
		if (deleted.count === 0) {
			res.status(404).json({ error: 'No pending join request found' });
			return;
		}

		res.json({ success: true });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'factionController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function getJoinRequests(req: AuthRequest, res: Response): Promise<void> {
	try {
		const factionId = parseInt(req.params.id, 10);
		if (!Number.isFinite(factionId)) {
			res.status(400).json({ error: 'Invalid faction id' });
			return;
		}

		const member = await prisma.factionMember.findFirst({
			where: { factionId, userId: req.userId },
			select: { role: true }
		});
		if (!member || (member.role !== 'leader' && member.role !== 'officer')) {
			res.status(403).json({ error: 'Only leaders and officers can view join requests' });
			return;
		}

		const requests = await prisma.factionJoinRequest.findMany({
			where: { factionId },
			select: {
				id: true,
				message: true,
				createdAt: true,
				user: {
					select: {
						id: true,
						username: true,
						isSupporter: true,
						supporterTier: true,
						avatarKey: true
					}
				}
			},
			orderBy: { createdAt: 'asc' }
		});

		res.json(
			requests.map((r: any) => ({
				id: r.id,
				userId: r.user.id,
				username: r.user.username,
				isSupporter: r.user.isSupporter,
				supporterTier: r.user.supporterTier,
				avatarUrl: avatarUrl(r.user.id, r.user.avatarKey),
				avatarUrlSm: avatarUrlSm(r.user.id, r.user.avatarKey),
				message: r.message,
				createdAt: r.createdAt
			}))
		);
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'factionController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function approveJoinRequest(req: AuthRequest, res: Response): Promise<void> {
	try {
		const factionId = parseInt(req.params.id, 10);
		const requestId = parseInt(req.params.requestId, 10);
		if (!Number.isFinite(factionId) || !Number.isFinite(requestId)) {
			res.status(400).json({ error: 'Invalid faction or request id' });
			return;
		}

		const faction = await prisma.faction.findUnique({
			where: { id: factionId },
			select: { galaxyId: true, members: { select: { userId: true, role: true } } }
		});
		if (!faction) {
			res.status(404).json({ error: 'Faction not found' });
			return;
		}

		const caller = faction.members.find((m: any) => m.userId === req.userId);
		if (!caller || (caller.role !== 'leader' && caller.role !== 'officer')) {
			res.status(403).json({ error: 'Only leaders and officers can approve join requests' });
			return;
		}

		const joinRequest = await prisma.factionJoinRequest.findUnique({
			where: { id: requestId },
			select: { userId: true, galaxyId: true }
		});
		if (!joinRequest || joinRequest.galaxyId !== faction.galaxyId) {
			res.status(404).json({ error: 'Join request not found' });
			return;
		}

		const alreadyMember = await prisma.factionMember.findUnique({
			where: { userId_galaxyId: { userId: joinRequest.userId, galaxyId: faction.galaxyId } }
		});
		if (alreadyMember) {
			await prisma.factionJoinRequest.delete({ where: { id: requestId } });
			res.status(400).json({ error: 'User is already in a faction' });
			return;
		}

		if (faction.members.length >= FACTION_MAX_MEMBERS) {
			res
				.status(400)
				.json({ error: `Faction is at the maximum of ${FACTION_MAX_MEMBERS} members` });
			return;
		}

		const joiner = await prisma.user.findUnique({
			where: { id: joinRequest.userId },
			select: { username: true }
		});

		await prisma.$transaction([
			prisma.factionMember.create({
				data: { factionId, userId: joinRequest.userId, galaxyId: faction.galaxyId }
			}),
			prisma.factionJoinRequest.deleteMany({
				where: { userId: joinRequest.userId, galaxyId: faction.galaxyId }
			}),
			prisma.factionInvite.deleteMany({
				where: { invitedUserId: joinRequest.userId, galaxyId: faction.galaxyId }
			})
		]);

		await logEvent(factionId, 'member_joined', joiner?.username);
		try {
			notifyFactionUpdated(factionId);
		} catch (emitErr) {
			logError('faction_emit_failed', {
				message: (emitErr as Error).message,
				op: 'approveJoinRequest'
			});
		}

		res.json({ success: true });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'factionController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function declineJoinRequest(req: AuthRequest, res: Response): Promise<void> {
	try {
		const factionId = parseInt(req.params.id, 10);
		const requestId = parseInt(req.params.requestId, 10);
		if (!Number.isFinite(factionId) || !Number.isFinite(requestId)) {
			res.status(400).json({ error: 'Invalid faction or request id' });
			return;
		}

		const member = await prisma.factionMember.findFirst({
			where: { factionId, userId: req.userId },
			select: { role: true }
		});
		if (!member || (member.role !== 'leader' && member.role !== 'officer')) {
			res.status(403).json({ error: 'Only leaders and officers can decline join requests' });
			return;
		}

		const deleted = await prisma.factionJoinRequest.deleteMany({
			where: { id: requestId, factionId }
		});
		if (deleted.count === 0) {
			res.status(404).json({ error: 'Join request not found' });
			return;
		}

		res.json({ success: true });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'factionController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function getMyJoinRequests(req: AuthRequest, res: Response): Promise<void> {
	try {
		const user = await prisma.user.findUnique({
			where: { id: req.userId },
			select: { activeGalaxyId: true }
		});
		if (!user?.activeGalaxyId) {
			res.json([]);
			return;
		}

		const requests = await prisma.factionJoinRequest.findMany({
			where: { userId: req.userId, galaxyId: user.activeGalaxyId },
			select: {
				id: true,
				factionId: true,
				message: true,
				createdAt: true,
				faction: { select: { name: true, tag: true } }
			},
			orderBy: { createdAt: 'desc' }
		});

		res.json(
			requests.map((r: any) => ({
				id: r.id,
				factionId: r.factionId,
				factionName: r.faction.name,
				factionTag: r.faction.tag,
				message: r.message,
				createdAt: r.createdAt
			}))
		);
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'factionController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

// ── ENFORCE MEMBER CAP ──────────────────────────────────────────────────────
// One-time startup task: trim any existing factions that exceed the cap.
// Removes lowest-influence players until the faction is at the limit.

export async function trimOversizedFactions(): Promise<void> {
	const factions = await prisma.faction.findMany({
		select: { id: true, galaxyId: true, name: true, _count: { select: { members: true } } }
	});

	for (const faction of factions) {
		if (faction._count.members <= FACTION_MAX_MEMBERS) continue;

		const members = await prisma.factionMember.findMany({
			where: { factionId: faction.id },
			select: { id: true, userId: true, role: true }
		});

		const gpRows = await prisma.galaxyPlayer.findMany({
			where: { galaxyId: faction.galaxyId, userId: { in: members.map((m) => m.userId) } },
			select: { userId: true, points: true }
		});
		const pointsMap = new Map(gpRows.map((g) => [g.userId, g.points]));

		const sorted = members
			.filter((m) => m.role !== 'leader')
			.sort((a, b) => (pointsMap.get(a.userId) ?? 0) - (pointsMap.get(b.userId) ?? 0));

		const toRemove = sorted.slice(0, faction._count.members - FACTION_MAX_MEMBERS);
		if (toRemove.length > 0) {
			await prisma.factionMember.deleteMany({ where: { id: { in: toRemove.map((m) => m.id) } } });
			for (const removed of toRemove) {
				const user = await prisma.user.findUnique({
					where: { id: removed.userId },
					select: { username: true }
				});
				await logEvent(
					faction.id,
					'member_removed_cap',
					user?.username ?? 'Unknown',
					undefined,
					`Faction cap enforced (${FACTION_MAX_MEMBERS} max)`
				);
			}
		}
	}
}

// ── PURGE NEXUS-LESS MEMBERS ─────────────────────────────────────────────────
// Removes any faction member who owns zero nexuses in their galaxy.
// Runs at startup and periodically so stale memberships don't linger.

export async function purgeNexuslessMembers(): Promise<void> {
	const members = await prisma.factionMember.findMany({
		select: { id: true, userId: true, galaxyId: true, factionId: true, role: true }
	});

	for (const member of members) {
		// Keep leaders in — they may be building/recovering; they can be manually kicked.
		if (member.role === 'leader') continue;

		const nexusCount = await prisma.nexus.count({
			where: { galaxyId: member.galaxyId, ownerId: member.userId }
		});
		if (nexusCount > 0) continue;

		await prisma.factionMember.delete({ where: { id: member.id } });
		const user = await prisma.user.findUnique({
			where: { id: member.userId },
			select: { username: true }
		});
		await prisma.factionEvent.create({
			data: {
				factionId: member.factionId,
				type: 'member_removed_no_nexus',
				actorName: user?.username,
				targetName: undefined
			}
		});
		try {
			notifyFactionUpdated(member.factionId);
		} catch (_) {}
	}
}

// ── MOTD ──────────────────────────────────────────────────────────────────────

export async function updateMotd(req: AuthRequest, res: Response): Promise<void> {
	try {
		const factionId = parseInt(req.params.id, 10);
		const { motd } = req.body as { motd?: string };

		if (!Number.isFinite(factionId)) {
			res.status(400).json({ error: 'Invalid faction id' });
			return;
		}
		if (
			motd !== undefined &&
			motd !== null &&
			typeof motd === 'string' &&
			motd.length > FACTION_MOTD_MAX
		) {
			res.status(400).json({ error: `MOTD must be ${FACTION_MOTD_MAX} characters or less` });
			return;
		}

		const faction = await prisma.faction.findUnique({
			where: { id: factionId },
			select: { members: { select: { userId: true, role: true } } }
		});
		if (!faction) {
			res.status(404).json({ error: 'Faction not found' });
			return;
		}

		const member = faction.members.find((m: any) => m.userId === req.userId);
		if (!member || (member.role !== 'leader' && member.role !== 'officer')) {
			res.status(403).json({ error: 'Only leaders and officers can update the MOTD' });
			return;
		}

		const updated = await prisma.faction.update({
			where: { id: factionId },
			data: { motd: motd?.trim() || null },
			select: { motd: true }
		});

		res.json(updated);
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'factionController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

// ── CHAT ──────────────────────────────────────────────────────────────────────

export async function getChatMessages(req: AuthRequest, res: Response): Promise<void> {
	try {
		const factionId = parseInt(req.params.id, 10);
		if (!Number.isFinite(factionId)) {
			res.status(400).json({ error: 'Invalid faction id' });
			return;
		}

		const before = req.query.before ? parseInt(req.query.before as string, 10) : undefined;

		const member = await prisma.factionMember.findFirst({
			where: { factionId, userId: req.userId }
		});
		if (!member) {
			res.status(403).json({ error: 'You are not a member of this faction' });
			return;
		}

		const messages = await prisma.factionMessage.findMany({
			where: {
				factionId,
				...(before ? { id: { lt: before } } : {})
			},
			select: {
				id: true,
				content: true,
				createdAt: true,
				user: {
					select: {
						id: true,
						username: true,
						isSupporter: true,
						supporterTier: true,
						avatarKey: true
					}
				}
			},
			orderBy: { id: 'desc' },
			take: CHAT_PAGE_SIZE
		});

		if (!before && messages.length > 0) {
			const latestId = Math.max(...messages.map((m: any) => m.id));
			await prisma.factionMember.updateMany({
				where: {
					factionId,
					userId: req.userId,
					lastSeenFactionMessageId: { lt: latestId }
				},
				data: { lastSeenFactionMessageId: latestId }
			});
			notifyBadgeUpdate(req.userId);
		}

		res.json(
			messages.reverse().map((m: any) => ({
				id: m.id,
				content: m.content,
				createdAt: m.createdAt,
				user: {
					id: m.user.id,
					username: m.user.username,
					isSupporter: m.user.isSupporter,
					supporterTier: m.user.supporterTier,
					avatarUrl: avatarUrl(m.user.id, m.user.avatarKey),
					avatarUrlSm: avatarUrlSm(m.user.id, m.user.avatarKey)
				}
			}))
		);
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'factionController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function markChatRead(req: AuthRequest, res: Response): Promise<void> {
	try {
		const factionId = parseInt(req.params.id, 10);
		const messageId = Number((req.body as { messageId?: number }).messageId);

		if (!Number.isFinite(factionId) || !Number.isFinite(messageId)) {
			res.status(400).json({ error: 'Invalid faction or message id' });
			return;
		}

		const updated = await prisma.factionMember.updateMany({
			where: {
				factionId,
				userId: req.userId,
				lastSeenFactionMessageId: { lt: Math.floor(messageId) }
			},
			data: { lastSeenFactionMessageId: Math.floor(messageId) }
		});

		if (updated.count > 0) notifyBadgeUpdate(req.userId);
		res.json({ success: true });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'factionController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function sendChatMessage(req: AuthRequest, res: Response): Promise<void> {
	try {
		const factionId = parseInt(req.params.id, 10);
		const { content } = req.body as { content?: string };

		if (!Number.isFinite(factionId)) {
			res.status(400).json({ error: 'Invalid faction id' });
			return;
		}
		if (!content || typeof content !== 'string' || content.trim().length === 0) {
			res.status(400).json({ error: 'Message cannot be empty' });
			return;
		}
		if (content.trim().length > FACTION_MSG_MAX) {
			res.status(400).json({ error: `Message must be ${FACTION_MSG_MAX} characters or less` });
			return;
		}
		if (containsBlockedChatWord(content.trim())) {
			res.status(400).json({ error: 'Message contains prohibited language.' });
			return;
		}

		const member = await prisma.factionMember.findFirst({
			where: { factionId, userId: req.userId }
		});
		if (!member) {
			res.status(403).json({ error: 'You are not a member of this faction' });
			return;
		}

		const message = await prisma.factionMessage.create({
			data: { factionId, userId: req.userId, content: content.trim() },
			select: {
				id: true,
				content: true,
				createdAt: true,
				user: {
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

		const serialized = {
			id: message.id,
			content: message.content,
			createdAt: message.createdAt,
			user: {
				id: message.user.id,
				username: message.user.username,
				isSupporter: message.user.isSupporter,
				supporterTier: message.user.supporterTier,
				avatarUrl: avatarUrl(message.user.id, message.user.avatarKey),
				avatarUrlSm: avatarUrlSm(message.user.id, message.user.avatarKey)
			}
		};
		notifyFactionChat(factionId, serialized);
		const recipients = await prisma.factionMember.findMany({
			where: { factionId, userId: { not: req.userId } },
			select: { userId: true }
		});
		for (const recipient of recipients) {
			notifyBadgeUpdate(recipient.userId);
			void sendPushToUser(recipient.userId, NOTIF.FACTION_MESSAGE, {
				title: 'Faction message',
				body: `${message.user.username}: ${message.content.slice(0, 120)}`,
				tag: `faction-message-${factionId}`,
				data: { url: '/factions' }
			});
		}
		try {
			const { incrementQuestProgress } = await import('../services/dailyStreakService.js');
			void incrementQuestProgress(req.userId, req.galaxyId, 'faction_chat_1', 1);
		} catch {}
		res.status(201).json(serialized);
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'factionController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

// ── EVENTS ────────────────────────────────────────────────────────────────────

export async function getEvents(req: AuthRequest, res: Response): Promise<void> {
	try {
		const factionId = parseInt(req.params.id, 10);
		if (!Number.isFinite(factionId)) {
			res.status(400).json({ error: 'Invalid faction id' });
			return;
		}

		const before = req.query.before ? parseInt(req.query.before as string, 10) : undefined;

		const member = await prisma.factionMember.findFirst({
			where: { factionId, userId: req.userId }
		});
		if (!member) {
			res.status(403).json({ error: 'You are not a member of this faction' });
			return;
		}

		const events = await prisma.factionEvent.findMany({
			where: {
				factionId,
				...(before ? { id: { lt: before } } : {})
			},
			select: {
				id: true,
				type: true,
				actorName: true,
				targetName: true,
				meta: true,
				createdAt: true
			},
			orderBy: { id: 'desc' },
			take: EVENTS_PAGE_SIZE
		});

		res.json(events.reverse());
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'factionController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}
