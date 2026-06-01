import type { Request, Response } from 'express';
import prisma from '../lib/prisma.js';
import { logError } from '../utils/logger.js';

function extractToken(req: Request): string | null {
	const fromQuery = typeof req.query?.token === 'string' ? req.query.token : '';
	const fromBody =
		req.body && typeof (req.body as { token?: unknown }).token === 'string'
			? (req.body as { token: string }).token
			: '';
	const raw = (fromQuery || fromBody).trim();
	// 32 random bytes hex-encoded → 64 chars. Allow 16–128 for flexibility.
	if (!raw || raw.length < 16 || raw.length > 128) return null;
	if (!/^[a-f0-9]+$/i.test(raw)) return null;
	return raw;
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

function renderInvalidLink(): string {
	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Invalid unsubscribe link</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{margin:0;background:#0b0d12;color:#e6e8ee;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;}
  .card{max-width:480px;background:#11141b;border-radius:12px;padding:32px;}
  h1{margin:0 0 12px;font-size:20px;color:#fff;}
  p{margin:0 0 12px;line-height:1.55;color:#c8ccd6;}
  a{color:#7aa2ff;}
</style></head>
<body><div class="card">
  <h1>Invalid or expired unsubscribe link</h1>
  <p>This link is missing or no longer valid. Please use the unsubscribe link from a recent Vexara email, or reply to any Vexara email asking to be removed.</p>
  <p><a href="https://vexara.world">Back to Vexara</a></p>
</div></body></html>`;
}

export async function unsubscribe(req: Request, res: Response): Promise<void> {
	try {
		const token = extractToken(req);
		if (!token) {
			if (req.method === 'POST') {
				res.status(400).json({ error: 'Invalid unsubscribe link' });
			} else {
				res.status(400).type('html').send(renderInvalidLink());
			}
			return;
		}

		const record = await prisma.alphaSignup.findUnique({
			where: { unsubscribeToken: token },
			select: { email: true }
		});

		if (!record) {
			if (req.method === 'POST') {
				res.status(400).json({ error: 'Invalid unsubscribe link' });
			} else {
				res.status(400).type('html').send(renderInvalidLink());
			}
			return;
		}

		await prisma.alphaSignup.update({
			where: { unsubscribeToken: token },
			data: { unsubscribedAt: new Date() }
		});

		// RFC 8058 one-click POST: respond 200 with no body so mail clients mark success.
		if (req.method === 'POST') {
			res.status(200).json({ ok: true });
			return;
		}

		res.status(200).type('html').send(renderConfirmation(record.email));
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'unsubscribeController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}
