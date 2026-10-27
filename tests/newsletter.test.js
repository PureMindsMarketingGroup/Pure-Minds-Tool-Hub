/* Tests voor de Nieuwsbrief Maker: de HTML voor Brevo (js/newsletter/email.js), de teksten
   (js/newsletter/help.js) en de controles van de upload-service (uploads/lib/check.js) */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { pathToFileURL } = require('url');
const E = require('../js/newsletter/email.js');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const count = (s, needle) => s.split(needle).length - 1;

// Een mail zonder voorbeeldtekst, zoals iemand hem echt maakt
function real() {
  const s = E.starter('nieuwsbrief');
  s.name = 'Nieuwsbrief november';
  s.preheader = 'Drie tips voor meer aanvragen via je website.';
  for (const b of s.blocks) {
    if ('title' in b) b.title = `Echte kop van ${b.type}`;
    if ('intro' in b) b.intro = 'Hoi {voornaam}, dit is de intro.';
    if ('body' in b) b.body = 'Een **echte** alinea.\n\nNog een alinea met [een link](www.pureminds.nl/blog).';
    if (b.type === 'resultaat') Object.assign(b, { label: 'Resultaat · Bakkerij Jansen', number: '+62%', text: 'meer bestellingen' });
    if (b.items) b.items.forEach((it, i) => { it.title = `Punt ${i + 1} echt`; });
    if (b.img) b.img.alt = 'Een echte beschrijving';
  }
  return s;
}

test('de HTML heeft alles wat Brevo nodig heeft: afmelden, gegevens wijzigen, online bekijken en de voornaam', () => {
  const html = E.build(E.starter('nieuwsbrief'));
  assert.match(html, /^<!DOCTYPE html>/);
  assert.ok(html.includes('href="{{ unsubscribe }}"'), 'afmelden (verplicht)');
  assert.ok(html.includes('href="{{ update_profile }}"'));
  assert.ok(html.includes('href="{{ mirror }}"'));
  assert.ok(html.includes('{% if contact.FIRSTNAME %}Hoi {{ contact.FIRSTNAME }}{% else %}Beste lezer{% endif %},'), '"Hoi {voornaam}" wordt de als-dan-regel van Brevo');
  assert.ok(!/\{voornaam\}/i.test(html));
  assert.ok(html.trim().endsWith('</html>'));
});

test('tabellen, rijen, cellen en Outlook-blokken zijn in balans (anders valt de opmaak uit elkaar)', () => {
  for (const s of [E.starter('nieuwsbrief'), E.starter('kort'), real()]) {
    s.blocks.push({ ...E.block('fototekst'), side: 'rechts', url: 'https://pureminds.nl/blog' });
    const p = E.block('punten');
    p.items.pop();
    s.blocks.push(p);
    // Punten onder elkaar, en vier en vijf punten naast elkaar (in rijen)
    const more = (n, layout) => { const q = E.block('punten'); q.layout = layout; while (q.items.length < n) q.items.push({ icon: null, title: 'x', text: 'y' }); return q; };
    s.blocks.push(more(3, 'onder'), more(4, 'naast'), more(5, 'naast'), more(5, 'onder'));
    const html = E.build(s);
    assert.equal(count(html, '<table'), count(html, '</table>'), 'table');
    assert.equal(count(html, '<tr'), count(html, '</tr>'), 'tr');
    assert.equal((html.match(/<td[\s>]/g) || []).length, count(html, '</td>'), 'td');
    assert.equal((html.match(/<div[\s>]/g) || []).length, count(html, '</div>'), 'div');
    assert.equal(count(html, '<!--[if'), count(html, '<![endif]-->'), 'MSO-commentaar');
    assert.equal(count(html, '<!-- BLOK:'), count(html, '<!-- EINDE BLOK -->'));
  }
});

test('alle plaatjes staan online via https, op het account van Pure Minds; niets van een persoonlijk account', () => {
  const html = E.build(E.starter('nieuwsbrief'));
  const srcs = Array.from(html.matchAll(/<img[^>]+src="([^"]+)"/g), (m) => m[1]);
  assert.ok(srcs.length > 10);
  for (const src of srcs) assert.match(src, /^https:\/\/puremindsmarketinggroup\.github\.io\/Pure-Minds-Tool-Hub\//, src);
  assert.ok(!/jelger1/i.test(html));
  assert.ok(!/jelger1/i.test(read('js/newsletter/app.js')));
  // De vaste plaatjes bestaan echt in de repo
  for (const src of srcs) {
    const rel = src.replace('https://puremindsmarketinggroup.github.io/Pure-Minds-Tool-Hub/', '');
    assert.ok(fs.existsSync(path.join(root, rel)), rel);
  }
});

test('een foto zonder https komt niet in de export; een blob-link alleen in de preview, en niet na herladen', () => {
  const s = E.starter('kort');
  const foto = E.block('foto');
  foto.img = { src: 'http://example.com/a.jpg', alt: 'x' };
  s.blocks.push(foto);
  assert.ok(!E.build(s).includes('example.com'), 'http weg');
  assert.ok(E.check(s).some((i) => i.key === 'foto' && i.block === foto.id));
  assert.equal(E.safeImg('blob:http://x/1'), '');
  assert.equal(E.safeImg('blob:http://x/1', true), 'blob:http://x/1');
  assert.equal(E.safeImg('javascript:alert(1)', true), '');
  assert.equal(E.safeImg('https://a.nl/x.jpg" onerror="x'), '');
  const preview = E.build(s, { preview: true, pending: { [foto.id]: 'blob:http://127.0.0.1/abc' } });
  assert.ok(preview.includes('src="blob:http://127.0.0.1/abc"'));
  assert.ok(!E.build(s, { pending: { [foto.id]: 'blob:http://127.0.0.1/abc' } }).includes('blob:'), 'nooit in de export');
  foto.img.src = 'blob:http://127.0.0.1/abc';
  assert.equal(E.normalize(s).blocks.at(-1).img.src, '', 'normalize gooit blob-links weg');
});

test('tekst wordt veilig: geen HTML of scripts van de gebruiker, ook niet in alt of links', () => {
  const s = E.starter('kort');
  s.blocks[0].title = '<script>alert(1)</script>';
  s.blocks[0].intro = '<img src=x onerror=alert(1)> en "quotes"';
  s.blocks[0].button = { text: '<b>klik</b>', url: 'javascript:alert(1)' };
  s.blocks[1].link = { text: 'lees', url: '" onmouseover="alert(1)' };
  s.blocks[1].body = '[klik](javascript:alert(1)) en [goed](https://pureminds.nl)';
  const foto = E.block('foto');
  foto.img.alt = '" onload="alert(1)';
  s.blocks.push(foto);
  s.name = '</title><script>x</script>';
  const html = E.build(s);
  assert.ok(!/<script/i.test(html));
  assert.ok(!/javascript:/i.test(html));
  assert.ok(!/<img src=x/i.test(html));
  assert.ok(!/" on\w+="/i.test(html), 'geen event-attributen');
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes('<a href="https://pureminds.nl"'), 'een goede link in de tekst blijft');
  assert.ok(!html.includes('class="pm-btn"'), 'knop zonder geldige link verdwijnt');
});

test('links: https, mailto en tel; www, e-mailadres en telefoonnummer worden vanzelf goed', () => {
  assert.equal(E.safeUrl('https://www.pureminds.nl/contact/'), 'https://www.pureminds.nl/contact/');
  assert.equal(E.safeUrl('www.pureminds.nl'), 'https://www.pureminds.nl');
  assert.equal(E.safeUrl('pureminds.nl/cases?x=1'), 'https://pureminds.nl/cases?x=1');
  assert.equal(E.safeUrl('info@pureminds.nl'), 'mailto:info@pureminds.nl');
  assert.equal(E.safeUrl('mailto:info@pureminds.nl?subject=Hoi'), 'mailto:info@pureminds.nl?subject=Hoi');
  assert.equal(E.safeUrl('045 369 0530'), 'tel:+31453690530');
  // Schone links: UTM-codes eraf, de rest blijft
  assert.equal(E.safeUrl('https://pureminds.nl/blog?utm_source=brevo&utm_medium=email&id=3#kop'), 'https://pureminds.nl/blog?id=3#kop');
  assert.equal(E.safeUrl('www.pureminds.nl/?utm_source=x&UTM_campaign=y'), 'https://www.pureminds.nl/');
  assert.equal(E.safeUrl('https://pureminds.nl/?page=2'), 'https://pureminds.nl/?page=2');
  const s = E.starter('kort');
  s.blocks[1].body = 'Lees [de blog](https://pureminds.nl/blog?utm_source=nieuwsbrief).';
  s.blocks[1].link = { text: 'Verder', url: 'https://pureminds.nl/x?utm_medium=email&a=1' };
  const html = E.build(s);
  assert.ok(!/utm_/i.test(html), 'geen UTM-codes in de mail');
  assert.ok(html.includes('href="https://pureminds.nl/blog"') && html.includes('href="https://pureminds.nl/x?a=1"'));
  assert.equal(E.safeUrl('tel:+31 45 369 0530'), 'tel:+31453690530');
  for (const bad of ['javascript:alert(1)', 'JAVASCRIPT:x', 'data:text/html,x', 'vbscript:x', 'ftp://a.nl', 'https://a.nl/a b', 'gewoon tekst', '12345', '', '"><x']) {
    assert.equal(E.safeUrl(bad), '', bad);
  }
});

test('opmaak in de tekst: **vet**, {voornaam}, [link](url), witregel = nieuwe alinea', () => {
  const s = E.starter('kort');
  s.blocks[1].body = 'Hoi {voornaam}, dit is **vet**.\nNieuwe regel.\n\nTweede alinea met [cases](pureminds.nl/cases).';
  const html = E.build(s);
  assert.ok(html.includes('{% if contact.FIRSTNAME %}Hoi {{ contact.FIRSTNAME }}{% else %}Beste lezer{% endif %}, dit is <strong style="font-weight:700;">vet</strong>.<br>Nieuwe regel.'));
  assert.ok(html.includes('Tweede alinea met <a href="https://pureminds.nl/cases" target="_blank" style="color:#303030;text-decoration:none;border-bottom:2px solid #1AB9E2;">cases</a>.'));
  // In de preview is {voornaam} een blokje, geen Brevo-code
  const preview = E.build(s, { preview: true });
  assert.ok(!preview.includes('contact.FIRSTNAME'));
  assert.match(preview, /<span[^>]*>voornaam<\/span>/);
});

test('{voornaam} zonder naam: "Hoi {voornaam}" vooraan wordt "Beste lezer", elders "beste lezer"', () => {
  const o = { preview: false };
  const IF = (w) => `{% if contact.FIRSTNAME %}${w} {{ contact.FIRSTNAME }}{% else %}Beste lezer{% endif %}`;
  assert.equal(E.inline('Hoi {voornaam}, welkom.', o), `${IF('Hoi')}, welkom.`);
  assert.equal(E.inline('Beste {voornaam},', o), `${IF('Beste')},`, 'geen "Beste beste lezer"');
  assert.equal(E.inline('Eerste regel\nhallo {voornaam}!', o), `Eerste regel<br>${IF('hallo')}!`, 'ook vooraan een nieuwe regel');
  const mid = 'Fijne dag {voornaam}, tot snel.';
  assert.equal(E.inline(mid, o), 'Fijne dag {{ contact.FIRSTNAME | default : "beste lezer" }}, tot snel.', 'midden in een zin: geen begroeting');
  assert.ok(!E.inline('[Lees](https://pureminds.nl) hoi {voornaam}', o).includes('{% if'), 'na een link is het geen begroeting');
  assert.ok(!E.build(real()).includes('"daar"'));
  // In de preview gewoon het blokje "voornaam"
  assert.match(E.inline('Hoi {voornaam}', { preview: true }), /^Hoi <span[^>]*>voornaam<\/span>$/);
});

test('koppen krijgen de cyaan punt, behalve na een vraagteken; links een pijl', () => {
  const s = E.starter('kort');
  s.blocks[1].title = 'Een kop zonder punt';
  s.blocks[2].title = 'Vragen?';
  const html = E.build(s);
  assert.ok(html.includes('Een kop zonder punt<span style="color:#1AB9E2;">.</span>'));
  assert.ok(html.includes('Vragen?</h2>'));
  assert.ok(html.includes('Lees verder op onze website →</a>'));
});

test('typografie: één schaal. H1 alleen in de opening, H2 boven elk blok, H3 per punt, alle lopende tekst 16/26', () => {
  const s = real();
  s.blocks.push({ ...E.block('fototekst'), side: 'rechts' }, { ...E.block('fototekst'), side: 'boven' });
  const html = E.build(s);
  const tags = (n) => Array.from(html.matchAll(new RegExp(`<h${n} class="pm-h${n}" style="([^"]*)"`, 'g')), (m) => m[1]);
  assert.equal(tags(1).length, 1, 'één H1: de kop van de opening');
  const h2 = tags(2);
  assert.equal(h2.length, s.blocks.filter((b) => ['tekst', 'fototekst', 'punten', 'afsluiter'].includes(b.type)).length, 'elk blok met een kop heeft een H2');
  for (const st of h2) assert.ok(st.includes(E.TYPE.h2), 'elke H2 even groot');
  assert.equal(tags(3).length, 3, 'de drie punten');
  for (const st of tags(3)) assert.ok(st.includes(E.TYPE.h3));
  const ps = Array.from(html.matchAll(/<p style="margin:0;[^"]*font-size:(\d+)px;line-height:(\d+)px;font-weight:400;/g), (m) => `${m[1]}/${m[2]}`);
  assert.ok(ps.length > 10);
  assert.deepEqual([...new Set(ps)], ['16/26'], 'lopende tekst overal 16/26');
  assert.ok(!/<td[^>]*font-size:(1[579]|22)px/.test(html), 'geen losse koppen of tekst meer in andere maten');
});

test('blokken: twee tekstblokken na elkaar krijgen een lijn ertussen, en elke tussenkop een cyaan streepje', () => {
  const s = E.starter('kort');   // opening, tekst, afsluiter
  const line = 'background-color:#E1E7EC;">&nbsp;</td>';
  assert.equal(count(E.build(s), line), 1, 'tussen tekst en afsluiter');
  s.blocks.splice(2, 0, E.block('fototekst'), E.block('resultaat'));
  assert.equal(count(E.build(s), line), 1, 'tekst | fototekst; het resultaat is zelf een vlak');
  const html = E.build(s);
  assert.equal(count(html, 'width="32" style="width:32px;height:4px;'), 3, 'streepje boven tekst, fototekst en afsluiter');
});

test('kop: een nieuwsbrief heeft groot "Nieuwsbrief." naast het logo met de editie; een korte mail alleen het logo', () => {
  const s = E.starter('nieuwsbrief');
  assert.equal(s.masthead, 'Nieuwsbrief');
  assert.match(s.edition, /^[A-Z][a-z]+ \d{4}$/);
  assert.equal(E.thisEdition(new Date(2026, 9, 26)), 'Oktober 2026');
  s.edition = 'Editie 12';
  const html = E.build(s);
  assert.ok(html.includes('class="pm-mast"'));
  assert.ok(html.includes('Nieuwsbrief<span style="color:#1AB9E2;">.</span></p>'));
  assert.ok(html.includes('>Editie 12</p>'));
  assert.ok(!E.build(E.starter('kort')).includes('class="pm-mast"'), 'korte mail: geen naam bovenaan');
  // Een opgeslagen nieuwsbrief van vóór de naam bovenaan krijgt hem erbij; een lege naam blijft leeg
  const old = E.starter('nieuwsbrief');
  delete old.masthead;
  delete old.edition;
  assert.equal(E.normalize(old).masthead, 'Nieuwsbrief');
  assert.equal(E.normalize({ ...s, masthead: '' }).masthead, '');
  // Online bekijken staat klein boven de mail, buiten de kop
  assert.ok(html.indexOf('{{ mirror }}') < html.indexOf('class="pm-mast"'));
});

test('foto met een link erachter is klikbaar: bij Foto en bij Foto en tekst (links, rechts en boven); een foute link niet', () => {
  for (const side of E.SIDES) {
    const s = E.starter('kort');
    const b = { ...E.block('fototekst'), side, url: 'www.pureminds.nl/blog' };
    s.blocks.splice(1, 0, b);
    assert.match(E.build(s), /<a href="https:\/\/www\.pureminds\.nl\/blog" target="_blank" style="display:block;text-decoration:none;"><img class="pm-img-full" src="https:\/\/[^"]+werkplek-bureau\.jpg"/, side);
    b.url = 'javascript:alert(1)';
    assert.ok(!E.build(s).includes('javascript:'), `${side}: foute link niet in de mail`);
    assert.ok(E.check(s).some((i) => i.key === 'link' && i.block === b.id), `${side}: de controle meldt hem`);
  }
  // Van foto naar foto en tekst (tekst erbij) en terug gaat de link mee
  const foto = { ...E.block('foto'), url: 'https://pureminds.nl/x' };
  assert.equal(E.convert(foto, 'fototekst', { side: 'boven' }).url, 'https://pureminds.nl/x');
  assert.equal(E.normalize({ blocks: [{ type: 'fototekst' }] }).blocks[0].url, '', 'oude blokken krijgen een lege link');
});

test('punten naast elkaar (kolommen, vier = twee rijen van twee) of onder elkaar (icoon links); tot vijf punten', () => {
  const s = E.starter('kort');
  const p = E.block('punten');
  s.blocks.splice(1, 0, p);
  assert.equal(p.layout, 'naast');
  const cols = (html) => count(html, 'class="pm-col');
  assert.equal(cols(E.build(s)), 3, 'drie kolommen');
  p.items.push({ icon: null, title: 'Vier', text: 'x' });
  const four = E.build(s);
  assert.equal(cols(four), 4);
  assert.equal(count(four, 'width:260px;max-width:260px;'), 4, 'vier punten: twee rijen van twee');
  p.layout = 'onder';
  const under = E.build(s);
  assert.equal(cols(under), 0, 'onder elkaar: geen kolommen');
  assert.equal(count(under, '<h3 class="pm-h3"'), 4);
  assert.equal(count(under, 'zeshoek-cyaan.png" width="20"'), 4, 'elk punt zijn zeshoek links');
  // Hoogstens vijf; een onbekende schikking wordt naast elkaar
  const n = E.normalize({ blocks: [{ type: 'punten', layout: 'raar', items: Array.from({ length: 8 }, () => ({ title: 't' })) }] }).blocks[0];
  assert.equal(n.items.length, E.MAX_POINTS);
  assert.equal(n.layout, 'naast');
  assert.equal(E.normalize({ blocks: [{ ...p }] }).blocks[0].layout, 'onder');
});

test('voet: de socials staan in de kolom van het contact, onder het adres, de telefoon en de mail', () => {
  const html = E.build(E.starter('kort'));
  const foot = html.slice(html.indexOf('<td class="pm-px" style="padding:40px 40px 36px 40px;'));
  const at = (s) => foot.indexOf(s);
  assert.ok(at('icoon-mail.png') < at('icoon-web.png') && at('icoon-web.png') < at('icoon-linkedin.png'));
  // Tussen het logo en de socials sluit geen kolom: ze zitten in dezelfde cel als het contact
  const between = foot.slice(at('icoon-adres.png'), at('icoon-linkedin.png'));
  assert.ok(!/<\/td>\s*<\/tr>\s*<tr>\s*<td colspan="2" style="padding:28px/.test(between));
  assert.ok(foot.includes('Pure Minds Marketing Group<br>Spekhofstraat 2'));
});

test('voet: het adres opent Google Maps', () => {
  const html = E.build(E.starter('kort'));
  assert.ok(html.includes('<a href="https://maps.app.goo.gl/U2DL24yAZRJD6MTHA" target="_blank" style="color:#ffffff;text-decoration:none;">Pure Minds Marketing Group<br>Spekhofstraat 2, 6466 LZ Kerkrade</a>'));
});

test('donkere modus: het logo is altijd doorzichtig (nooit gevuld); kop en voet op Inkt die ook Gmail op de iPhone niet omkeert', () => {
  const INK = 'background-color:#303030;background-image:linear-gradient(#303030,#303030);';
  for (const s of [E.starter('nieuwsbrief'), E.starter('kort')]) {
    const html = E.build(s);
    assert.ok(!/vlak\.png/.test(html), 'geen gevulde logo\'s');
    assert.equal(count(html, 'email/img/logo-wit.png'), 2, 'het witte, doorzichtige logo in kop en voet');
    assert.ok(!html.includes('logo-inkt'), 'geen inktlogo op een vlak dat in donkere modus donker wordt');
    // Kop en voet: Inkt als kleur én als achtergrondafbeelding
    const head = html.slice(html.indexOf('class="pm-container" width="600"', html.indexOf('class="pm-container" width="600"') + 1));
    assert.ok(head.slice(0, 1200).includes(INK), 'kop op Inkt');
    assert.ok(html.slice(html.lastIndexOf('<!-- EINDE BLOK -->')).includes(INK), 'voet op Inkt');
    // Witte tekst in Gmail: de twee lagen; het logo staat er nooit in (anders verkleurt het)
    assert.ok(html.includes('u + #body .pm-gm-screen { background: #000; mix-blend-mode: screen; }'));
    assert.ok(html.includes('u + #body .pm-gm-diff { background: #000; mix-blend-mode: difference; }'));
    for (const m of html.matchAll(/<div class="pm-gm-diff">([\s\S]*?)<\/div><\/div>/g)) assert.ok(!/<img/.test(m[1]), 'geen plaatje in de lagen');
    assert.ok(html.includes('<meta name="color-scheme" content="light only">'));
    assert.ok(html.includes(':root { color-scheme: light only;'));
  }
  // De losse template ook
  const tpl = read('email/pure-minds-email.html');
  assert.ok(!/vlak\.png/.test(tpl) && tpl.includes('logo-wit.png') && tpl.includes('maps.app.goo.gl'));
});

test('huisstijl: alleen 400, 700 en 800; magenta alleen voor de knop in de opening; cyaan nooit als tekst op wit', () => {
  const html = E.build(real());
  const weights = new Set(Array.from(html.matchAll(/font-weight:\s*(\d+)/g), (m) => m[1]));
  for (const w of weights) assert.ok(['400', '700', '800'].includes(w), `gewicht ${w}`);
  assert.equal(count(html, 'class="pm-btn"'), 1, 'één magenta knop');
  assert.equal(count(html.toLowerCase(), '#b61b50'), 2, 'magenta: de knop en zijn Outlook-versie');
  // Cyaan als tekstkleur alleen in de punt achter een kop, het cijfer op Inkt en de naam bovenaan (op Inkt)
  const cyanText = Array.from(html.matchAll(/(?<![-\w])color:#1AB9E2;[^"]*">([^<]*)/g), (m) => m[1]);
  for (const t of cyanText) assert.ok(t === '.' || /^\+?\d/.test(t) || t === real().masthead, `cyaan als tekst: ${t}`);
  assert.equal(count(html, 'class="pm-mast"'), 1);
});

test('preview: elk blok aanklikbaar; kop en voet vast. De export heeft geen preview-sporen', () => {
  const s = real();
  const preview = E.build(s, { preview: true });
  for (const b of s.blocks) assert.ok(preview.includes(`data-pm-blok="${b.id}"`), b.type);
  assert.ok(preview.includes('data-pm-vast="kop"') && preview.includes('data-pm-vast="voet"'));
  const html = E.build(s);
  assert.ok(!/data-pm-/.test(html));
  assert.ok(!/voornaam<\/span>/.test(html));
});

test('grootte: een gewone nieuwsbrief is klein; boven 95 KB waarschuwt de controle (Gmail knipt vanaf 102 KB)', () => {
  const html = E.build(real());
  assert.ok(E.bytes(html) < 40 * 1024, `${E.bytes(html)} bytes`);
  assert.equal(E.bytes('é'), 2);
  assert.equal(E.bytes('€'), 3);
  const big = real();
  while (big.blocks.length < E.MAX_BLOCKS) {
    const b = E.block('punten');
    b.title = 'x';
    b.items.forEach((it) => { it.title = 'Echt'; it.text = 'Een lange zin '.repeat(20); });
    big.blocks.push(b);
  }
  const issues = E.check(big);
  const size = E.bytes(E.build(big));
  assert.equal(issues.some((i) => i.key === 'groot'), size > 95 * 1024);
});

test('controle vóór het kopiëren: voorbeeldtekst, voorvertoningstekst, lege links; een echte mail is schoon', () => {
  const sample = E.check(E.starter('nieuwsbrief'));
  assert.ok(sample.some((i) => i.key === 'voorvertoning'));
  assert.ok(sample.some((i) => i.key === 'voorbeeld' && /Opening/.test(i.text)));
  assert.ok(!sample.some((i) => /Afsluiter/.test(i.text)), 'de afsluiter is echte tekst van Pure Minds');
  const ok = real();
  assert.deepEqual(E.check(ok).filter((i) => i.level === 'warn'), []);
  ok.blocks[2].link.url = 'geen link';
  ok.blocks[2].body = 'Zie [hier](nergens)';
  const bad = E.check(ok);
  assert.equal(bad.filter((i) => i.key === 'link').length, 2);
  assert.ok(bad.every((i) => i.key !== 'link' || i.block === ok.blocks[2].id));
});

test('normalize: onbekende blokken weg, ontbrekende velden erbij, hoogstens 30 blokken, dubbele id’s opgelost', () => {
  const n = E.normalize({
    preheader: 'p',
    blocks: [{ type: 'onbekend' }, { type: 'tekst', id: 'a', title: 'T' }, { type: 'tekst', id: 'a' }, { type: 'punten', items: [{ title: 'één' }] }, null, 'x'],
  });
  assert.deepEqual(n.blocks.map((b) => b.type), ['tekst', 'tekst', 'punten']);
  assert.equal(n.blocks[0].title, 'T');
  assert.equal(typeof n.blocks[0].body, 'string');
  assert.ok(n.blocks[0].link && 'url' in n.blocks[0].link);
  assert.notEqual(n.blocks[0].id, n.blocks[1].id);
  assert.equal(n.blocks[2].items.length, 2, 'minstens twee punten');
  const many = E.normalize({ blocks: Array.from({ length: 50 }, () => ({ type: 'tekst' })) });
  assert.equal(many.blocks.length, E.MAX_BLOCKS);
  assert.equal(E.normalize(null).blocks.length, E.STARTERS.nieuwsbrief.length);
  assert.equal(E.starter('kort').blocks.length, 3);
});

test('help.js: elke [?] en elk rondleidingsdoel heeft een tekst, en andersom; rail in de volgorde van sections', () => {
  const html = read('tools/nieuwsbrief.html');
  const app = read('js/newsletter/app.js');
  const sandbox = {};
  new Function('window', read('js/newsletter/help.js'))(sandbox);
  const data = sandbox.PM_HELP.newsletter;
  const helpKeys = new Set([...html.matchAll(/data-help="([^"$]+)"/g), ...app.matchAll(/data-help="([^"$]+)"/g), ...app.matchAll(/help(?:: | = )'([^']+)'/g)].map((m) => m[1]));
  for (const key of helpKeys) assert.ok(data.help[key], `PM_HELP.newsletter.help.${key}`);
  for (const key of Object.keys(data.help)) assert.ok(helpKeys.has(key), `data-help="${key}" in de HTML of app.js`);
  const targets = new Set([...html.matchAll(/data-tour="([^"]+)"/g), ...app.matchAll(/data-tour="([^"]+)"/g)].map((m) => m[1]));
  for (const step of data.tour) if (step.target) assert.ok(targets.has(step.target), `data-tour="${step.target}"`);
  const railIds = Array.from(html.matchAll(/class="rail__item" data-section="([^"]+)"/g), (m) => m[1]);
  assert.deepEqual(railIds, data.sections.map((s) => s.id));
  for (const s of data.sections) assert.ok(html.includes(`<section class="panel" data-section="${s.id}">`), s.id);
});

test('de maker laadt, staat in het register en linkt naar de handleiding voor Brevo', () => {
  const app = read('js/newsletter/app.js');
  assert.doesNotThrow(() => new vm.Script(app, { filename: 'js/newsletter/app.js' }));
  // De server van de Tool Hub (uploads en AI): een https-adres op Vercel, in js/shared/service.js
  const url = /const DEFAULT_SERVICE_URL = '([^']*)'/.exec(read('js/shared/service.js'))[1];
  assert.match(url, /^https:\/\/[a-z0-9-]+\.vercel\.app$/);
  assert.match(app, /PM\.service\.request\('\/api\/upload'/);
  const sandbox = { window: {} };
  vm.runInNewContext(read('js/shared/tools.js'), sandbox);
  const tool = sandbox.window.PM_TOOLS.find((t) => t.id === 'newsletter');
  assert.equal(tool.href, 'tools/nieuwsbrief.html');
  assert.ok(fs.existsSync(path.join(root, tool.href)));
  const sum = tool.draft.summary(real());
  assert.equal(sum.title, 'Nieuwsbrief november');
  assert.equal(sum.noun, 'nieuwsbrief');
  assert.equal(tool.draft.summary(E.starter('kort')).title, '', 'voorbeeldkop is geen titel');
  const html = read('tools/nieuwsbrief.html');
  assert.ok(html.includes('href="brevo-handleiding.html"'));
  const guide = read('tools/brevo-handleiding.html');
  for (const word of ['Create campaign', 'HTML custom code', 'Save &amp; quit', 'Preview text', 'Schedule']) assert.ok(guide.includes(word), word);
  for (const id of ['stap-1', 'stap-2', 'stap-3', 'stap-4', 'stap-5', 'stap-6', 'aanpassen']) assert.ok(guide.includes(`id="${id}"`), id);
});

test('upload-service: herkomst, alleen echte JPG en PNG, hoogstens 4 MB (inloggen: tests/account.test.js)', async () => {
  const C = await import(pathToFileURL(path.join(root, 'uploads/lib/check.js')).href);
  const ok = { origin: 'https://puremindsmarketinggroup.github.io', type: 'image/jpeg', length: 1000 };
  assert.deepEqual(C.checkRequest(ok), { ok: true, type: 'image/jpeg' });
  // Vanaf de Tool Hub (een browser stuurt Origin mee)
  assert.equal(C.checkRequest({ ...ok, origin: null }).status, 403, 'zonder herkomst (geen browser): nee');
  assert.equal(C.checkRequest({ ...ok, origin: 'https://evil.example' }).status, 403);
  assert.equal(C.checkRequest({ ...ok, origin: 'https://jelger1.github.io' }).status, 403);
  assert.equal(C.checkRequest({ ...ok, origin: 'https://evil.example' }).status, 403);
  assert.ok(C.checkRequest({ ...ok, origin: 'http://127.0.0.1:8765' }).ok, 'testen op je eigen computer');
  assert.equal(C.checkRequest({ ...ok, type: 'image/gif' }).status, 415);
  assert.equal(C.checkRequest({ ...ok, type: 'text/html' }).status, 415);
  assert.equal(C.checkRequest({ ...ok, length: C.MAX_BYTES + 1 }).status, 413);
  assert.ok(C.checkRequest({ ...ok, type: 'image/png; charset=binary' }).ok);

  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 1]);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
  assert.equal(C.sniff(jpg), 'image/jpeg');
  assert.equal(C.sniff(png), 'image/png');
  assert.equal(C.sniff(Buffer.from('<html><script>')), null);
  assert.ok(C.checkBody(jpg, 'image/jpeg').ok);
  assert.equal(C.checkBody(png, 'image/jpeg').status, 415, 'inhoud moet bij de soort passen');
  assert.equal(C.checkBody(Buffer.alloc(0), 'image/jpeg').status, 400);

  assert.equal(C.slug('Team overleg (1).JPG'), 'team-overleg-1');
  assert.equal(C.slug('../../etc/passwd'), 'etc-passwd');
  assert.equal(C.slug(''), 'afbeelding');
  assert.equal(C.blobPath('Foto Één.png', 'image/png', new Date(Date.UTC(2026, 9, 20))), 'nieuwsbrief/2026-10/foto-een.png');

  const cors = C.corsHeaders('https://puremindsmarketinggroup.github.io');
  assert.equal(cors['Access-Control-Allow-Origin'], 'https://puremindsmarketinggroup.github.io');
  assert.ok(cors['Access-Control-Allow-Headers'].includes('authorization'), 'het inlogbewijs mag mee');
  assert.ok(!('Access-Control-Allow-Origin' in C.corsHeaders('https://evil.example')));

  const limit = C.rateLimiter({ limit: 2, windowMs: 1000 });
  assert.ok(limit('ip', 0) && limit('ip', 1));
  assert.ok(!limit('ip', 2), 'derde binnen de tijd: nee');
  assert.ok(limit('ip', 1500), 'na de tijd weer ja');
  assert.ok(limit('ander', 2), 'per adres');
});

test('upload-service: geen geheimen in de repo, en Vercel krijgt alleen de map uploads', () => {
  const pkg = JSON.parse(read('uploads/package.json'));
  assert.equal(pkg.type, 'module');
  assert.ok(pkg.dependencies['@vercel/blob']);
  const api = read('uploads/api/upload.js');
  assert.match(api, /checkLogin\(request\.headers\.get\('authorization'\)/, 'alleen voor het team');
  assert.match(api, /process\.env\.BLOB_READ_WRITE_TOKEN/);
  assert.match(api, /export async function POST/);
  assert.ok(!/vercel_blob_rw_[A-Za-z0-9]/.test(api + read('uploads/lib/check.js') + read('uploads/README.md')), 'geen token');
  const ignore = read('.gitignore');
  assert.ok(ignore.includes('.env*.local') && ignore.includes('.vercel/'));
});

test('blok omzetten: foto erbij (links, rechts, boven), foto weghalen en tekst erbij houden tekst, link, foto en id', () => {
  const t = E.block('tekst');
  t.title = 'Mijn kop';
  t.body = 'Mijn **tekst**.';
  t.link = { text: 'Lees meer', url: 'https://pureminds.nl' };
  for (const side of ['links', 'rechts', 'boven']) {
    const ft = E.convert(t, 'fototekst', { side });
    assert.equal(ft.type, 'fototekst');
    assert.equal(ft.id, t.id, 'zelfde blok (selectie en preview blijven)');
    assert.equal(ft.side, side);
    assert.deepEqual([ft.title, ft.body, ft.link.url], ['Mijn kop', 'Mijn **tekst**.', 'https://pureminds.nl']);
    assert.equal(ft.img.src, '', 'nog geen foto: de maker opent Foto kiezen');
  }
  const ft = E.convert(t, 'fototekst', { side: 'boven' });
  ft.img = { src: 'https://images.unsplash.com/photo-1?ixid=x&w=1200', alt: 'Taarten', w: 1200, h: 800 };
  const back = E.convert(ft, 'tekst');
  assert.equal(back.type, 'tekst');
  assert.equal(back.id, t.id);
  assert.deepEqual([back.title, back.body, back.link.text], ['Mijn kop', 'Mijn **tekst**.', 'Lees meer']);
  assert.equal(back.img, undefined, 'een tekstblok heeft geen foto');
  const foto = E.block('foto');
  const withText = E.convert(foto, 'fototekst', { side: 'boven' });
  assert.equal(withText.img.src, foto.img.src, 'de foto blijft');
  assert.equal(withText.title, '');
  assert.equal(E.convert(t, 'fototekst', { side: 'schuin' }).side, 'links');
  assert.equal(E.normalize({ blocks: [ft] }).blocks[0].side, 'boven');
});

test('foto boven de tekst: 520 breed binnen de marge, tekst eronder, alles in balans', () => {
  const s = E.starter('kort');
  const ft = E.convert(s.blocks[1], 'fototekst', { side: 'boven' });
  ft.img = { src: 'https://images.unsplash.com/photo-1?ixid=x&w=1200', alt: 'Taarten in een vitrine', w: 1200, h: 800 };
  s.blocks[1] = ft;
  const html = E.build(s);
  assert.match(html, /<img class="pm-img-full" src="https:\/\/images\.unsplash\.com\/photo-1\?ixid=x&amp;w=1200" width="520" height="347" alt="Taarten in een vitrine"/);
  assert.ok(html.indexOf('width="520" height="347"') < html.indexOf('Een tussenkop die de alinea samenvat'), 'foto boven de kop');
  assert.equal(count(html, '<table'), count(html, '</table>'));
  assert.equal(count(html, '<tr'), count(html, '</tr>'));
  // Zonder foto (nog niet gekozen): alleen de tekst in de export, een grijs vlak in de preview
  ft.img = { src: '', alt: '' };
  assert.ok(!E.build(s).includes('width="520"'));
  assert.ok(E.build(s, { preview: true }).includes('kies een foto'));
});
