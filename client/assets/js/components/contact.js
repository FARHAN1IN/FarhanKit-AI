import { $ } from '../utils/dom.js';
import { api } from '../services/api.js';

const RULES = {
  name: (v) => (v.length < 2 ? 'Please enter your name.' : ''),
  email: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? '' : 'Please enter a valid email.'),
  message: (v) => (v.length < 10 ? 'Message should be at least 10 characters.' : ''),
};

function setFieldError(form, field, msg) {
  const input = form.elements[field];
  const out = form.querySelector(`[data-error-for="${field}"]`);
  if (!input || !out) return;
  input.setAttribute('aria-invalid', msg ? 'true' : 'false');
  out.textContent = msg;
}

export function initContact(profile, contactSettings = {}) {
  const form = $('#contact-form');
  if (!form) return; // section disabled
  const status = $('#form-status');
  $('#contact-submit').textContent = contactSettings.buttonLabel || 'Send';

  const link = $('#contact-email');
  if (profile?.email) {
    link.href = `mailto:${profile.email}`;
    link.textContent = profile.email;
  } else {
    link.parentElement.remove();
  }

  form.addEventListener('input', (e) => {
    const rule = RULES[e.target.name];
    if (rule && e.target.getAttribute('aria-invalid') === 'true') setFieldError(form, e.target.name, rule(e.target.value.trim()));
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    for (const k of Object.keys(data)) data[k] = String(data[k]).trim();
    if (data.website) return; // honeypot field filled → bot

    let valid = true;
    for (const [field, rule] of Object.entries(RULES)) {
      const msg = rule(data[field] ?? '');
      setFieldError(form, field, msg);
      if (msg) valid = false;
    }
    if (!valid) return;

    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    button.dataset.loading = 'true';
    status.className = 'form-status';
    status.textContent = 'Sending…';

    try {
      const { name, email, subject, message } = data;
      const res = await api.sendMessage({ name, email, subject, message });
      form.reset();
      status.classList.add('is-success');
      status.textContent = res.message;
    } catch (err) {
      Object.entries(err.details ?? {}).forEach(([f, m]) => setFieldError(form, f, m));
      status.classList.add('is-error');
      status.textContent = err.message;
    } finally {
      button.disabled = false;
      delete button.dataset.loading;
    }
  });
}
