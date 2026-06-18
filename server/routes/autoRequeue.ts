import { Router } from 'express';
import type { Response } from 'express';
import * as autoRequeueController from '../controllers/autoRequeueController.js';
import auth from '../middleware/auth.js';
import type { AuthRequest } from '../types/index.js';

const router = Router();

router.post('/', auth, (req, res) =>
	autoRequeueController.createAutoRequeueRule(req as AuthRequest, res as Response)
);
router.get('/', auth, (req, res) =>
	autoRequeueController.getAutoRequeueRules(req as AuthRequest, res as Response)
);
router.patch('/:id', auth, (req, res) =>
	autoRequeueController.setAutoRequeueRuleActive(req as AuthRequest, res as Response)
);
router.delete('/:id', auth, (req, res) =>
	autoRequeueController.deleteAutoRequeueRule(req as AuthRequest, res as Response)
);

export default router;
