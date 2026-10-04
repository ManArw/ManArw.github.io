// Full-screen photo viewer (runs in the browser). Any link marked data-zoom
// (Figure, Spread and Strip make them) opens here instead of navigating to
// the image file. The viewer steps through every photo on the page in
// reading order: arrow keys or the side buttons, a swipe on touch screens,
// Esc or the close button to leave. Imported by those components; the module
// runs once per page however many of them there are.

type Item = { href: string; srcset: string; alt: string; caption: string; thumb: HTMLImageElement | null };

let dialog: HTMLDialogElement | null = null;
let items: Item[] = [];
let index = 0;
let opener: HTMLElement | null = null;

const icon = (d: string) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"></path></svg>`;

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

  d.querySelector('.lb-close')!.addEventListener('click', () => d.close());
  d.querySelector('.lb-prev')!.addEventListener('click', () => show(index - 1));
  d.querySelector('.lb-next')!.addEventListener('click', () => show(index + 1));
  // A click on the dark area around the photo closes it (but not the click
  // that ends a mouse swipe).
  let swiped = false;
  d.addEventListener('click', (e) => {
    if (swiped) return void (swiped = false);
    if (e.target === d || (e.target as Element).classList.contains('lb-stage')) d.close();
  });
  d.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') show(index - 1);
    else if (e.key === 'ArrowRight') show(index + 1);
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
      show(index + (dx < 0 ? 1 : -1));
    }
  });
  return d;
}

function show(i: number) {
  if (!dialog || i < 0 || i >= items.length) return;
  index = i;
  const it = items[i];
  const img = dialog.querySelector<HTMLImageElement>('.lb-img')!;
  // Show the copy already on the page at once, then swap in the sharp one.
  img.removeAttribute('srcset');
  img.src = it.thumb?.currentSrc || it.href;
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
  items = collect();
  opener = a;
  dialog ??= build();
  show(Math.max(0, items.findIndex((it) => it.href === a.getAttribute('href'))));
  document.documentElement.classList.add('lb-lock');
  dialog.showModal();
});
