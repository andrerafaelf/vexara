import express from 'express';
import prisma from '../lib/prisma.js';
import auth from '../middleware/auth.js';

const router = express.Router();

const MAX_MESSAGE_LENGTH = 2000;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

function pairKey(a, b) {
  const [userAId, userBId] = a < b ? [a, b] : [b, a];
  return { userAId, userBId };
}

async function assertFriendship(userId, friendId) {
  const { userAId, userBId } = pairKey(userId, friendId);
  return prisma.friendship.findUnique({ where: { userAId_userBId: { userAId, userBId } } });
}

function serializeMessage(m) {
  return {
    id: String(m.id),
    senderId: String(m.senderId),
    receiverId: String(m.receiverId),
    content: m.content,
    createdAt: m.createdAt,
    readAt: m.readAt,
  };
}

// List conversations: each friend with last message and unread count
router.get('/conversations', auth, async (req, res) => {
  try {
    const friendships = await prisma.friendship.findMany({
      where: { OR: [{ userAId: req.userId }, { userBId: req.userId }] },
      include: {
        userA: { select: { id: true, username: true } },
        userB: { select: { id: true, username: true } },
      },
    });

    const conversations = await Promise.all(
      friendships.map(async (f) => {
        const friend = f.userAId === req.userId ? f.userB : f.userA;
        const [lastMessage, unreadCount] = await Promise.all([
          prisma.chatMessage.findFirst({
            where: {
              OR: [
                { senderId: req.userId, receiverId: friend.id },
                { senderId: friend.id, receiverId: req.userId },
              ],
            },
            orderBy: { createdAt: 'desc' },
          }),
          prisma.chatMessage.count({
            where: { senderId: friend.id, receiverId: req.userId, readAt: null },
          }),
        ]);

        return {
          friendId: String(friend.id),
          username: friend.username,
          lastMessage: lastMessage ? serializeMessage(lastMessage) : null,
          unreadCount,
        };
      }),
    );

    conversations.sort((a, b) => {
      const ta = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
      const tb = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
      return tb - ta;
    });

    res.json(conversations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Total unread chat messages (for the header dot)
router.get('/unread-count', auth, async (req, res) => {
  try {
    const count = await prisma.chatMessage.count({
      where: { receiverId: req.userId, readAt: null },
    });
    res.json({ count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Fetch messages with a friend (paginated by `before` cursor — message id)
router.get('/:friendId/messages', auth, async (req, res) => {
  try {
    const friendId = parseInt(req.params.friendId, 10);
    if (!Number.isFinite(friendId)) return res.status(400).json({ error: 'Invalid friend id' });

    const friendship = await assertFriendship(req.userId, friendId);
    if (!friendship) return res.status(403).json({ error: 'Not friends' });

    const limit = Math.min(parseInt(req.query.limit, 10) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const before = req.query.before ? parseInt(req.query.before, 10) : null;

    const messages = await prisma.chatMessage.findMany({
      where: {
        OR: [
          { senderId: req.userId, receiverId: friendId },
          { senderId: friendId, receiverId: req.userId },
        ],
        ...(Number.isFinite(before) ? { id: { lt: before } } : {}),
      },
      orderBy: { id: 'desc' },
      take: limit,
    });

    res.json(messages.reverse().map(serializeMessage));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Send a message
router.post('/:friendId/messages', auth, async (req, res) => {
  try {
    const friendId = parseInt(req.params.friendId, 10);
    if (!Number.isFinite(friendId)) return res.status(400).json({ error: 'Invalid friend id' });

    const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
    if (!content) return res.status(400).json({ error: 'Empty message' });
    if (content.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({ error: `Message too long (max ${MAX_MESSAGE_LENGTH} chars)` });
    }

    const friendship = await assertFriendship(req.userId, friendId);
    if (!friendship) return res.status(403).json({ error: 'Not friends' });

    const message = await prisma.chatMessage.create({
      data: { senderId: req.userId, receiverId: friendId, content },
    });

    res.json(serializeMessage(message));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark all messages from a friend as read
router.post('/:friendId/read', auth, async (req, res) => {
  try {
    const friendId = parseInt(req.params.friendId, 10);
    if (!Number.isFinite(friendId)) return res.status(400).json({ error: 'Invalid friend id' });

    const friendship = await assertFriendship(req.userId, friendId);
    if (!friendship) return res.status(403).json({ error: 'Not friends' });

    const result = await prisma.chatMessage.updateMany({
      where: { senderId: friendId, receiverId: req.userId, readAt: null },
      data: { readAt: new Date() },
    });

    res.json({ success: true, count: result.count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
