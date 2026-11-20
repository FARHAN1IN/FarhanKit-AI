import { icons } from '../utils/icons.js';

const KEY = 'portfolio-theme';

function read() {
  try { return localStorage.getItem(KEY); } catch { return null; }
}
function write(v) {
  try { localStorage.setItem(KEY, v); } catch { /* storage unavailable */ }
}

function current() {
  return read() ?? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
}

function apply(theme, button) {
  document.documentElement.dataset.theme = theme;
  if (button) {
    button.innerHTML = String(theme === 'dark' ? icons.sun : icons.moon);
    button.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`);
  }
}

export function initTheme(button) {
  apply(current(), button);
  button?.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    write(next);
    apply(next, button);
  });
}
