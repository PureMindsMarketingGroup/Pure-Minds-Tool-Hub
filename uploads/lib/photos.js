/* =============================================================================
   photos.js — foto's zoeken in een fotobank (getest in tests/ai.test.js, zonder netwerk)
   -----------------------------------------------------------------------------
   Alleen fotobanken met een gratis licentie, ook voor zakelijk gebruik, zonder
   naamsvermelding in je post of mail. Geen willekeurige foto's van internet:
   daar zit bijna altijd auteursrecht op.

     Unsplash  (UNSPLASH_ACCESS_KEY)  https://unsplash.com/license
               API-regels: de fotograaf en Unsplash noemen waar we de foto tonen
               (de kiezer), de foto via hun eigen link gebruiken, en een
               download melden zodra een foto gebruikt wordt (track).
               50 zoekvragen per uur, na goedkeuring 1.000.
     Pexels    (PEXELS_API_KEY)        https://www.pexels.com/license/
               reserve: nieuwe sleutels zijn gepauzeerd (oktober 2026); een bestaande werkt.

   De server zoekt (de sleutel blijft in Vercel); de browser haalt de foto
   daarna zelf op (images.unsplash.com en images.pexels.com staan dat toe).

     pickProvider(env)                  'unsplash' | 'pexels' | null
     checkQuery(params)                 { ok, q, orientation, n, locale } of { ok: false, status, error }
     searchRequest(provider, query, key) { url, headers }
     mapResults(provider, json)         [{ id, provider, w, h, alt, color, photographer,
                                          photographerUrl, pageUrl, thumb, src, track }]
     trackUrl(url)                      het adres van een downloadmelding (alleen Unsplash), of ''
   ============================================================================= */

export const ORIENTATIONS = ['landscape', 'portrait', 'square'];
export const LOCALES = ['en-US', 'nl-NL'];
export const PROVIDERS = {
  unsplash: { env: 'UNSPLASH_ACCESS_KEY', name: 'Unsplash', site: 'https://unsplash.com' },
  pexels: { env: 'PEXELS_API_KEY', name: 'Pexels', site: 'https://www.pexels.com' },
};
// Unsplash wil weten waar een link vandaan komt (API-regels)
const UTM = 'utm_source=pure_minds_tool_hub&utm_medium=referral';
const withUtm = (u) => `${u}${u.includes('?') ? '&' : '?'}${UTM}`;

export function pickProvider(env = {}) {
  if (env.UNSPLASH_ACCESS_KEY) return 'unsplash';
  if (env.PEXELS_API_KEY) return 'pexels';
  return null;
}

export function checkQuery(params) {
  const q = String(params.get('q') || '').replace(/\s+/g, ' ').trim();
  if (q.length < 2) return { ok: false, status: 400, error: 'Typ waar de foto over moet gaan.' };
  if (q.length > 100) return { ok: false, status: 400, error: 'Die zoekvraag is te lang.' };
  const orientation = ORIENTATIONS.includes(params.get('orientation')) ? params.get('orientation') : '';
  const n = Math.min(24, Math.max(1, parseInt(params.get('n'), 10) || 9));
  const locale = LOCALES.includes(params.get('locale')) ? params.get('locale') : 'en-US';
  return { ok: true, q, orientation, n, locale };
}

export function searchRequest(provider, { q, orientation, n, locale }, key) {
  if (provider === 'unsplash') {
    const u = new URL('https://api.unsplash.com/search/photos');
    u.searchParams.set('query', q);
    u.searchParams.set('per_page', String(n));
    u.searchParams.set('content_filter', 'high');
    if (orientation) u.searchParams.set('orientation', orientation === 'square' ? 'squarish' : orientation);
    u.searchParams.set('lang', locale === 'nl-NL' ? 'nl' : 'en');
    return { url: u.toString(), headers: { authorization: `Client-ID ${key}`, 'accept-version': 'v1' } };
  }
  const u = new URL('https://api.pexels.com/v1/search');
  u.searchParams.set('query', q);
  u.searchParams.set('per_page', String(n));
  if (orientation) u.searchParams.set('orientation', orientation);
  if (locale) u.searchParams.set('locale', locale);
  return { url: u.toString(), headers: { authorization: key } };
}

// Alleen https-links van de beeldserver van de fotobank zelf
function imageFrom(u, host, keepQuery) {
  try {
    const url = new URL(u);
    if (url.protocol !== 'https:' || url.hostname !== host) return '';
    return keepQuery ? url.toString() : `${url.origin}${url.pathname}`;
  } catch (err) {
    return '';
  }
}
const site = (u, prefix, fallback) => (typeof u === 'string' && u.startsWith(prefix) ? u : fallback);
const hex = (c) => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : '#c9d3db');

export function mapResults(provider, json) {
  if (provider === 'unsplash') {
    const list = json && Array.isArray(json.results) ? json.results : [];
    return list.map((p) => {
      // raw heeft al een ?ixid=...: de maat komt er straks achter (&w=...)
      const src = imageFrom(p && p.urls && p.urls.raw, 'images.unsplash.com', true);
      if (!src) return null;
      const user = (p && p.user) || {};
      return {
        id: String(p.id),
        provider,
        w: p.width,
        h: p.height,
        alt: String(p.alt_description || p.description || '').slice(0, 200),
        color: hex(p.color),
        photographer: String(user.name || '').slice(0, 80),
        photographerUrl: withUtm(site(user.links && user.links.html, 'https://unsplash.com/', 'https://unsplash.com')),
        pageUrl: withUtm(site(p.links && p.links.html, 'https://unsplash.com/', 'https://unsplash.com')),
        thumb: `${src}&w=400&fit=max&q=70&fm=jpg`,
        src,
        track: trackUrl(p.links && p.links.download_location),
      };
    }).filter(Boolean);
  }
  const list = json && Array.isArray(json.photos) ? json.photos : [];
  return list.map((p) => {
    const src = imageFrom(p && p.src && p.src.original, 'images.pexels.com', false);
    if (!src) return null;
    return {
      id: String(p.id),
      provider: 'pexels',
      w: p.width,
      h: p.height,
      alt: String(p.alt || '').slice(0, 200),
      color: hex(p.avg_color),
      photographer: String(p.photographer || '').slice(0, 80),
      photographerUrl: site(p.photographer_url, 'https://www.pexels.com/', 'https://www.pexels.com/'),
      pageUrl: site(p.url, 'https://www.pexels.com/', 'https://www.pexels.com/'),
      thumb: `${src}?auto=compress&cs=tinysrgb&w=400`,
      src,
      track: '',
    };
  }).filter(Boolean);
}

// Downloadmelding van Unsplash: alleen naar api.unsplash.com/photos/<id>/download
export function trackUrl(u) {
  try {
    const url = new URL(u);
    return url.protocol === 'https:' && url.hostname === 'api.unsplash.com' && /^\/photos\/[\w-]+\/download$/.test(url.pathname) ? url.toString() : '';
  } catch (err) {
    return '';
  }
}

export function providerError(provider, status) {
  const name = PROVIDERS[provider] ? PROVIDERS[provider].name : 'De fotobank';
  if (status === 401 || status === 403) return `De sleutel van ${name} in Vercel klopt niet (${PROVIDERS[provider] ? PROVIDERS[provider].env : 'sleutel'}), of het tegoed voor dit uur is op.`;
  if (status === 429) return `Even te veel zoekvragen bij ${name}. Probeer het over een kwartier opnieuw.`;
  return `${name} gaf een fout (${status}). Probeer het zo nog eens.`;
}
