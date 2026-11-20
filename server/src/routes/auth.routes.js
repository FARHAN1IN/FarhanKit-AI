import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import config from '../config/index.js';
import requireAdmin from '../middlewares/auth.js';
import validateBody from '../middlewares/validate.js';
import { loginSchema, accountSchema } from '../validators/index.js';
import * as ctrl from '../controllers/auth.controller.js';

const router = Router();

// Brute-force protection: 10 failed attempts per IP per 15 minutes.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.env === 'test' ? 1000 : 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, error: { message: 'Too many login attempts — try again in 15 minutes.' } },
});

router.post('/login', loginLimiter, validateBody(loginSchema), ctrl.login);
router.post('/logout', ctrl.logout);
router.get('/me', requireAdmin, ctrl.me);
router.put('/account', requireAdmin, validateBody(accountSchema), ctrl.updateAccount);

export default router;
