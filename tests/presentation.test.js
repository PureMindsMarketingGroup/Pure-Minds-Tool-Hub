/* Tests voor js/presentation/deck.js: velden per layout, de controle op voorbeeldtekst en ongedaan maken */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const D = require('../js/presentation/deck.js');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

// De voorbeeldtabel, zoals defaultTable() in js/presentation/templates.js
const TABLE = [
  ['Kanaal', 'Budget', 'Klikken', 'Kosten per klik'],
  ['Google Ads', '€ 4.500', '12.400', '€ 0,36'],
  ['Meta', '€ 2.000', '8.150', '€ 0,25'],
  ['LinkedIn', '€ 1.500', '1.320', '€ 1,14'],
];

// Een nieuwe presentatie zoals defaults() in js/presentation/app.js hem maakt
function fresh() {
  return {
    dot: true,
    slides: D.example('28 september 2026').map((s, i) => ({
      id: `s${i + 1}`, label: '', title: '', subtitle: '', body: '', meta: '', quote: '', author: '', value: '',
      style: 'quote', imageSide: 'left', table: { header: true, firstCol: true, cells: TABLE.map((r) => r.slice()) }, ...s,
    })),
  };
}

const issues = (deck, opts = {}) => D.exampleIssues(deck, { exampleTable: TABLE, ...opts });
const at = (list, index) => list.filter((x) => x.index === index).map((x) => `${x.key}:${x.kind}`);

test('velden per layout: alleen wat de slide toont, met de naam uit de editor', () => {
  assert.deepEqual(D.fields({ layout: 'bullets' }).map((f) => f.key), ['title', 'body', 'label']);
  assert.deepEqual(D.fields({ layout: 'quote', style: 'quote' }).map((f) => f.key), ['quote', 'author', 'label']);
  assert.deepEqual(D.fields({ layout: 'quote', style: 'stat' }).map((f) => f.key), ['value', 'subtitle', 'author', 'label']);
  assert.equal(D.nameOf({ layout: 'bullets' }, 'body').name, 'de punten');
  assert.equal(D.nameOf({ layout: 'closing' }, 'body').label, 'contactgegevens');
  assert.equal(D.nameOf({ layout: 'quote', style: 'stat' }, 'author').label, 'bron');
  assert.equal(D.nameOf({ layout: 'table' }, 'subtitle').name, 'de toelichting onder de tabel');
  assert.deepEqual(D.fields({ layout: 'onbekend' }).map((f) => f.key), ['title', 'body', 'label'], 'onbekend = opsomming');
});

test('velden van de layouts van het voorstel', () => {
  assert.deepEqual(D.fields({ layout: 'tekst' }).map((f) => f.key), ['title', 'body', 'label']);
  assert.deepEqual(D.fields({ layout: 'kolommen' }).map((f) => f.key), ['title', 'subtitle', 'body', 'label']);
  assert.deepEqual(D.fields({ layout: 'vragen' }).map((f) => f.key), ['title', 'subtitle', 'body', 'label']);
  assert.deepEqual(D.fields({ layout: 'vpc' }).map((f) => f.key), ['vpc', 'label']);
  assert.equal(D.nameOf({ layout: 'tekst' }, 'body').name, 'de tekst');
  assert.equal(D.nameOf({ layout: 'kolommen' }, 'subtitle').label, 'inleiding');
  assert.equal(D.nameOf({ layout: 'kolommen' }, 'body').name, 'de kolommen');
  assert.equal(D.nameOf({ layout: 'vragen' }, 'subtitle').name, 'de inleiding');
  assert.equal(D.nameOf({ layout: 'vragen' }, 'body').label, 'vragen');
  assert.equal(D.nameOf({ layout: 'vpc' }, 'vpc').name, 'de waardepropositie');
});

test('waardepropositie: een leeg canvas mag, een invulplek niet', () => {
  const empty = { segment: '', klanttype: '', taken: '', pijnen: '', voordelen: '', producten: '', verzachters: '', verschaffers: '' };
  const deck = { slides: [
    { id: 'a', layout: 'vpc', label: 'waardepropositie', vpc: empty },
    { id: 'b', layout: 'vpc', label: 'waardepropositie', vpc: { ...empty, taken: 'Plannen\n[taak invullen]', pijnen: '[pijn]' } },
    { id: 'c', layout: 'vpc', label: '' },
    { id: 'd', layout: 'vpc', label: 'waardepropositie', vpc: { ...empty, segment: 'Horeca', klanttype: '[klanttype]' } },
  ] };
  const list = issues(deck);
  assert.deepEqual(at(list, 0), [], 'niet "leeg": de vakken tonen hun uitleg');
  assert.deepEqual(at(list, 1), ['vpc:invulplek']);
  assert.equal(list.find((x) => x.index === 1).found, '[taak invullen], [pijn]');
  assert.equal(list.find((x) => x.index === 1).name, 'de waardepropositie');
  assert.deepEqual(at(list, 2), [], 'zonder canvas geen fout');
  assert.equal(list.find((x) => x.index === 3).found, '[klanttype]', 'ook het klanttype');
});

test('de layouts van de positionering: business model canvas en toelichting', () => {
  assert.deepEqual(D.fields({ layout: 'bmc' }).map((f) => f.key), ['bmc', 'label']);
  assert.deepEqual(D.fields({ layout: 'toelichting' }).map((f) => f.key), ['title', 'body', 'label']);
  assert.equal(D.nameOf({ layout: 'bmc' }, 'bmc').name, 'het Business Model Canvas');
  assert.equal(D.nameOf({ layout: 'bmc' }, 'bmc').label, 'Business Model Canvas');
  // De volle waardepropositie (positionering) heet zoals het canvas; die van het voorstel niet
  assert.equal(D.nameOf({ layout: 'vpc', style: 'vol' }, 'vpc').name, 'het Waarde Propositie Canvas');
  assert.equal(D.nameOf({ layout: 'vpc', style: 'quote' }, 'vpc').name, 'de waardepropositie');
  assert.equal(D.nameOf({ layout: 'vpc', style: 'vol' }, 'label').name, 'het label');
  assert.equal(D.nameOf({ layout: 'quote', style: 'vol' }, 'author').name, 'naam en functie');
  assert.equal(D.nameOf({ layout: 'toelichting' }, 'body').label, 'toelichting');
  assert.equal(D.nameOf({ layout: 'toelichting' }, 'body').name, 'de toelichting');
  assert.equal(D.nameOf({ layout: 'toelichting' }, 'title').name, 'de titel');
  // Een leeg canvas mag (de blokken tonen hun uitleg); een invulplek in een blok niet
  const empty = { partners: '', activiteiten: '', resources: '', proposities: '', relaties: '', kanalen: '', segmenten: '' };
  const deck = { slides: [
    { id: 'a', layout: 'bmc', label: 'business model canvas', bmc: empty },
    { id: 'b', layout: 'bmc', label: 'business model canvas', bmc: { ...empty, partners: '- China\n- [leverancier]', kanalen: '[kanaal]' } },
    { id: 'c', layout: 'bmc', label: '' },
    { id: 'd', layout: 'toelichting', label: 'toelichting', title: 'Key Partners', body: '[Wie zijn de partners?]' },
    { id: 'e', layout: 'toelichting', label: 'toelichting', title: '', body: '' },
  ] };
  const list = issues(deck);
  assert.deepEqual(at(list, 0), [], 'niet "leeg"');
  assert.deepEqual(at(list, 1), ['bmc:invulplek']);
  assert.equal(list.find((x) => x.index === 1).found, '[leverancier], [kanaal]');
  assert.equal(list.find((x) => x.index === 1).name, 'het Business Model Canvas');
  assert.deepEqual(at(list, 2), [], 'zonder blokken geen fout');
  assert.deepEqual(at(list, 3), ['body:invulplek']);
  assert.deepEqual(at(list, 4), ['title:leeg']);
});

test('velden per layout zijn gelijk aan data-for in de HTML', () => {
  const html = read('tools/presentation.html');
  const inputs = { title: 'sTitle', subtitle: 'sSubtitle', meta: 'sMeta', quote: 'sQuote', author: 'sAuthor', value: 'sValue', body: 'sBody' };
  for (const [key, id] of Object.entries(inputs)) {
    const re = new RegExp(`<div class="field[^"]*"[^>]*data-for="([^"]+)"[^>]*>(?:(?!<div class="field)[\\s\\S])*?id="${id}"`);
    const m = html.match(re);
    assert.ok(m, `veld #${id} heeft een data-for`);
    const shown = m[1].split(/\s+/);
    for (const [variant, keys] of Object.entries(D.FIELDS)) {
      const layout = variant.split('.')[0];
      const on = shown.includes(variant) || shown.includes(layout);
      assert.equal(on, keys.includes(key), `#${id} bij ${variant}`);
    }
  }
});

test('invulplekken: tekst tussen blokhaken met een letter erin', () => {
  assert.deepEqual(D.placeholders('Bron: [bron invullen]'), ['[bron invullen]']);
  assert.deepEqual(D.placeholders('[naam] · [functie]\n[e-mailadres]'), ['[naam]', '[functie]', '[e-mailadres]']);
  assert.deepEqual(D.placeholders('zie noot [1] en [2023]'), []);
  assert.deepEqual(D.placeholders(''), []);
});

test('een nieuwe presentatie: voorbeeldtekst en invulplekken per slide', () => {
  const list = issues(fresh());
  assert.deepEqual(at(list, 0), ['title:voorbeeld', 'subtitle:voorbeeld'], 'label en datum mogen blijven');
  assert.deepEqual(at(list, 1), ['title:voorbeeld', 'subtitle:voorbeeld']);
  assert.deepEqual(at(list, 2), ['title:voorbeeld', 'body:voorbeeld']);
  assert.deepEqual(at(list, 3), ['title:voorbeeld', 'body:voorbeeld']);
  assert.deepEqual(at(list, 4), ['title:voorbeeld', 'table:voorbeeld', 'subtitle:invulplek']);
  assert.deepEqual(at(list, 5), ['value:voorbeeld', 'subtitle:voorbeeld', 'author:invulplek'], 'het citaat is verborgen bij een kerncijfer');
  assert.deepEqual(at(list, 6), ['body:invulplek'], '"Bedankt" en de vraag eronder mogen blijven');
  const author = list.find((x) => x.index === 5 && x.key === 'author');
  assert.equal(author.found, '[bron invullen]');
  assert.equal(author.label, 'bron');
  assert.equal(list.find((x) => x.index === 6).found, '[naam], [functie], [e-mailadres]');
});

test('een ingevulde presentatie is in orde', () => {
  const deck = fresh();
  const s = deck.slides;
  s[0].title = 'Groeiplan **2027**'; s[0].subtitle = 'Voor Studio Noord';
  s[1].title = 'Waar staan we'; s[1].subtitle = '';
  s[2].title = 'Wat we zien'; s[2].body = 'Veel verkeer via Google\nLage conversie op mobiel';
  s[3].title = 'Onze aanpak'; s[3].body = 'Eerst meten.\n- dan testen';
  s[4].title = 'Cijfers Q3'; s[4].subtitle = 'Periode: juli tot september'; s[4].table.cells[1][1] = '€ 5.000';
  s[5].value = '+62%'; s[5].subtitle = 'meer leads'; s[5].author = 'Bron: Google Analytics';
  s[6].body = 'Jan Jansen · directeur\nnaam@voorbeeld.nl\npureminds.nl';
  assert.deepEqual(issues(deck), []);
});

test('één voorbeeldregel in de tekst is genoeg om te melden', () => {
  const deck = fresh();
  deck.slides[2].body = 'Mijn eigen punt\nRemarketing wordt nog niet ingezet';
  const hit = issues(deck).find((x) => x.index === 2 && x.key === 'body');
  assert.equal(hit.kind, 'voorbeeld');
  assert.equal(hit.found, 'Remarketing wordt nog niet ingezet');
  // Nadruk of hoofdletters maken het geen eigen tekst
  deck.slides[1].title = 'waar staan **we** nu';
  assert.ok(issues(deck).some((x) => x.index === 1 && x.key === 'title' && x.kind === 'voorbeeld'));
});

test('lege slides en een kerncijfer zonder cijfer', () => {
  const deck = { slides: [
    { id: 'a', layout: 'bullets', label: 'analyse', title: '', body: '' },
    { id: 'b', layout: 'split', title: '', body: '' },
    { id: 'c', layout: 'quote', style: 'stat', value: '', subtitle: 'meer leads' },
    { id: 'd', layout: 'table', title: '', subtitle: '', table: { cells: [['', ''], ['', '']] } },
  ] };
  const list = issues(deck, { hasPhoto: (i) => i === 1 });
  assert.deepEqual(at(list, 0), ['title:leeg'], 'een label alleen is nog geen inhoud');
  assert.deepEqual(at(list, 1), [], 'beeld + tekst met alleen een foto is in orde');
  assert.deepEqual(at(list, 2), ['value:leeg']);
  assert.deepEqual(at(list, 3), ['title:leeg']);
});

test('invulplekken in de tabel', () => {
  const deck = fresh();
  deck.slides[4].table.cells[2][1] = '[bedrag]';
  const hit = issues(deck).find((x) => x.index === 4 && x.key === 'table');
  assert.equal(hit.kind, 'invulplek');
  assert.equal(hit.found, '[bedrag]');
});

test('ongedaan maken: de slide die veranderde komt in beeld', () => {
  const A = { id: 'a', title: 'A' };
  const B = { id: 'b', title: 'B' };
  const C = { id: 'c', title: 'C' };
  // Typen op de slide die je ziet: daar blijven, ook op een nieuwe plek
  assert.equal(D.changedSlide([A, B, C], [A, { ...B, title: 'b' }, C], 1), 1);
  // Een verwijderde slide komt terug: naar die slide
  assert.equal(D.changedSlide([A, C], [A, B, C], 1), 1);
  // Opnieuw verwijderen: de slide die op zijn plek komt
  assert.equal(D.changedSlide([A, B, C], [A, C], 1), 1);
  assert.equal(D.changedSlide([A, B, C], [A, B], 2), 1, 'laatste slide weg');
  // Een verplaatsing terugdraaien: dezelfde slide volgen
  assert.equal(D.changedSlide([B, A, C], [A, B, C], 0), 1);
  // Een andere slide veranderde: daarheen
  assert.equal(D.changedSlide([A, B, C], [{ ...A, title: 'x' }, B, C], 2), 0);
  // Alleen iets van de hele presentatie (cyaan punt): blijven waar je was
  assert.equal(D.changedSlide([A, B, C], [A, B, C], 2), 2);
  assert.equal(D.changedSlide([], [], 3), 0);
});

test('verplaatsen geeft een nieuwe lijst en negeert onmogelijke plekken', () => {
  const list = ['a', 'b', 'c', 'd'];
  assert.deepEqual(D.move(list, 0, 2), ['b', 'c', 'a', 'd']);
  assert.deepEqual(D.move(list, 3, 0), ['d', 'a', 'b', 'c']);
  assert.deepEqual(D.move(list, 1, 9), list);
  assert.deepEqual(list, ['a', 'b', 'c', 'd'], 'origineel blijft staan');
});

// window.PM_HELP zoals js/presentation/help.js hem vult
function helpData() {
  const vm = require('vm');
  const sandbox = { window: {} };
  vm.runInNewContext(read('js/presentation/help.js'), sandbox);
  return sandbox.window.PM_HELP;
}
const words = (t) => String(t).trim().split(/\s+/).length;

test('uitleg en rondleiding (js/presentation/help.js) passen bij de HTML', () => {
  const H = helpData().presentation;
  const html = read('tools/presentation.html');
  // Elke [?] heeft een tekst, en elke tekst heeft een [?]
  const used = new Set(Array.from(html.matchAll(/data-help="([^"]+)"/g), (m) => m[1]));
  for (const key of used) assert.ok(H.help[key], `tekst voor data-help="${key}"`);
  for (const key of Object.keys(H.help)) assert.ok(used.has(key), `[?] voor "${key}" in de HTML`);
  // Onderdelen = de rail; doelen van de rondleiding bestaan
  assert.deepEqual(Array.from(H.sections, (s) => s.id), Array.from(html.matchAll(/class="rail__item" data-section="([^"]+)"/g), (m) => m[1]));
  for (const step of H.tour) {
    if (step.target) assert.match(html, new RegExp(`data-tour="${step.target}"`), `data-tour="${step.target}"`);
    if (step.section) assert.ok(H.sections.some((s) => s.id === step.section), `onderdeel ${step.section}`);
  }
  // Schrijfwijze uit de kop van help.js: uitleg hoogstens 40 woorden, een stap 35, een titel 5
  for (const [key, h] of Object.entries(H.help)) assert.ok(words(h.text) <= 40, `uitleg "${key}" is ${words(h.text)} woorden`);
  for (const step of H.tour) {
    assert.ok(words(step.text) <= 35, `stap "${step.id}" is ${words(step.text)} woorden`);
    assert.ok(words(step.title) <= 5, `titel van stap "${step.id}"`);
  }
  for (const s of H.sections) assert.ok(s.label.length <= 12, `label ${s.label}`);
  // De gewone rondleiding heeft geen stappen in de panelen van een voorstel of positionering (die zijn daar verborgen)
  for (const step of H.tour) assert.ok(!['voorstel', 'prijzen', 'gegevens'].includes(step.section), `stap "${step.id}" hoort bij een andere soort`);
});

// De recepten van de gegenereerde soorten, zoals window.PMDecks in de browser
const DECKS = {
  voorstel: require('../js/presentation/voorstel.js'),
  positionering: require('../js/presentation/positionering.js'),
};
const G = require('../js/presentation/generator.js');

// De panelen van tools/presentation.html als { section, deck, html }: van de ene
// <section class="panel" tot de volgende (de checklist is een section ín een paneel)
function panels(html) {
  const starts = Array.from(html.matchAll(/<section class="panel" data-section="([^"]+)"(?: data-form-deck="([^"]+)")?>/g));
  return starts.map((m, i) => ({
    section: m[1], deck: m[2] || '',
    html: html.slice(m.index, i + 1 < starts.length ? starts[i + 1].index : html.indexOf('</form>')),
  }));
}
// Het paneel waarin data-tour="<doel>" staat; null buiten de panelen (de strook, download)
const panelOfTour = (html, target) => panels(html).find((p) => p.html.includes(`data-tour="${target}"`)) || null;

test('de rail: een knop per onderdeel, Gegevens tussen Prijzen en Layout', () => {
  const html = read('tools/presentation.html');
  const rail = Array.from(html.matchAll(/class="rail__item" data-section="([^"]+)"/g), (m) => m[1]);
  assert.deepEqual(rail, ['soort', 'voorstel', 'prijzen', 'gegevens', 'layout', 'inhoud', 'foto', 'presentatie', 'ai']);
  assert.deepEqual(panels(html).map((p) => p.section), rail, 'een paneel per knop, in dezelfde volgorde');
  // De knoppen van een soort staan uit tot app.js ze aanzet
  for (const id of ['voorstel', 'prijzen', 'gegevens']) assert.match(html, new RegExp(`<button class="rail__item" data-section="${id}" hidden>`), id);
  assert.deepEqual(panels(html).filter((p) => p.deck).map((p) => `${p.section}:${p.deck}`), ['voorstel:voorstel', 'prijzen:voorstel', 'gegevens:positionering']);
  // Soort: drie tegels, in de volgorde van TYPES in app.js
  assert.deepEqual(Array.from(html.matchAll(/name="deckType" value="([^"]+)"/g), (m) => m[1]), ['regulier', 'voorstel', 'positionering']);
  // data-type noemt alleen bestaande soorten
  for (const m of html.matchAll(/data-type="([^"]+)"/g)) {
    for (const t of m[1].split(/\s+/)) assert.ok(['regulier', 'voorstel', 'positionering'].includes(t), `data-type="${m[1]}"`);
  }
  // De recepten laden na de generator en vóór templates.js (die leest ze)
  const scripts = Array.from(html.matchAll(/<script src="\.\.\/js\/presentation\/([^"]+)"/g), (m) => m[1]);
  assert.deepEqual(scripts.slice(0, 4), ['generator.js', 'voorstel.js', 'positionering.js', 'templates.js']);
});

test('de rondleidingen van het voorstel en de positionering passen bij de HTML', () => {
  const help = helpData();
  const H = help.presentation;
  const html = read('tools/presentation.html');
  for (const type of Object.keys(DECKS)) {
    const T = help[type];
    assert.ok(T && Array.isArray(T.tour) && T.tour.length > 2, `window.PM_HELP.${type}.tour bestaat`);
    const ids = T.tour.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length, `${type}: elk id één keer`);
    // Begint met een welkom en eindigt met de valkuilen, allebei zonder doel
    assert.ok(!T.tour[0].target && !T.tour[T.tour.length - 1].target, `${type}: eerste en laatste stap in het midden`);
    for (const step of T.tour) {
      const at = `${type}, stap "${step.id}"`;
      assert.equal(typeof step.id, 'string');
      assert.ok(step.title && step.text, `${at} heeft titel en tekst`);
      if (step.target) {
        assert.ok(html.includes(`data-tour="${step.target}"`), `data-tour="${step.target}" (${at})`);
        // Het doel staat niet in een paneel van een andere soort (dat is dan verborgen)
        const panel = panelOfTour(html, step.target);
        assert.ok(!panel || !panel.deck || panel.deck === type, `${at}: data-tour="${step.target}" staat bij ${panel && panel.deck}`);
      }
      if (step.section) {
        assert.ok(H.sections.some((s) => s.id === step.section), `onderdeel ${step.section} (${at})`);
        const panel = panels(html).find((p) => p.section === step.section);
        assert.ok(panel && (!panel.deck || panel.deck === type), `${at}: paneel ${step.section} hoort bij een andere soort`);
      }
      // De titelslide volgt het formulier: in een voorstel of positionering is er geen stap "titel"
      assert.notEqual(step.target, 'titel', at);
      // Een doe-stap heeft iets om te doen
      if (step.doe) {
        assert.ok(step.target, `doe-${at} heeft een doel`);
        assert.ok(['input', 'change', 'click'].includes(step.doe.event) || typeof step.doe.signal === 'string', `doe van ${at}`);
      }
      assert.ok(words(step.text) <= 35, `${at} is ${words(step.text)} woorden`);
      assert.ok(words(step.title) <= 5, `titel van ${at}`);
    }
  }
  // De gewone rondleiding: haar doelen staan niet in de panelen van een soort
  for (const step of H.tour) {
    const panel = step.target ? panelOfTour(html, step.target) : null;
    assert.ok(!panel || !panel.deck, `stap "${step.id}": data-tour="${step.target}" staat bij ${panel && panel.deck}`);
  }
});

test('de formulieren in de HTML: elk veld is een pad van zijn recept', () => {
  const html = read('tools/presentation.html');
  const all = panels(html);
  // Geen oude namen meer, en geen veld van een formulier buiten zijn paneel (daar doet typen niets)
  assert.doesNotMatch(html, /data-pos(-on|-if)?=/);
  const inside = all.filter((p) => p.deck).map((p) => p.html).join('');
  for (const attr of ['data-form', 'data-form-on', 'data-form-if']) {
    const n = (t) => (t.match(new RegExp(`${attr}="`, 'g')) || []).length;
    assert.equal(n(html), n(inside), `${attr} alleen in de panelen van een soort`);
  }
  for (const [type, R] of Object.entries(DECKS)) {
    const body = all.filter((p) => p.deck === type).map((p) => p.html).join('\n');
    assert.ok(body.length > 500, `panelen van ${type}`);
    // Een keuzerondje geeft zijn eigen waarde door, een vinkje true, de rest tekst
    const fields = Array.from(body.matchAll(/<(?:input|textarea)\b[^>]*\bdata-form="[^"]+"[^>]*>/g), (m) => m[0]);
    const paths = fields.map((t) => t.match(/data-form="([^"]+)"/)[1]);
    assert.ok(paths.includes('klant') && paths.includes('datum'), `${type}: klant en datum`);
    for (const t of fields) {
      const p = t.match(/data-form="([^"]+)"/)[1];
      const value = /type="radio"/.test(t) ? t.match(/value="([^"]+)"/)[1] : /type="checkbox"/.test(t) ? true : 'tekst';
      assert.equal(R.set(R.defaults('1 oktober 2026'), p, value), true, `${type}: data-form="${p}" = ${value}`);
    }
    // De schakelaars: precies de onderdelen van het recept, in dezelfde volgorde
    assert.deepEqual(Array.from(body.matchAll(/data-form-on="([^"]+)"/g), (m) => m[1]), R.PARTS.slice(), `${type}: schakelaars`);
    for (const m of body.matchAll(/data-form-if="([^"]+)"/g)) assert.ok(R.PARTS.includes(m[1]), `${type}: data-form-if="${m[1]}"`);
  }
});

test('de canvassen bij Inhoud: een veld per vak en per blok', () => {
  const html = read('tools/presentation.html');
  assert.match(html, /<div class="vpc-fields" data-for="vpc">/);
  for (const k of G.VPC_KEYS) assert.match(html, new RegExp(`id="sv-${k}" data-vpc="${k}"`), `#sv-${k}`);
  assert.deepEqual(Array.from(html.matchAll(/data-vpc="([^"]+)"/g), (m) => m[1]).sort(), G.VPC_KEYS.slice().sort(), 'geen andere data-vpc');
  assert.match(html, /<div class="vpc-fields bmc-fields" data-for="bmc">/);
  const bmc = Array.from(html.matchAll(/id="sb-([a-z]+)" data-bmc="([a-z]+)"/g), (m) => [m[1], m[2]]);
  for (const [id, key] of bmc) assert.equal(id, key);
  assert.deepEqual(bmc.map(([id]) => id), G.BMC_KEYS.slice(), 'één #sb-veld per blok, in de volgorde van het canvas');
  for (const k of G.BMC_KEYS) {
    const { name, uitleg } = G.BMC_INFO[k];
    assert.ok(html.includes(`<label class="label" for="sb-${k}">${name}</label>`), `label van ${k}`);
    const tag = html.match(new RegExp(`<textarea[^>]*id="sb-${k}"[^>]*>`))[0];
    assert.ok(tag.includes(`data-toolbar-label="${name.toLowerCase()}"`) && tag.includes(`placeholder="${uitleg}"`), `#sb-${k}: naam en uitleg`);
  }
  // Een toelichting brengt je naar zijn blok of vak op het canvas: dat veld bestaat
  for (const [role, link] of Object.entries(DECKS.positionering.LINKS)) {
    assert.ok(html.includes(`id="${link.role === 'bmc' ? 'sb' : 'sv'}-${link.key}"`), `${role} → ${link.role}:${link.key}`);
  }
  assert.match(html, /id="posNoteCanvas" hidden>naar het canvas</);
});

test('checklists: elk punt brengt je naar een veld en onderdeel dat bestaat', () => {
  const html = read('tools/presentation.html');
  const all = panels(html);
  for (const [type, R] of Object.entries(DECKS)) {
    const input = R.defaults('1 oktober 2026');
    let n = 0;
    const make = (s) => ({ id: `s${++n}`, layout: s.layout, gen: {}, vpc: G.emptyVpc(), bmc: G.emptyBmc() });
    const slides = R.sync([], R.build(input), make, {}).slides;
    // Alles nog open: dan staan ook de punten erin die alleen verschijnen als er iets ontbreekt
    const list = R.checklist(input, slides, { placeholders: 2, overflow: 1 });
    assert.ok(list.length >= 4, `${type}: ${list.length} punten`);
    for (const x of list) {
      const at = `${type} "${x.id}"`;
      const panel = x.go.section ? all.find((p) => p.section === x.go.section) : null;
      if (x.go.section) {
        assert.ok(panel, `${at}: onderdeel ${x.go.section}`);
        // Een paneel van een soort: dan van deze soort (de andere zijn verborgen)
        assert.ok(!panel.deck || panel.deck === type, `${at}: ${x.go.section} hoort bij ${panel.deck}`);
      }
      if (x.go.field) {
        const id = `id="${x.go.field.slice(1)}"`;
        assert.ok(html.includes(id), `${at}: ${x.go.field}`);
        assert.ok(!panel || panel.html.includes(id), `${at}: ${x.go.field} staat in ${x.go.section}`);
      }
      if (x.go.role) assert.ok(R.ROLES.includes(x.go.role), `${at}: rol ${x.go.role}`);
      if (x.go.issue) assert.ok(['first', 'overflow'].includes(x.go.issue), `${at}: ${x.go.issue}`);
    }
  }
});

// Een vaste waarde uit js/presentation/app.js (een object of lijst zonder code), zonder de app te starten
function appConst(name) {
  const m = read('js/presentation/app.js').match(new RegExp(`\\n  const ${name} = ([\\s\\S]*?);\\r?\\n`));
  assert.ok(m, `const ${name} in app.js`);
  // Via JSON: een lijst uit een andere context is voor deepEqual anders geen gewone lijst
  return JSON.parse(JSON.stringify(require('vm').runInNewContext(`(${m[1]})`)));
}

test('app.js kent de panelen, checklists en canvassen van elke soort', () => {
  const html = read('tools/presentation.html');
  const all = panels(html);
  // DECK_UI: de tabs, het formulier, de checklist en "zet terug" van elke gegenereerde soort
  const UI = appConst('DECK_UI');
  assert.deepEqual(Object.keys(UI), Object.keys(DECKS));
  for (const [type, u] of Object.entries(UI)) {
    const own = all.filter((p) => p.deck === type);
    assert.deepEqual(u.tabs, own.map((p) => p.section), `${type}: tabs`);
    assert.equal(u.panel, u.tabs[0], `${type}: het eerste paneel opent`);
    const body = own.map((p) => p.html).join('');
    // Een vaste opbouw (de positionering) heeft geen schakelaars en geen "zet terug"
    const fixed = DECKS[type].fixed === true;
    const keys = ['klant', 'check', 'checkList', 'checkCount', ...(fixed ? [] : ['restore', 'restoreText', 'restoreBtn'])];
    for (const k of keys) {
      assert.ok(body.includes(`id="${u[k].slice(1)}"`), `${type}: ${k} ${u[k]} in zijn paneel`);
    }
    if (fixed) {
      for (const k of ['restore', 'restoreText', 'restoreBtn']) assert.equal(u[k], undefined, `${type}: geen ${k}`);
      assert.ok(!/data-form-on=|>zet terug</.test(body), `${type}: geen schakelaars of zet terug in zijn paneel`);
    } else assert.ok(/data-form-on=/.test(body), `${type}: schakelaars`);
  }
  // De controle vóór het downloaden meldt lege canvassen met de checklist-punten van het recept
  const CANVAS_CHECK = appConst('CANVAS_CHECK');
  const ids = new Set();
  for (const R of Object.values(DECKS)) {
    let n = 0;
    const slides = R.sync([], R.build(R.defaults()), (s) => ({ id: `s${++n}`, layout: s.layout, gen: {}, vpc: G.emptyVpc(), bmc: G.emptyBmc() }), {}).slides;
    for (const x of R.checklist(R.defaults(), slides, {})) {
      if (x.go.role !== 'vpc' && x.go.role !== 'bmc') continue;
      ids.add(x.id);
      assert.equal(CANVAS_CHECK[x.id], x.go.role, `${R.id}: punt "${x.id}"`);
    }
  }
  assert.deepEqual(Object.keys(CANVAS_CHECK).sort(), Array.from(ids).sort(), 'geen canvas-punt dat geen recept heeft');
  // Een gewone presentatie heeft de generator niet: app.js heeft de sleutels zelf, gelijk aan generator.js
  assert.deepEqual(appConst('VPC_KEYS'), G.VPC_KEYS.slice());
  assert.deepEqual(appConst('BMC_KEYS'), G.BMC_KEYS.slice());
});

test('een veldnaam voor één plek (layout@rol) hoort bij een rol die die layout heeft', () => {
  const html = read('tools/presentation.html');
  const keys = Array.from(html.matchAll(/data-layout-text="([^"]+)"/g), (m) => m[1].split('|').map((p) => p.slice(0, p.indexOf(':')))).flat();
  const own = keys.filter((k) => k.includes('@'));
  assert.ok(own.includes('vragen@agenda'), 'de onderdelen van de positionering');
  for (const k of own) {
    const [layout, role] = k.split('@');
    const hits = Object.values(DECKS).filter((R) => R.ROLES.includes(role));
    assert.ok(hits.length, `rol ${role}`);
    for (const R of hits) assert.equal(R.specFor(R.defaults(), role).layout, layout, `${R.id}: ${k}`);
  }
});

test('de voorbeeldslides gebruiken alle zeven layouts', () => {
  const layouts = D.example().map((s) => s.layout);
  assert.deepEqual(layouts.slice().sort(), ['bullets', 'closing', 'quote', 'section', 'split', 'table', 'title']);
  assert.match(D.example('1 mei 2026')[0].meta, /1 mei 2026$/);
});
