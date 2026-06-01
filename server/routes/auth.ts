import { Router } from 'express';
import {
	alphaSignup,
	alphaSignupCount,
	login,
	register,
	requestPasswordReset,
	resendVerification,
	resetPassword,
	verifyEmail
} from '../controllers/authController.js';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/verify-email', verifyEmail);
router.post('/resend-verification', resendVerification);
router.post('/request-password-reset', requestPasswordReset);
router.post('/reset-password', resetPassword);
router.post('/alpha-signup', alphaSignup);
router.get('/alpha-signup/count', alphaSignupCount);

export default router;
