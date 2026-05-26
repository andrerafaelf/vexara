import type { Response } from 'express';
import prisma from '../lib/prisma.js';
import * as chatService from '../services/chatService.js';
import { notifyBadgeUpdate } from '../services/warRoomSocket.js';
import type { AuthRequest } from '../types/index.js';
import { logError } from '../utils/logger.js';
import { containsBlockedChatWord } from '../utils/profanity.js';
import { NOTIF, sendPushToUser } from '../utils/push.js';
import { avatarUrl, avatarUrlSm } from '../lib/r2.js';

const MAX_MESSAGE_LENGTH = 2000;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

function serializeMessage(m: { id: number; senderId: number; receiverId: number; content: string; createdAt: Date; readAt: Date | null }) {
  return { id: String(m.id), senderId: String(m.senderId), receiverId: String(m.receiverId), content: m.content, createdAt: m.createdAt, readAt: m.readAt };
}

export async function listConversations(req: AuthRequest, res: Response): Promise<void> {
  try {
    const friendships = await chatService.getFriendships(req.userId);
    const friends = friendships.map((f) => (f.userAId === req.userId ? f.userB : f.userA));
    const summaries = await chatService.getConversationSummaries(req.userId, friends.map((f) => f.id));

    const conversations = friends.map((friend) => {
      const s = summaries.get(friend.id);
      return {
        friendId: String(friend.id),
        username: friend.username,
        isSupporter: friend.isSupporter,
        supporterTier: friend.supporterTier,
        avatarUrl: avatarUrl(friend.id, friend.avatarKey),
        avatarUrlSm: avatarUrlSm(friend.id, friend.avatarKey),
        lastMessage: s?.lastMessage ? serializeMessage(s.lastMessage) : null,
        unreadCount: s?.unreadCount ?? 0,
      };
    });

    conversations.sort((a, b) => {
      const ta = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
      const tb = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
      return tb - ta;
    });
    res.json(conversations);
  } catch (error) {
    logError('unhandled_controller_error', { message: (error as Error).message, file: 'chatController.ts' });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getUnreadCount(req: AuthRequest, res: Response): Promise<void> {
  try {
    const count = await chatService.getTotalUnreadCount(req.userId);
    res.json({ count });
  } catch (error) {
    logError('unhandled_controller_error', { message: (error as Error).message, file: 'chatController.ts' });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getMessages(req: AuthRequest, res: Response): Promise<void> {
  try {
    const friendId = parseInt(req.params.friendId, 10);
    if (!Number.isFinite(friendId)) { res.status(400).json({ error: 'Invalid friend id' }); return; }
    const friendship = await chatService.assertFriendship(req.userId, friendId);
    if (!friendship) { res.status(403).json({ error: 'Not friends' }); return; }
    const limit = Math.min(parseInt(String(req.query.limit), 10) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const before = req.query.before ? parseInt(String(req.query.before), 10) : null;
    const messages = await chatService.getMessages(req.userId, friendId, limit, before);
    res.json(messages.reverse().map(serializeMessage));
  } catch (error) {
    logError('unhandled_controller_error', { message: (error as Error).message, file: 'chatController.ts' });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function sendMessage(req: AuthRequest, res: Response): Promise<void> {
  try {
    const friendId = parseInt(req.params.friendId, 10);
    if (!Number.isFinite(friendId)) { res.status(400).json({ error: 'Invalid friend id' }); return; }
    const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
    if (!content) { res.status(400).json({ error: 'Empty message' }); return; }
    if (content.length > MAX_MESSAGE_LENGTH) { res.status(400).json({ error: `Message too long (max ${MAX_MESSAGE_LENGTH} chars)` }); return; }
    if (containsBlockedChatWord(content)) { res.status(400).json({ error: 'Message contains prohibited language.' }); return; }
    const friendship = await chatService.assertFriendship(req.userId, friendId);
    if (!friendship) { res.status(403).json({ error: 'Not friends' }); return; }
    const message = await chatService.createMessage(req.userId, friendId, content);
    notifyBadgeUpdate(friendId);

    const sender = await prisma.user.findUnique({ where: { id: req.userId }, select: { username: true } });
    const preview = content.length > 80 ? `${content.slice(0, 80)}…` : content;
    void sendPushToUser(friendId, NOTIF.FRIEND_MESSAGE, {
      title: `New message from ${sender?.username ?? 'a friend'}`,
      body: preview,
      tag: `friend-message-${req.userId}`,
      data: { url: '/allies' },
    });

    res.json(serializeMessage(message));
  } catch (error) {
    logError('unhandled_controller_error', { message: (error as Error).message, file: 'chatController.ts' });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function markRead(req: AuthRequest, res: Response): Promise<void> {
  try {
    const friendId = parseInt(req.params.friendId, 10);
    if (!Number.isFinite(friendId)) { res.status(400).json({ error: 'Invalid friend id' }); return; }
    const friendship = await chatService.assertFriendship(req.userId, friendId);
    if (!friendship) { res.status(403).json({ error: 'Not friends' }); return; }
    const result = await chatService.markMessagesRead(friendId, req.userId);
    res.json({ success: true, count: result.count });
  } catch (error) {
    logError('unhandled_controller_error', { message: (error as Error).message, file: 'chatController.ts' });
    res.status(500).json({ error: 'Internal server error' });
  }
}
