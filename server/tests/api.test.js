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

const SAMPLE_CV = {
  name: 'Jane Doe',
  title: 'QA Engineer',
  summary: 'QA engineer with three years of experience in manual and automated testing of web and mobile apps.',
  experience: [{ role: 'QA Engineer', company: 'Acme', dates: '2022 – 2025', details: 'Wrote and ran regression test suites\nAutomated login tests with Selenium and Java' }],
  skills: ['Selenium', 'Postman', 'Jira', 'SQL'],
};

/** Creates a visitor account and returns request headers carrying its session cookie. */
async function signup(email, password = 'visitor-pass-123') {
  const res = await fetch(base + '/api/account/signup', { method: 'POST', headers: json, body: JSON.stringify({ name: 'Visitor', email, password }) });
  assert.equal(res.status, 201);
  return { ...json, Cookie: cookieOf(res) };
}

test('visitor accounts: sign up, log in/out, duplicates, throwaway emails, dynamic session length', async () => {
  const user = await signup('Jane.Doe+cv@gmail.com');
  assert.equal((await call('GET', '/api/account/me', { headers: user })).body.data.user.email, 'jane.doe+cv@gmail.com');
  // same Gmail inbox written differently → same account
  assert.equal((await call('POST', '/api/account/signup', { body: { email: 'janedoe@gmail.com', password: 'another-pass-1' } })).status, 409);
  assert.equal((await call('POST', '/api/account/signup', { body: { email: 'x@mailinator.com', password: 'another-pass-1' } })).status, 400);
  assert.equal((await call('POST', '/api/account/signup', { body: { email: 'short@pass.com', password: '123' } })).status, 400);
  assert.equal((await call('POST', '/api/account/login', { body: { email: 'janedoe@gmail.com', password: 'wrong-password' } })).status, 401);

  // session length comes from admin settings
  const settings = (await call('GET', '/api/settings')).body.data;
  assert.equal((await call('PUT', '/api/settings', { body: { ...settings, accounts: { ...settings.accounts, sessionDays: 7 } }, headers: admin })).status, 200);
  const login = await fetch(base + '/api/account/login', { method: 'POST', headers: json, body: JSON.stringify({ email: 'JaneDoe@gmail.com', password: 'visitor-pass-123' }) });
  assert.equal(login.status, 200);
  assert.match(login.headers.getSetCookie().join(';'), /Max-Age=604800/); // 7 days
  assert.match(login.headers.getSetCookie().join(';'), /HttpOnly/);

  // tampered cookie → not signed in
  const bad = { ...json, Cookie: cookieOf(login).replace(/.$/, (c) => (c === 'A' ? 'B' : 'A')) };
  assert.equal((await call('GET', '/api/account/me', { headers: bad })).body.data.user, null);

  const out = await fetch(base + '/api/account/logout', { method: 'POST', headers: user });
  assert.match(out.headers.getSetCookie().join(';'), /portfolio_user=;/);
});

test('ai billing: account required; free reviews per account; pay → admin approves → paid credits', async () => {
  // Not signed in: AI is available but needs an account
  const anon = (await call('GET', '/api/ai/status')).body.data;
  assert.equal(anon.available, true);
  assert.equal(anon.user, null);
  assert.equal((await call('POST', '/api/ai/ats-review', { body: SAMPLE_CV })).body.error.details.code, 'LOGIN_REQUIRED');

  const wallet = await signup('buyer@example.com');
  const st = (await call('GET', '/api/ai/status', { headers: wallet })).body.data;
  assert.equal(st.user.email, 'buyer@example.com');
  assert.equal(st.wallet.freeLeft, 3);
  assert.equal(st.plan.packages.length, 2);

  // An (almost) empty CV is refused and does NOT use up a free review
  const empty = await call('POST', '/api/ai/ats-review', { body: { name: 'Jane' }, headers: wallet });
  assert.equal(empty.status, 400);
  assert.equal(empty.body.error.details.code, 'CV_TOO_SHORT');
  assert.equal((await call('GET', '/api/ai/status', { headers: wallet })).body.data.wallet.freeLeft, 3);

  const review = (headers = wallet) => call('POST', '/api/ai/ats-review', { body: SAMPLE_CV, headers });
  for (let i = 2; i >= 0; i--) {
    const r = await review();
    assert.equal(r.status, 200);
    assert.equal(r.body.data.score, 72);
    assert.equal(r.body.data.wallet.freeLeft, i);
  }
  const blocked = await review();
  assert.equal(blocked.status, 402);
  assert.equal(blocked.body.error.details.code, 'NO_CREDITS');

  // "incognito": logging in again from a fresh browser does NOT reset free reviews
  const again = await fetch(base + '/api/account/login', { method: 'POST', headers: json, body: JSON.stringify({ email: 'buyer@example.com', password: 'visitor-pass-123' }) });
  assert.equal((await review({ ...json, Cookie: cookieOf(again) })).status, 402);

  // Visitor submits a payment; duplicates are refused
  const pay = await call('POST', '/api/ai/payments', { body: { packageIndex: 0, transactionId: 'TX-12345', sender: '0100' }, headers: wallet });
  assert.equal(pay.status, 201);
  assert.equal(pay.body.data.payment.status, 'pending');
  assert.equal((await call('POST', '/api/ai/payments', { body: { packageIndex: 0, transactionId: 'tx-12345' }, headers: wallet })).status, 409);
  assert.equal((await call('POST', '/api/ai/payments', { body: { packageIndex: 9, transactionId: 'TX-9' }, headers: wallet })).status, 400);
  assert.equal((await call('POST', '/api/ai/payments', { body: { packageIndex: 0, transactionId: 'TX-anon' } })).status, 401);

  // Admin approves → 5 credits on the account
  assert.equal((await call('GET', '/api/ai/payments')).status, 401);
  const list = (await call('GET', '/api/ai/payments', { headers: admin })).body.data;
  const p = list.find((x) => x.transactionId === 'TX-12345');
  assert.equal(p.userEmail, 'buyer@example.com');
  assert.equal((await call('PATCH', '/api/ai/payments/' + p.id, { body: { status: 'approved' }, headers: admin })).status, 200);
  assert.equal((await call('PATCH', '/api/ai/payments/' + p.id, { body: { status: 'approved' }, headers: admin })).status, 400);

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

  // Admin can give reviews by email; account overview
  const granted = await call('POST', '/api/ai/accounts/grant', { body: { email: 'BUYER@example.com', credits: 2 }, headers: admin });
  assert.equal(granted.body.data.credits, 6);
  assert.equal((await call('POST', '/api/ai/accounts/grant', { body: { email: 'nobody@example.com', credits: 2 }, headers: admin })).status, 404);
  assert.ok((await call('GET', '/api/ai/accounts/stats', { headers: admin })).body.data.accounts >= 2);

  // Free reviews are dynamic (admin setting); a new account gets the new number
  const settings = (await call('GET', '/api/settings')).body.data;
  assert.equal((await call('PUT', '/api/settings', { body: { ...settings, aiPlan: { ...settings.aiPlan, freeReviews: 1 } }, headers: admin })).status, 200);
  const fresh = (await call('GET', '/api/ai/status', { headers: await signup('newbie@example.com') })).body.data;
  assert.equal(fresh.wallet.freeTotal, 1);
  assert.equal(fresh.wallet.freeLeft, 1);
  await call('PUT', '/api/settings', { body: { ...settings, aiPlan: { ...settings.aiPlan, freeReviews: 3 } }, headers: admin });
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
  const wallet = await signup('models-test@example.com');
  const r = await call('POST', '/api/ai/ats-review', { body: SAMPLE_CV, headers: wallet });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.data.models.map((m) => m.label).sort(), ['My model', 'Ollama (local) (from .env)']);

  // edit without key keeps the key; disable removes it from reviews
  const edited = await call('PATCH', `/api/ai/providers/${id}`, { body: { enabled: false, model: 'fake-2' }, headers: admin });
  assert.equal(edited.body.data.keyHint, '••••1234');
  assert.equal(edited.body.data.enabled, false);
  const r2 = await call('POST', '/api/ai/ats-review', { body: SAMPLE_CV, headers: wallet });
  assert.deepEqual(r2.body.data.models.map((m) => m.label), ['Ollama (local) (from .env)']);

  assert.equal((await call('DELETE', `/api/ai/providers/${id}`, { headers: admin })).status, 204);
  assert.equal((await call('DELETE', `/api/ai/providers/${id}`, { headers: admin })).status, 404);
});

test('cv import: detects fields from an uploaded CV (txt), rejects bad files, stores nothing', async () => {
  const text = [
    'Jane Doe',
    'Senior QA Engineer',
    'Berlin, Germany',
    'jane.doe@example.com | +49 151 2345 6789',
    'LinkedIn: https://www.linkedin.com/in/jane-doe/',
    '',
    'PROFESSIONAL SUMMARY',
    'QA engineer with 6 years of experience in manual and automated testing.',
    '',
    'WORK EXPERIENCE',
    'Senior QA Engineer',
    'Acme GmbH | Mar 2021 – Present',
    '• Built a Playwright test suite covering 300 cases',
    '• Cut regression time by 40%',
    'QA Engineer',
    'Beta Corp | Jan 2018 – Feb 2021',
    '• Wrote API tests in Postman and',
    'automated them in CI',
    '',
    'Education',
    'B.Sc. Computer Science',
    'TU Berlin | 2014 – 2018',
    '',
    'Skills',
    'Testing: Playwright, Selenium, Postman,',
    'JMeter',
    'Tools: Jira, Git',
    '',
    'Languages: English, German',
    '',
    'Certifications',
    '• ISTQB Foundation Level',
  ].join('\n');

  const upload = async (content, name, type) => {
    const form = new FormData();
    form.append('file', new Blob([content], { type }), name);
    const res = await fetch(`${base}/api/cv/import`, { method: 'POST', body: form });
    return { status: res.status, body: await res.json() };
  };

  const before = await fs.readdir(dataDir);
  const { status, body } = await upload(text, 'jane.txt', 'text/plain');
  assert.equal(status, 200);
  const { cv } = body.data;
  assert.equal(cv.name, 'Jane Doe');
  assert.equal(cv.title, 'Senior QA Engineer');
  assert.equal(cv.email, 'jane.doe@example.com');
  assert.equal(cv.phone, '+49 151 2345 6789');
  assert.equal(cv.location, 'Berlin, Germany');
  assert.deepEqual(cv.links, ['linkedin.com/in/jane-doe']);
  assert.match(cv.summary, /6 years of experience/);
  assert.equal(cv.experience.length, 2);
  assert.deepEqual(
    { role: cv.experience[0].role, company: cv.experience[0].company, dates: cv.experience[0].dates },
    { role: 'Senior QA Engineer', company: 'Acme GmbH', dates: 'Mar 2021 – Present' },
  );
  assert.equal(cv.experience[1].details, 'Wrote API tests in Postman and automated them in CI'); // wrapped bullet joined
  assert.deepEqual(cv.education, [{ degree: 'B.Sc. Computer Science', school: 'TU Berlin', year: '2014 – 2018' }]);
  assert.deepEqual(cv.skills, ['Playwright', 'Selenium', 'Postman', 'JMeter', 'Jira', 'Git']);
  assert.deepEqual(cv.languages, ['English', 'German']);
  assert.deepEqual(cv.certifications, ['ISTQB Foundation Level']);
  assert.deepEqual(await fs.readdir(dataDir), before); // nothing stored

  assert.equal((await upload('x', 'virus.exe', 'application/x-msdownload')).status, 400);
  assert.equal((await upload('hello', 'short.txt', 'text/plain')).status, 400); // no real text
  assert.equal((await upload('%PDF-1.4 broken', 'broken.pdf', 'application/pdf')).status, 400);
});

test('admin users list: see accounts, add reviews, reset free reviews, delete', async () => {
  const user = await signup('listed@example.com');
  await call('POST', '/api/ai/ats-review', { body: SAMPLE_CV, headers: user }); // uses 1 free review
  assert.equal((await call('GET', '/api/ai/accounts')).status, 401);

  const list = (await call('GET', '/api/ai/accounts', { headers: admin })).body.data;
  const row = list.find((u) => u.email === 'listed@example.com');
  assert.equal(row.name, 'Visitor');
  assert.equal(row.freeUsed, 1);
  assert.equal(row.credits, 0);
  assert.ok(!('passwordHash' in row) && !JSON.stringify(list).includes('scrypt$')); // no password data

  const added = (await call('PATCH', `/api/ai/accounts/${row.id}`, { body: { addCredits: 5 }, headers: admin })).body.data;
  assert.equal(added.credits, 5);
  const reset = (await call('PATCH', `/api/ai/accounts/${row.id}`, { body: { resetFree: true }, headers: admin })).body.data;
  assert.equal(reset.freeUsed, 0);
  assert.equal(reset.freeLeft, reset.freeTotal);

  assert.equal((await call('DELETE', `/api/ai/accounts/${row.id}`, { headers: admin })).status, 204);
  assert.equal((await call('GET', '/api/account/me', { headers: user })).body.data.user, null); // session ends with the account
  assert.equal((await call('DELETE', `/api/ai/accounts/${row.id}`, { headers: admin })).status, 404);
});

test('sessions update live from admin: length change, log out one user, log out everyone', async () => {
  const a = await signup('session-a@example.com');
  const b = await signup('session-b@example.com');
  const me = (h) => call('GET', '/api/account/me', { headers: h }).then((r) => r.body.data.user?.email ?? null);
  const settings = () => call('GET', '/api/settings').then((r) => r.body.data);

  // Changing the length applies to EXISTING sessions: the cookie is re-sent with the new remaining time
  let s = await settings();
  await call('PUT', '/api/settings', { body: { ...s, accounts: { ...s.accounts, sessionDays: 2 } }, headers: admin });
  const res = await fetch(base + '/api/account/me', { headers: a });
  const maxAge = Number(res.headers.getSetCookie().join(';').match(/Max-Age=(\d+)/)[1]);
  assert.ok(maxAge <= 2 * 86400 && maxAge > 2 * 86400 - 60, `cookie follows the new length (${maxAge}s)`);

  // Log out one user from admin → only that user is signed out
  const row = (await call('GET', '/api/ai/accounts', { headers: admin })).body.data.find((u) => u.email === 'session-a@example.com');
  assert.equal((await call('PATCH', `/api/ai/accounts/${row.id}`, { body: { logout: true }, headers: admin })).status, 200);
  assert.equal(await me(a), null);
  assert.equal(await me(b), 'session-b@example.com');

  // Saving the Settings form (which doesn't send the counter) must not sign anyone out
  s = await settings();
  const { sessionVersion: _v, ...accountsWithoutCounter } = s.accounts;
  await call('PUT', '/api/settings', { body: { ...s, accounts: accountsWithoutCounter }, headers: admin });
  assert.equal(await me(b), 'session-b@example.com');

  // Log out all visitors
  assert.equal((await call('POST', '/api/ai/accounts/logout-all')).status, 401);
  assert.equal((await call('POST', '/api/ai/accounts/logout-all', { headers: admin })).status, 200);
  assert.equal(await me(b), null);
  // …but they can log in again
  const again = await fetch(base + '/api/account/login', { method: 'POST', headers: json, body: JSON.stringify({ email: 'session-b@example.com', password: 'visitor-pass-123' }) });
  assert.equal(await me({ ...json, Cookie: cookieOf(again) }), 'session-b@example.com');

  s = await settings();
  await call('PUT', '/api/settings', { body: { ...s, accounts: { ...s.accounts, sessionDays: 30 } }, headers: admin });
});
