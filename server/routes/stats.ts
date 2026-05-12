import { Router } from 'express';
import type { Response } from 'express';
import * as statsController from '../controllers/statsController.js';
import auth from '../middleware/auth.js';
import type { AuthRequest } from '../types/index.js';

const router = Router();

router.get('/me', auth, (req, res) => statsController.getMyStats(req as AuthRequest, res as Response));
router.get('/timeline', auth, (req, res) => statsController.getTimeline(req as AuthRequest, res as Response));

export default router;
