import { html, mount, safeUrl, $ } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { cvLink } from './site.js';

export function socialLinks(socials = []) {
  return html`<ul class="socials">
    ${socials.map(
      (s) => html`<li><a class="icon-btn" href="${safeUrl(s.url)}" target="_blank" rel="noopener noreferrer" aria-label="${s.name}" title="${s.name}">${icon(s.icon)}</a></li>`,
    )}
  </ul>`;
}

/** Cycles through profile.roles with a typing effect. */
function typeRoles(el, roles) {
  if (!el || roles.length < 2 || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let r = 0, i = roles[0].length, deleting = true;
  const step = () => {
    el.textContent = roles[r].slice(0, i);
    if (deleting) {
      if (--i < 0) { deleting = false; r = (r + 1) % roles.length; i = 0; }
    } else if (++i > roles[r].length) {
      deleting = true;
      return setTimeout(step, 1800);
    }
    setTimeout(step, deleting ? 40 : 80);
  };
  setTimeout(step, 2000);
}

function cvButton(profile, cv) {
  if (!cv?.enabled) return '';
  const { href, attrs } = cvLink(profile);
  return html`<a class="btn btn--ghost" href="${href}"${attrs}>${icon('download')} ${cv.label || 'Download CV'}</a>`;
}

/**
 * @param profile   /api/profile
 * @param hero      settings.hero (greeting + button labels)
 * @param enabled   Set of enabled section ids (CTA buttons only link to visible sections)
 * @param cv        settings.cv
 */
export function renderHero(profile, hero, enabled, cv) {
  const roles = profile.roles?.length ? profile.roles : [profile.title].filter(Boolean);
  mount(
    '#hero-content',
    html`
      <div class="hero__content">
        ${profile.availability ? html`<p class="badge"><span class="dot"></span>${profile.availability}</p>` : ''}
        <h1 class="hero__title">${hero.greeting ? html`${hero.greeting} ` : ''}<span class="gradient-text">${profile.name}</span></h1>
        ${roles.length ? html`<p class="hero__role"><span id="typed-role">${roles[0]}</span><span class="caret" aria-hidden="true"></span></p>` : ''}
        ${profile.tagline ? html`<p class="hero__tagline">${profile.tagline}</p>` : ''}
        <div class="hero__actions">
          ${hero.primaryCtaLabel && enabled.has('projects') ? html`<a class="btn btn--primary" href="#projects">${hero.primaryCtaLabel} ${icon('arrow')}</a>` : ''}
          ${hero.secondaryCtaLabel && enabled.has('contact') ? html`<a class="btn btn--ghost" href="#contact">${hero.secondaryCtaLabel}</a>` : ''}
          ${cvButton(profile, cv)}
        </div>
        ${socialLinks(profile.socials)}
      </div>
      ${profile.avatar ? html`<div class="hero__avatar"><img src="${safeUrl(profile.avatar)}" alt="${profile.name}" width="320" height="320"></div>` : ''}
    `,
  );
  typeRoles($('#typed-role'), roles);
}
