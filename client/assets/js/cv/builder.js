/**
 * Simple CV builder: 5 short steps on the left, live CV preview on the right.
 * Shared by the admin "My CV" tab and the public CV Maker page.
 *
 *   const builder = createCvBuilder(container, { data, onChange, uploadPhoto });
 *   builder.getData()   → current CV data
 *   builder.setData(d)  → replace the form contents
 *
 * uploadPhoto(file) → Promise<url>. If omitted, photos are resized in the browser
 * and kept as a small inline image (nothing is uploaded).
 */
import { html, mount, raw } from '../utils/dom.js';
import { renderCv, emptyCv } from './template.js';
import { scoreCv } from './ats.js';
import { renderAtsPanel } from './ats-panel.js';
import { suggestImprovements, improveLine } from './ats-improve.js';
import { api } from '../services/api.js';

const attr = (max) => raw(` maxlength="${max}"`);

const input = (key, label, value, { placeholder = '', max = 120, type = 'text', wide = false } = {}) =>
  html`<label class="cvb-field${wide ? ' cvb-wide' : ''}"><span>${label}</span>
    <input type="${type}" data-f="${key}" value="${value ?? ''}" placeholder="${placeholder}"${attr(max)}>
  </label>`;

const textarea = (key, label, value, { placeholder = '', max = 2000, rows = 3, hint = '' } = {}) =>
  html`<label class="cvb-field cvb-wide"><span>${label}${hint ? html` <em>${hint}</em>` : ''}</span>
    <textarea data-f="${key}" rows="${rows}" placeholder="${placeholder}"${attr(max)}>${value ?? ''}</textarea>
  </label>`;

const ENTRY = {
  experience: (e = {}) => html`<div class="cvb-entry" data-entry>
    <button type="button" class="cvb-remove" data-cvb-remove aria-label="Remove this job" title="Remove">✕</button>
    <div class="cvb-grid">
      ${input('role', 'Job title', e.role, { placeholder: 'Frontend Developer', max: 100 })}
      ${input('company', 'Company', e.company, { placeholder: 'Acme Inc.', max: 100 })}
      ${input('dates', 'Dates', e.dates, { placeholder: '2022 – Present', max: 60, wide: true })}
      ${textarea('details', 'What did you do?', e.details, { placeholder: 'One achievement per line, e.g.\nBuilt the company website\nLed a team of 3 developers', hint: '(one point per line)' })}
    </div>
  </div>`,

  education: (e = {}) => html`<div class="cvb-entry" data-entry>
    <button type="button" class="cvb-remove" data-cvb-remove aria-label="Remove this education" title="Remove">✕</button>
    <div class="cvb-grid">
      ${input('degree', 'Degree / course', e.degree, { placeholder: 'B.Sc. Computer Science', max: 120 })}
      ${input('school', 'School', e.school, { placeholder: 'State University', max: 120 })}
      ${input('year', 'Year', e.year, { placeholder: '2018 – 2022', max: 40, wide: true })}
    </div>
  </div>`,
};

const step = (n, title, body) => html`<section class="cvb-step">
  <h3><span class="cvb-num">${n}</span>${title}</h3>${body}
</section>`;

/** Resize an image file to a small JPEG data URL (for visitors — nothing is uploaded). */
async function toDataUrl(file, size = 320) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, size / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85);
}

const splitList = (s) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);

export function createCvBuilder(container, { data = emptyCv(), onChange = () => {}, uploadPhoto, ats = true } = {}) {
  let photo = '';
  let timer;
  let atsOpen = false; // keeps the "How to improve" list open/closed across live updates
  let fixes = null; // latest suggestions from the improvement model
  const ai = {
    available: false, state: 'idle', result: null, error: '', stale: false, reviewedJson: '',
    // billing
    wallet: null, plan: null, payments: [],
    buyOpen: false, buyState: 'idle', buyMsg: '', buyMsgKind: '',
    buyForm: { packageIndex: 0, method: '', transactionId: '', sender: '' },
  };

  /** Loads AI availability, the visitor's balance, price plan and payments. */
  async function loadAiStatus() {
    try {
      const s = await api.aiStatus();
      Object.assign(ai, { available: s.available, wallet: s.wallet ?? null, plan: s.plan ?? null, payments: s.payments ?? [] });
      if (ai.plan?.methods?.length && !ai.buyForm.method) ai.buyForm.method = ai.plan.methods[0].name;
      renderPreview();
    } catch { /* AI is optional */ }
  }

  function formMarkup(d) {
    return html`<form class="cvb-form" novalidate autocomplete="on">
      ${step(1, 'About you', html`<div class="cvb-grid">
        ${input('name', 'Full name', d.name, { placeholder: 'Jane Doe', max: 80 })}
        ${input('title', 'Job title', d.title, { placeholder: 'Web Developer', max: 100 })}
        ${input('email', 'Email', d.email, { placeholder: 'jane@email.com', type: 'email', max: 120 })}
        ${input('phone', 'Phone', d.phone, { placeholder: '+1 555 123 4567', type: 'tel', max: 40 })}
        ${input('location', 'City, Country', d.location, { placeholder: 'Berlin, Germany', max: 80 })}
        ${input('links', 'Website / LinkedIn', (d.links ?? []).join(', '), { placeholder: 'linkedin.com/in/jane', max: 600 })}
        <div class="cvb-field cvb-wide"><span>Photo <em>(optional)</em></span>
          <div class="cvb-photo">
            <img data-photo-preview alt=""${raw(' hidden')}>
            <label class="btn btn--ghost btn--sm">Choose photo<input type="file" accept="image/png,image/jpeg,image/webp" data-photo-input hidden></label>
            <button type="button" class="cvb-link" data-photo-remove hidden>Remove</button>
          </div>
        </div>
      </div>`)}

      ${step(2, 'Short summary', textarea('summary', 'About you in 2–3 sentences', d.summary, {
        placeholder: 'Web developer with 3 years of experience building fast, accessible websites…',
        max: 1500,
        rows: 4,
      }))}

      ${step(3, 'Experience', html`
        <div data-list="experience">${(d.experience ?? []).map((e) => ENTRY.experience(e))}</div>
        <button type="button" class="cvb-add" data-cvb-add="experience">+ Add job</button>`)}

      ${step(4, 'Education', html`
        <div data-list="education">${(d.education ?? []).map((e) => ENTRY.education(e))}</div>
        <button type="button" class="cvb-add" data-cvb-add="education">+ Add education</button>`)}

      ${step(5, 'Skills & languages', html`<div class="cvb-grid">
        ${textarea('skills', 'Skills', (d.skills ?? []).join(', '), { placeholder: 'HTML, CSS, JavaScript, Teamwork', rows: 2, max: 1500, hint: '(separate with commas)' })}
        ${textarea('languages', 'Languages', (d.languages ?? []).join(', '), { placeholder: 'English, German', rows: 1, max: 400, hint: '(optional)' })}
      </div>`)}

      ${ats
        ? step(6, html`Target job <em class="cvb-optional">(optional)</em>`, textarea('targetJob', 'Paste the job description you’re applying for', d.targetJob, {
            placeholder: 'We are looking for a Frontend Developer with React, TypeScript and REST API experience…',
            max: 8000,
            rows: 5,
            hint: '— the ATS score will check which keywords your CV is missing (not shown on the CV)',
          }))
        : ''}
    </form>`;
  }

  mount(container, html`<div class="cvb">
    <div data-form></div>
    <aside class="cvb-preview" aria-label="CV preview">
      ${ats ? html`<div class="no-print" data-ats></div>` : ''}
      <p class="cvb-preview__label">Live preview</p>
      <div data-preview></div>
    </aside>
  </div>`);

  const formHost = container.querySelector('[data-form]');
  const preview = container.querySelector('[data-preview]');
  const atsHost = container.querySelector('[data-ats]');

  /* ---------- read ---------- */
  const val = (scope, key) => scope.querySelector(`[data-f="${key}"]`)?.value.trim() ?? '';
  const readEntries = (list, keys) =>
    [...formHost.querySelectorAll(`[data-list="${list}"] [data-entry]`)]
      .map((el) => Object.fromEntries(keys.map((k) => [k, val(el, k)])))
      .filter((e) => Object.values(e).some(Boolean));

  function getData() {
    const form = formHost.querySelector('form');
    const top = (key) => {
      const el = [...form.querySelectorAll(`[data-f="${key}"]`)].find((x) => !x.closest('[data-entry]'));
      return el?.value.trim() ?? '';
    };
    return {
      name: top('name'),
      title: top('title'),
      email: top('email'),
      phone: top('phone'),
      location: top('location'),
      links: splitList(top('links')).slice(0, 5),
      photo,
      summary: top('summary'),
      experience: readEntries('experience', ['role', 'company', 'dates', 'details']),
      education: readEntries('education', ['degree', 'school', 'year']),
      skills: splitList(top('skills')),
      languages: splitList(top('languages')),
      ...(ats && { targetJob: top('targetJob') }),
    };
  }

  /* ---------- render ---------- */
  function renderPreview() {
    const cv = getData();
    mount(preview, renderCv(cv, { placeholders: true }));
    if (atsHost) {
      const result = scoreCv(cv, cv.targetJob);
      fixes = suggestImprovements(cv, result);
      if (ai.result) ai.stale = JSON.stringify(forAi(cv)) !== ai.reviewedJson;
      mount(atsHost, renderAtsPanel(result, { open: atsOpen, fixes, ai }));
    }
  }

  /** What is sent for the AI review — no photo. */
  const forAi = ({ photo: _photo, ...cv }) => cv;

  async function runAiReview() {
    const cv = forAi(getData());
    ai.state = 'loading';
    ai.error = '';
    renderPreview();
    try {
      const { wallet, ...review } = await api.aiReview(cv);
      ai.result = review;
      ai.wallet = wallet;
      ai.reviewedJson = JSON.stringify(cv);
      ai.state = 'done';
    } catch (err) {
      ai.state = 'error';
      ai.error = err.status === 400 ? 'Some fields are too long for the AI review — shorten them and try again.' : err.message;
      if (err.status === 402) {
        ai.buyOpen = true; // out of reviews → show the buy form
        if (ai.wallet) Object.assign(ai.wallet, { freeLeft: 0, credits: 0 });
      }
    }
    renderPreview();
  }

  async function submitPayment(form) {
    const f = ai.buyForm;
    if (!f.transactionId.trim()) {
      Object.assign(ai, { buyMsg: 'Please enter the transaction ID from your payment.', buyMsgKind: 'error' });
      return renderPreview();
    }
    ai.buyState = 'sending';
    ai.buyMsg = '';
    renderPreview();
    try {
      const { payments } = await api.aiPay({ ...f, packageIndex: Number(f.packageIndex) });
      Object.assign(ai, {
        payments, buyOpen: false, error: '', state: ai.result ? 'done' : 'idle',
        buyForm: { ...f, transactionId: '', sender: f.sender },
      });
    } catch (err) {
      Object.assign(ai, { buyMsg: err.message, buyMsgKind: 'error' });
    }
    ai.buyState = 'idle';
    renderPreview();
    form?.isConnected && form.querySelector('input')?.focus();
  }

  /** Replaces one experience line (matched by its text) with the AI's version. */
  function replaceBullet(original, improved) {
    const norm = (s) => s.replace(/^\s*[-*•]\s*/, '').trim().toLowerCase();
    for (const ta of formHost.querySelectorAll('[data-list="experience"] [data-f="details"]')) {
      const lines = ta.value.split('\n');
      const i = lines.findIndex((l) => norm(l) === norm(original));
      if (i !== -1) {
        lines[i] = lines[i].match(/^\s*(?:[-*•]\s*)?/)[0] + improved;
        ta.value = lines.join('\n');
        return true;
      }
    }
    return false;
  }

  const topField = (key) => [...formHost.querySelectorAll(`[data-f="${key}"]`)].find((x) => !x.closest('[data-entry]'));

  if (atsHost) {
    // <details> toggle doesn't bubble — listen in the capture phase.
    atsHost.addEventListener('toggle', (e) => { atsOpen = e.target.open; }, true);

    atsHost.addEventListener('click', (e) => {
      // "+ skill" adds a missing job keyword / suggested skill to the Skills field.
      const skillBtn = e.target.closest('[data-add-skill]');
      if (skillBtn) {
        const field = topField('skills');
        const skill = skillBtn.dataset.addSkill;
        const current = splitList(field.value);
        if (!current.some((s) => s.toLowerCase() === skill.toLowerCase())) current.push(skill);
        field.value = current.join(', ');
        return changed();
      }

      if (e.target.closest('[data-ai-review]')) return runAiReview();
      if (e.target.closest('[data-ai-buy]')) {
        Object.assign(ai, { buyOpen: true, buyMsg: '' });
        return renderPreview();
      }
      if (e.target.closest('[data-ai-buy-close]')) {
        ai.buyOpen = false;
        return renderPreview();
      }
      if (e.target.closest('[data-ai-refresh]')) return loadAiStatus();
      if (e.target.closest('[data-ai-summary]') && ai.result) {
        topField('summary').value = ai.result.rewrittenSummary;
        return changed();
      }
      const bulletBtn = e.target.closest('[data-ai-bullet]');
      if (bulletBtn && ai.result) {
        const b = ai.result.rewrittenBullets[Number(bulletBtn.dataset.aiBullet)];
        if (b && replaceBullet(b.original, b.improved)) return changed();
        bulletBtn.textContent = 'Not found — edit it by hand';
        return;
      }

      const apply = e.target.closest('[data-apply]')?.dataset.apply;
      if (apply === 'summary' && fixes?.summary) {
        const field = topField('summary');
        field.value = fixes.summary;
        field.focus();
        changed();
      } else if (apply === 'bullets') {
        formHost.querySelectorAll('[data-list="experience"] [data-f="details"]').forEach((ta) => {
          ta.value = ta.value.split('\n').map(improveLine).join('\n');
        });
        changed();
      }
    });
  }

  function changed() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      renderPreview();
      onChange(getData());
    }, 120);
  }

  function showPhoto() {
    const img = formHost.querySelector('[data-photo-preview]');
    img.hidden = !photo;
    if (photo) img.src = photo;
    formHost.querySelector('[data-photo-remove]').hidden = !photo;
  }

  function setData(d = emptyCv()) {
    photo = d.photo ?? '';
    mount(formHost, formMarkup({ ...emptyCv(), ...d }));
    showPhoto();
    renderPreview();
  }

  /* ---------- events (delegated) ---------- */
  formHost.addEventListener('input', changed);

  formHost.addEventListener('click', (e) => {
    const add = e.target.closest('[data-cvb-add]');
    const remove = e.target.closest('[data-cvb-remove]');
    if (add) {
      const list = formHost.querySelector(`[data-list="${add.dataset.cvbAdd}"]`);
      list.insertAdjacentHTML('beforeend', String(ENTRY[add.dataset.cvbAdd]()));
      list.lastElementChild.querySelector('input')?.focus();
      changed();
    } else if (remove) {
      remove.closest('[data-entry]').remove();
      changed();
    } else if (e.target.closest('[data-photo-remove]')) {
      photo = '';
      showPhoto();
      changed();
    }
  });

  formHost.addEventListener('change', async (e) => {
    const fileInput = e.target.closest('[data-photo-input]');
    if (!fileInput?.files?.[0]) return;
    const btn = fileInput.parentElement;
    btn.firstChild.textContent = 'Loading… ';
    try {
      photo = uploadPhoto ? await uploadPhoto(fileInput.files[0]) : await toDataUrl(fileInput.files[0]);
      showPhoto();
      changed();
    } catch (err) {
      alert(`Couldn't use that photo: ${err.message}`);
    } finally {
      btn.firstChild.textContent = 'Choose photo';
      fileInput.value = '';
    }
  });

  setData(data);

  // Show the AI review button only if the server has it switched on.
  if (atsHost) {
    // Buy form: keep typed values in state (the panel re-renders while the CV is edited).
    atsHost.addEventListener('input', (e) => {
      if (e.target.closest('[data-ai-buy-form]') && e.target.name in ai.buyForm) ai.buyForm[e.target.name] = e.target.value;
    });
    atsHost.addEventListener('change', (e) => {
      if (e.target.closest('[data-ai-buy-form]') && e.target.name in ai.buyForm) ai.buyForm[e.target.name] = e.target.value;
    });
    atsHost.addEventListener('submit', (e) => {
      if (!e.target.matches('[data-ai-buy-form]')) return;
      e.preventDefault();
      submitPayment(e.target);
    });
    loadAiStatus();
  }

  return { getData, setData };
}
