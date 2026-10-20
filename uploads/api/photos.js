/* =============================================================================
   api/photos.js — passende foto's zoeken bij Pexels (gratis licentie, ook zakelijk)
   -----------------------------------------------------------------------------
     GET /api/photos                       staat het klaar? { ok, photos }
     GET /api/photos?q=bakery&orientation=landscape&n=12&locale=en-US
                                           -> { photos: [{ id, w, h, alt, photographer, thumb, original, ... }] }

   Alleen vanaf de Tool Hub (en met een wachtwoord als APP_PASSWORD in Vercel
   staat). De sleutel PEXELS_API_KEY blijft hier; de browser haalt de foto zelf
   op van images.pexels.com. Zie lib/photos.js.
   ============================================================================= */
import { corsHeaders, checkOrigin, rateLimiter } from '../lib/check.js';
import { checkQuery, searchUrl, mapResults, pexelsError } from '../lib/photos.js';

const limit = rateLimiter({ limit: 120, windowMs: 15 * 60 * 1000 });

function json(body, status, headers, cache = 'no-store') {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache },
  });
}

export function OPTIONS(request) {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('origin')) });
}

export async function GET(request) {
  const origin = request.headers.get('origin');
  const headers = corsHeaders(origin);
  const params = new URL(request.url).searchParams;
  if (!params.has('q')) return json({ ok: true, photos: !!process.env.PEXELS_API_KEY }, 200, headers);

  const verdict = checkOrigin({ origin, password: request.headers.get('x-app-password'), expected: process.env.APP_PASSWORD });
  if (!verdict.ok) return json({ error: verdict.error }, verdict.status, headers);
  if (!process.env.PEXELS_API_KEY) return json({ error: 'Foto’s zoeken staat nog niet aan: PEXELS_API_KEY ontbreekt in Vercel.' }, 500, headers);
  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'onbekend';
  if (!limit(ip)) return json({ error: 'Even te veel zoekvragen achter elkaar. Probeer het over een kwartier opnieuw.' }, 429, headers);

  const query = checkQuery(params);
  if (!query.ok) return json({ error: query.error }, query.status, headers);
  try {
    const res = await fetch(searchUrl(query), { headers: { authorization: process.env.PEXELS_API_KEY } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('pexels', res.status, JSON.stringify(data).slice(0, 300));
      return json({ error: pexelsError(res.status) }, 502, headers);
    }
    // Dezelfde zoekvraag kort bewaren: scheelt zoekvragen bij Pexels (200 per uur)
    return json({ photos: mapResults(data) }, 200, headers, 'public, max-age=600');
  } catch (err) {
    console.error('pexels mislukt', err);
    return json({ error: 'Pexels is niet bereikbaar. Probeer het zo nog eens.' }, 502, headers);
  }
}
