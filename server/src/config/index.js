import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { AI_PRESETS } from './ai-presets.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '..', '..');
const env = process.env.NODE_ENV ?? 'development';

let sessionSecret = process.env.SESSION_SECRET ?? '';
if (sessionSecret.length < 32) {
  if (env === 'production') throw new Error('SESSION_SECRET must be set (32+ random characters) in production.');
  // Dev/test fallback: random per process — sessions end when the server restarts.
  sessionSecret = randomBytes(32).toString('hex');
}

/**
 * AI providers configured through environment variables (optional — admins can also add
 * providers with their keys in admin → AI models). Every configured provider is used and
 * their reviews are merged. Default models can be overridden with <NAME>_MODEL, e.g. GEMINI_MODEL.
 */
function aiConfig() {
  const providers = Object.entries(AI_PRESETS)
    .filter(([type]) => type !== 'custom')
    .map(([type, p]) => {
      const NAME = type.toUpperCase();
      return {
        id: `env-${type}`,
        type,
        label: `${p.label} (from .env)`,
        apiKey: p.envKey ? process.env[p.envKey] ?? '' : '',
        baseUrl: (process.env[`${NAME}_BASE_URL`] || p.baseUrl).replace(/\/$/, ''),
        model: process.env[`${NAME}_MODEL`] || p.model,
        on: p.envKey ? Boolean(process.env[p.envKey]) : process.env.OLLAMA_ENABLED === 'true',
      };
    })
    .filter((p) => p.on);

  return {
    providers,
    perHour: Number(process.env.AI_REVIEWS_PER_HOUR ?? 10), // per visitor IP — protects your free quotas
  };
}

const config = Object.freeze({
  env,
  port: Number(process.env.PORT ?? 4000),
  corsOrigins: (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  session: {
    secret: sessionSecret,
    cookieName: 'portfolio_session',
    ttlMs: Number(process.env.SESSION_TTL_HOURS ?? 2) * 60 * 60 * 1000,
  },
  // Optional: creates the admin account on first start if none exists yet.
  bootstrapAdmin: {
    username: process.env.ADMIN_USERNAME ?? '',
    password: process.env.ADMIN_PASSWORD ?? '',
  },
  ai: aiConfig(),
  mongoUri: process.env.MONGODB_URI ?? '',
  paths: {
    seedData: path.join(serverRoot, 'data'),
    seedUploads: path.join(serverRoot, 'uploads'),
    data: process.env.DATA_DIR ?? path.join(serverRoot, 'data'),
    uploads: process.env.UPLOADS_DIR ?? path.join(serverRoot, 'uploads'),
    client: path.resolve(serverRoot, '..', 'client'),
  },
});

export default config;
