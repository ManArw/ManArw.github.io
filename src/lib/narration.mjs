// What the narrator reads, and its fingerprint. Shared by the site build
// (src/lib/content.ts) and narration/narrate.mjs, so both always agree on
// whether a piece's audio file is current.
//
// A narration script is a list of blocks: the title, the subtitle, then the
// body's headings and paragraphs. Never read: figures, captions, photos, video,
// code, footnote markers, or anything outside the article body.
import { createHash } from 'node:crypto';
import { NARRATION } from '../data/narration.mjs';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
const decode = (s) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);

function clean(text) {
  return decode(text)
    .replace(/\s+·\s+/g, '. ') // "Day 1 · Touchdown in Tokyo" → a spoken beat
    .replace(/\s+/g, ' ')
    .trim();
}

// Titles and headings get a full stop so the voice lands them.
const landed = (text) => (/[.!?…:]["'”’)]*$/.test(text) ? text : `${text}.`);
const speakable = (text) => /[\p{L}\p{N}]/u.test(text);

function tidy(blocks) {
  const out = [];
  for (const b of blocks) {
    if (b.kind === 'break' && (!out.length || out.at(-1).kind === 'break')) continue;
    out.push(b);
  }
  while (out.at(-1)?.kind === 'break') out.pop();
  return out;
}

function opening(title, subtitle) {
  const blocks = [{ kind: 'title', text: landed(clean(title)) }];
  if (subtitle && speakable(subtitle)) blocks.push({ kind: 'para', text: clean(subtitle) });
  return blocks;
}

/** Substack essay (cleaned feed HTML) → narration blocks. */
export function essayBlocks({ title, subtitle, html }) {
  const blocks = opening(title, subtitle);
  const body = html
    .replace(/<figure[\s\S]*?<\/figure>/gi, ' ')
    .replace(/<pre[\s\S]*?<\/pre>/gi, ' ')
    .replace(/<sup[\s\S]*?<\/sup>/gi, '');
  for (const m of body.matchAll(/<(h[2-4]|p|li)\b[^>]*>([\s\S]*?)<\/\1>|<hr\s*\/?>/gi)) {
    if (!m[1]) {
      blocks.push({ kind: 'break' });
      continue;
    }
    const text = clean(m[2].replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ''));
    if (!speakable(text)) continue;
    const heading = m[1].toLowerCase().startsWith('h');
    blocks.push({ kind: heading ? 'heading' : 'para', text: heading ? landed(text) : text });
  }
  return tidy(blocks);
}

function inline(md) {
  return clean(
    md
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/<[^>]+>/g, ' ')
      .replace(/(\*\*|__|\*|_|`|~~)(?=\S)([\s\S]*?\S)\1/g, '$2'),
  );
}

/** Markdown/MDX blog post → narration blocks. `body` is the file without its front matter. */
export function postBlocks({ title, summary, body }) {
  const blocks = opening(title, summary);
  const md = body
    .replace(/\r\n?/g, '\n')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^(import|export)\s.*$/gm, '')
    .replace(/```[\s\S]*?```/g, '')
    // MDX components (<Figure …/>, <Video …/>) are photos and clips, not text.
    .replace(/<([A-Z][\w.]*)\b[\s\S]*?(?:\/>|<\/\1>)/g, '');
  for (const raw of md.split(/\n\s*\n/)) {
    const part = raw.trim();
    if (!part) continue;
    if (/^([-*_])\1{2,}$/.test(part)) {
      blocks.push({ kind: 'break' });
      continue;
    }
    const heading = part.match(/^#{1,6}\s+([\s\S]*)$/);
    if (heading) {
      const text = inline(heading[1]);
      if (speakable(text)) blocks.push({ kind: 'heading', text: landed(text) });
      continue;
    }
    const lines = part.split('\n').map((l) => l.replace(/^\s*>\s?/, ''));
    // A list reads as one block per item.
    if (lines.every((l) => /^\s*([-*+]|\d+[.)])\s+/.test(l) || !l.trim())) {
      for (const l of lines) {
        const text = inline(l.replace(/^\s*([-*+]|\d+[.)])\s+/, ''));
        if (speakable(text)) blocks.push({ kind: 'para', text });
      }
      continue;
    }
    const text = inline(lines.join(' '));
    if (speakable(text)) blocks.push({ kind: 'para', text });
  }
  return tidy(blocks);
}

/** Fingerprint of a narration: the words plus every voice/render setting. */
export function narrationHash(blocks) {
  return createHash('sha256').update(JSON.stringify({ NARRATION, blocks })).digest('hex').slice(0, 12);
}

/** Audio file path for a piece, in public/ and on the site. */
export const narrationFile = (slug, hash) => `/audio/${slug}.${hash}.mp3`;

// ---------- synthesis chunks ----------

function sentences(text) {
  return text.match(/[^.!?…]+(?:[.!?…]+["'”’)\]]*|$)\s*/g)?.map((s) => s.trim()).filter(Boolean) ?? [text];
}

// Never split mid-sentence unless a single sentence is longer than the model takes.
function pack(parts, max) {
  const out = [];
  let cur = '';
  for (const p of parts) {
    if (p.length > max) {
      if (cur) out.push(cur);
      cur = '';
      const smaller = p.includes(', ') || p.includes('; ') || p.includes(' — ')
        ? p.split(/(?<=[,;—])\s+/)
        : p.split(' ');
      out.push(...pack(smaller, max));
      continue;
    }
    if (cur && cur.length + 1 + p.length > max) {
      out.push(cur);
      cur = p;
    } else cur = cur ? `${cur} ${p}` : p;
  }
  if (cur) out.push(cur);
  return out;
}

/** Blocks → ordered pieces of text for the model, each with the silence that follows it. */
export function narrationChunks(blocks) {
  const { pauses, maxChars } = NARRATION;
  const chunks = [];
  for (const b of blocks) {
    if (b.kind === 'break') {
      if (chunks.length) chunks.at(-1).pause = Math.max(chunks.at(-1).pause, pauses.break);
      continue;
    }
    if (b.kind === 'heading' && chunks.length) chunks.at(-1).pause = Math.max(chunks.at(-1).pause, pauses.beforeHeading);
    const groups = pack(sentences(b.text), maxChars);
    groups.forEach((text, i) => {
      const last = i === groups.length - 1;
      chunks.push({ text, pause: last ? pauses[b.kind] : pauses.sentence });
    });
  }
  return chunks;
}
