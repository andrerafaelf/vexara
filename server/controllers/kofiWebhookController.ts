import type { Request, Response } from 'express';
import prisma from '../lib/prisma.js';
import { logError, logInfo, logWarn } from '../utils/logger.js';
import { NOTIF, sendPushToUser } from '../utils/push.js';
import { notifyBadgeUpdate } from '../services/warRoomSocket.js';
import { grantVexPoints } from '../utils/battlePass.js';

interface KofiShopItem {
	direct_link_code?: string;
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

// Ko-fi shop item name for the 1,000 VP bundle. Must match exactly what you enter in Ko-fi Shop.
const VEX_POINTS_ITEM_NAME = 'Vex Points — Vexara';
const VEX_POINTS_AMOUNT = 1000;

type SupporterTier = 'recruit' | 'officer' | 'commander';

const TIER_RANK: Record<SupporterTier, number> = { recruit: 1, officer: 2, commander: 3 };

interface TierGrant {
	tier: SupporterTier | null;
	tokens: number;
}

// Donation amount → tier + tokens. Non-linear by design: bigger tiers feel
// disproportionately generous to nudge donors up. Sub-€5 donations still grant
// supporter status + 1 token (we don't punish small donors) but get no tier badge.
function resolveTier(amountEur: number): TierGrant {
	if (amountEur >= 25) return { tier: 'commander', tokens: 8 };
	if (amountEur >= 10) return { tier: 'officer', tokens: 3 };
	if (amountEur >= 5) return { tier: 'recruit', tokens: 1 };
	return { tier: null, tokens: 1 };
}

function isVexPointsOrder(payload: KofiPayload): boolean {
	if (payload.type !== 'Shop Order') return false;
	if (!Array.isArray(payload.shop_items)) return false;
	// Match by direct_link_code env var (stable) or fall back to display name.
	const linkCode = process.env.KOFI_VEX_POINTS_LINK_CODE;
	return payload.shop_items.some((item) => {
		if (linkCode && typeof item.direct_link_code === 'string') {
			return item.direct_link_code === linkCode;
		}
		return (
			typeof item.variation_name === 'string' &&
			item.variation_name.trim() === VEX_POINTS_ITEM_NAME
		);
	});
}

function parseAmount(raw: string | undefined): number {
	if (!raw) return 0;
	const n = parseFloat(raw);
	return Number.isFinite(n) && n > 0 ? n : 0;
}

function isAlphaActive(): boolean {
	// Defaults to true so Founder badges still grant during alpha if the env var
	// is unset. Flip ALPHA_ACTIVE=false at launch to lock the badge forever.
	return (process.env.ALPHA_ACTIVE ?? 'true').toLowerCase() !== 'false';
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
		const { tier, tokens } = resolveTier(amountEur);

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

		if (Object.keys(updateData).length > 0) {
			await prisma.user.update({ where: { id: user.id }, data: updateData });
			logInfo('kofi_supporter_updated', {
				userId: user.id,
				username: user.username,
				amount: payload.amount,
				tier: upgradeToTier,
				founderGranted: grantFounder,
				transactionId: payload.kofi_transaction_id
			});
		} else {
			logInfo('kofi_supporter_recurring', {
				userId: user.id,
				amount: payload.amount,
				transactionId: payload.kofi_transaction_id
			});
		}

		// Grant tokens for this donation, idempotent on kofi_transaction_id.
		// milestone=0 is reserved for Ko-fi grants; the unique index on kofiTransactionId
		// dedupes webhook retries. We grant `tokens` separate rows (one per token) so
		// each can be spent/consumed independently.
		const txId =
			typeof payload.kofi_transaction_id === 'string'
				? payload.kofi_transaction_id.slice(0, 64)
				: null;
		if (txId && tokens > 0) {
			let granted = 0;
			let duplicate = false;
			for (let i = 0; i < tokens; i++) {
				// Suffix multi-token grants so each row has a unique kofiTransactionId.
				// First token keeps the raw txId for backwards compatibility with the
				// existing unique index and prior single-token grants.
				const rowTxId = i === 0 ? txId : `${txId.slice(0, 60)}-${i}`;
				try {
					await prisma.milestoneToken.create({
						data: {
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
							kofiTransactionId: rowTxId
						}
					});
					granted++;
				} catch (err) {
					const code = (err as { code?: string }).code;
					if (code === 'P2002') {
						duplicate = true;
						break;
					}
					logError('kofi_token_grant_error', { userId: user.id, message: (err as Error).message });
				}
			}

			if (granted > 0) {
				const tierLabel = tier ? ` (${tier})` : '';
				void sendPushToUser(user.id, NOTIF.TOKEN_GRANTED, {
					title: granted === 1 ? 'Supporter token granted' : `${granted} supporter tokens granted`,
					body: `Thanks for backing Vexara${tierLabel}! Spend tokens from your Profile. Your supporter glow is live.`,
					tag: `token-kofi-${txId}`,
					data: { url: '/profile' }
				});
				notifyBadgeUpdate(user.id);
				logInfo('kofi_tokens_granted', {
					userId: user.id,
					count: granted,
					tier,
					transactionId: txId
				});
			}
			if (duplicate) {
				logInfo('kofi_token_duplicate', { userId: user.id, transactionId: txId });
			}
		}

		// Vex Points shop order: credit 1,000 VP to the buyer's account.
		// They spend VP in-game to unlock the battle pass (or gift it to another player).
		if (isVexPointsOrder(payload)) {
			try {
				await grantVexPoints(user.id, VEX_POINTS_AMOUNT);
				logInfo('kofi_vex_points_granted', {
					userId: user.id,
					vp: VEX_POINTS_AMOUNT,
					transactionId: txId
				});
				void sendPushToUser(user.id, NOTIF.TOKEN_GRANTED, {
					title: `${VEX_POINTS_AMOUNT.toLocaleString()} Vex Points credited`,
					body: 'Spend VP to unlock the Vex Protocol battle pass — or gift it to a fellow commander.',
					tag: `vex-points-${txId ?? user.id}`,
					data: { url: '/pass' }
				});
			} catch (vpError) {
				logError('kofi_vex_points_error', {
					userId: user.id,
					message: (vpError as Error).message
				});
			}
		}

		res.status(200).json({ ok: true });
	} catch (error) {
		logError('kofi_webhook_error', { message: (error as Error).message });
		res.status(200).json({ ok: true });
	}
}
