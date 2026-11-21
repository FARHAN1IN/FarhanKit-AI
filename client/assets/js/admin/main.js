import { $, $$, html, mount } from '../utils/dom.js';
import { adminApi, ApiError } from '../services/api.js';
import { initTheme } from '../core/theme.js';
import { bindFormInteractions } from './form.js';
import { initPasswordToggles } from './password-toggle.js';
import { messagesView } from './views/messages.js';
import { profileView, settingsView } from './views/documents.js';
import { projectsView, experienceView, skillsView } from './views/collections.js';
import { accountView } from './views/account.js';
import { cvView } from './views/cv.js';
import { aiSalesView } from './views/ai-sales.js';
import { aiModelsView } from './views/ai-models.js';
import { usersView } from './views/users.js';

/** Tab order in the dashboard. Add a view here to add a tab. */
const VIEWS = [messagesView, profileView, cvView, settingsView, aiModelsView, aiSalesView, usersView, projectsView, experienceView, skillsView, accountView];

/*
 * Session: the server keeps the login in an HttpOnly cookie that JavaScript cannot read.
 * Opening or refreshing /admin always signs out first, so the login form is always shown.
 */
const client = adminApi;
const panel = $('#panel');
const signedOut = client.logout().catch(() => {}); // always start signed out (login waits for this)

/** Shared context handed to every view. */
const ctx = {
  client,
  /** Returns true if the error was an auth failure (and the user was sent to the login form). */
  handleAuthError(err) {
    if (err instanceof ApiError && err.status === 401) {
      endSession('Your session expired — please sign in again.');
      return true;
    }
    return false;
  },
  handleError(err) {
    if (!ctx.handleAuthError(err)) alert(err.message);
  },
  async refreshUnread() {
    try {
      const { unread } = await client.messages();
      $('#unread-count').textContent = unread || '';
    } catch { /* non-critical */ }
  },
  setUser(username) {
    const el = $('#current-user');
    el.textContent = username ? `Signed in as ${username}` : '';
    el.hidden = !username;
  },
};

bindFormInteractions(panel, { upload: (file) => client.upload(file), onError: ctx.handleError });

/* ---------------- Views & tabs ---------------- */
function renderTabs(active) {
  mount(
    '#tabs',
    html`${VIEWS.map(
      (v) => html`<button class="chip${v.id === active ? ' is-active' : ''}" role="tab" type="button"
        aria-selected="${v.id === active}" data-tab="${v.id}">${v.label}${
          v.id === 'messages' ? html` <span class="count" id="unread-count"></span>` : ''
        }</button>`,
    )}`,
  );
}

async function openView(id) {
  const view = VIEWS.find((v) => v.id === id) ?? VIEWS[0];
  $$('[data-tab]').forEach((t) => {
    const active = t.dataset.tab === view.id;
    t.classList.toggle('is-active', active);
    t.setAttribute('aria-selected', String(active));
  });
  if (location.hash !== `#${view.id}`) history.replaceState(null, '', `#${view.id}`);

  panel.onclick = null; // views may set their own delegated handler
  mount(panel, html`<div class="skeleton skeleton--block"></div>`);
  try {
    await view.render(panel, ctx);
  } catch (err) {
    if (!ctx.handleAuthError(err)) mount(panel, html`<p class="error-state">Couldn't load ${view.label}: ${err.message}</p>`);
  }
}

$('#tabs').addEventListener('click', (e) => {
  const tab = e.target.closest('[data-tab]');
  if (tab && !tab.classList.contains('is-active')) openView(tab.dataset.tab);
});

/* ---------------- Login / logout ---------------- */
const loginForm = $('#login-form');

function showLogin(message = '') {
  $('#login-view').hidden = false;
  $('#dashboard-view').hidden = true;
  $('#logout').hidden = true;
  ctx.setUser(null);
  const status = $('#login-status');
  status.textContent = message;
  status.className = `form-status${message ? ' is-error' : ''}`;
  initPasswordToggles(loginForm);
  $('#username-input').focus();
}

/** Clears the UI; the server cookie is cleared by the caller when needed. */
function endSession(message = '') {
  mount(panel, '');
  showLogin(message);
}

async function showDashboard(username) {
  $('#login-view').hidden = true;
  $('#dashboard-view').hidden = false;
  $('#logout').hidden = false;
  ctx.setUser(username);

  const initial = location.hash.slice(1) || VIEWS[0].id;
  renderTabs(initial);
  ctx.refreshUnread();
  await openView(initial);
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = loginForm.elements.username.value.trim();
  const password = loginForm.elements.password.value;
  if (!username || !password) return;

  const button = loginForm.querySelector('button[type="submit"]');
  const status = $('#login-status');
  button.disabled = true;
  status.className = 'form-status';
  status.textContent = 'Signing in…';

  try {
    await signedOut;
    const res = await client.login(username, password);
    loginForm.reset();
    status.textContent = '';
    await showDashboard(res.username);
  } catch (err) {
    loginForm.elements.password.value = '';
    status.className = 'form-status is-error';
    status.textContent = err.message;
    loginForm.elements.password.focus();
  } finally {
    button.disabled = false;
  }
});

$('#logout').addEventListener('click', async () => {
  await client.logout().catch(() => {});
  endSession('You have been signed out.');
  $('#login-status').className = 'form-status';
});

/* ---------------- Boot ---------------- */
initTheme($('#theme-toggle'));
try { sessionStorage.removeItem('portfolio-admin-token'); } catch { /* leftover from the old token login */ }
showLogin();
