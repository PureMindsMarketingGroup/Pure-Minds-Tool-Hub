/* =============================================================================
   api/photos.js — passende foto's zoeken in een fotobank (Unsplash, of Pexels)
   -----------------------------------------------------------------------------
     GET /api/photos                       staat het klaar? { ok, photos, provider }
     GET /api/photos?q=bakery&orientation=landscape&n=9&locale=en-US
                                           -> { provider, photos: [{ id, w, h, alt, photographer, thumb, src, track, ... }] }
     GET /api/photos?track=<download_location>
                                           een foto wordt gebruikt: Unsplash een download melden (API-regels)

   Alleen vanaf de Tool Hub, en alleen voor een ingelogde collega van de
   teamlijst (lib/team.js). De sleutel (UNSPLASH_ACCESS_KEY, anders PEXELS_API_KEY) blijft hier;
   de browser haalt de foto zelf op. Zie lib/photos.js.
   ============================================================================= */
import { corsHeaders, checkOrigin, rateLimiter } from '../lib/check.js';
import { checkLogin } from '../lib/team.js';
import { PROVIDERS, pickProvider, checkQuery, searchRequest, mapResults, trackUrl, providerError } from '../lib/photos.js';

const limit = rateLimiter({ limit: 120, windowMs: 15 * 60 * 1000 });
const remember = new Map();   // inlogbewijzen die net goed waren

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
  const provider = pickProvider(process.env);
  if (!params.has('q') && !params.has('track')) return json({ ok: true, photos: !!provider, provider }, 200, headers);

  const verdict = checkOrigin({ origin });
  if (!verdict.ok) return json({ error: verdict.error }, verdict.status, headers);
  const login = await checkLogin(request.headers.get('authorization'), { remember });
  if (!login.ok) return json({ error: login.error }, login.status, headers);
  if (!provider) return json({ error: 'Foto’s zoeken staat nog niet aan: de sleutel van de fotobank ontbreekt in Vercel (UNSPLASH_ACCESS_KEY).' }, 500, headers);
  const key = process.env[PROVIDERS[provider].env];
  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'onbekend';
  if (!limit(ip)) return json({ error: 'Even te veel zoekvragen achter elkaar. Probeer het over een kwartier opnieuw.' }, 429, headers);

  // Downloadmelding (Unsplash): stil, de gebruiker merkt er niets van
  if (params.has('track')) {
    const url = trackUrl(params.get('track'));
    if (!url || provider !== 'unsplash') return json({ ok: false }, 400, headers);
    try {
      await fetch(url, { headers: { authorization: `Client-ID ${key}`, 'accept-version': 'v1' } });
    } catch (err) {
      console.error('unsplash download melden mislukt', err);
    }
    return json({ ok: true }, 200, headers);
  }

  const query = checkQuery(params);
  if (!query.ok) return json({ error: query.error }, query.status, headers);
  try {
    const req = searchRequest(provider, query, key);
    const res = await fetch(req.url, { headers: req.headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error(provider, res.status, JSON.stringify(data).slice(0, 300));
      return json({ error: providerError(provider, res.status) }, 502, headers);
    }
    // Dezelfde zoekvraag kort bewaren: scheelt zoekvragen (Unsplash: 50 per uur om te beginnen)
    return json({ provider, photos: mapResults(provider, data) }, 200, headers, 'private, max-age=600');
  } catch (err) {
    console.error('fotobank mislukt', err);
    return json({ error: `${PROVIDERS[provider].name} is niet bereikbaar. Probeer het zo nog eens.` }, 502, headers);
  }
}
