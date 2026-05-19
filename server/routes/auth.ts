import { Router } from 'express';
import { alphaSignup, alphaSignupCount, login, register } from '../controllers/authController.js';
import { sendTestAlphaEmail } from '../controllers/unsubscribeController.js';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/alpha-signup', alphaSignup);
router.get('/alpha-signup/count', alphaSignupCount);
router.post('/alpha-signup/test-email', sendTestAlphaEmail);

export default router;
