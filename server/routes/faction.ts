import { Router } from 'express';
import * as factionController from '../controllers/factionController.js';
import auth from '../middleware/auth.js';

const router = Router();

router.use(auth);

router.get('/my', factionController.getMyFaction);
router.get('/:id', factionController.getFaction);
router.get('/galaxy/list', factionController.listFactionsInGalaxy);
router.post('/', factionController.createFaction);
router.post('/:id/invite', factionController.inviteToFaction);
router.get('/invites/list', factionController.getMyInvites);
router.post('/invites/:inviteId/accept', factionController.acceptInvite);
router.delete('/invites/:inviteId', factionController.declineInvite);
router.patch('/:id/members/:userId/role', factionController.setMemberRole);
router.delete('/:id/members/:userId', factionController.kickMember);
router.post('/:id/leave', factionController.leaveFaction);
router.delete('/:id', factionController.disbandFaction);

export default router;
