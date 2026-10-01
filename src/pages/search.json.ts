// The search index: every piece and every fragment, from the content model.
// Fetched by the search dialog the first time it opens.
import type { APIRoute } from 'astro';
import { getPieces, getNotes, kindLabel } from '../lib/content';

export const GET: APIRoute = async () => {
  const pieces = (await getPieces()).map((p) => ({
    t: p.title,
    h: p.href,
    k: kindLabel(p.kind),
    d: p.date.toISOString(),
    m: p.minutes,
    g: p.tags,
    e: p.excerpt,
    x: p.text.replace(/\s+/g, ' '),
  }));
  const notes = getNotes().map((n) => {
    const flat = n.body.replace(/\s+/g, ' ').trim();
    return {
      t: flat.length > 70 ? flat.slice(0, flat.lastIndexOf(' ', 70)) + '…' : flat,
      h: `/fragments#note-${n.id}`,
      k: 'Fragment',
      d: n.date,
      x: flat,
    };
  });
  return new Response(JSON.stringify({ items: [...pieces, ...notes] }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
