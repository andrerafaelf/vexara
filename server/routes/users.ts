import { Router } from 'express';
import type { Response, Request, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import * as usersController from '../controllers/usersController.js';
import * as avatarController from '../controllers/avatarController.js';
import auth from '../middleware/auth.js';
import type { AuthRequest } from '../types/index.js';

const router = Router();

function authNoGalaxy(req: Request, res: Response, next: NextFunction) {
  (req as AuthRequest).activeGalaxyOptional = true;
  return auth(req, res, next);
}

// Avatar uploads are CPU + bandwidth heavy. Cap each user to ~10/hour.
const avatarUploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String((req as AuthRequest).userId ?? req.ip),
  skip: (req) => req.method === 'OPTIONS',
  message: { error: 'Too many avatar uploads. Try again later.' },
});

router.get('/me', authNoGalaxy, (req, res) => usersController.getMe(req as AuthRequest, res as Response));
router.get('/', auth, (req, res) => usersController.listPlayersInGalaxy(req as AuthRequest, res as Response));
router.get('/:username/profile', auth, (req, res) => usersController.getPublicProfile(req as AuthRequest, res as Response));
router.post('/me/change-password', auth, (req, res) => usersController.changePassword(req as AuthRequest, res as Response));

router.post(
  '/me/avatar',
  authNoGalaxy,
  avatarUploadLimiter,
  (req, res, next) => avatarController.requireAvatarTier(req as AuthRequest, res as Response, next),
  (req, res, next) =>
    avatarController.avatarUpload(req, res, (err) => {
      if (err) {
        const msg = err instanceof Error ? err.message : 'Upload failed.';
        // multer surfaces file-size errors via err.code === 'LIMIT_FILE_SIZE'.
        if ((err as { code?: string }).code === 'LIMIT_FILE_SIZE') {
          res.status(400).json({ error: 'Image is too large (max 4 MB).' });
          return;
        }
        res.status(400).json({ error: msg });
        return;
      }
      next();
    }),
  (req, res) => avatarController.uploadAvatar(req as AuthRequest, res as Response),
);

router.delete(
  '/me/avatar',
  authNoGalaxy,
  (req, res) => avatarController.deleteAvatar(req as AuthRequest, res as Response),
);

export default router;
