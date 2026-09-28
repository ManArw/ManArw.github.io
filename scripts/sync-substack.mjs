// Refreshes the committed Substack snapshots from the live feeds:
//   src/data/substack-snapshot.json  (essays, from RSS)
//   src/data/notes-snapshot.json     (Notes, from Substack's profile API)
// Run with `npm run sync`. Existing entries are kept, so posts that have
// dropped off the feeds stay on the site.
import { readFile, writeFile } from 'node:fs/promises';
import { parseFeed, fetchNotes } from '../src/lib/substack-core.mjs';

const FEED = 'https://manas1211.substack.com/feed';
const USER_ID = 497323139;
const HANDLE = 'manas1211';

async function merge(file, fresh, key) {
  const url = new URL(`../src/data/${file}`, import.meta.url);
  let old = [];
  try {
    old = JSON.parse(await readFile(url, 'utf8'));
  } catch {}
  const map = new Map(old.map((x) => [x[key], x]));
  for (const x of fresh) map.set(x[key], x);
  const merged = [...map.values()].sort((a, b) => b.date.localeCompare(a.date));
  await writeFile(url, JSON.stringify(merged, null, 2) + '\n');
  console.log(`${file}: ${merged.length} saved (${fresh.length} live).`);
}

const res = await fetch(FEED, { headers: { 'user-agent': 'manas-site-sync' } });
if (!res.ok) throw new Error(`Feed request failed: HTTP ${res.status}`);
await merge('substack-snapshot.json', parseFeed(await res.text()), 'slug');

try {
  await merge('notes-snapshot.json', await fetchNotes(USER_ID, HANDLE), 'id');
} catch (err) {
  console.warn(`Notes skipped: ${err.message}`);
}
