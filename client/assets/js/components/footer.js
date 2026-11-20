import { html, mount } from '../utils/dom.js';
import { socialLinks } from './hero.js';

/** Footer text supports {year} and {name} placeholders. */
export function renderFooter(profile, footerText = '') {
  const text = footerText.replaceAll('{year}', new Date().getFullYear()).replaceAll('{name}', profile.name ?? '');
  mount('#footer-content', html`<p>${text}</p>${socialLinks(profile.socials)}`);
}
