import { api } from '../../services/api.js';
import { html, mount } from '../../utils/dom.js';
import { renderField, readFields, setStatus, showErrors } from '../form.js';

const SOCIAL_ICONS = ['github', 'linkedin', 'x', 'instagram', 'facebook', 'youtube', 'dribbble', 'globe', 'mail'];
const SECTION_NAMES = { about: 'About', skills: 'Skills', projects: 'Projects', experience: 'Experience', contact: 'Contact' };

/**
 * Editor for a single document (profile, settings): sections of fields, one Save button.
 * @param {{ id, label, title, intro, load, save: (client, data) => Promise, sections: {title, fields}[] }} cfg
 */
function documentView(cfg) {
  return {
    id: cfg.id,
    label: cfg.label,
    async render(root, ctx) {
      const doc = await cfg.load();
      mount(
        root,
        html`<form class="card form form--doc" data-scope novalidate>
          <h2>${cfg.title}</h2>
          ${cfg.intro ? html`<p class="muted">${cfg.intro}</p>` : ''}
          ${cfg.sections.map(
            (s) => html`<section class="form__section">
              <h3>${s.title}</h3>
              <div class="form__grid">${s.fields.map((f) => renderField(f, doc[f.name]))}</div>
            </section>`,
          )}
          <div class="admin__form-actions form__sticky">
            <button class="btn btn--primary" type="submit">Save ${cfg.label.toLowerCase()}</button>
            <a class="btn btn--ghost" href="/" target="_blank" rel="noopener">Preview site ↗</a>
            <p class="form-status" role="status"></p>
          </div>
        </form>`,
      );

      const form = root.querySelector('form');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const status = form.querySelector('.form-status');
        setStatus(status, '', 'Saving…');
        try {
          await cfg.save(ctx.client, readFields(form));
          form.querySelectorAll('.field__error').forEach((el) => (el.textContent = ''));
          setStatus(status, 'success', 'Saved — refresh the site to see changes.');
        } catch (err) {
          if (!ctx.handleAuthError(err)) showErrors(form, err, status);
        }
      });
    },
  };
}

export const profileView = documentView({
  id: 'profile',
  label: 'Profile',
  title: 'Profile',
  intro: 'Your name, logo, photo, bio and links — shown in the header, hero, about section and footer.',
  load: () => api.profile(),
  save: (client, data) => client.saveProfile(data),
  sections: [
    {
      title: 'Identity & branding',
      fields: [
        { name: 'name', label: 'Full name', required: true, max: 80 },
        { name: 'title', label: 'Professional title', required: true, max: 100, placeholder: 'Full-Stack Developer' },
        { name: 'initials', label: 'Logo text', max: 6, hint: '(used when no logo image)', placeholder: 'YN' },
        { name: 'availability', label: 'Availability badge', max: 80, hint: '(empty = hidden)', placeholder: 'Open to new opportunities' },
        { name: 'logoImage', label: 'Logo image', type: 'image', hint: '(replaces logo text)' },
        { name: 'avatar', label: 'Profile photo', type: 'image', hint: '(shown in the hero)' },
      ],
    },
    {
      title: 'Hero & about',
      fields: [
        { name: 'roles', label: 'Rotating roles', type: 'lines', hint: '(one per line — typed animation)', rows: 3 },
        { name: 'tagline', label: 'Tagline', type: 'textarea', max: 300, rows: 3 },
        { name: 'about', label: 'About me', type: 'paragraphs', hint: '(blank line between paragraphs)', rows: 7, wide: true },
      ],
    },
    {
      title: 'Contact details',
      fields: [
        { name: 'email', label: 'Email', type: 'email', max: 120 },
        { name: 'location', label: 'Location', max: 80 },
        { name: 'resumeUrl', label: 'Résumé / CV', type: 'file', accept: 'application/pdf', hint: '(optional PDF — leave empty to use the "My CV" tab)', wide: true },
      ],
    },
    {
      title: 'Stats & social links',
      fields: [
        {
          name: 'stats',
          label: 'Stats',
          type: 'repeater',
          addLabel: 'Add stat',
          hint: '(animated counters in About)',
          fields: [
            { name: 'label', label: 'Label', required: true, max: 40 },
            { name: 'value', label: 'Number', type: 'number', min: 0, required: true },
            { name: 'suffix', label: 'Suffix', max: 4, placeholder: '+' },
          ],
        },
        {
          name: 'socials',
          label: 'Social links',
          type: 'repeater',
          addLabel: 'Add link',
          fields: [
            { name: 'name', label: 'Name', required: true, max: 30 },
            { name: 'url', label: 'URL', placeholder: 'https://…' },
            { name: 'icon', label: 'Icon', type: 'select', options: SOCIAL_ICONS, default: 'globe' },
          ],
        },
      ],
    },
  ],
});

export const settingsView = documentView({
  id: 'settings',
  label: 'Settings',
  title: 'Site settings',
  intro: 'Page title, SEO, colors, section headings, menu labels, section order and button text.',
  load: () => api.settings(),
  save: (client, data) => client.saveSettings(data),
  sections: [
    {
      title: 'General & SEO',
      fields: [
        { name: 'siteTitle', label: 'Browser tab title', max: 120, hint: '(empty = "Name — Title")' },
        { name: 'favicon', label: 'Favicon', type: 'image' },
        { name: 'metaDescription', label: 'Meta description', type: 'textarea', max: 300, hint: '(search engine snippet)', wide: true },
        { name: 'accentColor', label: 'Accent color', type: 'color' },
        { name: 'accentColor2', label: 'Gradient color', type: 'color' },
        { name: 'footerText', label: 'Footer text', max: 200, hint: '— use {year} and {name}', wide: true },
      ],
    },
    {
      title: 'Hero & contact buttons',
      fields: [
        {
          name: 'hero',
          label: 'Hero',
          type: 'group',
          fields: [
            { name: 'greeting', label: 'Greeting before name', max: 40, placeholder: "Hi, I'm" },
            { name: 'primaryCtaLabel', label: 'Primary button', max: 40, hint: '(→ Projects)' },
            { name: 'secondaryCtaLabel', label: 'Secondary button', max: 40, hint: '(→ Contact)' },
          ],
        },
        {
          name: 'cv',
          label: 'CV download',
          type: 'group',
          fields: [
            { name: 'enabled', label: 'Show "Download CV" button', type: 'checkbox' },
            { name: 'showInNav', label: 'Also show it in the top bar', type: 'checkbox' },
            { name: 'label', label: 'Button text', max: 40, placeholder: 'Download CV' },
            {
              name: '_help',
              type: 'note',
              wide: true,
              text: 'Downloads the CV from the "My CV" tab (or a PDF uploaded under Profile → Résumé / CV, if you prefer your own file).',
              link: { href: '/cv', label: 'Preview CV ↗' },
            },
            { name: 'makerEnabled', label: 'Offer a free CV Maker to visitors', type: 'checkbox' },
            { name: 'makerLabel', label: 'CV Maker menu label', max: 40, placeholder: 'CV Maker' },
            {
              name: '_help2',
              type: 'note',
              wide: true,
              text: 'Visitors fill a simple form and download their own CV as PDF. Nothing they type is stored on your server.',
              link: { href: '/cv-maker', label: 'Open CV Maker ↗' },
            },
            { name: 'aiEnabled', label: 'Offer "AI review" in the ATS score', type: 'checkbox' },
            {
              name: '_help3',
              type: 'note',
              wide: true,
              text: 'Add your AI models and their API keys in the "AI models" tab — every model that is on reviews the CV and the results are merged. The CV text is sent to those AI services; photos are never sent.',
            },
          ],
        },
        {
          name: 'accounts',
          label: 'Sessions (how long people stay logged in)',
          type: 'group',
          fields: [
            { name: 'sessionDays', label: 'Visitor accounts — days', type: 'number', min: 1, max: 365, placeholder: '30' },
            { name: 'adminSessionHours', label: 'Admin login — hours', type: 'number', min: 1, max: 720, placeholder: '2' },
            {
              name: '_help5',
              type: 'note',
              wide: true,
              text: 'Applies to the next login. Visitors use their account for AI reviews (free reviews and bought reviews are kept on the account, so incognito or a VPN does not give extra free reviews).',
            },
          ],
        },
        {
          name: 'aiPlan',
          label: 'AI review — free & paid',
          type: 'group',
          fields: [
            { name: 'freeReviews', label: 'Free AI reviews per visitor', type: 'number', min: 0, max: 100, placeholder: '3' },
            { name: 'currency', label: 'Currency', max: 10, placeholder: 'USD, EGP, BDT…' },
            {
              name: 'packages',
              label: 'Packages visitors can buy',
              type: 'repeater',
              addLabel: 'Add package',
              fields: [
                { name: 'name', label: 'Name', required: true, max: 40, placeholder: 'Starter' },
                { name: 'credits', label: 'AI reviews', type: 'number', min: 1, required: true },
                { name: 'price', label: 'Price', type: 'number', min: 0, required: true },
              ],
            },
            {
              name: 'methods',
              label: 'How visitors can pay you',
              type: 'repeater',
              addLabel: 'Add payment method',
              hint: '(shown to visitors)',
              fields: [
                { name: 'name', label: 'Method', required: true, max: 40, placeholder: 'Vodafone Cash' },
                { name: 'details', label: 'Where to send', max: 200, placeholder: '010 1234 5678 — Your Name' },
              ],
            },
            { name: 'instructions', label: 'Payment instructions', type: 'textarea', max: 600, wide: true },
            {
              name: '_help4',
              type: 'note',
              wide: true,
              text: 'After a visitor uses their free reviews they pick a package, pay you with one of the methods above and submit the transaction ID. Check it in the "AI sales" tab and approve it — their reviews are added immediately.',
            },
          ],
        },
        {
          name: 'contact',
          label: 'Contact form',
          type: 'group',
          fields: [
            { name: 'buttonLabel', label: 'Submit button', max: 40 },
            { name: 'successMessage', label: 'Success message', max: 200 },
          ],
        },
      ],
    },
    {
      title: 'Sections & navigation',
      fields: [
        {
          name: 'sections',
          label: 'Page sections',
          hint: '— use ↑ ↓ to reorder; untick to hide a section',
          type: 'repeater',
          fixed: true,
          rowTitle: (s) => SECTION_NAMES[s.id] ?? s.id,
          fields: [
            { name: 'id', type: 'hidden' },
            { name: 'enabled', label: 'Show section', type: 'checkbox' },
            { name: 'navLabel', label: 'Menu label', max: 30, hint: '(empty = not in menu)' },
            { name: 'eyebrow', label: 'Small label', max: 60 },
            { name: 'title', label: 'Heading', max: 120 },
            { name: 'subtitle', label: 'Intro text', type: 'textarea', max: 400, rows: 2, wide: true },
          ],
        },
      ],
    },
  ],
});
