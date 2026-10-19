/* Tests voor js/shared/brand.js: gelijk aan de CSS en de templates, en de controles */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const brand = require('../js/shared/brand.js');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('kleuren zijn gelijk aan de CSS-variabelen in global.css', () => {
  const css = read('css/global.css');
  const root = css.slice(css.indexOf(':root'), css.indexOf('}', css.indexOf(':root')));
  const vars = Object.fromEntries(Array.from(root.matchAll(/--pm-([\w-]+):\s*(#[0-9a-f]{6})/gi), (m) => [m[1].replace(/-(\w)/g, (_, c) => c.toUpperCase()), m[2].toLowerCase()]));
  assert.ok(Object.keys(vars).length >= 14);
  for (const [name, hex] of Object.entries(vars)) assert.equal(brand.COLORS[name], hex, `--pm-${name}`);
});

test('kleuren zijn gelijk aan COLORS in canvas-kit.js', () => {
  const js = read('js/shared/canvas-kit.js');
  const block = js.slice(js.indexOf('const COLORS'), js.indexOf('};', js.indexOf('const COLORS')));
  const colors = Array.from(block.matchAll(/(\w+):\s*'(#[0-9a-f]{6})'/gi), (m) => [m[1], m[2].toLowerCase()]);
  assert.ok(colors.length >= 10);
  for (const [name, hex] of colors) assert.equal(brand.COLORS[name], hex, name);
});

test('formaten en raster zijn gelijk aan de post-templates', () => {
  const js = read('js/insta/templates.js');
  for (const [id, f] of Object.entries(brand.POST.formats)) {
    const m = js.match(new RegExp(`${id}:\\s*\\{\\s*w:\\s*(\\d+),\\s*h:\\s*(\\d+)`));
    assert.ok(m, id);
    assert.deepEqual([f.w, f.h], [Number(m[1]), Number(m[2])], id);
  }
  assert.match(js, new RegExp(`margin:\\s*${brand.POST.margin},`));
  assert.match(js, new RegExp(`bar:\\s*${brand.POST.bar},`));
  assert.match(js, new RegExp(`storySafe:\\s*${brand.POST.storySafe},`));
  assert.match(js, new RegExp(`title:\\s*\\{\\s*size:\\s*${brand.TYPE.post.title.size},`));
  assert.match(js, new RegExp(`TITLE_MIN = ${brand.TYPE.post.title.min};`));
});

test('slidemaat en marges zijn gelijk aan de Presentation Maker', () => {
  const js = read('js/presentation/templates.js');
  assert.match(js, new RegExp(`const W = ${brand.SLIDE.w};`));
  assert.match(js, new RegExp(`const H = ${brand.SLIDE.h};`));
  assert.match(js, new RegExp(`m:\\s*${brand.SLIDE.margin},`));
  assert.match(js, new RegExp(`v:\\s*${brand.SLIDE.vmargin},`));
});

test('exportmaten kloppen met de tabel in de README', () => {
  assert.deepEqual(brand.exportSize('portrait', 1080), { w: 1080, h: 1350 });
  assert.deepEqual(brand.exportSize('portrait', 1200), { w: 1200, h: 1500 });
  assert.deepEqual(brand.exportSize('story', 1200), { w: 1200, h: 2133 });
  assert.deepEqual(brand.exportSize('story', 2160), { w: 2160, h: 3840 });
  assert.deepEqual(brand.exportSize('square'), { w: 1080, h: 1350 }, '1:1 bestaat niet meer');
  assert.deepEqual(brand.exportSize('onbekend'), { w: 1080, h: 1350 }, 'onbekend wordt 4:5');
  assert.deepEqual(brand.EXPORT.post.map((e) => e.width), [1080, 1200, 2160]);
});

test('typeschaal: alleen klein, normaal en groot, op even pixels', () => {
  assert.deepEqual(brand.SIZES.map((s) => s.id), ['klein', 'normaal', 'groot']);
  assert.equal(brand.sizeFor(80, 'normaal'), 80);
  assert.equal(brand.sizeFor(80, 'groot'), 92);
  assert.equal(brand.sizeFor(80, 'klein'), 68);
  assert.equal(brand.sizeFor(80, 'reusachtig'), 80, 'onbekende stap = normaal');
  for (const s of brand.SIZES) assert.equal(brand.sizeFor(34, s.id) % 2, 0);
});

test('typeschaal: normaal laat elke kop in de post-templates exact gelijk (pixels blijven gelijk)', () => {
  const js = read('js/insta/templates.js');
  // De basisgroottes die de templates aan titleSize() geven
  const bases = Array.from(js.matchAll(/titleSize\((\d+|TYPE\.title\.size), d\)/g), (m) => (m[1] === 'TYPE.title.size' ? brand.TYPE.post.title.size : Number(m[1])));
  // 72 drie keer: blog (staand en liggend) en carousel
  assert.deepEqual(bases.sort((a, b) => a - b), [68, 72, 72, 72, 80, 88]);
  for (const b of bases) {
    assert.equal(brand.sizeFor(b, 'normaal'), b, `normaal op ${b}`);
    assert.ok(brand.sizeFor(b, 'groot') > b && brand.sizeFor(b, 'klein') < b, `stappen rond ${b}`);
  }
});

test('photoCheck: groot genoeg is ok, zonder melding', () => {
  const r = brand.photoCheck(3000, 2000, 1080, 1080, 1);
  assert.equal(r.level, 'ok');
  assert.equal(r.ok, true);
  assert.equal(r.message, '');
  // Tot 1,25× vergroten zie je niet
  assert.equal(brand.photoCheck(1000, 1000, 1080, 1080, 1).level, 'ok');
});

test('photoCheck: te veel vergroot geeft let-op, veel te klein geeft te-klein', () => {
  const warn = brand.photoCheck(800, 800, 1080, 1080, 1);
  assert.equal(warn.level, 'let-op');
  assert.equal(warn.ok, false);
  assert.match(warn.message, /800 × 800 px/);
  assert.match(warn.message, /1,4× vergroot/);
  assert.match(warn.message, /1\.080 × 1\.080 px/);
  const bad = brand.photoCheck(400, 300, 1080, 1080, 1);
  assert.equal(bad.level, 'te-klein');
  assert.match(bad.message, /te klein/);
  assert.deepEqual(bad.need, { w: 1440, h: 1080 });
});

test('photoCheck: rekent met de exportmaat en met inzoomen', () => {
  // 1500 px is genoeg voor Instagram, niet voor extra scherp (2160 px)
  assert.equal(brand.photoCheck(1500, 1500, 1080, 1080, 1).level, 'ok');
  assert.equal(brand.photoCheck(1500, 1500, 1080, 1080, 2160 / 1080).level, 'let-op');
  assert.equal(brand.photoCheck(1500, 1500, 1080, 1080, 1, { zoom: 2 }).level, 'let-op');
  const zoomed = brand.photoCheck(1500, 1500, 1080, 1080, 1, { zoom: 3 });
  assert.equal(zoomed.level, 'te-klein');
  assert.match(zoomed.message, /zoom minder in/);
  // Een liggende foto in een staand vak: de hoogte bepaalt
  assert.equal(brand.photoCheck(2000, 1000, 1080, 1350, 1).level, 'let-op');
});

test('photoCheck: geen of ongeldige maten geven geen melding', () => {
  for (const args of [[0, 0, 1080, 1080], [NaN, 100, 1080, 1080], [1000, 1000, 0, 0], []]) {
    const r = brand.photoCheck(...args);
    assert.equal(r.level, 'ok');
    assert.equal(r.message, '');
  }
});

test('textFit: past niet, kleiner gemaakt, of gewoon goed', () => {
  const over = brand.textFit({ overflow: true, name: 'de kop' });
  assert.equal(over.level, 'te-lang');
  assert.match(over.message, /^De kop is te lang/);
  const small = brand.textFit({ size: 60, base: 80, name: 'de kop' });
  assert.equal(small.level, 'let-op');
  assert.match(small.message, /60 in plaats van 80 px/);
  assert.equal(brand.textFit({ size: 72, base: 80 }).level, 'ok');
  assert.equal(brand.textFit().level, 'ok');
});

test('safeZone: alleen een story heeft balken, geschaald met de export', () => {
  const s = brand.safeZone('story');
  assert.equal(s.active, true);
  assert.equal(s.top, 250);
  assert.equal(s.bottom, 250);
  assert.equal(s.rects.length, 2);
  assert.match(s.message, /250 px boven en onder/);
  assert.equal(brand.safeZone('story', 2160).top, 500);
  const sq = brand.safeZone('portrait');
  assert.equal(sq.active, false);
  assert.equal(sq.message, '');
});
