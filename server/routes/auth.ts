import { Router } from 'express';
import { alphaSignup, alphaSignupCount, login, register } from '../controllers/authController.js';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/alpha-signup', alphaSignup);
router.get('/alpha-signup/count', alphaSignupCount);

export default router;
