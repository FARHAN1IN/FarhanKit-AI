import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const KEYLEN = 64;
const COST = 16384; // N — CPU/memory cost

/** Hashes a password with scrypt + random salt. Format: scrypt$N$salt$hash (hex). */
export async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, KEYLEN, { N: COST });
  return `scrypt$${COST}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

/** Constant-time comparison of a password against a stored hash. */
export async function verifyPassword(password, stored) {
  const [algo, n, saltHex, hashHex] = String(stored ?? '').split('$');
  if (algo !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scryptAsync(password, Buffer.from(saltHex, 'hex'), expected.length, { N: Number(n) });
  return timingSafeEqual(actual, expected);
}
