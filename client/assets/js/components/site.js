import { $, $$, html, mount, raw, safeUrl } from '../utils/dom.js';
import { icon } from '../utils/icons.js';

/** <title>, meta description, favicon, accent colors. */
export function applySiteMeta(settings, profile) {
  const fallbackTitle = [profile?.name, profile?.title].filter(Boolean).join(' — ');
  document.title = settings.siteTitle || fallbackTitle || 'Portfolio';

  const desc = settings.metaDescription || profile?.tagline || '';
  document.querySelector('meta[name="description"]')?.setAttribute('content', desc);

  if (settings.favicon) $('#favicon')?.setAttribute('href', safeUrl(settings.favicon));

  const root = document.documentElement.style;
  if (settings.accentColor) root.setProperty('--accent', settings.accentColor);
  if (settings.accentColor2) root.setProperty('--accent-2', settings.accentColor2);
}

/**
 * Where the "Download CV" button points:
 *  - an uploaded/linked PDF → /api/cv (downloads as "<Name>-CV.pdf")
 *  - nothing uploaded       → /cv?print=1 (CV generated from your data, opens "Save as PDF")
 */
export function cvLink(profile) {
  return profile.resumeUrl
    ? { href: '/api/cv', attrs: raw(' download') }
    : { href: '/cv?print=1', attrs: raw(' target="_blank" rel="noopener"') };
}

/** Optional "Download CV" button in the navbar. */
export function renderNavCv(profile, cv) {
  const el = $('#nav-cv');
  if (!el) return;
  if (!cv?.enabled || !cv.showInNav) return el.remove();
  const { href, attrs } = cvLink(profile);
  el.outerHTML = String(
    html`<a class="btn btn--primary btn--sm navbar__cv" id="nav-cv" href="${href}"${attrs} title="${cv.label}">${icon('download')}<span>${cv.label}</span></a>`,
  );
}

/** Adds the public "CV Maker" link to the menu (call after renderSections). */
export function renderMakerLink(cv) {
  if (!cv?.makerEnabled) return;
  $('#nav-menu')?.insertAdjacentHTML('beforeend', String(html`<li><a href="/cv-maker">${cv.makerLabel || 'CV Maker'}</a></li>`));
}

/** Brand / logo in the navbar: uploaded logo image, else initials, else name. */
export function renderBrand(profile) {
  const brand = $('#brand');
  if (!brand || !profile) return;
  brand.setAttribute('aria-label', `${profile.name} — home`);
  mount(
    brand,
    profile.logoImage
      ? html`<img class="brand__logo" src="${safeUrl(profile.logoImage)}" alt="${profile.name}">`
      : html`${profile.initials || profile.name}`,
  );
}

/**
 * Applies settings.sections: order, visibility, headings and nav links.
 * Sections not enabled are removed from the page and the menu.
 */
export function renderSections(sections) {
  const main = $('#main');
  const visible = [];

  for (const s of sections) {
    const el = document.getElementById(s.id);
    if (!el) continue;
    if (!s.enabled) { el.remove(); continue; }

    main.append(el); // re-appending moves it → reorders sections
    visible.push(s);

    mount(
      $('[data-section-head]', el),
      html`${s.eyebrow ? html`<p class="eyebrow">${s.eyebrow}</p>` : ''}
        ${s.title ? html`<h2>${s.title}</h2>` : ''}
        ${s.subtitle ? html`<p class="section__subtitle muted">${s.subtitle}</p>` : ''}`,
    );
  }

  // Alternate backgrounds according to the final order
  $$('[data-section]', main).forEach((el, i) => el.classList.toggle('section--alt', i % 2 === 1));

  mount(
    '#nav-menu',
    html`${visible.filter((s) => s.navLabel).map((s) => html`<li><a href="#${s.id}">${s.navLabel}</a></li>`)}`,
  );

  return new Set(visible.map((s) => s.id));
}
