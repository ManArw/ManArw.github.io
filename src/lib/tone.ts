// Build time only: reads a photo (or a clip's poster in public/) and returns
// the CSS custom properties its component needs: --g1…--g4, the four glow
// colours (top left, top right, bottom left, bottom right; see glow.ts), and
// --ph, a gradient of its own colours shown while the photo loads.
import sharp from 'sharp';
import { join } from 'node:path';
import type { ImageMetadata } from 'astro';
import { lift } from './glow';

const cache = new Map<string, Promise<string>>();
const hex = (rgb: number[]) => '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const mix = (a: number[], b: number[]) => a.map((v, i) => (v + b[i]) / 2);

export function tone(src: ImageMetadata | string): Promise<string> {
  // Astro keeps the original file's path on imported images.
  const file = typeof src === 'string' ? join(process.cwd(), 'public', src) : (src as ImageMetadata & { fsPath?: string }).fsPath;
  if (!file) return Promise.resolve('');
  let vars = cache.get(file);
  if (!vars) {
    vars = sharp(file, { failOn: 'none' })
      .rotate()
      .resize(2, 2, { fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer()
      .then((px) => {
        const [tl, tr, bl, br] = [0, 1, 2, 3].map((i) => [px[i * 3], px[i * 3 + 1], px[i * 3 + 2]]);
        return `--g1:${lift(tl)};--g2:${lift(tr)};--g3:${lift(bl)};--g4:${lift(br)};--ph:linear-gradient(${hex(mix(tl, tr))},${hex(mix(bl, br))})`;
      })
      .catch(() => '');
    cache.set(file, vars);
  }
  return vars;
}
