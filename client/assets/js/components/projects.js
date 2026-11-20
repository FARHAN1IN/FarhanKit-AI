import { html, mount, safeUrl, hueFrom, $ } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { observeReveal } from '../core/reveal.js';
import { api } from '../services/api.js';

function cover(p) {
  if (p.image) return html`<img class="project__img" src="${safeUrl(p.image)}" alt="" loading="lazy">`;
  const h = hueFrom(p.title);
  return html`<div class="project__img project__img--generated" style="--h:${h}" aria-hidden="true">
    <span>${p.title.slice(0, 2)}</span>
  </div>`;
}

export function projectCard(p) {
  return html`
    <article class="card project" data-reveal>
      ${cover(p)}
      <div class="project__body">
        <div class="project__top">
          ${p.category ? html`<span class="eyebrow">${p.category}</span>` : ''}
          ${p.featured ? html`<span class="tag tag--accent">Featured</span>` : ''}
        </div>
        <h3>${p.title}</h3>
        <p>${p.description}</p>
        <ul class="tags">${(p.tags ?? []).map((t) => html`<li class="tag">${t}</li>`)}</ul>
        <div class="project__links">
          ${p.repoUrl ? html`<a href="${safeUrl(p.repoUrl)}" target="_blank" rel="noopener noreferrer">${icon('code')} Code</a>` : ''}
          ${p.liveUrl ? html`<a href="${safeUrl(p.liveUrl)}" target="_blank" rel="noopener noreferrer">${icon('external')} Live demo</a>` : ''}
        </div>
      </div>
    </article>`;
}

/** Projects grid with category filters; each filter change re-queries the API. */
export async function initProjects() {
  const grid = $('#projects-grid');
  const filters = $('#project-filters');
  if (!grid) return; // section disabled
  const categories = await api.categories();

  // Filters only make sense with 2+ categories
  mount(
    filters,
    categories.length > 1
      ? html`<button class="chip is-active" data-category="" aria-pressed="true">All</button>
          ${categories.map((c) => html`<button class="chip" data-category="${c}" aria-pressed="false">${c}</button>`)}`
      : '',
  );

  const load = async (category) => {
    grid.setAttribute('aria-busy', 'true');
    try {
      const projects = await api.projects({ category });
      mount(grid, projects.length ? html`${projects.map(projectCard)}` : html`<p class="empty">No projects added yet.</p>`);
      observeReveal(grid);
    } catch (err) {
      mount(grid, html`<p class="error-state">Couldn't load projects: ${err.message}</p>`);
    } finally {
      grid.removeAttribute('aria-busy');
    }
  };

  filters.addEventListener('click', (e) => {
    const btn = e.target.closest('.chip');
    if (!btn || btn.classList.contains('is-active')) return;
    filters.querySelectorAll('.chip').forEach((c) => {
      const active = c === btn;
      c.classList.toggle('is-active', active);
      c.setAttribute('aria-pressed', String(active));
    });
    load(btn.dataset.category);
  });

  await load('');
}
