# manas — personal site

Astro static site. Essays sync automatically from Substack; blog posts are Markdown files.

## Run it locally

```bash
npm install
npm run dev        # http://localhost:4321
```

## Where things live

| What | File |
| --- | --- |
| Name, tagline, links, email, pets, now page, CV details | `src/data/site.ts` |
| Home page story copy | `src/pages/index.astro` |
| About page intro text | `src/pages/about.astro` |
| Blog posts | `src/content/blog/*.md` |
| Hero photo | `src/assets/fuji.jpg` (replace with a higher-res copy any time, same name) |
| Japan photos | `src/assets/japan/` · video in `public/media/` |
| Japan travelogue | `src/content/blog/japan-ten-days.mdx` |
| Pets' speech bubbles | `family` in `src/data/site.ts` |
| Colours & fonts | `src/styles/global.css` (top of file) |

### Writing a blog post

Create `src/content/blog/my-post.md`:

```md
---
title: My post
date: 2026-10-01
summary: One line that shows under the title.
draft: false
---

Write in Markdown here.
```

The file name becomes the URL: `/blog/my-post`. `draft: true` hides it from the live site.

### Substack essays

Nothing to do. Every build pulls `https://manas1211.substack.com/feed` and renders each essay at
`/articles/<slug>` with a link back to Substack. The deploy workflow rebuilds daily, so new posts
show up within a day (or trigger it manually from the repo's **Actions** tab).

Substack Notes show up on `/fragments` the same way. They come from Substack's public profile API
(Notes aren't in RSS). That API is unofficial, so if it ever breaks, the site keeps showing the last
saved notes instead of failing.

Substack's feed only lists the latest ~20 posts. To keep older ones on the site forever, run
`npm run sync` now and then and commit `src/data/substack-snapshot.json` and `src/data/notes-snapshot.json`.

### Posts with photos

Use `.mdx` instead of `.md` and import the `Figure` / `Video` components. See `japan-ten-days.mdx`
for an example. `cover:` in the front matter adds a header photo; `featured: true` puts the post
at the top of the Blog page.

## Deploying to GitHub Pages

1. Create a public repo named **`ManArw.github.io`** on GitHub.
2. Push this folder to its `main` branch.
3. In the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. The site goes live at <https://manarw.github.io>.

Using a different repo name? Set `base: '/<repo-name>'` in `astro.config.mjs`.

### Visitor counter (GoatCounter)

1. Sign up at <https://www.goatcounter.com> (free for personal sites, no cookies, no banner needed) and pick a code, e.g. `manas`.
2. In GoatCounter: **Settings → "Allow adding visitor counts on your website"** → on.
3. Put the code in `analytics.goatcounter` in `src/data/site.ts` and push.

Stats live at `https://<code>.goatcounter.com`, and the footer shows "N visitors so far".
Visits from `localhost` aren't counted.

### Link previews

Each page gets a generated share card at `/og/<page>.png` (see `src/lib/og.ts`). They rebuild
automatically, so new essays get cards too. After going live, test a link at
<https://www.opengraph.xyz>.

### Custom domain

1. Buy the domain (Cloudflare Registrar, Porkbun or Namecheap).
2. At the registrar's DNS settings add:
   - four `A` records for `@` → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - a `CNAME` record for `www` → `manarw.github.io`
3. Add a file `public/CNAME` containing just the domain (e.g. `manasarawalli.com`), and set
   `site: 'https://manasarawalli.com'` in `astro.config.mjs`. Push.
4. In the repo: Settings → Pages → Custom domain → enter it, then tick **Enforce HTTPS** once it's allowed.
