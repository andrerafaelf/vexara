import { Router } from 'express';
import type { Response } from 'express';
import * as galaxyController from '../controllers/galaxyController.js';
import auth from '../middleware/auth.js';
import type { AuthRequest } from '../types/index.js';
import type { Request, NextFunction } from 'express';

const router = Router();

function authNoGalaxy(req: Request, res: Response, next: NextFunction) {
	(req as AuthRequest).activeGalaxyOptional = true;
	return auth(req, res, next);
}

router.get('/public/status', (req, res) =>
	galaxyController.getPublicGalaxyStatus(req as AuthRequest, res as Response)
);
router.get('/hall-of-fame', (req, res) =>
	galaxyController.getHallOfFame(req, res as Response)
);
router.get('/', authNoGalaxy, (req, res) =>
	galaxyController.listGalaxies(req as AuthRequest, res as Response)
);
router.get('/me', authNoGalaxy, (req, res) =>
	galaxyController.getMyGalaxy(req as AuthRequest, res as Response)
);
router.get('/:id/win-results', authNoGalaxy, (req, res) =>
	galaxyController.getGalaxyWinResults(req as AuthRequest, res as Response)
);
router.post('/:id/leave', authNoGalaxy, (req, res) =>
	galaxyController.leaveGalaxy(req as AuthRequest, res as Response)
);
router.post('/:id/select', authNoGalaxy, (req, res) =>
	galaxyController.selectGalaxy(req as AuthRequest, res as Response)
);
router.post('/:id/alert', authNoGalaxy, (req, res) =>
	galaxyController.registerGalaxyAlert(req as AuthRequest, res as Response)
);

export default router;
