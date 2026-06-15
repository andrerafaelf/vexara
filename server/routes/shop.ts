import { Router } from 'express';
import type { Response } from 'express';
import auth from '../middleware/auth.js';
import type { AuthRequest } from '../types/index.js';
import prisma from '../lib/prisma.js';
import { logError, logInfo } from '../utils/logger.js';
import {
	getDailyShop,
	getDailyTitles,
	getDailyBorderCollection,
	getCollectionBorders,
	BORDER_BUNDLE_COST,
} from '../utils/shopCatalog.js';
import { purchasePaidPass, PASS_COST_VP } from '../utils/battlePass.js';
import { NOTIF, sendPushToUser } from '../utils/push.js';

const router = Router();

const USERNAME_COOLDOWN_DAYS = 30;
const USERNAME_MIN = 3;
const USERNAME_MAX = 20;

// GET /api/shop — daily shop state + user's owned items
router.get('/', auth, async (req, res: Response) => {
	const authReq = req as AuthRequest;
	try {
		const shop = getDailyShop();

		const user = await prisma.user.findUnique({
			where: { id: authReq.userId },
			select: { vexPoints: true, avatarBorder: true, usernameChangedAt: true }
		});
		if (!user) {
			res.status(404).json({ error: 'User not found' });
			return;
		}

		// Build set of all owned border / title keys from purchase ledger
		const purchases = await prisma.shopPurchase.findMany({
			where: { userId: authReq.userId },
			select: { itemKey: true }
		});
		const ownedKeys = new Set(purchases.map((p) => p.itemKey));

		// Username rename cooldown info
		let renameCooldownDays: number | null = null;
		if (user.usernameChangedAt) {
			const msSince = Date.now() - user.usernameChangedAt.getTime();
			const daysSince = msSince / 86_400_000;
			if (daysSince < USERNAME_COOLDOWN_DAYS) {
				renameCooldownDays = Math.ceil(USERNAME_COOLDOWN_DAYS - daysSince);
			}
		}

		res.json({
			...shop,
			vexPoints: user.vexPoints,
			equippedBorder: user.avatarBorder ?? null,
			ownedKeys: Array.from(ownedKeys),
			renameCooldownDays,
		});
	} catch (error) {
		logError('unhandled_controller_error', { message: (error as Error).message, file: 'shop GET /' });
		res.status(500).json({ error: 'Internal server error' });
	}
});

// POST /api/shop/purchase — buy a title or border from today's rotation
// Body: { itemKey: string }
router.post('/purchase', auth, async (req, res: Response) => {
	const authReq = req as AuthRequest;
	try {
		const { itemKey } = req.body as { itemKey?: string };
		if (typeof itemKey !== 'string' || !itemKey) {
			res.status(400).json({ error: 'itemKey is required' });
			return;
		}

		// Validate against today's titles and today's border collection
		const todayTitles = getDailyTitles();
		const { borders: todayBorders } = getDailyBorderCollection();
		const item = [...todayTitles, ...todayBorders].find((i) => i.key === itemKey);
		if (!item) {
			res.status(400).json({ error: 'Item not available in today\'s shop' });
			return;
		}

		const user = await prisma.user.findUnique({
			where: { id: authReq.userId },
			select: { vexPoints: true, earnedTitles: true }
		});
		if (!user) {
			res.status(404).json({ error: 'User not found' });
			return;
		}

		// De-dupe: can't buy the same item twice
		const existing = await prisma.shopPurchase.findFirst({
			where: { userId: authReq.userId, itemKey }
		});
		if (existing) {
			res.status(400).json({ error: 'You already own this item' });
			return;
		}

		if (user.vexPoints < item.vpCost) {
			res.status(400).json({ error: `Not enough Vex Points (need ${item.vpCost}, have ${user.vexPoints})` });
			return;
		}

		// Atomic: deduct VP, record purchase, and apply item effect
		const updateData: Record<string, unknown> = {
			vexPoints: { decrement: item.vpCost }
		};

		if (item.type === 'title') {
			const earned = (user.earnedTitles as string[]) ?? [];
			if (!earned.includes(item.name)) {
				updateData.earnedTitles = [...earned, item.name];
			}
		}

		await prisma.$transaction([
			prisma.user.update({ where: { id: authReq.userId }, data: updateData }),
			prisma.shopPurchase.create({
				data: { userId: authReq.userId, itemKey, itemType: item.type, vpSpent: item.vpCost }
			}),
		]);

		logInfo('shop_purchase', { userId: authReq.userId, itemKey, itemType: item.type, vpSpent: item.vpCost });
		res.json({ success: true, itemKey, itemType: item.type });
	} catch (error) {
		logError('unhandled_controller_error', { message: (error as Error).message, file: 'shop POST /purchase' });
		res.status(500).json({ error: 'Internal server error' });
	}
});

// POST /api/shop/purchase-bundle — buy all 6 borders in today's collection for 300 VP
// Body: { collectionKey: string }
router.post('/purchase-bundle', auth, async (req, res: Response) => {
	const authReq = req as AuthRequest;
	try {
		const { collectionKey } = req.body as { collectionKey?: string };
		if (typeof collectionKey !== 'string' || !collectionKey) {
			res.status(400).json({ error: 'collectionKey is required' });
			return;
		}

		// Only today's collection is purchasable as a bundle
		const { collectionKey: todayKey, borders } = getDailyBorderCollection();
		if (collectionKey !== todayKey) {
			res.status(400).json({ error: 'Collection not available in today\'s shop' });
			return;
		}

		const user = await prisma.user.findUnique({
			where: { id: authReq.userId },
			select: { vexPoints: true }
		});
		if (!user) {
			res.status(404).json({ error: 'User not found' });
			return;
		}

		// Find which borders in this collection the user already owns
		const borderKeys = borders.map((b) => b.key);
		const existingPurchases = await prisma.shopPurchase.findMany({
			where: { userId: authReq.userId, itemKey: { in: borderKeys } },
			select: { itemKey: true }
		});
		const alreadyOwned = new Set(existingPurchases.map((p) => p.itemKey));
		const toAcquire = borders.filter((b) => !alreadyOwned.has(b.key));

		if (toAcquire.length === 0) {
			res.status(400).json({ error: 'You already own all borders in this collection' });
			return;
		}

		// Charge full bundle price regardless of how many are already owned
		if (user.vexPoints < BORDER_BUNDLE_COST) {
			res.status(400).json({ error: `Not enough Vex Points (need ${BORDER_BUNDLE_COST}, have ${user.vexPoints})` });
			return;
		}

		await prisma.$transaction([
			prisma.user.update({ where: { id: authReq.userId }, data: { vexPoints: { decrement: BORDER_BUNDLE_COST } } }),
			prisma.shopPurchase.createMany({
				data: toAcquire.map((b) => ({
					userId: authReq.userId,
					itemKey: b.key,
					itemType: b.type,
					vpSpent: 0,
				})),
			}),
			// Record the bundle transaction itself
			prisma.shopPurchase.create({
				data: {
					userId: authReq.userId,
					itemKey: `bundle_${collectionKey}`,
					itemType: 'border',
					vpSpent: BORDER_BUNDLE_COST,
				}
			}),
		]);

		logInfo('shop_bundle_purchase', { userId: authReq.userId, collectionKey, acquired: toAcquire.length });
		res.json({ success: true, collectionKey, acquiredKeys: toAcquire.map((b) => b.key) });
	} catch (error) {
		logError('unhandled_controller_error', { message: (error as Error).message, file: 'shop POST /purchase-bundle' });
		res.status(500).json({ error: 'Internal server error' });
	}
});

// POST /api/shop/equip-border — equip or un-equip a purchased border
// Body: { borderKey: string | null }
router.post('/equip-border', auth, async (req, res: Response) => {
	const authReq = req as AuthRequest;
	try {
		const { borderKey } = req.body as { borderKey?: string | null };

		if (borderKey === null || borderKey === undefined || borderKey === '') {
			await prisma.user.update({ where: { id: authReq.userId }, data: { avatarBorder: null } });
			res.json({ success: true, avatarBorder: null });
			return;
		}

		if (typeof borderKey !== 'string') {
			res.status(400).json({ error: 'Invalid borderKey' });
			return;
		}

		// Verify ownership via purchase ledger
		const owned = await prisma.shopPurchase.findFirst({
			where: { userId: authReq.userId, itemKey: borderKey }
		});
		if (!owned) {
			res.status(403).json({ error: 'Border not owned' });
			return;
		}

		await prisma.user.update({ where: { id: authReq.userId }, data: { avatarBorder: borderKey } });
		res.json({ success: true, avatarBorder: borderKey });
	} catch (error) {
		logError('unhandled_controller_error', { message: (error as Error).message, file: 'shop POST /equip-border' });
		res.status(500).json({ error: 'Internal server error' });
	}
});

// POST /api/shop/rename — change username, costs 500 VP, 30-day cooldown
// Body: { username: string }
router.post('/rename', auth, async (req, res: Response) => {
	const authReq = req as AuthRequest;
	try {
		const { username } = req.body as { username?: string };
		if (typeof username !== 'string' || !username.trim()) {
			res.status(400).json({ error: 'Username is required' });
			return;
		}

		const newUsername = username.trim();

		if (newUsername.length < USERNAME_MIN || newUsername.length > USERNAME_MAX) {
			res.status(400).json({ error: `Username must be ${USERNAME_MIN}–${USERNAME_MAX} characters` });
			return;
		}
		if (!/^[a-zA-Z0-9_]+$/.test(newUsername)) {
			res.status(400).json({ error: 'Username may only contain letters, numbers, and underscores' });
			return;
		}

		const RENAME_COST = 500;

		const user = await prisma.user.findUnique({
			where: { id: authReq.userId },
			select: { vexPoints: true, usernameChangedAt: true, username: true }
		});
		if (!user) {
			res.status(404).json({ error: 'User not found' });
			return;
		}

		// Cooldown check
		if (user.usernameChangedAt) {
			const msSince = Date.now() - user.usernameChangedAt.getTime();
			const daysSince = msSince / 86_400_000;
			if (daysSince < USERNAME_COOLDOWN_DAYS) {
				const daysLeft = Math.ceil(USERNAME_COOLDOWN_DAYS - daysSince);
				res.status(400).json({ error: `Username was changed recently. Try again in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}.` });
				return;
			}
		}

		if (user.vexPoints < RENAME_COST) {
			res.status(400).json({ error: `Not enough Vex Points (need ${RENAME_COST}, have ${user.vexPoints})` });
			return;
		}

		if (newUsername.toLowerCase() === user.username.toLowerCase()) {
			res.status(400).json({ error: 'That is already your username' });
			return;
		}

		// Check availability
		const taken = await prisma.user.findFirst({
			where: { username: { equals: newUsername, mode: 'insensitive' } },
			select: { id: true }
		});
		if (taken) {
			res.status(409).json({ error: 'Username already taken' });
			return;
		}

		await prisma.$transaction([
			prisma.user.update({
				where: { id: authReq.userId },
				data: {
					username: newUsername,
					vexPoints: { decrement: RENAME_COST },
					usernameChangedAt: new Date(),
				}
			}),
			prisma.shopPurchase.create({
				data: { userId: authReq.userId, itemKey: 'rename', itemType: 'rename', vpSpent: RENAME_COST, meta: { from: user.username, to: newUsername } }
			}),
		]);

		logInfo('shop_rename', { userId: authReq.userId, from: user.username, to: newUsername });
		res.json({ success: true, username: newUsername });
	} catch (error) {
		logError('unhandled_controller_error', { message: (error as Error).message, file: 'shop POST /rename' });
		res.status(500).json({ error: 'Internal server error' });
	}
});

// POST /api/shop/gift-pass — spend 1,000 VP to activate the pass for a player
// Moved here from /api/battle-pass/gift so the shop is the canonical spend point.
// Body: { username: string }
router.post('/gift-pass', auth, async (req, res: Response) => {
	const authReq = req as AuthRequest;
	try {
		if (!authReq.galaxyId) {
			res.status(409).json({ error: 'No active galaxy' });
			return;
		}

		const { username } = req.body as { username?: string };
		if (!username || typeof username !== 'string') {
			res.status(400).json({ error: 'Username is required' });
			return;
		}

		const gifter = await prisma.user.findUnique({
			where: { id: authReq.userId },
			select: { id: true, username: true, vexPoints: true }
		});
		if (!gifter) {
			res.status(404).json({ error: 'User not found' });
			return;
		}
		if (gifter.vexPoints < PASS_COST_VP) {
			res.status(400).json({ error: `Not enough Vex Points (need ${PASS_COST_VP}, have ${gifter.vexPoints})` });
			return;
		}
		if (gifter.username.toLowerCase() === username.toLowerCase()) {
			res.status(400).json({ error: 'You cannot gift a pass to yourself' });
			return;
		}

		const recipient = await prisma.user.findFirst({
			where: { username: { equals: username, mode: 'insensitive' } },
			select: { id: true, username: true }
		});
		if (!recipient) {
			res.status(404).json({ error: 'Player not found' });
			return;
		}
		const recipientPlayer = await prisma.galaxyPlayer.findUnique({
			where: { userId_galaxyId: { userId: recipient.id, galaxyId: authReq.galaxyId } },
			select: { hasPaidPass: true }
		});
		if (!recipientPlayer) {
			res.status(400).json({ error: 'That player is not in your active galaxy' });
			return;
		}
		if (recipientPlayer.hasPaidPass) {
			res.status(400).json({ error: 'That player already has the pass this season' });
			return;
		}

		// Deduct gifter VP atomically
		await prisma.user.update({
			where: { id: gifter.id },
			data: { vexPoints: { decrement: PASS_COST_VP } }
		});

		// Give recipient enough VP then auto-purchase so pass remains 1000 VP from their account
		await prisma.user.update({
			where: { id: recipient.id },
			data: { vexPoints: { increment: PASS_COST_VP } }
		});
		const passErr = await purchasePaidPass(recipient.id, authReq.galaxyId);
		if (passErr) {
			// Rollback both sides
			await prisma.user.update({ where: { id: gifter.id }, data: { vexPoints: { increment: PASS_COST_VP } } });
			await prisma.user.update({ where: { id: recipient.id }, data: { vexPoints: { decrement: PASS_COST_VP } } });
			res.status(400).json({ error: passErr });
			return;
		}

		await prisma.shopPurchase.create({
			data: {
				userId: gifter.id,
				itemKey: 'gift_pass',
				itemType: 'gift_pass',
				vpSpent: PASS_COST_VP,
				meta: { recipientId: recipient.id, recipientUsername: recipient.username }
			}
		});

		logInfo('shop_gift_pass', {
			gifterId: gifter.id,
			gifterUsername: gifter.username,
			recipientId: recipient.id,
			recipientUsername: recipient.username,
			galaxyId: authReq.galaxyId,
		});

		void sendPushToUser(recipient.id, NOTIF.TOKEN_GRANTED, {
			title: 'Vex Pass gifted!',
			body: `Commander ${gifter.username} gifted you the Vex Protocol battle pass. The paid track is now unlocked.`,
			tag: `vex-pass-gift-${recipient.id}`,
			data: { url: '/pass' }
		});

		res.json({ success: true, recipientUsername: recipient.username });
	} catch (error) {
		logError('unhandled_controller_error', { message: (error as Error).message, file: 'shop POST /gift-pass' });
		res.status(500).json({ error: 'Internal server error' });
	}
});

export default router;
