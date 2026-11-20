/**
 * CV data model + the single CV design.
 *
 * CV data shape (kept deliberately simple — all plain text):
 * { name, title, email, phone, location, links[], photo, summary,
 *   experience[{ role, company, dates, details }],   details: one point per line
 *   education[{ degree, school, year }],
 *   skills[], languages[] }
 */
import { html, safeUrl, formatMonth } from '../utils/dom.js';

export const emptyCv = () => ({
  name: '', title: '', email: '', phone: '', location: '', links: [], photo: '',
  summary: '', experience: [], education: [], skills: [], languages: [],
  targetJob: '', // only used by the ATS score, never printed
});

/** Builds CV data from the portfolio (used to pre-fill the owner's CV). */
export function fromPortfolio(profile = {}, experience = [], skills = []) {
  return {
    ...emptyCv(),
    name: profile.name ?? '',
    title: profile.title ?? '',
    email: profile.email ?? '',
    location: profile.location ?? '',
    links: (profile.socials ?? []).map((s) => s.url).filter((u) => /^https?:\/\//i.test(u ?? '')),
    photo: profile.avatar ?? '',
    summary: profile.about?.[0] || profile.tagline || '',
    experience: experience.map((x) => ({
      role: x.role ?? '',
      company: x.company ?? '',
      dates: `${formatMonth(x.start)} – ${formatMonth(x.end)}`,
      details: [x.summary, ...(x.highlights ?? [])].filter(Boolean).join('\n'),
    })),
    skills: skills.flatMap((g) => (g.items ?? []).map((s) => s.name)),
  };
}

const displayUrl = (url) => url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');

/** Allows uploaded/remote images and small inline photos chosen by visitors (data:image/…). */
const photoSrc = (src) => (/^data:image\/(png|jpe?g|webp);base64,[a-z0-9+/=]+$/i.test(src) ? src : safeUrl(src));

/** One line → paragraph; several lines → bullet list. Leading "-", "*" or "•" is optional. */
function details(text = '') {
  const lines = text.split('\n').map((l) => l.replace(/^\s*[-*•]\s*/, '').trim()).filter(Boolean);
  if (!lines.length) return '';
  return lines.length === 1 ? html`<p>${lines[0]}</p>` : html`<ul class="cv-bullets">${lines.map((l) => html`<li>${l}</li>`)}</ul>`;
}

const section = (title, body) => (body ? html`<section class="cv-section"><h2>${title}</h2>${body}</section>` : '');
const tags = (list = []) => (list.length ? html`<ul class="cv-tags">${list.map((t) => html`<li>${t}</li>`)}</ul>` : '');

/**
 * Renders the CV sheet.
 * @param {object} cv
 * @param {{ placeholders?: boolean }} opts  show grey "Your Name" etc. while the form is empty
 */
export function renderCv(cv, { placeholders = false } = {}) {
  const ph = (value, text) => value || (placeholders ? html`<span class="cv-placeholder">${text}</span>` : '');

  const contacts = [
    cv.email && html`<li><a href="mailto:${cv.email}">${cv.email}</a></li>`,
    cv.phone && html`<li>${cv.phone}</li>`,
    cv.location && html`<li>${cv.location}</li>`,
    ...(cv.links ?? []).map((l) => html`<li><a href="${safeUrl(/^https?:/i.test(l) ? l : `https://${l}`)}">${displayUrl(l)}</a></li>`),
  ].filter(Boolean);

  const experience = (cv.experience ?? []).filter((e) => e.role || e.company || e.details);
  const education = (cv.education ?? []).filter((e) => e.degree || e.school);

  const empty = !cv.summary && !experience.length && !education.length && !cv.skills?.length;

  return html`<article class="cv-sheet">
    <header class="cv-head">
      ${cv.photo ? html`<img class="cv-avatar" src="${photoSrc(cv.photo)}" alt="">` : ''}
      <div>
        <h1>${ph(cv.name, 'Your Name')}</h1>
        <p class="cv-title">${ph(cv.title, 'Your job title')}</p>
        ${contacts.length ? html`<ul class="cv-contacts">${contacts}</ul>` : placeholders ? html`<ul class="cv-contacts"><li class="cv-placeholder">email · phone · city</li></ul>` : ''}
      </div>
    </header>

    ${section('Profile', cv.summary ? html`<p>${cv.summary}</p>` : '')}

    ${section(
      'Experience',
      experience.length
        ? html`${experience.map(
            (e) => html`<article class="cv-item">
              <div class="cv-item__head">
                <h3>${e.role}${e.company ? html`<span class="cv-muted">${e.role ? ' · ' : ''}${e.company}</span>` : ''}</h3>
                ${e.dates ? html`<span class="cv-date">${e.dates}</span>` : ''}
              </div>
              ${details(e.details)}
            </article>`,
          )}`
        : '',
    )}

    ${section(
      'Education',
      education.length
        ? html`${education.map(
            (e) => html`<article class="cv-item">
              <div class="cv-item__head">
                <h3>${e.degree}${e.school ? html`<span class="cv-muted">${e.degree ? ' · ' : ''}${e.school}</span>` : ''}</h3>
                ${e.year ? html`<span class="cv-date">${e.year}</span>` : ''}
              </div>
            </article>`,
          )}`
        : '',
    )}

    ${section('Skills', tags(cv.skills))}
    ${section('Languages', tags(cv.languages))}

    ${empty && placeholders ? html`<p class="cv-empty">Start typing on the left — your CV appears here.</p>` : ''}
  </article>`;
}
