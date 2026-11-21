import { API_BASE } from '../config.js';

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/**
 * Thin fetch wrapper: JSON (or FormData) in, JSON out, unified errors.
 * Admin requests are authenticated by the HttpOnly session cookie the server sets on login.
 */
async function request(path, { method = 'GET', body } = {}) {
  const headers = { Accept: 'application/json' };
  const isForm = body instanceof FormData;
  if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Network error — is the server running?', 0);
  }

  if (res.status === 204) return null;
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(payload?.error?.message ?? `Request failed (${res.status})`, res.status, payload?.error?.details);
  }
  return payload;
}

const data = (r) => r.data;
const enc = encodeURIComponent;

/** Public endpoints */
export const api = {
  settings: () => request('/settings').then(data),
  profile: () => request('/profile').then(data),
  skills: () => request('/skills').then(data),
  experience: () => request('/experience').then(data),
  projects: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''));
    return request(`/projects${qs.size ? `?${qs}` : ''}`).then(data);
  },
  categories: () => request('/projects/categories').then(data),
  cvData: () => request('/cv/data').then(data),
  sendMessage: (body) => request('/contact', { method: 'POST', body }),
  aiStatus: () => request('/ai/status').then(data),
  aiReview: (cv) => request('/ai/ats-review', { method: 'POST', body: cv }).then(data),
  aiPay: (body) => request('/ai/payments', { method: 'POST', body }).then(data),
  accountSignup: (body) => request('/account/signup', { method: 'POST', body }).then(data),
  accountLogin: (body) => request('/account/login', { method: 'POST', body }).then(data),
  accountLogout: () => request('/account/logout', { method: 'POST' }),
  importCv(file) {
    const form = new FormData();
    form.append('file', file);
    return request('/cv/import', { method: 'POST', body: form }).then(data);
  },
};

/** CRUD helpers for an admin-managed collection. */
const collection = (base) => ({
  create: (body) => request(base, { method: 'POST', body }).then(data),
  update: (id, body) => request(`${base}/${enc(id)}`, { method: 'PATCH', body }).then(data),
  remove: (id) => request(`${base}/${enc(id)}`, { method: 'DELETE' }),
});

/** Admin endpoints (require a signed-in session) */
export const adminApi = {
  login: (username, password) => request('/auth/login', { method: 'POST', body: { username, password } }).then(data),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/auth/me').then(data),
  updateAccount: (body) => request('/auth/account', { method: 'PUT', body }).then(data),

  messages: () => request('/contact/messages'),
  markRead: (id, read) => request(`/contact/messages/${enc(id)}`, { method: 'PATCH', body: { read } }),
  deleteMessage: (id) => request(`/contact/messages/${enc(id)}`, { method: 'DELETE' }),

  saveProfile: (body) => request('/profile', { method: 'PUT', body }).then(data),
  settings: () => request('/settings').then(data),
  saveSettings: (body) => request('/settings', { method: 'PUT', body }).then(data),
  aiAccounts: () => request('/ai/accounts').then(data),
  updateAiAccount: (id, body) => request(`/ai/accounts/${enc(id)}`, { method: 'PATCH', body }).then(data),
  deleteAiAccount: (id) => request(`/ai/accounts/${enc(id)}`, { method: 'DELETE' }),
  logoutAllAiAccounts: () => request('/ai/accounts/logout-all', { method: 'POST' }),
  saveCvData: (body) => request('/cv/data', { method: 'PUT', body }).then(data),

  aiProviders: () => request('/ai/providers').then(data),
  createAiProvider: (body) => request('/ai/providers', { method: 'POST', body }).then(data),
  updateAiProvider: (id, body) => request(`/ai/providers/${enc(id)}`, { method: 'PATCH', body }).then(data),
  deleteAiProvider: (id) => request(`/ai/providers/${enc(id)}`, { method: 'DELETE' }),
  testAiProvider: (id) => request(`/ai/providers/${enc(id)}/test`, { method: 'POST' }).then(data),
  aiProviderModels: (id) => request(`/ai/providers/${enc(id)}/models`).then(data),

  aiPayments: () => request('/ai/payments').then(data),
  decideAiPayment: (id, status) => request(`/ai/payments/${enc(id)}`, { method: 'PATCH', body: { status } }).then(data),
  grantAiCredits: (email, credits) => request('/ai/accounts/grant', { method: 'POST', body: { email, credits } }).then(data),
  aiAccountStats: () => request('/ai/accounts/stats').then(data),

  projects: collection('/projects'),
  skills: collection('/skills'),
  experience: collection('/experience'),

  upload(file) {
    const form = new FormData();
    form.append('file', file);
    return request('/uploads', { method: 'POST', body: form }).then(data);
  },
};
