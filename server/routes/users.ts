import { Router } from 'express';
import type { Response, Request, NextFunction } from 'express';
import * as usersController from '../controllers/usersController.js';
import auth from '../middleware/auth.js';
import type { AuthRequest } from '../types/index.js';

const router = Router();

function authNoGalaxy(req: Request, res: Response, next: NextFunction) {
  (req as AuthRequest).activeGalaxyOptional = true;
  return auth(req, res, next);
}

router.get('/me', authNoGalaxy, (req, res) => usersController.getMe(req as AuthRequest, res as Response));
router.get('/', auth, (req, res) => usersController.listPlayersInGalaxy(req as AuthRequest, res as Response));
router.get('/:username/profile', auth, (req, res) => usersController.getPublicProfile(req as AuthRequest, res as Response));
router.post('/me/change-password', auth, (req, res) => usersController.changePassword(req as AuthRequest, res as Response));

export default router;
