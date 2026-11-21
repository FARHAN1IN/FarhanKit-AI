import { html, mount, formatMonth } from '../utils/dom.js';

export function renderExperience(items) {
  mount(
    '#experience-content',
    items.length
      ? html`<ol class="timeline">
          ${items.map(
            (x) => html`<li class="timeline__item" data-reveal>
              <div class="card">
                <p class="eyebrow">${x.start === x.end ? formatMonth(x.start) : html`${formatMonth(x.start)} — ${formatMonth(x.end)}`}${x.location ? html` · ${x.location}` : ''}</p>
                <h3>${x.role} <span class="muted">@ ${x.company}</span></h3>
                ${x.summary ? html`<p>${x.summary}</p>` : ''}
                ${x.highlights?.length ? html`<ul class="bullets">${x.highlights.map((h) => html`<li>${h}</li>`)}</ul>` : ''}
              </div>
            </li>`,
          )}
        </ol>`
      : html`<p class="empty">No experience added yet.</p>`,
  );
}
