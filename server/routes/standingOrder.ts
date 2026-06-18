import { Router } from 'express';
import type { Response } from 'express';
import * as standingOrderController from '../controllers/standingOrderController.js';
import auth from '../middleware/auth.js';
import type { AuthRequest } from '../types/index.js';

const router = Router();

router.post('/', auth, (req, res) =>
	standingOrderController.createStandingOrder(req as AuthRequest, res as Response)
);
router.get('/', auth, (req, res) =>
	standingOrderController.getStandingOrders(req as AuthRequest, res as Response)
);
router.patch('/:id', auth, (req, res) =>
	standingOrderController.setStandingOrderActive(req as AuthRequest, res as Response)
);
router.delete('/:id', auth, (req, res) =>
	standingOrderController.deleteStandingOrder(req as AuthRequest, res as Response)
);

export default router;
