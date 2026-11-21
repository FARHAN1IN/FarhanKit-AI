/**
 * Visitor accounts (for AI reviews): email + password, free reviews and paid credits per account.
 * Sessions are signed cookies; changing the password ends old sessions.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import config from '../config/index.js';
import AppError from '../utils/AppError.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { userRepository } from '../repositories/index.js';
import { settingsService } from './index.js';

export const USER_COOKIE = 'portfolio_user';
/** Login length in ms — set by the admin (Settings → Visitor accounts), 1–365 days. */
export async function sessionMs() {
  const days = Number((await settingsService.get()).accounts?.sessionDays) || 30;
  return Math.min(365, Math.max(1, days)) * 24 * 60 * 60 * 1000;
}

// Well-known throwaway inbox services — blocked so free reviews can't be farmed with them.
const DISPOSABLE = new Set(
  `mailinator.com guerrillamail.com guerrillamail.net guerrillamailblock.com sharklasers.com grr.la 10minutemail.com
  10minutemail.net temp-mail.org temp-mail.io tempmail.com tempmail.net tempmailo.com tempr.email tmpmail.org yopmail.com
  yopmail.net trashmail.com trashmail.de getnada.com nada.email dispostable.com maildrop.cc throwawaymail.com fakeinbox.com
  emailondeck.com mintemail.com mohmal.com discard.email mailnesia.com burnermail.io spamgourmet.com moakt.com
  1secmail.com 1secmail.net mail.tm inboxkitten.com mytemp.email tempail.com emailfake.com fakemail.net mailcatch.com
  spambox.us mailpoof.com tempinbox.com luxusmail.org minuteinbox.com dropmail.me 33mail.com anonaddy.me`.split(/\s+/),
);

/** Lower-case; for Gmail ignore dots and "+tag", for others ignore "+tag" — so one inbox = one account. */
export function canonicalEmail(email) {
  const [local = '', domain = ''] = String(email).trim().toLowerCase().split('@');
  const base = local.split('+')[0];
  const gmail = domain === 'gmail.com' || domain === 'googlemail.com';
  return `${gmail ? base.replace(/\./g, '') : base}@${gmail ? 'gmail.com' : domain}`;
}

export const publicUser = (u) => (u ? { id: u.id, name: u.name, email: u.email, createdAt: u.createdAt } : null);

/**
 * Session token = "<userId>.<issuedAt>.<signature>". The signature covers the password hash,
 * the user's own session version (admin "Log out" for one user) and the global session version
 * (admin "Log out all visitors") — bumping either ends existing sessions at once.
 * Expiry is NOT baked into the token: it is issuedAt + the CURRENT admin setting, so changing
 * the session length in admin applies immediately to everyone.
 */
const sign = (id, iat, user, globalVersion) =>
  createHmac('sha256', config.session.secret)
    .update(`user|${id}|${iat}|${user.passwordHash}|${user.sessionVersion ?? 0}|${globalVersion}`)
    .digest('base64url');

const globalVersion = async () => Number((await settingsService.get()).accounts?.sessionVersion) || 0;

export const userService = {
  async signup({ name = '', email, password }) {
    const canonical = canonicalEmail(email);
    const domain = canonical.split('@')[1];
    if (DISPOSABLE.has(domain)) throw AppError.badRequest('Please use your real email address — temporary email services are not allowed.');
    const all = await userRepository.findAll();
    if (all.some((u) => u.canonicalEmail === canonical)) {
      throw new AppError('An account with this email already exists — please log in.', 409);
    }
    return userRepository.create({
      name: name.trim(),
      email: String(email).trim().toLowerCase(),
      canonicalEmail: canonical,
      passwordHash: await hashPassword(password),
      freeUsed: 0,
      credits: 0,
      lastLoginAt: new Date().toISOString(), // signing up logs them in
    });
  },

  async login({ email, password }) {
    const canonical = canonicalEmail(email);
    const user = (await userRepository.findAll()).find((u) => u.canonicalEmail === canonical);
    // same message whether the email or the password is wrong
    if (!user || !(await verifyPassword(password, user.passwordHash))) throw new AppError('Incorrect email or password.', 401);
    await userRepository.update(user.id, { lastLoginAt: new Date().toISOString() });
    return user;
  },

  /** New signed session token; cookie lifetime = the admin-set session length. */
  async token(user) {
    const iat = Date.now();
    return { token: `${user.id}.${iat}.${sign(user.id, iat, user, await globalVersion())}`, maxAge: await sessionMs() };
  },

  /**
   * Checks a session token. Returns { user, remainingMs } or null.
   * remainingMs lets the cookie be refreshed when the admin changes the session length.
   */
  async verify(token) {
    const [id, iatStr, sig] = String(token ?? '').split('.');
    const iat = Number(iatStr);
    if (!id || !sig || !iat) return null;
    const remainingMs = iat + (await sessionMs()) - Date.now();
    if (remainingMs <= 0) return null;
    const user = await userRepository.findById(id);
    if (!user) return null;
    const expected = Buffer.from(sign(id, iat, user, await globalVersion()));
    const given = Buffer.from(sig);
    return expected.length === given.length && timingSafeEqual(expected, given) ? { user, remainingMs } : null;
  },

  /** Admin: end one visitor's sessions (all devices). */
  async logoutUser(id) {
    const user = await userRepository.findById(id);
    if (!user) throw AppError.notFound('Account not found');
    await userRepository.update(id, { sessionVersion: (user.sessionVersion ?? 0) + 1 });
  },

  /** Admin: end every visitor session at once. */
  async logoutAll() {
    const s = await settingsService.get();
    const { updatedAt: _u, ...doc } = s;
    await settingsService.replace({ ...doc, accounts: { ...s.accounts, sessionVersion: (Number(s.accounts?.sessionVersion) || 0) + 1 } });
  },

  findByEmail: async (email) => (await userRepository.findAll()).find((u) => u.canonicalEmail === canonicalEmail(email)) ?? null,
  count: async () => (await userRepository.findAll()).length,
};
