// Renders 1200×630 link-preview cards (the image WhatsApp, LinkedIn, X, etc.
// show when someone shares a link). Satori lays out the card, resvg turns it into a PNG.
import { readFile } from 'node:fs/promises';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import { site } from '../data/site';

export type Card = {
  title: string;
  subtitle?: string;
  kicker?: string;
  /** Path to a local photo (relative to the project root) used as the background. */
  photo?: string;
};

const W = 1200;
const H = 630;
const DEFAULT_PHOTO = 'src/assets/japan/fuji-dusk.jpg';

const font = (pkg: string, file: string) => readFile(`node_modules/@fontsource/${pkg}/files/${file}`);
let fonts: Promise<Parameters<typeof satori>[1]['fonts']> | undefined;
function loadFonts() {
  fonts ??= Promise.all([
    font('josefin-sans', 'josefin-sans-latin-300-normal.woff'),
    font('josefin-sans', 'josefin-sans-latin-500-normal.woff'),
    font('newsreader', 'newsreader-latin-400-italic.woff'),
  ]).then(([light, medium, italic]) => [
    { name: 'Josefin', data: light, weight: 300 as const, style: 'normal' as const },
    { name: 'Josefin', data: medium, weight: 500 as const, style: 'normal' as const },
    { name: 'Newsreader', data: italic, weight: 400 as const, style: 'italic' as const },
  ]);
  return fonts;
}

const photos = new Map<string, Promise<string>>();
function photoData(path: string) {
  if (!photos.has(path)) {
    photos.set(
      path,
      sharp(path)
        .resize(W, H, { fit: 'cover', position: 'attention' })
        .jpeg({ quality: 78 })
        .toBuffer()
        .then((b) => `data:image/jpeg;base64,${b.toString('base64')}`),
    );
  }
  return photos.get(path)!;
}

// Tiny hyperscript helper so we don't need React/JSX for Satori.
type Node = { type: string; props: Record<string, unknown> };
const h = (type: string, style: Record<string, unknown>, ...children: (Node | string | null | undefined)[]): Node => ({
  type,
  // Satori needs an explicit display on every element with children.
  props: { style: { display: 'flex', ...style }, children: children.filter((c) => c != null && c !== '') },
});

function clamp(s: string, max: number) {
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s;
}

export async function renderCard({ title, subtitle, kicker, photo = DEFAULT_PHOTO }: Card): Promise<Buffer> {
  const bg = await photoData(photo);
  const t = clamp(title, 90);
  const titleSize = t.length > 60 ? 54 : t.length > 34 ? 66 : 84;

  const tree = h(
    'div',
    { width: W, height: H, display: 'flex', position: 'relative', background: '#0a1220', fontFamily: 'Josefin' },
    { type: 'img', props: { src: bg, width: W, height: H, style: { position: 'absolute', top: 0, left: 0, width: W, height: H, objectFit: 'cover' } } },
    h('div', {
      position: 'absolute',
      top: 0,
      left: 0,
      width: W,
      height: H,
      backgroundImage: 'linear-gradient(90deg, rgba(10,18,32,0.94) 0%, rgba(10,18,32,0.82) 45%, rgba(10,18,32,0.25) 100%)',
    }),
    h(
      'div',
      { position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: W, height: H, padding: '64px 72px', color: '#eef3f8' },
      h(
        'div',
        { display: 'flex', alignItems: 'center', gap: 16, fontSize: 28, fontWeight: 500, letterSpacing: 1 },
        h('div', { width: 36, height: 2, background: '#9fc2ea' }),
        kicker ?? site.name,
      ),
      h(
        'div',
        { display: 'flex', flexDirection: 'column', maxWidth: 820 },
        h('div', { fontSize: titleSize, fontWeight: 300, lineHeight: 1.08, letterSpacing: -1 }, t),
        subtitle
          ? h('div', { marginTop: 22, fontFamily: 'Newsreader', fontStyle: 'italic', fontSize: 32, lineHeight: 1.35, color: '#c9d5e3' }, clamp(subtitle, 175))
          : null,
      ),
      h(
        'div',
        { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', fontSize: 26, color: '#a9b8ca' },
        h('div', { fontWeight: 500, color: '#eef3f8' }, title === site.name ? '' : site.name),
        h('div', { fontWeight: 300 }, new URL(site.url).host),
      ),
    ),
  );

  const svg = await satori(tree as unknown as Parameters<typeof satori>[0], { width: W, height: H, fonts: await loadFonts() });
  return new Resvg(svg, { fitTo: { mode: 'width', value: W } }).render().asPng();
}
