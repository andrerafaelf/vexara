import prisma from '../lib/prisma.js';
import { sendGalaxyAlert, sendGalaxyLive } from './emailService.js';
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
	const [users, signups, optedOut] = await Promise.all([
		prisma.user.findMany({
			where: { emailVerifiedAt: { not: null } },
			select: { email: true, username: true }
		}),
		prisma.alphaSignup.findMany({
			where: { unsubscribedAt: null },
			select: { email: true }
		}),
		// AlphaSignup is the single source of truth for email opt-outs (see
		// getOrCreateUnsubscribeToken in emailService). A registered user who
		// unsubscribes gets an AlphaSignup row with unsubscribedAt set, so we must
		// honor it for the `users` branch too — otherwise their unsubscribe is
		// silently ignored and they keep receiving broadcasts (PECR/GDPR breach).
		prisma.alphaSignup.findMany({
			where: { unsubscribedAt: { not: null } },
			select: { email: true }
		})
	]);

	const optedOutEmails = new Set(optedOut.map((s) => s.email.trim().toLowerCase()));
	const byEmail = new Map<string, BroadcastRecipient>();

	for (const u of users) {
		const key = u.email.trim().toLowerCase();
		if (!key || optedOutEmails.has(key)) continue;
		byEmail.set(key, { email: u.email, displayName: u.username, source: 'user' });
	}

	for (const s of signups) {
		const key = s.email.trim().toLowerCase();
		if (!key || optedOutEmails.has(key)) continue;
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

// Send launch-alert emails to everyone who opted in for a specific galaxy,
// then mark each row sentAt so re-runs skip already-notified addresses.
export async function broadcastGalaxyAlert(
	galaxyId: number,
	options: BroadcastOptions = {}
): Promise<BroadcastResult> {
	const ratePerSecond = Math.max(1, options.ratePerSecond ?? 2);
	const abortThreshold = options.abortAfterConsecutiveFailures ?? 10;
	const minIntervalMs = Math.ceil(1000 / ratePerSecond);
	const startedAt = Date.now();

	const galaxy = await prisma.galaxy.findUnique({ where: { id: galaxyId } });
	if (!galaxy) throw new Error(`Galaxy ${galaxyId} not found`);
	if (!galaxy.startsAt) throw new Error(`Galaxy ${galaxyId} has no startsAt set`);

	// Only unsent alerts for this galaxy
	const alerts = await prisma.galaxyAlert.findMany({
		where: { galaxyId, sentAt: null }
	});

	// Resolve display names for registered users
	const emails = alerts.map((a) => a.email);
	const users = await prisma.user.findMany({
		where: { email: { in: emails } },
		select: { email: true, username: true }
	});
	const nameByEmail = new Map(users.map((u) => [u.email.toLowerCase(), u.username]));

	logInfo('broadcast_galaxy_alert_start', {
		galaxyId,
		total: alerts.length,
		ratePerSecond,
		dryRun: !!options.dryRun
	});

	const result: BroadcastResult = {
		total: alerts.length,
		sent: 0,
		failed: 0,
		skipped: 0,
		failures: [],
		durationMs: 0
	};

	if (options.dryRun) {
		result.skipped = alerts.length;
		result.durationMs = Date.now() - startedAt;
		return result;
	}

	let consecutiveFailures = 0;

	for (let i = 0; i < alerts.length; i++) {
		const alert = alerts[i];
		const displayName = nameByEmail.get(alert.email.toLowerCase());
		const tickStart = Date.now();
		try {
			await sendGalaxyAlert(alert.email, galaxy.name, galaxy.startsAt, displayName);
			await prisma.galaxyAlert.update({
				where: { id: alert.id },
				data: { sentAt: new Date() }
			});
			result.sent++;
			consecutiveFailures = 0;
		} catch (err) {
			if (isRateLimitError(err)) {
				logWarn('broadcast_galaxy_alert_rate_limited', { email: alert.email });
				await sleep(2000);
				try {
					await sendGalaxyAlert(alert.email, galaxy.name, galaxy.startsAt, displayName);
					await prisma.galaxyAlert.update({
						where: { id: alert.id },
						data: { sentAt: new Date() }
					});
					result.sent++;
					consecutiveFailures = 0;
				} catch (retryErr) {
					result.failed++;
					consecutiveFailures++;
					result.failures.push({ email: alert.email, error: (retryErr as Error).message });
				}
			} else {
				result.failed++;
				consecutiveFailures++;
				result.failures.push({ email: alert.email, error: (err as Error).message });
			}
		}

		if (consecutiveFailures >= abortThreshold) {
			logError('broadcast_galaxy_alert_aborted', { consecutiveFailures, sentSoFar: result.sent });
			result.skipped = alerts.length - (i + 1);
			break;
		}

		const elapsed = Date.now() - tickStart;
		if (elapsed < minIntervalMs && i < alerts.length - 1) {
			await sleep(minIntervalMs - elapsed);
		}
	}

	result.durationMs = Date.now() - startedAt;
	logInfo('broadcast_galaxy_alert_done', {
		galaxyId,
		total: result.total,
		sent: result.sent,
		failed: result.failed,
		skipped: result.skipped,
		durationMs: result.durationMs
	});
	return result;
}
