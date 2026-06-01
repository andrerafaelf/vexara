import { Router } from 'express';
import type { Response } from 'express';
import * as friendsController from '../controllers/friendsController.js';
import auth from '../middleware/auth.js';
import type { AuthRequest } from '../types/index.js';

const router = Router();

router.get('/', auth, (req, res) =>
	friendsController.listFriends(req as AuthRequest, res as Response)
);
router.get('/badges', auth, (req, res) =>
	friendsController.getBadges(req as AuthRequest, res as Response)
);
router.post('/request', auth, (req, res) =>
	friendsController.sendFriendRequest(req as AuthRequest, res as Response)
);
router.get('/requests', auth, (req, res) =>
	friendsController.listRequests(req as AuthRequest, res as Response)
);
router.post('/request/:id/accept', auth, (req, res) =>
	friendsController.acceptRequest(req as AuthRequest, res as Response)
);
router.post('/request/:id/decline', auth, (req, res) =>
	friendsController.declineRequest(req as AuthRequest, res as Response)
);
router.post('/request/:id/cancel', auth, (req, res) =>
	friendsController.cancelRequest(req as AuthRequest, res as Response)
);
router.delete('/:friendId', auth, (req, res) =>
	friendsController.unfriend(req as AuthRequest, res as Response)
);

export default router;
