/**
 * Owner's CV page.
 * /cv          → view the CV
 * /cv?print=1  → opens the print / "Save as PDF" dialog automatically
 *
 * Shows the CV saved in admin → My CV; until that exists, builds one from the portfolio.
 */
import { $, html, mount, safeUrl } from './utils/dom.js';
import { api } from './services/api.js';
import { initTheme } from './core/theme.js';
import { renderCv, fromPortfolio } from './cv/template.js';

async function loadCv() {
  const saved = await api.cvData();
  if (saved?.name) return saved;
  const [profile, experience, skills] = await Promise.all([api.profile(), api.experience(), api.skills()]);
  return fromPortfolio(profile, experience, skills);
}

initTheme(null);
$('#print-btn').addEventListener('click', () => window.print());

try {
  const [settings, cv] = await Promise.all([api.settings(), loadCv()]);
  document.title = `${cv.name || 'My'} - CV`;
  if (settings.favicon) $('#favicon').setAttribute('href', safeUrl(settings.favicon));
  if (settings.accentColor) document.documentElement.style.setProperty('--accent', settings.accentColor);

  mount('#cv', renderCv(cv));

  if (new URLSearchParams(location.search).has('print')) {
    await document.fonts?.ready;
    setTimeout(() => window.print(), 300); // let the photo/layout settle
  }
} catch (err) {
  mount('#cv', html`<p class="error-state">Couldn't load the CV: ${err.message}</p>`);
}
