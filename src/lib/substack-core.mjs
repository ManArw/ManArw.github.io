// Turns Substack's feeds into plain records for src/data/*-snapshot.json.
// Plain .mjs so scripts/sync-substack.mjs can run it under Node without a build.
//
// Sources (all public, no keys):
//   RSS feed      /feed                   → title, subtitle, date, cover, full HTML
//   Archive API   /api/v1/archive         → stable post id, tags
//   Notes API     /api/v1/reader/feed/... → Substack Notes (not in RSS at all)
// The two APIs are unofficial, so everything built on them is optional.
import { XMLParser } from 'fast-xml-parser';
import sanitizeHtml from 'sanitize-html';

// Substack embeds UI chrome (subscribe buttons, image toolbars) in post HTML.
const DROP_CLASSES = ['button-wrapper', 'image-link-expand', 'subscription-widget-wrap', 'subscribe-widget', 'share'];

function hasDropClass(attribs) {
  const cls = attribs?.class ?? '';
  return DROP_CLASSES.some((c) => cls.split(/\s+/).includes(c));
}

export function cleanHtml(html) {
  const out = sanitizeHtml(html, {
    allowedTags: [
      'p', 'br', 'em', 'strong', 'i', 'b', 'u', 's', 'h2', 'h3', 'h4', 'blockquote',
      'ul', 'ol', 'li', 'a', 'figure', 'figcaption', 'img', 'hr', 'pre', 'code', 'sup', 'sub',
    ],
    allowedAttributes: {
      a: ['href', 'rel', 'target'],
      img: ['src', 'alt', 'width', 'height', 'loading', 'decoding'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    exclusiveFilter: (frame) => hasDropClass(frame.attribs) || ['button', 'svg'].includes(frame.tag),
    transformTags: {
      // The link Substack puts around every image (it just opens the full-size
      // file) loses its href here and is unwrapped below. Renaming it to a
      // disallowed tag instead desyncs sanitize-html's tag stack, so later
      // closing tags come out wrong (</strong> turned into </span>).
      a: (tagName, attribs) => {
        if ((attribs.class ?? '').includes('image-link')) return { tagName, attribs: {} };
        const external = /^https?:/.test(attribs.href ?? '');
        return {
          tagName,
          attribs: external ? { ...attribs, rel: 'noopener', target: '_blank' } : attribs,
        };
      },
      img: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, alt: attribs.alt ?? '', loading: 'lazy', decoding: 'async' },
      }),
    },
  });
  return (
    out
      // Unwrap the href-less image links (every real link keeps its href).
      .replace(/<a>([\s\S]*?)<\/a>/g, '$1')
      // Substack uses empty paragraphs as spacers.
      .replace(/<p>\s*<\/p>/g, '')
      .trim()
  );
}

function text(v) {
  if (v == null) return '';
  if (typeof v === 'object') return String(v['#text'] ?? '');
  return String(v);
}

function slugFromLink(link) {
  try {
    const parts = new URL(link).pathname.split('/').filter(Boolean);
    return parts[parts.length - 1];
  } catch {
    return '';
  }
}

function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/** RSS → essays. Throws if the document isn't a usable feed (e.g. a bot-challenge page). */
export function parseFeed(xml) {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', cdataPropName: false });
  const doc = parser.parse(xml);
  if (!doc?.rss?.channel) throw new Error('response is not an RSS feed');
  let items = doc.rss.channel.item ?? [];
  if (!Array.isArray(items)) items = [items];

  return items
    .map((it) => {
      const url = text(it.link);
      return {
        slug: slugFromLink(url),
        title: decodeEntities(text(it.title).trim()),
        subtitle: decodeEntities(text(it.description).trim()),
        date: new Date(text(it.pubDate)).toISOString(),
        url,
        cover: it.enclosure?.['@_url'] ?? null,
        html: cleanHtml(text(it['content:encoded'])),
      };
    })
    .filter((p) => p.slug && p.title);
}

/** Archive API page → metadata keyed by slug: stable id, tags. */
export function parseArchive(posts, base) {
  if (!Array.isArray(posts)) throw new Error('archive response is not a list');
  const meta = new Map();
  for (const p of posts) {
    if (!p?.slug || !p?.id) continue;
    meta.set(p.slug, {
      id: String(p.id),
      tags: (p.postTags ?? []).filter((t) => !t.hidden).map((t) => String(t.name).toLowerCase()),
    });
  }
  return meta;
}

/** One page of the Notes API → this user's own top-level notes. */
export function parseNotesPage(data, userId, handle) {
  if (!data || !Array.isArray(data.items)) throw new Error('notes response has no items');
  const notes = [];
  for (const it of data.items) {
    const c = it.comment;
    // Only top-level notes written by this user (skip replies and restacks).
    if (!c || it.type !== 'comment' || c.user_id !== userId || c.ancestor_path) continue;
    const body = (c.body ?? '').trim();
    if (!body) continue;
    notes.push({
      id: String(c.id),
      date: new Date(c.date).toISOString(),
      body,
      url: `https://substack.com/@${handle}/note/c-${c.id}`,
      image: (c.attachments ?? []).find((a) => a.type === 'image')?.imageUrl ?? null,
      likes: c.reaction_count ?? 0,
    });
  }
  return { notes, next: data.nextCursor ?? null, empty: !data.items.length };
}
