/* Tests voor de bieb: js/shared/designs.js (de ontwerpen in de cloud) en js/shared/library.js
   (vanzelf opslaan in een maker), met een nep-cloud in plaats van Supabase */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const D = require('../js/shared/designs.js');
const L = require('../js/shared/library.js');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const DAY = 864e5;
const NOW = new Date(2026, 9, 26, 15, 0).getTime();

/* ---------------------------------------------------------------------------
   Rekenwerk
   ------------------------------------------------------------------------- */

test('een regel uit Supabase wordt een ontwerp: eigen naam boven de titel uit de inhoud', () => {
  const row = {
    id: 'abc-123', tool: 'presentation', slot: 'voorstel', name: null, title: 'Voorstel **Bakkerij**', sub: 'voorstel · 9 slides', noun: 'voorstel',
    ratio: '16 / 9', files: ['slide:a'], created_at: '2026-10-21T10:00:00+00:00', created_by: 'u1', created_by_name: 'Jim',
    updated_at: '2026-10-21T13:05:12.123456+00:00', updated_by: 'u2', updated_by_name: 'Ashley', deleted_at: null,
  };
  const e = D.fromRow(row);
  assert.equal(e.title, 'Voorstel Bakkerij');
  assert.equal(e.auto, 'Voorstel Bakkerij');
  assert.equal(e.savedAt, Date.UTC(2026, 9, 21, 13, 5, 12, 123));
  assert.equal(e.rev, row.updated_at);
  assert.deepEqual([e.by, e.byId, e.createdBy, e.createdById], ['Ashley', 'u2', 'Jim', 'u1']);
  assert.equal(e.deletedAt, 0);
  const named = D.fromRow({ ...row, name: 'Flexiforum Live (definitief)' });
  assert.equal(named.title, 'Flexiforum Live (definitief)');
  assert.equal(named.auto, 'Voorstel Bakkerij', 'de titel uit de inhoud blijft bekend');
  assert.equal(D.fromRow({ ...row, title: '', files: null }).title, 'Zonder titel');
  assert.ok(D.fromRow({ ...row, deleted_at: '2026-10-22T08:00:00+00:00' }).deletedAt > 0);
});

test('bestanden van een ontwerp: <id>/<sleutel> met alleen veilige tekens', () => {
  assert.equal(D.filePath('abc', 'insta:photo:x1'), 'abc/insta_photo_x1');
  assert.equal(D.filePath('abc', '../../geheim'), 'abc/.._.._geheim');
  assert.ok(!D.filePath('abc', 'a/b').slice(4).includes('/'), 'blijft in de map van het ontwerp');
});

test('heeft iemand het ontwerp intussen opgeslagen? alleen als we weten welke versie je had', () => {
  const row = { updated_at: '2026-10-21T13:05:12+00:00' };
  assert.equal(D.changedSince({ rev: '2026-10-21T13:05:12+00:00' }, row), false);
  assert.equal(D.changedSince({ rev: '2026-10-21T12:00:00+00:00' }, row), true);
  assert.equal(D.changedSince({ rev: null }, row), false);
  assert.equal(D.changedSince(null, row), false);
});

test('wie het bewerkte en wie het nu open heeft', () => {
  assert.equal(D.byWho({ by: 'Ashley', byId: 'u1' }, 'u1'), 'jou');
  assert.equal(D.byWho({ by: 'Ashley', byId: 'u1' }, 'u2'), 'Ashley');
  assert.equal(D.byWho({ by: '' }, 'u1'), '');
  const open = { editingBy: 'u2', editingName: 'Jim', editingAt: NOW - 30e3 };
  assert.equal(D.openBy(open, 'u1', NOW), 'Jim');
  assert.equal(D.openBy(open, 'u2', NOW), '', 'jijzelf telt niet');
  assert.equal(D.openBy({ ...open, editingAt: NOW - 5 * 60e3 }, 'u1', NOW), '', 'te lang geleden: niet meer open');
});

test('wanneer bewerkt: vandaag en gisteren met de tijd, daarna dagen, dan de datum', () => {
  assert.equal(D.editedText(NOW - 60e3, NOW, 'Ashley'), 'bewerkt vandaag om 14:59 door Ashley');
  assert.equal(D.editedText(new Date(2026, 9, 25, 9, 5).getTime(), NOW), 'bewerkt gisteren om 9:05');
  assert.equal(D.editedText(NOW - 3 * DAY, NOW, 'jou'), 'bewerkt 3 dagen geleden door jou');
  assert.equal(D.editedText(new Date(2026, 9, 12, 10, 0).getTime(), NOW), 'bewerkt op 12 oktober');
  assert.equal(D.editedText(new Date(2025, 11, 30, 10, 0).getTime(), NOW), 'bewerkt op 30 december 2025');
});

test('de prullenbak: 30 dagen', () => {
  assert.equal(D.TRASH_DAYS, 30);
  assert.equal(D.trashLeft({ deletedAt: NOW }, NOW), 30);
  assert.equal(D.trashLeft({ deletedAt: NOW - 29.5 * DAY }, NOW), 1);
  assert.equal(D.trashLeft({ deletedAt: NOW - 40 * DAY }, NOW), 0);
});

test('zoeken: elk woord ergens, zonder accenten of hoofdletters', () => {
  const e = { title: 'Groeien met online marketing', auto: 'Groeien met online marketing', sub: 'presentatie · 12 slides', noun: 'presentatie', by: 'Jim', createdBy: 'Jim' };
  assert.ok(D.matches(e, ''));
  assert.ok(D.matches(e, 'online jim'));
  assert.ok(D.matches({ ...e, title: 'Café Flexiforum' }, 'cafe'));
  assert.ok(!D.matches(e, 'voorstel'));
  assert.equal(D.cleanTitle('Onze nieuwe **Google Ads-audit**  is live'), 'Onze nieuwe Google Ads-audit is live');
});

test('wat de knop rechtsboven zegt, en wachten na een mislukte poging', () => {
  assert.equal(L.statusText('klaar', false).label, 'opgeslagen');
  assert.equal(L.statusText('klaar', true).label, 'opslaan…');
  assert.equal(L.statusText('bezig', false).label, 'opslaan…');
  assert.equal(L.statusText('offline', true).label, 'offline');
  assert.match(L.statusText('offline', true).title, /in deze browser/);
  assert.equal(L.statusText('fout', false).label, 'niet opgeslagen');
  assert.deepEqual([1, 2, 3, 6, 10].map(L.retryDelay), [3000, 6000, 12000, 60000, 60000]);
  assert.ok(L.DELAY <= 2000 && L.MAX_WAIT <= 10000, 'binnen een paar seconden in de cloud');
});

/* ---------------------------------------------------------------------------
   Vanzelf opslaan, met een nep-cloud
   ------------------------------------------------------------------------- */

function setup({ draft = null } = {}) {
  const calls = [];
  const toasts = [];
  const rows = new Map();
  let n = 0;
  let r = 0;
  let offline = false;
  const memory = new Map(draft ? [['pm-test-v1', draft]] : []);
  const fake = {
    newId: () => `id${++n}`,
    meId: () => 'me',
    async create(f) {
      if (offline) throw new Error('Failed to fetch');
      calls.push(['create', f.id, f.state.title, f.name || null]);
      const row = { ...f, updated_at: `r${++r}`, updated_by: 'me', updated_by_name: 'Jelger' };
      rows.set(f.id, row);
      return row;
    },
    async update(id, rev, f) {
      if (offline) throw new Error('Failed to fetch');
      calls.push(['update', id, f.state.title]);
      const row = rows.get(id);
      if (!row || row.deleted_at || (rev && row.updated_at !== rev)) return { conflict: row || null };
      Object.assign(row, f, { updated_at: `r${++r}` });
      return { row };
    },
    async get(id) { return rows.get(id) || null; },
    async putFile() {}, async getFile() { return null; }, async copyFile() { return true; },
    list: () => [], status: () => 'klaar', thumbs: async () => new Map(), refresh: async () => [], age: () => 0,
    here: async () => null, leave() {}, offline: (e) => /fetch/.test(e.message), reason: (e) => e.message,
    fromRow: (row) => ({ ...row, by: row.updated_by_name, byId: row.updated_by, deletedAt: row.deleted_at ? 1 : 0, deletedBy: row.deleted_by_name || '' }),
    cleanTitle: (t) => String(t || '').trim(), byWho: () => '', openBy: () => '', editedText: () => '', matches: () => true,
  };
  const ctx = {
    PM_TOOLS: [{ id: 'test', draft: { key: 'pm-test-v1', summary: (s) => ({ title: s.title, noun: 'ontwerp' }) } }],
    PM: {
      designs: fake,
      store: {
        get: (k, f = null) => (memory.has(k) ? JSON.parse(memory.get(k)) : f),
        set: (k, v) => { memory.set(k, JSON.stringify(v)); return true; },
        remove: (k) => memory.delete(k),
      },
      idb: { get: async () => null, set: async () => {}, del: async () => {} },
      esc: (s) => String(s),
      url: (p) => p,
      toast: (msg) => toasts.push(msg),
      account: { current: () => ({ id: 'me', name: 'Jelger' }) },
    },
    document: {
      querySelector: () => null, getElementById: () => null, addEventListener() {}, createElement: () => ({}),
      visibilityState: 'visible',
    },
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0,
    addEventListener() {}, innerWidth: 1200, innerHeight: 800,
  };
  if (draft) ctx.PM.store.set('pm-test-v1', draft);
  ctx.window = ctx;
  vm.runInNewContext(read('js/shared/library.js'), ctx);
  let state = { title: 'Leeg' };
  const lib = ctx.PM.library.attach({
    tool: 'test',
    getState: () => state,
    fileKeys: () => [],
    async apply(saved) { state = saved; },
    ...(draft ? { fresh: draft } : {}),
  });
  return {
    lib, calls, toasts, rows, memory,
    set(title) { state = { title }; },
    get state() { return state; },
    offline(v) { offline = v; },
    current: () => JSON.parse(memory.get('pm-library-current-v1') || '{}').test,
  };
}

test('elke wijziging gaat vanzelf de bieb in: eerst als nieuw ontwerp, daarna eroverheen', async () => {
  const t = setup();
  t.set('Eerste versie');
  t.lib.touch();
  assert.equal(t.lib.isDirty(), true);
  await t.lib.flush();
  assert.deepEqual(t.calls, [['create', 'id1', 'Eerste versie', null]]);
  assert.equal(t.lib.isDirty(), false);
  assert.equal(t.current().id, 'id1');
  t.set('Tweede versie');
  t.lib.touch();
  t.set('Derde versie');
  t.lib.touch();
  await t.lib.flush();
  assert.deepEqual(t.calls.slice(1), [['update', 'id1', 'Derde versie']], 'twee wijzigingen kort na elkaar: één keer opslaan, de laatste');
  assert.equal(t.rows.get('id1').state.title, 'Derde versie');
});

test('een leeg nieuw ontwerp en wisselen tellen niet; nieuw beginnen bewaart eerst het vorige', async () => {
  const t = setup();
  t.lib.hold(() => t.set('Alleen gewisseld'));
  await t.lib.flush();
  assert.deepEqual(t.calls, [], 'hold: geen wijziging');
  t.set('Mijn voorstel');
  t.lib.touch();
  // Meteen op "nieuw", nog voor het wegschrijven: het voorstel gaat naar zijn eigen ontwerp
  const prev = t.lib.detach();
  t.lib.hold(() => t.set('Leeg, nieuw'));
  await t.lib.flush();
  assert.deepEqual(t.calls, [['create', 'id1', 'Mijn voorstel', null]]);
  assert.equal(prev.id, null, 'het vorige had nog geen id op het moment van nieuw');
  assert.equal(t.current().id, null, 'het nieuwe, lege ontwerp staat nog niet in de bieb');
  assert.equal(t.current().blank, true);
  // Nog een keer nieuw op een leeg ontwerp: niets bewaren
  t.lib.detach();
  await t.lib.flush();
  assert.equal(t.calls.length, 1);
  // De eerste echte wijziging: een nieuw ontwerp
  t.set('Tweede ontwerp');
  t.lib.touch();
  await t.lib.flush();
  assert.deepEqual(t.calls[1], ['create', 'id2', 'Tweede ontwerp', null]);
  assert.equal(t.rows.get('id1').state.title, 'Mijn voorstel', 'het eerste is niet overschreven');
});

test('een collega sloeg intussen op: niets overschrijven, jouw versie wordt een kopie', async () => {
  const t = setup();
  t.set('Van mij');
  t.lib.touch();
  await t.lib.flush();
  Object.assign(t.rows.get('id1'), { updated_at: 'van-ashley', updated_by: 'u2', updated_by_name: 'Ashley', state: { title: 'Van Ashley' } });
  t.set('Van mij, aangepast');
  t.lib.touch();
  await t.lib.flush();
  assert.equal(t.rows.get('id1').state.title, 'Van Ashley', 'de versie van Ashley blijft staan');
  assert.deepEqual(t.calls.at(-1), ['create', 'id2', 'Van mij, aangepast', 'Van mij, aangepast (jouw versie)']);
  assert.equal(t.current().id, 'id2', 'je werkt verder in je eigen versie');
  assert.match(t.toasts.at(-1), /Ashley heeft dit ontwerp intussen ook aangepast/);
});

test('in de prullenbak gezet terwijl je werkt: je werk wordt een nieuw ontwerp', async () => {
  const t = setup();
  t.set('Bijna klaar');
  t.lib.touch();
  await t.lib.flush();
  Object.assign(t.rows.get('id1'), { deleted_at: 'nu', deleted_by_name: 'Jim' });
  t.set('Klaar');
  t.lib.touch();
  await t.lib.flush();
  assert.equal(t.current().id, 'id2');
  assert.match(t.toasts.at(-1), /Jim heeft dit ontwerp in de prullenbak gezet/);
});

test('de AI: tijdens het invullen niets wegschrijven, daarna een eigen ontwerp', async () => {
  const t = setup();
  t.set('Mijn post');
  t.lib.touch();
  await t.lib.flush();
  t.lib.pause();
  t.set('Door de AI');
  t.lib.touch();
  await t.lib.flush();
  assert.equal(t.calls.length, 1, 'gepauzeerd: nog niets');
  const prev = t.lib.fork();
  t.lib.resume();
  await t.lib.flush();
  assert.equal(prev.id, 'id1');
  assert.deepEqual(t.calls.at(-1), ['create', 'id2', 'Door de AI', null]);
  assert.equal(t.rows.get('id1').state.title, 'Mijn post', 'het vorige ontwerp is niet overschreven');
});

test('zonder verbinding: blijft staan en gaat mee zodra het weer kan', async () => {
  const t = setup();
  t.offline(true);
  t.set('Offline gemaakt');
  t.lib.touch();
  assert.equal(await t.lib.flush(), 'offline');
  assert.equal(t.lib.isDirty(), true);
  assert.equal(t.current().dirty, true, 'ook na herladen weet de bieb dat er nog iets moet');
  t.offline(false);
  assert.equal(await t.lib.flush(), 'klaar');
  assert.deepEqual(t.calls, [['create', 'id1', 'Offline gemaakt', null]], 'hetzelfde id, geen dubbele');
});

test('een starttegel: wat er stond, gaat eerst nog de bieb in', async () => {
  const t = setup({ draft: { title: 'Werk van vóór het vanzelf opslaan' } });
  await t.lib.flush();
  assert.deepEqual(t.calls, [['create', 'id1', 'Werk van vóór het vanzelf opslaan', null]]);
  assert.equal(t.current().id, null, 'en je begint met een nieuw, leeg ontwerp');
  assert.equal(t.current().blank, true);
});

test('openen haalt de nieuwste versie en koppelt het ontwerp', async () => {
  const t = setup();
  t.rows.set('x9', { id: 'x9', state: { title: 'Van Jim' }, files: [], updated_at: 'r50', updated_by: 'u3', updated_by_name: 'Jim' });
  assert.equal(await t.lib.open('x9'), true);
  assert.equal(t.state.title, 'Van Jim');
  assert.equal(t.current().id, 'x9');
  assert.equal(t.current().rev, 'r50');
  t.set('Verder van Jim');
  t.lib.touch();
  await t.lib.flush();
  assert.deepEqual(t.calls.at(-1), ['update', 'x9', 'Verder van Jim']);
  assert.equal(await t.lib.open('bestaat-niet'), false);
});

/* ---------------------------------------------------------------------------
   De makers, het dashboard en de bieb-pagina
   ------------------------------------------------------------------------- */

test('de makers slaan vanzelf op: status in de appbalk, scripts, en elke wijziging telt', () => {
  for (const [tool, page] of [['insta', 'insta'], ['document', 'document'], ['presentation', 'presentation'], ['newsletter', 'nieuwsbrief']]) {
    const html = read(`tools/${page}.html`);
    assert.match(html, /id="libBtn"[^>]*aria-controls="libPop"/, `${tool}: knop bieb`);
    assert.match(html, /id="libPop"[\s\S]*data-lib/, `${tool}: popover`);
    assert.match(html, /class="appbar__btn lib-status" id="libSave" data-tour="opslaan"/, `${tool}: opslagstatus`);
    const at = (f) => html.indexOf(`<script src="../js/shared/${f}">`);
    assert.ok(at('core.js') < at('designs.js') && at('designs.js') < at('library.js'), `${tool}: core, designs, library`);
    const app = read(`js/${tool}/app.js`);
    assert.doesNotThrow(() => new vm.Script(app, { filename: `js/${tool}/app.js` }), `${tool}: app.js laadt`);
    assert.match(app, new RegExp(`PM\\.library\\.attach\\(\\{\\s*tool: '${tool}'`), `${tool}: gekoppeld`);
    assert.match(app, /function changed\([^)]*\) \{[\s\S]{0,120}if \(lib\) lib\.touch\(\);/, `${tool}: elke wijziging`);
    assert.match(app, /restore\(saved\) \{[\s\S]{0,700}if \(lib\) lib\.touch\(\);/, `${tool}: ook ongedaan maken`);
    assert.match(app, /lib\.detach\(\)/, `${tool}: nieuw ontwerp`);
    assert.match(app, /lib\.hold\(/, `${tool}: leeg beginnen telt niet`);
    assert.match(app, /lib\.autoSave\(\)/, `${tool}: na een download meteen opslaan`);
    assert.match(app, /openId: start\.bieb,\s*versionId: start\.versie,/, `${tool}: link van het dashboard en de bieb`);
    assert.ok(!/undo: \(\) => history\.undo\(\),\s*close:/.test(app), `${tool}: openen heeft "terug naar vorige", geen ongedaan maken van de bieb`);
    assert.match(read(`js/${tool}/help.js`), /id: 'opslaan', target: 'opslaan',\s*title: 'Vanzelf opgeslagen'/, `${tool}: rondleiding`);
  }
  // De presentatie: elke soort een eigen ontwerp, wisselen telt niet
  const pres = read('js/presentation/app.js');
  assert.match(pres, /lib\.hold\(\(\) => afterSwitch\(!back\)\);\s*lib\.sync\(\);/);
  assert.match(pres, /lib\.saveOther\(biebDeck\(/);
  assert.ok(!/lib\.save\(/.test(pres), 'geen opslaan met de hand meer');
});

test('het dashboard en de bieb-pagina gebruiken de ontwerpen in de cloud', () => {
  const index = read('index.html');
  assert.ok(index.includes('<script src="js/shared/designs.js"></script>'));
  assert.ok(!index.includes('library.js'), 'het dashboard heeft geen maker');
  const hub = read('js/hub.js');
  assert.match(hub, /window\.addEventListener\('pm-designs', syncBieb\)/);
  assert.match(hub, /bieb\.html\?tool=/, 'naar alle ontwerpen van een tool');
  const page = read('bieb.html');
  for (const f of ['js/shared/account.js', 'js/shared/core.js', 'js/shared/designs.js', 'js/shared/library.js', 'js/bieb.js']) assert.ok(page.includes(`src="${f}"`), f);
  assert.ok(page.indexOf('js/shared/account.js') < page.indexOf('<link rel="stylesheet"'), 'de deur eerst');
  assert.doesNotThrow(() => new vm.Script(read('js/bieb.js'), { filename: 'js/bieb.js' }));
  assert.match(read('js/shared/core.js'), /url\('bieb\.html'\)/, 'de bieb in de kop van elke pagina');
});
