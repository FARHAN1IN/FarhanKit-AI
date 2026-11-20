import { icons } from '../utils/icons.js';

/**
 * Eye button that shows/hides a password input.
 * Markup: <button data-toggle-password="<input id>"></button>
 */
function setVisible(btn, input, visible) {
  input.type = visible ? 'text' : 'password';
  btn.innerHTML = String(visible ? icons.eyeOff : icons.eye);
  btn.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
  btn.setAttribute('aria-pressed', String(visible));
}

/** Renders the icon on every toggle inside root and masks its input. */
export function initPasswordToggles(root = document) {
  for (const btn of root.querySelectorAll('[data-toggle-password]')) {
    const input = document.getElementById(btn.dataset.togglePassword);
    if (input) setVisible(btn, input, false);
  }
}

// One delegated click handler for every toggle on the page.
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-toggle-password]');
  if (!btn) return;
  const input = document.getElementById(btn.dataset.togglePassword);
  if (!input) return;
  setVisible(btn, input, input.type === 'password');
  input.focus();
});
