/* =============================================================================
   pptx-writer.js — schrijft een PowerPoint-bestand (.pptx) zonder bibliotheek
   -----------------------------------------------------------------------------
   Een .pptx is een zip met XML (Office Open XML). Deze schrijver kent precies
   genoeg daarvan voor de Presentation Maker: een master met achtergrond en
   vaste onderdelen, en per slide tekstvakken, vormen (rechthoek, zeshoek,
   ovaal, lijn), foto's en het slidenummer. Alles wordt opgegeven in
   ontwerp-pixels (1920 × 1080); de schrijver rekent om naar EMU's en punten.
   De slide is 13,333 × 7,5 inch ("breedbeeld" in PowerPoint), dus
   1 ontwerp-px = 0,5 pt, net als in de PDF-export.

     const deck = new PMPptxWriter({ width: 1920, height: 1080, title });
     const foto = deck.image(blob, 'jpeg', 'sleutel');
     deck.master({ background: foto, objects: [...] });
     deck.layout([...]);
     deck.plainLayout([...]);            // optioneel: layout 2, zonder de vormen van de master
     deck.slide([...]);                  // op layout 1
     deck.slide([...], 2);               // op layout 2
     deck.slide([...], 1, 'notities');   // met sprekersnotities (Notities in PowerPoint)
     const blob = await deck.build();

   Objecten (maten in ontwerp-px, kleuren als '#rrggbb' of 'rgba(...)'):
     { kind: 'rect', x, y, w, h, fill, line, name }       fill: null = alleen de rand
     { kind: 'hex', cx, cy, r, fill, line, text, name }   puntige zeshoek, r = straal
     { kind: 'ellipse', cx, cy, rx, ry, fill, line, text, name }   ovaal of cirkel om (cx, cy)
     { kind: 'line', x1, y1, x2, y2, line, head, tail, name }   rechte lijn van
           (x1, y1) naar (x2, y2); head / tail: pijlpunt aan begin / eind, als
           'triangle' of { type: 'triangle', w, len } (w, len: 'sm' | 'med' | 'lg')
     { kind: 'path', x, y, w, h, view, cmds, fill, line, name }   vrije vorm (zoals een
           icoon): cmds [['M', x, y], ['L', x, y], ['C', x1, y1, x2, y2, x, y], ['Z']]
           in een vak van view × view, geschaald naar w × h; als vector bewerkbaar
     { kind: 'pic', x, y, w, h, image, crop, name }       crop: { l, t, r, b } als fractie
     { kind: 'text', x, y, w, h, anchor, wrap, autofit, paragraphs, name }
     { kind: 'sldnum', x, y, w, h, align, run }           slidenummer (veld)
     { kind: 'table', x, y, colW, rows, firstRow, name }   tabel; rows: [{ h, cells: [{
           paragraphs, fill, lineL/R/T/B: { color, width }, mar: { l, r, t, b }, anchor }] }]
   fill:  { color, alpha } | { image, crop }
          | { gradient: { angle, stops: [{ pos, color, alpha }] } } | null
   line:  { color, alpha, width } | null
   text:  { anchor: 't' | 'ctr' | 'b', wrap: true | false,
            autofit: 'shrink' | 'none', paragraphs }
   paragraphs: [{ runs, lh, spcBef, align, bullet, indent, marL }]
          lh: afstand tussen de regels als factor van het korps (zoals op het canvas)
          indent: hangend inspringen (het opsommingsteken links, de tekst op indent)
          marL: alleen inspringen, zonder teken: het vervolg van een opsommingspunt
                dat doorloopt in de volgende kolom (genegeerd naast indent)
   runs:  [{ text, size, weight, italic, color, alpha, track, caps }]
          size in ontwerp-px, track als fractie van de korpsgrootte
   bullet: { char, font, color, size }  size als fractie van de tekstgrootte
   ============================================================================= */
(function (global) {
  'use strict';

  const PM = global.PM;

  const SLIDE_CX = 12192000;   // 13,333 inch in EMU (914400 per inch)
  // Regelafstand 100% is in PowerPoint 1,2 × het korps (gemeten met Open Sans; niet
  // de 1,362 em van het lettertype zelf). lh 1,45 wordt dus 121%
  const PPT_SINGLE = 1.2;
  const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
  const CT = 'application/vnd.openxmlformats-officedocument.';
  const SLIDENUM_ID = '{B6F15528-21DE-4FAA-801E-634DDDAF4B2B}';
  const LINE_ENDS = ['triangle', 'stealth', 'diamond', 'oval', 'arrow'];  // uiteinden die het schema kent

  const esc = (s) => String(s == null ? '' : s)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // '#rgb', '#rrggbb', 'rgb()' of 'rgba()' -> { hex: 'RRGGBB', alpha }
  function parseColor(value) {
    const s = String(value || '').trim();
    let m = /^#([0-9a-f]{3,8})$/i.exec(s);
    if (m) {
      let hex = m[1];
      if (hex.length <= 4) hex = hex.split('').map((c) => c + c).join('');
      return { hex: hex.slice(0, 6).toUpperCase(), alpha: hex.length === 8 ? parseInt(hex.slice(6), 16) / 255 : 1 };
    }
    m = /rgba?\(([^)]+)\)/.exec(s);
    if (m) {
      const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      const hex = p.slice(0, 3).map((n) => Math.round(n).toString(16).padStart(2, '0')).join('').toUpperCase();
      return { hex, alpha: p.length > 3 ? p[3] : 1 };
    }
    return { hex: '000000', alpha: 1 };
  }

  function clr(color, alphaMul = 1) {
    const c = parseColor(color);
    const a = Math.max(0, Math.min(1, c.alpha * (alphaMul == null ? 1 : alphaMul)));
    return `<a:srgbClr val="${c.hex}">${a < 1 ? `<a:alpha val="${Math.round(a * 100000)}"/>` : ''}</a:srgbClr>`;
  }

  // Welke Pure Minds Sans-snede PowerPoint gebruikt: sneden buiten regular/bold zijn
  // op Windows en Mac aparte lettertypefamilies
  function face(weight) {
    const w = parseInt(weight, 10) || 400;
    if (w >= 800) return { typeface: 'Pure Minds Sans ExtraBold', bold: false };
    if (w >= 600) return { typeface: 'Pure Minds Sans', bold: true };   // 600 wordt Bold, net als in de browser
    return { typeface: 'Pure Minds Sans', bold: false };
  }

  class PMPptxWriter {
    constructor({ width, height, title = 'Presentatie', author = 'Pure Minds' }) {
      this.w = width;
      this.h = height;
      this.emu = SLIDE_CX / width;
      this.title = title;
      this.author = author;
      this.media = [];
      this.mediaKeys = new Map();
      this.slides = [];
      this.masterDef = { background: null, objects: [] };
      this.layoutObjects = [];
      this.plainObjects = null;   // layout 2 (plainLayout), alleen als die gebruikt wordt
      this.slideLayouts = [];     // per slide: layout 1 of 2
      this.slideNotes = [];       // per slide: sprekersnotities (tekst) of ''
    }

    px(v) { return Math.round(v * this.emu); }

    /** Afbeelding (Blob of Uint8Array) toevoegen; geeft een index terug voor fill.image / pic.image */
    image(data, ext, key) {
      if (key != null && this.mediaKeys.has(key)) return this.mediaKeys.get(key);
      const e = ext === 'jpg' ? 'jpeg' : ext;
      const index = this.media.length;
      this.media.push({ data, ext: e, name: `image${index + 1}.${e}` });
      if (key != null) this.mediaKeys.set(key, index);
      return index;
    }

    master(def) { this.masterDef = def; }
    layout(objects) { this.layoutObjects = objects; }
    // Tweede layout die de vormen van de master verbergt (showMasterSp="0"): alleen de
    // achtergrond van de master blijft, plus deze objecten. Voor slides zonder logo en
    // voetregel (het business model canvas en de waardepropositie)
    plainLayout(objects) { this.plainObjects = objects; }
    slide(objects, layout = 1, notes = '') {
      this.slides.push(objects.filter(Boolean));
      this.slideLayouts.push(layout === 2 && this.plainObjects ? 2 : 1);
      this.slideNotes.push(String(notes || '').replace(/\*\*/g, '').trim());
    }

    // Zijn er sprekersnotities? Alleen dan komen er notitiepagina's (en hun master) in het bestand
    get hasNotes() { return this.slideNotes.some(Boolean); }

    /* --- onderdelen van een part (master, layout of slide): relaties en id's --- */

    part() {
      const rels = [];
      const images = new Map();
      const rel = (type, target) => {
        const id = `rId${rels.length + 1}`;
        rels.push({ id, type, target });
        return id;
      };
      return {
        rels, rel, ids: 2,
        image: (i) => {
          if (!images.has(i)) images.set(i, rel(`${REL}image`, `../media/${this.media[i].name}`));
          return images.get(i);
        },
      };
    }

    /* --- bouwstenen --- */

    xfrm(o, flip = '') {
      return `<a:xfrm${flip}><a:off x="${this.px(o.x)}" y="${this.px(o.y)}"/><a:ext cx="${this.px(o.w)}" cy="${this.px(o.h)}"/></a:xfrm>`;
    }

    srcRect(crop) {
      if (!crop) return '<a:srcRect/>';
      const f = (v) => Math.max(0, Math.round((v || 0) * 100000));
      return `<a:srcRect l="${f(crop.l)}" t="${f(crop.t)}" r="${f(crop.r)}" b="${f(crop.b)}"/>`;
    }

    fillXml(fill, part) {
      if (!fill) return '<a:noFill/>';
      if (fill.image != null) {
        return `<a:blipFill rotWithShape="1"><a:blip r:embed="${part.image(fill.image)}"/>${this.srcRect(fill.crop)}<a:stretch><a:fillRect/></a:stretch></a:blipFill>`;
      }
      if (fill.gradient) {
        const g = fill.gradient;
        const stops = g.stops.map((s) => `<a:gs pos="${Math.round(s.pos * 1000)}">${clr(s.color, s.alpha)}</a:gs>`).join('');
        return `<a:gradFill rotWithShape="1"><a:gsLst>${stops}</a:gsLst><a:lin ang="${Math.round((g.angle || 0) * 60000)}" scaled="0"/></a:gradFill>`;
      }
      return `<a:solidFill>${clr(fill.color, fill.alpha)}</a:solidFill>`;
    }

    // head / tail: pijlpunt aan het begin / eind van een lijn (na miter, zoals het schema eist).
    // Zonder maat kiest PowerPoint 'med': drie keer de lijndikte
    lineXml(line, head, tail) {
      if (!line) return '<a:ln><a:noFill/></a:ln>';
      const size = (v) => (['sm', 'med', 'lg'].includes(v) ? v : 'med');
      const end = (tag, e) => {
        if (!e) return '';
        const t = e.type || e;
        const type = LINE_ENDS.includes(t) ? t : 'triangle';
        const dims = e.w || e.len ? ` w="${size(e.w)}" len="${size(e.len)}"` : '';
        return `<a:${tag} type="${type}"${dims}/>`;
      };
      return `<a:ln w="${this.px(line.width || 1)}" cap="flat"><a:solidFill>${clr(line.color, line.alpha)}</a:solidFill><a:miter lim="800000"/>${end('headEnd', head)}${end('tailEnd', tail)}</a:ln>`;
    }

    // Puntige zeshoek (punt boven), zoals het logo
    hexGeom(w, h) {
      const cx = this.px(w);
      const cy = this.px(h);
      const pts = [[cx / 2, 0], [cx, cy / 4], [cx, (3 * cy) / 4], [cx / 2, cy], [0, (3 * cy) / 4], [0, cy / 4]];
      const path = pts.map(([x, y], i) => {
        const tag = i ? 'lnTo' : 'moveTo';
        return `<a:${tag}><a:pt x="${Math.round(x)}" y="${Math.round(y)}"/></a:${tag}>`;
      }).join('');
      return `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst><a:path w="${cx}" h="${cy}">${path}<a:close/></a:path></a:pathLst></a:custGeom>`;
    }

    // Vrije vorm: alle deelpaden in één pad, zodat de gaten (de lijnen van een icoon) open blijven
    pathGeom(o) {
      const cx = this.px(o.w);
      const cy = this.px(o.h);
      const view = o.view || 24;
      const pt = (x, y) => `<a:pt x="${Math.round((x / view) * cx)}" y="${Math.round((y / view) * cy)}"/>`;
      const path = o.cmds.map((c) => {
        if (c[0] === 'M') return `<a:moveTo>${pt(c[1], c[2])}</a:moveTo>`;
        if (c[0] === 'L') return `<a:lnTo>${pt(c[1], c[2])}</a:lnTo>`;
        if (c[0] === 'C') return `<a:cubicBezTo>${pt(c[1], c[2])}${pt(c[3], c[4])}${pt(c[5], c[6])}</a:cubicBezTo>`;
        return '<a:close/>';
      }).join('');
      return `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst><a:path w="${cx}" h="${cy}">${path}</a:path></a:pathLst></a:custGeom>`;
    }

    rPr(r) {
      const f = face(r.weight);
      const size = Math.round(r.size * 50);                       // px -> honderdsten van een punt
      const spc = r.track ? Math.round(r.track * r.size * 50) : 0;
      const attrs = `lang="nl-NL" sz="${size}"${f.bold ? ' b="1"' : ''}${r.italic ? ' i="1"' : ''}${spc ? ` spc="${spc}"` : ''}${r.caps ? ' cap="all"' : ''} dirty="0"`;
      return `<a:rPr ${attrs}><a:solidFill>${clr(r.color || '#ffffff', r.alpha)}</a:solidFill><a:latin typeface="${esc(f.typeface)}"/><a:cs typeface="${esc(f.typeface)}"/></a:rPr>`;
    }

    runXml(r) {
      const rPr = this.rPr(r);
      return String(r.text == null ? '' : r.text).split('\n')
        .map((part, i) => `${i ? `<a:br>${rPr}</a:br>` : ''}${part ? `<a:r>${rPr}<a:t>${esc(part)}</a:t></a:r>` : ''}`)
        .join('');
    }

    paraXml(p, part) {
      const attrs = [];
      if (p.indent) attrs.push(`marL="${this.px(p.indent)}" indent="-${this.px(p.indent)}"`);
      else if (p.marL) attrs.push(`marL="${this.px(p.marL)}" indent="0"`);
      if (p.align) attrs.push(`algn="${p.align}"`);
      let props = '';
      if (p.lh) props += `<a:lnSpc><a:spcPct val="${Math.round((p.lh / PPT_SINGLE) * 100000)}"/></a:lnSpc>`;
      props += `<a:spcBef><a:spcPts val="${Math.max(0, Math.round((p.spcBef || 0) * 50))}"/></a:spcBef>`;
      if (p.bullet && p.bullet.image != null) {
        // Opsommingsteken als afbeelding
        props += `<a:buSzPct val="${Math.round((p.bullet.size || 1) * 100000)}"/><a:buBlip><a:blip r:embed="${part.image(p.bullet.image)}"/></a:buBlip>`;
      } else if (p.bullet) {
        props += `<a:buClr>${clr(p.bullet.color)}</a:buClr><a:buSzPct val="${Math.round((p.bullet.size || 1) * 100000)}"/>`
          + `<a:buFont typeface="${esc(p.bullet.font || 'Segoe UI Symbol')}" pitchFamily="34" charset="0"/><a:buChar char="${esc(p.bullet.char)}"/>`;
      } else {
        props += '<a:buNone/>';
      }
      const runs = (p.runs || []).map((r) => this.runXml(r)).join('');
      const last = p.runs && p.runs[p.runs.length - 1];
      // Grootte van het alinea-einde: bepaalt ook de hoogte van een lege alinea (lege tabelcel)
      const endSize = last ? last.size : p.endSize;
      return `<a:p><a:pPr${attrs.length ? ` ${attrs.join(' ')}` : ''}>${props}</a:pPr>${runs}<a:endParaRPr lang="nl-NL"${endSize ? ` sz="${Math.round(endSize * 50)}"` : ''}/></a:p>`;
    }

    // Eén tabelcel: tekst, marges, randen en vulling (in die volgorde, zoals het schema eist)
    cellXml(c, part) {
      const body = `<a:txBody><a:bodyPr/><a:lstStyle/>${c.paragraphs.map((p) => this.paraXml(p, part)).join('')}</a:txBody>`;
      const ln = (tag, l) => (l
        ? `<a:${tag} w="${this.px(l.width)}" cap="flat" cmpd="sng" algn="ctr"><a:solidFill>${clr(l.color)}</a:solidFill><a:prstDash val="solid"/><a:round/><a:headEnd type="none" w="med" len="med"/><a:tailEnd type="none" w="med" len="med"/></a:${tag}>`
        : `<a:${tag} w="12700" cmpd="sng"><a:noFill/></a:${tag}>`);
      const m = c.mar || {};
      const fill = c.fill ? `<a:solidFill>${clr(c.fill.color)}</a:solidFill>` : '<a:noFill/>';
      return `<a:tc>${body}<a:tcPr marL="${this.px(m.l || 0)}" marR="${this.px(m.r || 0)}" marT="${this.px(m.t || 0)}" marB="${this.px(m.b || 0)}" anchor="${c.anchor || 'ctr'}">`
        + `${ln('lnL', c.lineL)}${ln('lnR', c.lineR)}${ln('lnT', c.lineT)}${ln('lnB', c.lineB)}${fill}</a:tcPr></a:tc>`;
    }

    txBody(t, part) {
      const fit = t.autofit === 'shrink' ? '<a:normAutofit/>' : '<a:noAutofit/>';
      const bodyPr = `<a:bodyPr wrap="${t.wrap === false ? 'none' : 'square'}" lIns="0" tIns="0" rIns="0" bIns="0" rtlCol="0" anchor="${t.anchor || 't'}">${fit}</a:bodyPr>`;
      return `<p:txBody>${bodyPr}<a:lstStyle/>${t.paragraphs.map((p) => this.paraXml(p, part)).join('')}</p:txBody>`;
    }

    spXml(part, o, geom) {
      const id = part.ids++;
      return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${esc(o.name || 'Vorm')}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>`
        + `<p:spPr>${this.xfrm(o)}${geom}${this.fillXml(o.fill, part)}${this.lineXml(o.line)}</p:spPr>`
        + (o.text ? this.txBody(o.text, part) : '')
        + '</p:sp>';
    }

    objectXml(o, part, role) {
      switch (o.kind) {
        case 'rect':
          return this.spXml(part, o, '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>');
        case 'hex': {
          const w = o.r * Math.sqrt(3);
          const h = o.r * 2;
          return this.spXml(part, { ...o, x: o.cx - w / 2, y: o.cy - o.r, w, h }, this.hexGeom(w, h));
        }
        case 'path':
          return this.spXml(part, o, this.pathGeom(o));
        case 'ellipse':
          return this.spXml(part, { ...o, x: o.cx - o.rx, y: o.cy - o.ry, w: o.rx * 2, h: o.ry * 2 }, '<a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom>');
        case 'line': {
          // Een lijn loopt van linksboven naar rechtsonder in zijn kader. Spiegelen
          // legt het begin op (x1, y1): flipH als hij naar links loopt, flipV als hij
          // omhoog loopt. Zo staat een pijlpunt (head/tail) ook aan de goede kant.
          const id = part.ids++;
          const box = { x: Math.min(o.x1, o.x2), y: Math.min(o.y1, o.y2), w: Math.abs(o.x2 - o.x1), h: Math.abs(o.y2 - o.y1) };
          const flip = `${o.x2 < o.x1 ? ' flipH="1"' : ''}${o.y2 < o.y1 ? ' flipV="1"' : ''}`;
          return `<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="${id}" name="${esc(o.name || 'Lijn')}"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr>`
            + `<p:spPr>${this.xfrm(box, flip)}<a:prstGeom prst="line"><a:avLst/></a:prstGeom>${this.lineXml(o.line, o.head, o.tail)}</p:spPr></p:cxnSp>`;
        }
        case 'pic': {
          const id = part.ids++;
          return `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="${esc(o.name || 'Afbeelding')}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>`
            + `<p:blipFill><a:blip r:embed="${part.image(o.image)}"/>${this.srcRect(o.crop)}<a:stretch><a:fillRect/></a:stretch></p:blipFill>`
            + `<p:spPr>${this.xfrm(o)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
        }
        case 'text': {
          const id = part.ids++;
          return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${esc(o.name || 'Tekst')}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>`
            + `<p:spPr>${this.xfrm(o)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>${this.txBody(o, part)}</p:sp>`;
        }
        case 'table': {
          // Echte PowerPoint-tabel: rijen en kolommen blijven bewerkbaar, ook in Google Slides
          const id = part.ids++;
          const w = o.colW.reduce((a, b) => a + b, 0);
          const h = o.rows.reduce((a, r) => a + r.h, 0);
          const grid = o.colW.map((cw) => `<a:gridCol w="${this.px(cw)}"/>`).join('');
          const rows = o.rows.map((r) => `<a:tr h="${this.px(r.h)}">${r.cells.map((c) => this.cellXml(c, part)).join('')}</a:tr>`).join('');
          return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="${esc(o.name || 'Tabel')}"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr>`
            + `<p:xfrm><a:off x="${this.px(o.x)}" y="${this.px(o.y)}"/><a:ext cx="${this.px(w)}" cy="${this.px(h)}"/></p:xfrm>`
            + `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="${o.firstRow ? 1 : 0}" bandRow="1"/><a:tblGrid>${grid}</a:tblGrid>${rows}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
        }
        case 'sldnum': {
          const id = part.ids++;
          const idx = role === 'master' ? '4294967295' : '12';
          return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Slidenummer"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldNum" sz="quarter" idx="${idx}"/></p:nvPr></p:nvSpPr>`
            + `<p:spPr>${this.xfrm(o)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>`
            + `<p:txBody><a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" rtlCol="0" anchor="t"><a:noAutofit/></a:bodyPr><a:lstStyle/>`
            + `<a:p><a:pPr algn="${o.align || 'r'}"><a:buNone/></a:pPr><a:fld id="${SLIDENUM_ID}" type="slidenum">${this.rPr(o.run)}<a:t>‹#›</a:t></a:fld><a:endParaRPr lang="nl-NL"/></a:p></p:txBody></p:sp>`;
        }
        default:
          return '';
      }
    }

    treeHead() {
      return '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>'
        + '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
    }

    tree(objects, part, role) {
      return `<p:spTree>${this.treeHead()}${objects.filter(Boolean).map((o) => this.objectXml(o, part, role)).join('')}</p:spTree>`;
    }

    /* --- parts --- */

    masterXml(part) {
      const d = this.masterDef;
      const bg = d.background != null
        ? `<a:blipFill dpi="0" rotWithShape="1"><a:blip r:embed="${part.image(d.background)}"/><a:srcRect/><a:stretch><a:fillRect/></a:stretch></a:blipFill>`
        : `<a:solidFill>${clr(d.color || '#303030')}</a:solidFill>`;
      const tree = this.tree(d.objects || [], part, 'master');
      const layoutRel = part.rel(`${REL}slideLayout`, '../slideLayouts/slideLayout1.xml');
      part.rel(`${REL}theme`, '../theme/theme1.xml');
      // Layout 2 alleen als hij er is: zonder blijft de master precies zoals hij was
      const plainRel = this.plainObjects ? part.rel(`${REL}slideLayout`, '../slideLayouts/slideLayout2.xml') : null;
      const plainId = plainRel ? `<p:sldLayoutId id="2147483650" r:id="${plainRel}"/>` : '';
      // Donkere master: tekst die je in PowerPoint toevoegt wordt wit (tx1 = lt1)
      return `${XML}<p:sldMaster xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:cSld><p:bg><p:bgPr>${bg}<a:effectLst/></p:bgPr></p:bg>${tree}</p:cSld>`
        + '<p:clrMap bg1="dk1" tx1="lt1" bg2="dk2" tx2="lt2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>'
        + `<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="${layoutRel}"/>${plainId}</p:sldLayoutIdLst></p:sldMaster>`;
    }

    layoutXml(part) {
      const tree = this.tree(this.layoutObjects, part, 'layout');
      part.rel(`${REL}slideMaster`, '../slideMasters/slideMaster1.xml');
      return `${XML}<p:sldLayout xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}" type="blank" preserve="1"><p:cSld name="Pure Minds">${tree}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
    }

    // Layout 2: de vormen van de master verborgen ("achtergrondafbeeldingen verbergen" in
    // PowerPoint), de achtergrond van de master blijft
    plainLayoutXml(part) {
      const tree = this.tree(this.plainObjects || [], part, 'layout');
      part.rel(`${REL}slideMaster`, '../slideMasters/slideMaster1.xml');
      return `${XML}<p:sldLayout xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}" showMasterSp="0" type="blank" preserve="1"><p:cSld name="Pure Minds zonder voetregel">${tree}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
    }

    slideXml(objects, part, layout = 1) {
      const tree = this.tree(objects, part, 'slide');
      part.rel(`${REL}slideLayout`, `../slideLayouts/slideLayout${layout}.xml`);
      return `${XML}<p:sld xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:cSld>${tree}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
    }

    /* --- Sprekersnotities: een notitiemaster en per slide met notities een notitiepagina --- */

    notesMasterXml() {
      const ph = (id, name, type, extra, xfrm, body) => `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr><a:spLocks noGrp="1"${type === 'sldImg' ? ' noRot="1" noChangeAspect="1"' : ''}/></p:cNvSpPr><p:nvPr><p:ph type="${type}"${extra}/></p:nvPr></p:nvSpPr>`
        + `<p:spPr><a:xfrm><a:off x="${xfrm[0]}" y="${xfrm[1]}"/><a:ext cx="${xfrm[2]}" cy="${xfrm[3]}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${type === 'sldImg' ? '<a:noFill/><a:ln w="12700"><a:solidFill><a:prstClr val="black"/></a:solidFill></a:ln>' : ''}</p:spPr>${body}</p:sp>`;
      return `${XML}<p:notesMaster xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>`
        + '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'
        + ph(2, 'Dia-afbeelding 1', 'sldImg', ' idx="2"', [381000, 685800, 6096000, 3429000], '')
        + ph(3, 'Notities 2', 'body', ' sz="quarter" idx="3"', [685800, 4343400, 5486400, 4114800], '<p:txBody><a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0"/><a:lstStyle/><a:p><a:endParaRPr lang="nl-NL"/></a:p></p:txBody>')
        + '</p:spTree></p:cSld>'
        + '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>'
        + '<p:notesStyle><a:lvl1pPr marL="0" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1200" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl1pPr></p:notesStyle>'
        + '</p:notesMaster>';
    }

    notesSlideXml(text) {
      const paras = text.split(/\r?\n/).map((line) => (line.trim()
        ? `<a:p><a:r><a:rPr lang="nl-NL" dirty="0"/><a:t>${esc(line)}</a:t></a:r></a:p>`
        : '<a:p><a:endParaRPr lang="nl-NL" dirty="0"/></a:p>')).join('');
      return `${XML}<p:notes xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:cSld><p:spTree>`
        + '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'
        + '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Dia-afbeelding 1"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp>'
        + `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Notities 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${paras}</p:txBody></p:sp>`
        + '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>';
    }

    presentationXml() {
      const ids = this.slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${2 + i}"/>`).join('');
      return `${XML}<p:presentation xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}" saveSubsetFonts="1">`
        + '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>'
        + (this.hasNotes ? `<p:notesMasterIdLst><p:notesMasterId r:id="rId${3 + this.slides.length}"/></p:notesMasterIdLst>` : '')
        + `<p:sldIdLst>${ids}</p:sldIdLst><p:sldSz cx="${SLIDE_CX}" cy="${this.px(this.h)}"/><p:notesSz cx="6858000" cy="9144000"/>`
        + '<p:defaultTextStyle><a:defPPr><a:defRPr lang="nl-NL"/></a:defPPr>'
        + '<a:lvl1pPr marL="0" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl1pPr>'
        + '</p:defaultTextStyle></p:presentation>';
    }

    themeXml() {
      const scheme = { dk1: '303030', lt1: 'FFFFFF', dk2: '10283C', lt2: 'EDF3F7', accent1: '1AB9E2', accent2: 'B61B50', accent3: '1B71A8', accent4: '005AAF', accent5: '009670', accent6: '5C6670', hlink: '1AB9E2', folHlink: '1B71A8' };
      const colors = Object.entries(scheme).map(([k, v]) => `<a:${k}><a:srgbClr val="${v}"/></a:${k}>`).join('');
      const font = (name) => `<a:latin typeface="${name}"/><a:ea typeface=""/><a:cs typeface=""/>`;
      const fill = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
      const ln = (w) => `<a:ln w="${w}" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>`;
      return `${XML}<a:theme xmlns:a="${NS_A}" name="Pure Minds"><a:themeElements>`
        + `<a:clrScheme name="Pure Minds">${colors}</a:clrScheme>`
        + `<a:fontScheme name="Pure Minds"><a:majorFont>${font('Pure Minds Sans ExtraBold')}</a:majorFont><a:minorFont>${font('Pure Minds Sans')}</a:minorFont></a:fontScheme>`
        + `<a:fmtScheme name="Pure Minds"><a:fillStyleLst>${fill}${fill}${fill}</a:fillStyleLst><a:lnStyleLst>${ln(6350)}${ln(12700)}${ln(19050)}</a:lnStyleLst>`
        + '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>'
        + `<a:bgFillStyleLst>${fill}${fill}${fill}</a:bgFillStyleLst></a:fmtScheme>`
        + '</a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>';
    }

    relsXml(rels) {
      return `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.map((r) => `<Relationship Id="${r.id}" Type="${r.type}" Target="${r.target}"/>`).join('')}</Relationships>`;
    }

    contentTypesXml() {
      const over = (part, type) => `<Override PartName="${part}" ContentType="${type}"/>`;
      return `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
        + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
        + '<Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/>'
        + over('/ppt/presentation.xml', `${CT}presentationml.presentation.main+xml`)
        + over('/ppt/slideMasters/slideMaster1.xml', `${CT}presentationml.slideMaster+xml`)
        + over('/ppt/slideLayouts/slideLayout1.xml', `${CT}presentationml.slideLayout+xml`)
        + (this.plainObjects ? over('/ppt/slideLayouts/slideLayout2.xml', `${CT}presentationml.slideLayout+xml`) : '')
        + over('/ppt/theme/theme1.xml', `${CT}theme+xml`)
        + this.slides.map((_, i) => over(`/ppt/slides/slide${i + 1}.xml`, `${CT}presentationml.slide+xml`)).join('')
        + (this.hasNotes
          ? over('/ppt/notesMasters/notesMaster1.xml', `${CT}presentationml.notesMaster+xml`) + over('/ppt/theme/theme2.xml', `${CT}theme+xml`)
            + this.slideNotes.map((n, i) => (n ? over(`/ppt/notesSlides/notesSlide${i + 1}.xml`, `${CT}presentationml.notesSlide+xml`) : '')).join('')
          : '')
        + over('/docProps/core.xml', 'application/vnd.openxmlformats-package.core-properties+xml')
        + over('/docProps/app.xml', `${CT}extended-properties+xml`)
        + '</Types>';
    }

    corePropsXml() {
      const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
      return `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">`
        + `<dc:title>${esc(this.title)}</dc:title><dc:creator>${esc(this.author)}</dc:creator><cp:lastModifiedBy>${esc(this.author)}</cp:lastModifiedBy>`
        + `<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;
    }

    appPropsXml() {
      return `${XML}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Pure Minds Generator Hub</Application><Slides>${this.slides.length}</Slides></Properties>`;
    }

    /** Alles inpakken; geeft een Blob (.pptx) terug */
    async build() {
      const JSZip = await PM.libs.jszip();
      const zip = new JSZip();

      const master = this.part();
      const masterXml = this.masterXml(master);
      const layout = this.part();
      const layoutXml = this.layoutXml(layout);
      const plain = this.plainObjects ? this.part() : null;
      const plainXml = plain ? this.plainLayoutXml(plain) : null;
      const slides = this.slides.map((objects, i) => {
        const part = this.part();
        return { xml: this.slideXml(objects, part, this.slideLayouts[i]), part };
      });

      const root = [
        { id: 'rId1', type: `${REL}officeDocument`, target: 'ppt/presentation.xml' },
        { id: 'rId2', type: 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties', target: 'docProps/core.xml' },
        { id: 'rId3', type: `${REL}extended-properties`, target: 'docProps/app.xml' },
      ];
      const pres = [{ id: 'rId1', type: `${REL}slideMaster`, target: 'slideMasters/slideMaster1.xml' }]
        .concat(slides.map((_, i) => ({ id: `rId${2 + i}`, type: `${REL}slide`, target: `slides/slide${i + 1}.xml` })))
        .concat([{ id: `rId${2 + slides.length}`, type: `${REL}theme`, target: 'theme/theme1.xml' }])
        .concat(this.hasNotes ? [{ id: `rId${3 + slides.length}`, type: `${REL}notesMaster`, target: 'notesMasters/notesMaster1.xml' }] : []);

      zip.file('[Content_Types].xml', this.contentTypesXml());
      zip.file('_rels/.rels', this.relsXml(root));
      zip.file('docProps/core.xml', this.corePropsXml());
      zip.file('docProps/app.xml', this.appPropsXml());
      zip.file('ppt/presentation.xml', this.presentationXml());
      zip.file('ppt/_rels/presentation.xml.rels', this.relsXml(pres));
      zip.file('ppt/theme/theme1.xml', this.themeXml());
      zip.file('ppt/slideMasters/slideMaster1.xml', masterXml);
      zip.file('ppt/slideMasters/_rels/slideMaster1.xml.rels', this.relsXml(master.rels));
      zip.file('ppt/slideLayouts/slideLayout1.xml', layoutXml);
      zip.file('ppt/slideLayouts/_rels/slideLayout1.xml.rels', this.relsXml(layout.rels));
      if (plain) {
        zip.file('ppt/slideLayouts/slideLayout2.xml', plainXml);
        zip.file('ppt/slideLayouts/_rels/slideLayout2.xml.rels', this.relsXml(plain.rels));
      }
      if (this.hasNotes) {
        zip.file('ppt/notesMasters/notesMaster1.xml', this.notesMasterXml());
        zip.file('ppt/notesMasters/_rels/notesMaster1.xml.rels', this.relsXml([{ id: 'rId1', type: `${REL}theme`, target: '../theme/theme2.xml' }]));
        zip.file('ppt/theme/theme2.xml', this.themeXml());
      }
      slides.forEach((s, i) => {
        const notes = this.slideNotes[i];
        if (notes) {
          s.part.rel(`${REL}notesSlide`, `../notesSlides/notesSlide${i + 1}.xml`);
          zip.file(`ppt/notesSlides/notesSlide${i + 1}.xml`, this.notesSlideXml(notes));
          zip.file(`ppt/notesSlides/_rels/notesSlide${i + 1}.xml.rels`, this.relsXml([
            { id: 'rId1', type: `${REL}notesMaster`, target: '../notesMasters/notesMaster1.xml' },
            { id: 'rId2', type: `${REL}slide`, target: `../slides/slide${i + 1}.xml` },
          ]));
        }
        zip.file(`ppt/slides/slide${i + 1}.xml`, s.xml);
        zip.file(`ppt/slides/_rels/slide${i + 1}.xml.rels`, this.relsXml(s.part.rels));
      });
      this.media.forEach((m) => zip.file(`ppt/media/${m.name}`, m.data));

      return zip.generateAsync({
        type: 'blob',
        createFolders: false,
        mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });
    }
  }

  global.PMPptxWriter = PMPptxWriter;
})(window);
