/* =============================================================================
   api/keepalive.js — Supabase wakker houden
   -----------------------------------------------------------------------------
   Een gratis Supabase-project slaapt na 7 dagen zonder verkeer; dan kan
   niemand inloggen tot iemand het in Supabase weer aanzet. Vercel roept dit
   elke ochtend aan (crons in vercel.json), ook in de vakantie. Het vraagt
   alleen public.ping() (supabase/teambieb.sql) en verklapt niets.

     GET /api/keepalive   -> { ok }
   ============================================================================= */
import { SUPABASE_URL, SUPABASE_KEY } from '../lib/team.js';

export async function GET() {
  const url = String(process.env.SUPABASE_URL || SUPABASE_URL).replace(/\/+$/, '');
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || SUPABASE_KEY;
  try {
    const res = await fetch(`${url}/rest/v1/rpc/ping`, {
      method: 'POST',
      headers: { apikey: key, 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!res.ok) console.error('supabase ping', res.status);
    return Response.json({ ok: res.ok }, { status: res.ok ? 200 : 502, headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('supabase ping mislukt', err);
    return Response.json({ ok: false }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
