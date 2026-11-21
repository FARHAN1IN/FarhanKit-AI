import { parseCookies } from '../utils/cookies.js';
import AppError from '../utils/AppError.js';
import { userService, USER_COOKIE } from '../services/user.service.js';

/** Sets req.user when the visitor is signed in (never fails). */
export async function loadUser(req, _res, next) {
  try {
    req.user = await userService.verify(parseCookies(req.headers.cookie)[USER_COOKIE]);
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
