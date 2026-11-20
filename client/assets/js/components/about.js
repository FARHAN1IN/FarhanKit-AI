import { html, mount, $$ } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { countUp } from '../core/reveal.js';

export function renderAbout(profile) {
  const stats = profile.stats ?? [];
  const el = mount(
    '#about-content',
    html`
      <div class="about__text" data-reveal>
        ${(profile.about ?? []).map((p) => html`<p>${p}</p>`)}
        <ul class="about__meta">
          ${profile.location ? html`<li>${icon('pin')} ${profile.location}</li>` : ''}
          ${profile.email ? html`<li>${icon('mail')} <a href="mailto:${profile.email}">${profile.email}</a></li>` : ''}
        </ul>
      </div>
      ${stats.length
        ? html`<ul class="stats" data-reveal>
            ${stats.map(
              (s) => html`<li class="card stat">
                <span class="stat__value"><span data-count="${s.value}">0</span>${s.suffix ?? ''}</span>
                <span class="stat__label">${s.label}</span>
              </li>`,
            )}
          </ul>`
        : ''}
    `,
  );
  el.classList.toggle('about--single', !stats.length);

  el.querySelector('.stats')?.addEventListener(
    'reveal',
    () => $$('[data-count]', el).forEach((n) => countUp(n, Number(n.dataset.count))),
    { once: true },
  );
}
