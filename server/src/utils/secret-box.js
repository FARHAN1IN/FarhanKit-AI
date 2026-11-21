/**
 * Encrypts secrets (AI API keys) before they are stored, with AES-256-GCM.
 * The key is derived from SESSION_SECRET, so a copy of the database alone doesn't reveal them.
 * Note: if SESSION_SECRET changes, stored keys can't be decrypted and must be entered again.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import config from '../config/index.js';

const key = () => createHash('sha256').update(`ai-keys|${config.session.secret}`).digest();

export function seal(plain) {
  if (!plain) return '';
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':');
}

/** Returns '' when the value can't be decrypted (e.g. SESSION_SECRET changed). */
export function open(sealed) {
  if (!sealed) return '';
  try {
    const [v, iv, tag, data] = sealed.split(':');
    if (v !== 'v1') return '';
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

/** "sk-abc…wxyz" → "••••wxyz" */
export const mask = (plain) => (plain ? `••••${plain.slice(-4)}` : '');
