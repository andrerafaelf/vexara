import { Router } from 'express';
import type { Response } from 'express';
import * as factionController from '../controllers/factionController.js';
import auth from '../middleware/auth.js';
import type { AuthRequest } from '../types/index.js';

const router = Router();

// Static routes first — must precede /:id to avoid param capture
router.get('/my', auth, (req, res) => factionController.getMyFaction(req as AuthRequest, res as Response));
router.get('/galaxy/list', auth, (req, res) => factionController.listFactionsInGalaxy(req as AuthRequest, res as Response));
router.get('/leaderboard', auth, (req, res) => factionController.getLeaderboard(req as AuthRequest, res as Response));
router.get('/invites/list', auth, (req, res) => factionController.getMyInvites(req as AuthRequest, res as Response));
router.post('/invites/:inviteId/accept', auth, (req, res) => factionController.acceptInvite(req as AuthRequest, res as Response));
router.delete('/invites/:inviteId', auth, (req, res) => factionController.declineInvite(req as AuthRequest, res as Response));

router.post('/', auth, (req, res) => factionController.createFaction(req as AuthRequest, res as Response));

// Parametric routes
router.get('/:id', auth, (req, res) => factionController.getFaction(req as AuthRequest, res as Response));
router.post('/:id/invite', auth, (req, res) => factionController.inviteToFaction(req as AuthRequest, res as Response));
router.patch('/:id/members/:userId/role', auth, (req, res) => factionController.setMemberRole(req as AuthRequest, res as Response));
router.delete('/:id/members/:userId', auth, (req, res) => factionController.kickMember(req as AuthRequest, res as Response));
router.post('/:id/leave', auth, (req, res) => factionController.leaveFaction(req as AuthRequest, res as Response));
router.delete('/:id', auth, (req, res) => factionController.disbandFaction(req as AuthRequest, res as Response));
router.patch('/:id/motd', auth, (req, res) => factionController.updateMotd(req as AuthRequest, res as Response));
router.get('/:id/chat', auth, (req, res) => factionController.getChatMessages(req as AuthRequest, res as Response));
router.post('/:id/chat', auth, (req, res) => factionController.sendChatMessage(req as AuthRequest, res as Response));
router.get('/:id/events', auth, (req, res) => factionController.getEvents(req as AuthRequest, res as Response));

export default router;
