import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

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
 * Free AI providers (all OpenAI-compatible). Every provider that has a key (or, for Ollama,
 * OLLAMA_ENABLED=true) is used — their reviews are merged into one.
 * Default models can be overridden with <NAME>_MODEL, e.g. GEMINI_MODEL.
 */
const AI_PROVIDERS = [
  { id: 'gemini', label: 'Gemini', keyVar: 'GEMINI_API_KEY', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash' },
  { id: 'groq', label: 'Groq (Llama)', keyVar: 'GROQ_API_KEY', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
  { id: 'openrouter', label: 'OpenRouter', keyVar: 'OPENROUTER_API_KEY', baseUrl: 'https://openrouter.ai/api/v1', model: 'meta-llama/llama-3.3-70b-instruct:free' },
  { id: 'ollama', label: 'Ollama (local)', keyVar: null, baseUrl: 'http://localhost:11434/v1', model: 'llama3.1' },
];

function aiConfig() {
  const providers = AI_PROVIDERS.map((p) => {
    const NAME = p.id.toUpperCase();
    return {
      id: p.id,
      label: p.label,
      apiKey: p.keyVar ? process.env[p.keyVar] ?? '' : '',
      baseUrl: (process.env[`${NAME}_BASE_URL`] || p.baseUrl).replace(/\/$/, ''),
      model: process.env[`${NAME}_MODEL`] || p.model,
      on: p.keyVar ? Boolean(process.env[p.keyVar]) : process.env.OLLAMA_ENABLED === 'true',
    };
  }).filter((p) => p.on);

  return {
    providers,
    enabled: providers.length > 0,
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
