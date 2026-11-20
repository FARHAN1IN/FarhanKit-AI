/**
 * Scroll-reveal: elements with [data-reveal] fade in when they enter the viewport.
 * Elements added later can be registered with observeReveal(root).
 */
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const observer =
  'IntersectionObserver' in window && !reduceMotion
    ? new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            entry.target.classList.add('is-visible');
            entry.target.dispatchEvent(new CustomEvent('reveal'));
            observer.unobserve(entry.target);
          }
        },
        { threshold: 0.15, rootMargin: '0px 0px -40px 0px' },
      )
    : null;

export function observeReveal(root = document) {
  for (const el of root.querySelectorAll('[data-reveal]:not(.is-visible)')) {
    if (observer) observer.observe(el);
    else {
      el.classList.add('is-visible');
      el.dispatchEvent(new CustomEvent('reveal'));
    }
  }
}

/** Animate a number from 0 to its target once revealed. */
export function countUp(el, target, duration = 1200) {
  if (reduceMotion) { el.textContent = target; return; }
  const start = performance.now();
  const tick = (now) => {
    const p = Math.min((now - start) / duration, 1);
    el.textContent = Math.round(target * (1 - (1 - p) ** 3));
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
