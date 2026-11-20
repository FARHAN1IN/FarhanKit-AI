import { html, mount } from '../../utils/dom.js';
import { renderField, readFields, setStatus, showErrors } from '../form.js';

/**
 * Generic "form + list" editor for a collection (projects, skills, experience).
 *
 * @param {object} cfg
 * @param {string} cfg.id         tab id
 * @param {string} cfg.label      tab label (plural)
 * @param {string} cfg.singular   e.g. "project"
 * @param {Array}  cfg.fields     field definitions (see form.js)
 * @param {string} cfg.resource   key on adminApi (projects | skills | experience)
 * @param {Function} cfg.load     () => Promise<items[]>
 * @param {Function} cfg.title    item => string
 * @param {Function} [cfg.meta]   item => string
 * @param {Function} [cfg.body]   item => string
 */
export function crudView(cfg) {
  return {
    id: cfg.id,
    label: cfg.label,

    async render(root, ctx) {
      mount(root, html`<div class="admin__split">
        <form class="card form" data-scope novalidate></form>
        <div class="admin__list" data-list></div>
      </div>`);
      const form = root.querySelector('form');
      const list = root.querySelector('[data-list]');
      let items = [];
      let editingId = null;

      const renderForm = (item = null) => {
        editingId = item?.id ?? null;
        mount(
          form,
          html`<h2>${item ? `Edit ${cfg.singular}` : `Add ${cfg.singular}`}</h2>
            <div class="form__grid">${cfg.fields.map((f) => renderField(f, item?.[f.name]))}</div>
            <div class="admin__form-actions">
              <button class="btn btn--primary" type="submit">${item ? 'Save changes' : `Add ${cfg.singular}`}</button>
              ${item ? html`<button class="btn btn--ghost" type="button" data-cancel>Cancel</button>` : ''}
            </div>
            <p class="form-status" role="status"></p>`,
        );
      };

      const renderList = async () => {
        items = await cfg.load();
        mount(
          list,
          items.length
            ? html`${items.map(
                (it) => html`<article class="card admin-item${it.id === editingId ? ' is-editing' : ''}">
                  <div class="admin-item__head">
                    <div>
                      <h3>${cfg.title(it)}</h3>
                      ${cfg.meta ? html`<small>${cfg.meta(it)}</small>` : ''}
                    </div>
                    <div class="admin-item__actions">
                      <button class="btn btn--ghost btn--sm" type="button" data-edit="${it.id}">Edit</button>
                      <button class="btn btn--danger btn--sm" type="button" data-delete="${it.id}">Delete</button>
                    </div>
                  </div>
                  ${cfg.body ? html`<p>${cfg.body(it)}</p>` : ''}
                </article>`,
              )}`
            : html`<p class="empty">No ${cfg.label.toLowerCase()} yet — add the first one.</p>`,
        );
      };

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const status = form.querySelector('.form-status');
        setStatus(status, '', 'Saving…');
        try {
          const api = ctx.client[cfg.resource];
          const wasEditing = editingId;
          if (wasEditing) await api.update(wasEditing, readFields(form));
          else await api.create(readFields(form));
          renderForm();
          await renderList();
          setStatus(form.querySelector('.form-status'), 'success', wasEditing ? 'Changes saved.' : `${cfg.singular[0].toUpperCase()}${cfg.singular.slice(1)} added.`);
        } catch (err) {
          if (!ctx.handleAuthError(err)) showErrors(form, err, status);
        }
      });

      form.addEventListener('click', (e) => {
        if (e.target.closest('[data-cancel]')) { renderForm(); renderList(); }
      });

      list.addEventListener('click', async (e) => {
        const edit = e.target.closest('[data-edit]');
        const del = e.target.closest('[data-delete]');
        if (edit) {
          renderForm(items.find((it) => it.id === edit.dataset.edit));
          await renderList();
          form.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        if (del) {
          const item = items.find((it) => it.id === del.dataset.delete);
          if (!confirm(`Delete "${cfg.title(item)}"? This cannot be undone.`)) return;
          try {
            await ctx.client[cfg.resource].remove(del.dataset.delete);
            if (editingId === del.dataset.delete) renderForm();
            await renderList();
          } catch (err) {
            ctx.handleError(err);
          }
        }
      });

      renderForm();
      await renderList();
    },
  };
}
