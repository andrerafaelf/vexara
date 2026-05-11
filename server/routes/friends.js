import express from 'express';
import prisma from '../lib/prisma.js';
import auth from '../middleware/auth.js';

const router = express.Router();

function pairKey(a, b) {
  const [userAId, userBId] = a < b ? [a, b] : [b, a];
  return { userAId, userBId };
}

function serializeFriend(user, friendshipCreatedAt, points) {
  return {
    id: String(user.id),
    username: user.username,
    points: points ?? 0,
    friendsSince: friendshipCreatedAt,
  };
}

// List friends — friendships are global; points shown are the viewer's current galaxy
router.get('/', auth, async (req, res) => {
  try {
    const friendships = await prisma.friendship.findMany({
      where: { OR: [{ userAId: req.userId }, { userBId: req.userId }] },
      include: {
        userA: { select: { id: true, username: true } },
        userB: { select: { id: true, username: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const friendUsers = friendships.map((f) => (f.userAId === req.userId ? f.userB : f.userA));
    const friendIds = friendUsers.map((u) => u.id);
    const friendPlayers = friendIds.length
      ? await prisma.galaxyPlayer.findMany({
          where: { galaxyId: req.galaxyId, userId: { in: friendIds } },
          select: { userId: true, points: true },
        })
      : [];
    const pointsByUserId = new Map(friendPlayers.map((p) => [p.userId, p.points]));

    const friends = friendships.map((f) => {
      const friend = f.userAId === req.userId ? f.userB : f.userA;
      return serializeFriend(friend, f.createdAt, pointsByUserId.get(friend.id));
    });

    res.json(friends);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Send a friend request by username
router.post('/request', auth, async (req, res) => {
  try {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    if (!username) return res.status(400).json({ error: 'Username required' });

    const target = await prisma.user.findUnique({ where: { username } });
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.id === req.userId) return res.status(400).json({ error: "Can't friend yourself" });

    const { userAId, userBId } = pairKey(req.userId, target.id);
    const existing = await prisma.friendship.findUnique({ where: { userAId_userBId: { userAId, userBId } } });
    if (existing) return res.status(400).json({ error: 'Already friends' });

    // If target previously sent a pending request to me, auto-accept it.
    const reverse = await prisma.friendRequest.findFirst({
      where: { senderId: target.id, receiverId: req.userId, status: 'pending' },
    });
    if (reverse) {
      await prisma.$transaction([
        prisma.friendRequest.update({
          where: { id: reverse.id },
          data: { status: 'accepted', respondedAt: new Date() },
        }),
        prisma.friendship.create({ data: { userAId, userBId } }),
      ]);
      return res.json({ success: true, autoAccepted: true });
    }

    // Block duplicate pending request from me
    const mine = await prisma.friendRequest.findFirst({
      where: { senderId: req.userId, receiverId: target.id, status: 'pending' },
    });
    if (mine) return res.status(400).json({ error: 'Friend request already pending' });

    await prisma.friendRequest.create({
      data: { senderId: req.userId, receiverId: target.id },
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List incoming and outgoing pending requests
router.get('/requests', auth, async (req, res) => {
  try {
    const [incoming, outgoing] = await Promise.all([
      prisma.friendRequest.findMany({
        where: { receiverId: req.userId, status: 'pending' },
        include: { sender: { select: { id: true, username: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.friendRequest.findMany({
        where: { senderId: req.userId, status: 'pending' },
        include: { receiver: { select: { id: true, username: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    res.json({
      incoming: incoming.map((r) => ({
        id: String(r.id),
        userId: String(r.sender.id),
        username: r.sender.username,
        createdAt: r.createdAt,
      })),
      outgoing: outgoing.map((r) => ({
        id: String(r.id),
        userId: String(r.receiver.id),
        username: r.receiver.username,
        createdAt: r.createdAt,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Accept incoming request
router.post('/request/:id/accept', auth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });

    const reqRow = await prisma.friendRequest.findUnique({ where: { id } });
    if (!reqRow || reqRow.receiverId !== req.userId) {
      return res.status(404).json({ error: 'Request not found' });
    }
    if (reqRow.status !== 'pending') {
      return res.status(400).json({ error: 'Request is not pending' });
    }

    const { userAId, userBId } = pairKey(reqRow.senderId, reqRow.receiverId);

    await prisma.$transaction([
      prisma.friendRequest.update({
        where: { id },
        data: { status: 'accepted', respondedAt: new Date() },
      }),
      prisma.friendship.upsert({
        where: { userAId_userBId: { userAId, userBId } },
        create: { userAId, userBId },
        update: {},
      }),
    ]);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Decline incoming request
router.post('/request/:id/decline', auth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });

    const reqRow = await prisma.friendRequest.findUnique({ where: { id } });
    if (!reqRow || reqRow.receiverId !== req.userId) {
      return res.status(404).json({ error: 'Request not found' });
    }
    if (reqRow.status !== 'pending') {
      return res.status(400).json({ error: 'Request is not pending' });
    }

    await prisma.friendRequest.update({
      where: { id },
      data: { status: 'declined', respondedAt: new Date() },
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Cancel an outgoing pending request
router.post('/request/:id/cancel', auth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });

    const reqRow = await prisma.friendRequest.findUnique({ where: { id } });
    if (!reqRow || reqRow.senderId !== req.userId) {
      return res.status(404).json({ error: 'Request not found' });
    }
    if (reqRow.status !== 'pending') {
      return res.status(400).json({ error: 'Request is not pending' });
    }

    await prisma.friendRequest.update({
      where: { id },
      data: { status: 'cancelled', respondedAt: new Date() },
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Unfriend
router.delete('/:friendId', auth, async (req, res) => {
  try {
    const friendId = parseInt(req.params.friendId, 10);
    if (!Number.isFinite(friendId)) return res.status(400).json({ error: 'Invalid id' });

    const { userAId, userBId } = pairKey(req.userId, friendId);
    const friendship = await prisma.friendship.findUnique({
      where: { userAId_userBId: { userAId, userBId } },
    });
    if (!friendship) return res.status(404).json({ error: 'Not friends' });

    await prisma.friendship.delete({ where: { id: friendship.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
