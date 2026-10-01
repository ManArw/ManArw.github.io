// Generates narration MP3s for every piece that has narration switched on and
// whose audio is missing or out of date. Free and offline after the first run:
// Kokoro-82M (open weights, Apache-2.0) runs on this machine's CPU.
//
//   npm run narrate                   generate whatever is missing or changed
//   npm run narrate -- --dry          just show what would happen
//   npm run narrate -- --force SLUG   regenerate one piece (or --force all)
//
// Output: public/audio/<slug>.<hash>.mp3 and src/data/audio-manifest.json.
// A piece is only regenerated when its fingerprint (its words + the voice
// settings in src/data/narration.mjs) changes. Synthesised paragraphs are also
// cached in narration/.cache, so editing one paragraph of a long travelogue only
// re-speaks that paragraph.
//
// If a piece fails, the others still finish, the site still builds (without a
// player on that piece), and the process exits with code 1 so CI reports it.
import { mkdir, readFile, writeFile, readdir, rm, rename, stat, appendFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { plan, root, manifestUrl } from './plan.mjs';
import { NARRATION } from '../src/data/narration.mjs';
import { narrationChunks } from '../src/lib/narration.mjs';

const CI = Boolean(process.env.GITHUB_ACTIONS);
const args = process.argv.slice(2);
const dry = args.includes('--dry');
const force = args.includes('--force') ? args[args.indexOf('--force') + 1] : null;
const say = (msg) => console.log(msg);
const fail = (title, msg) => console.log(CI ? `::error title=${title}::${msg}` : `✗ ${title}: ${msg}`);

const SR = 24000; // Kokoro's sample rate
const audioDir = new URL('public/audio/', root);
const cacheDir = new URL('.cache/', import.meta.url);
const chunkDir = new URL('chunks/', cacheDir);

const clock = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

// ---------- the model (loaded only if there's something to say) ----------

let ttsPromise;
async function model() {
  ttsPromise ??= (async () => {
    let kokoro, transformers;
    try {
      ({ KokoroTTS: kokoro } = await import('kokoro-js'));
      transformers = await import('@huggingface/transformers');
    } catch {
      throw new Error('The narration tools aren’t installed. Run: npm run narrate:setup');
    }
    // Keep the ~330 MB model in narration/.cache so it downloads once.
    transformers.env.cacheDir = fileURLToPath(new URL('models/', cacheDir));
    say(`Loading ${NARRATION.model} (${NARRATION.dtype})…`);
    return kokoro.from_pretrained(NARRATION.model, { dtype: NARRATION.dtype, device: 'cpu' });
  })();
  return ttsPromise;
}

// ---------- one chunk of speech, cached ----------

// Trim the model's own leading/trailing silence so pauses are ours and even.
function trim(samples) {
  const floor = 0.008;
  let a = 0;
  let b = samples.length - 1;
  while (a < b && Math.abs(samples[a]) < floor) a++;
  while (b > a && Math.abs(samples[b]) < floor) b--;
  return samples.subarray(Math.max(0, a - SR * 0.03), Math.min(samples.length, b + SR * 0.08));
}

function toPcm16(samples) {
  const out = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), i * 2);
  return out;
}

async function speak(text) {
  const { dtype, model: m, voice, engine } = NARRATION;
  const key = createHash('sha256').update(JSON.stringify({ engine, m, dtype, voice, text })).digest('hex');
  const file = new URL(`${key}.pcm`, chunkDir);
  if (existsSync(file)) return { pcm: await readFile(file), cached: true };
  const tts = await model();
  let audio;
  for (let attempt = 1; ; attempt++) {
    try {
      audio = await tts.generate(text, { voice });
      break;
    } catch (err) {
      if (attempt >= 2) throw new Error(`the model failed on “${text.slice(0, 60)}…”: ${err.message}`);
    }
  }
  if (audio.sampling_rate !== SR) throw new Error(`unexpected sample rate ${audio.sampling_rate}`);
  const pcm = toPcm16(trim(audio.audio));
  await mkdir(chunkDir, { recursive: true });
  await writeFile(file, pcm);
  return { pcm, cached: false };
}

// ---------- one piece → one MP3 ----------

async function ffmpegPath() {
  try {
    const p = (await import('ffmpeg-static')).default;
    if (p && existsSync(p)) return p;
  } catch {}
  return 'ffmpeg'; // fall back to one on PATH
}

async function render(piece) {
  const chunks = narrationChunks(piece.blocks);
  const out = fileURLToPath(new URL(piece.file.replace(/^\//, ''), new URL('public/', root)));
  const tmp = `${out}.part`;
  await mkdir(audioDir, { recursive: true });
  // Speak the first passage before starting the encoder, so a model that
  // can't load fails here, cleanly, with nothing half-written.
  const first = await speak(chunks[0].text);

  const ff = spawn(await ffmpegPath(), [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 's16le', '-ar', String(SR), '-ac', '1', '-i', 'pipe:0',
    '-af', `volume=${NARRATION.gainDb}dB,alimiter=limit=0.89:level=disabled`,
    '-c:a', 'libmp3lame', '-b:a', NARRATION.bitrate, '-ar', String(SR), '-ac', '1',
    '-id3v2_version', '3',
    '-metadata', `title=${piece.title}`,
    '-metadata', 'artist=Manas H Arawalli',
    '-metadata', `comment=Narrated by Kokoro-82M (${NARRATION.voice}), open-weights TTS`,
    '-f', 'mp3', tmp,
  ], { stdio: ['pipe', 'ignore', 'pipe'] });
  let ffErr = '';
  ff.stderr.on('data', (d) => (ffErr += d));
  const done = new Promise((resolve, reject) => {
    ff.on('error', reject);
    ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${ffErr.trim()}`))));
  });
  done.catch(() => {}); // handled below; never let it crash the run
  const write = (buf) => (ff.stdin.write(buf) ? Promise.resolve() : new Promise((r) => ff.stdin.once('drain', r)));

  let samples = 0;
  let spoken = 0;
  const started = performance.now();
  try {
    for (let i = 0; i < chunks.length; i++) {
      const { pcm, cached } = i === 0 ? first : await speak(chunks[i].text);
      if (!cached) spoken++;
      const silence = Buffer.alloc(Math.round(chunks[i].pause * SR) * 2);
      await write(pcm);
      await write(silence);
      samples += pcm.length / 2 + silence.length / 2;
      if ((i + 1) % 10 === 0 || i === chunks.length - 1) {
        say(`  ${piece.slug}: ${i + 1}/${chunks.length} passages, ${clock(samples / SR)} of audio`);
      }
    }
    ff.stdin.end();
    await done;
  } catch (err) {
    ff.stdin.destroy();
    ff.kill();
    await done.catch(() => {}); // let ffmpeg exit before cleaning up
    await rm(tmp, { force: true });
    throw err;
  }
  await rename(tmp, out);
  const { size } = await stat(out);
  const secs = (performance.now() - started) / 1000;
  say(`  ${piece.slug}: done, ${clock(samples / SR)} long, ${(size / 1e6).toFixed(1)} MB, ${spoken} new passages in ${clock(secs)}`);
  return { duration: Math.round((samples / SR) * 10) / 10, bytes: size };
}

// ---------- run ----------

const { pieces, manifest, problems } = await plan();
for (const msg of problems) console.log(CI ? `::warning title=Narration::${msg}` : `warning: ${msg}`);
const todo = pieces.filter((p) => !p.current || force === 'all' || force === p.slug);

if (!todo.length) say(pieces.length ? 'All narration is up to date.' : 'No pieces have narration switched on.');
for (const p of todo) say(`${dry ? 'Would narrate' : 'Narrating'} ${p.slug} (${p.hash}), ${narrationChunks(p.blocks).length} passages`);

const failed = [];
const next = {};
if (!dry) {
  for (const p of pieces) if (p.current && !todo.includes(p)) next[p.key] = manifest[p.key];
  for (const p of todo) {
    try {
      const { duration, bytes } = await render(p);
      next[p.key] = {
        slug: p.slug,
        hash: p.hash,
        file: p.file,
        duration,
        bytes,
        voice: NARRATION.voice,
        generated: new Date().toISOString().slice(0, 10),
      };
    } catch (err) {
      failed.push(p.slug);
      fail(`Narration failed: ${p.slug}`, `${err.message.replace(/\.+$/, '')}. The piece still publishes, without a player.`);
      // Keep the old entry: the site only uses it if it still matches the text.
      if (manifest[p.key]) next[p.key] = manifest[p.key];
    }
  }

  // Sort for stable diffs, then drop audio files nothing points at any more
  // (older versions, and pieces whose narration was switched off).
  const sorted = Object.fromEntries(Object.entries(next).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(manifestUrl, JSON.stringify(sorted, null, 2) + '\n');
  const keep = new Set(Object.values(sorted).map((e) => e.file.split('/').pop()));
  if (existsSync(audioDir)) {
    for (const name of await readdir(audioDir)) {
      if (name.endsWith('.mp3') && !keep.has(name)) {
        await rm(new URL(name, audioDir));
        say(`Removed old audio ${name}`);
      }
    }
  }
}

if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `generated=${!dry && todo.length > failed.length}\n`);
if (failed.length) {
  say(`\nNarration failed for:\n${failed.map((s) => `  ${s}`).join('\n')}`);
  process.exitCode = 1;
}
