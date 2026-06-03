import { Router } from 'express';
import type { Response } from 'express';
import * as attackController from '../controllers/attackController.js';
import auth from '../middleware/auth.js';
import type { AuthRequest } from '../types/index.js';

const router = Router();

router.post('/send', auth, (req, res) =>
	attackController.sendAttack(req as AuthRequest, res as Response)
);

// Server-side scheduled waves (fire whether or not the planning client is online)
router.post('/schedule', auth, (req, res) =>
	attackController.scheduleAttack(req as AuthRequest, res as Response)
);
router.get('/scheduled', auth, (req, res) =>
	attackController.getScheduledAttacks(req as AuthRequest, res as Response)
);
router.delete('/scheduled/:id', auth, (req, res) =>
	attackController.cancelScheduledAttack(req as AuthRequest, res as Response)
);
router.get('/all', auth, (req, res) =>
	attackController.getAllAttacks(req as AuthRequest, res as Response)
);
router.get('/incoming/:nexusId', auth, (req, res) =>
	attackController.getIncomingAttacks(req as AuthRequest, res as Response)
);
router.get('/outgoing/:nexusId', auth, (req, res) =>
	attackController.getOutgoingAttacks(req as AuthRequest, res as Response)
);

export default router;
