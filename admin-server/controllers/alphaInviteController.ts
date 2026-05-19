import type { Request, Response } from 'express';

const SEND_DELAY_MS = 150; // ~6/sec, well under Resend free tier 10/sec.

let inFlight = false;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function getAlphaInviteStatus(_req: Request, res: Response): Promise<void> {
  try {
    const { default: prisma } = await import('../../server/lib/prisma.js');
    const [total, invited, unsubscribed, eligible] = await Promise.all([
      prisma.alphaSignup.count(),
      prisma.alphaSignup.count({ where: { invitedAt: { not: null } } }),
      prisma.alphaSignup.count({ where: { unsubscribedAt: { not: null } } }),
      prisma.alphaSignup.count({ where: { invitedAt: null, unsubscribedAt: null } }),
    ]);
    res.json({ total, invited, unsubscribed, eligible, inFlight });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}

export async function blastAlphaInvite(_req: Request, res: Response): Promise<void> {
  if (inFlight) {
    res.status(409).json({ error: 'A blast is already running.' });
    return;
  }
  inFlight = true;

  try {
    const { default: prisma } = await import('../../server/lib/prisma.js');
    const { sendAlphaInviteAnnouncement } = await import('../../server/services/emailService.js');

    const eligible = await prisma.alphaSignup.findMany({
      where: { invitedAt: null, unsubscribedAt: null },
      select: { id: true, email: true },
      orderBy: { id: 'asc' },
    });

    let sent = 0;
    const failed: Array<{ email: string; error: string }> = [];

    for (const row of eligible) {
      try {
        await sendAlphaInviteAnnouncement(row.email);
        await prisma.alphaSignup.update({
          where: { id: row.id },
          data: { invitedAt: new Date() },
        });
        sent += 1;
      } catch (err) {
        failed.push({ email: row.email, error: (err as Error).message });
        console.error('[alpha-invite-blast] send failed for', row.email, err);
      }
      await sleep(SEND_DELAY_MS);
    }

    res.json({ ok: true, attempted: eligible.length, sent, failed });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  } finally {
    inFlight = false;
  }
}
