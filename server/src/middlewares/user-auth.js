import { parseCookies } from '../utils/cookies.js';
import AppError from '../utils/AppError.js';
import config from '../config/index.js';
import { userService, USER_COOKIE } from '../services/user.service.js';

/**
 * Sets req.user when the visitor is signed in (never fails).
 * The cookie is re-sent with the remaining session time, so when the admin changes the
 * session length the browser cookie follows (longer or shorter) on the next request.
 */
export async function loadUser(req, res, next) {
  req.user = null;
  try {
    const result = await userService.verify(parseCookies(req.headers.cookie)[USER_COOKIE]);
    if (result) {
      req.user = result.user;
      const token = parseCookies(req.headers.cookie)[USER_COOKIE];
      res.cookie(USER_COOKIE, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.env === 'production',
        path: '/api',
        maxAge: Math.max(1000, result.remainingMs),
      });
    }
  } catch {
    req.user = null;
  }
  next();
}

/** 401 with code LOGIN_REQUIRED unless signed in. */
export async function requireUser(req, res, next) {
  await loadUser(req, res, () => {});
  if (!req.user) return next(new AppError('Please create a free account or log in to use AI reviews.', 401, { code: 'LOGIN_REQUIRED' }));
  next();
}
