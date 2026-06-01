import prisma from '../lib/prisma.js';
import { sendGalaxyLive } from './emailService.js';
import { logError, logInfo, logWarn } from '../utils/logger.js';

export interface BroadcastRecipient {
	email: string;
	displayName?: string;
	source: 'user' | 'alphaSignup';
}

export interface BroadcastResult {
	total: number;
	sent: number;
	failed: number;
	skipped: number;
	failures: Array<{ email: string; error: string }>;
	durationMs: number;
}

export async function collectGalaxyLiveRecipients(): Promise<BroadcastRecipient[]> {
	const [users, signups] = await Promise.all([
		prisma.user.findMany({
			where: { emailVerifiedAt: { not: null } },
			select: { email: true, username: true }
		}),
		prisma.alphaSignup.findMany({
			where: { unsubscribedAt: null },
			select: { email: true }
		})
	]);

	const byEmail = new Map<string, BroadcastRecipient>();

	for (const u of users) {
		const key = u.email.trim().toLowerCase();
		if (!key) continue;
		byEmail.set(key, { email: u.email, displayName: u.username, source: 'user' });
	}

	for (const s of signups) {
		const key = s.email.trim().toLowerCase();
		if (!key) continue;
		if (byEmail.has(key)) continue;
		byEmail.set(key, { email: s.email, source: 'alphaSignup' });
	}

	return Array.from(byEmail.values());
}

async function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(err: unknown): boolean {
	const msg = (err as Error)?.message ?? '';
	return /429|rate.?limit|too many/i.test(msg);
}

export interface BroadcastOptions {
	// Caps per-second sends. Resend free tier = 2/s, paid = 10/s. Default 2/s to stay safe.
	ratePerSecond?: number;
	// Stop early if this many consecutive sends fail (likely API key/config issue).
	abortAfterConsecutiveFailures?: number;
	dryRun?: boolean;
}

export async function broadcastGalaxyLive(
	options: BroadcastOptions = {}
): Promise<BroadcastResult> {
	const ratePerSecond = Math.max(1, options.ratePerSecond ?? 2);
	const abortThreshold = options.abortAfterConsecutiveFailures ?? 10;
	const minIntervalMs = Math.ceil(1000 / ratePerSecond);
	const startedAt = Date.now();

	const recipients = await collectGalaxyLiveRecipients();
	logInfo('broadcast_galaxy_live_start', {
		total: recipients.length,
		ratePerSecond,
		dryRun: !!options.dryRun
	});

	const result: BroadcastResult = {
		total: recipients.length,
		sent: 0,
		failed: 0,
		skipped: 0,
		failures: [],
		durationMs: 0
	};

	if (options.dryRun) {
		result.skipped = recipients.length;
		result.durationMs = Date.now() - startedAt;
		return result;
	}

	let consecutiveFailures = 0;

	for (let i = 0; i < recipients.length; i++) {
		const r = recipients[i];
		const tickStart = Date.now();
		try {
			await sendGalaxyLive(r.email, r.displayName);
			result.sent++;
			consecutiveFailures = 0;
		} catch (err) {
			if (isRateLimitError(err)) {
				// Back off and retry once.
				logWarn('broadcast_galaxy_live_rate_limited', { email: r.email });
				await sleep(2000);
				try {
					await sendGalaxyLive(r.email, r.displayName);
					result.sent++;
					consecutiveFailures = 0;
				} catch (retryErr) {
					result.failed++;
					consecutiveFailures++;
					result.failures.push({ email: r.email, error: (retryErr as Error).message });
				}
			} else {
				result.failed++;
				consecutiveFailures++;
				result.failures.push({ email: r.email, error: (err as Error).message });
			}
		}

		if (consecutiveFailures >= abortThreshold) {
			logError('broadcast_galaxy_live_aborted', { consecutiveFailures, sentSoFar: result.sent });
			result.skipped = recipients.length - (i + 1);
			break;
		}

		// Pace the loop so we never exceed ratePerSecond.
		const elapsed = Date.now() - tickStart;
		if (elapsed < minIntervalMs && i < recipients.length - 1) {
			await sleep(minIntervalMs - elapsed);
		}
	}

	result.durationMs = Date.now() - startedAt;
	logInfo('broadcast_galaxy_live_done', {
		total: result.total,
		sent: result.sent,
		failed: result.failed,
		skipped: result.skipped,
		durationMs: result.durationMs
	});
	return result;
}
