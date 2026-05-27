import { Router } from 'express';
import type { Response } from 'express';
import * as statsController from '../controllers/statsController.js';
import * as dailyStreakService from '../services/dailyStreakService.js';
import auth from '../middleware/auth.js';
import type { AuthRequest } from '../types/index.js';

const router = Router();

router.get('/me', auth, (req, res) => statsController.getMyStats(req as AuthRequest, res as Response));
router.get('/timeline', auth, (req, res) => statsController.getTimeline(req as AuthRequest, res as Response));

router.get('/daily-streak', auth, async (req, res) => {
  try {
    const authReq = req as AuthRequest;
    if (!authReq.galaxyId) { res.status(409).json({ error: 'No active galaxy' }); return; }
    const data = await dailyStreakService.getDailyStreakData(authReq.userId, authReq.galaxyId);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/daily-streak/claim', auth, async (req, res) => {
  try {
    const authReq = req as AuthRequest;
    if (!authReq.galaxyId) { res.status(409).json({ error: 'No active galaxy' }); return; }
    const result = await dailyStreakService.claimDailyRewards(authReq.userId, authReq.galaxyId);
    if ('error' in result) { res.status(400).json(result); return; }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
