import type { Response } from 'express';
import * as chatService from '../services/chatService.js';
import * as friendsService from '../services/friendsService.js';
import type { AuthRequest } from '../types/index.js';

function serializeFriend(user: { id: number; username: string }, friendshipCreatedAt: Date, points: number | undefined) {
  return { id: String(user.id), username: user.username, points: points ?? 0, friendsSince: friendshipCreatedAt };
}

export async function listFriends(req: AuthRequest, res: Response): Promise<void> {
  try {
    const friendships = await friendsService.getFriendships(req.userId);
    const friendUsers = friendships.map((f) => (f.userAId === req.userId ? f.userB : f.userA));
    const friendPlayers = await friendsService.getFriendPlayers(req.galaxyId, friendUsers.map((u) => u.id));
    const pointsByUserId = new Map(friendPlayers.map((p) => [p.userId, p.points]));
    const friends = friendships.map((f) => {
      const friend = f.userAId === req.userId ? f.userB : f.userA;
      return serializeFriend(friend, f.createdAt, pointsByUserId.get(friend.id));
    });
    res.json(friends);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}

export async function sendFriendRequest(req: AuthRequest, res: Response): Promise<void> {
  try {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    if (!username) { res.status(400).json({ error: 'Username required' }); return; }
    const target = await friendsService.getUserByUsername(username);
    if (!target) { res.status(404).json({ error: 'User not found' }); return; }
    if (target.id === req.userId) { res.status(400).json({ error: "Can't friend yourself" }); return; }
    const { userAId, userBId } = friendsService.pairKey(req.userId, target.id);
    const existing = await friendsService.getFriendship(userAId, userBId);
    if (existing) { res.status(400).json({ error: 'Already friends' }); return; }
    const reverse = await friendsService.getPendingRequestBetween(target.id, req.userId);
    if (reverse) {
      await friendsService.autoAcceptRequest(reverse.id, userAId, userBId);
      res.json({ success: true, autoAccepted: true }); return;
    }
    const mine = await friendsService.getPendingRequestBetween(req.userId, target.id);
    if (mine) { res.status(400).json({ error: 'Friend request already pending' }); return; }
    await friendsService.createFriendRequest(req.userId, target.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}

export async function getBadges(req: AuthRequest, res: Response): Promise<void> {
  try {
    const [incoming, unreadChat] = await Promise.all([
      friendsService.countIncomingRequests(req.userId),
      chatService.getTotalUnreadCount(req.userId),
    ]);
    res.json({ incomingRequests: incoming, unreadChat });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}

export async function listRequests(req: AuthRequest, res: Response): Promise<void> {
  try {
    const [incoming, outgoing] = await friendsService.getPendingRequests(req.userId);
    res.json({
      incoming: incoming.map((r) => ({ id: String(r.id), userId: String(r.sender.id), username: r.sender.username, createdAt: r.createdAt })),
      outgoing: outgoing.map((r) => ({ id: String(r.id), userId: String(r.receiver.id), username: r.receiver.username, createdAt: r.createdAt })),
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}

export async function acceptRequest(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) { res.status(400).json({ error: 'Invalid id' }); return; }
    const reqRow = await friendsService.getFriendRequestById(id);
    if (!reqRow || reqRow.receiverId !== req.userId) { res.status(404).json({ error: 'Request not found' }); return; }
    if (reqRow.status !== 'pending') { res.status(400).json({ error: 'Request is not pending' }); return; }
    const { userAId, userBId } = friendsService.pairKey(reqRow.senderId, reqRow.receiverId);
    await friendsService.acceptRequest(id, userAId, userBId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}

export async function declineRequest(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) { res.status(400).json({ error: 'Invalid id' }); return; }
    const reqRow = await friendsService.getFriendRequestById(id);
    if (!reqRow || reqRow.receiverId !== req.userId) { res.status(404).json({ error: 'Request not found' }); return; }
    if (reqRow.status !== 'pending') { res.status(400).json({ error: 'Request is not pending' }); return; }
    await friendsService.updateRequestStatus(id, 'declined');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}

export async function cancelRequest(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) { res.status(400).json({ error: 'Invalid id' }); return; }
    const reqRow = await friendsService.getFriendRequestById(id);
    if (!reqRow || reqRow.senderId !== req.userId) { res.status(404).json({ error: 'Request not found' }); return; }
    if (reqRow.status !== 'pending') { res.status(400).json({ error: 'Request is not pending' }); return; }
    await friendsService.updateRequestStatus(id, 'cancelled');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}

export async function unfriend(req: AuthRequest, res: Response): Promise<void> {
  try {
    const friendId = parseInt(req.params.friendId, 10);
    if (!Number.isFinite(friendId)) { res.status(400).json({ error: 'Invalid id' }); return; }
    const { userAId, userBId } = friendsService.pairKey(req.userId, friendId);
    const friendship = await friendsService.getFriendship(userAId, userBId);
    if (!friendship) { res.status(404).json({ error: 'Not friends' }); return; }
    await friendsService.deleteFriendship(friendship.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}
