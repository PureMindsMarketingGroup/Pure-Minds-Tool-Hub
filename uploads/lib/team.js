/* =============================================================================
   team.js — wie mag de server gebruiken? Alleen een ingelogde collega van de
   teamlijst (getest in tests/account.test.js)
   -----------------------------------------------------------------------------
   De hub stuurt het inlogbewijs van Supabase mee (Authorization: Bearer …, zie
   js/shared/service.js). Deze server vraagt Supabase of dat bewijs geldt en of
   die collega op de teamlijst staat (rpc is_team_member, supabase/teambieb.sql).
   Een goed antwoord onthouden we hoogstens vijf minuten (en nooit langer dan
   het bewijs geldt), zodat niet elk verzoek op Supabase hoeft te wachten.

   Het adres en de publieke sleutel van Supabase zijn openbaar (ze staan ook in
   js/shared/account.js): zonder inlogbewijs geven ze nergens toegang toe.
   SUPABASE_URL en SUPABASE_PUBLISHABLE_KEY in Vercel gaan voor, als ze er staan.
   ============================================================================= */
export const SUPABASE_URL = 'https://ilijpnuajxzbzkffaipm.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_Qz4Oi1DvGlG0sBZI64vHYA_4Hinzd1l';
const REMEMBER = 5 * 60 * 1000;

// "Bearer eyJ…" -> "eyJ…" (alleen tekens die in een JWT horen)
export function bearer(header) {
  const m = /^Bearer\s+([A-Za-z0-9._~+/=-]+)$/i.exec(String(header || '').trim());
  return m ? m[1] : '';
}

// Tot wanneer het bewijs geldt (ms), uit het bewijs zelf; Supabase controleert de handtekening
export function tokenExpiry(token) {
  try {
    const payload = JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString('utf8'));
    return Number(payload.exp) > 0 ? Number(payload.exp) * 1000 : 0;
  } catch (err) {
    return 0;
  }
}

/**
 * Hoort het bewijs bij een collega van de teamlijst? { ok } of { ok: false, status, error }.
 * remember: een Map (token -> geldig tot), per server-instantie.
 */
export async function checkLogin(header, { env = process.env, fetchImpl = fetch, now = Date.now(), remember } = {}) {
  const token = bearer(header);
  if (!token) return { ok: false, status: 401, error: 'Log in bij de Tool Hub om dit te gebruiken.' };
  const expires = tokenExpiry(token);
  if (expires && expires <= now) return { ok: false, status: 401, error: 'Je inlog is verlopen. Ververs de pagina en probeer het opnieuw.' };
  if (remember && remember.get(token) > now) return { ok: true };

  const url = String(env.SUPABASE_URL || SUPABASE_URL).replace(/\/+$/, '');
  const key = env.SUPABASE_PUBLISHABLE_KEY || SUPABASE_KEY;
  let res;
  try {
    res = await fetchImpl(`${url}/rest/v1/rpc/is_team_member`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
  } catch (err) {
    return { ok: false, status: 503, error: 'De inlogcontrole is even niet bereikbaar. Probeer het zo nog eens.' };
  }
  if (res.status === 401 || res.status === 403) return { ok: false, status: 401, error: 'Je inlog is verlopen. Ververs de pagina en probeer het opnieuw.' };
  if (!res.ok) return { ok: false, status: 503, error: 'De inlogcontrole is even niet bereikbaar. Probeer het zo nog eens.' };
  const member = await res.json().catch(() => false);
  if (member !== true) return { ok: false, status: 403, error: 'Dit account staat niet op de teamlijst van de Tool Hub.' };
  if (remember) {
    if (remember.size > 2000) remember.clear();
    remember.set(token, Math.min(now + REMEMBER, expires || now + REMEMBER));
  }
  return { ok: true };
}
