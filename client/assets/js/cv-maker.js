/**
 * Public CV Maker: any visitor fills a simple form and downloads a PDF.
 * Nothing is sent to the server — the draft is kept in this browser only.
 */
import { $, html, mount, safeUrl } from './utils/dom.js';
import { api } from './services/api.js';
import { initTheme } from './core/theme.js';
import { createCvBuilder } from './cv/builder.js';
import { emptyCv } from './cv/template.js';

const DRAFT_KEY = 'cv-maker-draft';
const draft = {
  load() {
    try { return JSON.parse(localStorage.getItem(DRAFT_KEY)) ?? null; } catch { return null; }
  },
  save(data) {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(data)); } catch { /* storage full/blocked: keep working */ }
  },
  clear() {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
  },
};

initTheme(null);

try {
  const settings = await api.settings();
  if (settings.accentColor) document.documentElement.style.setProperty('--accent', settings.accentColor);
  if (settings.accentColor2) document.documentElement.style.setProperty('--accent-2', settings.accentColor2);
  if (settings.favicon) $('#favicon').setAttribute('href', safeUrl(settings.favicon));

  if (settings.cv?.makerEnabled === false) {
    mount('#builder', html`<p class="empty">The CV maker is currently unavailable.</p>`);
    $('.cv-bar__actions').querySelectorAll('button').forEach((b) => b.remove());
  } else {
    start();
  }
} catch {
  start(); // settings are cosmetic here — the tool still works offline from the API
}

function start() {
  const builder = createCvBuilder($('#builder'), {
    data: { ...emptyCv(), ...draft.load() },
    onChange: (data) => draft.save(data),
  });

  $('#download-btn').addEventListener('click', () => {
    const data = builder.getData();
    if (!data.name) {
      alert('Please enter at least your name first.');
      $('[data-f="name"]')?.focus();
      return;
    }
    draft.save(data);
    const title = document.title;
    document.title = `${data.name} - CV`; // default PDF file name
    window.print();
    document.title = title;
  });

  $('#reset-btn').addEventListener('click', () => {
    if (!confirm('Clear the form and start a new CV?')) return;
    draft.clear();
    builder.setData(emptyCv());
  });
}
