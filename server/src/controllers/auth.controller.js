import config from '../config/index.js';
import asyncHandler from '../utils/asyncHandler.js';
import { authService } from '../services/auth.service.js';

/*
 * The session token is kept in an HttpOnly cookie: page scripts can't read it,
 * SameSite=Strict stops other sites from using it, and it has no Max-Age so the
 * browser drops it when closed (the token itself also expires server-side).
 */
const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'strict',
  secure: config.env === 'production',
  path: '/api',
});

const setSession = (res, token) => res.cookie(config.session.cookieName, token, cookieOptions());

export const login = asyncHandler(async (req, res) => {
  const { token, username } = await authService.login(req.body.username, req.body.password);
  setSession(res, token);
  res.json({ success: true, data: { username } });
});

export const logout = (_req, res) => {
  res.clearCookie(config.session.cookieName, cookieOptions());
  res.json({ success: true });
};

export const me = (req, res) => res.json({ success: true, data: { username: req.admin } });

export const updateAccount = asyncHandler(async (req, res) => {
  const { token, username } = await authService.updateCredentials(req.body);
  setSession(res, token);
  res.json({ success: true, data: { username } });
});
