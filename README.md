# manas: personal site

Astro static site on GitHub Pages. Essays and Notes sync from Substack on their own; blog posts are
Markdown files. One tiny Cloudflare Worker handles the two things a static site can't: fetching
Substack from GitHub's servers, and shared reaction counts.

## Run it locally

```bash
npm install
npm run sync       # pull the latest essays + notes from Substack (optional)
npm run dev        # http://localhost:4321
npm run narrate    # generate narration for new/changed pieces (see docs/AUDIO.md)
```

## Where things live

| What | File |
| --- | --- |
| Name, tagline, links, email, pets, now page, CV details | `src/data/site.ts` |
| Home page story copy | `src/pages/index.astro` |
| About page intro text | `src/pages/about.astro` |
| Blog posts | `src/content/blog/*.md` / `.mdx` |
| Synced essays and notes (don't edit by hand) | `src/data/substack-snapshot.json`, `src/data/notes-snapshot.json` |
| The content model every page reads from | `src/lib/content.ts` |
| Hero photo | `src/assets/fuji.jpg` (replace with a higher-res copy any time, same name) |
| Pet photos on the home page (the instant-print pile under the household) | `src/assets/pets/`, Subbi's clip in `public/media/pets/`, captions in `src/components/Snapshots.astro` |
| The Minecraft-style advancement (sound + "Challenge Complete!" toast) after saying hello to the whole household (every full round), or reacting at the end of the Japan travelogue; only ever after a tap | `public/sounds/advancement.mp3`, `src/lib/fanfare.ts`, `src/styles/toast.css` |
| Japan photos | `src/assets/japan/` · clips in `public/media/japan/` (both made from the phone originals by `scripts/prepare-japan-media.mjs`) |
| Reaction labels and emoji | `src/data/reactions.ts` |
| Which pieces are narrated, and the voice | `src/data/narration.mjs` (see [docs/AUDIO.md](docs/AUDIO.md)) |
| Narration audio | `public/audio/` (generated, don't edit) |
| Colours, fonts, the shared night-sky background | `src/styles/global.css` (top of file) |
| The Worker (Substack relay + reactions) | `worker/` |

## How new writing reaches the site

```
Substack ──(Cloudflare Worker relay)──> sync job ──> src/data/*-snapshot.json ──> build ──> GitHub Pages
```

- **Essays** come from the RSS feed (full text). Substack's archive API adds each post's stable id,
  tags and any voiceover audio.
- **Notes** come from Substack's Notes API. They are **not** in RSS at all, and that API is
  unofficial, so Notes are best-effort: if it fails, the site keeps the notes it already has.
- **Why the relay:** Substack's Cloudflare protection answers GitHub's servers with a bot challenge
  (HTTP 403), so the build can't read Substack directly. That's why nothing synced for the first few
  days after launch. The Worker fetches the same public URLs from Cloudflare's network instead. It only
  relays three fixed Substack addresses, so it isn't an open proxy.
- **When:** `.github/workflows/deploy.yml` runs every two hours. If Substack has anything new it commits
  the snapshots ("Sync Substack") and redeploys; if not, it stops there. To publish right away, go to
  the repo's **Actions → Deploy to GitHub Pages → Run workflow**.
- **If Substack is unreachable**, the sync step fails and GitHub emails you. The live site isn't
  touched: it keeps serving the last good content.
- Posts you unpublish or rename on Substack disappear from the site on the next sync.

Nothing ever needs editing by hand when you publish on Substack.

### Articles, Blog, Fragments

- **Articles** (`/articles`): finished essays and poems from Substack.
- **Blog** (`/blog`): the notebook. Longer travel writing and shorter updates, written as files here.
- **Fragments** (`/fragments`): Substack Notes. Linked from the Blog and Articles pages.

### Writing a blog post

Create `src/content/blog/my-post.md`:

```md
---
title: My post
date: 2026-10-01
summary: One line that shows under the title.
tags: [building, notes]
draft: false
---

Write in Markdown here.
```

The file name becomes the URL (`/blog/my-post`). `draft: true` hides it from the live site. If you
ever rename the file, add `id: my-post` (the old name) to the front matter so its reactions stay
attached.

For photos and video, use `.mdx` and the components in `src/components/` (`japan-ten-days.mdx` uses
all of them):

- `Figure`: one photo. In the column by default, or `wide`, `inset` (small, beside the text), `tall`
  (a portrait, never taller than the screen) or `bleed` (edge to edge, cropped to `ratio`).
  `shape="window"` frames it as an aeroplane window whose shade lifts. `motion="…"` adds one
  scroll-linked movement: `push` (draws you in), `open` (the view opens out of a narrow band),
  `arc` (revealed by a rising arc), `mist` (comes out of cloud), `rise` (tilts up the photo),
  `pan` (travels across it; give `mratio` for phones) or `dusk` (brightens out of the dark).
- `Spread`: two photos laid like prints, a small one tossed over the corner of a larger one.
- `Strip`: a row of photos with small labels (times, days); on phones it swipes sideways. `pin`
  holds the screen while scrolling moves along the row (with a running clock if every label is a
  time); `small` makes little instant prints that develop as they come into view.
- `Video`: a short muted loop that only downloads and plays while on screen. `small` is a lighter
  file for phones; `sound` adds a button for clips worth hearing (sound never starts on its own).
- `Chapter`: turns `## Day 3 · Meeting Mount Fuji` headings into chapter titles. Opt in with
  `export const components = { h2: Chapter };` in the post.
- `Cinematic`: once, at the end of a post (`<Cinematic cover={photo} />`): the title and cover open
  like a film, step counts tick up, and the closing quote lights up word by word.

Every photo and clip casts a soft glow of its own colours on the page, and opens in a full-screen
viewer (arrow keys, swipe, Esc) that it grows out of and shrinks back into. All the movement is CSS
and a little JavaScript, free; browsers without scroll-linked animation (and readers who prefer
reduced motion) get the same photos, still. Keep each component on one line and self-closing
(`<Figure … />`): the narration and search skip components that way, so adding photos never
changes a narrated post's audio. Put photos in `src/assets/` (Astro makes the responsive sizes);
strip GPS from phone originals first, as the Japan media script does.

`cover:` adds a header photo; `featured: true` puts the post at the top of the Blog page.

## Listen to this piece (narration)

Chosen pieces have a narrated version: a real MP3 made for free by an open-source voice model
(Kokoro-82M) and played by a small player at the top of the piece. Nothing is narrated unless you
switch it on:

- **Substack essay:** add its slug to `NARRATED_ESSAYS` in `src/data/narration.mjs`.
- **Blog post:** add `audio: true` to its front matter.

Commit, and the workflow generates the audio (only for new or changed pieces) and deploys. Everything,
including running it on your laptop instead, caching, failures and licences, is in
[docs/AUDIO.md](docs/AUDIO.md).

## Reactions

"Did this stay with you?" at the end of each piece. Counts are shared between all readers and stored
in the Worker's D1 database against each piece's stable id (Substack's post id, or `blog-<file>`), so
they survive URL changes. No accounts: each browser keeps a random token and can react once per kind
(clicking again takes it back). No IPs or personal data are stored.

To see all counts: `cd worker && npx wrangler d1 execute manarw-reactions --remote --command "SELECT piece, reaction, COUNT(*) FROM votes GROUP BY 1, 2"`.

## The Worker

`worker/` is a free Cloudflare Worker (account: manasarawalli@gmail.com) at
`https://manarw-api.manarw-api.workers.dev`. To change and redeploy it:

```bash
cd worker
npx wrangler login     # once per computer
npx wrangler deploy
```

## Search, random, feeds

- **Search**: the magnifier in the nav, `Ctrl K` / `⌘ K`, or `/`. Covers titles, summaries, tags, full
  text and fragments, from `/search.json` (only downloaded when someone opens search).
- **Random**: "read something at random" links go to `/random`.
- **RSS for this site**: `/feed.xml`. **Sitemap**: `/sitemap.xml`, referenced from `/robots.txt`.

All of these are generated from the same content model, so they never need editing.

## Link previews

Each page gets a generated share card at `/og/<page>.jpg` (see `src/lib/og.ts`). Essays use their own
Substack cover photo behind the title. They rebuild automatically. Test a link at
<https://www.opengraph.xyz>.

## Visitor counter (GoatCounter)

Stats live at <https://manarw.goatcounter.com>, and the footer shows "N visitors so far". Visits from
`localhost` aren't counted.

## Deploying

Pushing to `main` builds and deploys. In the repo, **Settings → Pages → Build and deployment →
Source** should be **GitHub Actions**.

### Custom domain

1. Buy the domain (Cloudflare Registrar, Porkbun or Namecheap).
2. At the registrar's DNS settings add:
   - four `A` records for `@` → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - a `CNAME` record for `www` → `manarw.github.io`
3. Add a file `public/CNAME` containing just the domain (e.g. `manasarawalli.com`), and set
   `site: 'https://manasarawalli.com'` in `astro.config.mjs` and `url` in `src/data/site.ts`.
4. Add the new domain to `ALLOWED_ORIGINS` in `worker/wrangler.toml` and redeploy the Worker
   (otherwise reactions won't load on the new domain).
5. Push. In the repo: Settings → Pages → Custom domain → enter it, then tick **Enforce HTTPS**.
