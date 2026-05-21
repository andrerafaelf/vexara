import { Router } from 'express';
import type { Response } from 'express';
import * as notifController from '../controllers/notificationController.js';
import auth from '../middleware/auth.js';
import type { AuthRequest } from '../types/index.js';

const router = Router();

router.get('/vapid-public-key', notifController.getVapidPublicKey);
router.post('/subscribe', auth, (req, res) => notifController.subscribe(req as AuthRequest, res as Response));
router.delete('/subscribe', auth, (req, res) => notifController.unsubscribe(req as AuthRequest, res as Response));
router.get('/preferences', auth, (req, res) => notifController.getPreferences(req as AuthRequest, res as Response));
router.patch('/preferences', auth, (req, res) => notifController.updatePreferences(req as AuthRequest, res as Response));
router.get('/badges', auth, (req, res) => notifController.getBadges(req as AuthRequest, res as Response));

export default router;
