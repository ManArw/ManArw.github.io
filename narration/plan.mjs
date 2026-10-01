// Works out which pieces should be narrated and whether their audio is
// current, without loading the voice model. Used by narrate.mjs, and run on
// its own by the deploy workflow to decide whether the narration job is needed:
//   node narration/plan.mjs
import { readFile, readdir, appendFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseFrontmatter } from '@astrojs/internal-helpers/frontmatter';
import { NARRATED_ESSAYS } from '../src/data/narration.mjs';
import { essayBlocks, postBlocks, narrationHash, narrationFile } from '../src/lib/narration.mjs';

export const root = new URL('../', import.meta.url);
export const manifestUrl = new URL('src/data/audio-manifest.json', root);

export async function readManifest() {
  try {
    return JSON.parse(await readFile(manifestUrl, 'utf8'));
  } catch {
    return {};
  }
}

// Same id rule as Astro's glob loader for simple file names.
const fileId = (name) => name.replace(/\.(md|mdx)$/, '').toLowerCase().replace(/\s+/g, '-');

export async function plan() {
  const manifest = await readManifest();
  const pieces = [];
  const problems = [];

  const essays = JSON.parse(await readFile(new URL('src/data/substack-snapshot.json', root), 'utf8'));
  for (const slug of NARRATED_ESSAYS) {
    const e = essays.find((x) => x.slug === slug);
    if (!e) {
      problems.push(`"${slug}" is in NARRATED_ESSAYS but isn't a synced Substack essay (check the slug).`);
      continue;
    }
    const blocks = essayBlocks({ title: e.title, subtitle: e.subtitle, html: e.html });
    pieces.push({ key: e.key ?? `substack-${e.id ?? e.slug}`, slug, title: e.title, blocks });
  }

  const dir = new URL('src/content/blog/', root);
  for (const name of await readdir(dir)) {
    if (!/\.mdx?$/.test(name)) continue;
    const { frontmatter: fm, content } = parseFrontmatter(await readFile(new URL(name, dir), 'utf8'));
    if (fm.audio !== true || fm.draft === true) continue;
    const id = fm.id ?? fileId(name);
    const blocks = postBlocks({ title: String(fm.title), summary: fm.summary, body: content });
    pieces.push({ key: `blog-${id}`, slug: id, title: String(fm.title), blocks });
  }

  for (const p of pieces) {
    p.hash = narrationHash(p.blocks);
    p.file = narrationFile(p.slug, p.hash);
    // Current = made from exactly this text and voice, and the file is really there.
    p.current = manifest[p.key]?.hash === p.hash && existsSync(new URL(`public${p.file}`, root));
  }
  return { pieces, manifest, problems };
}

// Run directly: print the plan and tell the workflow whether to narrate.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { pieces, problems } = await plan();
  const todo = pieces.filter((p) => !p.current);
  for (const p of pieces) console.log(`${p.current ? 'up to date' : 'needs audio'}  ${p.slug}  (${p.hash})`);
  if (!pieces.length) console.log('No pieces have narration switched on.');
  for (const msg of problems) console.log(process.env.GITHUB_ACTIONS ? `::warning title=Narration::${msg}` : `warning: ${msg}`);
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `narrate=${todo.length > 0}\n`);
}
