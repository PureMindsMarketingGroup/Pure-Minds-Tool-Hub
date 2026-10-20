/* Tests voor js/shared/pptx-writer.js: de XML van de vormen, zonder browser en zonder zip.
   Onderaan ook js/presentation/pptx.js: de vormen van het Business Model Canvas en de toelichting */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// De schrijver hangt zichzelf aan window; build() (de zip) gebruiken we hier niet
global.window = global;
require('../js/shared/pptx-writer.js');
const Writer = global.PMPptxWriter;

const EMU = 12192000 / 1920;   // per ontwerp-px
const emu = (v) => Math.round(v * EMU);

function writer() {
  return new Writer({ width: 1920, height: 1080, title: 'Test' });
}
const xml = (o, role = 'slide') => writer().objectXml(o, writer().part(), role);

// Eenvoudige controle op goedgevormde XML: tags sluiten in de juiste volgorde,
// attributen tussen aanhalingstekens en maar één keer, geen losse < > & in tekst
function assertWellFormed(s, what) {
  const src = s.replace(/^<\?xml[^?]*\?>\n?/, '');
  const re = /<(\/?)([A-Za-z][\w:]*)([^>]*)>/g;
  const stack = [];
  let last = 0;
  let roots = 0;
  let m;
  while ((m = re.exec(src))) {
    const text = src.slice(last, m.index);
    assert.ok(!/[<>]|&(?!(amp|lt|gt|quot|apos);)/.test(text), `${what}: losse tekens in tekst ${JSON.stringify(text)}`);
    const [, close, name, rest] = m;
    const self = rest.endsWith('/');
    const attrs = self ? rest.slice(0, -1) : rest;
    if (close) {
      assert.equal(attrs.trim(), '', `${what}: </${name}> zonder attributen`);
      assert.equal(stack.pop(), name, `${what}: </${name}> sluit de goede tag`);
    } else {
      assert.match(attrs, /^(\s+[\w:]+="[^"<]*")*\s*$/, `${what}: attributen van <${name}>`);
      const names = Array.from(attrs.matchAll(/([\w:]+)="/g), (a) => a[1]);
      assert.equal(new Set(names).size, names.length, `${what}: dubbel attribuut in <${name}>`);
      if (!stack.length) roots++;
      if (!self) stack.push(name);
    }
    last = re.lastIndex;
  }
  assert.equal(stack.length, 0, `${what}: alle tags gesloten`);
  assert.equal(src.slice(last).trim(), '', `${what}: niets na de laatste tag`);
  return roots;
}

/* --- nieuwe soorten --- */

test('lijn: verbindingslijn met prstGeom line, kader vanaf de kleinste hoek', () => {
  const s = xml({ kind: 'line', x1: 0, y1: 10, x2: 10, y2: 0, line: { color: '#ffffff', alpha: 0.35, width: 3 } });
  assert.match(s, /^<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="2" name="Lijn"\/><p:cNvCxnSpPr\/>/);
  assert.ok(s.includes('prst="line"'));
  assert.ok(s.includes('flipV="1"'), 'van linksonder naar rechtsboven: verticaal gespiegeld');
  assert.ok(!s.includes('flipH'));
  assert.ok(s.includes(`<a:off x="0" y="0"/><a:ext cx="${emu(10)}" cy="${emu(10)}"/>`));
  assert.ok(s.includes('<a:alpha val="35000"/>'));
  assert.ok(s.includes(`<a:ln w="${emu(3)}" cap="flat">`));
  assertWellFormed(s, 'lijn');
});

test('lijn: spiegelen volgt de richting, zodat het begin op (x1, y1) ligt', () => {
  const flips = (x1, y1, x2, y2) => {
    const s = xml({ kind: 'line', x1, y1, x2, y2, line: { color: '#1ab9e2', width: 4 } });
    const m = /<a:xfrm([^>]*)><a:off x="(\d+)" y="(\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(s);
    return { flipH: /flipH="1"/.test(m[1]), flipV: /flipV="1"/.test(m[1]), off: [+m[2], +m[3]], ext: [+m[4], +m[5]] };
  };
  // Zonder spiegelen loopt de lijn van linksboven naar rechtsonder
  assert.deepEqual(flips(100, 200, 300, 500), { flipH: false, flipV: false, off: [emu(100), emu(200)], ext: [emu(200), emu(300)] });
  assert.deepEqual(flips(300, 200, 100, 500), { flipH: true, flipV: false, off: [emu(100), emu(200)], ext: [emu(200), emu(300)] });
  assert.deepEqual(flips(100, 500, 300, 200), { flipH: false, flipV: true, off: [emu(100), emu(200)], ext: [emu(200), emu(300)] });
  assert.deepEqual(flips(300, 500, 100, 200), { flipH: true, flipV: true, off: [emu(100), emu(200)], ext: [emu(200), emu(300)] });
  // Horizontaal en verticaal: één maat is nul, spiegelen alleen als hij terugloopt
  assert.deepEqual(flips(910, 546, 1010, 546), { flipH: false, flipV: false, off: [emu(910), emu(546)], ext: [emu(100), 0] });
  assert.deepEqual(flips(1010, 546, 910, 546), { flipH: true, flipV: false, off: [emu(910), emu(546)], ext: [emu(100), 0] });
  assert.deepEqual(flips(500, 900, 500, 300), { flipH: false, flipV: true, off: [emu(500), emu(300)], ext: [0, emu(600)] });
});

test('lijn: pijlpunten aan begin (head) en eind (tail), na miter', () => {
  const both = xml({ kind: 'line', x1: 910, y1: 546, x2: 1010, y2: 546, line: { color: '#1ab9e2', width: 4 }, head: 'triangle', tail: 'triangle', name: 'Pijl' });
  assert.ok(both.includes('headEnd') && both.includes('tailEnd'));
  assert.ok(both.includes('<a:miter lim="800000"/><a:headEnd type="triangle"/><a:tailEnd type="triangle"/></a:ln>'), 'volgorde van het schema');
  assert.ok(both.includes('name="Pijl"'));
  assertWellFormed(both, 'pijl');

  const tail = xml({ kind: 'line', x1: 0, y1: 0, x2: 10, y2: 0, line: { color: '#1ab9e2', width: 4 }, tail: 'triangle' });
  assert.ok(!tail.includes('headEnd'));
  assert.ok(tail.includes('<a:tailEnd type="triangle"/>'));

  const plain = xml({ kind: 'line', x1: 0, y1: 0, x2: 10, y2: 0, line: { color: '#1ab9e2', width: 4 } });
  assert.ok(!plain.includes('headEnd') && !plain.includes('tailEnd'));

  // Een onbekend uiteinde wordt een driehoek, geen ongeldige XML
  const odd = xml({ kind: 'line', x1: 0, y1: 0, x2: 10, y2: 0, line: { color: '#1ab9e2', width: 4 }, head: true, tail: 'arrow' });
  assert.ok(odd.includes('<a:headEnd type="triangle"/><a:tailEnd type="arrow"/>'));

  // Met maat: breedte en lengte uit sm / med / lg, anders med
  const sized = xml({ kind: 'line', x1: 0, y1: 0, x2: 10, y2: 0, line: { color: '#1ab9e2', width: 4 }, head: { type: 'triangle', w: 'lg', len: 'lg' }, tail: { w: 'xl' } });
  assert.ok(sized.includes('<a:headEnd type="triangle" w="lg" len="lg"/><a:tailEnd type="triangle" w="med" len="med"/>'));
  assertWellFormed(sized, 'pijl met maat');
});

test('pijlen naar elkaar (►◄): twee lijnen met de punt aan het eind, de rechter gespiegeld', () => {
  // Zoals de "fit" van de waardepropositie: elk vanaf een vorm naar het midden van het gat
  const point = { type: 'triangle', w: 'lg', len: 'lg' };
  const left = xml({ kind: 'line', x1: 910, y1: 546, x2: 956, y2: 546, line: { color: '#1ab9e2', width: 4 }, tail: point });
  const right = xml({ kind: 'line', x1: 1010, y1: 546, x2: 964, y2: 546, line: { color: '#1ab9e2', width: 4 }, tail: point });
  assert.ok(!left.includes('flip'), 'links loopt naar rechts: niet spiegelen');
  assert.ok(right.includes('<a:xfrm flipH="1">'), 'rechts loopt naar links: horizontaal gespiegeld');
  assert.ok(!right.includes('flipV'));
  for (const s of [left, right]) {
    assert.ok(s.includes('<a:miter lim="800000"/><a:tailEnd type="triangle" w="lg" len="lg"/></a:ln>'), 'alleen een punt aan het eind');
    assert.ok(!s.includes('headEnd'));
  }
  assert.ok(left.includes(`<a:off x="${emu(910)}" y="${emu(546)}"/><a:ext cx="${emu(46)}" cy="0"/>`));
  assert.ok(right.includes(`<a:off x="${emu(964)}" y="${emu(546)}"/><a:ext cx="${emu(46)}" cy="0"/>`));
});

test('ovaal: prstGeom ellipse rond het middelpunt, zonder vulling alleen de rand', () => {
  const s = xml({ kind: 'ellipse', cx: 1340, cy: 546, rx: 310, ry: 310, fill: null, line: { color: '#1ab9e2', width: 5 }, name: 'Klantprofiel' });
  assert.ok(s.includes('prst="ellipse"'));
  assert.ok(s.includes(`<a:off x="${emu(1030)}" y="${emu(236)}"/><a:ext cx="${emu(620)}" cy="${emu(620)}"/>`));
  assert.ok(s.includes('<a:noFill/><a:ln w="31750" cap="flat">'));
  assert.ok(s.includes('name="Klantprofiel"'));
  assertWellFormed(s, 'ovaal');

  const filled = xml({ kind: 'ellipse', cx: 100, cy: 100, rx: 80, ry: 40, fill: { color: '#1ab9e2' }, line: null });
  assert.ok(filled.includes(`<a:ext cx="${emu(160)}" cy="${emu(80)}"/>`));
  assert.ok(filled.includes('<a:solidFill><a:srgbClr val="1AB9E2"></a:srgbClr></a:solidFill><a:ln><a:noFill/></a:ln>'));
});

test('rechthoek zonder vulling: alleen een cyaan rand', () => {
  const s = xml({ kind: 'rect', x: 270, y: 236, w: 620, h: 620, fill: null, line: { color: '#1ab9e2', width: 5 }, name: 'Waardemap' });
  assert.ok(s.includes('prst="rect"'));
  assert.ok(s.includes('<a:noFill/><a:ln w="31750" cap="flat"><a:solidFill><a:srgbClr val="1AB9E2"></a:srgbClr></a:solidFill><a:miter lim="800000"/></a:ln>'));
});

test('één beeld op elke slide (zoals de Emerce 100-badge): één keer in media, per slide een eigen relatie', () => {
  const deck = writer();
  const badge = deck.image(new Uint8Array([1, 2]), 'png', 'badge');
  assert.equal(deck.image(new Uint8Array([9]), 'png', 'badge'), badge, 'zelfde sleutel: zelfde beeld');
  const pic = { kind: 'pic', x: 1461.1, y: 887.1, w: 119, h: 44, image: badge, name: 'Emerce 100-badge' };
  deck.slide([pic]);
  deck.slide([{ kind: 'rect', x: 0, y: 0, w: 10, h: 10, fill: { color: '#1ab9e2' } }, pic]);
  assert.equal(deck.media.length, 1);
  deck.slides.forEach((objects, i) => {
    const part = deck.part();
    const s = deck.slideXml(objects, part);
    assertWellFormed(s, `slide ${i + 1}`);
    assert.ok(s.includes('name="Emerce 100-badge"'));
    assert.ok(s.includes(`<a:off x="${emu(1461.1)}" y="${emu(887.1)}"/><a:ext cx="${emu(119)}" cy="${emu(44)}"/>`));
    const img = part.rels.filter((r) => r.type.endsWith('/image'));
    assert.deepEqual(img.map((r) => r.target), ['../media/image1.png']);
    assert.ok(s.includes(`r:embed="${img[0].id}"`));
  });
});

/* --- bestaande soorten: exact dezelfde XML als voor de nieuwe soorten --- */

// Alle bestaande soorten en onderdelen, met randgevallen (nul, lege alinea, spiegelloos)
function fixture() {
  const deck = new Writer({ width: 1920, height: 1080, title: 'Test & <co>' });
  const img = deck.image(new Uint8Array([1, 2, 3]), 'jpg', 'foto');
  const img2 = deck.image(new Uint8Array([4, 5]), 'png', 'logo');
  const run = { text: 'Hallo\nwereld & "zo"', size: 42, weight: 700, track: 0.12, caps: true, color: 'rgba(255,255,255,.88)' };
  const objects = [
    { kind: 'rect', x: 0, y: 0, w: 1920, h: 16, fill: { color: '#1ab9e2' }, name: 'Balk' },
    { kind: 'rect', x: 960, y: 700, w: 960, h: 380, name: 'Verloop', fill: { gradient: { angle: 90, stops: [{ pos: 0, color: '#10283c', alpha: 0 }, { pos: 100, color: '#10283c', alpha: 0.6 }] } } },
    { kind: 'rect', x: 270, y: 236, w: 620, h: 620, fill: null, line: { color: '#1ab9e2', width: 5 } },
    { kind: 'hex', cx: 1500, cy: 430, r: 350, fill: null, line: { color: '#1ab9e2', width: 10 }, name: 'Zeshoek-lijn' },
    { kind: 'hex', cx: 1500, cy: 430, r: 350, fill: { image: img, crop: { l: 0.1, t: 0, r: 0.1, b: 0.05 } }, line: null, name: 'Foto' },
    { kind: 'hex', cx: 300, cy: 500, r: 150, fill: { color: '#1ab9e2' }, line: null, name: 'Sectienummer', text: {
      anchor: 'ctr', wrap: false, autofit: 'none',
      paragraphs: [{ runs: [{ text: '01', size: 120, weight: 800, track: -0.02, color: '#303030' }], lh: 1.362, align: 'ctr' }],
    } },
    { kind: 'hex', cx: 20, cy: 20, r: 15, fill: { color: 'rgba(26,185,226,.5)', alpha: 0.5 }, line: { color: '#fff', alpha: 0.35, width: 3 } },
    { kind: 'pic', x: 1676, y: 842, w: 116, h: 133.7, image: img2, name: 'Logo' },
    { kind: 'pic', x: 0, y: 0, w: 960, h: 1080, image: img, crop: { l: 0.2, t: 0.1, r: 0, b: 0.3 } },
    { kind: 'text', x: 128, y: 190.1, w: 1433, h: 600, anchor: 't', autofit: 'shrink', name: 'Tekst', paragraphs: [
      { runs: [{ text: 'Missie', size: 88, weight: 800, track: -0.02, color: '#ffffff' }], lh: 1.08, spcBef: 0 },
      { runs: [run, { text: 'nadruk', size: 42, weight: 700, italic: true, color: '#1ab9e2', alpha: 0.5 }], lh: 1.45, spcBef: 21.3, bullet: { char: '⬢', font: 'Segoe UI Symbol', color: '#1ab9e2', size: 0.75 }, indent: 48.3 },
      { runs: [{ text: 'rechts', size: 30, weight: 400 }], lh: 1.45, align: 'r' },
      { runs: [], endSize: 20 },
      { runs: [{ text: 'plaatje', size: 30, weight: 400 }], bullet: { image: img2, size: 0.8 } },
    ] },
    { kind: 'text', x: 10, y: 10, w: 100, h: 40, wrap: false, autofit: 'none', paragraphs: [{ runs: [{ text: 'x', size: 26, weight: 700 }], lh: 1.362 }] },
    { kind: 'table', x: 128, y: 400, colW: [800, 864], firstRow: true, name: 'Tabel', rows: [
      { h: 70, cells: [
        { paragraphs: [{ runs: [{ text: 'Onderdeel', size: 28, weight: 700, color: '#ffffff' }], lh: 1.3, align: 'l', endSize: 28 }], fill: { color: '#2c4b54' }, lineB: { color: '#1ab9e2', width: 4 }, mar: { l: 24, r: 24, t: 8, b: 8 }, anchor: 'ctr' },
        { paragraphs: [{ runs: [{ text: 'Investering', size: 28, weight: 700, color: '#ffffff' }], lh: 1.3, align: 'r', endSize: 28 }], fill: { color: '#2c4b54' }, lineB: { color: '#1ab9e2', width: 4 }, mar: { l: 24, r: 24, t: 8, b: 8 }, anchor: 'ctr' },
      ] },
      { h: 60, cells: [
        { paragraphs: [{ runs: [], lh: 1.3, endSize: 34 }], fill: null, lineB: { color: '#4d4d4d', width: 2 }, mar: { l: 24, r: 24 } },
        { paragraphs: [{ runs: [{ text: '€ 1.500,-', size: 34, weight: 400, color: '#e6e6e6' }], lh: 1.3, align: 'r' }] },
      ] },
    ] },
  ];
  const num = { kind: 'sldnum', x: 1232, y: 890, w: 400, h: 35, align: 'r', run: { size: 26, weight: 700, track: 0.04, color: 'rgba(255,255,255,.72)' } };
  deck.master({ background: img, objects: [objects[0], objects[7], num] });
  deck.layout([num]);
  deck.slide([...objects, num, null]);
  deck.slide([objects[3]]);

  const out = [];
  for (const o of [...objects, num]) {
    out.push(deck.objectXml(o, deck.part(), 'slide'));
    if (o.kind === 'sldnum') out.push(deck.objectXml(o, deck.part(), 'master'));
  }
  const master = deck.part();
  out.push(deck.masterXml(master), deck.relsXml(master.rels));
  const layout = deck.part();
  out.push(deck.layoutXml(layout), deck.relsXml(layout.rels));
  deck.slides.forEach((s) => {
    const part = deck.part();
    out.push(deck.slideXml(s, part), deck.relsXml(part.rels));
  });
  out.push(deck.presentationXml(), deck.themeXml(), deck.contentTypesXml(), deck.appPropsXml());
  return out;
}

test('bestaande soorten schrijven exact dezelfde XML als voor de ovaal en de lijn', () => {
  const out = fixture();
  // Een leesbaar voorbeeld: de rechthoek met alleen een rand
  assert.equal(out[2], '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Vorm"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>'
    + '<a:xfrm><a:off x="1714500" y="1498600"/><a:ext cx="3937000" cy="3937000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>'
    + '<a:noFill/><a:ln w="31750" cap="flat"><a:solidFill><a:srgbClr val="1AB9E2"></a:srgbClr></a:solidFill><a:miter lim="800000"/></a:ln></p:spPr></p:sp>');
  // De rest als vingerafdruk, gemaakt met de schrijver van vóór de nieuwe soorten. Verandert
  // de XML van een bestaande soort bewust, maak de vingerafdruk dan opnieuw.
  // Bewust veranderd: de regelafstand is lh / 1,2 (zie de test hieronder) en het lettertype heet
  // Pure Minds Sans (was Open Sans); de nadruk staat op 700, want een aparte 600-snede is er niet
  // meer (600 wordt Bold, zie de test hieronder); de rest is gelijk
  const hash = crypto.createHash('sha256').update(out.join('\n')).digest('hex');
  assert.equal(hash, '6743697512bc0715cc148f453a6d90d7a94b7c71f119346b6bf85a9c15295b68');
});

test('gewicht: 600 en 700 worden Pure Minds Sans vet (zoals de browser 600 als Bold toont), 800 de familie ExtraBold', () => {
  const xml = (weight) => writer().paraXml({ runs: [{ text: 'x', size: 36, weight }] }, writer().part());
  assert.equal(xml(600), xml(700));
  assert.match(xml(700), /<a:rPr [^>]*b="1"[^>]*>.*<a:latin typeface="Pure Minds Sans"\/>/);
  assert.match(xml(800), /<a:latin typeface="Pure Minds Sans ExtraBold"\/>/);
  assert.doesNotMatch(xml(800), /b="1"/);
  assert.match(xml(400), /<a:latin typeface="Pure Minds Sans"\/>/);
  assert.doesNotMatch(xml(400), /b="1"/);
});

test('regelafstand: lh gedeeld door 1,2, want 100% is in PowerPoint 1,2 × het korps', () => {
  const para = (p) => writer().paraXml({ runs: [{ text: 'x', size: 36, weight: 400 }], ...p }, writer().part());
  const spc = (lh) => {
    const m = /<a:lnSpc><a:spcPct val="(\d+)"\/><\/a:lnSpc>/.exec(para({ lh }));
    return m && Number(m[1]);
  };
  assert.equal(spc(1.45), 120833, 'lopende tekst: 1,45 × 36 px = 52,2 px tussen de regels, net als op het canvas');
  assert.equal(spc(1.08), 90000, 'titel');
  assert.equal(spc(1.2), 100000, 'enkel');
  assert.equal(spc(1.362), 113500, 'tekstvak van één regel (Pure Minds Sans)');
  assert.ok(!para({}).includes('lnSpc'), 'zonder lh: de standaard van PowerPoint');
  // Volgorde van het schema: regelafstand, dan ruimte ervoor, dan het opsommingsteken
  assert.ok(para({ lh: 1.45, spcBef: 10 }).includes('<a:pPr><a:lnSpc><a:spcPct val="120833"/></a:lnSpc><a:spcBef><a:spcPts val="500"/></a:spcBef><a:buNone/></a:pPr>'));
});

test('een slide met alle soorten is goedgevormde XML met unieke id\'s', () => {
  const deck = writer();
  const img = deck.image(new Uint8Array([1]), 'png', 'logo');
  const objects = [
    { kind: 'rect', x: 270, y: 236, w: 620, h: 620, fill: null, line: { color: '#1ab9e2', width: 5 }, name: 'Waardemap' },
    { kind: 'ellipse', cx: 1340, cy: 546, rx: 310, ry: 310, fill: null, line: { color: '#1ab9e2', width: 5 }, name: 'Klantprofiel' },
    { kind: 'line', x1: 270, y1: 236, x2: 580, y2: 546, line: { color: 'rgba(255,255,255,.35)', width: 3 } },
    { kind: 'line', x1: 1340, y1: 546, x2: 1559, y2: 327, line: { color: 'rgba(255,255,255,.35)', width: 3 } },
    { kind: 'line', x1: 910, y1: 546, x2: 1010, y2: 546, line: { color: '#1ab9e2', width: 4 }, head: 'triangle', tail: 'triangle', name: 'Pijl & "fit"' },
    { kind: 'hex', cx: 580, cy: 546, r: 40, fill: { color: '#1ab9e2' }, line: null, name: 'Middelpunt' },
    { kind: 'ellipse', cx: 100, cy: 100, rx: 50, ry: 50, fill: { color: '#1ab9e2' }, line: null, text: {
      anchor: 'ctr', wrap: false, autofit: 'none', paragraphs: [{ runs: [{ text: '1', size: 30, weight: 800, color: '#303030' }], lh: 1.362, align: 'ctr' }],
    } },
    { kind: 'pic', x: 1300, y: 300, w: 400, h: 200, image: img, name: 'Klantlogo' },
    { kind: 'text', x: 128, y: 100, w: 800, h: 50, paragraphs: [{ runs: [{ text: 'Klanttaken <&>', size: 24, weight: 700 }], lh: 1.45 }] },
  ];
  deck.slide(objects);
  const part = deck.part();
  const s = deck.slideXml(deck.slides[0], part);
  assert.equal(assertWellFormed(s, 'slide'), 1, 'één wortel');
  const ids = Array.from(s.matchAll(/<p:cNvPr id="(\d+)"/g), (m) => m[1]);
  assert.equal(ids.length, objects.length + 1);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal((s.match(/<p:cxnSp>/g) || []).length, 3);
  assert.equal((s.match(/prst="ellipse"/g) || []).length, 2);
});

test('marL: inspringen zonder opsommingsteken, zoals het vervolg van een punt in de volgende kolom', () => {
  const para = (p) => writer().paraXml({ runs: [{ text: 'vervolg', size: 20, weight: 400 }], lh: 1.4, ...p }, writer().part());
  const cont = para({ marL: 23 });
  assert.ok(cont.startsWith(`<a:p><a:pPr marL="${emu(23)}" indent="0"><a:lnSpc>`), 'tekst op de inspringing, geen hangende regel');
  assert.ok(cont.includes('<a:buNone/>'), 'geen teken');
  assertWellFormed(cont, 'vervolg');
  // Hangend inspringen (met teken) gaat voor: één marL, geen dubbel attribuut
  const both = para({ indent: 23, marL: 40, bullet: { char: '⬢', font: 'Segoe UI Symbol', color: '#1ab9e2', size: 0.75 } });
  assert.ok(both.includes(`<a:pPr marL="${emu(23)}" indent="-${emu(23)}">`));
  assertWellFormed(both, 'punt');
  for (const p of [{}, { marL: 0 }]) assert.ok(!para(p).includes('marL'), 'zonder marL: niet ingesprongen');
});

/* --- js/presentation/pptx.js: Business Model Canvas en toelichting --- */

// canvas-kit, templates en pptx.js zoals de browser ze laadt
const B = (() => {
  const sandbox = { window: { PMGenerator: require('../js/presentation/generator.js') } };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  for (const file of ['js/shared/canvas-kit.js', 'js/presentation/templates.js', 'js/presentation/pptx.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), sandbox, { filename: file });
  }
  return sandbox.window;
})();
const K = B.PMCanvas;
const S = B.PMSlides;
const G = B.PMGenerator;

// Meten zonder browser: elk teken 0,55 × het korps breed, zodat de regelval vastligt
function fakeCtx() {
  let size = 10;
  return {
    set font(v) { size = parseFloat(/([\d.]+)px/.exec(v)[1]); },
    get font() { return `${size}px`; },
    measureText: (t) => ({ width: Array.from(String(t)).length * size * 0.55 }),
  };
}

// De vormen van één slide als XML, zoals exportDeck ze schrijft (zonder master en badge)
function slideXml(objects) {
  const deck = writer();
  deck.slide(objects);
  const s = deck.slideXml(deck.slides[0], deck.part());
  assertWellFormed(s, 'slide');
  return s;
}
function planXml(slide) {
  const ctx = fakeCtx();
  const fr = S.frame();
  const deck = { slides: [slide], dot: true, showNumbers: false, badge: false };
  const p = S.plan(ctx, fr, slide, {}, deck);
  const objects = B.PMSlidesPptx.slideObjects(fr, slide, {}, p, null, 0);
  return { p, objects, xml: slideXml(objects) };
}
// Vormen en tekstvakken (<p:sp>) met hun naam
const shapes = (s) => Array.from(s.matchAll(/<p:sp>.*?<\/p:sp>/g), (m) => ({ xml: m[0], name: /name="([^"]*)"/.exec(m[0])[1] }));
// De tekst van een vorm of alinea, alle runs achter elkaar
const textOf = (xml) => Array.from(xml.matchAll(/<a:t>([^<]*)<\/a:t>/g), (m) => m[1]).join('');
const parasOf = (xml) => Array.from(xml.matchAll(/<a:p>.*?<\/a:p>/g), (m) => m[0]);

// Zolang templates.js de nieuwe layouts nog niet heeft, slaan de tests met het echte plan over
const HAS_BMC = !!(S.GEOM.bmc && S.LAYOUTS.some((l) => l.id === 'bmc'));
const HAS_TOELICHTING = !!(S.GEOM.toelichting && typeof S.flowColumns === 'function');
const HAS_VOL = !!(S.GEOM.vpc && S.GEOM.vpc.vol);

// PowerPoint-regelval (gemeten, zoals pptLine in pptx.js): regels lh × korps uit elkaar,
// de basislijn asc onder de bovenkant van de regel, after eronder
function pptLine(size, lh) {
  const pitch = lh * size;
  const asc = lh <= 1.2 ? pitch - 0.26 * size : Math.max(0.94 * size, 0.75 * pitch);
  return { pitch, asc, after: pitch - asc };
}
// De basislijn van de eerste regel van elke alinea in een tekstvak, zoals PowerPoint hem
// zet: spcBef zoals de schrijver hem wegschrijft (honderdsten van een punt), dan PowerPoint's
// afronding op hele punten. lines: het aantal regels per alinea (zoals op het canvas)
function pptBaselines(box, lines) {
  const out = [];
  let prev = null;
  box.paragraphs.forEach((p, i) => {
    const L = pptLine(p.runs[0].size, p.lh);
    const spc = Math.round(Math.round((p.spcBef || 0) * 50) / 100) * 2;
    out.push(prev ? out[i - 1] + (lines[i - 1] - 1) * prev.pitch + prev.after + spc + L.asc : box.y + L.asc);
    prev = L;
  });
  return out;
}
// Op het canvas: de basislijn van de eerste regel van elk blok of punt in een stapel, en de regels
function canvasBaselines(stack, top) {
  const out = [];
  let y = top;
  for (const b of stack.blocks) {
    if (b.empty) continue;
    y += b.gap;
    const size = b.block.st.size;
    if (b.body != null) b.block.items.forEach((it) => out.push({ base: y + it.y + K.CAP * size, lines: it.block.lines.length }));
    else out.push({ base: y + K.CAP * size, lines: b.block.lines.length });
    y += b.block.height;
  }
  return out;
}
// Hele punten: spcPts een veelvoud van 100 (PowerPoint rondt anders zelf af). Daardoor mag een
// alinea hooguit een halve punt (1 px) van het canvas af staan
const wholePoints = (box) => box.paragraphs.every((p) => Math.round((p.spcBef || 0) * 50) % 100 === 0);

test('Business Model Canvas: vlakken 393939 en balken 1AB9E2 als effen vulling zonder rand, nooit zwart',
  { skip: !HAS_BMC && 'templates.js heeft de bmc-layout nog niet' }, () => {
    const bmc = { ...G.emptyBmc(),
      partners: '**Leveranciers**\n- Fabrikanten van bureaustoelen\n- Transport\n\n**Advies**\n- Ergonomen',
      resources: '- Showroom\n- Team van adviseurs',
      proposities: '**Ergonomisch zitten**\n- Advies op maat\n- Snelle levering',
      segmenten: '- B2B: kantoren\n- B2C: thuiswerkers',
      // activiteiten, relaties en kanalen blijven leeg: daar staat de uitleg
    };
    const slide = { layout: 'bmc', label: 'business model canvas', title: '', bmc };
    const { p, xml } = planXml(slide);
    const list = shapes(xml);
    const GB = S.GEOM.bmc;
    const hex = (c) => c.replace('#', '').toUpperCase();
    assert.equal(hex(GB.fill), '393939', 'de vlakken hebben de kleur van TABLE_STYLE.zebra');

    const panels = list.filter((x) => x.name === 'Blok');
    const bars = list.filter((x) => x.name === 'Blok-balk');
    const rules = list.filter((x) => x.name === 'Scheidingslijn');
    assert.equal(panels.length, 6);
    assert.equal(bars.length, 6);
    assert.equal(rules.length, p.rules.length);
    for (const x of panels) assert.ok(x.xml.includes('<a:solidFill><a:srgbClr val="393939"></a:srgbClr></a:solidFill><a:ln><a:noFill/></a:ln>'), 'vlak: effen 393939, geen rand');
    for (const x of bars) assert.ok(x.xml.includes('<a:solidFill><a:srgbClr val="1AB9E2"></a:srgbClr></a:solidFill><a:ln><a:noFill/></a:ln>'), 'balk: effen cyaan, geen rand');
    for (const x of rules) assert.ok(x.xml.includes(`<a:solidFill><a:srgbClr val="${hex(GB.ruleColor)}"></a:srgbClr></a:solidFill><a:ln><a:noFill/></a:ln>`), 'lijn: effen, geen rand');
    // Een kleur als kale tekst in plaats van { color } wordt in PowerPoint zwart
    assert.ok(!xml.includes('val="000000"'), 'niets zwart');

    // Vlak en balk op de plek van het plan: de balk bovenin, even breed, erbovenop getekend
    p.panels.forEach((pn, i) => {
      assert.ok(panels[i].xml.includes(`<a:off x="${emu(pn.x)}" y="${emu(pn.y)}"/><a:ext cx="${emu(pn.w)}" cy="${emu(pn.h)}"/>`), `vlak ${i + 1}`);
      assert.ok(bars[i].xml.includes(`<a:off x="${emu(pn.x)}" y="${emu(pn.y)}"/><a:ext cx="${emu(pn.w)}" cy="${emu(GB.bar)}"/>`), `balk ${i + 1}`);
      assert.ok(list.indexOf(panels[i]) < list.indexOf(bars[i]));
    });

    // Per blok een eigen tekstvak, genoemd naar het blok, in de volgorde van BMC_KEYS, na de vlakken
    const names = G.BMC_KEYS.map((k) => G.BMC_INFO[k].name);
    const texts = list.filter((x) => x.xml.includes('txBox="1"') && names.includes(x.name));
    assert.deepEqual(texts.map((x) => x.name), names);
    assert.ok(list.indexOf(texts[0]) > list.indexOf(bars[5]), 'tekst boven op de vlakken');
    p.blocks.forEach((b, i) => {
      const m = /<a:off x="(\d+)" y="(-?\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(texts[i].xml);
      assert.equal(+m[1], emu(b.x), `${names[i]}: links op de tekstkolom`);
      assert.equal(+m[3], emu(b.w), `${names[i]}: precies de tekstbreedte`);
      assert.ok(+m[4] > 0, `${names[i]}: hoogte`);
    });
    // Een leeg blok toont de uitleg, een gevuld blok zijn punten met zeshoekjes
    assert.ok(textOf(texts[1].xml).includes(G.BMC_INFO.activiteiten.uitleg));
    assert.ok(texts[0].xml.includes('<a:buChar char="⬢"/>'));
    assert.ok(textOf(texts[0].xml).includes('Fabrikanten van bureaustoelen'));
  });

// Toelichting met een zelfgemaakt plan (de vorm uit het bouwplan): de stukken worden
// alinea's, het vervolg van een punt in de rechterkolom springt in zonder teken
test('toelichting: per kolom één tekstvak, stukken als alinea\'s, het vervolg van een punt zonder teken', () => {
  const ctx = fakeCtx();
  const fr = S.frame();
  const st = { size: 30, weight: 400, emWeight: 700, track: 0, lh: 1.4 };
  const lineH = st.size * st.lh;
  const indent = st.size * 1.15;
  const colW = 784;
  const lay = (text, w) => K.layoutText(ctx, K.runsFrom(text), w, st).lines;
  const hOf = (n) => st.size * K.CAP + (n - 1) * lineH + st.size * K.DESC;
  const head = lay('**Servicegericht**', colW);
  const long = lay(`**Snel en persoonlijk:** ${'we leveren binnen een week en denken mee over elke werkplek '.repeat(4).trim()}`, colW - indent);
  assert.ok(long.length >= 4, 'het punt loopt over minstens vier regels');
  const cut = 2;
  const tail = lay('Eurosit is de specialist in ergonomisch zitten.', colW);
  const pieces = [
    [
      { bullet: false, mark: false, y: 0, h: hOf(head.length), lines: head },
      { bullet: true, mark: true, y: hOf(head.length) + st.size * 0.5, h: hOf(cut), lines: long.slice(0, cut) },
    ],
    [
      { bullet: true, mark: false, y: 0, h: hOf(long.length - cut), lines: long.slice(cut) },
      { bullet: false, mark: false, y: hOf(long.length - cut) + st.size, h: hOf(tail.length), lines: tail },
    ],
  ];
  const p = {
    layout: 'toelichting', stack: { blocks: [], height: 0 }, x: fr.m, top: fr.contentTop, maxW: fr.contentW, maxH: 30, center: false, bottom: 810,
    body: { st, lineH, indent },
    columns: [0, 1].map((c) => ({ x: fr.m + c * (colW + 96), top: 400, w: colW, pieces: pieces[c] })),
  };
  const slide = { layout: 'toelichting', label: 'business model canvas', title: '', body: '' };
  const xml = slideXml(B.PMSlidesPptx.slideObjects(fr, slide, {}, p, null, 0));
  const boxes = shapes(xml).filter((x) => /^Toelichting/.test(x.name));
  assert.deepEqual(boxes.map((x) => x.name), ['Toelichting links', 'Toelichting rechts']);

  // PowerPoint-regelval (zoals pptLine in pptx.js): de eerste kap-hoogte op die van het canvas
  const pitch = st.lh * st.size;
  const asc = Math.max((1.2 - 0.26) * st.size, 0.75 * pitch);
  const capOffset = asc - K.CAP * st.size;
  p.columns.forEach((col, c) => {
    const box = boxes[c].xml;
    assert.ok(box.includes(`<a:off x="${emu(col.x)}" y="${emu(col.top - capOffset)}"/><a:ext cx="${emu(col.w)}" cy="${emu(p.bottom - (col.top - capOffset))}"/>`), `kolom ${c + 1}: plek en maat`);
    assert.ok(box.includes('<a:normAutofit/>'), 'krimpt bij overloop, zoals de andere tekstvakken');
    assert.equal(parasOf(box).length, 2, 'een alinea per stuk');
  });
  const [kop, punt] = parasOf(boxes[0].xml);
  const [vervolg, slot] = parasOf(boxes[1].xml);
  assert.ok(kop.includes('<a:buNone/>') && !kop.includes('marL'), 'kop: geen teken, niet ingesprongen');
  assert.ok(kop.includes('b="1"'), 'kop: vet');
  assert.ok(punt.includes(`<a:pPr marL="${emu(indent)}" indent="-${emu(indent)}">`) && punt.includes('<a:buChar char="⬢"/>'), 'punt: hangend met zeshoekje');
  assert.ok(vervolg.includes(`<a:pPr marL="${emu(indent)}" indent="0">`) && vervolg.includes('<a:buNone/>'), 'vervolg: ingesprongen, geen nieuw teken');
  assert.ok(slot.includes('<a:buNone/>') && !slot.includes('marL'));

  // Ruimte ervoor: de volgende kap-hoogte op die van het canvas (bovenaan een kolom: niets),
  // op hele punten zoals PowerPoint hem zet (2 ontwerp-px = 1 pt = spcPts 100)
  const after = pitch - asc;
  const spc = (para) => Number(/<a:spcBef><a:spcPts val="(\d+)"\/>/.exec(para)[1]);
  const expect = (gap) => Math.max(0, Math.round((gap - capOffset - (after - K.DESC * st.size)) / 2)) * 100;
  assert.equal(spc(kop), 0);
  assert.equal(spc(vervolg), 0);
  assert.equal(spc(punt), expect(st.size * 0.5));
  assert.equal(spc(slot), expect(st.size));

  // De woorden van de stukken, met de spaties tussen de regels terug; een spatie is alleen
  // vet tussen twee vette woorden ("Snel en persoonlijk:" blijft één vette run)
  const words = (lines) => lines.map((l) => l.segs.map((sg) => (sg.space ? ' ' : sg.text)).join('')).join(' ');
  assert.equal(textOf(punt), words(long.slice(0, cut)));
  assert.equal(textOf(vervolg), words(long.slice(cut)));
  assert.ok(/b="1"[^>]*><a:solidFill><a:srgbClr val="FFFFFF"><\/a:srgbClr><\/a:solidFill>(?:(?!<\/a:r>).)*<a:t>Snel en persoonlijk:<\/a:t>/.test(punt), 'het vette stuk als één run, in wit');
  assert.ok(punt.includes('<a:t> we leveren'), 'de spatie na het vette stuk is gewoon');
});

test('toelichting met het echte plan: dezelfde woorden als de bron, verdeeld over twee tekstvakken',
  { skip: !HAS_TOELICHTING && 'templates.js heeft de toelichting-layout nog niet' }, () => {
    const alinea = 'Eurosit richt zich op bedrijven die investeren in gezond en productief werken. De klant zoekt geen stoel, maar een oplossing voor rugklachten en verzuim.';
    const body = [
      '**Kernwaarden**',
      '- **Persoonlijk:** advies aan huis en in de showroom, afgestemd op de gebruiker en de werkplek.',
      '- **Deskundig:** ergonomisch getrainde adviseurs die weten wat werkt.',
      '',
      alinea, alinea, alinea,
      '',
      '**Kansen**',
      ...Array.from({ length: 8 }, (_, i) => `- Kans ${i + 1}: ${alinea}`),
    ].join('\n');
    const slide = { layout: 'toelichting', label: 'business model canvas', title: 'Klantrelaties', body };
    const { p, xml } = planXml(slide);
    const boxes = shapes(xml).filter((x) => /^Toelichting/.test(x.name));
    const used = p.columns.filter((c) => c.pieces.length);
    assert.equal(used.length, 2, 'lange tekst: twee kolommen');
    assert.equal(boxes.length, 2);
    // Alle woorden in dezelfde volgorde: niets dubbel of kwijt bij het splitsen
    const norm = (t) => t.replace(/\*\*/g, '').replace(/^\s*[-•]\s+/gm, '').replace(/\s+/g, ' ').trim();
    const got = boxes.map((x) => parasOf(x.xml).map(textOf).join(' ')).join(' ');
    assert.equal(norm(got), norm(body));
    // Evenveel zeshoekjes als punten die in een kolom beginnen; het vervolg zonder teken
    const all = used.flatMap((c) => c.pieces);
    assert.equal((xml.match(/<a:buChar char="⬢"\/>/g) || []).length, all.filter((pc) => pc.mark).length);
    assert.equal((xml.match(/ indent="0">/g) || []).length, all.filter((pc) => pc.bullet && !pc.mark).length);
    // De titel in zijn eigen tekstvak, met de cyaan punt
    assert.ok(shapes(xml).some((x) => x.name === 'Tekst' && textOf(x.xml) === 'Klantrelaties.'));
  });

/* --- alinea-afstand: PowerPoint zet de ruimte vóór een alinea op hele punten --- */

// Gemeten in PowerPoint: 0,25 pt wordt 0, 0,5 pt wordt 1 pt. Bij veel korte alinea's liep de
// tekst zo tot 13 px weg van het canvas; de nieuwe layouts schrijven hele punten en verrekenen
// het verschil in de volgende alinea

test('toelichting met het echte plan: elke alinea binnen een pixel van het canvas, op hele punten',
  { skip: !HAS_TOELICHTING && 'templates.js heeft de toelichting-layout nog niet' }, () => {
    const zin = 'Eurosit denkt mee over de indeling van de zaak, de looproutes en de zitcapaciteit. ';
    const body = [
      '**Persoonlijk en adviserend**', '- Veel 1-op-1 contact.', '- Klanten worden uitgebreid geholpen in de showroom.',
      '- Gesprekken kunnen twee tot drie uur duren.', `- ${zin}${zin}`, '',
      '**Relationeel**', '- Zeker bij projecten.', `- ${zin}`, zin + zin + zin, '',
      '**Servicegericht na de aankoop**', ...Array.from({ length: 6 }, (_, i) => `- Punt ${i + 1}: ${zin}`),
    ].join('\n');
    const slide = { layout: 'toelichting', label: 'business model canvas', title: 'Klantrelaties', body };
    const { p, objects } = planXml(slide);
    const cols = p.columns.filter((c) => c.pieces.length);
    const boxes = objects.filter((o) => o && /^Toelichting/.test(o.name));
    assert.equal(boxes.length, cols.length);
    cols.forEach((col, c) => {
      const box = boxes[c];
      const size = p.body.st.size;
      const lines = col.pieces.map((pc) => pc.lines.length);
      const ppt = pptBaselines(box, lines);
      col.pieces.forEach((pc, i) => {
        const canvas = col.top + pc.y + K.CAP * size;
        assert.ok(Math.abs(ppt[i] - canvas) <= 1 + 1e-9, `kolom ${c + 1}, alinea ${i + 1}: PowerPoint ${ppt[i].toFixed(2)}, canvas ${canvas.toFixed(2)}`);
      });
      assert.ok(wholePoints(box), 'ruimte ervoor op hele punten');
      // Het vak minstens zo hoog als PowerPoint de tekst rekent (anders krimpt hij bij typen)
      const last = box.paragraphs[box.paragraphs.length - 1];
      const L = pptLine(size, last.lh);
      assert.ok(box.y + box.h >= ppt[ppt.length - 1] + (lines[lines.length - 1] - 1) * L.pitch + 0.26 * size, `kolom ${c + 1}: hoog genoeg`);
    });
  });

test('Business Model Canvas: korte punten op hun plek, op hele punten, vakken hoog genoeg',
  { skip: !HAS_BMC && 'templates.js heeft de bmc-layout nog niet' }, () => {
    // Korte punten (één regel): de dichte opsomming (itemGap 0,2) haalt PowerPoint met een
    // kleinere regelafstand per punt; elke basislijn binnen een pixel van het canvas
    const kort = (kop, n) => `**${kop}**\n${Array.from({ length: n }, (_, i) => `- Punt ${i + 1}`).join('\n')}`;
    const bmc = { ...G.emptyBmc() };
    G.BMC_KEYS.forEach((k, i) => { bmc[k] = `${kort('Eerste', 3 + (i % 3))}\n\n${kort('Tweede', 2 + (i % 4))}`; });
    const slide = { layout: 'bmc', label: 'business model canvas', title: '', bmc };
    const { p, objects } = planXml(slide);
    const names = G.BMC_KEYS.map((k) => G.BMC_INFO[k].name);
    const boxes = objects.filter((o) => o && o.kind === 'text' && names.includes(o.name));
    assert.equal(boxes.length, 7);
    p.blocks.forEach((b, i) => {
      const want = canvasBaselines(b.stack, b.top);
      const box = boxes[i];
      assert.equal(box.paragraphs.length, want.length, `${names[i]}: een alinea per kop en punt`);
      assert.ok(want.every((w) => w.lines === 1), `${names[i]}: alles op één regel`);
      const ppt = pptBaselines(box, want.map((w) => w.lines));
      want.forEach((w, j) => assert.ok(Math.abs(ppt[j] - w.base) <= 1 + 1e-9, `${names[i]}, alinea ${j + 1}: PowerPoint ${ppt[j].toFixed(2)}, canvas ${w.base.toFixed(2)}`));
      assert.ok(wholePoints(box), `${names[i]}: ruimte ervoor op hele punten`);
      const size = box.paragraphs[box.paragraphs.length - 1].runs[0].size;
      assert.ok(box.y + box.h >= ppt[ppt.length - 1] + 0.26 * size, `${names[i]}: vak hoog genoeg`);
    });
  });

test('volle waardepropositie: elke strook een eigen tekstvak, genoemd naar het vak; het voorstel blijft zoals het was',
  { skip: !HAS_VOL && 'templates.js heeft de volle waardepropositie nog niet' }, () => {
    const punten = (n, woorden) => Array.from({ length: n }, (_, i) => `- Punt ${i + 1} met ${'wat woorden '.repeat(woorden).trim()}`).join('\n');
    const vpc = {
      ...G.emptyVpc(),
      verschaffers: `**Kop een**\n${punten(5, 2)}\n\n**Kop twee**\n${punten(5, 2)}`,
      voordelen: `**Verwachte voordelen**\n${punten(4, 1)}\n\n**Gewenste voordelen**\n${punten(4, 1)}`,
      taken: punten(3, 1),
    };
    const vol = planXml({ layout: 'vpc', label: 'waarde propositie canvas', title: '', style: 'vol', vpc });
    const zoneBoxes = vol.objects.filter((o) => o && o.kind === 'text').slice(-vol.p.zones.length);
    assert.ok(vol.p.zones.length > 6, 'de tekst van een vak loopt door in meer stroken');
    // Per vak: de kop als naam, de volgende stroken genummerd; elk op de plek en breedte van zijn strook
    const headOf = (key) => vol.p.zones.find((z) => z.key === key).stack.blocks[0].runs.map((r) => r.text).join('');
    const count = {};
    vol.p.zones.forEach((z, i) => {
      const box = zoneBoxes[i];
      count[z.key] = (count[z.key] || 0) + 1;
      assert.equal(box.name, count[z.key] > 1 ? `${headOf(z.key)} ${count[z.key]}` : headOf(z.key));
      assert.equal(box.x, z.x);
      assert.equal(box.w, z.w);
      assert.ok(wholePoints(box), `${box.name}: ruimte ervoor op hele punten`);
    });
    assert.ok(Object.values(count).some((n) => n > 1));
    // Alle woorden van elk vak, in volgorde, verdeeld over zijn tekstvakken
    const words = (t) => t.replace(/\*\*/g, '').replace(/^\s*-\s+/gm, '').replace(/\s+/g, ' ').trim();
    for (const key of ['verschaffers', 'voordelen', 'taken']) {
      const got = vol.p.zones.map((z, i) => (z.key === key ? zoneBoxes[i] : null)).filter(Boolean)
        .flatMap((b) => b.paragraphs.map((q) => q.runs.map((r) => r.text).join(''))).join(' ');
      assert.equal(words(got), words(`${headOf(key)}
${vpc[key]}`), key);
    }

    // Het voorstel (geen style): één tekstvak per vak, zoals voorheen genaamd 'Tekst'
    const gewoon = planXml({ layout: 'vpc', label: 'waardepropositie', title: '', vpc: { ...G.emptyVpc(), taken: '- Bellen\n- Mailen' } });
    assert.equal(gewoon.p.zones.length, 6);
    assert.deepEqual(Array.from(gewoon.objects.filter((o) => o && o.kind === 'text').slice(-6), (o) => o.name), Array(6).fill('Tekst'));
  });

test('regulier deck en voorstel: de alinea-afstand zoals voorheen, niet op hele punten', () => {
  const slide = { layout: 'bullets', label: 'aanpak', title: 'Zo werken we', subtitle: '', body: '- Eén\n- Twee\n- Drie\n- Vier' };
  const { p, objects } = planXml(slide);
  const box = objects.find((o) => o && o.kind === 'text' && o.paragraphs.length === 5);
  const body = p.stack.blocks.find((b) => b.body != null);
  const { size, lh } = body.block.st;
  // Zoals vóór de nieuwe layouts: de exacte ruimte, zonder afronding op hele punten
  const L = pptLine(size, lh);
  const room = size * 0.5 - (L.asc - K.CAP * size) - (L.after - K.DESC * size);
  box.paragraphs.slice(2).forEach((q) => {
    assert.equal(q.lh, lh);
    assert.equal(q.spcBef, Math.max(0, room));
  });
  assert.ok(box.paragraphs.slice(2).some((q) => Math.round(q.spcBef * 50) % 100 !== 0), 'geen hele punten');
});

/* --- contactregels op de afsluiter: zeshoek met een icoon uit het icon pack --- */

test('contactregels: het icoon past bij de regel (e-mail, telefoon, website, anders een persoon)', () => {
  const icon = S.contactIcon;
  assert.equal(icon('info@pureminds.nl'), 'mail');
  assert.equal(icon('[e-mailadres]'), 'mail');
  assert.equal(icon('E-mail: jan@x.nl'), 'mail');
  assert.equal(icon('045 - 3690530'), 'phone');
  assert.equal(icon('+31 (0)45 369 05 30'), 'phone');
  assert.equal(icon('Tel. 045 3690530'), 'phone');
  assert.equal(icon('[telefoonnummer]'), 'phone');
  assert.equal(icon('www.pureminds.nl'), 'web');
  assert.equal(icon('pureminds.nl'), 'web');
  assert.equal(icon('https://example.com/contact'), 'web');
  assert.equal(icon('**pureminds.nl**'), 'web', 'nadruk telt niet mee');
  assert.equal(icon('[naam] · [functie]'), 'user');
  assert.equal(icon('Jan Jansen'), 'user');
  assert.equal(icon('2024'), 'user', 'een kort getal is geen telefoonnummer');
  // De vier iconen bestaan als pad met alleen M, L, C en Z (PDF-veilig, ook als vector in PowerPoint)
  for (const name of ['mail', 'phone', 'web', 'user']) {
    const cmds = K.ICONS[name];
    assert.ok(cmds.length > 4, name);
    assert.ok(cmds.every((c) => ({ M: 3, L: 3, C: 7, Z: 1 })[c[0]] === c.length && c.slice(1).every((v) => v >= 0 && v <= 24)), name);
  }
});

test('vrije vorm (path): custGeom met moveTo, lnTo, cubicBezTo en close, geschaald naar het vak', () => {
  const s = xml({ kind: 'path', x: 100, y: 200, w: 48, h: 48, view: 24, cmds: [['M', 0, 0], ['L', 24, 0], ['C', 24, 12, 12, 24, 0, 24], ['Z']], fill: { color: '#303030' }, line: null, name: 'Icoon' });
  assert.ok(s.includes(`<a:off x="${emu(100)}" y="${emu(200)}"/><a:ext cx="${emu(48)}" cy="${emu(48)}"/>`));
  assert.ok(s.includes(`<a:path w="${emu(48)}" h="${emu(48)}"><a:moveTo><a:pt x="0" y="0"/></a:moveTo><a:lnTo><a:pt x="${emu(48)}" y="0"/></a:lnTo><a:cubicBezTo>`));
  assert.ok(s.includes('<a:close/></a:path>'));
  assert.ok(s.includes('<a:solidFill><a:srgbClr val="303030">'), 'inkt, geen zwart');
  assertWellFormed(s, 'vrije vorm');
});

test('afsluiter: per contactregel een cyaan zeshoek met het icoon in inkt, de tekst zonder ⬢ en ingesprongen', () => {
  const slide = { layout: 'closing', label: 'contact', title: 'Bedankt', subtitle: 'Vragen?', body: 'www.pureminds.nl\n045 - 3690530\ninfo@pureminds.nl' };
  const { p, objects, xml: s } = planXml(slide);
  const hexes = objects.filter((o) => o && o.kind === 'hex' && /^Icoon/.test(o.name));
  const icons = objects.filter((o) => o && o.kind === 'path');
  assert.equal(hexes.length, 3);
  assert.deepEqual(Array.from(icons, (o) => o.name), ['Icoon website', 'Icoon telefoon', 'Icoon e-mail']);
  hexes.forEach((h) => { assert.equal(JSON.stringify(h.fill), JSON.stringify({ color: K.COLORS.cyan })); assert.equal(h.line, null); });
  icons.forEach((o) => assert.equal(JSON.stringify(o.fill), JSON.stringify({ color: K.COLORS.ink })));
  // Op de plek van het canvas: midden op de kap-hoogte van de regel, het icoon midden in de zeshoek
  const body = p.stack.blocks.find((b) => b.body != null);
  let top = p.top;
  for (const b of p.stack.blocks) { if (b === body) break; if (!b.empty) top += b.gap + b.block.height; }
  top += body.gap;
  const size = body.block.st.size;
  body.block.items.forEach((it, i) => {
    assert.ok(Math.abs(hexes[i].cy - (top + it.y + (K.CAP * size) / 2)) < 1e-6);
    assert.ok(Math.abs(icons[i].x + icons[i].w / 2 - hexes[i].cx) < 1e-6);
    assert.ok(hexes[i].cx + (hexes[i].r * K.SQRT3) / 2 < p.x + body.block.indent - size * 0.4, 'lucht tussen zeshoek en tekst');
  });
  // De zeshoeken raken elkaar niet
  for (let i = 1; i < hexes.length; i++) assert.ok(hexes[i].cy - hexes[i].r > hexes[i - 1].cy + hexes[i - 1].r);
  // Tekst: geen opsommingsteken, wel ingesprongen zoals op het canvas
  const box = objects.find((o) => o && o.kind === 'text' && o.name === 'Tekst');
  const paras = box.paragraphs.slice(-3);
  paras.forEach((q) => { assert.equal(q.bullet, null); assert.equal(q.indent, 0); assert.equal(q.marL, body.block.indent); });
  assert.ok(!s.includes('⬢'));
});

test('andere layouts houden het zeshoekje als opsommingsteken', () => {
  const { objects } = planXml({ layout: 'bullets', label: 'aanpak', title: 'Zo werken we', body: '- Eén\n- Twee' });
  const box = objects.find((o) => o && o.kind === 'text' && o.paragraphs.length === 3);
  box.paragraphs.slice(1).forEach((q) => { assert.equal(q.bullet.char, '⬢'); assert.equal(q.indent, q.runs[0].size * 1.15); });
  assert.ok(!objects.some((o) => o && o.kind === 'path'));
});

/* --- layout 2: slides zonder de vormen van de master (bmc en vpc) --- */

test('plainLayout: tweede layout met showMasterSp="0", alleen voor de slides die erom vragen', () => {
  const deck = writer();
  const bar = { kind: 'rect', x: 0, y: 0, w: 1920, h: 16, fill: { color: '#1ab9e2' }, name: 'Balk' };
  deck.master({ background: null, objects: [bar] });
  deck.layout([]);
  deck.plainLayout([bar]);
  deck.slide([bar]);
  deck.slide([bar], 2);
  assert.deepEqual(deck.slideLayouts, [1, 2]);
  const master = deck.part();
  const m = deck.masterXml(master);
  assertWellFormed(m, 'master');
  assert.ok(m.includes('<p:sldLayoutId id="2147483649" r:id="rId1"/><p:sldLayoutId id="2147483650" r:id="rId3"/>'));
  assert.ok(master.rels.some((r) => r.id === 'rId3' && r.target === '../slideLayouts/slideLayout2.xml'));
  const plain = deck.part();
  const l2 = deck.plainLayoutXml(plain);
  assertWellFormed(l2, 'layout 2');
  assert.ok(l2.includes('showMasterSp="0"'), 'de vormen van de master verborgen, de achtergrond blijft');
  assert.ok(l2.includes('name="Balk"'), 'de balk staat op de layout zelf');
  assert.ok(plain.rels.some((r) => r.target === '../slideMasters/slideMaster1.xml'));
  const rel = (i) => { const part = deck.part(); deck.slideXml(deck.slides[i], part, deck.slideLayouts[i]); return part.rels[0].target; };
  assert.equal(rel(0), '../slideLayouts/slideLayout1.xml');
  assert.equal(rel(1), '../slideLayouts/slideLayout2.xml');
  assert.ok(deck.contentTypesXml().includes('/ppt/slideLayouts/slideLayout2.xml'));
  // Zonder plainLayout: layout 1, en de master en content types zonder layout 2
  const bare = writer();
  bare.slide([bar], 2);
  assert.deepEqual(bare.slideLayouts, [1]);
  assert.ok(!bare.masterXml(bare.part()).includes('2147483650'));
  assert.ok(!bare.contentTypesXml().includes('slideLayout2'));
});

// exportDeck zonder browser: canvas, zip en lettertypes nagebootst; geeft de bestanden van de zip
async function exportFiles(state) {
  const noop = () => ({ addColorStop() {} });
  const canvas = () => {
    const ctx = new Proxy(fakeCtx(), { get: (t, k) => (k in t ? t[k] : noop) });
    return { width: 0, height: 0, getContext: () => ctx };
  };
  class Zip {
    constructor() { this.files = {}; }
    file(name, data) { this.files[name] = data; }
    async generateAsync() { return this.files; }
  }
  const win = {
    PMGenerator: G,
    PM: { fontsReady: Promise.resolve(), canvasToBlob: async () => new Uint8Array([1]), libs: { jszip: async () => Zip } },
    PM_BRAND: { logoWhite: 'data:image/png;base64,AA==' },
  };
  win.window = win;
  const sandbox = { window: win, document: { createElement: canvas }, atob: (s) => Buffer.from(s, 'base64').toString('binary'), setTimeout };
  vm.createContext(sandbox);
  for (const file of ['js/shared/canvas-kit.js', 'js/presentation/templates.js', 'js/shared/pptx-writer.js', 'js/presentation/pptx.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), sandbox, { filename: file });
  }
  return win.PMSlidesPptx.exportDeck(state, () => ({}), {});
}

test('exportDeck: bmc en vpc op layout 2 zonder slidenummer; andere slides en decks zoals voorheen', async () => {
  const slides = [
    { id: 'a', layout: 'bullets', label: 'aanpak', title: 'Zo werken we', body: '- Eén' },
    { id: 'b', layout: 'bmc', label: 'business model canvas', title: '', bmc: { ...G.emptyBmc(), partners: '- Leveranciers' } },
    { id: 'c', layout: 'vpc', label: 'waarde propositie canvas', title: '', style: 'vol', vpc: G.emptyVpc() },
    { id: 'd', layout: 'vpc', label: 'waardepropositie', title: '', vpc: G.emptyVpc() },
  ];
  const files = await exportFiles({ slides, dot: true, showNumbers: true, badge: false });
  const layoutOf = (i) => /slideLayout(\d)\.xml/.exec(files[`ppt/slides/_rels/slide${i}.xml.rels`])[1];
  assert.deepEqual([1, 2, 3, 4].map(layoutOf), ['1', '2', '2', '2']);
  assert.ok(files['ppt/slides/slide1.xml'].includes('type="sldNum"'), 'gewone slide: het nummerveld');
  for (const i of [2, 3, 4]) {
    const s = files[`ppt/slides/slide${i}.xml`];
    assert.ok(!s.includes('type="sldNum"') && !s.includes('name="Logo"') && !s.includes('pureminds'), `slide ${i}: geen nummer, logo of voetregel`);
  }
  const l2 = files['ppt/slideLayouts/slideLayout2.xml'];
  assert.ok(l2.includes('showMasterSp="0"') && l2.includes('name="Balk"') && !l2.includes('name="Logo"'));
  // Logo en voetregel blijven op de master (voor alle andere slides)
  const master = files['ppt/slideMasters/slideMaster1.xml'];
  assert.ok(master.includes('name="Logo"') && master.includes('name="pureminds.nl"'));
  // Een deck zonder canvas: geen layout 2, alles op layout 1
  const plain = await exportFiles({ slides: [slides[0]], dot: true, showNumbers: true, badge: false });
  assert.ok(!('ppt/slideLayouts/slideLayout2.xml' in plain));
  assert.ok(!plain['ppt/slideMasters/slideMaster1.xml'].includes('2147483650'));
  assert.ok(!plain['ppt/slideMasters/_rels/slideMaster1.xml.rels'].includes('slideLayout2') && !plain['[Content_Types].xml'].includes('slideLayout2'));
  assert.ok(files['ppt/slideMasters/_rels/slideMaster1.xml.rels'].includes('slideLayout2'));
});

test('sprekersnotities: alleen als er notities zijn, met notitiemaster, op de goede plek en als goede XML', () => {
  const plain = writer();
  plain.slide([]);
  assert.ok(!plain.hasNotes);
  assert.ok(!plain.presentationXml().includes('notesMaster'), 'zonder notities blijft het bestand zoals het was');
  assert.ok(!plain.contentTypesXml().includes('notesSlide'));

  const deck = writer();
  deck.slide([], 1, 'Vertel eerst over **SEO**.\n\nDan over <ads> & "budget".');
  deck.slide([], 1, '');
  assert.ok(deck.hasNotes);
  const pres = deck.presentationXml();
  assertWellFormed(pres, 'presentation.xml');
  assert.ok(pres.includes('</p:sldMasterIdLst><p:notesMasterIdLst><p:notesMasterId r:id="rId5"/></p:notesMasterIdLst><p:sldIdLst>'), 'na de slidemaster, id na 2 slides en het thema');
  const types = deck.contentTypesXml();
  assertWellFormed(types, '[Content_Types].xml');
  assert.ok(types.includes('/ppt/notesSlides/notesSlide1.xml') && !types.includes('notesSlide2.xml'), 'alleen slides met notities');
  assert.ok(types.includes('/ppt/notesMasters/notesMaster1.xml') && types.includes('/ppt/theme/theme2.xml'));
  const note = deck.notesSlideXml(deck.slideNotes[0]);
  assertWellFormed(note, 'notesSlide1.xml');
  assertWellFormed(deck.notesMasterXml(), 'notesMaster1.xml');
  assert.ok(note.includes('<a:t>Vertel eerst over SEO.</a:t>'), 'zonder nadruktekens');
  assert.ok(note.includes('<a:p><a:endParaRPr lang="nl-NL" dirty="0"/></a:p>'), 'witregel blijft');
  assert.ok(note.includes('<a:t>Dan over &lt;ads&gt; &amp; &quot;budget&quot;.</a:t>'));
});
