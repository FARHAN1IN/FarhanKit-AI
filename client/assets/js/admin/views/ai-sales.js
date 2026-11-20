import { html, mount } from '../../utils/dom.js';
import { setStatus } from '../form.js';

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString() : '');
const money = (p) => `${Number(p.price).toLocaleString()} ${p.currency}`;
const BADGE = { pending: '⏳ Pending', approved: '✓ Approved', rejected: '✕ Rejected' };

/** Admin → AI sales: approve visitors' manual payments and grant AI review credits. */
export const aiSalesView = {
  id: 'ai-sales',
  label: 'AI sales',

  async render(root, ctx) {
    const load = async () => {
      const payments = await ctx.client.aiPayments();
      const pending = payments.filter((p) => p.status === 'pending');
      const totals = {};
      payments.filter((p) => p.status === 'approved').forEach((p) => { totals[p.currency] = (totals[p.currency] ?? 0) + Number(p.price); });

      mount(root, html`
        <div class="cv-bar">
          <div>
            <h2>AI sales</h2>
            <p>${pending.length} payment${pending.length === 1 ? '' : 's'} waiting · earned ${
              Object.entries(totals).map(([c, v]) => `${v.toLocaleString()} ${c}`).join(' + ') || '0'
            }</p>
          </div>
        </div>

        <form class="card form" data-grant>
          <h3>Give credits by code</h3>
          <p class="muted">Every visitor sees their code under the AI review. Use a negative number to remove credits.</p>
          <div class="form__grid">
            <label class="field"><span>Visitor code</span><input name="code" maxlength="12" required placeholder="A1B2C3D4"></label>
            <label class="field"><span>AI reviews</span><input name="credits" type="number" min="-1000" max="1000" value="5" required></label>
          </div>
          <div class="form__actions"><button class="btn btn--primary btn--sm" type="submit">Add credits</button> <span class="form-status"></span></div>
        </form>

        ${payments.length
          ? html`<div class="admin__list">${payments.map(
              (p) => html`<article class="card admin-item${p.status === 'pending' ? ' is-unread' : ''}">
                <div class="admin-item__head">
                  <div>
                    <h3>${p.packageName} — ${p.credits} reviews · ${money(p)}</h3>
                    <small>${BADGE[p.status]} · ${fmtDate(p.createdAt)}${p.decidedAt ? ` · decided ${fmtDate(p.decidedAt)}` : ''}</small>
                  </div>
                  ${p.status === 'pending'
                    ? html`<div class="admin-item__actions">
                        <button class="btn btn--primary btn--sm" type="button" data-decide="approved" data-id="${p.id}">Approve</button>
                        <button class="btn btn--danger btn--sm" type="button" data-decide="rejected" data-id="${p.id}">Reject</button>
                      </div>`
                    : ''}
                </div>
                <p><strong>Transaction ID:</strong> ${p.transactionId}${p.method ? html` · <strong>Method:</strong> ${p.method}` : ''}${
                  p.sender ? html` · <strong>From:</strong> ${p.sender}` : ''
                } · <strong>Visitor code:</strong> ${p.walletCode}</p>
              </article>`,
            )}</div>`
          : html`<p class="empty">No payments yet. Set prices under Settings → AI review — free &amp; paid.</p>`}
      `);
    };

    root.onclick = async (e) => {
      const btn = e.target.closest('[data-decide]');
      if (!btn) return;
      const approve = btn.dataset.decide === 'approved';
      if (!confirm(approve ? 'Approve this payment? Only do this after you have received the money.' : 'Reject this payment?')) return;
      try {
        await ctx.client.decideAiPayment(btn.dataset.id, btn.dataset.decide);
        await load();
      } catch (err) {
        ctx.handleError(err);
      }
    };

    root.onsubmit = async (e) => {
      if (!e.target.matches('[data-grant]')) return;
      e.preventDefault();
      const form = e.target;
      const status = form.querySelector('.form-status');
      try {
        const w = await ctx.client.grantAiCredits(form.code.value, Number(form.credits.value));
        setStatus(status, 'success', `Done — ${w.code} now has ${w.credits} paid reviews.`);
        form.code.value = '';
      } catch (err) {
        setStatus(status, 'error', err.message);
      }
    };

    await load();
  },
};
