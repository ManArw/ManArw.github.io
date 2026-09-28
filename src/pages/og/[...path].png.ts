// Builds a link-preview image for every page: /og/<page path>.png
// (the home page is /og/home.png). Base.astro points og:image at these.
import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';
import { renderCard, type Card } from '../../lib/og';
import { getArticles } from '../../lib/substack';
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
  };

  for (const a of await getArticles()) {
    cards[`articles/${a.slug}`] = {
      title: a.title,
      subtitle: a.subtitle,
      kicker: `Essay · ${fmt.format(new Date(a.date))}`,
    };
  }

  for (const e of await getCollection('blog', ({ data }) => !data.draft)) {
    // Use the post's own cover photo as the card background when it has one.
    const fsPath = (e.data.cover as { fsPath?: string } | undefined)?.fsPath;
    cards[`blog/${e.id}`] = {
      title: e.data.title,
      subtitle: e.data.summary,
      kicker: `${e.data.featured ? 'Travelogue' : 'Blog'} · ${fmt.format(e.data.date)}`,
      photo: fsPath,
    };
  }

  return Object.entries(cards).map(([path, card]) => ({ params: { path }, props: { card } }));
};

export const GET: APIRoute = async ({ props }) => {
  const png = await renderCard((props as { card: Card }).card);
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
};
