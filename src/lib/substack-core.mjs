// Parses a Substack RSS feed into clean article objects.
// Plain .mjs so both the Astro build and scripts/sync-substack.mjs can use it.
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
      // Unwrap the link Substack puts around every image (it just opens the full-size file).
      a: (tagName, attribs) => {
        if ((attribs.class ?? '').includes('image-link')) return { tagName: 'span', attribs: {} };
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
  // Substack uses empty paragraphs as spacers.
  return out.replace(/<p>\s*<\/p>/g, '').trim();
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

// Substack Notes aren't in the RSS feed. They come from Substack's public
// profile API (unofficial, so callers must handle failure gracefully).
export async function fetchNotes(userId, handle, maxPages = 10) {
  const notes = [];
  let cursor = null;
  for (let page = 0; page < maxPages; page++) {
    const url = new URL(`https://substack.com/api/v1/reader/feed/profile/${userId}`);
    url.searchParams.append('types[]', 'note');
    if (cursor) url.searchParams.set('cursor', cursor);
    const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (personal-site build)' } });
    if (!res.ok) throw new Error(`Notes request failed: HTTP ${res.status}`);
    const data = await res.json();
    for (const it of data.items ?? []) {
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
    cursor = data.nextCursor;
    if (!cursor || !(data.items ?? []).length) break;
  }
  return notes.sort((a, b) => b.date.localeCompare(a.date));
}

export function parseFeed(xml) {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', cdataPropName: false });
  const doc = parser.parse(xml);
  let items = doc?.rss?.channel?.item ?? [];
  if (!Array.isArray(items)) items = [items];

  return items
    .map((it) => {
      const url = text(it.link);
      const html = cleanHtml(text(it['content:encoded']));
      const words = sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).split(/\s+/).filter(Boolean).length;
      return {
        slug: slugFromLink(url),
        title: decodeEntities(text(it.title).trim()),
        subtitle: decodeEntities(text(it.description).trim()),
        date: new Date(text(it.pubDate)).toISOString(),
        url,
        cover: it.enclosure?.['@_url'] ?? null,
        minutes: Math.max(1, Math.round(words / 230)),
        html,
      };
    })
    .filter((p) => p.slug && p.title)
    .sort((a, b) => b.date.localeCompare(a.date));
}
