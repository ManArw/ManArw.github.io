// Larger copies of a photo for the full-screen viewer (src/lib/lightbox.ts).
// They're only built here; a reader's browser fetches one only when they open
// the photo. Without JavaScript the link simply opens the large image.
import { getImage } from 'astro:assets';
import type { ImageMetadata } from 'astro';

export async function zoomable(src: ImageMetadata) {
  const max = Math.min(src.width, 2400);
  const widths = [1280, 2000].filter((w) => w < max).concat(max);
  const img = await getImage({ src, width: max, widths, format: 'webp' });
  return { href: img.src, srcset: img.srcSet.attribute };
}

/** Responsive widths no larger than the original (Astro won't upscale). */
export const fit = (src: ImageMetadata, widths: number[]) => {
  const ok = widths.filter((w) => w < src.width);
  return ok.length ? [...ok, Math.min(src.width, widths.at(-1)!)].filter((w, i, a) => a.indexOf(w) === i) : [src.width];
};
