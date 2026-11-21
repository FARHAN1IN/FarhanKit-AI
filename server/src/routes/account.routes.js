import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import config from '../config/index.js';
import validateBody from '../middlewares/validate.js';
import asyncHandler from '../utils/asyncHandler.js';
import { loadUser } from '../middlewares/user-auth.js';
import { userSignupSchema, userLoginSchema } from '../validators/index.js';
import { userService, publicUser, USER_COOKIE } from '../services/user.service.js';

const router = Router();
const isTest = config.env === 'test';

// New accounts: at most 3 per network per day (stops mass-creating accounts for free reviews)
const signupLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  limit: isTest ? 1000 : 3,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, error: { message: 'Too many new accounts from your network today — please try again tomorrow or log in.' } },
});
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isTest ? 1000 : 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, error: { message: 'Too many login attempts — please wait 15 minutes.' } },
});

const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: config.env === 'production',
  path: '/api',
});
/** Cookie + token both expire after the admin-set session length. */
async function startSession(res, user) {
  const { token, maxAge } = await userService.token(user);
  res.cookie(USER_COOKIE, token, { ...cookieOptions(), maxAge });
}

router.post('/signup', signupLimiter, validateBody(userSignupSchema), asyncHandler(async (req, res) => {
  const user = await userService.signup(req.body);
  await startSession(res, user);
  res.status(201).json({ success: true, data: { user: publicUser(user) } });
}));

router.post('/login', loginLimiter, validateBody(userLoginSchema), asyncHandler(async (req, res) => {
  const user = await userService.login(req.body);
  await startSession(res, user);
  res.json({ success: true, data: { user: publicUser(user) } });
}));

router.post('/logout', (_req, res) => {
  res.clearCookie(USER_COOKIE, cookieOptions());
  res.json({ success: true });
});

router.get('/me', loadUser, (req, res) => res.json({ success: true, data: { user: publicUser(req.user) } }));

export default router;
