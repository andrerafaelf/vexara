import { Router } from 'express';
import type { Response } from 'express';
import * as transferController from '../controllers/troopTransferController.js';
import auth from '../middleware/auth.js';
import type { AuthRequest } from '../types/index.js';

const router = Router();

router.post('/send', auth, (req, res) => transferController.sendTroops(req as AuthRequest, res as Response));
router.post('/:transferId/recall', auth, (req, res) => transferController.recallTroops(req as AuthRequest, res as Response));
router.post('/:transferId/send-back', auth, (req, res) => transferController.sendBack(req as AuthRequest, res as Response));
router.get('/nexus/:nexusId', auth, (req, res) => transferController.getTransfersForNexus(req as AuthRequest, res as Response));

export default router;
