import { Router } from 'express';
import type { Response } from 'express';
import * as queueTemplateController from '../controllers/queueTemplateController.js';
import auth from '../middleware/auth.js';
import type { AuthRequest } from '../types/index.js';

const router = Router();

router.post('/', auth, (req, res) =>
	queueTemplateController.saveQueueTemplate(req as AuthRequest, res as Response)
);
router.get('/', auth, (req, res) =>
	queueTemplateController.getQueueTemplates(req as AuthRequest, res as Response)
);
router.delete('/:id', auth, (req, res) =>
	queueTemplateController.deleteQueueTemplate(req as AuthRequest, res as Response)
);

export default router;
