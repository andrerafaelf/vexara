import type { Request, Response } from 'express';
import prisma from '../lib/prisma.js';
import { logError, logInfo, logWarn } from '../utils/logger.js';
import { NOTIF, sendPushToUser } from '../utils/push.js';
import { notifyBadgeUpdate } from '../services/warRoomSocket.js';

interface KofiPayload {
  verification_token?: string;
  type?: string;
  email?: string;
  from_name?: string;
  amount?: string;
  kofi_transaction_id?: string;
  is_subscription_payment?: boolean;
  is_first_subscription_payment?: boolean;
}

export async function handleKofiWebhook(req: Request, res: Response): Promise<void> {
  // Always respond 200 quickly so Ko-fi doesn't retry. Surface failures via logs.
  try {
    const expectedToken = process.env.KOFI_VERIFICATION_TOKEN;
    if (!expectedToken) {
      logError('kofi_webhook_misconfigured', { message: 'KOFI_VERIFICATION_TOKEN not set' });
      res.status(200).json({ ok: true });
      return;
    }

    const raw = (req.body as { data?: unknown })?.data;
    if (typeof raw !== 'string') {
      logWarn('kofi_webhook_invalid_body', { reason: 'missing_data_field' });
      res.status(200).json({ ok: true });
      return;
    }

    let payload: KofiPayload;
    try {
      payload = JSON.parse(raw) as KofiPayload;
    } catch {
      logWarn('kofi_webhook_invalid_body', { reason: 'data_not_json' });
      res.status(200).json({ ok: true });
      return;
    }

    if (payload.verification_token !== expectedToken) {
      logWarn('kofi_webhook_bad_token', { type: payload.type });
      res.status(200).json({ ok: true });
      return;
    }

    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
    if (!email) {
      logWarn('kofi_webhook_no_email', { transactionId: payload.kofi_transaction_id, type: payload.type });
      res.status(200).json({ ok: true });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, username: true, isSupporter: true },
    });

    if (!user) {
      logWarn('kofi_webhook_no_user_match', {
        transactionId: payload.kofi_transaction_id,
        type: payload.type,
        fromName: payload.from_name,
        amount: payload.amount,
      });
      res.status(200).json({ ok: true });
      return;
    }

    if (!user.isSupporter) {
      await prisma.user.update({
        where: { id: user.id },
        data: { isSupporter: true, supporterSince: new Date() },
      });
      logInfo('kofi_supporter_granted', {
        userId: user.id,
        username: user.username,
        type: payload.type,
        amount: payload.amount,
        transactionId: payload.kofi_transaction_id,
      });
    } else {
      logInfo('kofi_supporter_recurring', {
        userId: user.id,
        type: payload.type,
        amount: payload.amount,
        transactionId: payload.kofi_transaction_id,
      });
    }

    // Grant one supporter token per donation, idempotent on kofi_transaction_id.
    // milestone=0 is reserved for Ko-fi grants; the unique index on kofiTransactionId
    // is what dedupes webhook retries.
    const txId = typeof payload.kofi_transaction_id === 'string' ? payload.kofi_transaction_id.slice(0, 64) : null;
    if (txId) {
      try {
        const created = await prisma.milestoneToken.create({
          data: {
            userId: user.id,
            milestone: 0,
            rewardType: 'kofi',
            rewardMeta: { amount: payload.amount ?? null, type: payload.type ?? null },
            kofiTransactionId: txId,
          },
        });
        void sendPushToUser(user.id, NOTIF.TOKEN_GRANTED, {
          title: 'Supporter token granted',
          body: 'Thanks for backing Vexara! 1 token added to your Profile, plus the supporter glow on your name.',
          tag: `token-kofi-${txId}`,
          data: { url: '/profile' },
        });
        notifyBadgeUpdate(user.id);
        logInfo('kofi_token_granted', { userId: user.id, tokenId: created.id, transactionId: txId });
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === 'P2002') {
          // Duplicate webhook delivery — safe no-op.
          logInfo('kofi_token_duplicate', { userId: user.id, transactionId: txId });
        } else {
          logError('kofi_token_grant_error', { userId: user.id, message: (err as Error).message });
        }
      }
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    logError('kofi_webhook_error', { message: (error as Error).message });
    res.status(200).json({ ok: true });
  }
}
