import { html, mount } from '../utils/dom.js';

export function renderSkills(groups) {
  mount(
    '#skills-content',
    groups.length
      ? html`${groups.map(
          (g) => html`
            <article class="card skill-group" data-reveal>
              <h3>${g.category}</h3>
              <ul>
                ${(g.items ?? []).map(
                  (s) => html`<li class="skill">
                    <div class="skill__head"><span>${s.name}</span><span class="muted">${s.level}%</span></div>
                    <div class="skill__bar" role="progressbar" aria-label="${s.name}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${s.level}">
                      <span style="--level:${Number(s.level) || 0}%"></span>
                    </div>
                  </li>`,
                )}
              </ul>
            </article>`,
        )}`
      : html`<p class="empty">No skills added yet.</p>`,
  );
}
