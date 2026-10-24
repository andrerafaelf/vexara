import type { Request, Response } from 'express';
import prisma from '../lib/prisma.js';
import { logError, logInfo, logWarn } from '../utils/logger.js';
import { NOTIF, sendPushToUser } from '../utils/push.js';
import { notifyBadgeUpdate } from '../services/warRoomSocket.js';

interface KofiShopItem {
	direct_link_code?: string;
	// Not documented by Ko-fi but tolerated: a full shop URL, from which the code is read.
	link?: string;
	variation_name?: string;
	quantity?: number;
}

interface KofiPayload {
	verification_token?: string;
	type?: string;
	email?: string;
	from_name?: string;
	amount?: string;
	currency?: string;
	kofi_transaction_id?: string;
	is_subscription_payment?: boolean;
	is_first_subscription_payment?: boolean;
	shop_items?: KofiShopItem[];
	message?: string;
}

// VP packs sold in the Ko-fi shop. variation_name must match exactly what's in Ko-fi.
const VP_PACKS: Array<{ name: string; vp: number }> = [
	{ name: 'Starter — 1,000 VP', vp: 1000 },
	{ name: 'Commander Pack — 2,500 VP', vp: 2500 },
	{ name: 'Warlord Pack — 6,000 VP', vp: 6000 }
];

// 'commander' is a frozen legacy tier — only alpha founders can hold it.
// Post-alpha €25 supporters receive 'vanguard' instead.
type SupporterTier = 'recruit' | 'officer' | 'vanguard' | 'commander';

const TIER_RANK: Record<SupporterTier, number> = {
	recruit: 1,
	officer: 2,
	vanguard: 3,
	commander: 4
};

interface TierGrant {
	tier: SupporterTier | null;
	tokens: number;
}

// Donation amount → tier + tokens. Non-linear by design: bigger tiers feel
// disproportionately generous to nudge donors up. Sub-€5 donations still grant
// supporter status + 1 token (we don't punish small donors) but get no tier badge.
function resolveTier(amountEur: number): TierGrant {
	// Alpha is closed — new €25+ donors receive 'vanguard', not 'commander'.
	// 'commander' is reserved for isFounder alpha donors; isAlphaActive() is always false.
	if (amountEur >= 25) return { tier: 'vanguard', tokens: 8 };
	if (amountEur >= 10) return { tier: 'officer', tokens: 3 };
	if (amountEur >= 5) return { tier: 'recruit', tokens: 1 };
	return { tier: null, tokens: 1 };
}

// The three supporter tiers on the site link to Ko-fi SHOP items (see
// client/src/constants/support.ts SUPPORTER_TIERS), so a purchase arrives as a
// 'Shop Order', not a Donation. Items are identified by the stable link code from
// the shop URL (https://ko-fi.com/s/<code>), carried in shop_items[].direct_link_code.
const SUPPORTER_SHOP_ITEMS: Record<string, 'recruit' | 'officer' | 'vanguard'> = {
	'4e180806f6': 'recruit',
	'9bf84f5154': 'officer',
	'35e981fe6e': 'vanguard'
};

// Same token amounts a donation of that tier grants (see resolveTier).
const SHOP_TIER_TOKENS: Record<'recruit' | 'officer' | 'vanguard', number> = {
	recruit: 1,
	officer: 3,
	vanguard: 8
};

function shopItemCode(item: KofiShopItem): string {
	const raw =
		typeof item.direct_link_code === 'string' && item.direct_link_code.trim()
			? item.direct_link_code
			: typeof item.link === 'string'
				? item.link
				: '';
	// Accept either the bare code or a URL; the code is the last path segment.
	return raw
		.trim()
		.replace(/[?#].*$/, '')
		.replace(/\/+$/, '')
		.split('/')
		.pop()!
		.toLowerCase();
}

// Returns the tier grant if this payload is a Shop Order containing a supporter
// item, otherwise null. Several supporter items in one order grant the highest tier
// once (tiers are never cumulative, and the quantity does not multiply the grant).
function resolveSupporterShopOrder(payload: KofiPayload): TierGrant | null {
	if (payload.type !== 'Shop Order') return null;
	if (!Array.isArray(payload.shop_items)) return null;
	let best: 'recruit' | 'officer' | 'vanguard' | null = null;
	for (const item of payload.shop_items) {
		const code = shopItemCode(item);
		const tier = Object.hasOwn(SUPPORTER_SHOP_ITEMS, code) ? SUPPORTER_SHOP_ITEMS[code] : undefined;
		if (tier && (!best || TIER_RANK[tier] > TIER_RANK[best])) best = tier;
	}
	return best ? { tier: best, tokens: SHOP_TIER_TOKENS[best] } : null;
}

// Returns VP amount if this payload is a VP shop order, otherwise 0.
function resolveVpOrder(payload: KofiPayload): number {
	if (payload.type !== 'Shop Order') return 0;
	if (!Array.isArray(payload.shop_items)) return 0;
	for (const item of payload.shop_items) {
		const name = typeof item.variation_name === 'string' ? item.variation_name.trim() : '';
		const pack = VP_PACKS.find((p) => p.name === name);
		if (pack) return pack.vp;
	}
	return 0;
}

function parseAmount(raw: string | undefined): number {
	if (!raw) return 0;
	const n = parseFloat(raw);
	return Number.isFinite(n) && n > 0 ? n : 0;
}

// Alpha is permanently closed. isFounder / Alpha Commander badge can never be granted again.
function isAlphaActive(): boolean {
	return false;
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

		// Never grant on an unidentifiable delivery: the transaction id is the idempotency key.
		const txId =
			typeof payload.kofi_transaction_id === 'string'
				? payload.kofi_transaction_id.trim().slice(0, 128)
				: '';
		if (!txId) {
			logError('kofi_webhook_no_transaction_id', { type: payload.type });
			res.status(200).json({ ok: true });
			return;
		}

		const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
		if (!email) {
			logWarn('kofi_webhook_no_email', {
				transactionId: payload.kofi_transaction_id,
				type: payload.type
			});
			res.status(200).json({ ok: true });
			return;
		}

		const user = await prisma.user.findUnique({
			where: { email },
			select: {
				id: true,
				username: true,
				isSupporter: true,
				supporterTier: true,
				isFounder: true
			}
		});

		if (!user) {
			logWarn('kofi_webhook_no_user_match', {
				transactionId: payload.kofi_transaction_id,
				type: payload.type,
				fromName: payload.from_name,
				amount: payload.amount
			});
			res.status(200).json({ ok: true });
			return;
		}

		const amountEur = parseAmount(payload.amount);
		// Tier and tokens apply to Donations/Subscriptions and to Shop Orders for one of
		// the supporter tier items. Other Shop Orders (VP packs) never grant them.
		const isDonation = payload.type === 'Donation' || payload.type === 'Subscription';
		const shopGrant = resolveSupporterShopOrder(payload);
		const { tier, tokens }: TierGrant = isDonation
			? resolveTier(amountEur)
			: (shopGrant ?? { tier: null, tokens: 0 });
		const vpAmount = resolveVpOrder(payload);

		// Claim-before-process, then every grant, in ONE transaction: a crash mid-grant
		// rolls the claim back so Ko-fi's retry can complete it, and a redelivery of an
		// already-processed transaction hits the unique claim row and grants nothing.
		// skipDuplicates (ON CONFLICT DO NOTHING) is used instead of catching P2002,
		// because a caught unique violation would abort the Postgres transaction.
		const outcome = await prisma.$transaction(async (tx) => {
			const claim = await tx.kofiWebhookEvent.createMany({
				data: [
					{
						transactionId: txId,
						type: (payload.type ?? 'unknown').slice(0, 32),
						userId: user.id,
						amount: payload.amount ? String(payload.amount).slice(0, 32) : null
					}
				],
				skipDuplicates: true
			});
			if (claim.count === 0) return { duplicate: true as const };

			// Tier-up: highest tier ever achieved wins (we never downgrade).
			const currentRank = user.supporterTier
				? (TIER_RANK[user.supporterTier as SupporterTier] ?? 0)
				: 0;
			const newRank = tier ? TIER_RANK[tier] : 0;
			const upgradeToTier: SupporterTier | null = newRank > currentRank ? tier : null;

			// Founder badge: locks in permanently if this is a Commander-tier donation
			// during alpha. After alpha closes, this branch never fires again.
			const grantFounder = !user.isFounder && tier === 'commander' && isAlphaActive();

			const updateData: {
				isSupporter?: boolean;
				supporterSince?: Date;
				supporterTier?: SupporterTier;
				supporterTierSince?: Date;
				isFounder?: boolean;
				earnedTitles?: string[];
				vexPoints?: { increment: number };
			} = {};
			if (!user.isSupporter) {
				updateData.isSupporter = true;
				updateData.supporterSince = new Date();
			}
			if (upgradeToTier) {
				updateData.supporterTier = upgradeToTier;
				updateData.supporterTierSince = new Date();
			}
			if (grantFounder) {
				updateData.isFounder = true;
			}

			// Append the title for the exact tier granted. Titles are not cumulative
			// across tiers - each tier has its own distinct title.
			// Alpha Commander replaces Commander for founder-tier donations during alpha.
			if (upgradeToTier) {
				const SUPPORTER_TITLES: Record<string, string> = {
					recruit: 'Recruit',
					officer: 'Officer',
					vanguard: 'Vanguard',
					commander: grantFounder ? 'Alpha Commander' : 'Commander'
				};
				const titleToGrant = SUPPORTER_TITLES[upgradeToTier];
				const fullUser = await tx.user.findUnique({
					where: { id: user.id },
					select: { earnedTitles: true }
				});
				const earned = (fullUser?.earnedTitles as string[]) ?? [];
				if (titleToGrant && !earned.includes(titleToGrant)) {
					updateData.earnedTitles = [...earned, titleToGrant];
				}
			}

			// Vex Points shop order: atomic increment on the buyer's balance.
			if (vpAmount > 0) updateData.vexPoints = { increment: vpAmount };

			if (Object.keys(updateData).length > 0) {
				await tx.user.update({ where: { id: user.id }, data: updateData });
			}

			// One row per token. milestone=0 is reserved for Ko-fi grants; the unique
			// kofiTransactionId stays as a second line of defense (and covers tokens granted
			// before the claim table existed). The first token keeps the raw txId.
			let granted = 0;
			if (tokens > 0) {
				const rows = Array.from({ length: tokens }, (_, i) => ({
					userId: user.id,
					milestone: 0,
					rewardType: 'kofi',
					rewardMeta: {
						amount: payload.amount ?? null,
						type: payload.type ?? null,
						tier: tier ?? null,
						tokenIndex: i,
						tokenCount: tokens
					},
					kofiTransactionId: i === 0 ? txId.slice(0, 64) : `${txId.slice(0, 60)}-${i}`
				}));
				granted = (await tx.milestoneToken.createMany({ data: rows, skipDuplicates: true })).count;
			}

			return {
				duplicate: false as const,
				upgradeToTier,
				grantFounder,
				granted,
				changedUser: Object.keys(updateData).length > 0
			};
		});

		if (outcome.duplicate) {
			logInfo('kofi_webhook_duplicate', { transactionId: txId, userId: user.id });
			res.status(200).json({ ok: true, duplicate: true });
			return;
		}

		// Side effects (logs, push, sockets) run only after the transaction committed.
		if (outcome.changedUser) {
			logInfo('kofi_supporter_updated', {
				userId: user.id,
				username: user.username,
				amount: payload.amount,
				tier: outcome.upgradeToTier,
				founderGranted: outcome.grantFounder,
				transactionId: txId
			});
		} else {
			logInfo('kofi_supporter_recurring', {
				userId: user.id,
				amount: payload.amount,
				transactionId: txId
			});
		}

		if (outcome.granted > 0) {
			const tierLabel = tier ? ` (${tier})` : '';
			void sendPushToUser(user.id, NOTIF.TOKEN_GRANTED, {
				title:
					outcome.granted === 1
						? 'Supporter token granted'
						: `${outcome.granted} supporter tokens granted`,
				body: `Thanks for backing Vexara${tierLabel}! Spend tokens from your Profile. Your supporter glow is live.`,
				tag: `token-kofi-${txId}`,
				data: { url: '/profile' }
			});
			notifyBadgeUpdate(user.id);
			logInfo('kofi_tokens_granted', {
				userId: user.id,
				count: outcome.granted,
				tier,
				transactionId: txId
			});
		}

		if (vpAmount > 0) {
			logInfo('kofi_vex_points_granted', { userId: user.id, vp: vpAmount, transactionId: txId });
			void sendPushToUser(user.id, NOTIF.TOKEN_GRANTED, {
				title: `${vpAmount.toLocaleString()} Vex Points credited`,
				body: 'Spend VP to unlock the Vex Protocol battle pass, or gift it to a fellow commander.',
				tag: `vex-points-${txId}`,
				data: { url: '/pass' }
			});
		}

		res.status(200).json({ ok: true });
	} catch (error) {
		logError('kofi_webhook_error', { message: (error as Error).message });
		res.status(200).json({ ok: true });
	}
}
