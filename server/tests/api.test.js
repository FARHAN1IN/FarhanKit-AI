import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Isolate tests on a temp copy of the seed data + a temp uploads dir.
const seedDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'portfolio-test-'));
const dataDir = path.join(tmp, 'data');
await fs.cp(seedDir, dataDir, { recursive: true });
await fs.rm(path.join(dataDir, 'cv.json'), { force: true }); // tests start without a saved CV

process.env.NODE_ENV = 'test';
process.env.DATA_DIR = dataDir;
process.env.UPLOADS_DIR = path.join(tmp, 'uploads');
// never call a real AI service from tests
for (const k of ['GEMINI_API_KEY', 'GROQ_API_KEY', 'OPENROUTER_API_KEY', 'OLLAMA_ENABLED']) delete process.env[k];

// Fake OpenAI-compatible AI provider (plays the role of local Ollama) — no real AI calls.
const http = await import('node:http');
const fakeAi = { fail: false };
const aiServer = http.createServer((req, res) => {
  req.resume();
  req.on('end', () => {
    if (fakeAi.fail) { res.writeHead(500); return res.end('{}'); }
    if (req.url.endsWith('/models')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ data: [{ id: 'models/fake-2-flash' }, { id: 'fake-1' }, { id: 'text-embedding-9' }] }));
    }
    if (fakeAi.retired) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify([{ error: { message: 'This model models/fake-1 is no longer available to new users. Please update your code to use models/fake-2-flash for the latest features.' } }]));
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ score: 72, verdict: 'Solid', strengths: ['Clear'], improvements: [], rewrittenSummary: '', rewrittenBullets: [], keywords: { matched: [], missing: [] } }) } }] }));
  });
}).listen(0);
await new Promise((r) => aiServer.once('listening', r));
process.env.OLLAMA_ENABLED = 'true';
process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${aiServer.address().port}`;

const { createApp } = await import('../src/app.js');
const { authService } = await import('../src/services/auth.service.js');

let server, base;
const json = { 'Content-Type': 'application/json' };
const auth = {}; // filled with the session cookie after login
const admin = {};

const call = async (method, url, { body, headers = json } = {}) => {
  const res = await fetch(base + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const payload = res.status === 204 ? null : await res.json();
  return { status: res.status, body: payload };
};

const login = (username, password) =>
  fetch(`${base}/api/auth/login`, { method: 'POST', headers: json, body: JSON.stringify({ username, password }) });
const cookieOf = (res) => res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');

before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;

  await authService.setCredentials('admin', 'correct-horse-battery');
  const res = await login('admin', 'correct-horse-battery');
  auth.Cookie = cookieOf(res);
  Object.assign(admin, json, auth);
});

test('auth: rejects wrong credentials, sets HttpOnly cookie on success', async () => {
  assert.equal((await login('admin', 'wrong-password')).status, 401);
  assert.equal((await login('nobody', 'correct-horse-battery')).status, 401);
  assert.equal((await login('', '')).status, 400);

  const res = await login('ADMIN', 'correct-horse-battery'); // username is case-insensitive
  assert.equal(res.status, 200);
  const cookie = res.headers.getSetCookie()[0];
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Strict/i);
});

test('auth: /me requires a valid session; tampered cookies are rejected', async () => {
  assert.equal((await call('GET', '/api/auth/me')).status, 401);
  const me = await call('GET', '/api/auth/me', { headers: auth });
  assert.equal(me.body.data.username, 'admin');

  const tampered = auth.Cookie.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'));
  assert.equal((await call('GET', '/api/auth/me', { headers: { Cookie: tampered } })).status, 401);
});

test('auth: changing the password invalidates old sessions', async () => {
  await authService.setCredentials('temp', 'first-password-1');
  const first = cookieOf(await login('temp', 'first-password-1'));

  const wrong = await call('PUT', '/api/auth/account', { body: { currentPassword: 'nope', newPassword: 'second-password-2' }, headers: { ...json, Cookie: first } });
  assert.equal(wrong.status, 400);

  const tooShort = await call('PUT', '/api/auth/account', { body: { currentPassword: 'first-password-1', newPassword: 'short' }, headers: { ...json, Cookie: first } });
  assert.equal(tooShort.status, 400);

  const changed = await fetch(`${base}/api/auth/account`, {
    method: 'PUT',
    headers: { ...json, Cookie: first },
    body: JSON.stringify({ currentPassword: 'first-password-1', newPassword: 'second-password-2' }),
  });
  assert.equal(changed.status, 200);
  const fresh = cookieOf(changed);

  assert.equal((await call('GET', '/api/auth/me', { headers: { Cookie: first } })).status, 401, 'old session revoked');
  assert.equal((await call('GET', '/api/auth/me', { headers: { Cookie: fresh } })).status, 200, 'new session works');
  assert.equal((await login('temp', 'first-password-1')).status, 401);
  assert.equal((await login('temp', 'second-password-2')).status, 200);

  // Restore the main test account
  await authService.setCredentials('admin', 'correct-horse-battery');
  auth.Cookie = cookieOf(await login('admin', 'correct-horse-battery'));
  Object.assign(admin, auth);
});
after(async () => {
  server.close();
  await fs.rm(tmp, { recursive: true, force: true });
});

test('GET /api/health', async () => {
  assert.equal((await call('GET', '/api/health')).status, 200);
});

test('settings: defaults are merged and all sections exist', async () => {
  const { body } = await call('GET', '/api/settings');
  assert.deepEqual(body.data.sections.map((s) => s.id).sort(), ['about', 'contact', 'experience', 'projects', 'skills']);
  assert.ok(body.data.hero.primaryCtaLabel);
});

test('settings: PUT requires admin, validates, and persists', async () => {
  const { body: current } = await call('GET', '/api/settings');
  const next = { ...current.data, siteTitle: 'My Site', accentColor: '#ff0000' };
  delete next.updatedAt;

  assert.equal((await call('PUT', '/api/settings', { body: next })).status, 401);
  assert.equal((await call('PUT', '/api/settings', { body: { ...next, accentColor: 'red' }, headers: admin })).status, 400);

  const bad = await call('PUT', '/api/settings', { body: { ...next, sections: [{ id: 'nope' }] }, headers: admin });
  assert.equal(bad.status, 400);
  assert.ok(bad.body.error.details['sections[0].id']);

  const ok = await call('PUT', '/api/settings', { body: next, headers: admin });
  assert.equal(ok.status, 200);
  assert.equal((await call('GET', '/api/settings')).body.data.siteTitle, 'My Site');
});

test('profile: PUT replaces profile with nested stats/socials', async () => {
  const profile = {
    name: 'Ada Lovelace',
    title: 'Engineer',
    stats: [{ label: 'Years', value: 5, suffix: '+' }],
    socials: [{ name: 'Site', url: 'https://example.com', icon: 'globe' }],
  };
  const res = await call('PUT', '/api/profile', { body: profile, headers: admin });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.name, 'Ada Lovelace');

  const bad = await call('PUT', '/api/profile', { body: { ...profile, stats: [{ label: '' , value: 'x' }] }, headers: admin });
  assert.equal(bad.status, 400);
  assert.ok(bad.body.error.details['stats[0].label']);
  assert.ok(bad.body.error.details['stats[0].value']);
});

test('projects: CRUD + category filter', async () => {
  const project = { title: 'Test Project', description: 'A project created by the test suite.', tags: ['Test'], category: 'Tooling' };
  assert.equal((await call('POST', '/api/projects', { body: project })).status, 401);

  const created = await call('POST', '/api/projects', { body: project, headers: admin });
  assert.equal(created.status, 201);
  const id = created.body.data.id;

  const filtered = await call('GET', '/api/projects?category=tooling');
  assert.ok(filtered.body.data.some((p) => p.id === id));
  assert.deepEqual((await call('GET', '/api/projects/categories')).body.data.includes('Tooling'), true);

  const patched = await call('PATCH', `/api/projects/${id}`, { body: { featured: true }, headers: admin });
  assert.equal(patched.body.data.featured, true);
  assert.equal(patched.body.data.title, 'Test Project');

  assert.equal((await call('DELETE', `/api/projects/${id}`, { headers: auth })).status, 204);
  assert.equal((await call('GET', `/api/projects/${id}`)).status, 404);
});

test('experience: CRUD, current role sorts first', async () => {
  const old = await call('POST', '/api/experience', { body: { role: 'Old', company: 'A', start: '2001-01', end: '2002-01' }, headers: admin });
  const cur = await call('POST', '/api/experience', { body: { role: 'Now', company: 'B', start: '2003-01', end: '' }, headers: admin });
  assert.equal(old.status, 201);
  assert.equal(cur.status, 201);
  assert.equal((await call('POST', '/api/experience', { body: { role: 'X', company: 'Y', start: '2020-13' }, headers: admin })).status, 400);

  const list = (await call('GET', '/api/experience')).body.data;
  const firstEnded = list.findIndex((x) => x.end);
  assert.ok(list.findIndex((x) => x.role === 'Now') < firstEnded, 'current roles sort before finished ones');
  assert.ok(list.findIndex((x) => x.role === 'Old') > firstEnded - 1);
});

test('skills: create group with nested items', async () => {
  const res = await call('POST', '/api/skills', { body: { category: 'Langs', items: [{ name: 'Go', level: 70 }] }, headers: admin });
  assert.equal(res.status, 201);
  const bad = await call('POST', '/api/skills', { body: { category: 'Langs', items: [{ name: 'Go', level: 170 }] }, headers: admin });
  assert.equal(bad.status, 400);
});

test('contact: validates, stores, uses configured success message', async () => {
  assert.equal((await call('POST', '/api/contact', { body: { name: 'A', email: 'bad' } })).status, 400);

  const ok = await call('POST', '/api/contact', { body: { name: 'Jane Doe', email: 'jane@example.com', message: 'Hello there, nice portfolio!' } });
  assert.equal(ok.status, 201);
  assert.ok(ok.body.message);

  assert.equal((await call('GET', '/api/contact/messages')).status, 401);
  const list = await call('GET', '/api/contact/messages', { headers: auth });
  assert.equal(list.body.data[0].email, 'jane@example.com');
});

test('uploads: admin can upload an image, which is then served', async () => {
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  const form = new FormData();
  form.append('file', new Blob([png], { type: 'image/png' }), 'logo.png');

  const res = await fetch(`${base}/api/uploads`, { method: 'POST', headers: auth, body: form });
  assert.equal(res.status, 201);
  const { data } = await res.json();
  assert.match(data.url, /^\/uploads\/.+\.png$/);
  assert.equal((await fetch(base + data.url)).status, 200);

  const txt = new FormData();
  txt.append('file', new Blob(['hi'], { type: 'text/plain' }), 'x.txt');
  assert.equal((await fetch(`${base}/api/uploads`, { method: 'POST', headers: auth, body: txt })).status, 400);
});

test('cv: 404 without a PDF, downloads an uploaded PDF with a clean file name', async () => {
  const p = { name: 'Ada Lovelace', title: 'Engineer', resumeUrl: '' };
  await call('PUT', '/api/profile', { body: p, headers: admin });
  assert.equal((await fetch(`${base}/api/cv`)).status, 404);

  const form = new FormData();
  form.append('file', new Blob(['%PDF-1.4\n%test'], { type: 'application/pdf' }), 'cv.pdf');
  const up = await (await fetch(`${base}/api/uploads`, { method: 'POST', headers: auth, body: form })).json();
  await call('PUT', '/api/profile', { body: { ...p, resumeUrl: up.data.url }, headers: admin });

  const res = await fetch(`${base}/api/cv`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-disposition'), /attachment; filename="Ada-Lovelace-CV\.pdf"/);
  assert.match(await res.text(), /^%PDF/);

  await call('PUT', '/api/profile', { body: { ...p, resumeUrl: 'https://example.com/me.pdf' }, headers: admin });
  const redirect = await fetch(`${base}/api/cv`, { redirect: 'manual' });
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get('location'), 'https://example.com/me.pdf');
});

test('cv: settings expose CV options; generated CV page is served', async () => {
  const { body } = await call('GET', '/api/settings');
  assert.equal(typeof body.data.cv.enabled, 'boolean');
  assert.ok(body.data.cv.label);
  const page = await fetch(`${base}/cv`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /id="cv"/);
});

test('cv data: empty by default, admin can save a simple CV, public can read it', async () => {
  assert.deepEqual(Object.keys((await call('GET', '/api/cv/data')).body.data), []);

  const cv = {
    name: 'Jane Doe',
    title: 'Web Developer',
    email: 'jane@example.com',
    phone: '+1 555 123',
    links: ['linkedin.com/in/jane'],
    summary: 'Short summary.',
    experience: [{ role: 'Dev', company: 'Acme', dates: '2022 – Present', details: 'Built things\nShipped stuff' }],
    education: [{ degree: 'B.Sc.', school: 'Uni', year: '2021' }],
    skills: ['HTML', 'CSS'],
    languages: ['English'],
  };
  assert.equal((await call('PUT', '/api/cv/data', { body: cv })).status, 401);
  assert.equal((await call('PUT', '/api/cv/data', { body: { ...cv, name: '' }, headers: admin })).status, 400);
  assert.equal((await call('PUT', '/api/cv/data', { body: cv, headers: admin })).status, 200);

  const saved = (await call('GET', '/api/cv/data')).body.data;
  assert.equal(saved.name, 'Jane Doe');
  assert.equal(saved.experience[0].details, 'Built things\nShipped stuff');
  assert.equal((await fetch(`${base}/cv-maker`)).status, 200);
});

test('serves the frontend shell', async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /<main id="main">/);
});

test('ai billing: free reviews, then pay → admin approves → paid credits', async () => {
  const status = await fetch(`${base}/api/ai/status`);
  const wallet = { ...json, Cookie: cookieOf(status) };
  const st = (await status.json()).data;
  assert.equal(st.available, true);
  assert.equal(st.wallet.freeLeft, 3);
  assert.equal(st.plan.packages.length, 2);

  const review = () => call('POST', '/api/ai/ats-review', { body: { name: 'Jane', summary: 'Dev' }, headers: wallet });
  for (let i = 2; i >= 0; i--) {
    const r = await review();
    assert.equal(r.status, 200);
    assert.equal(r.body.data.score, 72);
    assert.equal(r.body.data.wallet.freeLeft, i);
  }
  const blocked = await review();
  assert.equal(blocked.status, 402);
  assert.equal(blocked.body.error.details.code, 'NO_CREDITS');

  // Visitor submits a payment; duplicates are refused
  const pay = await call('POST', '/api/ai/payments', { body: { packageIndex: 0, transactionId: 'TX-12345', sender: '0100' }, headers: wallet });
  assert.equal(pay.status, 201);
  assert.equal(pay.body.data.payment.status, 'pending');
  assert.equal((await call('POST', '/api/ai/payments', { body: { packageIndex: 0, transactionId: 'tx-12345' }, headers: wallet })).status, 409);
  assert.equal((await call('POST', '/api/ai/payments', { body: { packageIndex: 9, transactionId: 'TX-9' }, headers: wallet })).status, 400);

  // Admin approves → 5 credits
  assert.equal((await call('GET', '/api/ai/payments')).status, 401);
  const list = (await call('GET', '/api/ai/payments', { headers: admin })).body.data;
  const id = list.find((p) => p.transactionId === 'TX-12345').id;
  assert.equal((await call('PATCH', `/api/ai/payments/${id}`, { body: { status: 'approved' }, headers: admin })).status, 200);
  assert.equal((await call('PATCH', `/api/ai/payments/${id}`, { body: { status: 'approved' }, headers: admin })).status, 400);

  const paid = await review();
  assert.equal(paid.status, 200);
  assert.equal(paid.body.data.wallet.credits, 4);

  // A failed AI call is refunded
  fakeAi.fail = true;
  assert.equal((await review()).status, 503);
  fakeAi.fail = false;
  const now = (await call('GET', '/api/ai/status', { headers: wallet })).body.data;
  assert.equal(now.wallet.credits, 4);
  assert.equal(now.payments[0].status, 'approved');

  // Admin can grant credits by wallet code
  const granted = await call('POST', '/api/ai/wallets/grant', { body: { code: now.wallet.code, credits: 2 }, headers: admin });
  assert.equal(granted.body.data.credits, 6);

  // Free reviews are dynamic (admin setting)
  const settings = (await call('GET', '/api/settings')).body.data;
  assert.equal((await call('PUT', '/api/settings', { body: { ...settings, aiPlan: { ...settings.aiPlan, freeReviews: 1 } }, headers: admin })).status, 200);
  const fresh = (await call('GET', '/api/ai/status')).body.data; // new browser, same IP (cap = 2× free)
  assert.equal(fresh.wallet.freeTotal, 1);
  assert.equal(fresh.wallet.freeLeft, 0); // this IP already used 3 free reviews
});

after(() => aiServer.close());

test('ai models: admin adds a provider; key is encrypted, never returned; test + review use it', async () => {
  const aiUrl = process.env.OLLAMA_BASE_URL; // the fake provider
  assert.equal((await call('GET', '/api/ai/providers')).status, 401);

  const before = (await call('GET', '/api/ai/providers', { headers: admin })).body.data;
  assert.ok(before.presets.some((p) => p.type === 'gemini'));
  assert.ok(before.providers.some((p) => p.source === 'env')); // the .env (Ollama) provider is listed read-only

  // validation
  assert.equal((await call('POST', '/api/ai/providers', { body: { type: 'gemini' }, headers: admin })).status, 400); // key required
  assert.equal((await call('POST', '/api/ai/providers', { body: { type: 'custom', model: 'x' }, headers: admin })).status, 400); // URL required
  assert.equal((await call('POST', '/api/ai/providers', { body: { type: 'nope' }, headers: admin })).status, 400);

  const secret = 'sk-test-SECRET-key-1234';
  const created = await call('POST', '/api/ai/providers', {
    body: { type: 'custom', label: 'My model', baseUrl: aiUrl, model: 'fake-1', apiKey: secret },
    headers: admin,
  });
  assert.equal(created.status, 201);
  const id = created.body.data.id;
  assert.equal(created.body.data.keyHint, '••••1234');
  assert.ok(!JSON.stringify(created.body).includes(secret));

  // stored encrypted
  const stored = await fs.readFile(path.join(dataDir, 'ai-providers.json'), 'utf8');
  assert.ok(!stored.includes(secret));

  // Test button
  const t = await call('POST', `/api/ai/providers/${id}/test`, { headers: admin });
  assert.equal(t.body.data.ok, true);

  // Retired model → the provider's suggested replacement is offered
  fakeAi.retired = true;
  const retired = (await call('POST', `/api/ai/providers/${id}/test`, { headers: admin })).body.data;
  fakeAi.retired = false;
  assert.equal(retired.ok, false);
  assert.equal(retired.suggestedModel, 'fake-2-flash');

  // Model list from the provider (chat models only, "models/" prefix removed)
  const models = (await call('GET', `/api/ai/providers/${id}/models`, { headers: admin })).body.data;
  assert.deepEqual(models, ['fake-1', 'fake-2-flash']);

  // reviews now merge env + admin models
  const wallet = { ...json, Cookie: cookieOf(await fetch(`${base}/api/ai/status`)) };
  await call('POST', '/api/ai/wallets/grant', { body: { code: (await call('GET', '/api/ai/status', { headers: wallet })).body.data.wallet.code, credits: 3 }, headers: admin });
  const r = await call('POST', '/api/ai/ats-review', { body: { name: 'Jane' }, headers: wallet });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.data.models.map((m) => m.label).sort(), ['My model', 'Ollama (local) (from .env)']);

  // edit without key keeps the key; disable removes it from reviews
  const edited = await call('PATCH', `/api/ai/providers/${id}`, { body: { enabled: false, model: 'fake-2' }, headers: admin });
  assert.equal(edited.body.data.keyHint, '••••1234');
  assert.equal(edited.body.data.enabled, false);
  const r2 = await call('POST', '/api/ai/ats-review', { body: { name: 'Jane' }, headers: wallet });
  assert.deepEqual(r2.body.data.models.map((m) => m.label), ['Ollama (local) (from .env)']);

  assert.equal((await call('DELETE', `/api/ai/providers/${id}`, { headers: admin })).status, 204);
  assert.equal((await call('DELETE', `/api/ai/providers/${id}`, { headers: admin })).status, 404);
});
