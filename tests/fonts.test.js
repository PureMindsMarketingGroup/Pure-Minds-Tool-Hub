/* Tests: de tools gebruiken alleen Regular 400, Bold 700 en ExtraBold 800 (met cursief). De andere
   snedes staan wel in assets/fonts (de hele familie), maar geen tool laadt, tekent of sluit ze in:
   elke snede is een download. Een gewicht 600 kiest in de browser vanzelf Bold, 300 en 500 Regular. */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const list = (dir, ext) => fs.readdirSync(path.join(root, dir)).filter((f) => f.endsWith(ext)).map((f) => `${dir}/${f}`);

// Gegenereerde bestanden (base64 en data) slaan we over
const GENERATED = /(pdf-fonts|brand-data|icon-data|icon-fill-data|icon-tags|photo-data)\.js$/;
const STYLES = ['normal', 'bold', 'extrabold', 'italic', 'bolditalic'];

test('geen Light, Medium of SemiBold in de code: alleen 400, 700 en 800', () => {
  const files = [
    ...list('css', '.css'), ...list('tools', '.html'), 'index.html', 'js/hub.js',
    ...['shared', 'insta', 'document', 'presentation', 'styleguide', 'icons', 'newsletter'].flatMap((d) => list(`js/${d}`, '.js')),
  ].filter((f) => !GENERATED.test(f));
  const rules = [
    [/font-weight:\s*(300|500|600)\b/, 'font-weight 300/500/600'],
    [/(?<![-\w])(?:weight|emWeight):\s*[^,}\n]*\b(300|500|600)\b/, 'weight 300/500/600'],
    [/PARA\(\d+,\s*(300|500|600)\)/, 'PARA met 300/500/600'],
    [/setFont\([^,]+,\s*(300|500|600)\b/, 'setFont met 300/500/600'],
    [/\bfont\(ctx,\s*(300|500|600)\b/, 'font(ctx, …) met 300/500/600'],
    [/textWidth\([^)]*,\s*(300|500|600)\)/, 'textWidth met 300/500/600'],
    [/\b(300|500|600)\s+\d+(?:\.\d+)?px\b/, 'canvasfont met 300/500/600'],
    [/SemiBold|semibold|PureMindsSans-Light|Light 300|Medium 500/, 'SemiBold, Light of Medium'],
  ];
  const hits = [];
  for (const f of files) {
    const src = read(f);
    for (const [re, what] of rules) {
      const m = re.exec(src);
      if (m) hits.push(`${f}:${src.slice(0, m.index).split('\n').length}: ${what} (${m[0].trim()})`);
    }
  }
  assert.deepEqual(hits, []);
});

test('de browser laadt alleen Regular, Bold en ExtraBold (met cursief), en wacht op die drie', () => {
  const css = read('css/global.css');
  const blocks = Array.from(css.matchAll(/@font-face\s*\{([^}]*)\}/g), (m) => m[1]);
  const faces = blocks.map((b) => /PureMindsSans-(\w+)\.ttf/.exec(b)[1]);
  assert.deepEqual([...faces].sort(), ['Bold', 'BoldItalic', 'ExtraBold', 'ExtraBoldItalic', 'Italic', 'Regular']);
  // Elke regel heeft het gewicht en de stijl van zijn bestand
  const weightOf = { Regular: 400, Italic: 400, Bold: 700, BoldItalic: 700, ExtraBold: 800, ExtraBoldItalic: 800 };
  blocks.forEach((b, i) => {
    assert.equal(Number(/font-weight:\s*(\d+)/.exec(b)[1]), weightOf[faces[i]], `${faces[i]}: gewicht`);
    assert.equal(/font-style:\s*italic/.test(b), /Italic$/.test(faces[i]), `${faces[i]}: cursief`);
    assert.ok(fs.existsSync(path.join(root, 'assets', 'fonts', `PureMindsSans-${faces[i]}.ttf`)), `${faces[i]}.ttf`);
  });
  // Nergens anders een @font-face (een losse snede in een tool-CSS laadt toch)
  for (const f of list('css', '.css').filter((x) => x !== 'css/global.css')) assert.ok(!/@font-face/.test(read(f)), f);
  // PM.fontsReady (canvas en PDF wachten erop) laadt precies deze drie gewichten
  assert.match(read('js/shared/core.js'), /Promise\.all\(\[400, 700, 800\]\.map\(\(w\) => document\.fonts\.load/);
});

test('pdfFontStyle: 600 wordt Bold en 300/500 Regular, zoals de browser kiest; PMPdfCanvas volgt hem altijd', () => {
  const core = read('js/shared/core.js');
  // eslint-disable-next-line no-new-func
  const pdfFontStyle = new Function(`${/function pdfFontStyle\([\s\S]*?\n {2}\}\r?\n/.exec(core)[0]}\nreturn pdfFontStyle;`)();
  assert.deepEqual([300, 400, 500, 600, 700, 800, 900].map((w) => pdfFontStyle(w)), ['normal', 'normal', 'normal', 'bold', 'bold', 'extrabold', 'extrabold']);
  assert.deepEqual([400, 600, 700].map((w) => pdfFontStyle(w, true)), ['italic', 'bolditalic', 'bolditalic']);
  // De Document Maker geeft het berekende gewicht als tekst ("700")
  assert.deepEqual(['400', '600', '700', '800'].map((w) => pdfFontStyle(w)), ['normal', 'bold', 'bold', 'extrabold']);
  // Elke uitkomst is een snede die in de PDF-lettertypen staat
  for (const w of [300, 400, 500, 600, 700, 800, 900]) {
    assert.ok(STYLES.includes(pdfFontStyle(w)) && STYLES.includes(pdfFontStyle(w, true)), String(w));
  }
  // Geen eigen snedekeuze per export meer (die bestond alleen voor Light in de styleguide)
  assert.ok(!/fontStyle/.test(read('js/shared/pdf-canvas.js')), 'PMPdfCanvas heeft geen fontStyle-optie');
});

test('PDF en Word: alleen normal, bold, extrabold, italic en bolditalic, en pdf-fonts.js is bijgewerkt', () => {
  // Het script (de regelvorm leest ook tests/styleguide.test.js)
  const script = Array.from(read('scripts/build-brand-data.js').matchAll(/^ {2}(\w+): '(PureMindsSans-\w+\.ttf)',\r?$/gm), (m) => [m[1], m[2]]);
  assert.deepEqual(script.map(([k]) => k), STYLES);
  // Het gegenereerde bestand: dezelfde sleutels en bestanden, met de bytes van nu (anders: node scripts/build-brand-data.js)
  const data = Array.from(read('js/shared/pdf-fonts.js').matchAll(/^ {2}(\w+): \{ file: '([^']+)', data: '([^']+)' \},\r?$/gm), (m) => [m[1], m[2], m[3]]);
  assert.deepEqual(data.map(([k, file]) => [k, file]), script);
  for (const [k, file, b64] of data) {
    assert.ok(b64 === fs.readFileSync(path.join(root, 'assets', 'fonts', file)).toString('base64'), `${k}: ${file} is bijgewerkt`);
  }
  // Word sluit Regular en ExtraBold in (Bold maakt Word van de Regular); geen andere families
  const docx = read('js/document/docx.js');
  assert.deepEqual(Array.from(docx.matchAll(/\{ name: '([^']+)', data: fonts\.(\w+)\.data \}/g), (m) => [m[1], m[2]]),
    [['Pure Minds Sans', 'normal'], ['Pure Minds Sans ExtraBold', 'extrabold']]);
  assert.deepEqual([...new Set(Array.from(docx.matchAll(/'(Pure Minds Sans[^']*)'/g), (m) => m[1]))].sort(), ['Pure Minds Sans', 'Pure Minds Sans ExtraBold']);
  // PowerPoint: dezelfde twee families (600 wordt vet, zie tests/pptx-writer.test.js)
  const pptx = read('js/shared/pptx-writer.js');
  assert.deepEqual([...new Set(Array.from(pptx.matchAll(/'(Pure Minds Sans[^']*)'/g), (m) => m[1]))].sort(), ['Pure Minds Sans', 'Pure Minds Sans ExtraBold']);
});
