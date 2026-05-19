import type { Request, Response } from 'express';
import prisma from '../lib/prisma.js';
import { sendAlphaWelcome } from '../services/emailService.js';
import { validateEmail } from '../utils/validation.js';

function extractEmail(req: Request): string | null {
  const fromQuery = typeof req.query?.email === 'string' ? req.query.email : '';
  const fromBody =
    req.body && typeof (req.body as { email?: unknown }).email === 'string'
      ? ((req.body as { email: string }).email)
      : '';
  const raw = fromQuery || fromBody;
  if (!validateEmail(raw)) return null;
  return raw.trim().toLowerCase();
}

function renderConfirmation(email: string): string {
  const safeEmail = email.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Unsubscribed</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{margin:0;background:#0b0d12;color:#e6e8ee;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;}
  .card{max-width:480px;background:#11141b;border-radius:12px;padding:32px;}
  h1{margin:0 0 12px;font-size:20px;color:#fff;}
  p{margin:0 0 12px;line-height:1.55;color:#c8ccd6;}
  a{color:#7aa2ff;}
</style></head>
<body><div class="card">
  <h1>You're unsubscribed</h1>
  <p>${safeEmail} will no longer receive Vexara alpha emails.</p>
  <p>Changed your mind? <a href="https://vexara.world">Re-join the alpha list</a>.</p>
</div></body></html>`;
}

export async function unsubscribe(req: Request, res: Response): Promise<void> {
  try {
    const email = extractEmail(req);
    if (!email) {
      if (req.method === 'POST') {
        res.status(400).json({ error: 'Invalid email' });
      } else {
        res.status(400).send('Invalid email');
      }
      return;
    }

    await prisma.alphaSignup.updateMany({
      where: { email, unsubscribedAt: null },
      data: { unsubscribedAt: new Date() },
    });

    // RFC 8058 one-click POST: respond 200 with no body so mail clients mark success.
    if (req.method === 'POST') {
      res.status(200).json({ ok: true });
      return;
    }

    res.status(200).type('html').send(renderConfirmation(email));
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}

// TODO(launch): remove this test endpoint before opening signups.
export async function sendTestAlphaEmail(_req: Request, res: Response): Promise<void> {
  const recipients = [
    'andrerafaelff@gmail.com',
    'test-unnph4w1f@srv1.mail-tester.com',
  ];
  const results = await Promise.allSettled(recipients.map((to) => sendAlphaWelcome(to)));
  const sent = recipients.filter((_, i) => results[i].status === 'fulfilled');
  const failed = results
    .map((r, i) => (r.status === 'rejected' ? { to: recipients[i], error: (r.reason as Error).message } : null))
    .filter((v): v is { to: string; error: string } => v !== null);

  if (failed.length === 0) {
    res.json({ ok: true, sentTo: sent });
    return;
  }
  res.status(failed.length === recipients.length ? 500 : 207).json({ ok: false, sentTo: sent, failed });
}
