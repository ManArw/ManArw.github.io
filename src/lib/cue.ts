// Adds .is-in to each .cue element the first time it comes well into view,
// for animations that play once: a window shade lifting, prints developing,
// a chapter title arriving. With reduced motion (or a very old browser)
// everything is simply shown. Imported by the components that use it; the
// module runs once per page.
const els = document.querySelectorAll<HTMLElement>('.cue');
if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) {
  els.forEach((el) => el.classList.add('is-in'));
} else {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('is-in');
          io.unobserve(e.target);
        }
      }
    },
    { rootMargin: '0px 0px -15% 0px' },
  );
  els.forEach((el) => io.observe(el));
}

export {};
