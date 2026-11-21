/**
 * AI models managed in admin → AI models. API keys are stored encrypted and never returned.
 * The ATS review uses every enabled provider from here plus any configured in the environment.
 */
import config from '../config/index.js';
import { AI_PRESETS } from '../config/ai-presets.js';
import AppError from '../utils/AppError.js';
import { seal, open, mask } from '../utils/secret-box.js';
import { aiProviderRepository } from '../repositories/index.js';

/** What the admin sees (no key, only its last 4 characters). */
function toPublic(p) {
  const key = open(p.apiKey);
  return {
    id: p.id,
    type: p.type,
    label: p.label,
    model: p.model,
    baseUrl: p.baseUrl,
    enabled: p.enabled !== false,
    keyHint: mask(key),
    keyProblem: p.apiKey && !key ? 'The saved key can no longer be read (SESSION_SECRET changed) — enter it again.' : '',
    lastTest: p.lastTest ?? null,
    createdAt: p.createdAt,
    source: 'admin',
  };
}

const envPublic = (p) => ({
  id: p.id, type: p.type, label: p.label, model: p.model, baseUrl: p.baseUrl,
  enabled: true, keyHint: mask(p.apiKey), source: 'env', lastTest: null,
});

/** Fills defaults from the preset and checks the result is usable. */
function resolve(input, existing = {}) {
  const type = input.type ?? existing.type;
  const preset = AI_PRESETS[type];
  if (!preset) throw AppError.badRequest('Unknown provider type.');
  const baseUrl = (input.baseUrl || existing.baseUrl || preset.baseUrl || '').replace(/\/$/, '');
  const model = input.model || existing.model || preset.model;
  if (!baseUrl) throw AppError.badRequest('Validation failed', { baseUrl: 'API URL is required for this provider' });
  if (!model) throw AppError.badRequest('Validation failed', { model: 'Model name is required for this provider' });

  // Empty key on edit = keep the saved key
  const apiKey = input.apiKey ? seal(input.apiKey.trim()) : existing.apiKey ?? '';
  if (preset.needsKey && !apiKey) throw AppError.badRequest('Validation failed', { apiKey: `${preset.label} needs an API key` });

  return {
    type,
    label: input.label || existing.label || preset.label,
    model,
    baseUrl,
    apiKey,
    enabled: input.enabled ?? existing.enabled ?? true,
  };
}

export const aiProviderService = {
  async list() {
    const saved = (await aiProviderRepository.findAll()).map(toPublic);
    return [...saved, ...config.ai.providers.map(envPublic)];
  },

  async create(input) {
    return toPublic(await aiProviderRepository.create(resolve(input)));
  },

  async update(id, input) {
    const existing = await aiProviderRepository.findById(id);
    if (!existing) throw AppError.notFound('AI model not found');
    return toPublic(await aiProviderRepository.update(id, resolve(input, existing)));
  },

  async remove(id) {
    if (!(await aiProviderRepository.remove(id))) throw AppError.notFound('AI model not found');
  },

  async saveTestResult(id, result) {
    if (await aiProviderRepository.findById(id)) await aiProviderRepository.update(id, { lastTest: result });
  },

  /** Provider ready to call (with the decrypted key), or null. */
  async getForCall(id) {
    const envP = config.ai.providers.find((p) => p.id === id);
    if (envP) return envP;
    const p = await aiProviderRepository.findById(id);
    return p ? { id: p.id, type: p.type, label: p.label, model: p.model, baseUrl: p.baseUrl, apiKey: open(p.apiKey) } : null;
  },

  /** Every enabled provider (admin-managed first, then environment). */
  async active() {
    const saved = (await aiProviderRepository.findAll())
      .filter((p) => p.enabled !== false)
      .map((p) => ({ id: p.id, type: p.type, label: p.label, model: p.model, baseUrl: p.baseUrl, apiKey: open(p.apiKey) }))
      .filter((p) => !AI_PRESETS[p.type]?.needsKey || p.apiKey);
    return [...saved, ...config.ai.providers];
  },
};

/** Presets for the admin form. */
export const presetsForAdmin = () =>
  Object.entries(AI_PRESETS).map(([type, p]) => ({ type, label: p.label, baseUrl: p.baseUrl, model: p.model, needsKey: p.needsKey, keyUrl: p.keyUrl }));
