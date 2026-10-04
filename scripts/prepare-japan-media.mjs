// Turns the original phone photos and clips from the Japan trip into the
// files the travelogue uses (src/content/blog/japan-ten-days.mdx).
//
//   node scripts/prepare-japan-media.mjs "D:/Downloads/blog photos"
//
// Photos → src/assets/japan/*.jpg: upright, at most 2000–2400px on the long
// edge, and with EXIF stripped (phones record GPS). Astro then makes the
// responsive WebP sizes at build time, like every other photo on the site.
//
// Clips → public/media/japan/: H.264 MP4 (plays in every browser) in two
// sizes, a phone one and a larger one, silent, with no metadata (the
// originals carry GPS), plus a small WebP poster. The page only downloads a
// clip when it scrolls into view (src/components/Video.astro).
//
// Encoding needs ffmpeg: the copy in narration/node_modules (after
// `npm run narrate:setup`) or one on your PATH. Re-running overwrites.
import { mkdir, rm } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import sharp from 'sharp';

const src = process.argv[2];
if (!src || !existsSync(src)) {
  console.error('Usage: node scripts/prepare-japan-media.mjs <folder with the original photos and clips>');
  process.exit(1);
}

// original file → [asset name, longest edge in px]
const PHOTOS = {
  '20251101_053358.jpg': ['wing-dawn', 2000], // already small (719px); kept as is
  '20251102_114808.jpg': ['four-on-a-bench', 2000],
  '20251102_122006.jpg': ['moat-turret', 1600],
  '20251103_100150.jpg': ['kawaguchiko-morning', 2000],
  '20251103_153321.jpg': ['fuji-torii', 2400],
  '20251105_121854.jpg': ['stacked-stones', 2000],
  '20251106_114039.jpg': ['inari-gates', 2000],
  '20251106_122814.jpg': ['inari-lake', 2000],
  '20251106_122633.jpg': ['inari-selfie', 1600],
  '20251107_082030.jpg': ['kiyomizu-dragon', 1800],
  '20251107_085418.jpg': ['kiyomizu-hall', 2000],
  '20251107_090947.jpg': ['kiyomizu-lanterns', 1600],
  '20251107_104549.jpg': ['kyoto-four', 2000],
  '20251108_172537.jpg': ['odaiba-night', 2400],
};

// original file → clip settings. `from`/`to` trim (seconds); `fade` fades in
// from and out to black so a loop reads as a cut, not a jump.
const CLIPS = {
  '20251101_163950.mp4': { name: 'bus-window', from: 0.4, to: 14.4, fade: 0.6, poster: 1.2 },
  '20251105_140320.mp4': { name: 'arashiyama-garden', from: 3.4, to: 10.6, fade: 0.6, poster: 0.8 },
};
// The existing Fuji clip is HEVC, which some browsers can't play. The
// travelogue uses H.264 copies; the original stays for the home page.
// Waving grass compresses badly, so this one is smaller and squeezed harder.
const EXISTING = {
  'public/media/fuji-first-glimpse.mp4': { name: 'fuji-first-glimpse', poster: 0, sizes: [['', 960, 31], ['-sm', 640, 31]] },
};

const photoDir = 'src/assets/japan';
const clipDir = 'public/media/japan';
await mkdir(photoDir, { recursive: true });
await mkdir(clipDir, { recursive: true });

for (const [file, [name, edge]] of Object.entries(PHOTOS)) {
  const out = join(photoDir, `${name}.jpg`);
  // failOn 'none': one original has a few corrupt bytes that viewers ignore.
  const info = await sharp(join(src, file), { failOn: 'none' })
    .rotate()
    .resize(edge, edge, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 84, mozjpeg: true })
    .toFile(out);
  console.log(`${out}  ${info.width}×${info.height}  ${(info.size / 1024).toFixed(0)} KB`);
}

const ffmpeg = ['narration/node_modules/ffmpeg-static/ffmpeg.exe', 'narration/node_modules/ffmpeg-static/ffmpeg'].find(existsSync) ?? 'ffmpeg';
const run = (args) => {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${args.join(' ')}`);
};
const kb = (f) => `${(statSync(f).size / 1024).toFixed(0)} KB`;

async function encode(input, { name, from, to, fade, poster, sizes = [['', 1280, 26], ['-sm', 720, 27]] }) {
  const trim = from != null ? ['-ss', String(from), '-to', String(to)] : [];
  const length = from != null ? to - from : null;
  const fades = fade && length ? `,fade=t=in:st=0:d=${fade},fade=t=out:st=${(length - fade).toFixed(2)}:d=${fade}` : '';
  for (const [suffix, width, crf] of sizes) {
    const out = join(clipDir, `${name}${suffix}.mp4`);
    run([
      ...trim, '-i', input,
      '-vf', `scale='min(${width},iw)':-2:flags=lanczos,fps=30${fades}`,
      '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-profile:v', 'high', '-pix_fmt', 'yuv420p',
      '-an', '-map_metadata', '-1', '-movflags', '+faststart',
      out,
    ]);
    console.log(`${out}  ${kb(out)}`);
  }
  const still = join(clipDir, `${name}.poster.png`);
  run(['-ss', String((from ?? 0) + poster), '-i', input, '-frames:v', '1', '-vf', `scale='min(1280,iw)':-2`, still]);
  const out = join(clipDir, `${name}.webp`);
  await sharp(still).webp({ quality: 72 }).toFile(out);
  await rm(still);
  console.log(`${out}  ${kb(out)}`);
}

for (const [file, opts] of Object.entries(CLIPS)) await encode(join(src, file), opts);
for (const [file, opts] of Object.entries(EXISTING)) await encode(file, opts);
