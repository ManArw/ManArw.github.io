// RSS for the site's own writing (essays + notebook posts), generated from the
// same content model as the archive, so it never needs editing by hand.
import type { APIRoute } from 'astro';
import { getPieces, kindLabel } from '../lib/content';
import { site } from '../data/site';

const xml = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);
const cdata = (s: string) => `<![CDATA[${s.replaceAll(']]>', ']]]]><![CDATA[>')}]]>`;
// Feed readers don't know this site's root, so make root-relative links absolute.
const absolutize = (html: string) => html.replace(/(href|src)="\/(?!\/)/g, `$1="${site.url}/`);

export const GET: APIRoute = async () => {
  const pieces = (await getPieces()).slice(0, 50);
  const items = pieces.map((p) => {
    // Full text where we have HTML: essays, and plain-Markdown posts. MDX posts
    // (photos, video) get their summary and a link.
    const html = p.html ?? p.entry?.rendered?.html;
    const body = html
      ? absolutize(html) + (p.sourceUrl ? `<p><a href="${p.sourceUrl}">Also on Substack</a></p>` : '')
      : `<p>${xml(p.excerpt)}</p><p><a href="${p.url}">Read it on the site →</a></p>`;
    return `    <item>
      <title>${xml(p.title)}</title>
      <link>${p.url}</link>
      <guid isPermaLink="false">${p.id}</guid>
      <pubDate>${p.date.toUTCString()}</pubDate>
      <dc:creator>${xml(site.name)}</dc:creator>
      <category>${kindLabel(p.kind)}</category>
${p.tags.map((t) => `      <category>${xml(t)}</category>`).join('\n')}
      <description>${xml(p.excerpt)}</description>
      <content:encoded>${cdata(body)}</content:encoded>
    </item>`;
  });

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xml(site.name)}</title>
    <link>${site.url}/</link>
    <atom:link href="${site.url}/feed.xml" rel="self" type="application/rss+xml" />
    <description>${xml(site.description)}</description>
    <language>en</language>
    <lastBuildDate>${(pieces[0]?.date ?? new Date()).toUTCString()}</lastBuildDate>
${items.join('\n')}
  </channel>
</rss>
`;
  return new Response(body, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
};
