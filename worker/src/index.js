// The site's only backend: a free Cloudflare Worker with two small jobs.
//
// 1. Substack relay (GET /substack/...). Substack's Cloudflare setup answers
//    GitHub Actions runners with a bot challenge (HTTP 403), so the build can't
//    read the feed directly. The sync step fetches through here instead. Only
//    the fixed upstream URLs below are reachable: this is not an open proxy.
//    The last good response is kept in KV and served if Substack rate-limits.
//
// 2. Reactions (GET/POST /reactions). Shared counts for "Did this stay with
//    you?" at the end of each piece, stored in D1. A vote is a row keyed by
//    (piece, reaction, voter), so the same browser can't count twice; voter is
//    a SHA-256 of a random token the browser keeps. No IPs, no accounts.

const SUBSTACK = 'https://manas1211.substack.com';
const SUBSTACK_USER_ID = 497323139;
const REACTIONS = ['loved', 'think', 'felt', 'curious'];
const PIECE_RE = /^[a-z0-9][a-z0-9-]{0,119}$/;
const VOTER_RE = /^[a-z0-9-]{16,64}$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    try {
      if (url.pathname.startsWith('/substack/')) return await relay(url, env);
      if (url.pathname === '/reactions') {
        if (request.method === 'GET') return json(await counts(env, url.searchParams.get('ids')), 200, cors);
        if (request.method === 'POST') return json(await vote(env, request), 200, cors);
      }
      if (url.pathname === '/') return new Response('manarw-api: ok\n');
      return json({ error: 'not found' }, 404, cors);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      return json({ error: err.message }, status, cors);
    }
  },
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function json(body, status, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

function corsHeaders(request, env) {
  const origin = request.headers.get('origin');
  const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim());
  if (!origin || !allowed.includes(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
    vary: 'origin',
  };
}

// ---------- Substack relay ----------

async function relay(url, env) {
  let upstream;
  if (url.pathname === '/substack/feed') {
    upstream = `${SUBSTACK}/feed`;
  } else if (url.pathname === '/substack/archive') {
    const offset = Math.max(0, Number.parseInt(url.searchParams.get('offset') ?? '0', 10) || 0);
    upstream = `${SUBSTACK}/api/v1/archive?sort=new&limit=50&offset=${offset}`;
  } else if (url.pathname === '/substack/notes') {
    const u = new URL(`https://substack.com/api/v1/reader/feed/profile/${SUBSTACK_USER_ID}`);
    u.searchParams.append('types[]', 'note');
    const cursor = url.searchParams.get('cursor');
    if (cursor) u.searchParams.set('cursor', cursor);
    upstream = u.href;
  } else {
    throw new HttpError(404, 'unknown relay path');
  }

  const res = await fetch(upstream, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; manarw-site-sync; +https://manarw.github.io)',
      accept: 'application/rss+xml, application/json;q=0.9, */*;q=0.8',
    },
  });

  // Substack's JSON APIs now and then rate-limit Cloudflare's shared IPs (429).
  // Keep the last good response in KV and serve it when that happens.
  const cacheKey = `relay:${url.pathname}${url.search}`;
  const headers = {
    'content-type': res.headers.get('content-type') ?? 'application/octet-stream',
    'x-upstream-status': String(res.status),
    'cache-control': 'no-store',
  };
  if (res.ok) {
    const body = await res.text();
    await env.RELAY_CACHE.put(cacheKey, body, { metadata: { type: headers['content-type'], at: Date.now() } });
    return new Response(body, { status: 200, headers });
  }
  if (res.status === 429 || res.status >= 500) {
    const { value, metadata } = await env.RELAY_CACHE.getWithMetadata(cacheKey);
    if (value) {
      return new Response(value, {
        status: 200,
        headers: { ...headers, 'content-type': metadata?.type ?? headers['content-type'], 'x-relay-stale-since': new Date(metadata?.at ?? 0).toISOString() },
      });
    }
  }
  // Pass the upstream status through so the sync script can tell a Substack
  // failure apart from a relay failure.
  return new Response(res.body, { status: res.status, headers });
}

// ---------- Reactions ----------

async function counts(env, idsParam) {
  const ids = [...new Set((idsParam ?? '').split(',').map((s) => s.trim()).filter((s) => PIECE_RE.test(s)))].slice(0, 100);
  if (!ids.length) throw new HttpError(400, 'ids required');
  const placeholders = ids.map(() => '?').join(',');
  const { results } = await env.DB.prepare(
    `SELECT piece, reaction, COUNT(*) AS n FROM votes WHERE piece IN (${placeholders}) GROUP BY piece, reaction`,
  )
    .bind(...ids)
    .all();
  return { counts: shape(ids, results) };
}

function shape(ids, rows) {
  const out = {};
  for (const id of ids) out[id] = Object.fromEntries(REACTIONS.map((r) => [r, 0]));
  for (const row of rows) if (out[row.piece] && row.reaction in out[row.piece]) out[row.piece][row.reaction] = row.n;
  return out;
}

async function vote(env, request) {
  let body;
  try {
    body = await request.json();
  } catch {
    throw new HttpError(400, 'invalid json');
  }
  const { piece, reaction, voter, on } = body ?? {};
  if (!PIECE_RE.test(String(piece))) throw new HttpError(400, 'invalid piece');
  if (!REACTIONS.includes(reaction)) throw new HttpError(400, 'invalid reaction');
  if (!VOTER_RE.test(String(voter))) throw new HttpError(400, 'invalid voter');
  if (typeof on !== 'boolean') throw new HttpError(400, 'on must be true or false');

  const voterHash = await sha256(`manarw:${voter}`);
  if (on) {
    await env.DB.prepare('INSERT OR IGNORE INTO votes (piece, reaction, voter, created_at) VALUES (?, ?, ?, ?)')
      .bind(piece, reaction, voterHash, Date.now())
      .run();
  } else {
    await env.DB.prepare('DELETE FROM votes WHERE piece = ? AND reaction = ? AND voter = ?').bind(piece, reaction, voterHash).run();
  }
  return counts(env, piece);
}

async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
