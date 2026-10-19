/* Tests voor js/insta/export.js: wat je krijgt bij downloaden */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { plan, pdfPage } = require('../js/insta/export.js');

const PORTRAIT = { w: 1080, h: 1350 };
const STORY = { w: 1080, h: 1920 };
const LANDSCAPE = { w: 1080, h: 566 };

test('een losse post: PNG of JPG op de exportmaat', () => {
  assert.deepEqual(plan({ fmt: PORTRAIT }), { kind: 'png', type: 'png', pages: 1, linkedin: false, summary: '1 PNG · 1080 × 1350 px', note: 'Instagram: PNG op de maat van het kanaal.' });
  assert.equal(plan({ fmt: STORY, width: 1200, type: 'jpg' }).summary, '1 JPG · 1200 × 2133 px');
  assert.equal(plan({ fmt: PORTRAIT, width: 2160 }).summary, '1 PNG · 2160 × 2700 px');
});

test('liggend (1,91:1): de liggende maat van Instagram en LinkedIn', () => {
  assert.equal(plan({ fmt: LANDSCAPE }).summary, '1 PNG · 1080 × 566 px');
  assert.equal(plan({ fmt: LANDSCAPE, width: 1200 }).summary, '1 PNG · 1200 × 629 px');
  assert.equal(plan({ fmt: LANDSCAPE, width: 2160, type: 'jpg' }).summary, '1 JPG · 2160 × 1132 px');
  assert.deepEqual(pdfPage(LANDSCAPE), { w: 810, h: 424.5 });
});

test('een losse post als PDF: één pagina, bewerkbaar in Canva', () => {
  const p = plan({ fmt: PORTRAIT, type: 'pdf' });
  assert.equal(p.kind, 'pdf');
  assert.equal(p.pages, 1);
  assert.equal(p.summary, '1 PDF · bewerkbaar in Canva');
  assert.equal(plan({ fmt: PORTRAIT, width: 2160, type: 'pdf' }).kind, 'pdf', 'de breedte maakt voor een PDF niet uit');
});

test('carousel: zip met afbeeldingen, of één PDF met een pagina per slide', () => {
  assert.equal(plan({ carousel: true, slides: 3, fmt: PORTRAIT }).summary, "zip met 3 PNG's · 1080 × 1350 px");
  assert.equal(plan({ carousel: true, slides: 3, fmt: PORTRAIT, type: 'jpg' }).kind, 'zip');
  const pdf = plan({ carousel: true, slides: 5, fmt: PORTRAIT, type: 'pdf' });
  assert.deepEqual([pdf.kind, pdf.pages, pdf.linkedin], ['pdf', 5, false]);
  assert.equal(pdf.summary, "1 PDF met 5 pagina's · bewerkbaar in Canva");
});

test('carousel voor LinkedIn: altijd de PDF voor LinkedIn, wat er ook gekozen is', () => {
  for (const type of ['png', 'jpg', 'pdf']) {
    const p = plan({ carousel: true, slides: 3, fmt: PORTRAIT, width: 1200, type });
    assert.deepEqual([p.kind, p.pages, p.linkedin, p.summary], ['pdf', 3, true, "1 PDF voor LinkedIn met 3 pagina's"]);
  }
  assert.equal(plan({ carousel: true, slides: 1, fmt: PORTRAIT, width: 1200 }).summary, '1 PDF voor LinkedIn met 1 pagina');
});

test('alleen deze slide: één bestand, ook bij LinkedIn', () => {
  assert.equal(plan({ carousel: true, slides: 3, fmt: PORTRAIT, only: 1 }).summary, '1 PNG · slide 2 · 1080 × 1350 px');
  assert.equal(plan({ carousel: true, slides: 3, fmt: PORTRAIT, width: 1200, only: 0 }).kind, 'png');
  const pdf = plan({ carousel: true, slides: 3, fmt: PORTRAIT, type: 'pdf', only: 2 });
  assert.deepEqual([pdf.kind, pdf.pages, pdf.summary], ['pdf', 1, '1 PDF · slide 3 · bewerkbaar in Canva']);
});

test('de uitleg onder de download hoort bij wat je krijgt', () => {
  assert.match(plan({ fmt: PORTRAIT, type: 'pdf' }).note, /Canva.*Uploaden/);
  assert.match(plan({ carousel: true, slides: 3, fmt: PORTRAIT, width: 1200 }).note, /LinkedIn/);
  assert.match(plan({ carousel: true, slides: 3, fmt: PORTRAIT }).note, /^Eén zip/);
  assert.equal(plan({ fmt: PORTRAIT, width: 1200 }).note, 'LinkedIn: PNG op de maat van het kanaal.');
  assert.equal(plan({ fmt: PORTRAIT, width: 2160, type: 'jpg' }).note, 'JPG op dubbele maat, voor een groot scherm of drukwerk.');
});

test('onbekend bestandstype valt terug op PNG', () => {
  assert.equal(plan({ fmt: PORTRAIT, type: 'gif' }).kind, 'png');
});

test('PDF-pagina: 0,75 pt per ontwerp-px, zoals de LinkedIn-PDF', () => {
  assert.deepEqual(pdfPage(PORTRAIT), { w: 810, h: 1012.5 });
  assert.deepEqual(pdfPage(STORY), { w: 810, h: 1440 });
});
