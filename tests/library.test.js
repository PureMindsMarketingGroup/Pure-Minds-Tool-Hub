/* Tests voor js/shared/library.js: de bieb bewaart 14 dagen, nieuwste eerst, en zegt hoe lang nog */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const L = require('../js/shared/library.js');

const DAY = 864e5;
const NOW = new Date(2026, 9, 13, 15, 0).getTime();
const entry = (id, savedAt, tool = 'insta') => ({ id, tool, title: id, savedAt, expires: savedAt + L.DAYS * DAY });

test('een ontwerp blijft 14 dagen na de laatste keer bewaren staan', () => {
  assert.equal(L.DAYS, 14);
  const fresh = entry('a', NOW);
  const old = entry('b', NOW - 14 * DAY - 1);
  const almost = entry('c', NOW - 13 * DAY);
  const { keep, gone } = L.prune([fresh, old, almost], NOW);
  assert.deepEqual(keep.map((e) => e.id), ['a', 'c']);
  assert.deepEqual(gone.map((e) => e.id), ['b']);
});

test('kapotte regels in de lijst worden opgeruimd', () => {
  const { keep, gone } = L.prune([null, { id: 'x' }, entry('a', NOW), 'tekst'], NOW);
  assert.deepEqual(keep.map((e) => e.id), ['a']);
  assert.equal(gone.length, 3);
  assert.deepEqual(L.prune('geen lijst', NOW), { keep: [], gone: [] });
});

test('opnieuw bewaren zet het ontwerp vooraan, zonder dubbele', () => {
  const list = [entry('a', NOW - 3 * DAY), entry('b', NOW - 2 * DAY), entry('c', NOW - DAY)];
  const again = entry('b', NOW);
  const next = L.upsert(list, again);
  assert.deepEqual(next.map((e) => e.id), ['b', 'a', 'c']);
  assert.equal(next[0].expires, NOW + 14 * DAY);
  assert.deepEqual(L.upsert(null, again).map((e) => e.id), ['b']);
});

test('hoe lang nog, in hele dagen', () => {
  assert.equal(L.daysLeft(entry('a', NOW), NOW), 14);
  assert.equal(L.daysLeft(entry('a', NOW - 13.5 * DAY), NOW), 1);
  assert.equal(L.daysLeft(entry('a', NOW - 20 * DAY), NOW), 0);
  assert.equal(L.leftText(14), 'nog 14 dagen');
  assert.equal(L.leftText(1), 'nog 1 dag');
  assert.equal(L.leftText(0), 'verdwijnt vandaag');
});

test('wanneer opgeslagen: vandaag en gisteren met de tijd, zodat je twee versies uit elkaar ziet', () => {
  assert.equal(L.savedText(NOW - 60 * 1000, NOW), 'opgeslagen vandaag om 14:59');
  assert.equal(L.savedText(new Date(2026, 9, 12, 9, 5).getTime(), NOW), 'opgeslagen gisteren om 9:05');
  assert.equal(L.savedText(NOW - 5 * DAY, NOW), 'opgeslagen 5 dagen geleden');
});

test('titels zonder nadruk-tekens en dubbele spaties', () => {
  assert.equal(L.cleanTitle('Onze nieuwe **Google Ads-audit**  is live'), 'Onze nieuwe Google Ads-audit is live');
  assert.equal(L.cleanTitle(null), '');
});

test('de makers hebben de bieb: knop, popover en script, en het dashboard laadt hem', () => {
  const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  // [id in tools.js, pagina in tools/]
  for (const [tool, page] of [['insta', 'insta'], ['document', 'document'], ['presentation', 'presentation'], ['newsletter', 'nieuwsbrief']]) {
    const html = read(`tools/${page}.html`);
    assert.match(html, /id="libBtn"[^>]*aria-controls="libPop"/, `${tool}: knop`);
    assert.match(html, /id="libPop"[\s\S]*data-lib/, `${tool}: popover`);
    assert.ok(html.indexOf('<script src="../js/shared/library.js">') > html.indexOf('<script src="../js/shared/core.js">'), `${tool}: script na core.js`);
    const app = read(`js/${tool}/app.js`);
    // Een dubbele naam (const/let) is een SyntaxError: dan laadt de hele maker niet
    assert.doesNotThrow(() => new vm.Script(app, { filename: `js/${tool}/app.js` }), `${tool}: app.js laadt`);
    assert.match(app, new RegExp(`PM\\.library\\.attach\\(\\{\\s*tool: '${tool}'`), `${tool}: gekoppeld`);
    assert.match(app, /lib\.touch\(\)/, `${tool}: wijzigingen`);
    assert.match(app, /lib\.detach\(\)/, `${tool}: nieuw ontwerp`);
    assert.match(app, /lib\.autoSave\(\)/, `${tool}: na een download`);
    assert.match(html, /id="libSave"[^>]*data-tour="opslaan"/, `${tool}: knop opslaan`);
    assert.match(read(`js/${tool}/help.js`), /id: 'opslaan', target: 'opslaan'/, `${tool}: opslaan in de rondleiding`);
    assert.match(app, /openId: start\.bieb/, `${tool}: link van het dashboard`);
  }
  assert.ok(read('index.html').includes('js/shared/library.js'));
});
