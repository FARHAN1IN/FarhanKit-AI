import { $, html, mount } from './utils/dom.js';
import { api } from './services/api.js';
import { initTheme } from './core/theme.js';
import { observeReveal } from './core/reveal.js';
import { applySiteMeta, renderBrand, renderSections, renderNavCv, renderMakerLink } from './components/site.js';
import { initNavbar } from './components/navbar.js';
import { renderHero } from './components/hero.js';
import { renderAbout } from './components/about.js';
import { renderSkills } from './components/skills.js';
import { initProjects } from './components/projects.js';
import { renderExperience } from './components/experience.js';
import { initContact } from './components/contact.js';
import { renderFooter } from './components/footer.js';

const errorBox = (msg) => html`<p class="error-state">${msg}</p>`;

/** Runs a section loader; on failure shows an inline error instead of breaking the page. */
async function section(selector, loader) {
  if (!$(selector)) return; // section disabled in settings
  try {
    await loader();
  } catch (err) {
    console.error(`[${selector}]`, err);
    mount(selector, errorBox(`Couldn't load this section. ${err.message}`));
  }
}

async function bootstrap() {
  initTheme($('#theme-toggle'));

  // Site-wide data first: everything else depends on it.
  const [settings, profile] = await Promise.all([api.settings(), api.profile()]).catch((err) => {
    mount('#hero-content', errorBox(`Couldn't load the site. ${err.message}`));
    return [null, null];
  });
  if (!settings || !profile) return;

  applySiteMeta(settings, profile);
  renderBrand(profile);
  renderNavCv(profile, settings.cv);
  const enabled = renderSections(settings.sections);
  renderMakerLink(settings.cv);
  initNavbar();

  renderHero(profile, settings.hero, enabled, settings.cv);
  if (enabled.has('about')) renderAbout(profile);
  renderFooter(profile, settings.footerText);
  initContact(profile, settings.contact);

  await Promise.all([
    section('#skills-content', async () => renderSkills(await api.skills())),
    section('#experience-content', async () => renderExperience(await api.experience())),
    section('#projects-grid', initProjects),
  ]);

  observeReveal();
}

bootstrap();
