// Builds a link-preview image for every page: /og/<page path>.jpg
// (the home page is /og/home.jpg). Base.astro points og:image at these.
// Pieces come from the content model, so new essays get cards automatically,
// on top of their own cover photo when they have one.
import type { APIRoute, GetStaticPaths } from 'astro';
import { renderCard, type Card } from '../../lib/og';
import { getPieces } from '../../lib/content';
import { site } from '../../data/site';

const fmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

export const getStaticPaths: GetStaticPaths = async () => {
  const cards: Record<string, Card> = {
    home: { title: site.name, subtitle: site.tagline, kicker: 'Essays · Poems · Notes', photo: 'src/assets/fuji.jpg' },
    about: { title: "Hello, I'm Manas.", subtitle: 'Engineering student, editor, and writer from Mysore.', kicker: 'About' },
    articles: { title: 'Essays & poems', subtitle: 'On identity, love, belonging, and hope.', kicker: 'Articles' },
    blog: { title: 'The notebook', subtitle: "Travel writing, and whatever doesn't fit an essay.", kicker: 'Blog' },
    now: { title: "What I'm up to", subtitle: 'Building a D2C business, and figuring out my purpose.', kicker: 'Now', photo: 'src/assets/japan/cairn.jpg' },
    fragments: { title: 'Fragments', subtitle: "Lines that didn't need a whole essay.", kicker: 'Notes' },
    '404': { title: 'Lost in the clouds.', kicker: '404' },
    random: { title: 'Somewhere at random', kicker: 'Random' },
  };

  for (const p of await getPieces()) {
    // A post's own cover photo, or the essay's Substack cover, behind the title.
    const photo =
      typeof p.cover === 'string' ? p.cover : (p.cover as { fsPath?: string } | undefined)?.fsPath;
    const label = p.kind === 'essay' ? 'Essay' : p.entry?.data.featured ? 'Travelogue' : 'Blog';
    cards[p.href.slice(1)] = {
      title: p.title,
      subtitle: p.excerpt,
      kicker: `${label} · ${fmt.format(p.date)} · ${p.minutes} min read`,
      photo,
    };
  }

  return Object.entries(cards).map(([path, card]) => ({ params: { path }, props: { card } }));
};

export const GET: APIRoute = async ({ props }) => {
  const jpg = await renderCard((props as { card: Card }).card);
  return new Response(new Uint8Array(jpg), { headers: { 'Content-Type': 'image/jpeg' } });
};
