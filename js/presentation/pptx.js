/* =============================================================================
   presentation/pptx.js — de presentatie als bewerkbaar PowerPoint-bestand
   -----------------------------------------------------------------------------
   Gebruikt hetzelfde plan als de preview (js/presentation/templates.js): elke
   slide wordt opgebouwd uit tekstvakken, vormen en foto's op precies de plek
   van het canvas, in dezelfde korpsgrootte. In PowerPoint blijft alles
   bewerkbaar:

     tekst      echte tekstvakken met dezelfde regelafstand en basislijnen als
                op het canvas; wordt de tekst langer, dan krimpt hij zoals
                in de tool ("tekst verkleinen bij overloop")
     foto's     als vulling van de zeshoek of als bijgesneden afbeelding, met
                dezelfde uitsnede als in de preview; een klantlogo staat in
                zijn geheel op een witte zeshoek
     vormen     zeshoeken, en bij de waardepropositie het vierkant, de cirkel,
                de lijnen en de twee pijlen: losse vormen die je kunt verschuiven;
                bij het Business Model Canvas de vlakken met hun cyaan balk en
                per blok een eigen tekstvak; in de volle waardepropositie
                (positionering) elke strook tekst een eigen tekstvak, zo breed
                als de driehoek of wig daar is
     kolommen   een toelichting loopt over twee kolommen: per kolom één tekstvak,
                met de tekst verdeeld zoals op het canvas
     master     achtergrond, cyaan balk, logo en voetregel staan op de
                Pure Minds-master: een nieuwe slide in PowerPoint krijgt ze
                vanzelf en ze staan niet per ongeluk in de weg
     nummer     het slidenummer is een echt veld en telt mee als je slides
                toevoegt of verschuift
     badge      staat de Emerce 100-badge aan, dan staat hij op elke slide
                rechtsonder (links van het slidenummer als dat aan staat),
                als scherpe afbeelding
     canvassen  het Business Model Canvas en de waardepropositie staan op een
                tweede layout zonder logo, voetregel, nummer en badge: hun
                vormen lopen tot de ondermarge

   Lettertype: Pure Minds Sans (op de computer geïnstalleerd, of anders vervangt
   PowerPoint het; de bestanden staan in assets/fonts/).
   ============================================================================= */
(function (global) {
  'use strict';

  const PM = global.PM;
  const S = global.PMSlides;
  const K = global.PMCanvas;
  const { COLORS, CAP, DESC, SQRT3, runsFrom, parseBody } = K;
  const { W, H, GRID, GEOM } = S;
  const { TEXT, BODY, SOFT, LABEL_PAL } = S.palettes;

  const LINE = 1.362;        // regelhoogte van Pure Minds Sans (em): de hoogte van een tekstvak van één regel
  const PPT_SINGLE = 1.2;    // regelafstand 100% in PowerPoint: 1,2 × het korps (zoals pptx-writer.js)
  const PPT_DESC = 0.26;     // PowerPoint: ruimte onder de basislijn van een regel (em), zie pptLine
  // Regelafstand waarbij één regel met zijn hoofdletters precies midden in een vorm staat
  const MID_LH = (CAP + PPT_DESC) / 0.75;
  const WHITE = '#ffffff';
  // Zeshoek als opsommingsteken: een tekstteken (geen plaatje), zodat het ook
  // in Google Slides en Keynote een opsomming blijft
  const BULLET = { char: '⬢', font: 'Segoe UI Symbol', color: COLORS.cyan, size: 0.75 };

  /* ---------------------------------------------------------------------------
     Tekst: van canvas-maten naar PowerPoint-maten
     ------------------------------------------------------------------------- */

  // Regelval van PowerPoint (gemeten met Open Sans, alle sneden, 26 tot 200 px):
  //   pitch  de regels staan lh × korps uit elkaar, zoals op het canvas
  //   asc    de basislijn onder de bovenkant van de regel: tot en met lh 1,2
  //          ligt hij 0,26 em boven de onderkant van de regel, daarboven op driekwart
  //   after  wat er van de regel onder de basislijn ligt, tot de volgende alinea
  //   desc   onder de laatste regel telt PowerPoint maar 0,26 em mee (bij centreren)
  function pptLine(st) {
    const pitch = st.lh * st.size;
    const asc = st.lh <= PPT_SINGLE ? pitch - PPT_DESC * st.size : Math.max((PPT_SINGLE - PPT_DESC) * st.size, 0.75 * pitch);
    return { pitch, asc, after: pitch - asc, desc: PPT_DESC * st.size };
  }

  // Op het canvas staat de kap-hoogte van de eerste regel precies op de
  // bovenkant van het blok; in PowerPoint zit daar meer ruimte boven. Deze
  // afstand schuift het tekstvak omhoog, zodat de letters op dezelfde plek komen.
  const capOffset = (st) => pptLine(st).asc - CAP * st.size;

  // Alinea-afstand zodat de volgende alinea op dezelfde hoogte begint als op het canvas
  // (daar ligt de volgende kap-hoogte `gap` onder de laatste basislijn + DESC).
  // Staan de punten dichter op elkaar dan PowerPoint met deze regelafstand toelaat (itemGap
  // 0,2, zoals in het Business Model Canvas), dan krijgt een alinea van één regel een kleinere
  // regelafstand: PowerPoint zet hem dan toch op zijn plek (gemeten: opeenvolgende regels staan
  // lh × korps uit elkaar). Bij meer regels geldt de regelafstand voor elke regel en blijft hij.
  //
  // snap: PowerPoint zet de ruimte vóór een alinea op hele punten (gemeten: 0,25 pt wordt 0,
  // 0,5 pt wordt 1 pt). Bij veel korte alinea's (Business Model Canvas, volle waardepropositie,
  // toelichting) liep dat op tot 13 px. Met snap krijgt een alinea hele punten (2 ontwerp-px)
  // en schuift het verschil door naar de volgende (carry): zo blijft een alinea binnen een
  // pixel van het canvas. Ook wat een alinea van meer regels tekortkomt, schuift door, tot
  // een alinea van één regel het inhaalt (dichte punten van 13 à 14 px: ruim 1 px per punt).
  // Zonder snap (het reguliere deck en het voorstel) blijven de waarden zoals ze waren.
  // Geeft { spcBef, st, carry }: st is de stijl die de alinea krijgt
  function spacing(prev, st, gap, lines, snap = false, carry = 0) {
    if (!prev) return { spcBef: 0, st, carry: 0 };
    const room = gap - capOffset(st) - (pptLine(prev).after - DESC * prev.size) + carry;
    const asc = pptLine(st).asc + room;
    // Een regelafstand onder ongeveer de helft van het korps is te krap (letters over de
    // vorige regel heen): dan schuift de rest door
    if (room >= 0 || lines > 1 || (snap && asc < PPT_DESC * st.size)) {
      const spcBef = snap ? Math.max(0, Math.round(room / 2) * 2) : Math.max(0, room);
      return { spcBef, st, carry: snap ? room - spcBef : 0 };
    }
    const lh = asc <= (PPT_SINGLE - PPT_DESC) * st.size ? asc / st.size + PPT_DESC : asc / (0.75 * st.size);
    return { spcBef: 0, st: { ...st, lh }, carry: 0 };
  }

  function toRuns(runs, st, colors) {
    return runs.map((r) => ({
      text: r.text,
      size: st.size,
      weight: r.em ? st.emWeight : st.weight,
      track: st.track,
      color: r.accent ? COLORS.cyan : r.em ? colors.em : colors.color,
    }));
  }

  // Alinea's onder elkaar in één tekstvak: per alinea de ruimte ervoor (spacing) en de
  // hoogte die PowerPoint voor het geheel rekent (om te centreren, en voor de maat van het
  // vak). add: lines is het aantal regels op het canvas; PowerPoint breekt op dezelfde plekken.
  // snap: de alinea-afstand op hele punten, zie spacing
  function paragraphList(snap = false) {
    const paragraphs = [];
    let prev = null;
    let height = 0;
    let carry = 0;
    return {
      paragraphs,
      add(p, st, gap, lines) {
        const sp = spacing(prev, st, gap, lines, snap, carry);
        const L = pptLine(sp.st);
        height += (prev ? pptLine(prev).after + sp.spcBef : 0) + L.asc + (Math.max(1, lines) - 1) * L.pitch;
        paragraphs.push({ ...p, lh: sp.st.lh, spcBef: sp.spcBef });
        prev = sp.st;
        carry = sp.carry;
      },
      height: () => (prev ? height + pptLine(prev).desc : 0),
    };
  }

  // De tekstblokken van een slide (titel, ondertitel, punten) als alinea's van één
  // tekstvak, met de hoogte die PowerPoint voor die alinea's rekent
  function stackParagraphs(stack, snap = false) {
    const list = paragraphList(snap);
    const add = list.add;
    for (const b of stack.blocks) {
      if (b.empty) continue;
      const st = b.block.st;
      const colors = b.colors || TEXT;
      if (b.body != null) {
        parseBody(b.body).forEach((line, i) => {
          // Tussen de punten zoals layoutBody: itemGap × het korps (standaard een half),
          // plus een half korps per lege regel
          const gap = i === 0 ? b.gap : st.size * ((st.itemGap != null ? st.itemGap : 0.5) + 0.5 * line.blank);
          const item = b.block.items && b.block.items[i];
          // Inspringen zoals layoutBody (st.indent). Een eigen teken (st.bullet, de zeshoeken
          // met een icoon op de afsluiter) staat als vorm ernaast: de alinea alleen inspringen
          const indent = b.block.indent != null ? b.block.indent : st.size * 1.15;
          const own = line.bullet && !!st.bullet;
          add({
            runs: toRuns(runsFrom(line.text), st, colors),
            bullet: line.bullet && !own ? BULLET : null,
            indent: line.bullet && !own ? indent : 0,
            marL: own ? indent : 0,
          }, st, gap, item ? item.block.lines.length : 1);
        });
      } else {
        add({ runs: toRuns(b.runs, st, colors) }, st, b.gap, b.block.lines ? b.block.lines.length : 1);
      }
    }
    return { paragraphs: list.paragraphs, height: list.height() };
  }

  // Het tekstvak van een slide: gecentreerd in het tekstgebied of bovenaan, zoals het plan.
  // snap (de nieuwe, volle layouts): de alinea-afstand op hele punten (zie spacing), en het
  // vak minstens zo hoog als PowerPoint de tekst rekent. Anders verkleint PowerPoint de
  // tekst van een krap vak zodra je er iets in typt
  function stackBox(fr, p, snap = false) {
    const { paragraphs, height } = stackParagraphs(p.stack, snap);
    const first = p.stack.blocks.find((b) => !b.empty);
    if (!first || !paragraphs.length) return null;
    const st = first.block.st;
    // Precies de canvasbreedte, zodat de regels op dezelfde plek breken. PowerPoint zet
    // een regel 1 à 2 px smaller dan het canvas: meer ruimte laat er soms een woord bij
    const w = p.maxW;
    if (p.center) {
      // PowerPoint centreert zijn eigen teksthoogte: het vak schuift zo ver op dat de
      // eerste basislijn op die van het canvas valt (en blijft gecentreerd bij bewerken)
      const area = fr.contentBottom - fr.contentTop;
      const shift = p.top + first.gap + CAP * st.size - (fr.contentTop + (area - height) / 2 + pptLine(st).asc);
      return { kind: 'text', x: p.x, y: fr.contentTop + shift, w, h: area, anchor: 'ctr', autofit: 'shrink', paragraphs, name: 'Tekst' };
    }
    const y = p.top + first.gap - capOffset(st);
    const h = p.maxH - (y - p.top);
    return { kind: 'text', x: p.x, y, w, h: snap ? Math.max(h, height + 1) : h, anchor: 't', autofit: 'shrink', paragraphs, name: 'Tekst' };
  }

  // Titel en inleiding boven blokken (Kolommen, Genummerd): het tekstvak stopt waar
  // het eerste blok begint, zodat de vakken in PowerPoint niet over elkaar liggen
  function headBox(fr, p, below) {
    const tops = below.filter(Boolean).map((o) => (o.kind === 'hex' ? o.cy - o.r : o.y));
    if (!tops.length) return stackBox(fr, p);
    return stackBox(fr, { ...p, maxH: Math.max(p.stack.height, Math.min(...tops) - p.top) });
  }

  // Tekstvak van één regel, met de basislijn op `baseline`
  function line(x, baseline, w, runs, opts = {}) {
    const list = Array.isArray(runs) ? runs : [runs];
    const size = list[0].size;
    return {
      kind: 'text', x, y: baseline - pptLine({ size, lh: LINE }).asc, w, h: LINE * size,
      anchor: 't', wrap: false, autofit: 'none', name: opts.name,
      paragraphs: [{ runs: list, lh: LINE, align: opts.align }],
    };
  }

  const hex = (cx, cy, r, fill, stroke, name, text) => ({ kind: 'hex', cx, cy, r, fill, line: stroke, name, text });

  // Contactregels op de afsluiter: per regel de cyaan zeshoek met het icoon in inkt, als
  // vectorvormen op dezelfde plek als op het canvas (contactMarks in templates.js)
  const ICON_NAME = { mail: 'e-mail', phone: 'telefoon', web: 'website', user: 'persoon' };
  function contactObjects(p) {
    return S.contactMarks(p.stack, p.x, p.top).flatMap((m) => [
      hex(m.cx, m.cy, m.r, { color: COLORS.cyan }, null, `Icoon ${ICON_NAME[m.icon]}-zeshoek`),
      { kind: 'path', x: m.box.x, y: m.box.y, w: m.box.size, h: m.box.size, view: 24, cmds: K.ICONS[m.icon], fill: { color: COLORS.ink }, line: null, name: `Icoon ${ICON_NAME[m.icon]}` },
    ]);
  }

  // De tabel uit het plan als echte PowerPoint-tabel. PowerPoint rekent de tekst
  // van een cel hoger dan het canvas (van kap-hoogte tot onderkant): dat gaat van
  // de marges af, zodat de rijen even hoog blijven. Het verschil tussen boven- en
  // ondermarge zet de basislijn op die van het canvas; de tekst blijft gecentreerd.
  function tableObject(T) {
    return {
      kind: 'table', name: 'Tabel', x: T.x, y: T.y, colW: T.widths, firstRow: T.header,
      rows: T.rows.map((row) => ({
        h: row.h,
        cells: row.cells.map((cell) => {
          const st = cell.st;
          const L = pptLine(st);
          const lines = Math.max(cell.block.lines.length, 1);
          const textH = L.asc + (lines - 1) * L.pitch + L.desc;                // PowerPoint
          const extra = (L.asc + L.desc - (CAP + DESC) * st.size) / 2;         // per kant meer dan het canvas
          const shift = CAP * st.size - L.asc + extra;                         // basislijn naar die van het canvas
          // Nooit meer marge dan er ruimte is (anders wordt de rij hoger), nooit negatief
          const room = Math.max(0, row.h - textH - 0.5);
          const half = Math.max(0, Math.min(room / 2, T.padY - extra));
          const t = K.clamp(half + shift, 0, room);
          const b = K.clamp(half - shift, 0, room - t);
          return {
            paragraphs: [{ runs: toRuns(cell.runs, st, cell.colors), lh: st.lh, align: cell.align === 'right' ? 'r' : 'l', endSize: st.size }],
            fill: row.fill ? { color: row.fill } : null,
            lineB: { color: row.rule, width: row.ruleW },
            mar: { l: T.padX, r: T.padX, t, b },
            anchor: 'ctr',
          };
        }),
      })),
    };
  }

  /* ---------------------------------------------------------------------------
     Vaste onderdelen: balk, logo, voetregel, label, slidenummer
     ------------------------------------------------------------------------- */

  const bar = () => ({ kind: 'rect', x: 0, y: 0, w: W, h: GRID.bar, fill: { color: COLORS.cyan }, name: 'Balk' });
  const logo = (fr, image) => ({ kind: 'pic', ...fr.logo, image, name: 'Logo' });

  function domain(fr) {
    const size = fr.footerSize;
    const run = (text, color) => ({ text, size, weight: 700, track: 0.02, color });
    return line(fr.m, fr.footerY + (size * CAP) / 2, 400, [run('pureminds', WHITE), run('.', COLORS.cyan), run('nl', WHITE)], { name: 'pureminds.nl' });
  }

  // Ook voor de kolomkoppen van Kolommen: zelfde vorm, eigen kleuren en naam
  function label(fr, text, maxW = fr.contentW, pal = LABEL_PAL, name = 'Label') {
    const value = String(text || '').trim();
    if (!value) return [];
    const size = fr.labelSize;
    const cap = size * CAP;
    const r = size / 2;
    const tx = fr.m + r * SQRT3 + (size * 2) / 3;
    return [
      hex(fr.m + (r * SQRT3) / 2, fr.labelTop + cap / 2, r, { color: pal.bullet }, null, `${name}-zeshoek`),
      line(tx, fr.labelTop + cap, Math.max(200, maxW - (tx - fr.m)), { text: value, size, weight: 700, track: 0.12, caps: true, color: pal.label }, { name }),
    ];
  }

  function slideNumber(fr) {
    const size = GRID.footerSize;
    const w = 400;
    return {
      // Het veld heeft regelafstand 100%
      kind: 'sldnum', x: fr.logo.x - 44 - w, y: fr.footerY + (size * CAP) / 2 - pptLine({ size, lh: PPT_SINGLE }).asc, w, h: LINE * size,
      align: 'r', run: { size, weight: 700, track: 0.04, color: SOFT },
    };
  }

  // Emerce 100-badge: de plek van het canvas (templates.badgeBox). Het nummerveld
  // van PowerPoint toont alleen het nummer ("7", niet "07 / 15"); de badge schuift
  // dat verschil op, zodat hij even dicht naast het nummer staat als op het canvas
  function badgeBox(ctx, fr, state, i) {
    const box = S.badgeBox(ctx, fr, state, i);
    if (!box || state.showNumbers === false) return box;
    const pad = (n) => String(n).padStart(2, '0');
    K.setFont(ctx, 700, GRID.footerSize, 0.04);
    const shift = ctx.measureText(`${pad(i + 1)} / ${pad(state.slides.length)}`).width - ctx.measureText(String(i + 1)).width;
    return { ...box, x: box.x + shift };
  }

  /* ---------------------------------------------------------------------------
     Afbeeldingen
     ------------------------------------------------------------------------- */

  function dataUrlBytes(url) {
    return Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (c) => c.charCodeAt(0));
  }

  // Uitsnede van een foto in een vak (object-fit: cover met zoom en focus),
  // als fracties van het bronbeeld die wegvallen (links, boven, rechts, onder)
  function coverCrop(img, box, crop) {
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const zoom = K.clamp(Number(crop && crop.zoom) || 1, 1, 4);
    const fx = K.clamp(crop && crop.fx != null ? crop.fx : 0.5, 0, 1);
    const fy = K.clamp(crop && crop.fy != null ? crop.fy : 0.5, 0, 1);
    const scale = Math.max(box.w / iw, box.h / ih) * zoom;
    const dw = iw * scale;
    const dh = ih * scale;
    const ox = (dw - box.w) * fx;
    const oy = (dh - box.h) * fy;
    return { l: ox / dw, t: oy / dh, r: 1 - (ox + box.w) / dw, b: 1 - (oy + box.h) / dh };
  }

  // Een beeld in zijn geheel in een vak (object-fit: contain), gecentreerd, zoals drawContain
  function containBox(img, box) {
    const iw = img.naturalWidth || img.width || 300;
    const ih = img.naturalHeight || img.height || 150;
    const s = Math.min(box.w / iw, box.h / ih);
    return { x: box.x + (box.w - iw * s) / 2, y: box.y + (box.h - ih * s) / 2, w: iw * s, h: ih * s };
  }

  // Foto als JPEG (of PNG bij transparantie), niet groter dan nodig voor een scherm.
  // Een logo altijd als PNG: doorzichtig blijft doorzichtig en randen blijven scherp.
  // Een SVG heeft geen vaste maat: een logo op 4× zijn plek op de slide (zoals de
  // badge), een foto op 2400 px. Een gewoon beeld wordt nooit groter gemaakt
  async function photoImage(deck, image, logoMode = false) {
    const img = image.img;
    // Een SVG zonder eigen maat heeft in sommige browsers 0 × 0: dan de maat van containBox
    const nw = img.naturalWidth || img.width || 300;
    const nh = img.naturalHeight || img.height || 150;
    const svg = /\.svg$/i.test(image.name || '') || image.type === 'image/svg+xml';
    const box = svg && logoMode ? containBox(img, GEOM.heroLogo.box) : null;
    const s = box ? Math.min(3200 / Math.max(nw, nh), Math.max(1, (4 * box.w) / nw))
      : svg ? 2400 / Math.max(nw, nh) : Math.min(1, 2400 / Math.max(nw, nh));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(nw * s));
    c.height = Math.max(1, Math.round(nh * s));
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const png = logoMode || svg || /\.(png|webp|gif)$/i.test(image.name || '');
    let blob;
    try {
      blob = await PM.canvasToBlob(c, png ? 'image/png' : 'image/jpeg', 0.9);
    } catch (err) {
      throw err.name === 'SecurityError' ? PM.fileProtocolError() : err;
    }
    const key = image.url || image.name;
    return deck.image(blob, png ? 'png' : 'jpeg', logoMode && key != null ? `${key} (logo)` : key);
  }

  // Emerce 100-badge als PNG: de witte SVG op 8× zijn plek op de slide, net zo
  // scherp als het Pure Minds-logo (ook ongeveer 8×). Eén beeld voor alle slides.
  // Uit de ingebedde kopie (brand-data.js), zoals het logo: die werkt ook bij
  // file:// en maakt het canvas niet "besmet". Anders het beeld van de preview
  async function badgeImage(deck, box, fallback) {
    const src = global.PM_BRAND && global.PM_BRAND.badgeWhite;
    let img = fallback && fallback.complete && fallback.naturalWidth ? fallback : null;
    if (src) {
      // onload in plaats van decode(): Safari weigert decode() soms bij een SVG
      img = await new Promise((resolve) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => resolve(img);
        el.src = src;
      });
    }
    if (!img) throw new Error('De Emerce 100-badge kon niet worden geladen. Probeer het opnieuw, of zet de badge uit.');
    const c = document.createElement('canvas');
    c.width = Math.round(box.w * 8);
    c.height = Math.round(box.h * 8);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return deck.image(await PM.canvasToBlob(c, 'image/png'), 'png', 'badge');
  }

  /* ---------------------------------------------------------------------------
     Layouts
     ------------------------------------------------------------------------- */

  function heroObjects(env, photo) {
    const { r, cx, cy, echo } = GEOM.hero;
    if (photo != null && env.fit === 'logo') {
      // Klantlogo in zijn geheel op een eigen witte zeshoek (helemaal in beeld, zoals
      // GEOM.heroLogo op het canvas); wit krijgt nooit een rand
      const L = GEOM.heroLogo;
      return [
        hex(L.cx - L.r * 0.17, L.cy + L.r * 0.15, L.r, null, { color: COLORS.cyan, width: L.echo }, 'Zeshoek-lijn'),
        hex(L.cx, L.cy, L.r, { color: WHITE }, null, 'Logo-vlak'),
        { kind: 'pic', ...containBox(env.photo, L.box), image: photo, name: 'Klantlogo' },
      ];
    }
    if (photo != null) {
      const box = { x: cx - (r * SQRT3) / 2, y: cy - r, w: r * SQRT3, h: r * 2 };
      return [
        hex(cx - r * 0.17, cy + r * 0.15, r, null, { color: COLORS.cyan, width: echo }, 'Zeshoek-lijn'),
        hex(cx, cy, r, { image: photo, crop: coverCrop(env.photo, box, env.crop) }, null, 'Foto'),
      ];
    }
    return GEOM.heroShapes.map((sh) => hex(sh.cx, sh.cy, sh.r, sh.fill ? { color: sh.fill } : null, sh.stroke ? { color: sh.stroke, width: sh.lw } : null, 'Zeshoek'));
  }

  // Waardepropositie: waardemap (vierkant) en klantprofiel (cirkel) als losse
  // vormen en lijnen, elk vak een eigen tekstvak
  function vpcObjects(fr, s, p) {
    const G = GEOM.vpc;
    const { square: sq, circle: ci, arrow: A } = p;
    const outline = { color: COLORS.cyan, width: G.outline };
    const cyan = { color: COLORS.cyan };
    // Pijlpunt zoals op het canvas: ongeveer vijf keer de lijndikte breed en lang
    const point = { type: 'triangle', w: 'lg', len: 'lg' };
    const fit = { color: COLORS.cyan, width: G.arrow.lw };
    const objects = [...label(fr, s.label, p.labelW)];
    if (p.segment) {
      // Rechts uitgelijnd tot de marge, op de basislijn van het label
      const w = Math.max(400, p.segment.w + 40);
      objects.push(line(p.segment.right - w, p.segment.baseline, w, p.segment.runs, { align: 'r', name: 'Klantsegment' }));
    }
    for (const c of p.captions) {
      objects.push(line(c.x, c.baseline, sq.s, { text: c.text, size: G.captionSize, weight: 700, track: 0.12, color: SOFT }, { name: c.text }));
    }
    // Binnenlijnen eerst, dan de randen eroverheen, zoals op het canvas
    p.inner.forEach((l) => objects.push({ kind: 'line', ...l, line: { color: G.innerStroke, width: G.inner }, name: 'Binnenlijn' }));
    objects.push(
      { kind: 'rect', x: sq.x, y: sq.y, w: sq.s, h: sq.s, fill: null, line: outline, name: 'Waardemap' },
      { kind: 'ellipse', cx: ci.cx, cy: ci.cy, rx: ci.r, ry: ci.r, fill: null, line: outline, name: 'Klantprofiel' },
      // De "fit": vanuit beide vormen een pijl naar het midden, de punten raken elkaar (►◄).
      // De punt zit aan het eind van de lijn; de rechter loopt terug en wordt gespiegeld
      { kind: 'line', x1: A.x1, y1: A.y, x2: A.mid, y2: A.y, line: fit, tail: point, name: 'Fit-pijl waardemap' },
      { kind: 'line', x1: A.x2, y1: A.y, x2: A.mid, y2: A.y, line: fit, tail: point, name: 'Fit-pijl klantprofiel' },
      hex(sq.x + sq.s / 2, sq.y + sq.s / 2, G.hubR, cyan, null, 'Middelpunt waardemap'),
      hex(ci.cx, ci.cy, G.hubR, cyan, null, 'Middelpunt klantprofiel'),
      ...(s.style === 'vol' ? volBoxes(fr, p.zones)
        : p.zones.map((z) => stackBox(fr, { stack: z.stack, x: z.x, top: z.top, maxW: z.w, maxH: z.y + z.h - z.top, center: false }))),
    );
    // Geen bronvermelding: het waardepropositie-canvas is een interne tool
    return objects;
  }

  // Volle waardepropositie (positionering): elke strook uit het plan een eigen tekstvak. Loopt
  // de tekst van een vak door (meer stroken met dezelfde key, elk zo breed als de driehoek of
  // wig daar is), dan heten ze naar de kop van het vak: "Voordelen", "Voordelen 2", …
  // Nooit lager dan de tekst zelf, en de alinea-afstand op hele punten (veel korte punten)
  function volBoxes(fr, zones) {
    const names = {};
    const bottoms = {};
    return zones.map((z) => {
      const box = stackBox(fr, { stack: z.stack, x: z.x, top: z.top, maxW: z.w, maxH: Math.max(z.y + z.h - z.top, z.stack.height), center: false }, true);
      if (!box) return null;
      // PowerPoint zet regels iets ruimer dan het canvas: een strook begint nooit in de vorige
      // van hetzelfde vak, anders raken de onderstokken de volgende regel (een paar px lager kan)
      const prev = bottoms[z.key];
      if (prev != null && box.y < prev + 2) box.y = prev + 2;
      bottoms[z.key] = box.y + box.h;
      const seen = names[z.key] || (names[z.key] = { name: stackName(z.stack, 'Vak'), n: 0 });
      seen.n++;
      return { ...box, name: seen.n > 1 ? `${seen.name} ${seen.n}` : seen.name };
    });
  }

  // Naam van een tekstvak in PowerPoint (selectievenster): de kop van het blok
  function stackName(stack, fallback) {
    const head = stack.blocks.find((b) => !b.empty && b.runs);
    return head ? head.runs.map((r) => r.text).join('').trim() || fallback : fallback;
  }

  // Business Model Canvas: zes effen vlakken met een cyaan balk bovenaan, de lijn
  // tussen Key Partners en Key Resources, en per blok een eigen tekstvak. Vullingen
  // altijd als { color } en zonder rand (een kale kleur wordt zwart in PowerPoint)
  function bmcObjects(fr, s, p) {
    const G = GEOM.bmc;
    const objects = [...label(fr, s.label)];
    for (const pn of p.panels) {
      objects.push(
        { kind: 'rect', x: pn.x, y: pn.y, w: pn.w, h: pn.h, fill: { color: G.fill }, line: null, name: 'Blok' },
        { kind: 'rect', x: pn.x, y: pn.y, w: pn.w, h: G.bar, fill: { color: COLORS.cyan }, line: null, name: 'Blok-balk' },
      );
    }
    for (const r of p.rules) objects.push({ kind: 'rect', x: r.x, y: r.y, w: r.w, h: r.h, fill: { color: G.ruleColor }, line: null, name: 'Scheidingslijn' });
    for (const b of p.blocks) {
      // Tot de onderkant van het eigen vak; bij overloop tot onder de tekst (nooit negatief).
      // Veel korte punten: de alinea-afstand op hele punten (snap, zie spacing)
      const box = stackBox(fr, { stack: b.stack, x: b.x, top: b.top, maxW: b.w, maxH: Math.max(b.y + b.h - b.top, b.stack.height), center: false }, true);
      if (box) objects.push({ ...box, name: stackName(b.stack, 'Blok') });
    }
    return objects;
  }

  // De regels van een stuk tekst (layoutText) terug als runs: PowerPoint zet ze
  // opnieuw, op dezelfde breedte, en breekt dus op dezelfde plekken. Een spatie is
  // alleen vet tussen twee vette woorden, zoals in de bron (**twee woorden**)
  function linesToRuns(lines) {
    const segs = [];
    lines.forEach((l, i) => {
      if (i) segs.push({ space: true });
      segs.push(...l.segs);
    });
    const runs = [];
    segs.forEach((sg, i) => {
      const em = sg.space ? !!(segs[i - 1] && segs[i - 1].em && segs[i + 1] && segs[i + 1].em) : !!sg.em;
      const accent = !sg.space && !!sg.accent;
      const text = sg.space ? ' ' : sg.text;
      const last = runs[runs.length - 1];
      if (last && last.em === em && last.accent === accent) last.text += text;
      else runs.push({ text, em, accent });
    });
    return runs;
  }

  // Toelichting: de titel over de volle breedte, de tekst in twee kolommen met per
  // kolom één tekstvak. Elk stuk uit het plan is een alinea (de alinea-afstand op hele
  // punten, zie spacing). Loopt een punt door in de rechterkolom, dan springt het
  // vervolg even ver in, zonder nieuw teken
  function toelichtingObjects(fr, s, p) {
    const { st, indent } = p.body;
    const objects = [...label(fr, s.label), stackBox(fr, p)];
    p.columns.forEach((col, c) => {
      if (!col.pieces.length) return;
      const list = paragraphList(true);
      let prev = null;
      for (const pc of col.pieces) {
        list.add({
          runs: toRuns(linesToRuns(pc.lines), st, BODY),
          bullet: pc.mark ? BULLET : null,
          indent: pc.mark ? indent : 0,
          marL: pc.bullet && !pc.mark ? indent : 0,
        }, st, prev ? pc.y - (prev.y + prev.h) : 0, pc.lines.length);
        prev = pc;
      }
      // Precies de kolombreedte, zoals stackBox: dan breekt PowerPoint op dezelfde plekken.
      // De eerste kap-hoogte op die van het canvas (een kolom begint altijd op y 0); tot de
      // onderkant van de kolom, en nooit lager dan PowerPoint de tekst rekent (zie stackBox)
      const y = col.top + col.pieces[0].y - capOffset(st);
      objects.push({
        kind: 'text', x: col.x, y, w: col.w, h: Math.max(p.bottom - y, list.height() + 1),
        anchor: 't', autofit: 'shrink', paragraphs: list.paragraphs, name: c ? 'Toelichting rechts' : 'Toelichting links',
      });
    });
    return objects;
  }

  function slideObjects(fr, s, env, p, photo, logoImage) {
    const objects = [];

    if (p.layout === 'title' || p.layout === 'closing') {
      objects.push(...heroObjects(env, photo), ...label(fr, s.label, p.labelW), stackBox(fr, p));
      if (p.layout === 'closing') objects.push(...contactObjects(p));
    } else if (p.layout === 'section') {
      const { cx, cy, r } = p.hex;
      const num = String(env.sectionNumber || 1).padStart(2, '0');
      objects.push(
        hex(cx - r * 0.17, cy + r * 0.15, r, null, { color: COLORS.cyan, width: GEOM.section.echo }, 'Zeshoek-lijn'),
        hex(cx, cy, r, { color: COLORS.cyan }, null, 'Sectienummer', {
          anchor: 'ctr', wrap: false, autofit: 'none',
          paragraphs: [{ runs: [{ text: num, size: GEOM.section.numberSize, weight: 800, track: -0.02, color: COLORS.ink }], lh: MID_LH, align: 'ctr' }],
        }),
        ...label(fr, s.label), stackBox(fr, p),
      );
    } else if (p.layout === 'bullets' || p.layout === 'tekst') {
      objects.push(...label(fr, s.label), stackBox(fr, p));
    } else if (p.layout === 'kolommen') {
      const blocks = [];
      for (const col of p.columns) {
        // Kop zoals het label, maar cyaan; de tekst eronder als eigen tekstvak
        const head = { m: col.x, labelTop: col.headTop, labelSize: col.headSize };
        blocks.push(
          ...label(head, col.head, col.w, { bullet: COLORS.cyan, label: COLORS.cyan }, 'Kolomkop'),
          // Nooit lager dan de tekst zelf: bij overloop blijft het vak geldig (geen negatieve hoogte)
          stackBox(fr, { stack: col.stack, x: col.x, top: col.top, maxW: col.w, maxH: Math.max(col.maxH, col.stack.height), center: false }),
        );
      }
      objects.push(...label(fr, s.label), headBox(fr, p, blocks), ...blocks);
    } else if (p.layout === 'vragen') {
      const blocks = [];
      for (const it of p.items) {
        const { cx, cy, r } = it.hex;
        blocks.push(
          hex(cx, cy, r, { color: COLORS.cyan }, null, 'Nummer', {
            anchor: 'ctr', wrap: false, autofit: 'none',
            paragraphs: [{ runs: [{ text: String(it.n), size: it.numberSize, weight: 800, color: COLORS.ink }], lh: MID_LH, align: 'ctr' }],
          }),
          // Tot de onderkant van de eigen rij: de vakken overlappen elkaar niet en zijn in
          // PowerPoint los aan te klikken. Bij overloop tot onder de tekst: nooit een negatieve hoogte
          stackBox(fr, { stack: it.stack, x: it.x, top: it.top, maxW: it.w, maxH: Math.max(it.row.y + it.row.h - it.top, it.stack.height), center: false }),
        );
      }
      if (p.outro) {
        // Tot de voetregel, niet over het logo en het slidenummer heen
        const { stack, top } = p.outro;
        blocks.push(stackBox(fr, { stack, x: p.x, top, maxW: p.maxW, maxH: Math.max(fr.contentBottom - top, stack.height), center: false }));
      }
      objects.push(...label(fr, s.label), headBox(fr, p, blocks), ...blocks);
    } else if (p.layout === 'vpc') {
      objects.push(...vpcObjects(fr, s, p));
    } else if (p.layout === 'bmc') {
      objects.push(...bmcObjects(fr, s, p));
    } else if (p.layout === 'toelichting') {
      objects.push(...toelichtingObjects(fr, s, p));
    } else if (p.layout === 'split') {
      const half = W / 2;
      const box = p.photoBox;
      if (photo != null) objects.push({ kind: 'pic', ...box, image: photo, crop: coverCrop(env.photo, box, env.crop), name: 'Foto' });
      else objects.push({ kind: 'rect', ...box, fill: { color: '#3a4652' }, name: 'Plek voor de foto' });
      if (!p.left && photo != null) {
        // Rustig verloop onder het logo, dat op de foto staat
        const { fade } = GEOM.split;
        objects.push({
          kind: 'rect', x: half, y: H - fade, w: half, h: fade, name: 'Verloop',
          fill: { gradient: { angle: 90, stops: [{ pos: 0, color: COLORS.navy, alpha: 0 }, { pos: 100, color: COLORS.navy, alpha: 0.6 }] } },
        });
      }
      objects.push({ kind: 'rect', x: half - GEOM.split.divider / 2, y: 0, w: GEOM.split.divider, h: H, fill: { color: COLORS.cyan }, name: 'Scheidingslijn' });
      objects.push(...label(p.textFrame, s.label, p.maxW), stackBox(fr, p));
      // Boven op de foto: de balk, en wat de foto van de master bedekt
      objects.push(bar());
      if (p.left) objects.push(domain(p.textFrame));
      else objects.push(logo(fr, logoImage));
    } else if (p.layout === 'table') {
      objects.push(...label(fr, s.label), stackBox(fr, p), tableObject(p.table));
      // Toelichting tot de voetregel, zoals de slotzin bij Genummerd (nooit lager dan de tekst zelf)
      if (p.note) {
        const { stack, top } = p.note;
        objects.push(stackBox(fr, { stack, x: p.x, top, maxW: p.maxW, maxH: Math.max(fr.contentBottom - top, stack.height), center: false }));
      }
    } else if (p.layout === 'quote' && p.value) {
      const bg = GEOM.stat.bg;
      objects.push(
        hex(bg.cx, bg.cy, bg.r, null, { color: bg.stroke, width: bg.lw }, 'Achtergrondzeshoek'),
        line(fr.m, p.value.baseline, fr.contentW, { text: p.value.text, size: p.value.size, weight: 800, track: -0.03, color: COLORS.cyan }, { name: 'Kerncijfer' }),
        ...label(fr, s.label), stackBox(fr, p),
      );
    } else if (p.layout === 'quote') {
      const { cx, cy, r } = p.hex;
      objects.push(
        hex(cx, cy, r, { color: COLORS.cyan }, null, 'Citaatteken'),
        line(cx - 200, cy + GEOM.quote.markDy, 400, { text: GEOM.quote.mark, size: GEOM.quote.markSize, weight: 800, color: COLORS.ink }, { align: 'ctr', name: 'Aanhalingsteken' }),
        ...label(fr, s.label), stackBox(fr, p),
      );
    }
    return objects;
  }

  /* ---------------------------------------------------------------------------
     Publieke functie
     ------------------------------------------------------------------------- */

  /**
   * Bouwt de presentatie als .pptx.
   *   state     { slides, dot, showNumbers, badge }   badge: Emerce 100-badge op elke slide
   *   slideEnv  (index) => { logo, photo, crop, sectionNumber, fit }   fit: 'logo' = klantlogo
   *   images    per slide-id { img, name, url }
   * Geeft een Blob terug.
   */
  async function exportDeck(state, slideEnv, images, onProgress) {
    await PM.fontsReady;
    const fr = S.frame();
    const ctx = document.createElement('canvas').getContext('2d');  // alleen om tekst te meten
    const title = String(state.slides[0].title || 'Presentatie').replace(/\*\*/g, '');
    const deck = new global.PMPptxWriter({ width: W, height: H, title, author: 'Pure Minds' });

    // Achtergrond (inkt, gloed en zeshoekpatroon) als afbeelding op de master
    const bgCanvas = document.createElement('canvas');
    K.paintBackground(K.prepare(bgCanvas, W, H, 1), fr);
    const background = deck.image(await PM.canvasToBlob(bgCanvas, 'image/jpeg', 0.92), 'jpeg', 'background');
    const logoImage = deck.image(dataUrlBytes(global.PM_BRAND.logoWhite), 'png', 'logo');

    const number = state.showNumbers !== false ? slideNumber(fr) : null;
    deck.master({ background, objects: [bar(), logo(fr, logoImage), domain(fr), number] });
    deck.layout([number]);
    // Business model canvas en waardepropositie: zonder logo, voetregel en nummer (zie
    // templates.js, BARE). Een eigen layout die de master-vormen verbergt, met alleen de
    // balk; alleen als het deck zo'n slide heeft (anders blijft het bestand zoals het was)
    if (state.slides.some(S.bare)) deck.plainLayout([bar()]);

    const photos = new Map();
    let badge = null;
    for (let i = 0; i < state.slides.length; i++) {
      if (onProgress) onProgress(i, state.slides.length);
      await new Promise((r) => setTimeout(r, 0));  // knoptekst laten verversen
      const s = state.slides[i];
      const env = slideEnv(i);
      const image = env.photo && images[s.id];
      let photo = null;
      if (image) {
        if (!photos.has(s.id)) photos.set(s.id, await photoImage(deck, image, env.fit === 'logo'));
        photo = photos.get(s.id);
      }
      const p = S.plan(ctx, fr, s, env, state);
      // Emerce 100-badge links van het slidenummer, per slide en boven een foto,
      // zoals het logo bij Beeld + tekst
      // (templates.badgeBox: geen badge op een slide zonder voetregel)
      const box = badgeBox(ctx, fr, state, i);
      if (box && badge == null) badge = await badgeImage(deck, box, env.badge);
      const mark = box && badge != null ? { kind: 'pic', ...box, image: badge, name: 'Emerce 100-badge' } : null;
      // Sprekersnotities: in PowerPoint en Google Slides onder de slide (Notities)
      if (S.bare(p)) deck.slide(slideObjects(fr, s, env, p, photo, logoImage), 2, s.notes);
      else deck.slide([...slideObjects(fr, s, env, p, photo, logoImage), mark, number], 1, s.notes);
    }
    return deck.build();
  }

  // slideObjects: de vormen van één slide uit zijn plan, ook voor de tests
  global.PMSlidesPptx = { exportDeck, slideObjects };
})(window);
