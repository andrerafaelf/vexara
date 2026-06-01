import prisma from '../lib/prisma.js';
import { logInfo } from './logger.js';
import { sendPushToUser } from './push.js';

// Window during which we send the "your protection ends soon" warning before expiry.
const WARNING_LEAD_MS = 24 * 60 * 60 * 1000;

/**
 * Finds owned nexuses whose newbie protection expires within the next 24h
 * and that haven't been warned yet, then sends a single push per nexus.
 */
export async function sendProtectionExpiringWarnings(): Promise<void> {
	const now = new Date();
	const threshold = new Date(now.getTime() + WARNING_LEAD_MS);

	const candidates = await prisma.nexus.findMany({
		where: {
			ownerId: { not: null },
			newbieProtectionEndsAt: { gt: now, lte: threshold },
			protectionWarningSentAt: null
		},
		select: { id: true, name: true, ownerId: true, newbieProtectionEndsAt: true, x: true, y: true }
	});

	if (candidates.length === 0) return;

	for (const nexus of candidates) {
		if (!nexus.ownerId || !nexus.newbieProtectionEndsAt) continue;
		const endsAtMs = nexus.newbieProtectionEndsAt.getTime();
		const hoursLeft = Math.max(1, Math.round((endsAtMs - now.getTime()) / 3_600_000));

		await sendPushToUser(nexus.ownerId, 'protectionExpiring', {
			title: 'Newbie protection ending soon',
			body: `${nexus.name} (${nexus.x}|${nexus.y}) becomes attackable in ~${hoursLeft}h. Build up defences while you can.`,
			tag: `protection-expiring-${nexus.id}`,
			data: { url: `/nexus/${nexus.id}` }
		});

		await prisma.nexus.update({
			where: { id: nexus.id },
			data: { protectionWarningSentAt: now }
		});
	}

	logInfo('protection_warnings_sent', { count: candidates.length });
}
