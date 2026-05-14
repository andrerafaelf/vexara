import { Router } from 'express';
import { alphaSignup, login, register } from '../controllers/authController.js';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/alpha-signup', alphaSignup);

export default router;
