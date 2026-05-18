import { Router } from 'express';
import type { Response } from 'express';
import * as referralController from '../controllers/referralController.js';
import auth from '../middleware/auth.js';
import type { AuthRequest } from '../types/index.js';

const router = Router();

router.get('/', auth, (req, res) => referralController.getMyReferrals(req as AuthRequest, res as Response));
router.get('/pending', auth, (req, res) => referralController.getMyPendingTokens(req as AuthRequest, res as Response));
router.get('/my-code', auth, (req, res) => referralController.getMyReferralCode(req as AuthRequest, res as Response));
router.get('/my-referrer', auth, (req, res) => referralController.getMyReferrer(req as AuthRequest, res as Response));
router.post('/tokens/:tokenId/redeem', auth, (req, res) => referralController.redeemToken(req as AuthRequest, res as Response));
router.post('/milestone-tokens/:tokenId/redeem', auth, (req, res) => referralController.redeemMilestoneToken(req as AuthRequest, res as Response));

export default router;
