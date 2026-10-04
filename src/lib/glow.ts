// The colour of the light a photo or clip casts on the dark page around it
// (see .glow in src/styles/media.css). Each picture gives four colours, one
// per quarter, so the glow above a sunset is warm and the glow beside a blue
// lake is blue. Used at build time for photos (src/lib/tone.ts) and live in
// the browser while a clip plays (src/components/Video.astro).

/** An average colour from the picture → a richer, lighter one that still
 *  shows up as a soft glow on the night-blue page. */
export function lift([r, g, b]: number[]) {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  const sat = Math.min(1, s * 1.3 + 0.06);
  const light = Math.min(0.62, Math.max(0.32, l * 1.15));
  return `hsl(${Math.round(h)} ${Math.round(sat * 100)}% ${Math.round(light * 100)}%)`;
}
