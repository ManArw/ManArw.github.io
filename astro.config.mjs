// @ts-check
import { defineConfig } from 'astro/config';

import mdx from '@astrojs/mdx';

// Deployed to GitHub Pages from the repo "ManArw.github.io", so the site
// lives at the domain root. If you deploy from a differently named repo,
// set `base: '/<repo-name>'` here.
export default defineConfig({
  site: 'https://manarw.github.io',
  trailingSlash: 'ignore',
  integrations: [mdx()],
});