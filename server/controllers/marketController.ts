import type { Response } from 'express';
import { refreshResources } from '../models/Nexus.js';
import * as marketService from '../services/marketService.js';
import type { AuthRequest } from '../types/index.js';
import { parsePositiveInt } from '../utils/validation.js';
import { logError } from '../utils/logger.js';
import { notifyMarketUpdated } from '../services/warRoomSocket.js';

function emitMarket() {
	try {
		notifyMarketUpdated();
	} catch (emitErr) {
		logError('market_emit_failed', { message: (emitErr as Error).message });
	}
}

const VALID_RESOURCES = new Set(['biomass', 'alloy', 'ore']);
const MAX_LISTINGS_PER_NEXUS = 5;
const SYSTEM_BUY_RATE = 1.25;

export async function getListings(req: AuthRequest, res: Response): Promise<void> {
	try {
		const listings = await marketService.getAllListings(req.galaxyId);
		const treatyChecks = await Promise.all(
			listings.map((l) => {
				const sellerOwnerId = l.sellerNexus.ownerId;
				if (!sellerOwnerId || sellerOwnerId === req.userId) return Promise.resolve(null);
				return marketService.getActiveTradeTreaty(req.userId, sellerOwnerId, req.galaxyId);
			})
		);
		res.json(
			listings.map((l, i) => ({
				...l,
				sellerUsername: l.sellerNexus.owner?.username ?? null,
				hasTreaty: !!treatyChecks[i]
			}))
		);
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'marketController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function createListing(req: AuthRequest, res: Response): Promise<void> {
	try {
		const { nexusId, offerResource, offerAmount, wantResource, wantAmount } = req.body as Record<
			string,
			unknown
		>;
		const parsedNexusId = parsePositiveInt(nexusId);
		const parsedOffer = parsePositiveInt(offerAmount);
		const parsedWant = parsePositiveInt(wantAmount);
		if (!parsedNexusId || !parsedOffer || !parsedWant) {
			res.status(400).json({ error: 'Invalid parameters' });
			return;
		}
		if (!VALID_RESOURCES.has(String(offerResource)) || !VALID_RESOURCES.has(String(wantResource))) {
			res.status(400).json({ error: 'Invalid resource type' });
			return;
		}
		if (offerResource === wantResource) {
			res.status(400).json({ error: 'Offer and want resources must differ' });
			return;
		}

		const rawNexus = await marketService.getNexusById(parsedNexusId);
		if (!rawNexus || rawNexus.ownerId !== req.userId || rawNexus.galaxyId !== req.galaxyId) {
			res.status(403).json({ error: 'Not authorized' });
			return;
		}
		const nexus = await refreshResources(rawNexus);
		const nexusRecord = nexus as unknown as Record<string, number>;
		if ((nexusRecord[String(offerResource)] || 0) < parsedOffer) {
			res.status(400).json({ error: `Insufficient ${offerResource}` });
			return;
		}
		const existingCount = await marketService.countListingsByNexus(parsedNexusId, req.galaxyId);
		if (existingCount >= MAX_LISTINGS_PER_NEXUS) {
			res
				.status(400)
				.json({ error: `Maximum ${MAX_LISTINGS_PER_NEXUS} active listings per nexus` });
			return;
		}
		const offerKey = String(offerResource);
		const [listing] = await marketService.createListingAndDeductResource(
			{
				galaxyId: req.galaxyId,
				sellerNexusId: parsedNexusId,
				offerResource: offerKey,
				offerAmount: parsedOffer,
				wantResource: String(wantResource),
				wantAmount: parsedWant
			},
			parsedNexusId,
			{
				biomass: nexusRecord['biomass'],
				alloy: nexusRecord['alloy'],
				ore: nexusRecord['ore'],
				[offerKey]: nexusRecord[offerKey] - parsedOffer,
				lastResourceUpdate: nexus.lastResourceUpdate
			}
		);
		emitMarket();
		try {
			const { incrementQuestProgress } = await import('../services/dailyStreakService.js');
			void incrementQuestProgress(req.userId, req.galaxyId, 'market_1', 1);
		} catch {}
		res.json({ success: true, listing });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'marketController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function buyListing(req: AuthRequest, res: Response): Promise<void> {
	try {
		const listingId = parsePositiveInt(req.params.id);
		const { buyerNexusId } = req.body as { buyerNexusId?: unknown };
		const parsedBuyerNexusId = parsePositiveInt(buyerNexusId);
		if (!listingId || !parsedBuyerNexusId) {
			res.status(400).json({ error: 'Invalid parameters' });
			return;
		}

		const [listing, buyerNexus] = await Promise.all([
			marketService.getListingWithNexus(listingId),
			marketService.getNexusById(parsedBuyerNexusId)
		]);
		if (!listing) {
			res.status(404).json({ error: 'Listing not found' });
			return;
		}
		if (!buyerNexus || buyerNexus.ownerId !== req.userId || buyerNexus.galaxyId !== req.galaxyId) {
			res.status(403).json({ error: 'Not authorized' });
			return;
		}
		if (listing.galaxyId !== req.galaxyId) {
			res.status(403).json({ error: 'Listing is in a different galaxy' });
			return;
		}
		if (listing.sellerNexus.ownerId === req.userId) {
			res.status(400).json({ error: 'Cannot buy your own listing' });
			return;
		}
		const buyerRecord = buyerNexus as unknown as Record<string, number>;

		const sellerOwnerId = listing.sellerNexus.ownerId;
		const buyerOwnerId = buyerNexus.ownerId;

		const [sellerOwner, buyerOwner, treaty] = await Promise.all([
			sellerOwnerId ? marketService.getUserById(sellerOwnerId) : null,
			buyerOwnerId ? marketService.getUserById(buyerOwnerId) : null,
			sellerOwnerId && buyerOwnerId
				? marketService.getActiveTradeTreaty(buyerOwnerId, sellerOwnerId, req.galaxyId)
				: null
		]);

		const commission = treaty
			? 0
			: Math.ceil(listing.wantAmount * marketService.MARKET_COMMISSION_RATE);
		const totalRequired = listing.wantAmount + commission;
		if ((buyerRecord[listing.wantResource] || 0) < totalRequired) {
			res
				.status(400)
				.json({
					error: `Insufficient ${listing.wantResource} (need ${totalRequired} including ${commission} commission)`
				});
			return;
		}

		// Refresh both nexuses so writes carry the latest production tick and
		// persist lastResourceUpdate; otherwise the deducted/added balances are
		// recalculated on the next tick from a stale baseline.
		const refreshedBuyer = await refreshResources(buyerNexus);
		const refreshedSeller = await refreshResources(listing.sellerNexus);
		const buyerFresh = refreshedBuyer as unknown as Record<string, number>;
		const sellerFresh = refreshedSeller as unknown as Record<string, number>;
		const buyerNexusData: Record<string, unknown> = {
			biomass: buyerFresh['biomass'],
			alloy: buyerFresh['alloy'],
			ore: buyerFresh['ore'],
			lastResourceUpdate: refreshedBuyer.lastResourceUpdate
		};
		buyerNexusData[listing.wantResource] = buyerFresh[listing.wantResource] - totalRequired;
		buyerNexusData[listing.offerResource] = buyerFresh[listing.offerResource] + listing.offerAmount;
		const sellerNexusData: Record<string, unknown> = {
			biomass: sellerFresh['biomass'],
			alloy: sellerFresh['alloy'],
			ore: sellerFresh['ore'],
			lastResourceUpdate: refreshedSeller.lastResourceUpdate
		};
		sellerNexusData[listing.wantResource] = sellerFresh[listing.wantResource] + listing.wantAmount;

		await marketService.buyListing(
			listingId,
			parsedBuyerNexusId,
			listing,
			buyerNexusData,
			sellerNexusData,
			sellerOwner?.username ?? 'Unknown',
			buyerOwner?.username ?? 'Unknown',
			req.galaxyId
		);
		emitMarket();
		try {
			const { incrementQuestProgress } = await import('../services/dailyStreakService.js');
			void incrementQuestProgress(req.userId, req.galaxyId, 'buy_market_1', 1);
		} catch {}
		res.json({ success: true, commission, hasTreaty: !!treaty });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'marketController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function getHistory(req: AuthRequest, res: Response): Promise<void> {
	try {
		const transactions = await marketService.getTransactionHistory(req.galaxyId);
		res.json(transactions);
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'marketController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function cancelListing(req: AuthRequest, res: Response): Promise<void> {
	try {
		const listingId = parsePositiveInt(req.params.id);
		if (!listingId) {
			res.status(400).json({ error: 'Invalid listing ID' });
			return;
		}
		const listing = await marketService.getListingWithNexus(listingId);
		if (!listing) {
			res.status(404).json({ error: 'Listing not found' });
			return;
		}
		if (listing.sellerNexus.ownerId !== req.userId || listing.galaxyId !== req.galaxyId) {
			res.status(403).json({ error: 'Not authorized' });
			return;
		}
		// Refresh seller nexus so the refund lands on a fresh snapshot and we
		// can persist lastResourceUpdate atomically - otherwise the next tick
		// would replay production over the refunded balance.
		const refreshedSeller = await refreshResources(listing.sellerNexus);
		const sellerRecord = refreshedSeller as unknown as Record<string, number>;
		const offerKey = listing.offerResource;
		await marketService.cancelListing(listingId, listing.sellerNexusId, {
			biomass: sellerRecord['biomass'],
			alloy: sellerRecord['alloy'],
			ore: sellerRecord['ore'],
			[offerKey]: sellerRecord[offerKey] + listing.offerAmount,
			lastResourceUpdate: refreshedSeller.lastResourceUpdate
		});
		emitMarket();
		res.json({ success: true });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'marketController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

export async function systemBuy(req: AuthRequest, res: Response): Promise<void> {
	try {
		const { nexusId, receiveResource, receiveAmount, payResource } = req.body as Record<
			string,
			unknown
		>;
		const parsedNexusId = parsePositiveInt(nexusId);
		const parsedReceive = parsePositiveInt(receiveAmount);
		if (!parsedNexusId || !parsedReceive) {
			res.status(400).json({ error: 'Invalid parameters' });
			return;
		}
		if (
			!VALID_RESOURCES.has(String(receiveResource)) ||
			!VALID_RESOURCES.has(String(payResource))
		) {
			res.status(400).json({ error: 'Invalid resource type' });
			return;
		}
		if (receiveResource === payResource) {
			res.status(400).json({ error: 'Resources must differ' });
			return;
		}
		const rawNexus = await marketService.getNexusById(parsedNexusId);
		if (!rawNexus || rawNexus.ownerId !== req.userId || rawNexus.galaxyId !== req.galaxyId) {
			res.status(403).json({ error: 'Not authorized' });
			return;
		}
		const nexus = await refreshResources(rawNexus);
		const nexusRecord = nexus as unknown as Record<string, number>;
		const cost = Math.ceil(parsedReceive * SYSTEM_BUY_RATE);
		if ((nexusRecord[String(payResource)] || 0) < cost) {
			res.status(400).json({ error: `Insufficient ${payResource}, need ${cost}` });
			return;
		}
		const payKey = String(payResource);
		const receiveKey = String(receiveResource);
		await marketService.updateNexusResources(parsedNexusId, {
			biomass: nexusRecord['biomass'],
			alloy: nexusRecord['alloy'],
			ore: nexusRecord['ore'],
			[payKey]: nexusRecord[payKey] - cost,
			[receiveKey]: nexusRecord[receiveKey] + parsedReceive,
			lastResourceUpdate: nexus.lastResourceUpdate
		});
		res.json({ success: true, paid: cost, received: parsedReceive });
	} catch (error) {
		logError('unhandled_controller_error', {
			message: (error as Error).message,
			file: 'marketController.ts'
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}
