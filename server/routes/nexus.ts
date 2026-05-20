import { Router } from 'express';
import * as nexusController from '../controllers/nexusController.js';
import auth from '../middleware/auth.js';
import type { AuthRequest } from '../types/index.js';
import type { Request, NextFunction, Response } from 'express';

function authNoGalaxy(req: Request, res: Response, next: NextFunction) {
  (req as AuthRequest).activeGalaxyOptional = true;
  return auth(req, res, next);
}

const router = Router();

router.get('/my-nexuses', authNoGalaxy, (req, res) => nexusController.getMyNexuses(req as AuthRequest, res as Response));
router.post('/create', auth, (req, res) => nexusController.createNexus(req as AuthRequest, res as Response));
router.post('/transfer-resources', auth, (req, res) => nexusController.transferResources(req as AuthRequest, res as Response));
router.get('/groups', auth, (req, res) => nexusController.getGroups(req as AuthRequest, res as Response));
router.post('/groups', auth, (req, res) => nexusController.createGroup(req as AuthRequest, res as Response));
router.patch('/groups/:groupId', auth, (req, res) => nexusController.renameGroup(req as AuthRequest, res as Response));
router.delete('/groups/:groupId', auth, (req, res) => nexusController.deleteGroup(req as AuthRequest, res as Response));
router.put('/groups/:groupId/nexuses', auth, (req, res) => nexusController.setGroupNexuses(req as AuthRequest, res as Response));
router.patch('/:nexusId/name', auth, (req, res) => nexusController.renameNexus(req as AuthRequest, res as Response));
router.post('/:nexusId/specialize', auth, (req, res) => nexusController.specializeNexus(req as AuthRequest, res as Response));
router.get('/:nexusId', auth, (req, res) => nexusController.getNexus(req as AuthRequest, res as Response));

export default router;
