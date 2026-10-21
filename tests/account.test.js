/* Tests voor het inloggen: js/shared/account.js (de deur), js/login.js (de inlogpagina),
   uploads/lib/team.js (de server laat alleen het team toe) en supabase/teambieb.sql */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const A = require('../js/shared/account.js');
const L = require('../js/login.js');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('de sessie telt alleen met een vernieuwsleutel en een e-mailadres', () => {
  const s = { access_token: 'a', refresh_token: 'r', user: { id: 'u', email: 'ashley@pureminds.nl' } };
  assert.deepEqual(A.readSession(JSON.stringify(s)), s);
  assert.equal(A.readSession(null), null);
  assert.equal(A.readSession('kapot{'), null);
  assert.equal(A.readSession(JSON.stringify({ ...s, refresh_token: '' })), null);
  assert.equal(A.readSession(JSON.stringify({ ...s, user: {} })), null);
});

test('een naam uit het e-mailadres (de teamlijst heeft het laatste woord)', () => {
  assert.equal(A.nameOf('ashley@pureminds.nl'), 'Ashley');
  assert.equal(A.nameOf('jan-willem.de.vries@pureminds.nl'), 'Jan Willem De Vries');
  assert.equal(A.nameOf(''), '');
});

test('terug na het inloggen: alleen een pad op deze site, nooit naar buiten', () => {
  assert.equal(A.safeBack('/Pure-Minds-Tool-Hub/tools/insta.html?bieb=abc#x'), '/Pure-Minds-Tool-Hub/tools/insta.html?bieb=abc#x');
  assert.equal(A.safeBack('//evil.example/x'), '');
  assert.equal(A.safeBack('https://evil.example/'), '');
  assert.equal(A.safeBack('/\\evil.example'), '');
  assert.equal(A.safeBack('javascript:alert(1)'), '');
  assert.equal(A.safeBack('/Pure-Minds-Tool-Hub/login.html?terug=x'), '', 'niet naar het inloggen zelf');
  assert.equal(A.safeBack(null), '');
});

test('een link uit een mail: soort, fout en of er een sessie in zit', () => {
  assert.deepEqual(L.hashInfo('#access_token=x&refresh_token=y&type=recovery'), { type: 'recovery', error: '', token: true });
  assert.deepEqual(L.hashInfo('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid'), { type: '', error: 'otp_expired', token: false });
  assert.deepEqual(L.hashInfo(''), { type: '', error: '', token: false });
});

test('fouten van Supabase in gewone taal', () => {
  assert.match(L.authError({ code: 'invalid_credentials', message: 'Invalid login credentials', status: 400 }), /passen niet bij elkaar/);
  assert.match(L.authError({ code: 'email_not_confirmed', status: 400 }), /nog niet bevestigd/);
  assert.match(L.authError({ message: 'Database error saving new user', status: 500 }, 'account'), /niet op de teamlijst/);
  assert.match(L.authError({ code: 'unexpected_failure', status: 500 }, 'account'), /niet op de teamlijst/, 'account maken met een adres buiten het team');
  assert.match(L.authError({ code: 'weak_password', status: 422 }), /minstens 10 tekens/);
  assert.match(L.authError({ code: 'over_email_send_rate_limit', status: 429 }), /te veel pogingen/);
  assert.match(L.authError({ code: 'email_address_not_authorized', status: 400 }), /mailserver/);
  assert.match(L.authError({ code: 'otp_expired' }), /verlopen of al gebruikt/);
  assert.match(L.authError({ name: 'AuthRetryableFetchError', message: 'Failed to fetch', status: 0 }), /Geen verbinding/);
  // Zo komt "niet op de teamlijst" in de browser binnen: supabase-js noemt het retryable
  assert.match(L.authError({ name: 'AuthRetryableFetchError', message: 'Database error saving new user', status: 500 }, 'account'), /niet op de teamlijst/);
  assert.match(L.authError({ message: 'iets onbekends' }), /Er ging iets mis.*iets onbekends/);
  assert.equal(L.authError(null), '');
  assert.equal(L.MIN_PASSWORD, 10);
  assert.match(read('scripts/setup-supabase.mjs'), /password_min_length: 10/, 'zelfde minimum in Supabase');
});

test('elke pagina van de hub heeft de deur als eerste script; openbare pagina\'s niet', () => {
  const pages = ['index.html', ...fs.readdirSync(path.join(root, 'tools')).filter((f) => f.endsWith('.html')).map((f) => `tools/${f}`)];
  for (const p of pages) {
    const html = read(p);
    const src = `${p.startsWith('tools/') ? '../' : ''}js/shared/account.js`;
    const at = html.indexOf(`<script src="${src}"></script>`);
    assert.ok(at > 0 && at < html.indexOf('</head>'), `${p}: deur in de <head>`);
    assert.equal(html.indexOf('<script'), at, `${p}: de deur is het eerste script`);
  }
  // De e-mailtemplate en de handtekeningen staan in verstuurde mails: die blijven openbaar
  const open = ['email/pure-minds-email.html', ...fs.readdirSync(path.join(root, 'handtekeningen')).filter((f) => f.endsWith('.html')).map((f) => `handtekeningen/${f}`)];
  for (const p of open) assert.ok(!read(p).includes('account.js'), `${p}: openbaar`);
  // De inlogpagina zelf: geen deur, wel de client
  const login = read('login.html');
  assert.match(login, /<html[^>]*data-page="login"/);
  assert.ok(login.indexOf('js/shared/account.js') < login.indexOf('js/login.js'));
});

test('supabase-js met een vaste versie en SRI-hash; alleen de publieke sleutel in de repo', () => {
  const src = read('js/shared/account.js');
  assert.match(src, /cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@\d+\.\d+\.\d+\/dist\/umd\/supabase\.js/);
  assert.match(src, /integrity: 'sha384-[A-Za-z0-9+/]{64}'/);
  assert.match(A.SUPABASE_KEY, /^sb_publishable_/);
  const files = ['js/shared/account.js', 'js/login.js', 'uploads/lib/team.js', 'scripts/setup-supabase.mjs', 'supabase/teambieb.sql', 'README.md', 'uploads/README.md'];
  for (const f of files) {
    const text = read(f);
    assert.ok(!/sb_secret_[A-Za-z0-9]/.test(text), `${f}: geen geheime sleutel`);
    assert.ok(!/sbp_[A-Za-z0-9]{20}/.test(text), `${f}: geen persoonlijk token`);
    assert.ok(!/xsmtpsib-[A-Za-z0-9]/.test(text), `${f}: geen SMTP-sleutel`);
    assert.ok(!/service_role/.test(text) || f === 'README.md', `${f}: geen service role`);
  }
  assert.ok(read('.gitignore').includes('.env*'), '.env.local blijft buiten de repo');
});

test('de database: alles achter Row Level Security, alleen voor het team, en de teamlijst niet in de repo', () => {
  const sql = read('supabase/teambieb.sql');
  for (const table of ['team', 'designs']) assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`), table);
  for (const cmd of ['select', 'insert', 'update', 'delete']) {
    assert.match(sql, new RegExp(`on public\\.designs\\s+for ${cmd} to authenticated`), `designs: ${cmd}`);
    assert.match(sql, new RegExp(`on storage\\.objects\\s+for ${cmd} to authenticated`), `bestanden: ${cmd}`);
  }
  assert.ok(!/\bto (anon|public)\b/.test(sql.replace(/grant execute on function public\.ping\(\) to anon, authenticated;/, '')), 'niets voor wie niet ingelogd is (behalve ping)');
  assert.match(sql, /before insert on auth\.users/, 'alleen de teamlijst kan een account maken');
  assert.match(sql, /values \('designs', 'designs', false/, 'de bestanden zijn niet openbaar');
  assert.ok(!/@pureminds\.nl'/.test(sql.replace(/-- .*$/gm, '')), 'de teamlijst staat in de database, niet hier');
  assert.match(sql, /security definer set search_path = ''/);
});

test('de server: alleen een ingelogde collega van de teamlijst', async () => {
  const T = await import(pathToFileURL(path.join(root, 'uploads/lib/team.js')).href);
  const now = Date.UTC(2026, 9, 21, 12);
  const jwt = (exp) => `x.${Buffer.from(JSON.stringify({ exp: Math.floor(exp / 1000) })).toString('base64url')}.y`;
  const good = jwt(now + 3600e3);
  assert.equal(T.bearer(`Bearer ${good}`), good);
  assert.equal(T.bearer('Basic abc'), '');
  assert.equal(T.bearer('Bearer a b'), '');
  assert.equal(T.tokenExpiry(good), Math.floor((now + 3600e3) / 1000) * 1000);
  assert.equal(T.tokenExpiry('kapot'), 0);

  const calls = [];
  const fake = (answer, status = 200) => async (url, init) => {
    calls.push({ url, init });
    return { ok: status < 300, status, json: async () => answer };
  };
  const env = {};
  assert.equal((await T.checkLogin('', { env, fetchImpl: fake(true), now })).status, 401, 'zonder bewijs');
  assert.equal((await T.checkLogin(`Bearer ${jwt(now - 1000)}`, { env, fetchImpl: fake(true), now })).status, 401, 'verlopen');
  assert.equal((await T.checkLogin(`Bearer ${good}`, { env, fetchImpl: fake(false), now })).status, 403, 'niet op de teamlijst');
  assert.equal((await T.checkLogin(`Bearer ${good}`, { env, fetchImpl: fake({}, 401), now })).status, 401, 'Supabase kent het bewijs niet');
  assert.equal((await T.checkLogin(`Bearer ${good}`, { env, fetchImpl: async () => { throw new Error('weg'); }, now })).status, 503);

  calls.length = 0;
  const remember = new Map();
  assert.deepEqual(await T.checkLogin(`Bearer ${good}`, { env, fetchImpl: fake(true), now, remember }), { ok: true });
  assert.equal(calls[0].url, 'https://ilijpnuajxzbzkffaipm.supabase.co/rest/v1/rpc/is_team_member');
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${good}`);
  assert.match(calls[0].init.headers.apikey, /^sb_publishable_/);
  assert.deepEqual(await T.checkLogin(`Bearer ${good}`, { env, fetchImpl: fake(false), now: now + 60e3, remember }), { ok: true }, 'vijf minuten onthouden');
  assert.equal(calls.length, 1);
  assert.equal((await T.checkLogin(`Bearer ${good}`, { env, fetchImpl: fake(false), now: now + 6 * 60e3, remember })).status, 403, 'daarna opnieuw vragen');

  for (const api of ['generate', 'upload', 'photos']) assert.match(read(`uploads/api/${api}.js`), /checkLogin\(request\.headers\.get\('authorization'\), \{ remember \}\)/, api);
  assert.match(read('js/shared/service.js'), /Authorization: `Bearer \$\{token\}`/, 'de hub stuurt het bewijs mee');
  const cfg = JSON.parse(read('uploads/vercel.json'));
  assert.deepEqual(cfg.crons, [{ path: '/api/keepalive', schedule: '0 6 * * *' }], 'Supabase dagelijks wakker houden');
});
