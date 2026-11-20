import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import config from '../config/index.js';
import { adminRepository } from '../repositories/index.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import AppError from '../utils/AppError.js';

/*
 * Stateless signed session tokens:  base64url(payload) "." base64url(HMAC-SHA256)
 * payload = { sub: username, v: credentialVersion, exp: epochMs }
 *
 * `v` is derived from the stored password hash, so changing the username or
 * password instantly invalidates every existing session.
 */

const b64 = (buf) => Buffer.from(buf).toString('base64url');
const sign = (data) => createHmac('sha256', config.session.secret).update(data).digest();
const versionOf = (account) => createHash('sha256').update(`${account.username}:${account.passwordHash}`).digest('base64url').slice(0, 16);

// A dummy hash so failed logins for unknown users take as long as real ones.
const DUMMY_HASH = await hashPassword('dummy-password-for-timing');

function issueToken(account) {
  const payload = b64(JSON.stringify({ sub: account.username, v: versionOf(account), exp: Date.now() + config.session.ttlMs }));
  return `${payload}.${b64(sign(payload))}`;
}

async function getAccount() {
  const doc = await adminRepository.getDocument();
  return doc.username && doc.passwordHash ? doc : null;
}

export const authService = {
  isConfigured: async () => Boolean(await getAccount()),

  /** Creates or overwrites the admin account (used by the CLI script and env bootstrap). */
  async setCredentials(username, password) {
    const passwordHash = await hashPassword(password);
    await adminRepository.saveDocument({ username, passwordHash, updatedAt: new Date().toISOString() });
  },

  /** If no account exists yet, create one from ADMIN_USERNAME / ADMIN_PASSWORD. */
  async bootstrapFromEnv() {
    if (await getAccount()) return false;
    const { username, password } = config.bootstrapAdmin;
    if (!username || !password) return false;
    await this.setCredentials(username, password);
    return true;
  },

  /** @returns {{ token, username }} */
  async login(username, password) {
    const account = await getAccount();
    if (!account) throw new AppError('No admin account exists yet. Run: npm run admin:set -- <username> <password>', 503);

    const userOk = account.username.toLowerCase() === username.toLowerCase();
    const passOk = await verifyPassword(password, userOk ? account.passwordHash : DUMMY_HASH);
    if (!userOk || !passOk) throw AppError.unauthorized('Incorrect username or password');

    return { token: issueToken(account), username: account.username };
  },

  /** Returns the username for a valid token, or null. */
  async verify(token) {
    if (!token || typeof token !== 'string') return null;
    const [payload, sig] = token.split('.');
    if (!payload || !sig) return null;

    // Compare the canonical encoded strings (rejects any alternate encoding of the same bytes).
    const expected = Buffer.from(b64(sign(payload)));
    const given = Buffer.from(sig);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

    let data;
    try { data = JSON.parse(Buffer.from(payload, 'base64url').toString()); } catch { return null; }
    if (!data.exp || data.exp < Date.now()) return null;

    const account = await getAccount();
    if (!account || account.username !== data.sub || versionOf(account) !== data.v) return null;
    return account.username;
  },

  /** Changes username and/or password; returns a fresh token (old sessions become invalid). */
  async updateCredentials({ currentPassword, username, newPassword }) {
    const account = await getAccount();
    if (!account || !(await verifyPassword(currentPassword, account.passwordHash))) {
      throw AppError.badRequest('Validation failed', { currentPassword: 'Current password is incorrect' });
    }
    const next = {
      username: username || account.username,
      passwordHash: newPassword ? await hashPassword(newPassword) : account.passwordHash,
      updatedAt: new Date().toISOString(),
    };
    await adminRepository.saveDocument(next);
    return { token: issueToken(next), username: next.username };
  },
};
