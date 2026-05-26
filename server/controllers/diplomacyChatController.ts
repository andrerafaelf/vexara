import type { Response } from 'express';
import prisma from '../lib/prisma.js';
import type { AuthRequest } from '../types/index.js';
import { logError } from '../utils/logger.js';
import { containsBlockedChatWord } from '../utils/profanity.js';
import { notifyDiplomacyChat } from '../services/warRoomSocket.js';
import { avatarUrl, avatarUrlSm } from '../lib/r2.js';

function serializeDiplomacyMessage(m: {
  id: number;
  content: string;
  createdAt: Date;
  user: { id: number; username: string; isSupporter: boolean; supporterTier: string | null; avatarKey: string | null };
}) {
  return {
    id: m.id,
    content: m.content,
    createdAt: m.createdAt,
    user: {
      id: m.user.id,
      username: m.user.username,
      isSupporter: m.user.isSupporter,
      supporterTier: m.user.supporterTier,
      avatarUrl: avatarUrl(m.user.id, m.user.avatarKey),
      avatarUrlSm: avatarUrlSm(m.user.id, m.user.avatarKey),
    },
  };
}

const CHAT_PAGE_SIZE = 50;
const MSG_MAX = 1000;

async function getMemberFaction(userId: number, galaxyId: number) {
  return prisma.factionMember.findUnique({
    where: { userId_galaxyId: { userId, galaxyId } },
    select: { factionId: true },
  });
}

// Verify the user's faction is a party to the treaty and the treaty is active.
async function getTreatyForMember(treatyId: number, factionId: number, galaxyId: number) {
  return prisma.factionTreaty.findFirst({
    where: {
      id: treatyId,
      galaxyId,
      status: 'active',
      OR: [{ proposerFactionId: factionId }, { targetFactionId: factionId }],
    },
  });
}

export async function getDiplomacyMessages(req: AuthRequest, res: Response): Promise<void> {
  try {
    const treatyId = parseInt(req.params.treatyId, 10);
    if (!Number.isFinite(treatyId)) { res.status(400).json({ error: 'Invalid treatyId' }); return; }

    const member = await getMemberFaction(req.userId, req.galaxyId);
    if (!member) { res.status(403).json({ error: 'You are not in a faction' }); return; }

    const treaty = await getTreatyForMember(treatyId, member.factionId, req.galaxyId);
    if (!treaty) { res.status(403).json({ error: 'Treaty not found or not active' }); return; }

    const before = req.query.before ? parseInt(req.query.before as string, 10) : undefined;

    const messages = await prisma.diplomacyMessage.findMany({
      where: {
        treatyId,
        ...(before ? { id: { lt: before } } : {}),
      },
      select: {
        id: true,
        content: true,
        createdAt: true,
        user: { select: { id: true, username: true, isSupporter: true, supporterTier: true, avatarKey: true } },
      },
      orderBy: { id: 'desc' },
      take: CHAT_PAGE_SIZE,
    });

    res.json(messages.reverse().map(serializeDiplomacyMessage));
  } catch (error) {
    logError('unhandled_controller_error', { message: (error as Error).message, file: 'diplomacyChatController.ts' });
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function sendDiplomacyMessage(req: AuthRequest, res: Response): Promise<void> {
  try {
    const treatyId = parseInt(req.params.treatyId, 10);
    if (!Number.isFinite(treatyId)) { res.status(400).json({ error: 'Invalid treatyId' }); return; }

    const { content } = req.body as { content?: string };
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      res.status(400).json({ error: 'Message cannot be empty' }); return;
    }
    if (content.trim().length > MSG_MAX) {
      res.status(400).json({ error: `Message must be ${MSG_MAX} characters or less` }); return;
    }
    if (containsBlockedChatWord(content.trim())) {
      res.status(400).json({ error: 'Message contains prohibited language.' }); return;
    }

    const member = await getMemberFaction(req.userId, req.galaxyId);
    if (!member) { res.status(403).json({ error: 'You are not in a faction' }); return; }

    const treaty = await getTreatyForMember(treatyId, member.factionId, req.galaxyId);
    if (!treaty) { res.status(403).json({ error: 'Treaty not found or not active' }); return; }

    const message = await prisma.diplomacyMessage.create({
      data: { treatyId, userId: req.userId, content: content.trim() },
      select: {
        id: true,
        content: true,
        createdAt: true,
        user: { select: { id: true, username: true, isSupporter: true, supporterTier: true, avatarKey: true } },
      },
    });

    const serialized = serializeDiplomacyMessage(message);
    // Push to both faction rooms involved in the treaty.
    notifyDiplomacyChat(treaty.proposerFactionId, treaty.targetFactionId, treatyId, serialized);

    res.status(201).json(serialized);
  } catch (error) {
    logError('unhandled_controller_error', { message: (error as Error).message, file: 'diplomacyChatController.ts' });
    res.status(500).json({ error: 'Internal server error' });
  }
}
