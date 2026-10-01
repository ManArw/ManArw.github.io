// sitemap.xml from the content model: the fixed pages plus every piece.
import type { APIRoute } from 'astro';
import { getPieces, getNotes } from '../lib/content';
import { site, now } from '../data/site';

export const GET: APIRoute = async () => {
  const pieces = await getPieces();
  const latest = (kind: string) => pieces.find((p) => p.kind === kind)?.date;
  const urls: { loc: string; lastmod?: Date }[] = [
    { loc: '/', lastmod: pieces[0]?.date },
    { loc: '/about/' },
    { loc: '/articles/', lastmod: latest('essay') },
    { loc: '/blog/', lastmod: latest('post') },
    { loc: '/fragments/', lastmod: getNotes()[0] ? new Date(getNotes()[0].date) : undefined },
    { loc: '/now/', lastmod: new Date(now.updated) },
    ...pieces.map((p) => ({ loc: `${p.href}/`, lastmod: p.date })),
  ];
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map((u) => `  <url><loc>${site.url}${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod.toISOString().slice(0, 10)}</lastmod>` : ''}</url>`)
  .join('\n')}
</urlset>
`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
