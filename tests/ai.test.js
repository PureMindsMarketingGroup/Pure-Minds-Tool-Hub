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
    assert.match(app, /autostart: !!start\.ai/, `${tool}: van de startpagina`);
    const sandbox = {};
    new Function('window', read(`js/${tool}/help.js`))(sandbox);
    assert.ok(sandbox.PM_HELP[tool].sections.some((s) => s.id === 'ai'), `${tool}: sectie ai`);
  }
  for (const f of ['js/shared/ai.js', 'js/shared/service.js', 'js/ai/app.js']) assert.doesNotThrow(() => new vm.Script(read(f), { filename: f }));
});

test('de startpagina staat in het register, met de drie formaten als snelle start', () => {
  const sandbox = { window: {} };
  vm.runInNewContext(read('js/shared/tools.js'), sandbox);
  const tool = sandbox.window.PM_TOOLS.find((t) => t.id === 'ai');
  assert.equal(tool.href, 'tools/ai.html');
  assert.equal(JSON.stringify(tool.starts.map((s) => s.params.format)), JSON.stringify(['presentatie', 'insta', 'email']));
  const html = read('tools/ai.html');
  for (const v of ['presentatie', 'insta', 'email']) assert.ok(html.includes(`name="format" value="${v}"`), v);
  assert.match(read('js/ai/app.js'), /PM\.ai\.handoff\.put\(/);
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
