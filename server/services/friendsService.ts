import type { FriendRequestStatus } from '@prisma/client';
import prisma from '../lib/prisma.js';

export function pairKey(a: number, b: number) {
	const [userAId, userBId] = a < b ? [a, b] : [b, a];
	return { userAId, userBId };
}

export function getFriendships(userId: number) {
	return prisma.friendship.findMany({
		where: { OR: [{ userAId: userId }, { userBId: userId }] },
		include: {
			userA: {
				select: {
					id: true,
					username: true,
					isSupporter: true,
					supporterTier: true,
					avatarKey: true
				}
			},
			userB: {
				select: {
					id: true,
					username: true,
					isSupporter: true,
					supporterTier: true,
					avatarKey: true
				}
			}
		},
		orderBy: { createdAt: 'desc' }
	});
}

export function getFriendPlayers(galaxyId: number, friendIds: number[]) {
	if (!friendIds.length) return Promise.resolve([]);
	return prisma.galaxyPlayer.findMany({
		where: { galaxyId, userId: { in: friendIds } },
		select: { userId: true, points: true }
	});
}

export function getUserByUsername(username: string) {
	return prisma.user.findUnique({ where: { username } });
}

export function getFriendship(userAId: number, userBId: number) {
	return prisma.friendship.findUnique({ where: { userAId_userBId: { userAId, userBId } } });
}

export function getPendingRequestBetween(senderId: number, receiverId: number) {
	return prisma.friendRequest.findFirst({ where: { senderId, receiverId, status: 'pending' } });
}

export async function autoAcceptRequest(requestId: number, userAId: number, userBId: number) {
	return prisma.$transaction([
		prisma.friendRequest.update({
			where: { id: requestId },
			data: { status: 'accepted', respondedAt: new Date() }
		}),
		prisma.friendship.create({ data: { userAId, userBId } })
	]);
}

export function createFriendRequest(senderId: number, receiverId: number) {
	return prisma.friendRequest.create({ data: { senderId, receiverId } });
}

export function getPendingRequests(userId: number) {
	return Promise.all([
		prisma.friendRequest.findMany({
			where: { receiverId: userId, status: 'pending' },
			include: {
				sender: {
					select: {
						id: true,
						username: true,
						isSupporter: true,
						supporterTier: true,
						avatarKey: true
					}
				}
			},
			orderBy: { createdAt: 'desc' }
		}),
		prisma.friendRequest.findMany({
			where: { senderId: userId, status: 'pending' },
			include: {
				receiver: {
					select: {
						id: true,
						username: true,
						isSupporter: true,
						supporterTier: true,
						avatarKey: true
					}
				}
			},
			orderBy: { createdAt: 'desc' }
		})
	]);
}

export function countIncomingRequests(userId: number) {
	return prisma.friendRequest.count({ where: { receiverId: userId, status: 'pending' } });
}

export function getFriendRequestById(id: number) {
	return prisma.friendRequest.findUnique({ where: { id } });
}

export async function acceptRequest(id: number, userAId: number, userBId: number) {
	return prisma.$transaction([
		prisma.friendRequest.update({
			where: { id },
			data: { status: 'accepted', respondedAt: new Date() }
		}),
		prisma.friendship.upsert({
			where: { userAId_userBId: { userAId, userBId } },
			create: { userAId, userBId },
			update: {}
		})
	]);
}

export function updateRequestStatus(id: number, status: FriendRequestStatus) {
	return prisma.friendRequest.update({ where: { id }, data: { status, respondedAt: new Date() } });
}

export function getFriendshipById(id: number) {
	return prisma.friendship.findUnique({ where: { id } });
}

export function deleteFriendship(id: number) {
	return prisma.friendship.delete({ where: { id } });
}
