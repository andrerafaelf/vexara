import { Router } from 'express';
import * as adminController from '../controllers/internalAdminController.js';

const router = Router();

router.get('/users', adminController.getUsers);
router.get('/stats', adminController.getStats);
router.delete('/users/:userId', adminController.deleteUser);
router.post('/nexuses/:nexusId/resources', adminController.giveResources);
router.post('/nexuses/:nexusId/troops', adminController.addTroops);
router.post('/nexuses/:nexusId/buildings', adminController.addBuildings);
router.post('/nexuses/:nexusId/troops/reset', adminController.resetTroops);
router.post('/nexuses/:nexusId/buildings/reset', adminController.resetBuildings);
router.post('/nexuses/:nexusId/complete-build', adminController.completeBuild);
router.post('/nexuses/:nexusId/complete-training', adminController.completeTraining);
router.delete('/nexuses/:nexusId', adminController.deleteNexus);
router.get('/attacks', adminController.getAttacks);
router.post('/attacks/:attackId/complete', adminController.completeAttack);
router.post('/users/:userId/tokens', adminController.grantTokens);

export default router;
