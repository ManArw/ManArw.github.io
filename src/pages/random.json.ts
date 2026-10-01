// Every piece's path, for "Read something random" links (see Base.astro).
import type { APIRoute } from 'astro';
import { getPieces } from '../lib/content';

export const GET: APIRoute = async () =>
  new Response(JSON.stringify((await getPieces()).map((p) => p.href)), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
