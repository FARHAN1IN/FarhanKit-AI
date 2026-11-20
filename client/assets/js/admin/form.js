/**
 * Declarative form toolkit for the admin panel.
 *
 *  field(def, value)        → one input (text, textarea, number, color, month, select,
 *                              checkbox, hidden, lines, paragraphs, csv, image, file)
 *  group(def, value)        → nested object  (e.g. settings.hero)
 *  repeater(def, items)     → list of objects with add / remove / reorder rows
 *  readFields(scope)        → reads a form (or any [data-scope]) back into a plain object
 *  bindFormInteractions()   → one delegated listener set for repeaters + uploads
 *
 * Every input carries data-key (property name) and data-type (how to read it back).
 * Elements with [data-scope] (the form, each repeater row, each group) own the keys inside them.
 */
import { $$, html, raw, safeUrl } from '../utils/dom.js';

const maxAttr = (f) => (f.max ? raw(` maxlength="${Number(f.max)}"`) : '');
const reqAttr = (f) => (f.required ? raw(' required') : '');

function labelText(f) {
  return html`<span>${f.label}${f.required ? html` <b class="req" aria-hidden="true">*</b>` : ''}${
    f.hint ? html` <em class="muted">${f.hint}</em>` : ''
  }</span>`;
}

const errorSlot = (f) => html`<small class="field__error" data-error-for="${f.name}"></small>`;

export function field(f, value) {
  const type = f.type ?? 'text';
  const cls = `field${f.wide ? ' field--wide' : ''}`;
  const v = value ?? f.default ?? '';

  switch (type) {
    case 'hidden':
      return html`<input type="hidden" data-key="${f.name}" data-type="text" value="${v}">`;

    case 'note': // read-only help text (not submitted)
      return html`<p class="form__note${f.wide ? ' field--wide' : ''}">${f.text}${
        f.link ? html` <a class="link" href="${safeUrl(f.link.href)}" target="_blank" rel="noopener">${f.link.label}</a>` : ''
      }</p>`;

    case 'checkbox':
      return html`<label class="field field--check${f.wide ? ' field--wide' : ''}">
        <input type="checkbox" data-key="${f.name}" data-type="checkbox"${value ?? f.default ? raw(' checked') : ''}>
        <span>${f.label}</span>
      </label>`;

    case 'textarea':
    case 'lines':
    case 'paragraphs': {
      const text = Array.isArray(v) ? v.join(type === 'paragraphs' ? '\n\n' : '\n') : v;
      const dataType = type === 'textarea' ? 'text' : type;
      return html`<label class="${cls}">${labelText(f)}
        <textarea data-key="${f.name}" data-type="${dataType}" rows="${f.rows ?? 3}" placeholder="${f.placeholder ?? ''}"${maxAttr(f)}${reqAttr(f)}>${text}</textarea>
        ${errorSlot(f)}
      </label>`;
    }

    case 'csv':
      return html`<label class="${cls}">${labelText(f)}
        <input data-key="${f.name}" data-type="csv" value="${Array.isArray(v) ? v.join(', ') : v}" placeholder="${f.placeholder ?? ''}">
        ${errorSlot(f)}
      </label>`;

    case 'select':
      return html`<label class="${cls}">${labelText(f)}
        <select data-key="${f.name}" data-type="text">
          ${f.options.map((o) => {
            const val = o.value ?? o;
            return html`<option value="${val}"${val === v ? raw(' selected') : ''}>${o.label ?? o}</option>`;
          })}
        </select>
        ${errorSlot(f)}
      </label>`;

    case 'number':
      return html`<label class="${cls}">${labelText(f)}
        <input type="number" data-key="${f.name}" data-type="number" value="${v}"
          ${f.min !== undefined ? raw(`min="${Number(f.min)}"`) : ''} ${f.maxValue !== undefined ? raw(`max="${Number(f.maxValue)}"`) : ''}${reqAttr(f)}>
        ${errorSlot(f)}
      </label>`;

    case 'color':
      return html`<label class="${cls}">${labelText(f)}
        <input type="color" data-key="${f.name}" data-type="text" value="${v || '#7c5cff'}">
        ${errorSlot(f)}
      </label>`;

    case 'image':
    case 'file': {
      const isImage = type === 'image';
      return html`<div class="${cls}">${labelText(f)}
        <div class="upload">
          ${isImage ? html`<img class="upload__preview" alt="" src="${v ? safeUrl(v) : ''}"${v ? '' : raw(' hidden')}>` : ''}
          <input data-key="${f.name}" data-type="text" value="${v}" placeholder="https://… or upload a file"${maxAttr(f)}>
          <label class="btn btn--ghost btn--sm upload__btn">Upload
            <input type="file" accept="${f.accept ?? (isImage ? 'image/*' : '')}" data-upload hidden>
          </label>
        </div>
        ${errorSlot(f)}
      </div>`;
    }

    default: // text, email, month…
      return html`<label class="${cls}">${labelText(f)}
        <input type="${type}" data-key="${f.name}" data-type="text" value="${v}" placeholder="${f.placeholder ?? ''}"${maxAttr(f)}${reqAttr(f)}>
        ${errorSlot(f)}
      </label>`;
  }
}

/** Renders any field definition, including nested groups/repeaters. */
export function renderField(f, value) {
  if (f.type === 'repeater') return repeater(f, value);
  if (f.type === 'group') return group(f, value);
  return field(f, value);
}

export function group(def, value = {}) {
  return html`<fieldset class="group${def.wide !== false ? ' field--wide' : ''}" data-key="${def.name}" data-type="group" data-scope>
    <legend>${def.label}</legend>
    <div class="form__grid">${def.fields.map((f) => renderField(f, value?.[f.name]))}</div>
  </fieldset>`;
}

export function repeater(def, items = []) {
  const { name, label, fields, addLabel = 'Add', fixed = false, rowTitle, hint } = def;
  const row = (item = {}) => html`<div class="repeater__row" data-scope>
    ${rowTitle ? html`<strong class="repeater__title">${rowTitle(item)}</strong>` : ''}
    <div class="repeater__fields">${fields.map((f) => field(f, item[f.name]))}</div>
    <div class="repeater__controls">
      <button type="button" class="icon-btn icon-btn--sm" data-move="-1" aria-label="Move up" title="Move up">↑</button>
      <button type="button" class="icon-btn icon-btn--sm" data-move="1" aria-label="Move down" title="Move down">↓</button>
      ${fixed ? '' : html`<button type="button" class="icon-btn icon-btn--sm icon-btn--danger" data-remove aria-label="Remove" title="Remove">✕</button>`}
    </div>
  </div>`;

  return html`<fieldset class="repeater field--wide" data-key="${name}" data-type="repeater">
    <legend>${label}${hint ? html` <em class="muted">${hint}</em>` : ''}</legend>
    <div class="repeater__rows">${(items ?? []).map(row)}</div>
    ${fixed ? '' : html`<button type="button" class="btn btn--ghost btn--sm" data-add>+ ${addLabel}</button><template>${row()}</template>`}
  </fieldset>`;
}

/* ---------------- Reading ---------------- */

const owner = (el) => el.parentElement?.closest('[data-scope]');

function readValue(el) {
  switch (el.dataset.type) {
    case 'checkbox': return el.checked;
    case 'number': return el.value === '' ? undefined : Number(el.value);
    case 'lines': return el.value.split('\n').map((s) => s.trim()).filter(Boolean);
    case 'paragraphs': return el.value.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
    case 'csv': return el.value.split(',').map((s) => s.trim()).filter(Boolean);
    case 'group': return readFields(el);
    case 'repeater': return [...el.querySelector(':scope > .repeater__rows').children].map(readFields);
    default: return el.value.trim();
  }
}

export function readFields(scope) {
  const out = {};
  for (const el of scope.querySelectorAll('[data-key]')) {
    if (owner(el) !== scope) continue;
    const v = readValue(el);
    if (v !== undefined) out[el.dataset.key] = v;
  }
  return out;
}

/* ---------------- Status & errors ---------------- */

export function setStatus(el, kind, message) {
  if (!el) return;
  el.className = `form-status${kind ? ` is-${kind}` : ''}`;
  el.textContent = message;
}

/** Shows API validation errors inline where possible, the rest in the status line. */
export function showErrors(form, err, statusEl) {
  $$('.field__error', form).forEach((el) => (el.textContent = ''));
  const leftovers = [];
  for (const [key, msg] of Object.entries(err.details ?? {})) {
    const slot = $$(`[data-error-for="${CSS.escape(key)}"]`, form).find((el) => el.closest('[data-scope]') === form);
    if (slot) slot.textContent = msg;
    else leftovers.push(`${key}: ${msg}`);
  }
  setStatus(statusEl, 'error', [err.message, ...leftovers].join(' — '));
}

/* ---------------- Interactions (delegated, bind once) ---------------- */

export function bindFormInteractions(root, { upload, onError }) {
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-add], [data-move], [data-remove]');
    if (!btn) return;
    const rep = btn.closest('.repeater');

    if (btn.hasAttribute('data-add')) {
      const rows = rep.querySelector(':scope > .repeater__rows');
      rows.insertAdjacentHTML('beforeend', rep.querySelector(':scope > template').innerHTML);
      rows.lastElementChild.querySelector('input, textarea, select')?.focus();
      return;
    }

    const row = btn.closest('.repeater__row');
    if (btn.hasAttribute('data-remove')) return row.remove();

    if (btn.dataset.move === '-1' && row.previousElementSibling) row.previousElementSibling.before(row);
    if (btn.dataset.move === '1' && row.nextElementSibling) row.nextElementSibling.after(row);
    btn.focus();
  });

  const updatePreview = (wrapper) => {
    const img = wrapper.querySelector('.upload__preview');
    const val = wrapper.querySelector('[data-key]').value.trim();
    if (!img) return;
    img.hidden = !val;
    if (val) img.src = safeUrl(val);
  };

  root.addEventListener('input', (e) => {
    const wrapper = e.target.closest('.upload');
    if (wrapper && e.target.matches('[data-key]')) updatePreview(wrapper);
  });

  root.addEventListener('change', async (e) => {
    const input = e.target;
    if (!input.matches('[data-upload]') || !input.files?.[0]) return;
    const wrapper = input.closest('.upload');
    const btn = input.closest('.upload__btn');
    btn.firstChild.textContent = 'Uploading… ';
    try {
      const { url } = await upload(input.files[0]);
      wrapper.querySelector('[data-key]').value = url;
      updatePreview(wrapper);
    } catch (err) {
      onError(err);
    } finally {
      btn.firstChild.textContent = 'Upload ';
      input.value = '';
    }
  });
}
