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
    include: { userA: { select: { id: true, username: true } }, userB: { select: { id: true, username: true } } },
  });
}

export function getLastMessage(userId: number, friendId: number) {
  return prisma.chatMessage.findFirst({
    where: { OR: [{ senderId: userId, receiverId: friendId }, { senderId: friendId, receiverId: userId }] },
    orderBy: { createdAt: 'desc' },
  });
}

export function getUnreadCount(senderId: number, receiverId: number) {
  return prisma.chatMessage.count({ where: { senderId, receiverId, readAt: null } });
}

export function getTotalUnreadCount(userId: number) {
  return prisma.chatMessage.count({ where: { receiverId: userId, readAt: null } });
}

export function getMessages(userId: number, friendId: number, limit: number, before: number | null) {
  return prisma.chatMessage.findMany({
    where: {
      OR: [{ senderId: userId, receiverId: friendId }, { senderId: friendId, receiverId: userId }],
      ...(Number.isFinite(before) && before !== null ? { id: { lt: before } } : {}),
    },
    orderBy: { id: 'desc' },
    take: limit,
  });
}

export function createMessage(senderId: number, receiverId: number, content: string) {
  return prisma.chatMessage.create({ data: { senderId, receiverId, content } });
}

export function markMessagesRead(senderId: number, receiverId: number) {
  return prisma.chatMessage.updateMany({
    where: { senderId, receiverId, readAt: null },
    data: { readAt: new Date() },
  });
}
