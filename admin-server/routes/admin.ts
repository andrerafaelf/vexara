import { Router } from 'express';
import * as adminController from '../controllers/adminController.js';

const router = Router();

// Alpha signups admin endpoints
router.get('/alpha-signups/pending', adminController.listPendingAlphaSignups);
router.post('/alpha-signups/resend', adminController.resendAlphaRegistrationEmail);

// Galaxy launch broadcast (galaxy-live announcement email to all users + waitlist)
router.get('/broadcast/galaxy-live/preview', adminController.previewGalaxyLiveBroadcast);
router.post('/broadcast/galaxy-live/test', adminController.sendGalaxyLiveTest);
router.post('/broadcast/galaxy-live', adminController.sendGalaxyLiveBroadcast);

router.get('/galaxies', adminController.listGalaxies);
router.post('/galaxies', adminController.createGalaxy);
router.delete('/galaxies/:galaxyId', adminController.deleteGalaxy);
router.get('/users/all', adminController.listAllUsers);
router.get('/users', adminController.listUsers);
router.get('/stats', adminController.getStats);
router.get('/factions', adminController.listFactions);
router.patch('/factions/:factionId/members/:memberId/role', adminController.setFactionMemberRole);
router.delete('/factions/:factionId/members/:memberId', adminController.kickFactionMember);
router.delete('/factions/:factionId', adminController.disbandFaction);
router.post('/users', adminController.createUser);
router.patch('/users/:userId', adminController.updateUser);
router.post('/users/:userId/resources', adminController.addResourcesToUser);
router.post('/users/:userId/troops', adminController.addTroopsToUser);
router.post('/users/:userId/buildings', adminController.setBuildingForUser);
router.post('/users/:userId/complete-strike', adminController.completeStrikeForUser);
router.post('/users/:userId/complete-build', adminController.completeBuildForUser);
router.post('/users/:userId/complete-training', adminController.completeTrainingForUser);
router.post('/users/:userId/reset-account', adminController.resetAccount);
router.delete('/users/:userId', adminController.deleteUser);
router.post('/users/:userId/resend-verification', adminController.resendVerificationEmail);
router.post('/users/:userId/test-notification', adminController.testNotification);
router.post('/users/:userId/tokens', adminController.grantTokens);
router.post('/nexuses/:nexusId/resources', adminController.giveResourcesToNexus);
router.post('/nexuses/:nexusId/troops', adminController.addTroopsToNexus);
router.post('/nexuses/:nexusId/buildings', adminController.addBuildingsToNexus);
router.post('/nexuses/:nexusId/complete-build', adminController.completeBuildForNexus);
router.post('/nexuses/:nexusId/complete-training', adminController.completeTrainingForNexus);
router.delete('/nexuses/:nexusId', adminController.deleteNexus);
router.get('/attacks', adminController.listAttacks);
router.post('/attacks/:attackId/complete', adminController.completeAttack);

router.post('/users/:userId/flag', adminController.flagUser);
router.delete('/users/:userId/flag', adminController.unflagUser);
router.get('/flagged-users', adminController.listFlaggedUsers);

export default router;
