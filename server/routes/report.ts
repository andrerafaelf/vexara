import { Router } from 'express';
import type { Response } from 'express';
import * as reportController from '../controllers/reportController.js';
import auth from '../middleware/auth.js';
import type { AuthRequest } from '../types/index.js';

const router = Router();

router.get('/reports/:nexusId', auth, (req, res) => reportController.getReports(req as AuthRequest, res as Response));
router.post('/read/:attackId', auth, (req, res) => reportController.markRead(req as AuthRequest, res as Response));
router.post('/read-all/:nexusId', auth, (req, res) => reportController.markAllRead(req as AuthRequest, res as Response));
router.get('/read-ids/:nexusId', auth, (req, res) => reportController.getReadIds(req as AuthRequest, res as Response));
router.get('/read-ids', auth, (req, res) => reportController.getReadIds(req as AuthRequest, res as Response));
router.get('/unread-nexus-ids', auth, (req, res) => reportController.getUnreadNexusIds(req as AuthRequest, res as Response));

export default router;
