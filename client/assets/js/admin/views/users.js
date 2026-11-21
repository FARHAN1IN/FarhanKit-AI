import { html, mount } from '../../utils/dom.js';
import { setStatus } from '../form.js';

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString() : 'never');
const money = (spent) => Object.entries(spent).map(([c, v]) => `${Number(v).toLocaleString()} ${c}`).join(' + ');

/** Admin → Users: visitor accounts (AI reviews), their balances, and live session controls. */
export const usersView = {
  id: 'users',
  label: 'Users',

  async render(root, ctx) {
    let users = [];
    let settings = null;
    let query = '';

    const filtered = () => {
      const q = query.trim().toLowerCase();
      return q ? users.filter((u) => u.email.includes(q) || (u.name ?? '').toLowerCase().includes(q)) : users;
    };

    const userCard = (u) => html`<article class="card admin-item">
      <div class="admin-item__head">
        <div>
          <h3>${u.email}${u.name ? html` <small class="muted">· ${u.name}</small>` : ''}</h3>
          <small>Joined ${fmtDate(u.createdAt)} · last login ${fmtDate(u.lastLoginAt)}</small>
        </div>
        <div class="admin-item__actions">
          <button class="btn btn--ghost btn--sm" type="button" data-reset="${u.id}"${u.freeUsed ? '' : ' disabled'}>Reset free reviews</button>
          <button class="btn btn--ghost btn--sm" type="button" data-logout="${u.id}">Log out</button>
          <button class="btn btn--danger btn--sm" type="button" data-delete="${u.id}">Delete</button>
        </div>
      </div>
      <p class="user-stats">
        <span class="tag">🎁 Free: ${u.freeLeft} of ${u.freeTotal} left</span>
        <span class="tag${u.credits ? ' tag--accent' : ''}">💳 Paid reviews: ${u.credits}</span>
        ${u.payments.approved ? html`<span class="tag">✓ ${u.payments.approved} payment${u.payments.approved > 1 ? 's' : ''} · ${money(u.payments.spent)}</span>` : ''}
        ${u.payments.pending ? html`<span class="tag tag--accent">⏳ ${u.payments.pending} waiting — see AI sales</span>` : ''}
      </p>
      <form class="user-credits" data-credits="${u.id}">
        <label class="visually-hidden" for="credits-${u.id}">Reviews to add</label>
        <input id="credits-${u.id}" name="amount" type="number" min="-1000" max="1000" value="5" required>
        <button class="btn btn--ghost btn--sm" type="submit">Add reviews</button>
        <small class="muted">(negative number removes)</small>
      </form>
    </article>`;

    const render = () => {
      const list = filtered();
      const acc = settings?.accounts ?? {};
      mount(root, html`
        <div class="cv-bar">
          <div>
            <h2>Users</h2>
            <p>${users.length} visitor account${users.length === 1 ? '' : 's'} · they sign up in the CV Maker to use the AI review</p>
          </div>
        </div>

        <form class="card form" data-sessions>
          <h3>Login sessions</h3>
          <p class="muted">Changes apply immediately — also to people who are already logged in.</p>
          <div class="form__grid">
            <label class="field"><span>Visitors stay logged in for (days)</span>
              <input name="sessionDays" type="number" min="1" max="365" value="${acc.sessionDays ?? 30}" required></label>
            <label class="field"><span>Admin stays logged in for (hours)</span>
              <input name="adminSessionHours" type="number" min="1" max="720" value="${acc.adminSessionHours ?? 2}" required></label>
          </div>
          <div class="admin__form-actions">
            <button class="btn btn--primary btn--sm" type="submit">Save session length</button>
            <button class="btn btn--danger btn--sm" type="button" data-logout-all>Log out all visitors</button>
            <p class="form-status"></p>
          </div>
        </form>

        <div class="users-search">
          <input type="search" placeholder="Search by email or name…" value="${query}" data-search aria-label="Search users">
          ${query ? html`<small class="muted">${list.length} of ${users.length}</small>` : ''}
        </div>

        ${list.length
          ? html`<div class="admin__list">${list.map(userCard)}</div>`
          : html`<p class="empty">${users.length ? 'No account matches your search.' : 'No visitor accounts yet. Visitors create one in the CV Maker when they use the AI review.'}</p>`}
      `);
      if (query) {
        const s = root.querySelector('[data-search]');
        s.focus();
        s.setSelectionRange(s.value.length, s.value.length);
      }
    };

    const load = async () => {
      [users, settings] = await Promise.all([ctx.client.aiAccounts(), ctx.client.settings()]);
    };

    root.oninput = (e) => {
      if (!e.target.matches('[data-search]')) return;
      query = e.target.value;
      render();
    };

    root.onclick = async (e) => {
      const b = e.target.closest('button');
      if (!b || b.type === 'submit') return;
      const user = users.find((u) => u.id === (b.dataset.reset || b.dataset.logout || b.dataset.delete));
      try {
        if (b.dataset.reset) {
          await ctx.client.updateAiAccount(user.id, { resetFree: true });
        } else if (b.dataset.logout) {
          if (!confirm(`Log ${user.email} out on all devices?`)) return;
          await ctx.client.updateAiAccount(user.id, { logout: true });
        } else if (b.dataset.delete) {
          if (!confirm(`Delete the account ${user.email}? Their remaining reviews are lost. Payment history is kept.`)) return;
          await ctx.client.deleteAiAccount(user.id);
        } else if (b.hasAttribute('data-logout-all')) {
          if (!confirm('Log out ALL visitors on all devices? They can log in again any time.')) return;
          await ctx.client.logoutAllAiAccounts();
          setStatus(root.querySelector('[data-sessions] .form-status'), 'success', 'Done — every visitor has been logged out.');
          return;
        } else return;
        await load();
        render();
      } catch (err) {
        ctx.handleError(err);
      }
    };

    root.onsubmit = async (e) => {
      e.preventDefault();
      const form = e.target;
      try {
        if (form.matches('[data-credits]')) {
          await ctx.client.updateAiAccount(form.dataset.credits, { addCredits: Number(form.amount.value) });
          await load();
          render();
        } else if (form.matches('[data-sessions]')) {
          const status = form.querySelector('.form-status');
          const fresh = await ctx.client.settings();
          const { updatedAt: _u, ...doc } = fresh;
          await ctx.client.saveSettings({
            ...doc,
            accounts: { ...fresh.accounts, sessionDays: Number(form.sessionDays.value), adminSessionHours: Number(form.adminSessionHours.value) },
          });
          settings = await ctx.client.settings();
          setStatus(status, 'success', 'Saved — applies to everyone right away.');
        }
      } catch (err) {
        if (err.status === 401) return ctx.handleAuthError(err);
        ctx.handleError(err);
      }
    };

    await load();
    render();
  },
};
