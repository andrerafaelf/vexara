import prisma from '../lib/prisma.js';

export function pairKey(a: number, b: number) {
	const [userAId, userBId] = a < b ? [a, b] : [b, a];
	return { userAId, userBId };
}

export function assertFriendship(userId: number, friendId: number) {
	const { userAId, userBId } = pairKey(userId, friendId);
	return prisma.friendship.findUnique({ where: { userAId_userBId: { userAId, userBId } } });
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
		}
	});
}

export function getLastMessage(userId: number, friendId: number) {
	return prisma.chatMessage.findFirst({
		where: {
			OR: [
				{ senderId: userId, receiverId: friendId },
				{ senderId: friendId, receiverId: userId }
			]
		},
		orderBy: { createdAt: 'desc' }
	});
}

export function getUnreadCount(senderId: number, receiverId: number) {
	return prisma.chatMessage.count({ where: { senderId, receiverId, readAt: null } });
}

// Batch version: returns the latest message per (userId, friendId) pair and unread counts.
// Replaces O(N) per-friendship queries with two aggregated queries.
export async function getConversationSummaries(
	userId: number,
	friendIds: number[]
): Promise<
	Map<
		number,
		{
			lastMessage: {
				id: number;
				senderId: number;
				receiverId: number;
				content: string;
				createdAt: Date;
				readAt: Date | null;
			} | null;
			unreadCount: number;
		}
	>
> {
	if (friendIds.length === 0) return new Map();

	// One query: latest message id per conversation pair using a raw grouping approach.
	// We fetch recent messages for all friends and pick the newest per pair in JS .
	// cheaper than N round-trips, still one DB call.
	const recentMessages = await prisma.chatMessage.findMany({
		where: {
			OR: [
				{ senderId: userId, receiverId: { in: friendIds } },
				{ senderId: { in: friendIds }, receiverId: userId }
			]
		},
		orderBy: { id: 'desc' },
		// Upper bound: 2 messages per friend is enough to find the latest; cap at 200
		take: Math.min(friendIds.length * 2, 200)
	});

	// One query: unread counts grouped by senderId (messages from friends not yet read by userId)
	const unreadRows = await prisma.chatMessage.groupBy({
		by: ['senderId'],
		where: { receiverId: userId, senderId: { in: friendIds }, readAt: null },
		_count: { id: true }
	});
	const unreadMap = new Map(unreadRows.map((r) => [r.senderId, r._count.id]));

	// Build per-friend summary from the flat list
	const latestPerFriend = new Map<number, (typeof recentMessages)[0]>();
	for (const msg of recentMessages) {
		const friendId = msg.senderId === userId ? msg.receiverId : msg.senderId;
		if (!latestPerFriend.has(friendId)) latestPerFriend.set(friendId, msg);
	}

	const result = new Map<
		number,
		{ lastMessage: (typeof recentMessages)[0] | null; unreadCount: number }
	>();
	for (const fid of friendIds) {
		result.set(fid, {
			lastMessage: latestPerFriend.get(fid) ?? null,
			unreadCount: unreadMap.get(fid) ?? 0
		});
	}
	return result;
}

export function getTotalUnreadCount(userId: number) {
	return prisma.chatMessage.count({ where: { receiverId: userId, readAt: null } });
}

export function getMessages(
	userId: number,
	friendId: number,
	limit: number,
	before: number | null
) {
	return prisma.chatMessage.findMany({
		where: {
			OR: [
				{ senderId: userId, receiverId: friendId },
				{ senderId: friendId, receiverId: userId }
			],
			...(Number.isFinite(before) && before !== null ? { id: { lt: before } } : {})
		},
		orderBy: { id: 'desc' },
		take: limit
	});
}

export function createMessage(senderId: number, receiverId: number, content: string) {
	return prisma.chatMessage.create({ data: { senderId, receiverId, content } });
}

export function markMessagesRead(senderId: number, receiverId: number) {
	return prisma.chatMessage.updateMany({
		where: { senderId, receiverId, readAt: null },
		data: { readAt: new Date() }
	});
}
