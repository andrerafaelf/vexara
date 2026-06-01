import { Router } from 'express';
import type { Response } from 'express';
import * as ctrl from '../controllers/warRoomController.js';
import auth from '../middleware/auth.js';
import type { AuthRequest } from '../types/index.js';

const router = Router();

router.get('/starfield', auth, (req, res) =>
	ctrl.getGalaxyStarfield(req as AuthRequest, res as Response)
);
router.get('/operations', auth, (req, res) =>
	ctrl.listOperations(req as AuthRequest, res as Response)
);
router.post('/operations', auth, (req, res) =>
	ctrl.createOperation(req as AuthRequest, res as Response)
);
router.get('/operations/:operationId', auth, (req, res) =>
	ctrl.getOperation(req as AuthRequest, res as Response)
);
router.patch('/operations/:operationId', auth, (req, res) =>
	ctrl.updateOperation(req as AuthRequest, res as Response)
);
router.delete('/operations/:operationId', auth, (req, res) =>
	ctrl.deleteOperation(req as AuthRequest, res as Response)
);

router.post('/operations/:operationId/waves', auth, (req, res) =>
	ctrl.addWave(req as AuthRequest, res as Response)
);
router.patch('/waves/:waveId', auth, (req, res) =>
	ctrl.updateWave(req as AuthRequest, res as Response)
);
router.delete('/waves/:waveId', auth, (req, res) =>
	ctrl.deleteWave(req as AuthRequest, res as Response)
);

router.post('/waves/:waveId/slots', auth, (req, res) =>
	ctrl.claimSlot(req as AuthRequest, res as Response)
);
router.delete('/slots/:slotId', auth, (req, res) =>
	ctrl.releaseSlot(req as AuthRequest, res as Response)
);
router.post('/slots/:slotId/sent', auth, (req, res) =>
	ctrl.markSlotSent(req as AuthRequest, res as Response)
);

router.get('/operations/:operationId/thread', auth, (req, res) =>
	ctrl.getThread(req as AuthRequest, res as Response)
);
router.post('/operations/:operationId/thread', auth, (req, res) =>
	ctrl.postThreadMessage(req as AuthRequest, res as Response)
);

export default router;
