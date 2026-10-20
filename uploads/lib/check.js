/* =============================================================================
   check.js — de controles van de upload-service, zonder Vercel (getest in
   tests/newsletter.test.js)
   -----------------------------------------------------------------------------
   Wat mag erin: alleen JPG en PNG, hoogstens 4 MB, en alleen vanaf de Tool
   Hub (of je eigen computer bij het testen). Een wachtwoord is optioneel: staat
   APP_PASSWORD in Vercel, dan moet het mee; anders niet. Een bestand moet ook
   echt een JPG of PNG zijn: de eerste bytes tellen, niet alleen wat de browser
   zegt.
   ============================================================================= */
import { createHash, timingSafeEqual } from 'node:crypto';

export const MAX_BYTES = 4 * 1024 * 1024;
export const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png' };

// De Tool Hub op GitHub Pages, en localhost om te testen
const ORIGINS = [/^https:\/\/puremindsmarketinggroup\.github\.io$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];
export const allowedOrigin = (origin) => !!origin && ORIGINS.some((re) => re.test(origin));

export function corsHeaders(origin) {
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, x-app-password, x-file-name',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
  if (allowedOrigin(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

// Wachtwoord vergelijken in vaste tijd (via een hash, dan zijn de lengtes gelijk)
export function passwordOk(given, expected) {
  if (!expected || typeof given !== 'string' || !given) return false;
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(String(expected)).digest();
  return timingSafeEqual(a, b);
}

// Is het echt een JPG of PNG? De eerste bytes van het bestand
export function sniff(bytes) {
  if (!bytes || bytes.length < 8) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.every((b, i) => bytes[i] === b)) return 'image/png';
  return null;
}

// Alleen de herkomst en het wachtwoord (als dat is ingesteld): voor de AI en het zoeken van foto's
export function checkOrigin({ origin, password, expected }) {
  if (origin && !allowedOrigin(origin)) return { ok: false, status: 403, error: 'Dit kan alleen vanuit de Tool Hub.' };
  if (expected) {
    if (!passwordOk(password, expected)) return { ok: false, status: 401, error: 'Het wachtwoord klopt niet.' };
  } else if (!origin) {
    return { ok: false, status: 403, error: 'Dit kan alleen vanuit de Tool Hub.' };
  }
  return { ok: true };
}

// Vóór het lezen van het bestand: herkomst, wachtwoord (als dat is ingesteld), soort en grootte.
// Zonder wachtwoord moet het verzoek uit de Tool Hub komen (een browser stuurt Origin altijd mee)
export function checkRequest({ origin, password, expected, type, length }) {
  if (origin && !allowedOrigin(origin)) return { ok: false, status: 403, error: 'Dit kan alleen vanuit de Tool Hub.' };
  if (expected) {
    if (!passwordOk(password, expected)) return { ok: false, status: 401, error: 'Het wachtwoord klopt niet.' };
  } else if (!origin) {
    return { ok: false, status: 403, error: 'Dit kan alleen vanuit de Tool Hub.' };
  }
  const clean = String(type || '').split(';')[0].trim().toLowerCase();
  if (!TYPES[clean]) return { ok: false, status: 415, error: 'Alleen JPG en PNG.' };
  if (length > MAX_BYTES) return { ok: false, status: 413, error: 'Het bestand is groter dan 4 MB.' };
  return { ok: true, type: clean };
}

// Na het lezen: klopt de inhoud met de soort?
export function checkBody(bytes, type) {
  if (!bytes || !bytes.length) return { ok: false, status: 400, error: 'Er kwam geen bestand mee.' };
  if (bytes.length > MAX_BYTES) return { ok: false, status: 413, error: 'Het bestand is groter dan 4 MB.' };
  if (sniff(bytes) !== type) return { ok: false, status: 415, error: 'Dit bestand is geen echte JPG of PNG.' };
  return { ok: true };
}

// Bestandsnaam zonder vreemde tekens, kort: "Team overleg (1).JPG" -> "team-overleg-1"
export function slug(name) {
  const base = String(name || '').replace(/\.[a-z0-9]{2,5}$/i, '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
  return base || 'afbeelding';
}

// Pad in de Blob-opslag: nieuwsbrief/2026-10/team-overleg.jpg (Vercel zet er een willekeurig stuk achter)
export function blobPath(name, type, date = new Date()) {
  const month = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  return `nieuwsbrief/${month}/${slug(name)}.${TYPES[type] || 'jpg'}`;
}

// Hoogstens zoveel uploads per adres per kwartier (per server-instantie; een rem, geen slot)
export function rateLimiter({ limit = 60, windowMs = 15 * 60 * 1000 } = {}) {
  const hits = new Map();
  return (key, now = Date.now()) => {
    const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (list.length >= limit) {
      hits.set(key, list);
      return false;
    }
    list.push(now);
    hits.set(key, list);
    if (hits.size > 5000) hits.clear();
    return true;
  };
}
