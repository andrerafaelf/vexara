import { Router } from 'express';
import type { Response } from 'express';
import * as attackController from '../controllers/attackController.js';
import * as spyController from '../controllers/spyController.js';
import auth from '../middleware/auth.js';
import type { AuthRequest } from '../types/index.js';

const router = Router();

router.post('/send', auth, (req, res) => attackController.sendAttack(req as AuthRequest, res as Response));
router.get('/all', auth, (req, res) => attackController.getAllAttacks(req as AuthRequest, res as Response));
router.get('/incoming/:nexusId', auth, (req, res) => attackController.getIncomingAttacks(req as AuthRequest, res as Response));
router.get('/outgoing/:nexusId', auth, (req, res) => attackController.getOutgoingAttacks(req as AuthRequest, res as Response));

// Espionage
router.post('/spy', auth, (req, res) => spyController.sendSpyMission(req as AuthRequest, res as Response));
router.get('/spy/logs', auth, (req, res) => spyController.getAllEspionageLogs(req as AuthRequest, res as Response));
router.get('/spy/missions/:nexusId', auth, (req, res) => spyController.getSpyMissions(req as AuthRequest, res as Response));
router.get('/spy/missions/:nexusId/completed', auth, (req, res) => spyController.getCompletedSpyMissions(req as AuthRequest, res as Response));
router.get('/spy/assets/:nexusId', auth, (req, res) => spyController.getSpyAssets(req as AuthRequest, res as Response));
router.get('/spy/assets/:nexusId/discovered', auth, (req, res) => spyController.getDiscoveredSpyAssets(req as AuthRequest, res as Response));
router.post('/spy/assets/:assetId/recall', auth, (req, res) => spyController.recallSpyAsset(req as AuthRequest, res as Response));
router.get('/spy/assets/:assetId/intel', auth, (req, res) => spyController.getEmbedIntel(req as AuthRequest, res as Response));

export default router;
