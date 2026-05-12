import { Router } from 'express';
import type { Response } from 'express';
import * as chatController from '../controllers/chatController.js';
import auth from '../middleware/auth.js';
import type { AuthRequest } from '../types/index.js';

const router = Router();

router.get('/conversations', auth, (req, res) => chatController.listConversations(req as AuthRequest, res as Response));
router.get('/unread-count', auth, (req, res) => chatController.getUnreadCount(req as AuthRequest, res as Response));
router.get('/:friendId/messages', auth, (req, res) => chatController.getMessages(req as AuthRequest, res as Response));
router.post('/:friendId/messages', auth, (req, res) => chatController.sendMessage(req as AuthRequest, res as Response));
router.post('/:friendId/read', auth, (req, res) => chatController.markRead(req as AuthRequest, res as Response));

export default router;
