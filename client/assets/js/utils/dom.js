/* DOM helpers. All dynamic text goes through `html`, which escapes by default. */

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escape = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

class SafeHTML {
  constructor(value) { this.value = value; }
  toString() { return this.value; }
}

/** Mark a string as trusted HTML (only use for markup you wrote, e.g. icons). */
export const raw = (s) => new SafeHTML(String(s));

function renderValue(v) {
  if (v instanceof SafeHTML) return v.value;
  if (Array.isArray(v)) return v.map(renderValue).join('');
  if (v === null || v === undefined || v === false) return '';
  return escape(v);
}

/** Tagged template: html`<p>${userText}</p>` — interpolations are escaped. */
export function html(strings, ...values) {
  return raw(strings.reduce((out, str, i) => out + renderValue(values[i - 1]) + str));
}

/** Only allow safe URL schemes in href attributes. */
export const safeUrl = (url) => (/^(https?:|mailto:|\/|#)/i.test(url ?? '') ? url : '#');

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function mount(target, content) {
  const el = typeof target === 'string' ? $(target) : target;
  if (el) el.innerHTML = String(content);
  return el;
}

export const formatMonth = (ym) => {
  if (!ym) return 'Present';
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, (m || 1) - 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
};

/** Deterministic hue from a string — used for generated project covers. */
export const hueFrom = (s) => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
