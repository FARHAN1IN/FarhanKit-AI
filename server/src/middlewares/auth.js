import config from '../config/index.js';
import { authService } from '../services/auth.service.js';
import { parseCookies } from '../utils/cookies.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';

/** Reads the session cookie and attaches req.admin = username, or rejects with 401. */
const requireAdmin = asyncHandler(async (req, _res, next) => {
  const token = parseCookies(req.get('cookie'))[config.session.cookieName];
  const username = await authService.verify(token);
  if (!username) throw AppError.unauthorized('Please sign in');
  req.admin = username;
  next();
});

export default requireAdmin;
