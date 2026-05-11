import express from 'express';
import prisma from '../lib/prisma.js';
import auth from '../middleware/auth.js';
import { refreshResources } from '../models/Nexus.js';
import { parsePositiveInt } from '../utils/validation.js';

const router = express.Router();

const VALID_RESOURCES = new Set(['biomass', 'alloy', 'ore']);
const MAX_LISTINGS_PER_NEXUS = 5;

const SYSTEM_BUY_RATE = 1.25;   // pay 125 to receive 100

// Get all active listings
router.get('/', auth, async (req, res) => {
  try {
    const listings = await prisma.marketListing.findMany({
      where: { galaxyId: req.galaxyId },
      include: {
        sellerNexus: { select: { id: true, name: true, x: true, y: true, ownerId: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const enriched = await Promise.all(
      listings.map(async (l) => {
        const owner = l.sellerNexus.ownerId
          ? await prisma.user.findUnique({
              where: { id: l.sellerNexus.ownerId },
              select: { id: true, username: true },
            })
          : null;
        return { ...l, sellerUsername: owner?.username };
      }),
    );

    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create a listing
router.post('/list', auth, async (req, res) => {
  try {
    const { nexusId, offerResource, offerAmount, wantResource, wantAmount } = req.body;
    const parsedNexusId = parsePositiveInt(nexusId);
    const parsedOffer = parsePositiveInt(offerAmount);
    const parsedWant = parsePositiveInt(wantAmount);

    if (!parsedNexusId || !parsedOffer || !parsedWant) {
      return res.status(400).json({ error: 'Invalid parameters' });
    }
    if (!VALID_RESOURCES.has(offerResource) || !VALID_RESOURCES.has(wantResource)) {
      return res.status(400).json({ error: 'Invalid resource type' });
    }
    if (offerResource === wantResource) {
      return res.status(400).json({ error: 'Offer and want resources must differ' });
    }

    const rawNexus = await prisma.nexus.findUnique({ where: { id: parsedNexusId } });
    if (!rawNexus || rawNexus.ownerId !== req.userId || rawNexus.galaxyId !== req.galaxyId) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    // Refresh production so we check against the actual current resource level
    const nexus = await refreshResources(rawNexus);
    if ((nexus[offerResource] || 0) < parsedOffer) {
      return res.status(400).json({ error: `Insufficient ${offerResource}` });
    }

    const existingCount = await prisma.marketListing.count({
      where: { sellerNexusId: parsedNexusId, galaxyId: req.galaxyId },
    });
    if (existingCount >= MAX_LISTINGS_PER_NEXUS) {
      return res.status(400).json({ error: `Maximum ${MAX_LISTINGS_PER_NEXUS} active listings per nexus` });
    }

    const [listing] = await prisma.$transaction([
      prisma.marketListing.create({
        data: {
          galaxyId: req.galaxyId,
          sellerNexusId: parsedNexusId,
          offerResource,
          offerAmount: parsedOffer,
          wantResource,
          wantAmount: parsedWant,
        },
      }),
      prisma.nexus.update({
        where: { id: parsedNexusId },
        data: { [offerResource]: nexus[offerResource] - parsedOffer },
      }),
    ]);

    res.json({ success: true, listing });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Buy a listing
router.post('/buy/:id', auth, async (req, res) => {
  try {
    const listingId = parsePositiveInt(req.params.id);
    const { buyerNexusId } = req.body;
    const parsedBuyerNexusId = parsePositiveInt(buyerNexusId);

    if (!listingId || !parsedBuyerNexusId) {
      return res.status(400).json({ error: 'Invalid parameters' });
    }

    const [listing, buyerNexus] = await Promise.all([
      prisma.marketListing.findUnique({
        where: { id: listingId },
        include: { sellerNexus: true },
      }),
      prisma.nexus.findUnique({ where: { id: parsedBuyerNexusId } }),
    ]);

    if (!listing) {
      return res.status(404).json({ error: 'Listing not found' });
    }
    if (!buyerNexus || buyerNexus.ownerId !== req.userId || buyerNexus.galaxyId !== req.galaxyId) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    if (listing.galaxyId !== req.galaxyId) {
      return res.status(403).json({ error: 'Listing is in a different galaxy' });
    }
    if (listing.sellerNexus.ownerId === req.userId) {
      return res.status(400).json({ error: 'Cannot buy your own listing' });
    }
    if ((buyerNexus[listing.wantResource] || 0) < listing.wantAmount) {
      return res.status(400).json({ error: `Insufficient ${listing.wantResource}` });
    }

    const [sellerOwner, buyerOwner] = await Promise.all([
      listing.sellerNexus.ownerId
        ? prisma.user.findUnique({ where: { id: listing.sellerNexus.ownerId }, select: { username: true } })
        : null,
      prisma.user.findUnique({ where: { id: buyerNexus.ownerId }, select: { username: true } }),
    ]);

    await prisma.$transaction([
      // Buyer pays wanted resource, receives offered resource
      prisma.nexus.update({
        where: { id: parsedBuyerNexusId },
        data: {
          [listing.wantResource]: buyerNexus[listing.wantResource] - listing.wantAmount,
          [listing.offerResource]: buyerNexus[listing.offerResource] + listing.offerAmount,
        },
      }),
      // Seller receives wanted resource
      prisma.nexus.update({
        where: { id: listing.sellerNexusId },
        data: {
          [listing.wantResource]: listing.sellerNexus[listing.wantResource] + listing.wantAmount,
        },
      }),
      prisma.marketListing.delete({ where: { id: listingId } }),
      prisma.marketTransaction.create({
        data: {
          galaxyId: req.galaxyId,
          sellerNexusId: listing.sellerNexusId,
          sellerUsername: sellerOwner?.username ?? 'Unknown',
          buyerNexusId: parsedBuyerNexusId,
          buyerUsername: buyerOwner?.username ?? 'Unknown',
          offerResource: listing.offerResource,
          offerAmount: listing.offerAmount,
          wantResource: listing.wantResource,
          wantAmount: listing.wantAmount,
        },
      }),
    ]);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get last 10 completed transactions
router.get('/history', auth, async (req, res) => {
  try {
    const transactions = await prisma.marketTransaction.findMany({
      where: { galaxyId: req.galaxyId },
      orderBy: { completedAt: 'desc' },
      take: 10,
    });
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Cancel a listing (seller only — refund offered resource)
router.delete('/:id', auth, async (req, res) => {
  try {
    const listingId = parsePositiveInt(req.params.id);
    if (!listingId) return res.status(400).json({ error: 'Invalid listing ID' });

    const listing = await prisma.marketListing.findUnique({
      where: { id: listingId },
      include: { sellerNexus: true },
    });

    if (!listing) return res.status(404).json({ error: 'Listing not found' });
    if (listing.sellerNexus.ownerId !== req.userId || listing.galaxyId !== req.galaxyId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await prisma.$transaction([
      prisma.nexus.update({
        where: { id: listing.sellerNexusId },
        data: {
          [listing.offerResource]: listing.sellerNexus[listing.offerResource] + listing.offerAmount,
        },
      }),
      prisma.marketListing.delete({ where: { id: listingId } }),
    ]);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// System market: buy a resource by paying another at a 1.25:1 cost
router.post('/system/buy', auth, async (req, res) => {
  try {
    const { nexusId, receiveResource, receiveAmount, payResource } = req.body;
    const parsedNexusId = parsePositiveInt(nexusId);
    const parsedReceive = parsePositiveInt(receiveAmount);

    if (!parsedNexusId || !parsedReceive) {
      return res.status(400).json({ error: 'Invalid parameters' });
    }
    if (!VALID_RESOURCES.has(receiveResource) || !VALID_RESOURCES.has(payResource)) {
      return res.status(400).json({ error: 'Invalid resource type' });
    }
    if (receiveResource === payResource) {
      return res.status(400).json({ error: 'Resources must differ' });
    }

    const rawNexus = await prisma.nexus.findUnique({ where: { id: parsedNexusId } });
    if (!rawNexus || rawNexus.ownerId !== req.userId || rawNexus.galaxyId !== req.galaxyId) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    const nexus = await refreshResources(rawNexus);

    const cost = Math.ceil(parsedReceive * SYSTEM_BUY_RATE);
    if ((nexus[payResource] || 0) < cost) {
      return res.status(400).json({ error: `Insufficient ${payResource} — need ${cost}` });
    }

    await prisma.nexus.update({
      where: { id: parsedNexusId },
      data: {
        [payResource]: nexus[payResource] - cost,
        [receiveResource]: nexus[receiveResource] + parsedReceive,
      },
    });

    res.json({ success: true, paid: cost, received: parsedReceive });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
