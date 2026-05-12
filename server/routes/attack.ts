import { Router } from 'express';
import type { Response } from 'express';
import * as attackController from '../controllers/attackController.js';
import auth from '../middleware/auth.js';
import type { AuthRequest } from '../types/index.js';

const router = Router();

router.post('/send', auth, (req, res) => attackController.sendAttack(req as AuthRequest, res as Response));
router.get('/incoming/:nexusId', auth, (req, res) => attackController.getIncomingAttacks(req as AuthRequest, res as Response));
router.get('/outgoing/:nexusId', auth, (req, res) => attackController.getOutgoingAttacks(req as AuthRequest, res as Response));

export default router;
