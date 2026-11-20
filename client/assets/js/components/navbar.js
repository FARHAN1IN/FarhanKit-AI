import { $, $$ } from '../utils/dom.js';

/** Sticky nav behaviour: mobile menu toggle, scroll shadow, active-section highlight.
 *  Call after the menu links have been rendered (see components/site.js). */
export function initNavbar() {
  const nav = $('#navbar');
  const toggle = $('#nav-toggle');
  const menu = $('#nav-menu');

  const closeMenu = () => {
    menu.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
  };

  toggle.addEventListener('click', () => {
    const open = menu.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  $$('a', menu).forEach((a) => a.addEventListener('click', closeMenu));
  document.addEventListener('keydown', (e) => e.key === 'Escape' && closeMenu());

  const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 10);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Highlight the link for the section currently in view
  const links = new Map($$('a[href^="#"]', menu).map((a) => [a.getAttribute('href').slice(1), a]));
  const spy = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        links.forEach((a) => a.classList.remove('is-active'));
        links.get(entry.target.id)?.classList.add('is-active');
      }
    },
    { rootMargin: '-45% 0px -50% 0px' },
  );
  $$('main section[id]').forEach((s) => spy.observe(s));
}
