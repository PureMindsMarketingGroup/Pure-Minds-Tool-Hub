/* =============================================================================
   templates.js — de vijf Pure Minds post-templates, getekend op HTML5 Canvas
   -----------------------------------------------------------------------------
   Alles wordt getekend in een vast ontwerpraster van 1080 px breed. Exporteren
   op een andere breedte (1200 voor LinkedIn, 2160 voor hoge resolutie) schaalt
   alleen de context, dus maatvoering en verhoudingen blijven exact gelijk.

   Vaste regels voor álle templates (zie GRID en frame()):
     - marge van 88 px rondom
     - cyaan balk van 12 px bovenaan, zoals op elk artboard in het brandbook
     - label linksboven: zeshoek-bullet + Pure Minds Sans Bold in hoofdletters
     - logo rechtsonder in een inkt-zeshoek, in elk template op dezelfde plek
     - bij de carousel de swipe-indicator linksonder, verticaal gecentreerd
       op het logo; de posts hebben verder geen voetregel
     - optioneel de Emerce 100-badge op die plek: klein, wit, verticaal
       gecentreerd op het logo (in de carousel alleen op de laatste slide)
     - koppen Pure Minds Sans ExtraBold met -2% tracking, tekst Pure Minds Sans Regular
     - de zeshoek-duo (foto of vlak + verschoven cyaan lijn) als vormelement

   renderPost() geeft ook terug wat waar staat (regions: rechthoeken in
   ontwerp-px, voor klikken in de preview) en welke tekst niet paste
   (overflowKeys). Grootte van de kop: data.titleSize = 'klein' | 'normaal' |
   'groot' (typeschaal uit PM.brand); normaal tekent precies als voorheen.

   De tekenbouwstenen (kleuren, zeshoek, tekstopmaak, foto, label, logo)
   staan in js/shared/canvas-kit.js en worden gedeeld met de Presentation Maker.
   ============================================================================= */
(function (global) {
  'use strict';

  const {
    COLORS, CAP, DESC, SQRT3, flags,
    clamp, rgba, setFont, hexPath, hexPattern, paintBackground,
    runsFrom, layoutText, fitText, drawText, layoutBody, drawBody, ellipsize,
    drawLabel, drawLogo, drawBadge, drawArrow, planCta,
    drawPhoto, drawContain, hexEcho, prepare, finish,
  } = global.PMCanvas;

  // Liggend is 1,91:1: de liggende foto op Instagram (1080 × 566) en LinkedIn (1200 × 627)
  const FORMATS = {
    portrait: { w: 1080, h: 1350, ratio: '4:5', label: 'portret' },
    story: { w: 1080, h: 1920, ratio: '9:16', label: 'story' },
    landscape: { w: 1080, h: 566, ratio: '1,91:1', label: 'liggend' },
  };

  const GRID = {
    margin: 88,
    bar: 12,
    logoW: 112,
    logoH: 112 * 1109 / 962,  // verhouding van PureMinds-zeshoek-logo.png
    badgeH: 112 * 1109 / 962 * 0.45,  // Emerce 100-badge: 45% van de logohoogte
    badgeRatio: 353.3 / 130.6,        // verhouding van e100-2026-liggend-wit.svg
    labelSize: 24,
    labelTrack: 0.12,
    labelGap: 72,             // van label tot inhoud
    footerGap: 56,            // van inhoud tot logo-rij
    footerSize: 24,
    storySafe: 250,           // boven en onder in een story zit de Instagram-interface
  };

  // Liggend: even breed in de feed als een staande post, dus de letters blijven even groot;
  // alleen de hoogte is krap. Daarom kleinere marges, logo en tussenruimtes.
  const GRID_LANDSCAPE = {
    margin: 60,
    logoW: 84,
    labelSize: 20,
    labelGap: 40,
    footerGap: 28,
    footerSize: 20,
  };

  // Typografische stijlen, gedeeld door alle templates
  const TYPE = {
    title: { size: 80, weight: 800, emWeight: 800, track: -0.02, lh: 1.1 },
    body: { size: 34, weight: 400, emWeight: 700, track: 0, lh: 1.45 },
  };
  const TITLE_MIN = 44;
  const BODY_MIN = 24;

  /* ---------------------------------------------------------------------------
     Wat er getekend is: regio's (klikken in de preview) en teksten die niet
     pasten. Alleen meten, niets extra tekenen: de pixels blijven gelijk.
     ------------------------------------------------------------------------- */

  let regions = [];
  let over = [];

  const region = (key, x, y, w, h) => {
    if (w > 0 && h > 0) regions.push({ key, rect: { x, y, w, h } });
  };

  // fitText, maar met onthouden welke tekst niet paste
  function fit(key, ...args) {
    const before = flags.overflow;
    flags.overflow = false;
    const block = fitText(...args);
    if (flags.overflow) over.push(key);
    flags.overflow = before || flags.overflow;
    return block;
  }

  // Rechthoek om een tekstblok van fitText/layoutText, getekend vanaf (x, top)
  function textRegion(key, block, x, top, align = 'left') {
    if (!block || !block.lines.length) return;
    const w = Math.max(...block.lines.map((l) => l.w));
    const dx = align === 'center' ? (block.maxW - w) / 2 : 0;
    region(key, x + dx, top, w, block.height);
  }

  // Het label linksboven; direct na drawLabel, want dan staat het lettertype nog goed
  function labelRegion(ctx, fr, text, maxW = fr.contentW) {
    const value = String(text || '').trim();
    if (!value) return;
    const size = fr.labelSize;
    const tx = fr.m + (size / 2) * SQRT3 + (size * 2) / 3;
    const shown = ellipsize(ctx, value.toUpperCase(), maxW - (tx - fr.m));
    region('label', fr.m, fr.labelTop, tx - fr.m + ctx.measureText(shown).width, size * CAP);
  }

  // Korpsgrootte van de kop in de gekozen stap van de typeschaal
  function titleSize(base, d) {
    const brand = global.PM && global.PM.brand;
    return brand && d && d.titleSize ? brand.sizeFor(base, d.titleSize) : base;
  }

  // Alle posts zijn donker: inkt of foto, met witte tekst en cyaan nadruk
  const PAL = {
    text: '#ffffff', body: 'rgba(255,255,255,.88)', soft: 'rgba(255,255,255,.72)',
    label: '#ffffff', bullet: COLORS.cyan, em: COLORS.cyan,
    pattern: '#ffffff', patternAlpha: 0.08, dot: 'rgba(255,255,255,.45)',
  };

  const TEMPLATE_META = [
    { id: 'photo', name: 'Standaard foto', sub: 'strak en simpel' },
    { id: 'overlay', name: 'Foto met tekst', sub: 'tekst op beeld' },
    { id: 'blog', name: 'Pure blog post', sub: 'nieuwe blog + cta' },
    { id: 'case', name: 'Pure case post', sub: 'klant en resultaat' },
    { id: 'carousel', name: 'Info carousel', sub: 'swipepost in slides' },
  ];

  /* ---------------------------------------------------------------------------
     Raster
     ------------------------------------------------------------------------- */

  function frame(format) {
    const f = FORMATS[format] || FORMATS.portrait;
    const landscape = f.w / f.h > 1.2;
    const g = landscape ? { ...GRID, ...GRID_LANDSCAPE } : GRID;
    const m = g.margin;
    const story = f.h / f.w > 1.5;
    const v = story ? g.storySafe : m;  // verticale marge
    const logoH = g.logoW * GRID.logoH / GRID.logoW;
    const badgeH = logoH * 0.45;
    const logo = { x: f.w - m - g.logoW, y: f.h - v - logoH, w: g.logoW, h: logoH };
    // Badge linksonder, even ver van de rand als het logo rechts
    const badge = { x: m, y: logo.y + (logo.h - badgeH) / 2, w: badgeH * GRID.badgeRatio, h: badgeH };
    return {
      w: f.w,
      h: f.h,
      m,
      v,
      logo,
      badge,
      story,
      portrait: f.h > f.w,
      landscape,
      s: landscape ? 0.7 : 1,   // schaal voor vormen (zeshoeken, verlopen), niet voor letters
      labelTop: v,
      labelSize: g.labelSize,
      footerSize: g.footerSize,
      contentTop: v + g.labelSize * CAP + g.labelGap,
      contentBottom: logo.y - g.footerGap,
      contentW: f.w - 2 * m,
      footerY: logo.y + logo.h / 2,
    };
  }

  /* ---------------------------------------------------------------------------
     Swipe-indicator (alleen de carousel)
     ------------------------------------------------------------------------- */

  // Voortgang als zeshoekjes + "swipe" + pijl, op de plek van de voetregel
  function drawSwipe(ctx, fr, index, total, pal) {
    const y = fr.footerY;
    let x = fr.m;
    if (total > 1 && total <= 10) {
      const r = 11;
      for (let i = 0; i < total; i++) {
        const active = i === index;
        hexPath(ctx, x + (r * SQRT3) / 2, y, active ? r + 2 : r);
        if (active) {
          ctx.fillStyle = COLORS.cyan;
          ctx.fill();
        } else {
          ctx.strokeStyle = pal.dot;
          ctx.lineWidth = 2.5;
          ctx.stroke();
        }
        x += r * SQRT3 + 10;
      }
      x += 18;
    } else if (total > 10) {
      setFont(ctx, 800, fr.footerSize, 0.02);
      const counter = `${String(index + 1).padStart(2, '0')}/${String(total).padStart(2, '0')}`;
      ctx.fillStyle = COLORS.cyan;
      ctx.fillText(counter, x, y + (fr.footerSize * CAP) / 2);
      x += ctx.measureText(counter).width + 18;
    }
    setFont(ctx, 700, fr.footerSize, 0.02);
    ctx.fillStyle = pal.text;
    ctx.fillText('swipe', x, y + (fr.footerSize * CAP) / 2);
    x += ctx.measureText('swipe').width + 16;
    drawArrow(ctx, x, y, 48, COLORS.cyan, 4);
  }

  // Halve cyaan zeshoek aan de rechterrand: "hier gaat het verder"
  function drawEdgeCue(ctx, fr) {
    const r = 72 * fr.s;
    const visible = 60 * fr.s;
    const cx = fr.w - visible + (r * SQRT3) / 2;
    const cy = fr.h / 2;
    hexPath(ctx, cx, cy, r);
    ctx.fillStyle = COLORS.cyan;
    ctx.fill();
    const ax = fr.w - visible / 2 + 2 * fr.s;
    const a = fr.s;
    ctx.save();
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 5 * a;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
    ctx.beginPath();
    ctx.moveTo(ax - 8 * a, cy - 15 * a);
    ctx.lineTo(ax + 7 * a, cy);
    ctx.lineTo(ax - 8 * a, cy + 15 * a);
    ctx.stroke();
    ctx.restore();
  }

  /* ---------------------------------------------------------------------------
     Templates
     ------------------------------------------------------------------------- */

  // 1. Standaard foto: volledig beeld, of de foto in een grote zeshoek
  function tplPhoto(ctx, fr, d, env) {
    if (d.style === 'hex') {
      paintBackground(ctx, fr);
      const top = fr.labelTop + fr.labelSize * CAP + 44 * fr.s;
      const bottom = fr.landscape ? fr.h - fr.v : fr.logo.y - 30 * fr.s;
      const r = Math.min((bottom - top) / 2, fr.contentW / SQRT3);
      const cx = fr.w / 2 + r * 0.08;
      const cy = (top + bottom) / 2 - r * 0.07;
      hexEcho(ctx, cx, cy, r);
      const photo = drawPhoto(ctx, env.photo, { x: cx - (r * SQRT3) / 2, y: cy - r, w: r * SQRT3, h: r * 2, hex: { cx, cy, r } }, env.crop);
      region('photo', cx - (r * SQRT3) / 2, cy - r, r * SQRT3, r * 2);
      drawLabel(ctx, fr, d.label, PAL);
      labelRegion(ctx, fr, d.label);
      return { photo };
    }

    const photo = drawPhoto(ctx, env.photo, { x: 0, y: 0, w: fr.w, h: fr.h }, env.crop);
    region('photo', 0, 0, fr.w, fr.h);
    if (env.photo) softEdges(ctx, fr, d.label);
    drawLabel(ctx, fr, d.label, PAL);
    labelRegion(ctx, fr, d.label);
    return { photo };
  }

  // Rustige verlopen onder het label en het logo, zodat die leesbaar blijven
  // (een foto zonder tekst: Standaard foto, of Foto met tekst met lege velden)
  function softEdges(ctx, fr, label) {
    const band = 220 * fr.s;
    const bottom = ctx.createLinearGradient(0, fr.logo.y - band, 0, fr.h);
    bottom.addColorStop(0, rgba(COLORS.navy, 0));
    bottom.addColorStop(1, rgba(COLORS.navy, 0.62));
    ctx.fillStyle = bottom;
    ctx.fillRect(0, fr.logo.y - band, fr.w, fr.h);
    if (String(label || '').trim()) {
      const top = fr.labelTop + 190 * fr.s;
      const topGrad = ctx.createLinearGradient(0, 0, 0, top);
      topGrad.addColorStop(0, rgba(COLORS.navy, 0.55));
      topGrad.addColorStop(1, rgba(COLORS.navy, 0));
      ctx.fillStyle = topGrad;
      ctx.fillRect(0, 0, fr.w, top);
    }
  }

  // Liggend: het logo staat alleen in de hoek rechtsonder. Een tekstkolom links die niet
  // onder het logo komt, loopt daarom door tot de ondermarge, behalve als de badge
  // linksonder staat (fr.badgeOn, gezet door renderPost)
  const textBottom = (fr) => (fr.landscape && !fr.badgeOn ? fr.h - fr.v : fr.contentBottom);
  // Liggend: een zeshoek rechtsboven (over de rand) die met zijn echo boven het logo blijft
  const sideHexR = (fr) => Math.floor((fr.logo.y - 16 - fr.labelTop + 44 * fr.s) / 2.15);

  // Staat er tekst op de post? Alleen dan het donkere verloop van Foto met tekst
  const hasText = (...values) => values.some((v) => String(v || '').replace(/\*\*/g, '').trim());

  // 2. Foto met tekst-overlay: aankondiging in wit op een merkverloop (standaard
  //    100%). Zonder kop en toelichting geen verloop: alleen de zachte randen
  //    onder label en logo, zoals bij Standaard foto
  function tplOverlay(ctx, fr, d, env) {
    const photo = drawPhoto(ctx, env.photo, { x: 0, y: 0, w: fr.w, h: fr.h }, env.crop);
    region('photo', 0, 0, fr.w, fr.h);
    const k = clamp((d.strength != null ? Number(d.strength) : 100) / 100, 0, 1);
    const middle = d.position === 'middle';
    const text = hasText(d.title, d.subtitle);

    if (!text && env.photo) softEdges(ctx, fr, d.label);
    const g = ctx.createLinearGradient(0, 0, 0, fr.h);
    if (middle) {
      g.addColorStop(0, rgba(COLORS.navy, 0.55 * k));
      g.addColorStop(0.5, rgba(COLORS.navy, 0.62 * k));
      g.addColorStop(1, rgba(COLORS.navy, 0.8 * k));
    } else {
      g.addColorStop(0, rgba(COLORS.navy, 0.5 * k));
      g.addColorStop(0.24, rgba(COLORS.navy, 0.06 * k));
      g.addColorStop(0.45, rgba(COLORS.navy, 0.22 * k));
      g.addColorStop(0.75, rgba(COLORS.navy, 0.82 * k));
      g.addColorStop(1, rgba(COLORS.navy, 0.94 * k));
    }
    if (text) {
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, fr.w, fr.h);
      hexPattern(ctx, fr, { color: '#ffffff', alpha: 0.1, x0: 0, y0: fr.h, x1: 0, y1: fr.h * 0.4 });
    }

    const decor = d.decor !== false;
    const decorR = 232 * fr.s;
    const decorX = fr.w - 64 * fr.s;
    const decorY = fr.labelTop + 96 * fr.s;
    if (decor) {
      hexPath(ctx, decorX, decorY, decorR);
      ctx.strokeStyle = COLORS.cyan;
      ctx.lineWidth = 10 * fr.s;
      ctx.stroke();
      const dx = decorX - decorR * (SQRT3 / 2);
      region('decor', dx, decorY - decorR, fr.w - dx, decorR * 2);
    }

    drawLabel(ctx, fr, d.label, PAL, fr.contentW - 220);
    labelRegion(ctx, fr, d.label, fr.contentW - 220);

    // Liggend: de tekst loopt door tot de ondermarge en blijft links van het logo. Past hij
    // onder de cyaan zeshoek, dan krijgt hij die breedte ook; anders blijft hij ernaast
    const bottom = textBottom(fr);
    const areaH = bottom - fr.contentTop;
    const layout = (maxW) => {
      const sub = fit('subtitle', ctx, runsFrom(d.subtitle), maxW, 190, TYPE.body, { min: 26, maxLines: 4 });
      const gap = sub.lines.length ? 34 : 0;
      const title = fit('title', ctx, runsFrom(d.title, { dot: d.dot }), maxW, areaH - sub.height - gap, { ...TYPE.title, size: titleSize(TYPE.title.size, d) }, { min: TITLE_MIN });
      const total = title.height + gap + sub.height;
      const top = middle ? fr.contentTop + (areaH - total) / 2 : bottom - total;
      return { sub, gap, title, total, top };
    };
    let L;
    if (fr.landscape) {
      const besideLogo = Math.min(fr.contentW - 40, fr.logo.x - 48 - fr.m);
      const besideDecor = Math.min(besideLogo, decorX - decorR * (SQRT3 / 2) - 48 - fr.m);
      const keep = over.length;
      L = layout(besideLogo);
      if (decor && L.top < decorY + decorR + 24) {
        over.length = keep;   // de brede proef telt niet mee als "te lang"
        L = layout(besideDecor);
      }
    } else {
      L = layout(fr.contentW - 40);
    }
    const { sub, gap, title, top } = L;

    drawText(ctx, title, fr.m, top, { color: '#ffffff', em: COLORS.cyan });
    drawText(ctx, sub, fr.m, top + title.height + gap, { color: 'rgba(255,255,255,.9)', em: '#ffffff' });
    textRegion('title', title, fr.m, top);
    textRegion('subtitle', sub, fr.m, top + title.height + gap);
    return { photo };
  }

  // 3. Pure blog post: titel links, foto in een zeshoek rechtsboven, cta onderin
  function tplBlog(ctx, fr, d, env) {
    const pal = PAL;
    paintBackground(ctx, fr);

    const r = fr.landscape ? sideHexR(fr) : fr.story ? 300 : fr.portrait ? 272 : 230;
    const cx = fr.w + 34 - (r * SQRT3) / 2;
    const cy = fr.labelTop - 44 * fr.s + r;
    hexEcho(ctx, cx, cy, r);
    const photo = drawPhoto(ctx, env.photo, { x: cx - (r * SQRT3) / 2, y: cy - r, w: r * SQRT3, h: r * 2, hex: { cx, cy, r } }, env.crop);
    region('photo', cx - (r * SQRT3) / 2, cy - r, Math.min(r * SQRT3, fr.w - (cx - (r * SQRT3) / 2)), r * 2);

    const hexLeft = cx - r * 0.17 - (r * SQRT3) / 2;
    const colW = hexLeft - fr.m - 44;
    drawLabel(ctx, fr, d.label, pal, colW);
    labelRegion(ctx, fr, d.label, colW);

    // Onderin: zin met het onderwerp + magenta cta-blok (geen knop: zonder pijl)
    const block = planCta(ctx, d.button, fr.landscape ? 0.85 : 1);
    const topic = String(d.topic || '').trim();
    const ctaText = String(d.cta || '').replace(/\{onderwerp\}/gi, topic ? `**${topic}**` : '…');
    if (fr.landscape) {
      // Liggend is de hoogte krap (zeker met de badge linksonder): titel en zin krimpen samen
      // tot ze tussen label en blok passen, zoals in de carousel. Nooit over elkaar heen
      const blockY = textBottom(fr) - block.h;
      const room = blockY - fr.contentTop;
      const titleRuns = runsFrom(d.title, { dot: d.dot });
      const ctaRuns = runsFrom(ctaText);
      let title;
      let cta;
      let gapTitle;
      let gapCta;
      for (let k = 1; k >= 0.55; k -= 0.05) {
        title = layoutText(ctx, titleRuns, colW, { ...TYPE.title, size: Math.round(titleSize(72, d) * k) });
        cta = layoutText(ctx, ctaRuns, colW, { ...TYPE.body, size: Math.max(22, Math.round(32 * k)) });
        gapCta = cta.lines.length ? Math.round(28 * k) : 0;
        gapTitle = cta.lines.length ? Math.round(36 * k) : 0;
        if (title.height + gapTitle + cta.height + gapCta <= room && !title.broken) break;
        if (k - 0.05 < 0.55) {
          flags.overflow = true;
          over.push('cta');
        }
      }
      const ctaTop = blockY - gapCta - cta.height;
      drawText(ctx, title, fr.m, fr.contentTop, { color: pal.text, em: pal.em });
      drawText(ctx, cta, fr.m, ctaTop, { color: pal.body, em: pal.text });
      block.draw(fr.m, blockY);
      textRegion('title', title, fr.m, fr.contentTop);
      textRegion('cta', cta, fr.m, ctaTop);
      region('button', fr.m, blockY, block.w, block.h);
      return { photo };
    }
    const cta = fit('cta', ctx, runsFrom(ctaText), fr.contentW, 150, { ...TYPE.body, size: 32 }, { min: BODY_MIN, maxLines: 3 });
    const blockY = textBottom(fr) - block.h;
    const ctaTop = cta.lines.length ? blockY - 34 - cta.height : blockY;

    // Titel bovenin de linkerkolom, naast de zeshoek
    const titleMaxH = Math.max(80, ctaTop - 52 - fr.contentTop);
    const title = fit('title', ctx, runsFrom(d.title, { dot: d.dot }), colW, titleMaxH, { ...TYPE.title, size: titleSize(72, d) }, { min: 40 });
    drawText(ctx, title, fr.m, fr.contentTop, { color: pal.text, em: pal.em });

    drawText(ctx, cta, fr.m, ctaTop, { color: pal.body, em: pal.text });
    block.draw(fr.m, blockY);
    textRegion('title', title, fr.m, fr.contentTop);
    textRegion('cta', cta, fr.m, ctaTop);
    region('button', fr.m, blockY, block.w, block.h);
    return { photo };
  }

  // Resultaat-tegel voor de case, in de stijl van .score-tile uit de tools
  function planResult(ctx, fr, d, pal, width = fr.contentW, k = 1) {
    const value = String(d.resultValue || '').trim();
    const label = String(d.resultLabel || '').trim();
    if (!value && !label) return null;

    const pad = 36 * k;
    const bar = 10;
    const x = fr.m;
    const w = width;
    const valueSize = 100 * k;
    const headSize = 20;
    setFont(ctx, 800, valueSize, -0.02);
    const valueW = value ? ctx.measureText(value).width : 0;
    const descX = x + bar + pad + (value ? valueW + 36 : 0);
    const descW = x + w - pad - descX;
    const desc = fit('result', ctx, runsFrom(label), descW, 150 * k, { ...TYPE.body, size: Math.round(32 * k), lh: 1.35 }, { min: BODY_MIN, maxLines: 3 });
    const valueH = value ? valueSize * CAP : 0;
    const descH = desc.lines.length ? desc.height - desc.st.size * DESC : 0;
    const rowH = Math.max(valueH, descH);
    const h = pad + headSize * CAP + 26 + rowH + pad;

    return {
      h,
      draw(y) {
        ctx.fillStyle = 'rgba(255,255,255,.07)';
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = COLORS.cyan;
        ctx.fillRect(x, y, bar, h);

        setFont(ctx, 700, headSize, 0.12);
        ctx.fillStyle = pal.soft;
        ctx.fillText('RESULTAAT', x + bar + pad, y + pad + headSize * CAP);

        const rowTop = y + pad + headSize * CAP + 26;
        if (value) {
          setFont(ctx, 800, valueSize, -0.02);
          ctx.fillStyle = COLORS.cyan;
          ctx.fillText(value, x + bar + pad, rowTop + (rowH + valueH) / 2);
        }
        if (desc.lines.length) {
          drawText(ctx, desc, descX, rowTop + (rowH - descH) / 2, { color: pal.body, em: pal.text });
        }
      },
    };
  }

  // 4. Pure case post: klantlogo in een zeshoek, aanpak als kop, resultaat onderin
  function tplCase(ctx, fr, d, env) {
    const usePhoto = !!(d.photoBg && env.photo);
    const pal = PAL;
    let photo = null;
    region(usePhoto ? 'photo' : 'background', 0, 0, fr.w, fr.h);
    if (usePhoto) {
      photo = drawPhoto(ctx, env.photo, { x: 0, y: 0, w: fr.w, h: fr.h }, env.crop);
      ctx.fillStyle = rgba(COLORS.ink, 0.86);
      ctx.fillRect(0, 0, fr.w, fr.h);
      hexPattern(ctx, fr, { color: '#ffffff', alpha: 0.08, x0: 0, y0: 0, x1: 0, y1: fr.h * 0.8 });
    } else {
      paintBackground(ctx, fr);
    }

    // Klant in een witte zeshoek rechtsboven
    const r = fr.landscape ? 110 : fr.story ? 140 : fr.portrait ? 134 : 120;
    const hx = fr.w - fr.m - (r * SQRT3) / 2;
    const hy = fr.labelTop + r;
    hexEcho(ctx, hx, hy, r);
    hexPath(ctx, hx, hy, r);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    const client = String(d.client || '').trim();
    region(env.clientLogo ? 'logo' : 'client', hx - (r * SQRT3) / 2, hy - r, r * SQRT3, r * 2);
    if (env.clientLogo) {
      drawContain(ctx, env.clientLogo, hx - r * 0.6, hy - r * 0.42, r * 1.2, r * 0.84);
    } else {
      const name = fit('client', ctx, runsFrom(client || 'klantlogo'), r * 1.25, r * 0.9, { size: 32, weight: 800, emWeight: 800, track: -0.01, lh: 1.1 }, { min: 18 });
      drawText(ctx, name, hx - r * 0.625, hy - (name.height - name.st.size * DESC) / 2, { color: COLORS.ink, em: COLORS.ink, align: 'center' });
    }

    const hexLeft = hx - r * 0.17 - (r * SQRT3) / 2;
    const colW = hexLeft - fr.m - 40;
    drawLabel(ctx, fr, d.label, pal, colW);
    labelRegion(ctx, fr, d.label, colW);

    // "Voor {klant} hebben wij {diensten} gedaan." — diensten krijgen nadruk
    const services = (d.services || []).map((s) => String(s || '').trim()).filter(Boolean).map((s) => `**${s}**`);
    const joined = services.length <= 1
      ? services[0] || '…'
      : `${services.slice(0, -1).join(', ')} en ${services[services.length - 1]}`;
    const sentence = String(d.sentence || 'Voor {klant} hebben wij {diensten} gedaan.')
      .replace(/\{klant\}/gi, client || 'deze klant')
      .replace(/\{diensten\}/gi, joined);

    // Liggend: het resultaat in de kolom onder de zin, naast de klant-zeshoek
    const resultW = fr.landscape ? colW : fr.contentW;
    const result = planResult(ctx, fr, d, pal, resultW, fr.landscape ? 0.8 : 1);
    const bottom = textBottom(fr);
    const resultY = result ? bottom - result.h : bottom;
    // Liggend geen ondergrens: de zin past erboven of de tool meldt dat hij te lang is
    const titleMaxH = fr.landscape ? resultY - 28 - fr.contentTop : Math.max(80, resultY - 52 - fr.contentTop);
    const title = fit('title', ctx, runsFrom(sentence, { dot: d.dot }), colW, titleMaxH, { ...TYPE.title, size: titleSize(68, d) }, { min: fr.landscape ? 30 : 38 });
    drawText(ctx, title, fr.m, fr.contentTop, { color: pal.text, em: pal.em });
    textRegion('title', title, fr.m, fr.contentTop);

    if (result) {
      result.draw(resultY);
      region('result', fr.m, resultY, resultW, result.h);
    }
    return { photo };
  }

  // 5. Informatieve carousel: nummer in zeshoek, titel + tekst, swipe-indicator.
  //    Een slide zonder nummer (numbered: false) is een opener of afsluiter:
  //    geen zeshoek, een grotere titel en het blok optisch in het midden. Hij
  //    telt niet mee, dus na een hook is de eerste tip gewoon 01.
  //    Elke slide kan een eigen foto hebben (slide.photo, beeld in
  //    env.slidePhotos[index], uitsnede in slide.crop), op twee manieren:
  //      - zeshoek: rechtsboven, over de rand, met de cyaan echo (zoals de blog);
  //        de titel staat in de kolom ernaast, de tekst begint onder de zeshoek
  //      - achtergrond: het hele vlak, onder een effen laag Inkt (zoals de case);
  //        hoe donker staat per slide in slide.darken (30-100%, standaard 80)
  function tplCarousel(ctx, fr, d, env) {
    const pal = PAL;
    const slides = Array.isArray(d.slides) && d.slides.length ? d.slides : [{ title: '', body: '' }];
    const index = clamp(env.slideIndex != null ? env.slideIndex : d.active || 0, 0, slides.length - 1);
    const slide = slides[index] || {};
    const last = !!slide.last;

    const mode = slide.photo ? (slide.photoStyle === 'achtergrond' ? 'bg' : 'hex') : null;
    const img = (env.slidePhotos || [])[index] || null;
    let photo = null;
    let colW = fr.contentW;   // breedte van label en titel
    let hexBottom = 0;        // de tekst begint pas onder de zeshoek (met echo)
    if (mode === 'bg') {
      photo = drawPhoto(ctx, img, { x: 0, y: 0, w: fr.w, h: fr.h }, slide.crop);
      region('photo', 0, 0, fr.w, fr.h);
      // Zonder foto lichter, zodat "sleep hier je foto" te lezen blijft
      const darken = clamp((slide.darken != null ? Number(slide.darken) : 80) / 100, 0, 1);
      ctx.fillStyle = rgba(COLORS.ink, img ? darken : 0.4);
      ctx.fillRect(0, 0, fr.w, fr.h);
      hexPattern(ctx, fr, { color: '#ffffff', alpha: 0.08, x0: 0, y0: 0, x1: 0, y1: fr.h * 0.8 });
    } else {
      paintBackground(ctx, fr);
    }
    if (mode === 'hex') {
      const r = fr.landscape ? sideHexR(fr) : fr.story ? 290 : 250;
      const cx = fr.w + 34 - (r * SQRT3) / 2;
      const cy = fr.labelTop - 44 * fr.s + r;
      hexEcho(ctx, cx, cy, r);
      photo = drawPhoto(ctx, img, { x: cx - (r * SQRT3) / 2, y: cy - r, w: r * SQRT3, h: r * 2, hex: { cx, cy, r } }, slide.crop);
      region('photo', cx - (r * SQRT3) / 2, cy - r, Math.min(r * SQRT3, fr.w - (cx - (r * SQRT3) / 2)), r * 2);
      colW = cx - r * 0.17 - (r * SQRT3) / 2 - fr.m - 44;
      // Liggend staat de zeshoek naast de hele kolom: ook de tekst blijft ernaast
      hexBottom = fr.landscape ? 0 : cy + r * 1.15;
    }

    drawLabel(ctx, fr, d.label, pal, colW);
    labelRegion(ctx, fr, d.label, colW);

    const numbered = slide.numbered !== false;
    let top = fr.contentTop;
    let tx = fr.m;   // linkerkant van titel en tekst
    if (numbered) {
      // Slidenummer in een cyaan zeshoek, zoals de kernwaarden in het brandbook
      const r = 46;
      const bx = fr.m + (r * SQRT3) / 2;
      const by = fr.contentTop + r;
      hexPath(ctx, bx, by, r);
      ctx.fillStyle = COLORS.cyan;
      ctx.fill();
      setFont(ctx, 800, 32, 0);
      const count = slides.slice(0, index + 1).filter((s) => s && s.numbered !== false).length;
      const num = String(count).padStart(2, '0');
      ctx.fillStyle = COLORS.ink;
      ctx.fillText(num, bx - ctx.measureText(num).width / 2, by + (32 * CAP) / 2);
      region('slide', bx - (r * SQRT3) / 2, by - r, r * SQRT3, r * 2);
      // Liggend is de hoogte krap: het nummer staat naast de titel, anders erboven
      if (fr.landscape) tx = fr.m + r * SQRT3 + 36;
      else top = by + r + 48;
    }
    const areaH = fr.contentBottom - top;
    const indent = tx - fr.m;
    const fullW = fr.contentW - 16 - indent;
    const titleW = mode === 'hex' ? colW - indent : fullW;
    const maxW = mode === 'hex' && fr.landscape ? colW - indent : fullW;
    const titleRuns = runsFrom(slide.title, { dot: d.dot });

    // Titel en tekst samen verkleinen tot ze passen, in dezelfde verhouding.
    // Met een zeshoek begint de tekst (over de volle breedte) pas onder de foto
    // Naast een zeshoek is de kolom smaller: ook een hook begint dan op 72
    const baseSize = numbered || mode === 'hex' ? titleSize(72, d) : titleSize(88, d);
    let title;
    let body;
    let gap;
    let bodyOffset;
    for (let k = 1; k >= 0.5; k -= 0.04) {
      title = layoutText(ctx, titleRuns, titleW, { ...TYPE.title, size: Math.round(baseSize * k) });
      body = layoutBody(ctx, slide.body, maxW, { ...TYPE.body, size: Math.max(22, Math.round(36 * k)) });
      gap = title.lines.length && body.items.length ? Math.round(36 * k) : 0;
      bodyOffset = title.height + gap;
      if (mode === 'hex' && body.items.length) bodyOffset = Math.max(bodyOffset, hexBottom + Math.round(40 * k) - top);
      const fits = bodyOffset + body.height <= areaH;
      // In de smalle kolom naast de zeshoek nooit midden in een woord afbreken
      if (fits && !(mode === 'hex' && title.broken)) break;
      if (!fits && k - 0.04 < 0.5) {
        flags.overflow = true;
        over.push('body');
      }
    }

    // Zonder nummer: iets boven het midden, daar valt het oog eerst (niet naast een zeshoek)
    if (!numbered && mode !== 'hex') top += Math.max(0, Math.round((areaH - (bodyOffset + body.height)) * 0.42));
    drawText(ctx, title, tx, top, { color: pal.text, em: pal.em });
    drawBody(ctx, body, tx, top + bodyOffset, { color: pal.body, em: pal.text });
    textRegion('title', title, tx, top);
    region('body', tx, top + bodyOffset, maxW, body.height);

    // De laatste slide nodigt niet uit om door te swipen. Liggend staat een fotozeshoek
    // op de plek van de halve zeshoek aan de rand: dan alleen de swipe-regel
    if (!last) {
      drawSwipe(ctx, fr, index, slides.length, pal);
      if (!(fr.landscape && mode === 'hex')) drawEdgeCue(ctx, fr);
    }
    // Badge alleen op de laatste slide: daar is linksonder vrij en staat de
    // afsluiter; op elke slide zou het een watermerk worden
    return { photo, slideIndex: index, last, badge: last };
  }

  const TEMPLATES = {
    photo: tplPhoto,
    overlay: tplOverlay,
    blog: tplBlog,
    case: tplCase,
    carousel: tplCarousel,
  };

  /* ---------------------------------------------------------------------------
     Publieke functie
     ------------------------------------------------------------------------- */

  /**
   * Tekent de post op `canvas`.
   *   state: { template, format, dot, badge, data: { [template]: {...} } }
   *   env:   { photo, clientLogo, logo, badge, crop, slideIndex, slidePhotos }
   *   opts:  { scale } — 1 = 1080 px breed
   */
  function renderPost(canvas, state, env, opts = {}) {
    const fr = frame(state.format);
    fr.badgeOn = !!state.badge;   // liggend: dan blijft de tekst boven de voetregel
    const ctx = prepare(canvas, fr.w, fr.h, opts.scale || 1);
    regions = [];
    over = [];
    const id = TEMPLATES[state.template] ? state.template : 'photo';
    const data = { ...(state.data && state.data[id]), dot: state.dot !== false };

    ctx.save();
    const info = TEMPLATES[id](ctx, fr, data, env || {}) || {};
    ctx.restore();

    // Vaste elementen als laatste, zodat niets ze kan bedekken
    drawLogo(ctx, fr, env && env.logo);
    // Emerce 100-badge: alleen als hij aan staat en het template hem niet weglaat
    if (state.badge && info.badge !== false) drawBadge(ctx, fr, env && env.badge);
    finish(ctx, fr.w, GRID.bar);

    return { ...info, overflow: flags.overflow, overflowKeys: over.slice(), regions: regions.slice(), width: fr.w, height: fr.h, frame: fr };
  }

  global.PMTemplates = { renderPost, frame, hasText, FORMATS, TEMPLATE_META, COLORS, GRID };
})(window);
