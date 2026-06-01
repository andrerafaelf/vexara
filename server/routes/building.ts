import { Router } from 'express';
import type { Response } from 'express';
import * as buildingController from '../controllers/buildingController.js';
import auth from '../middleware/auth.js';
import type { AuthRequest } from '../types/index.js';

const router = Router();

router.post('/upgrade', auth, (req, res) =>
	buildingController.upgradeBuilding(req as AuthRequest, res as Response)
);
router.post('/cancel-queue', auth, (req, res) =>
	buildingController.cancelBuildQueue(req as AuthRequest, res as Response)
);
router.post('/check-queue', auth, (req, res) =>
	buildingController.checkBuildQueue(req as AuthRequest, res as Response)
);

export default router;
