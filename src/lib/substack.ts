import { parseFeed, fetchNotes } from './substack-core.mjs';
import snapshot from '../data/substack-snapshot.json';
import notesSnapshot from '../data/notes-snapshot.json';
import { site } from '../data/site';

export type Article = {
  slug: string;
  title: string;
  subtitle: string;
  date: string;
  url: string;
  cover: string | null;
  minutes: number;
  html: string;
};

export type Note = {
  id: string;
  date: string;
  body: string;
  url: string;
  image: string | null;
  likes: number;
};

let cached: Promise<Article[]> | undefined;
let cachedNotes: Promise<Note[]> | undefined;

function mergeBy<T>(key: (x: T) => string, date: (x: T) => string, ...lists: T[][]): T[] {
  const map = new Map<string, T>();
  for (const list of lists) for (const x of list) map.set(key(x), x);
  return [...map.values()].sort((a, b) => date(b).localeCompare(date(a)));
}

// Fetches the live feed at build time and merges it with the committed
// snapshot. The snapshot keeps older essays around once they fall off the
// feed (Substack only lists the most recent ~20) and lets the site build offline.
export function getArticles(): Promise<Article[]> {
  cached ??= (async () => {
    let live: Article[] = [];
    try {
      const res = await fetch(site.substackFeed, { headers: { 'user-agent': 'manas-site-build' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      live = parseFeed(await res.text());
    } catch (err) {
      console.warn(`[substack] live feed unavailable, using snapshot only: ${(err as Error).message}`);
    }
    return mergeBy((a) => a.slug, (a) => a.date, snapshot as Article[], live);
  })();
  return cached;
}

// Substack Notes, same live-plus-snapshot approach.
export function getNotes(): Promise<Note[]> {
  cachedNotes ??= (async () => {
    let live: Note[] = [];
    try {
      live = await fetchNotes(site.substackUserId, site.substackHandle);
    } catch (err) {
      console.warn(`[substack] notes unavailable, using snapshot only: ${(err as Error).message}`);
    }
    return mergeBy((n) => n.id, (n) => n.date, notesSnapshot as Note[], live);
  })();
  return cachedNotes;
}
