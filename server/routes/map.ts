import { Router } from 'express';
import type { Response } from 'express';
import * as mapController from '../controllers/mapController.js';
import auth from '../middleware/auth.js';
import type { AuthRequest } from '../types/index.js';

const router = Router();

router.get('/events', auth, (req, res) => mapController.getGalaxyEvents(req as AuthRequest, res as Response));
router.get('/area/:x/:y', auth, (req, res) => mapController.getArea(req as AuthRequest, res as Response));
router.get('/nexus/:nexusId', auth, (req, res) => mapController.getNexusIntel(req as AuthRequest, res as Response));

export default router;
