import type { Response } from 'express';
import { refreshResources } from '../models/Nexus.js';
import * as marketService from '../services/marketService.js';
import type { AuthRequest } from '../types/index.js';
import { parsePositiveInt } from '../utils/validation.js';

const VALID_RESOURCES = new Set(['biomass', 'alloy', 'ore']);
const MAX_LISTINGS_PER_NEXUS = 5;
const SYSTEM_BUY_RATE = 1.25;

export async function getListings(req: AuthRequest, res: Response): Promise<void> {
  try {
    const listings = await marketService.getAllListings(req.galaxyId);
    res.json(listings.map((l) => ({ ...l, sellerUsername: l.sellerNexus.owner?.username ?? null })));
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}

export async function createListing(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { nexusId, offerResource, offerAmount, wantResource, wantAmount } = req.body as Record<string, unknown>;
    const parsedNexusId = parsePositiveInt(nexusId);
    const parsedOffer = parsePositiveInt(offerAmount);
    const parsedWant = parsePositiveInt(wantAmount);
    if (!parsedNexusId || !parsedOffer || !parsedWant) { res.status(400).json({ error: 'Invalid parameters' }); return; }
    if (!VALID_RESOURCES.has(String(offerResource)) || !VALID_RESOURCES.has(String(wantResource))) {
      res.status(400).json({ error: 'Invalid resource type' }); return;
    }
    if (offerResource === wantResource) { res.status(400).json({ error: 'Offer and want resources must differ' }); return; }

    const rawNexus = await marketService.getNexusById(parsedNexusId);
    if (!rawNexus || rawNexus.ownerId !== req.userId || rawNexus.galaxyId !== req.galaxyId) {
      res.status(403).json({ error: 'Not authorized' }); return;
    }
    const nexus = await refreshResources(rawNexus);
    const nexusRecord = nexus as unknown as Record<string, number>;
    if ((nexusRecord[String(offerResource)] || 0) < parsedOffer) {
      res.status(400).json({ error: `Insufficient ${offerResource}` }); return;
    }
    const existingCount = await marketService.countListingsByNexus(parsedNexusId, req.galaxyId);
    if (existingCount >= MAX_LISTINGS_PER_NEXUS) {
      res.status(400).json({ error: `Maximum ${MAX_LISTINGS_PER_NEXUS} active listings per nexus` }); return;
    }
    const [listing] = await marketService.createListingAndDeductResource(
      { galaxyId: req.galaxyId, sellerNexusId: parsedNexusId, offerResource: String(offerResource), offerAmount: parsedOffer, wantResource: String(wantResource), wantAmount: parsedWant },
      parsedNexusId, String(offerResource), nexusRecord[String(offerResource)] - parsedOffer,
    );
    res.json({ success: true, listing });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}

export async function buyListing(req: AuthRequest, res: Response): Promise<void> {
  try {
    const listingId = parsePositiveInt(req.params.id);
    const { buyerNexusId } = req.body as { buyerNexusId?: unknown };
    const parsedBuyerNexusId = parsePositiveInt(buyerNexusId);
    if (!listingId || !parsedBuyerNexusId) { res.status(400).json({ error: 'Invalid parameters' }); return; }

    const [listing, buyerNexus] = await Promise.all([
      marketService.getListingWithNexus(listingId),
      marketService.getNexusById(parsedBuyerNexusId),
    ]);
    if (!listing) { res.status(404).json({ error: 'Listing not found' }); return; }
    if (!buyerNexus || buyerNexus.ownerId !== req.userId || buyerNexus.galaxyId !== req.galaxyId) {
      res.status(403).json({ error: 'Not authorized' }); return;
    }
    if (listing.galaxyId !== req.galaxyId) { res.status(403).json({ error: 'Listing is in a different galaxy' }); return; }
    if (listing.sellerNexus.ownerId === req.userId) { res.status(400).json({ error: 'Cannot buy your own listing' }); return; }
    const buyerRecord = buyerNexus as unknown as Record<string, number>;
    if ((buyerRecord[listing.wantResource] || 0) < listing.wantAmount) {
      res.status(400).json({ error: `Insufficient ${listing.wantResource}` }); return;
    }

    const [sellerOwner, buyerOwner] = await Promise.all([
      listing.sellerNexus.ownerId ? marketService.getUserById(listing.sellerNexus.ownerId) : null,
      buyerNexus.ownerId ? marketService.getUserById(buyerNexus.ownerId) : null,
    ]);

    await marketService.buyListing(
      listingId, parsedBuyerNexusId,
      { ...listing, sellerNexus: listing.sellerNexus as unknown as Record<string, number> },
      buyerRecord,
      sellerOwner?.username ?? 'Unknown', buyerOwner?.username ?? 'Unknown', req.galaxyId,
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}

export async function getHistory(req: AuthRequest, res: Response): Promise<void> {
  try {
    const transactions = await marketService.getTransactionHistory(req.galaxyId);
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}

export async function cancelListing(req: AuthRequest, res: Response): Promise<void> {
  try {
    const listingId = parsePositiveInt(req.params.id);
    if (!listingId) { res.status(400).json({ error: 'Invalid listing ID' }); return; }
    const listing = await marketService.getListingWithNexus(listingId);
    if (!listing) { res.status(404).json({ error: 'Listing not found' }); return; }
    if (listing.sellerNexus.ownerId !== req.userId || listing.galaxyId !== req.galaxyId) {
      res.status(403).json({ error: 'Not authorized' }); return;
    }
    const sellerRecord = listing.sellerNexus as unknown as Record<string, number>;
    await marketService.cancelListing(
      listingId, listing.sellerNexusId, listing.offerResource,
      sellerRecord[listing.offerResource] + listing.offerAmount,
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}

export async function systemBuy(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { nexusId, receiveResource, receiveAmount, payResource } = req.body as Record<string, unknown>;
    const parsedNexusId = parsePositiveInt(nexusId);
    const parsedReceive = parsePositiveInt(receiveAmount);
    if (!parsedNexusId || !parsedReceive) { res.status(400).json({ error: 'Invalid parameters' }); return; }
    if (!VALID_RESOURCES.has(String(receiveResource)) || !VALID_RESOURCES.has(String(payResource))) {
      res.status(400).json({ error: 'Invalid resource type' }); return;
    }
    if (receiveResource === payResource) { res.status(400).json({ error: 'Resources must differ' }); return; }
    const rawNexus = await marketService.getNexusById(parsedNexusId);
    if (!rawNexus || rawNexus.ownerId !== req.userId || rawNexus.galaxyId !== req.galaxyId) {
      res.status(403).json({ error: 'Not authorized' }); return;
    }
    const nexus = await refreshResources(rawNexus);
    const nexusRecord = nexus as unknown as Record<string, number>;
    const cost = Math.ceil(parsedReceive * SYSTEM_BUY_RATE);
    if ((nexusRecord[String(payResource)] || 0) < cost) {
      res.status(400).json({ error: `Insufficient ${payResource} — need ${cost}` }); return;
    }
    await marketService.updateNexusResources(parsedNexusId, {
      [String(payResource)]: nexusRecord[String(payResource)] - cost,
      [String(receiveResource)]: nexusRecord[String(receiveResource)] + parsedReceive,
    });
    res.json({ success: true, paid: cost, received: parsedReceive });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}
