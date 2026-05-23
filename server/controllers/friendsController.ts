import type { Response } from 'express';
import prisma from '../lib/prisma.js';
import * as chatService from '../services/chatService.js';
import * as friendsService from '../services/friendsService.js';
import { notifyBadgeUpdate, notifyFriendsUpdate } from '../services/warRoomSocket.js';
import type { AuthRequest } from '../types/index.js';
import { logError } from '../utils/logger.js';
import { NOTIF, sendPushToUser } from '../utils/push.js';

function serializeFriend(user: { id: number; username: string; isSupporter: boolean }, friendshipCreatedAt: Date, points: number | undefined) {
  return { id: String(user.id), username: user.username, isSupporter: user.isSupporter, points: points ?? 0, friendsSince: friendshipCreatedAt };
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
    logError('unhandled_controller_error', { message: (error as Error).message, file: 'friendsController.ts' });
    res.status(500).json({ error: 'Internal server error' });
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
      notifyBadgeUpdate(target.id);
      notifyBadgeUpdate(req.userId);
      try { notifyFriendsUpdate(target.id); notifyFriendsUpdate(req.userId); }
      catch (emitErr) { logError('friends_emit_failed', { message: (emitErr as Error).message, op: 'sendFriendRequest:autoAccept' }); }
      res.json({ success: true, autoAccepted: true }); return;
    }
    const mine = await friendsService.getPendingRequestBetween(req.userId, target.id);
    if (mine) { res.status(400).json({ error: 'Friend request already pending' }); return; }
    await friendsService.createFriendRequest(req.userId, target.id);
    // Notify the target that they have a new incoming friend request.
    notifyBadgeUpdate(target.id);
    try { notifyFriendsUpdate(target.id); notifyFriendsUpdate(req.userId); }
    catch (emitErr) { logError('friends_emit_failed', { message: (emitErr as Error).message, op: 'sendFriendRequest' }); }

    const sender = await prisma.user.findUnique({ where: { id: req.userId }, select: { username: true } });
    void sendPushToUser(target.id, NOTIF.FRIEND_REQUEST, {
      title: 'New friend request',
      body: `${sender?.username ?? 'A commander'} wants to be friends.`,
      tag: `friend-request-${req.userId}`,
      data: { url: '/allies' },
    });

    res.json({ success: true });
  } catch (error) {
    logError('unhandled_controller_error', { message: (error as Error).message, file: 'friendsController.ts' });
    res.status(500).json({ error: 'Internal server error' });
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
    logError('unhandled_controller_error', { message: (error as Error).message, file: 'friendsController.ts' });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function listRequests(req: AuthRequest, res: Response): Promise<void> {
  try {
    const [incoming, outgoing] = await friendsService.getPendingRequests(req.userId);
    res.json({
      incoming: incoming.map((r) => ({ id: String(r.id), userId: String(r.sender.id), username: r.sender.username, isSupporter: r.sender.isSupporter, createdAt: r.createdAt })),
      outgoing: outgoing.map((r) => ({ id: String(r.id), userId: String(r.receiver.id), username: r.receiver.username, isSupporter: r.receiver.isSupporter, createdAt: r.createdAt })),
    });
  } catch (error) {
    logError('unhandled_controller_error', { message: (error as Error).message, file: 'friendsController.ts' });
    res.status(500).json({ error: 'Internal server error' });
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
    // Both users' badge counts change when a request is accepted.
    notifyBadgeUpdate(reqRow.senderId);
    notifyBadgeUpdate(reqRow.receiverId);
    try { notifyFriendsUpdate(reqRow.senderId); notifyFriendsUpdate(reqRow.receiverId); }
    catch (emitErr) { logError('friends_emit_failed', { message: (emitErr as Error).message, op: 'acceptRequest' }); }
    res.json({ success: true });
  } catch (error) {
    logError('unhandled_controller_error', { message: (error as Error).message, file: 'friendsController.ts' });
    res.status(500).json({ error: 'Internal server error' });
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
    try { notifyFriendsUpdate(reqRow.senderId); notifyFriendsUpdate(reqRow.receiverId); }
    catch (emitErr) { logError('friends_emit_failed', { message: (emitErr as Error).message, op: 'declineRequest' }); }
    res.json({ success: true });
  } catch (error) {
    logError('unhandled_controller_error', { message: (error as Error).message, file: 'friendsController.ts' });
    res.status(500).json({ error: 'Internal server error' });
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
    try { notifyFriendsUpdate(reqRow.senderId); notifyFriendsUpdate(reqRow.receiverId); }
    catch (emitErr) { logError('friends_emit_failed', { message: (emitErr as Error).message, op: 'cancelRequest' }); }
    res.json({ success: true });
  } catch (error) {
    logError('unhandled_controller_error', { message: (error as Error).message, file: 'friendsController.ts' });
    res.status(500).json({ error: 'Internal server error' });
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
    try { notifyFriendsUpdate(req.userId); notifyFriendsUpdate(friendId); }
    catch (emitErr) { logError('friends_emit_failed', { message: (emitErr as Error).message, op: 'unfriend' }); }
    res.json({ success: true });
  } catch (error) {
    logError('unhandled_controller_error', { message: (error as Error).message, file: 'friendsController.ts' });
    res.status(500).json({ error: 'Internal server error' });
  }
}
