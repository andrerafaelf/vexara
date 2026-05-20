import { Router } from 'express';
import type { Response } from 'express';
import * as usersController from '../controllers/usersController.js';
import auth from '../middleware/auth.js';
import type { AuthRequest } from '../types/index.js';

const router = Router();

router.get('/:username/profile', auth, (req, res) => usersController.getPublicProfile(req as AuthRequest, res as Response));

export default router;
