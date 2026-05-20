import { Router } from 'express';
import {
  alphaSignup,
  alphaSignupCount,
  login,
  register,
  // registerReal, real registration. On launch day, swap the /register route below from `register` to `registerReal`.
  registerReal as _registerReal,
  requestPasswordReset,
  resendVerification,
  resetPassword,
  verifyEmail,
} from '../controllers/authController.js';
import { sendTestAlphaEmail } from '../controllers/unsubscribeController.js';

void _registerReal; // suppress unused-import warning until launch day

const router = Router();

// LAUNCH SWAP: change `register` to `registerReal` to enable real account creation.
router.post('/register', register);
router.post('/login', login);
router.post('/verify-email', verifyEmail);
router.post('/resend-verification', resendVerification);
router.post('/request-password-reset', requestPasswordReset);
router.post('/reset-password', resetPassword);
router.post('/alpha-signup', alphaSignup);
router.get('/alpha-signup/count', alphaSignupCount);
router.post('/alpha-signup/test-email', sendTestAlphaEmail);

export default router;
