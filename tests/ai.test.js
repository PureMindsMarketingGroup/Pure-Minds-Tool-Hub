/* Tests voor de AI van de Tool Hub: het verzoek aan Claude en het lezen van het antwoord
   (uploads/lib/ai.js, zonder netwerk), de koppeling in de makers en de sprekersnotities in PowerPoint */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { pathToFileURL } = require('url');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const load = () => import(pathToFileURL(path.join(root, 'uploads/lib/ai.js')).href);

// Een schema is bruikbaar als tool voor Claude: object, required bestaat, enums niet leeg
function checkSchema(schema, where) {
  assert.equal(typeof schema, 'object', where);
  if (schema.type === 'object') {
    assert.ok(schema.properties && typeof schema.properties === 'object', `${where}: properties`);
    for (const key of schema.required || []) assert.ok(key in schema.properties, `${where}: required ${key}`);
    for (const [key, value] of Object.entries(schema.properties)) checkSchema(value, `${where}.${key}`);
  } else if (schema.type === 'array') {
    checkSchema(schema.items, `${where}[]`);
  } else {
    assert.ok(['string', 'number', 'integer', 'boolean'].includes(schema.type), `${where}: type ${schema.type}`);
    if (schema.enum) assert.ok(schema.enum.length > 0, `${where}: enum`);
  }
}

test('drie formaten, elk met een tool en een geldig schema; het element past bij de lijst', async () => {
  const A = await load();
  assert.deepEqual(Object.keys(A.FORMATS), ['presentatie', 'insta', 'email']);
  for (const [id, f] of Object.entries(A.FORMATS)) {
    assert.match(f.tool, /^vul_[a-z]+$/, id);
    checkSchema(f.schema, id);
    checkSchema(f.element, `${id}.element`);
    assert.equal(f.schema.properties[f.list].items, f.element, `${id}: ${f.list} bestaat uit ${f.elementName}`);
  }
  // De layouts en blokken bestaan echt in de makers
  assert.deepEqual(A.FORMATS.presentatie.element.properties.layout.enum, ['title', 'section', 'bullets', 'split', 'quote', 'stat', 'table', 'closing']);
  global.window = global;
  const E = require('../js/newsletter/email.js');
  for (const t of A.FORMATS.email.element.properties.type.enum) assert.ok(E.BLOCKS[t], `blok ${t}`);
});

test('maken: Opus, één tool (auto: Opus 5.5 staat geen gedwongen tool toe), de content tussen tags, de regels altijd', async () => {
  const A = await load();
  const body = A.buildRequest({ format: 'presentatie', mode: 'generate', content: 'Notities over SEO voor de klant.', wish: '6 slides' });
  assert.equal(body.model, 'claude-opus-5-5');
  assert.equal(body.tools.length, 1);
  assert.equal(body.tools[0].name, 'vul_presentatie');
  assert.deepEqual(body.tool_choice, { type: 'auto' });
  assert.ok(body.max_tokens >= 12000, 'ruimte voor het nadenken vooraf');
  assert.equal(body.tools[0].input_schema, A.FORMATS.presentatie.schema);
  const msg = body.messages[0].content;
  assert.match(msg, /<content>\nNotities over SEO voor de klant\.\n<\/content>/);
  assert.match(msg, /<wens>\n6 slides\n<\/wens>/);
  assert.match(body.system, /Verzin geen feiten/);
  assert.match(body.system, /alleen door de tool aan te roepen/);
  assert.ok(body.max_tokens >= 4000);
});

test('de prompts uit Vercel komen in de system prompt; zonder prompts een korte reserve', async () => {
  const A = await load();
  const env = { AI_PROMPT: 'ALGEMEEN-PURE-MINDS', AI_PROMPT_INSTA: 'INSTA-REGELS', AI_PROMPT_EMAIL: 'MAIL-REGELS' };
  const insta = A.buildRequest({ format: 'insta', mode: 'generate', content: 'x'.repeat(30) }, env).system;
  assert.ok(insta.includes('ALGEMEEN-PURE-MINDS') && insta.includes('INSTA-REGELS'));
  assert.ok(!insta.includes('MAIL-REGELS'), 'alleen de prompt van dit formaat');
  const bare = A.buildRequest({ format: 'email', mode: 'generate', content: 'x'.repeat(30) }, {}).system;
  assert.match(bare, /online marketingbureau/);
  assert.ok(bare.length < 2500, 'de reserve is kort; de echte prompts staan in Vercel');
  assert.equal(A.buildRequest({ format: 'email', mode: 'generate', content: 'x'.repeat(30) }, { AI_MODEL: 'claude-sonnet-5-5' }).model, 'claude-sonnet-5-5');
  // Uit een .env-bestand: \n als letterlijke tekens wordt een echte nieuwe regel
  const fromFile = A.buildRequest({ format: 'insta', mode: 'generate', content: 'x'.repeat(30) }, { AI_PROMPT: 'Regel 1\\nRegel 2' }).system;
  assert.ok(fromFile.includes('Regel 1\nRegel 2'));
});

test('aanpassen: het huidige ontwerp en de instructie; één element met zijn eigen schema', async () => {
  const A = await load();
  const current = { onderwerp: 'Hoi', voorvertoning: 'x', blokken: [{ type: 'opening', kop: 'A' }, { type: 'tekst', kop: 'B' }] };
  const all = A.buildRequest({ format: 'email', mode: 'refine', instruction: 'korter', current });
  assert.equal(all.tools[0].name, 'vul_mail');
  assert.match(all.messages[0].content, /<huidig>[\s\S]*"kop": "B"[\s\S]*<\/huidig>/);
  assert.match(all.messages[0].content, /<instructie>\nkorter\n<\/instructie>/);
  const one = A.buildRequest({ format: 'email', mode: 'refine', instruction: 'formeler', current, target: 1 });
  assert.equal(one.tools[0].name, 'pas_blok_aan');
  assert.equal(one.tools[0].input_schema, A.FORMATS.email.element);
  assert.match(one.messages[0].content, /Pas alleen blok 2/);
  const slide = A.buildRequest({ format: 'insta', mode: 'refine', instruction: 'x', current: { slides: [{}, {}] }, target: 0 });
  assert.equal(slide.tools[0].name, 'pas_carousel_slide_aan');
});

test('invoer: formaat, lengte, instructie en een bestaand element', async () => {
  const A = await load();
  assert.equal(A.checkInput({ format: 'tiktok', content: 'x'.repeat(50) }).status, 400);
  assert.equal(A.checkInput({ format: 'insta', content: 'kort' }).status, 400);
  assert.equal(A.checkInput({ format: 'insta', content: 'x'.repeat(A.MAX_CONTENT + 1) }).status, 413);
  assert.deepEqual(A.checkInput({ format: 'insta', content: 'x'.repeat(50) }), { ok: true, mode: 'generate' });
  const cur = { slides: [{ layout: 'title' }] };
  assert.equal(A.checkInput({ format: 'presentatie', mode: 'refine', current: cur }).status, 400, 'zonder instructie');
  assert.equal(A.checkInput({ format: 'presentatie', mode: 'refine', instruction: 'korter' }).status, 400, 'zonder ontwerp');
  assert.equal(A.checkInput({ format: 'presentatie', mode: 'refine', instruction: 'korter', current: cur, target: 3 }).status, 400, 'slide bestaat niet');
  assert.equal(A.checkInput({ format: 'presentatie', mode: 'refine', instruction: 'korter', current: cur, target: 0 }).ok, true);
  assert.equal(A.checkInput({ format: 'presentatie', mode: 'refine', instruction: 'x'.repeat(2000), current: cur }).status, 413);
});

test('antwoord: de tool-aanroep wordt de data; te lang of geen tool geeft een zin voor de gebruiker', async () => {
  const A = await load();
  const data = { titel: 'X', slides: [{ layout: 'title', titel: 'Hoi', notities: 'n' }] };
  assert.deepEqual(A.readResponse({ content: [{ type: 'text', text: 'hier' }, { type: 'tool_use', name: 'vul_presentatie', input: data }], stop_reason: 'tool_use' }, 'vul_presentatie'), { data });
  assert.match(A.readResponse({ content: [], stop_reason: 'max_tokens' }).error, /te lang/);
  assert.match(A.readResponse({ content: [{ type: 'text', text: '{}' }] }).error, /geen bruikbaar antwoord/);
  assert.match(A.readResponse({ content: [{ type: 'tool_use', name: 'iets_anders', input: {} }] }, 'vul_mail').error, /geen bruikbaar/);
  assert.match(A.apiError(401), /ANTHROPIC_API_KEY/);
  assert.match(A.apiError(529), /overbelast/);
});

test('de functie: zelfde wachtwoord als de uploads, de sleutel alleen uit Vercel, 300 seconden', () => {
  const api = read('uploads/api/generate.js');
  assert.match(api, /process\.env\.APP_PASSWORD/);
  assert.match(api, /'x-api-key': process\.env\.ANTHROPIC_API_KEY/);
  assert.match(api, /https:\/\/api\.anthropic\.com\/v1\/messages/);
  assert.match(api, /export async function POST/);
  assert.ok(!/sk-ant-[A-Za-z0-9]/.test(api + read('uploads/lib/ai.js') + read('uploads/README.md')), 'geen sleutel in de repo');
  const cfg = JSON.parse(read('uploads/vercel.json'));
  assert.equal(cfg.functions['api/generate.js'].maxDuration, 300, 'Hobby met fluid compute: hoogstens 300');
});

test('de drie makers hebben het paneel AI, laden service.js en ai.js, en koppelen de bieb', () => {
  for (const [tool, page, format] of [['insta', 'insta', 'insta'], ['presentation', 'presentation', 'presentatie'], ['newsletter', 'nieuwsbrief', 'email']]) {
    const html = read(`tools/${page}.html`);
    assert.match(html, /class="rail__item" data-section="ai"/, `${tool}: rail`);
    assert.match(html, /<section class="panel" data-section="ai">\s*<div class="panel__body" data-ai-panel><\/div>/, `${tool}: paneel`);
    const order = ['js/shared/core.js', 'js/shared/service.js', 'js/shared/ai.js', `js/${tool}/app.js`].map((f) => html.indexOf(`<script src="../${f}">`));
    assert.ok(order.every((i) => i > 0), `${tool}: scripts ${order}`);
    assert.deepEqual([...order].sort((a, b) => a - b), order, `${tool}: volgorde van de scripts`);
    const app = read(`js/${tool}/app.js`);
    assert.doesNotThrow(() => new vm.Script(app, { filename: `js/${tool}/app.js` }));
    assert.match(app, new RegExp(`PM\\.ai\\.panel\\([^)]*\\), \\{\\s*tool: '${tool}',\\s*format: '${format}'`), `${tool}: paneel`);
    assert.match(app, /aiSaver = PM\.ai\.keepSaved\(lib\)/, `${tool}: vanzelf in de bieb`);
    assert.match(app, /if \(aiSaver\) aiSaver\.touch\(\);/, `${tool}: elke wijziging`);
    assert.match(app, /if \(aiSaver\) aiSaver\.stop\(\);/, `${tool}: stoppen bij een ander ontwerp`);
    const sandbox = {};
    new Function('window', read(`js/${tool}/help.js`))(sandbox);
    assert.ok(sandbox.PM_HELP[tool].sections.some((s) => s.id === 'ai'), `${tool}: sectie ai`);
  }
  for (const f of ['js/shared/ai.js', 'js/shared/service.js', 'js/shared/photos.js']) assert.doesNotThrow(() => new vm.Script(read(f), { filename: f }));
});

test('geen aparte startpagina meer: de AI zit in het paneel AI van elke maker', () => {
  const sandbox = { window: {} };
  vm.runInNewContext(read('js/shared/tools.js'), sandbox);
  assert.ok(!sandbox.window.PM_TOOLS.some((t) => t.id === 'ai'), 'geen kaart Maken met AI');
  assert.ok(!fs.existsSync(path.join(root, 'tools/ai.html')));
  assert.ok(!/handoff|autostart/.test(read('js/shared/ai.js')));
});

test('debounce: na de AI één keer opslaan na de laatste wijziging, en niet meer na stop', async () => {
  const saves = [];
  const sandbox = { window: { PM: { store: { get: () => null, set() {} }, debounce: (f) => f } }, document: {}, setTimeout, clearTimeout };
  sandbox.window.window = sandbox.window;
  vm.runInNewContext(read('js/shared/ai.js'), { ...sandbox, window: sandbox.window });
  const saver = sandbox.window.PM.ai.keepSaved({ save: (o) => saves.push(o) }, { delay: 30 });
  saver.touch();
  assert.equal(saves.length, 0, 'uit: niets');
  saver.start();
  saver.touch(); saver.touch(); saver.touch();
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(saves.length, 1, 'drie wijzigingen kort na elkaar: één keer opslaan');
  assert.equal(JSON.stringify(saves[0]), JSON.stringify({ quiet: true }));
  saver.touch();
  saver.stop();
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(saves.length, 1, 'na stop niet meer');
});

test('geen tool-aanroep: één tweede poging in hetzelfde gesprek, met het antwoord erbij', async () => {
  const A = await load();
  const body = A.buildRequest({ format: 'email', mode: 'generate', content: 'x'.repeat(40) });
  const text = { content: [{ type: 'thinking', thinking: 'h', signature: 's' }, { type: 'text', text: 'Hier is je mail: ...' }], stop_reason: 'end_turn' };
  assert.equal(A.hasToolCall(text, 'vul_mail'), false);
  assert.equal(A.hasToolCall({ content: [{ type: 'tool_use', name: 'vul_mail', input: {} }] }, 'vul_mail'), true);
  const next = A.followUp(body, text);
  assert.equal(next.messages.length, 3);
  assert.equal(next.messages[1].role, 'assistant');
  assert.equal(next.messages[1].content, text.content, 'het nadenken gaat ongewijzigd mee terug');
  assert.match(next.messages[2].content, /vul_mail/);
  assert.equal(next.tools, body.tools);
  assert.equal(body.messages.length, 1, 'het eerste verzoek blijft zoals het was');
});

test('carousel: de AI zet geen nummer voor een les, en de maker haalt het weg als het er toch staat', async () => {
  const A = await load();
  assert.match(A.FORMATS.insta.element.properties.titel.description, /zonder nummer/);
  assert.ok(read('js/insta/app.js').includes("x.soort === 'les' ? txt(x.titel).replace(/^\\d{1,2}\\s*[.):-]\\s+/, '')"), 'nummer eraf bij een les');
  const strip = (t) => t.replace(/^\d{1,2}\s*[.):-]\s+/, '');
  assert.equal(strip('1. Vul je profiel in'), 'Vul je profiel in');
  assert.equal(strip('12) Snel op mobiel'), 'Snel op mobiel');
  assert.equal(strip('3 tips voor je site'), '3 tips voor je site', 'een getal dat bij de zin hoort blijft');
});

test('foto’s: de AI geeft zoektermen per fotoplek; de server zoekt bij Unsplash (of Pexels), alleen vanaf de Tool Hub', async () => {
  const A = await load();
  assert.ok(A.FORMATS.presentatie.element.properties.fotoZoek, 'slide');
  assert.ok(A.FORMATS.insta.schema.properties.fotoZoek, 'post');
  assert.ok(A.FORMATS.email.element.properties.fotoZoek, 'blok');
  const P = await import(pathToFileURL(path.join(root, 'uploads/lib/photos.js')).href);
  // Unsplash eerst; Pexels als reserve; zonder sleutel uit
  assert.equal(P.pickProvider({ UNSPLASH_ACCESS_KEY: 'u', PEXELS_API_KEY: 'p' }), 'unsplash');
  assert.equal(P.pickProvider({ PEXELS_API_KEY: 'p' }), 'pexels');
  assert.equal(P.pickProvider({}), null);
  const q = (o) => P.checkQuery(new URLSearchParams(o));
  assert.deepEqual(q({ q: '  bakery   bread ', orientation: 'portrait', n: '50', locale: 'nl-NL' }), { ok: true, q: 'bakery bread', orientation: 'portrait', n: 24, locale: 'nl-NL' });
  assert.deepEqual(q({ q: 'team', orientation: 'scheef', locale: 'fr' }), { ok: true, q: 'team', orientation: '', n: 9, locale: 'en-US' });
  assert.equal(q({ q: 'x' }).status, 400);
  const un = P.searchRequest('unsplash', { q: 'bakery & bread', orientation: 'square', n: 1, locale: 'en-US' }, 'KEY');
  const uu = new URL(un.url);
  assert.equal(uu.origin + uu.pathname, 'https://api.unsplash.com/search/photos');
  assert.equal(uu.searchParams.get('query'), 'bakery & bread');
  assert.equal(uu.searchParams.get('orientation'), 'squarish', 'Unsplash noemt vierkant squarish');
  assert.equal(uu.searchParams.get('content_filter'), 'high');
  assert.equal(un.headers.authorization, 'Client-ID KEY');
  const px = P.searchRequest('pexels', { q: 'bakery', orientation: 'landscape', n: 1, locale: 'en-US' }, 'KEY');
  assert.equal(new URL(px.url).origin, 'https://api.pexels.com');
  assert.equal(px.headers.authorization, 'KEY');
  // Unsplash: alleen images.unsplash.com, links met utm, downloadmelding alleen naar api.unsplash.com
  const u = P.mapResults('unsplash', { results: [
    { id: 'abc', width: 4000, height: 3000, color: '#a08060', alt_description: 'bread', urls: { raw: 'https://images.unsplash.com/photo-1?ixid=XYZ' }, links: { html: 'https://unsplash.com/photos/abc', download_location: 'https://api.unsplash.com/photos/abc/download?ixid=XYZ' }, user: { name: 'Ann', links: { html: 'https://unsplash.com/@ann' } } },
    { id: 'bad', urls: { raw: 'https://evil.example/x.jpg' } },
    { id: 'bad2', urls: { raw: 'https://images.unsplash.com/photo-2' }, links: { download_location: 'https://evil.example/photos/x/download' }, user: { links: { html: 'javascript:alert(1)' } } },
  ] });
  assert.equal(u.length, 2);
  assert.equal(u[0].src, 'https://images.unsplash.com/photo-1?ixid=XYZ');
  assert.equal(u[0].thumb, 'https://images.unsplash.com/photo-1?ixid=XYZ&w=400&fit=max&q=70&fm=jpg');
  assert.equal(u[0].photographerUrl, 'https://unsplash.com/@ann?utm_source=pure_minds_tool_hub&utm_medium=referral');
  assert.equal(u[0].track, 'https://api.unsplash.com/photos/abc/download?ixid=XYZ');
  assert.equal(u[1].track, '', 'een vreemde downloadlink valt weg');
  assert.ok(u[1].photographerUrl.startsWith('https://unsplash.com'), 'geen javascript:-link');
  // Pexels: alleen images.pexels.com
  const list = P.mapResults('pexels', { photos: [
    { id: 1, width: 4000, height: 3000, alt: 'Brood', avg_color: '#AA8866', photographer: 'Ann', photographer_url: 'https://www.pexels.com/@ann', url: 'https://www.pexels.com/photo/1/', src: { original: 'https://images.pexels.com/photos/1/pexels-photo-1.jpeg?x=1' } },
    { id: 2, src: { original: 'https://evil.example/a.jpg' } },
  ] });
  assert.equal(list.length, 1);
  assert.equal(list[0].src, 'https://images.pexels.com/photos/1/pexels-photo-1.jpeg');
  assert.match(P.providerError('unsplash', 401), /UNSPLASH_ACCESS_KEY/);
  const C = await import(pathToFileURL(path.join(root, 'uploads/lib/check.js')).href);
  assert.deepEqual(C.checkOrigin({ origin: 'https://puremindsmarketinggroup.github.io', expected: '' }), { ok: true });
  assert.equal(C.checkOrigin({ origin: null, expected: '' }).status, 403);
  assert.equal(C.checkOrigin({ origin: 'https://puremindsmarketinggroup.github.io', expected: 'geheim', password: 'fout' }).status, 401);
  const api = read('uploads/api/photos.js');
  assert.match(api, /pickProvider\(process\.env\)/);
  assert.match(api, /params\.has\('track'\)/, 'downloadmelding voor Unsplash');
  assert.match(api, /checkOrigin\(/);
});

test('foto’s in de makers: photos.js vóór ai.js, en elke maker geeft fotoplekken en een doel', () => {
  for (const [tool, page] of [['insta', 'insta'], ['presentation', 'presentation'], ['newsletter', 'nieuwsbrief']]) {
    const html = read(`tools/${page}.html`);
    const a = html.indexOf('<script src="../js/shared/photos.js">');
    const b = html.indexOf('<script src="../js/shared/ai.js">');
    assert.ok(a > 0 && a < b, `${tool}: photos.js vóór ai.js`);
    const app = read(`js/${tool}/app.js`);
    assert.match(app, /photos: \{[\s\S]{0,240}?slots: \(d\) =>/, `${tool}: fotoplekken na het maken`);
    assert.match(app, /target: \(\) =>/, `${tool}: doel om zelf te kiezen`);
    assert.match(app, /fotoZoek/, `${tool}: zoektermen van de AI`);
  }
  assert.doesNotThrow(() => new vm.Script(read('js/shared/photos.js')));
});
