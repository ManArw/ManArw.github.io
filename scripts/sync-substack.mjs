// Pulls Substack into the committed snapshots the site is built from:
//   src/data/substack-snapshot.json  (essays: RSS for content, archive API for ids/tags/audio)
//   src/data/notes-snapshot.json     (Substack Notes, from the Notes API)
//
// Run with `npm run sync`. The deploy workflow runs it every couple of hours
// and commits the snapshots when they change, so new posts and notes appear
// on the site without anyone editing files.
//
// Substack answers GitHub's servers with a Cloudflare bot challenge (HTTP 403),
// so every request goes through the site's Cloudflare Worker first (see
// worker/) and falls back to a direct request (fine from a home connection).
//
// Exit code is 1 only when the essay feed couldn't be read by any route, so a
// broken sync shows up as a failed workflow run instead of silently serving
// stale content. Notes and archive metadata are best-effort (unofficial APIs).
import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { parseFeed, parseArchive, parseNotesPage } from '../src/lib/substack-core.mjs';
import { API_BASE, SUBSTACK } from '../src/data/endpoints.mjs';

const CI = Boolean(process.env.GITHUB_ACTIONS);
const warn = (msg) => console.log(CI ? `::warning title=Substack sync::${msg}` : `warning: ${msg}`);
const fail = (msg) => console.log(CI ? `::error title=Substack sync::${msg}` : `error: ${msg}`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; manarw-site-sync; +https://manarw.github.io)' },
    signal: AbortSignal.timeout(20_000),
  });
  const body = await res.text();
  if (!res.ok) {
    const challenged = /Just a moment|cf-chl|challenge-platform/i.test(body);
    const err = new Error(`HTTP ${res.status}${challenged ? ' (Cloudflare bot challenge)' : ''}`);
    // Substack's APIs now and then rate-limit Cloudflare's shared IPs; a short wait clears it.
    err.retry = res.status === 429 || res.status >= 500;
    throw err;
  }
  return body;
}

async function get(what, relayPath, directUrl, parse) {
  // SUBSTACK_ROUTE=relay|direct tests one route on its own.
  const routes = [
    ['relay', API_BASE + relayPath],
    ['direct', directUrl],
  ].filter(([route]) => !process.env.SUBSTACK_ROUTE || route === process.env.SUBSTACK_ROUTE);
  const errors = [];
  for (const [route, url] of routes) {
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        return parse(await fetchText(url));
      } catch (err) {
        if (err.retry && attempt < 5) {
          await sleep(2000 * 2 ** (attempt - 1));
          continue;
        }
        errors.push(`${route}: ${err.message}`);
        break;
      }
    }
  }
  throw new Error(`${what} unavailable (${errors.join('; ')})`);
}

const dataFile = (name) => new URL(`../src/data/${name}`, import.meta.url);

async function readJson(name) {
  try {
    return JSON.parse(await readFile(dataFile(name), 'utf8'));
  } catch {
    return [];
  }
}

// Only rewrite a snapshot when its content changed, and report whether it did.
async function save(name, list) {
  const next = JSON.stringify(list, null, 2) + '\n';
  let prev = '';
  try {
    prev = await readFile(dataFile(name), 'utf8');
  } catch {}
  if (prev.replace(/\r\n/g, '\n') === next) return false;
  await writeFile(dataFile(name), next);
  return true;
}

const byDateDesc = (a, b) => b.date.localeCompare(a.date);

// Fixed key order keeps the committed JSON diffs readable.
const essayRecord = (e) => ({
  key: e.key,
  id: e.id ?? null,
  slug: e.slug,
  title: e.title,
  subtitle: e.subtitle,
  date: e.date,
  url: e.url,
  cover: e.cover ?? null,
  tags: e.tags ?? [],
  audio: e.audio ?? null,
  html: e.html,
});

async function syncEssays() {
  const live = await get('Essay feed', '/substack/feed', SUBSTACK.feed, parseFeed);
  if (!live.length) throw new Error('Essay feed parsed but had no posts');

  const bySlug = new Map((await readJson('substack-snapshot.json')).map((e) => [e.slug, e]));
  const isNew = live.some((e) => !bySlug.has(e.slug));

  // The archive API lists every post (the RSS feed only has the latest ~20),
  // with Substack's numeric post id, tags and voiceover audio. It's the
  // endpoint Substack rate-limits hardest, so only ask when there's a new
  // post to identify, plus one pass a day to catch tag edits and unpublished posts.
  let archive = null;
  if (isNew || new Date().getUTCHours() < 2 || process.env.SYNC_FULL) {
    try {
      archive = new Map();
      for (let offset = 0; offset < 1000; offset += 50) {
        const page = await get('Archive', `/substack/archive?offset=${offset}`, `${SUBSTACK.base}/api/v1/archive?sort=new&limit=50&offset=${offset}`, (b) => JSON.parse(b));
        for (const [slug, meta] of parseArchive(page, SUBSTACK.base)) archive.set(slug, meta);
        if (page.length < 50) break;
      }
    } catch (err) {
      archive = null;
      warn(`${err.message}. Keeping saved ids and tags.`);
    }
  }

  for (const e of live) bySlug.set(e.slug, { ...bySlug.get(e.slug), ...e });

  if (archive) {
    for (const e of bySlug.values()) Object.assign(e, archive.get(e.slug) ?? {});
    // The archive is the full list of published posts, so anything missing from
    // it was unpublished or renamed. Only trust that if it agrees with the feed.
    if (live.every((e) => archive.has(e.slug))) {
      for (const [slug, old] of [...bySlug]) {
        if (archive.has(slug)) continue;
        // Renamed on Substack: same post id under a new slug keeps its reactions.
        const renamed = old.id && [...bySlug.values()].find((e) => e !== old && e.id === old.id);
        if (renamed && old.key) renamed.key = old.key;
        console.log(renamed ? `${slug} was renamed to ${renamed.slug}.` : `Removing ${slug}: no longer in the Substack archive.`);
        bySlug.delete(slug);
      }
    }
  }

  // The reactions key is set once and never changes: Substack's post id when
  // we know it, otherwise the slug (if the archive API was unavailable when
  // the post first appeared).
  for (const e of bySlug.values()) e.key ??= e.id ? `substack-${e.id}` : `substack-${e.slug}`;

  const essays = [...bySlug.values()].map(essayRecord).sort(byDateDesc);
  const changed = await save('substack-snapshot.json', essays);
  console.log(`Essays: ${essays.length} saved, ${live.length} in the live feed${changed ? ', snapshot updated' : ', no change'}.`);
  return changed;
}

async function syncNotes() {
  const saved = await readJson('notes-snapshot.json');
  const known = new Set(saved.map((n) => n.id));
  const fresh = [];
  let cursor = null;
  for (let page = 0; page < 10; page++) {
    const q = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
    const direct = new URL(`https://substack.com/api/v1/reader/feed/profile/${SUBSTACK.userId}`);
    direct.searchParams.append('types[]', 'note');
    if (cursor) direct.searchParams.set('cursor', cursor);
    const { notes, next, empty } = await get('Notes', `/substack/notes${q}`, direct.href, (b) =>
      parseNotesPage(JSON.parse(b), SUBSTACK.userId, SUBSTACK.handle),
    );
    fresh.push(...notes);
    // Older notes are already saved once a page contains one we know.
    if (empty || !next || (known.size && notes.some((n) => known.has(n.id)))) break;
    cursor = next;
  }
  const map = new Map(saved.map((n) => [n.id, n]));
  for (const n of fresh) map.set(n.id, n);
  const notes = [...map.values()].sort(byDateDesc);
  const changed = await save('notes-snapshot.json', notes);
  console.log(`Notes: ${notes.length} saved (${fresh.length} fetched)${changed ? ', snapshot updated' : ', no change'}.`);
  return changed;
}

let changed = false;
let ok = true;
try {
  changed = (await syncEssays()) || changed;
} catch (err) {
  ok = false;
  fail(`${err.message}. The site keeps its last saved essays.`);
}
try {
  changed = (await syncNotes()) || changed;
} catch (err) {
  warn(`${err.message}. The site keeps its last saved notes.`);
}

if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
if (!ok) process.exitCode = 1;
