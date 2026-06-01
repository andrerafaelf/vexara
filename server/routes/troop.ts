import { Router } from 'express';
import type { Response } from 'express';
import * as troopController from '../controllers/troopController.js';
import auth from '../middleware/auth.js';
import type { AuthRequest } from '../types/index.js';

const router = Router();

router.post('/train', auth, (req, res) =>
	troopController.trainTroops(req as AuthRequest, res as Response)
);
router.post('/cancel-queue', auth, (req, res) =>
	troopController.cancelTrainingQueue(req as AuthRequest, res as Response)
);
router.post('/check-queue', auth, (req, res) =>
	troopController.checkTrainingQueue(req as AuthRequest, res as Response)
);

export default router;
