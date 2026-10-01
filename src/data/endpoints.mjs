// Shared by the site (src/data/site.ts) and scripts/sync-substack.mjs.

// The site's Cloudflare Worker (see worker/): relays Substack for the sync
// step and stores reaction counts.
export const API_BASE = 'https://manarw-api.manarw-api.workers.dev';

export const SUBSTACK = {
  base: 'https://manas1211.substack.com',
  feed: 'https://manas1211.substack.com/feed',
  handle: 'manas1211',
  userId: 497323139,
};
