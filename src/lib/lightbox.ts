// Full-screen photo viewer (runs in the browser). Any link marked data-zoom
// (Figure, Spread and Strip make them) opens here instead of navigating to
// the image file. The viewer steps through every photo on the page in
// reading order: arrow keys or the side buttons, a swipe on touch screens,
// Esc or the close button to leave. Imported by those components; the module
// runs once per page however many of them there are.
//
// Where the browser supports View Transitions (and the reader hasn't asked
// for reduced motion) the photo grows out of its place on the page into the
// viewer, glides from one photo to the next, and shrinks back on close.
// Elsewhere the viewer simply fades.

type Item = { href: string; srcset: string; alt: string; caption: string; thumb: HTMLImageElement | null };

let dialog: HTMLDialogElement | null = null;
let items: Item[] = [];
let index = 0;
let opener: HTMLElement | null = null;
// The photo that was clicked, and its place in `items` (the same photo shown
// twice on a page is one stop in the viewer, so this may not be items[i].thumb).
let origin: { i: number; thumb: HTMLImageElement | null } = { i: -1, thumb: null };
let transitions = 0;

const NAME = 'lb-photo';
const icon = (d: string) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"></path></svg>`;

const photo = () => dialog!.querySelector<HTMLImageElement>('.lb-img')!;
const morphs = () => 'startViewTransition' in document && !matchMedia('(prefers-reduced-motion: reduce)').matches;
const onScreen = (el: Element | null): el is HTMLImageElement => {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
};
// Wait (briefly) for the viewer's photo to be ready to paint, so the
// transition's end state isn't an empty frame.
const ready = (img: HTMLImageElement) => Promise.race([img.decode().catch(() => {}), new Promise((r) => setTimeout(r, 250))]);

/**
 * Runs `update` as a view transition in which `from` (on screen before)
 * becomes `to()` (on screen after), or just runs it.
 */
function morph(from: HTMLElement | null, update: () => unknown, to: () => HTMLElement | null) {
  if (!morphs()) return void update();
  const n = ++transitions;
  if (from) from.style.viewTransitionName = NAME;
  let target: HTMLElement | null = null;
  const vt = document.startViewTransition(async () => {
    if (from) from.style.viewTransitionName = '';
    await update();
    target = to();
    if (target) target.style.viewTransitionName = NAME;
  });
  vt.ready.catch(() => {});
  vt.finished
    .catch(() => {})
    .finally(() => {
      // A newer transition may already have named something; leave it.
      if (n === transitions) {
        if (target) target.style.viewTransitionName = '';
        if (from) from.style.viewTransitionName = '';
      }
    });
}

function build() {
  const d = document.createElement('dialog');
  d.className = 'lb';
  d.setAttribute('aria-label', 'Photo viewer');
  d.innerHTML = `
    <div class="lb-top">
      <p class="lb-count" aria-live="polite"></p>
      <button type="button" class="lb-btn lb-close" aria-label="Close photo viewer" autofocus>${icon('M6 6l12 12M18 6L6 18')}</button>
    </div>
    <div class="lb-stage">
      <img class="lb-img" alt="" decoding="async" />
      <button type="button" class="lb-btn lb-prev" aria-label="Previous photo">${icon('M15 5l-7 7 7 7')}</button>
      <button type="button" class="lb-btn lb-next" aria-label="Next photo">${icon('M9 5l7 7-7 7')}</button>
    </div>
    <p class="lb-cap"></p>`;
  document.body.append(d);

  d.querySelector('.lb-close')!.addEventListener('click', close);
  d.querySelector('.lb-prev')!.addEventListener('click', () => step(index - 1));
  d.querySelector('.lb-next')!.addEventListener('click', () => step(index + 1));
  // A click on the dark area around the photo closes it (but not the click
  // that ends a mouse swipe).
  let swiped = false;
  d.addEventListener('click', (e) => {
    if (swiped) return void (swiped = false);
    if (e.target === d || (e.target as Element).classList.contains('lb-stage')) close();
  });
  d.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') step(index - 1);
    else if (e.key === 'ArrowRight') step(index + 1);
  });
  // Esc: close the same way as the button, so the photo can fly home.
  d.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });
  d.addEventListener('close', () => {
    document.documentElement.classList.remove('lb-lock');
    opener?.focus({ preventScroll: true });
  });

  // Horizontal swipe to move between photos.
  let x0 = 0;
  let y0 = 0;
  const stage = d.querySelector<HTMLElement>('.lb-stage')!;
  stage.addEventListener('pointerdown', (e) => {
    x0 = e.clientX;
    y0 = e.clientY;
    swiped = false;
  });
  stage.addEventListener('pointerup', (e) => {
    const dx = e.clientX - x0;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(e.clientY - y0) * 1.5) {
      swiped = true;
      step(index + (dx < 0 ? 1 : -1));
    }
  });
  return d;
}

function show(i: number, thumb = items[i]?.thumb) {
  if (!dialog || i < 0 || i >= items.length) return;
  index = i;
  const it = items[i];
  const img = photo();
  // Show the copy already on the page at once, then swap in the sharp one.
  img.removeAttribute('srcset');
  img.src = thumb?.currentSrc || it.href;
  img.alt = it.alt;
  const big = new Image();
  big.sizes = '100vw';
  big.srcset = it.srcset;
  big.src = it.href;
  big
    .decode()
    .then(() => {
      if (index !== i) return;
      img.sizes = '100vw';
      img.srcset = it.srcset;
      img.src = it.href;
    })
    .catch(() => {});
  dialog.querySelector('.lb-count')!.textContent = items.length > 1 ? `Photo ${i + 1} of ${items.length}` : '';
  dialog.querySelector('.lb-cap')!.textContent = it.caption;
  dialog.querySelector<HTMLButtonElement>('.lb-prev')!.hidden = i === 0;
  dialog.querySelector<HTMLButtonElement>('.lb-next')!.hidden = i === items.length - 1;
}

function step(i: number) {
  if (!dialog?.open || i < 0 || i >= items.length || i === index) return;
  const img = photo();
  morph(
    img,
    async () => {
      show(i);
      await ready(img);
    },
    () => img,
  );
}

function open(a: HTMLAnchorElement) {
  items = collect();
  opener = a;
  dialog ??= build();
  const i = Math.max(0, items.findIndex((it) => it.href === a.getAttribute('href')));
  const thumb = a.querySelector('img');
  origin = { i, thumb };
  const img = photo();
  morph(
    onScreen(thumb) ? thumb : null,
    async () => {
      show(i, thumb);
      document.documentElement.classList.add('lb-lock');
      dialog!.showModal();
      await ready(img);
    },
    () => (onScreen(thumb) ? img : null),
  );
}

function close() {
  if (!dialog?.open) return;
  // Fly back to the photo now showing, if it's on screen behind the viewer.
  const thumb = index === origin.i ? origin.thumb : items[index]?.thumb;
  const home = onScreen(thumb) ? thumb : null;
  morph(
    home ? photo() : null,
    () => {
      dialog!.close();
      document.documentElement.classList.remove('lb-lock');
    },
    () => home,
  );
}

function collect() {
  const seen = new Map<string, Item>();
  for (const a of document.querySelectorAll<HTMLAnchorElement>('a[data-zoom]')) {
    const href = a.getAttribute('href')!;
    if (seen.has(href)) continue; // the same photo shown twice is one stop
    const thumb = a.querySelector('img');
    seen.set(href, { href, srcset: a.dataset.srcset ?? '', alt: thumb?.alt ?? '', caption: a.dataset.caption ?? '', thumb });
  }
  return [...seen.values()];
}

document.addEventListener('click', (e) => {
  const a = (e.target as Element).closest<HTMLAnchorElement>('a[data-zoom]');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
  if (typeof HTMLDialogElement !== 'function') return; // very old browser: open the file
  e.preventDefault();
  open(a);
});
