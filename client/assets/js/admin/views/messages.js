import { html, mount } from '../../utils/dom.js';

const fmtDate = (iso) => new Date(iso).toLocaleString();

export const messagesView = {
  id: 'messages',
  label: 'Messages',

  async render(root, ctx) {
    const load = async () => {
      const { data } = await ctx.client.messages();
      ctx.refreshUnread();
      mount(
        root,
        data.length
          ? html`<div class="admin__list">${data.map(
              (m) => html`<article class="card admin-item${m.read ? '' : ' is-unread'}">
                <div class="admin-item__head">
                  <div>
                    <h3>${m.subject || '(no subject)'}</h3>
                    <small>${m.name} · <a class="link" href="mailto:${m.email}">${m.email}</a> · ${fmtDate(m.createdAt)}</small>
                  </div>
                  <div class="admin-item__actions">
                    <button class="btn btn--ghost btn--sm" type="button" data-toggle="${m.id}" data-read="${m.read}">${m.read ? 'Mark unread' : 'Mark read'}</button>
                    <button class="btn btn--danger btn--sm" type="button" data-delete="${m.id}">Delete</button>
                  </div>
                </div>
                <p>${m.message}</p>
              </article>`,
            )}</div>`
          : html`<p class="empty">No messages yet.</p>`,
      );
    };

    root.onclick = async (e) => {
      const toggle = e.target.closest('[data-toggle]');
      const del = e.target.closest('[data-delete]');
      try {
        if (toggle) await ctx.client.markRead(toggle.dataset.toggle, toggle.dataset.read !== 'true');
        else if (del) {
          if (!confirm('Delete this message?')) return;
          await ctx.client.deleteMessage(del.dataset.delete);
        } else return;
        await load();
      } catch (err) {
        ctx.handleError(err);
      }
    };

    await load();
  },
};
