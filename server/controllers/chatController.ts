import type { Response } from 'express';
import * as chatService from '../services/chatService.js';
import type { AuthRequest } from '../types/index.js';

const MAX_MESSAGE_LENGTH = 2000;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

function serializeMessage(m: { id: number; senderId: number; receiverId: number; content: string; createdAt: Date; readAt: Date | null }) {
  return { id: String(m.id), senderId: String(m.senderId), receiverId: String(m.receiverId), content: m.content, createdAt: m.createdAt, readAt: m.readAt };
}

export async function listConversations(req: AuthRequest, res: Response): Promise<void> {
  try {
    const friendships = await chatService.getFriendships(req.userId);
    const conversations = await Promise.all(
      friendships.map(async (f) => {
        const friend = f.userAId === req.userId ? f.userB : f.userA;
        const [lastMessage, unreadCount] = await Promise.all([
          chatService.getLastMessage(req.userId, friend.id),
          chatService.getUnreadCount(friend.id, req.userId),
        ]);
        return { friendId: String(friend.id), username: friend.username, lastMessage: lastMessage ? serializeMessage(lastMessage) : null, unreadCount };
      }),
    );
    conversations.sort((a, b) => {
      const ta = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
      const tb = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
      return tb - ta;
    });
    res.json(conversations);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}

export async function getUnreadCount(req: AuthRequest, res: Response): Promise<void> {
  try {
    const count = await chatService.getTotalUnreadCount(req.userId);
    res.json({ count });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
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
    res.status(500).json({ error: (error as Error).message });
  }
}

export async function sendMessage(req: AuthRequest, res: Response): Promise<void> {
  try {
    const friendId = parseInt(req.params.friendId, 10);
    if (!Number.isFinite(friendId)) { res.status(400).json({ error: 'Invalid friend id' }); return; }
    const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
    if (!content) { res.status(400).json({ error: 'Empty message' }); return; }
    if (content.length > MAX_MESSAGE_LENGTH) { res.status(400).json({ error: `Message too long (max ${MAX_MESSAGE_LENGTH} chars)` }); return; }
    const friendship = await chatService.assertFriendship(req.userId, friendId);
    if (!friendship) { res.status(403).json({ error: 'Not friends' }); return; }
    const message = await chatService.createMessage(req.userId, friendId, content);
    res.json(serializeMessage(message));
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
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
    res.status(500).json({ error: (error as Error).message });
  }
}
