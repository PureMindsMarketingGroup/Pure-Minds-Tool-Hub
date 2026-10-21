/* =============================================================================
   api/upload.js — foto's en iconen uit de Nieuwsbrief Maker online zetten
   -----------------------------------------------------------------------------
   De maker stuurt een JPG of PNG (al verkleind tot 1200 px breed). Deze
   functie zet hem in Vercel Blob en geeft de vaste, openbare link terug: die
   komt in de HTML voor Brevo. Alleen vanaf de Tool Hub, en alleen voor een
   ingelogde collega van de teamlijst (lib/team.js).

     GET  /api/upload   staat de service klaar? { ok, blob }
     POST /api/upload   body = het bestand; koppen content-type, x-file-name en
                        authorization (het inlogbewijs) -> { url } of { error }

   Instellen in Vercel: zie uploads/README.md. Nodig: een Blob-opslag
   (BLOB_READ_WRITE_TOKEN zet Vercel zelf).
   ============================================================================= */
import { put } from '@vercel/blob';
import { corsHeaders, checkRequest, checkBody, blobPath, rateLimiter } from '../lib/check.js';
import { checkLogin } from '../lib/team.js';

const limit = rateLimiter();
const remember = new Map();   // inlogbewijzen die net goed waren

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export function OPTIONS(request) {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('origin')) });
}

// Status voor de maker: verklapt niets, zegt alleen of alles is ingesteld
export function GET(request) {
  return json({
    ok: true,
    blob: !!process.env.BLOB_READ_WRITE_TOKEN,
  }, 200, corsHeaders(request.headers.get('origin')));
}

export async function POST(request) {
  const origin = request.headers.get('origin');
  const headers = corsHeaders(origin);
  const verdict = checkRequest({
    origin,
    type: request.headers.get('content-type'),
    length: Number(request.headers.get('content-length') || 0),
  });
  if (!verdict.ok) return json({ error: verdict.error }, verdict.status, headers);
  const login = await checkLogin(request.headers.get('authorization'), { remember });
  if (!login.ok) return json({ error: login.error }, login.status, headers);

  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'onbekend';
  if (!limit(ip)) return json({ error: 'Even te veel uploads achter elkaar. Probeer het over een kwartier opnieuw.' }, 429, headers);

  const bytes = Buffer.from(await request.arrayBuffer());
  const body = checkBody(bytes, verdict.type);
  if (!body.ok) return json({ error: body.error }, body.status, headers);

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return json({ error: 'De upload-service heeft nog geen Blob-opslag (Storage > Blob in Vercel).' }, 500, headers);
  }
  try {
    const blob = await put(blobPath(request.headers.get('x-file-name'), verdict.type), bytes, {
      access: 'public',
      contentType: verdict.type,
      addRandomSuffix: true,
      cacheControlMaxAge: 60 * 60 * 24 * 365,
    });
    return json({ url: blob.url }, 200, headers);
  } catch (err) {
    console.error('upload mislukt', err);
    return json({ error: 'Opslaan in Vercel Blob lukte niet. Probeer het zo nog eens.' }, 502, headers);
  }
}
