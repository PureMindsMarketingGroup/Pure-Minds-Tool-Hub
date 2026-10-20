/* =============================================================================
   photos.js — foto's zoeken bij Pexels (getest in tests/ai.test.js, zonder netwerk)
   -----------------------------------------------------------------------------
   Pexels is een fotobank met een gratis licentie, ook voor zakelijk gebruik,
   zonder dat je de fotograaf in je post of mail hoeft te noemen
   (https://www.pexels.com/license/). Geen willekeurige foto's van internet:
   daar zit bijna altijd auteursrecht op.

   De server zoekt (de sleutel PEXELS_API_KEY blijft in Vercel); de browser
   haalt de foto daarna zelf op van images.pexels.com (die staat dat toe).

     searchUrl({ q, orientation, n, locale })   adres van de zoekvraag
     mapResults(json)                            [{ id, w, h, alt, color, photographer,
                                                    photographerUrl, pexelsUrl, thumb, original }]
     checkQuery(params)                          { ok, q, orientation, n, locale } of { ok: false, status, error }
   ============================================================================= */

export const ORIENTATIONS = ['landscape', 'portrait', 'square'];
export const LOCALES = ['en-US', 'nl-NL'];

export function checkQuery(params) {
  const q = String(params.get('q') || '').replace(/\s+/g, ' ').trim();
  if (q.length < 2) return { ok: false, status: 400, error: 'Typ waar de foto over moet gaan.' };
  if (q.length > 100) return { ok: false, status: 400, error: 'Die zoekvraag is te lang.' };
  const orientation = ORIENTATIONS.includes(params.get('orientation')) ? params.get('orientation') : '';
  const n = Math.min(24, Math.max(1, parseInt(params.get('n'), 10) || 12));
  const locale = LOCALES.includes(params.get('locale')) ? params.get('locale') : 'en-US';
  return { ok: true, q, orientation, n, locale };
}

export function searchUrl({ q, orientation, n, locale }) {
  const u = new URL('https://api.pexels.com/v1/search');
  u.searchParams.set('query', q);
  u.searchParams.set('per_page', String(n));
  if (orientation) u.searchParams.set('orientation', orientation);
  if (locale) u.searchParams.set('locale', locale);
  return u.toString();
}

// Alleen foto's van images.pexels.com: daar haalt de browser ze straks op
const pexelsImage = (u) => {
  try {
    const url = new URL(u);
    return url.protocol === 'https:' && url.hostname === 'images.pexels.com' ? `${url.origin}${url.pathname}` : '';
  } catch (err) {
    return '';
  }
};

export function mapResults(json) {
  const list = json && Array.isArray(json.photos) ? json.photos : [];
  return list.map((p) => {
    const original = pexelsImage(p && p.src && p.src.original);
    if (!original) return null;
    return {
      id: p.id,
      w: p.width,
      h: p.height,
      alt: String(p.alt || '').slice(0, 200),
      color: /^#[0-9a-f]{6}$/i.test(p.avg_color || '') ? p.avg_color : '#c9d3db',
      photographer: String(p.photographer || '').slice(0, 80),
      photographerUrl: /^https:\/\/www\.pexels\.com\//.test(p.photographer_url || '') ? p.photographer_url : 'https://www.pexels.com/',
      pexelsUrl: /^https:\/\/www\.pexels\.com\//.test(p.url || '') ? p.url : 'https://www.pexels.com/',
      thumb: `${original}?auto=compress&cs=tinysrgb&w=400`,
      original,
    };
  }).filter(Boolean);
}

export function pexelsError(status) {
  if (status === 401 || status === 403) return 'De sleutel van Pexels in Vercel klopt niet (PEXELS_API_KEY).';
  if (status === 429) return 'Even te veel zoekvragen bij Pexels. Probeer het over een kwartier opnieuw.';
  return `Pexels gaf een fout (${status}). Probeer het zo nog eens.`;
}
