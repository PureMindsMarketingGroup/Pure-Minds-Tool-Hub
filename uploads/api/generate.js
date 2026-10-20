/* =============================================================================
   api/generate.js — ruwe content naar een presentatie, post of e-mail (Claude)
   -----------------------------------------------------------------------------
     GET  /api/generate   staat de AI klaar? { ok, ai, password, prompts }
     POST /api/generate   JSON { format, mode, content, wish?, instruction?, current?, target? }
                          -> { data, usage } of { error }

   Zelfde Vercel-project als de uploads: alleen vanaf de Tool Hub, en een
   wachtwoord (x-app-password) alleen als APP_PASSWORD in Vercel staat. De sleutel
   van Anthropic staat alleen in Vercel (ANTHROPIC_API_KEY), net als de prompts
   (AI_PROMPT, AI_PROMPT_PRESENTATIE, AI_PROMPT_INSTA, AI_PROMPT_EMAIL). Het
   schema en de technische regels staan in lib/ai.js. Een grote presentatie kan
   een minuut of twee duren; vercel.json geeft deze functie 300 seconden.
   ============================================================================= */
import { corsHeaders, checkOrigin, rateLimiter } from '../lib/check.js';
import { FORMATS, checkInput, buildRequest, followUp, hasToolCall, readResponse, apiError } from '../lib/ai.js';

const limit = rateLimiter({ limit: 40, windowMs: 15 * 60 * 1000 });
const MAX_BODY = 400 * 1024;

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export function OPTIONS(request) {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('origin')) });
}

export function GET(request) {
  const env = process.env;
  return json({
    ok: true,
    ai: !!env.ANTHROPIC_API_KEY,
    password: !!env.APP_PASSWORD,
    prompts: ['AI_PROMPT', 'AI_PROMPT_PRESENTATIE', 'AI_PROMPT_INSTA', 'AI_PROMPT_EMAIL'].filter((k) => !!env[k]),
  }, 200, corsHeaders(request.headers.get('origin')));
}

export async function POST(request) {
  const origin = request.headers.get('origin');
  const headers = corsHeaders(origin);
  const verdict = checkOrigin({ origin, password: request.headers.get('x-app-password'), expected: process.env.APP_PASSWORD });
  if (!verdict.ok) return json({ error: verdict.error }, verdict.status, headers);
  if (!/^application\/json/i.test(request.headers.get('content-type') || '')) return json({ error: 'Stuur JSON.' }, 415, headers);
  if (!process.env.ANTHROPIC_API_KEY) return json({ error: 'De AI staat nog niet aan: ANTHROPIC_API_KEY ontbreekt in Vercel.' }, 500, headers);

  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'onbekend';
  if (!limit(ip)) return json({ error: 'Even te veel verzoeken achter elkaar. Probeer het over een kwartier opnieuw.' }, 429, headers);

  const raw = await request.text();
  if (raw.length > MAX_BODY) return json({ error: 'Je verzoek is te groot.' }, 413, headers);
  let input;
  try {
    input = JSON.parse(raw);
  } catch (err) {
    return json({ error: 'Dit verzoek is geen geldige JSON.' }, 400, headers);
  }
  const checked = checkInput(input);
  if (!checked.ok) return json({ error: checked.error }, checked.status, headers);

  const body = buildRequest(input, process.env);
  const tool = body.tools[0].name;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 280 * 1000);
  const ask = async (payload) => {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    return { res, answer: await res.json().catch(() => ({})) };
  };
  try {
    let { res, answer } = await ask(body);
    // Tekst in plaats van de tool (zelden): één keer opnieuw vragen, in hetzelfde gesprek
    if (res.ok && !hasToolCall(answer, tool) && answer.stop_reason !== 'max_tokens') {
      console.warn('geen tool-aanroep, tweede poging');
      ({ res, answer } = await ask(followUp(body, answer)));
    }
    if (!res.ok) {
      console.error('anthropic', res.status, JSON.stringify(answer).slice(0, 500));
      return json({ error: apiError(res.status) }, 502, headers);
    }
    const out = readResponse(answer, tool);
    if (out.error) return json({ error: out.error }, 502, headers);
    return json({ data: out.data, format: input.format, scoped: Number.isInteger(input.target), usage: answer.usage || null, model: answer.model || body.model }, 200, headers);
  } catch (err) {
    if (err && err.name === 'AbortError') return json({ error: 'De AI deed er te lang over. Probeer minder content tegelijk.' }, 504, headers);
    console.error('generate mislukt', err);
    return json({ error: 'De AI is niet bereikbaar. Probeer het zo nog eens.' }, 502, headers);
  } finally {
    clearTimeout(timer);
  }
}

export { FORMATS };
