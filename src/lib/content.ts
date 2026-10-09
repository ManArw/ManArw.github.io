// The one content model. Every page, the RSS feed, the search index, the
// sitemap, link previews and reactions read pieces from here, so a new essay
// (synced from Substack) or a new Markdown post shows up everywhere at once.
//
//   essay  Finished writing from Substack → /articles/<slug>
//          (src/data/substack-snapshot.json, refreshed by `npm run sync`)
//   post   Notebook entries written here   → /blog/<slug>
//          (src/content/blog/*.md|mdx)
//   notes  Substack Notes                  → /fragments (getNotes below)
import { existsSync } from 'node:fs';
import { getCollection, type CollectionEntry } from 'astro:content';
import type { ImageMetadata } from 'astro';
import essaysSnapshot from '../data/substack-snapshot.json';
import notesSnapshot from '../data/notes-snapshot.json';
import audioManifest from '../data/audio-manifest.json';
import { site } from '../data/site';
import { NARRATED_ESSAYS } from '../data/narration.mjs';
import { essayBlocks, postBlocks, narrationHash } from './narration.mjs';

export type Kind = 'essay' | 'post';

/** Generated narration (see docs/AUDIO.md and narration/). */
export type Audio = { src: string; duration: number; bytes: number };

export type Piece = {
  /** Stable across URL changes. Reactions are stored against it. */
  id: string;
  kind: Kind;
  slug: string;
  /** Path on this site, e.g. /articles/the-evidence */
  href: string;
  /** Absolute canonical URL on this site. */
  url: string;
  title: string;
  /** The author's own subtitle/summary, if there is one. */
  subtitle?: string;
  /** Subtitle, or the opening lines when there isn't one. */
  excerpt: string;
  date: Date;
  tags: string[];
  words: number;
  minutes: number;
  /** Plain text of the body (search, related writing). */
  text: string;
  /** Original on Substack, for essays. */
  sourceUrl?: string;
  /** Remote cover (Substack) or local image (blog front matter). */
  cover?: string | ImageMetadata;
  coverAlt?: string;
  /** Narration file, when one exists and matches the current text. */
  audio: Audio | null;
  /** off: narration not switched on · ready: has audio · missing: switched on, but no current file. */
  narration: 'off' | 'ready' | 'missing';
  /** Essays: cleaned HTML from the feed. */
  html?: string;
  /** Posts: the collection entry, for render(). */
  entry?: CollectionEntry<'blog'>;
};

export type Note = {
  id: string;
  date: string;
  body: string;
  url: string;
  image: string | null;
  likes: number;
  /** A line restacked from someone else's post. */
  quote?: { text: string; title: string | null; author: string | null; url: string | null };
  /** Someone else's note, restacked with a comment of his own (`body`). */
  restack?: { author: string | null; body: string; image: string | null; url: string | null };
};

/** A note that stands on its own: his own words, with nothing quoted. */
export const ownNote = (n: Note) => Boolean(n.body) && !n.quote && !n.restack;

/** All of a note's text, his and quoted, for search. */
export const noteText = (n: Note) =>
  [n.body, n.quote && `“${n.quote.text}” ${n.quote.author ?? ''}`, n.restack && `${n.restack.author ?? ''}: ${n.restack.body}`]
    .filter(Boolean)
    .join(' ');

type EssayRecord = {
  /** Reactions key, assigned once by the sync and never changed. */
  key?: string;
  id: string | null;
  slug: string;
  title: string;
  subtitle: string;
  date: string;
  url: string;
  cover: string | null;
  tags: string[];
  html: string;
};

const WPM = 230;
const readingTime = (words: number) => Math.max(1, Math.round(words / WPM));
const countWords = (text: string) => text.split(/\s+/).filter(Boolean).length;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
const decode = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);

export function htmlToText(html: string) {
  return decode(
    html
      .replace(/<(br|\/p|\/h[1-6]|\/li|\/blockquote|\/figcaption)[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

// Markdown/MDX source → readable text (drops imports, components and syntax).
function markdownToText(md: string) {
  return md
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/^(import|export) .*$/gm, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/^-{3,}$/gm, ' ')
    .replace(/[*_`~]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

function excerptOf(text: string, max = 180) {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  return flat.slice(0, flat.lastIndexOf(' ', max)).replace(/[,;:.\s]+$/, '') + '…';
}

const absolute = (path: string) => new URL(path, site.url).href;

type ManifestEntry = { hash: string; file: string; duration: number; bytes: number };
const manifest = audioManifest as Record<string, ManifestEntry>;

// The audio file is only used if it was made from exactly this text and
// voice. Anything else (switched on but not generated yet, generation failed,
// or the piece changed since) publishes the piece without a player and says so
// in the build log.
function narrationFor(key: string, slug: string, enabled: boolean, blocks: () => unknown[]) {
  if (!enabled) return { audio: null, narration: 'off' as const };
  const hash = narrationHash(blocks());
  const entry = manifest[key];
  if (entry?.hash === hash && existsSync(`public${entry.file}`)) {
    return { audio: { src: entry.file, duration: entry.duration, bytes: entry.bytes }, narration: 'ready' as const };
  }
  const why = !entry
    ? 'no audio has been generated yet'
    : entry.hash !== hash
      ? 'the piece changed since its audio was made'
      : `its file ${entry.file} is missing`;
  const msg = `Narration missing for ${slug}: ${why}. It publishes without a player; run \`npm run narrate\` or let the workflow do it.`;
  console.warn(process.env.GITHUB_ACTIONS ? `::warning title=Narration::${msg}` : `[narration] ${msg}`);
  return { audio: null, narration: 'missing' as const };
}

function essayPiece(e: EssayRecord): Piece {
  const text = htmlToText(e.html);
  const words = countWords(text);
  const href = `/articles/${e.slug}`;
  // Set once by the sync (Substack's post id when known) and carried over if
  // the post is renamed, so reactions and narration stay attached.
  const id = e.key ?? (e.id ? `substack-${e.id}` : `substack-${e.slug}`);
  return {
    id,
    kind: 'essay',
    slug: e.slug,
    href,
    url: absolute(href),
    title: e.title,
    subtitle: e.subtitle || undefined,
    excerpt: e.subtitle || excerptOf(text),
    date: new Date(e.date),
    tags: e.tags ?? [],
    words,
    minutes: readingTime(words),
    text,
    sourceUrl: e.url,
    cover: e.cover ?? undefined,
    ...narrationFor(id, e.slug, NARRATED_ESSAYS.includes(e.slug), () =>
      essayBlocks({ title: e.title, subtitle: e.subtitle, html: e.html }),
    ),
    html: e.html,
  };
}

function postPiece(entry: CollectionEntry<'blog'>): Piece {
  const text = markdownToText(entry.body ?? '');
  const words = countWords(text);
  const href = `/blog/${entry.id}`;
  const id = `blog-${entry.data.id ?? entry.id}`;
  return {
    id,
    kind: 'post',
    slug: entry.id,
    href,
    url: absolute(href),
    title: entry.data.title,
    subtitle: entry.data.summary,
    excerpt: entry.data.summary || excerptOf(text),
    date: entry.data.date,
    tags: entry.data.tags,
    words,
    minutes: readingTime(words),
    text,
    cover: entry.data.cover,
    coverAlt: entry.data.coverAlt,
    ...narrationFor(id, entry.data.id ?? entry.id, entry.data.audio, () =>
      postBlocks({ title: entry.data.title, summary: entry.data.summary, body: entry.body ?? '' }),
    ),
    entry,
  };
}

let all: Promise<Piece[]> | undefined;

/** Every published piece, newest first. */
export function getPieces(): Promise<Piece[]> {
  all ??= (async () => {
    const posts = await getCollection('blog', ({ data }) => import.meta.env.DEV || !data.draft);
    return [...(essaysSnapshot as EssayRecord[]).map(essayPiece), ...posts.map(postPiece)].sort(
      (a, b) => b.date.getTime() - a.date.getTime(),
    );
  })();
  return all;
}

export const getEssays = async () => (await getPieces()).filter((p) => p.kind === 'essay');
export const getPosts = async () => (await getPieces()).filter((p) => p.kind === 'post');

export function getNotes(): Note[] {
  return [...(notesSnapshot as Note[])].sort((a, b) => b.date.localeCompare(a.date));
}

export const kindLabel = (kind: Kind) => (kind === 'essay' ? 'Essay' : 'Blog');

/** Older and newer neighbours within the same kind. */
export async function neighbours(piece: Piece) {
  const list = (await getPieces()).filter((p) => p.kind === piece.kind);
  const i = list.findIndex((p) => p.id === piece.id);
  return { newer: list[i - 1], older: list[i + 1] };
}

// ---------- related writing ----------
// Shared tags first, then shared vocabulary (TF-IDF cosine over title, tags,
// excerpt and body). Cheap at this size, and it finds the essays that are
// actually about the same thing without anyone tagging them.

const STOP = new Set(
  'a about above after again against all also am an and any are as at be because been before being below between both but by can could did do does doing down during each even ever every few for from further get got had has have having he her here hers herself him himself his how i if in into is it its itself just know like me more most much my myself no nor not now of off on once one only or other our ours ourselves out over own really same she should so some such than that the their theirs them themselves then there these they thing things think this those through to too under until up us very was way we were what when where which while who whom why will with would you your yours yourself yourselves still maybe something someone everyone anyone never always back made make makes many may might must need never often perhaps rather said say says see seem seemed since sometimes take thought though time times want went well yet'.split(
    ' ',
  ),
);

function terms(piece: Piece) {
  const weighted = [
    `${piece.title} `.repeat(3),
    `${piece.tags.join(' ')} `.repeat(3),
    `${piece.excerpt} `.repeat(2),
    piece.text,
  ].join(' ');
  const tf = new Map<string, number>();
  for (const raw of weighted.toLowerCase().match(/[a-z][a-z'’]+/g) ?? []) {
    const w = raw.replace(/['’]s?$/, '').replace(/(ing|ed|ly|es|s)$/, '');
    if (w.length < 3 || STOP.has(raw) || STOP.has(w)) continue;
    tf.set(w, (tf.get(w) ?? 0) + 1);
  }
  return tf;
}

let vectors: Promise<Map<string, Map<string, number>>> | undefined;
function getVectors() {
  vectors ??= (async () => {
    const pieces = await getPieces();
    const tfs = new Map(pieces.map((p) => [p.id, terms(p)]));
    const df = new Map<string, number>();
    for (const tf of tfs.values()) for (const w of tf.keys()) df.set(w, (df.get(w) ?? 0) + 1);
    const n = pieces.length;
    const out = new Map<string, Map<string, number>>();
    for (const [id, tf] of tfs) {
      const v = new Map<string, number>();
      let norm = 0;
      for (const [w, f] of tf) {
        const x = (1 + Math.log(f)) * Math.log((n + 1) / (df.get(w)! + 0.5));
        if (x > 0) {
          v.set(w, x);
          norm += x * x;
        }
      }
      norm = Math.sqrt(norm) || 1;
      for (const [w, x] of v) v.set(w, x / norm);
      out.set(id, v);
    }
    return out;
  })();
  return vectors;
}

/** Up to `n` pieces most like this one; topped up with recent writing if too few are related. */
export async function related(piece: Piece, n = 3): Promise<Piece[]> {
  const pieces = await getPieces();
  const vecs = await getVectors();
  const mine = vecs.get(piece.id)!;
  const scored = pieces
    .filter((p) => p.id !== piece.id)
    .map((p) => {
      let score = 0;
      for (const [w, x] of vecs.get(p.id)!) score += x * (mine.get(w) ?? 0);
      score += 0.15 * p.tags.filter((t) => piece.tags.includes(t)).length;
      return { p, score };
    })
    .sort((a, b) => b.score - a.score);
  const picks = scored.filter((s) => s.score > 0.06).slice(0, n).map((s) => s.p);
  for (const p of pieces) {
    if (picks.length >= n) break;
    if (p.id !== piece.id && !picks.includes(p) && p.kind === piece.kind) picks.push(p);
  }
  return picks;
}
