import { Router } from 'express';
import type { Response } from 'express';
import * as marketController from '../controllers/marketController.js';
import auth from '../middleware/auth.js';
import type { AuthRequest } from '../types/index.js';

const router = Router();

router.get('/', auth, (req, res) =>
	marketController.getListings(req as AuthRequest, res as Response)
);
router.post('/list', auth, (req, res) =>
	marketController.createListing(req as AuthRequest, res as Response)
);
router.post('/buy/:id', auth, (req, res) =>
	marketController.buyListing(req as AuthRequest, res as Response)
);
router.get('/history', auth, (req, res) =>
	marketController.getHistory(req as AuthRequest, res as Response)
);
router.delete('/:id', auth, (req, res) =>
	marketController.cancelListing(req as AuthRequest, res as Response)
);
router.post('/system/buy', auth, (req, res) =>
	marketController.systemBuy(req as AuthRequest, res as Response)
);

export default router;
