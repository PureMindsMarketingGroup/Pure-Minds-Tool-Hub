/* =============================================================================
   newsletter/email.js — de HTML van een Pure Minds-mail, uit blokken
   (window.PMEmail; ook in Node, getest in tests/newsletter.test.js)
   -----------------------------------------------------------------------------
   Dezelfde opbouw als email/pure-minds-email.html: tabellen met inline stijl,
   600 px breed, kolommen die op een telefoon onder elkaar vallen, knoppen die
   ook in Outlook werken (VML). Kop (logo, "bekijk online") en voet (contact,
   socials, Emerce 100, afmelden) staan vast; daartussen de blokken.

     PMEmail.build(toestand, { preview, pending })   de hele HTML
         preview  voor de preview in de maker: elk blok krijgt data-pm-blok,
                  {voornaam} wordt een blokje, een lege foto een grijs vlak
         pending  { sleutel: blob-url }: foto's die nog uploaden (alleen preview)
     PMEmail.check(toestand, html?)   [{ level, key, block, text }]: wat nog moet
     PMEmail.normalize(toestand)      opgeslagen toestand netjes maken
     PMEmail.starter(soort)           'nieuwsbrief' (alle blokken) of 'kort'
     PMEmail.block(type)              een nieuw blok met voorbeeldtekst
     PMEmail.BLOCKS                   de blokken: naam, uitleg, standaardinhoud
     PMEmail.safeUrl(link)            alleen https, http, mailto en tel ('' = afgekeurd)
     PMEmail.safeImg(src)             alleen https (in de preview ook blob:)
     PMEmail.bytes(html)              grootte in bytes (Gmail knipt vanaf 102 KB)

   Tekst in de velden:
     **woord**            vet
     [tekst](link)        een link in de lopende tekst
     {voornaam}           voornaam van de ontvanger (Brevo vult hem in; anders "daar")
     een witregel         nieuwe alinea
   Een kop krijgt vanzelf de cyaan punt (niet na ? of !). Een tekstlink krijgt
   vanzelf een pijl.

   Huisstijl: Inkt #303030 voor tekst, Pure Cyaan #1AB9E2 alleen als accent (op
   wit nooit als tekst), Pure Magenta #B61B50 alleen voor de hoofdknop in de
   opening. Pure Minds Sans 400, 700 en 800, anders Open Sans, anders Arial.
   ============================================================================= */
(function (global) {
  'use strict';

  const SITE = 'https://puremindsmarketinggroup.github.io/Pure-Minds-Tool-Hub/';
  const IMG = `${SITE}email/img/`;
  const PHOTOS = `${SITE}assets/styleguide/photos/`;
  const FONT = "'Pure Minds Sans','Open Sans',Arial,sans-serif";
  const FIRSTNAME = '{{ contact.FIRSTNAME | default : "daar" }}';
  const MAX_BLOCKS = 30;

  // Foto's van Pure Minds die al online staan (de fotobank in de maker)
  const STOCK = [
    { file: 'team-overleg.jpg', w: 1600, h: 1066, alt: 'Collega’s in overleg aan tafel' },
    { file: 'werkplek-bureau.jpg', w: 1600, h: 1066, alt: 'Werkplek met laptop op een bureau' },
    { file: 'laptop-raam.jpg', w: 1600, h: 1067, alt: 'Laptop op tafel bij het raam' },
    { file: 'analytics-scherm.jpg', w: 1600, h: 1158, alt: 'Scherm met grafieken en cijfers' },
    { file: 'vakman-werkplaats.jpg', w: 1600, h: 1068, alt: 'Vakman aan het werk in zijn werkplaats' },
    { file: 'bloemist.jpg', w: 1051, h: 1600, alt: 'Bloemist in haar winkel' },
  ].map((p) => ({ ...p, src: PHOTOS + p.file }));
  const stock = (file) => {
    const p = STOCK.find((x) => x.file === file);
    return { src: p.src, alt: p.alt, w: p.w, h: p.h };
  };

  const SAMPLE_PREHEADER = 'Hier komt de voorvertoningstekst: één korte zin die nieuwsgierig maakt.';

  /* ---------------------------------------------------------------------------
     Blokken: naam en uitleg (voor de maker) en de voorbeeldinhoud
     ------------------------------------------------------------------------- */

  const BLOCKS = {
    opening: {
      name: 'Opening',
      sub: 'kop, intro en de magenta knop',
      real: ['label'],
      make: () => ({
        label: 'Pure nieuws',
        title: 'Hier komt de kop van je e-mail',
        intro: 'Hoi {voornaam}, in één of twee zinnen waar deze e-mail over gaat en waarom de lezer verder wil lezen.',
        button: { text: 'plan een gesprek', url: 'https://www.pureminds.nl/contact/' },
      }),
    },
    foto: {
      name: 'Foto',
      sub: 'over de hele breedte',
      make: () => ({ img: stock('team-overleg.jpg'), url: '' }),
    },
    tekst: {
      name: 'Tekst',
      sub: 'tussenkop, alinea’s en een link',
      make: () => ({
        title: 'Een tussenkop die de alinea samenvat',
        body: 'Lopende tekst in Inkt. Schrijf zoals we praten: helder, met **je en jij**, en zonder vakjargon. Houd alinea’s kort; in een e-mail scant de lezer eerst.',
        link: { text: 'Lees verder op onze website', url: 'https://www.pureminds.nl/' },
      }),
    },
    fototekst: {
      name: 'Foto en tekst',
      sub: 'naast elkaar, op een telefoon onder elkaar',
      make: () => ({
        img: stock('werkplek-bureau.jpg'),
        side: 'links',
        title: 'Een onderwerp met een foto',
        body: 'Twee of drie zinnen over dit onderwerp: een blog, een case of een nieuwe dienst.',
        link: { text: 'Bekijk het', url: 'https://www.pureminds.nl/' },
      }),
    },
    punten: {
      name: 'Punten',
      sub: 'twee of drie, met een zeshoek of icoon',
      make: () => ({
        title: 'Drie dingen om te onthouden',
        items: ['Eerste punt', 'Tweede punt', 'Derde punt'].map((t) => ({ icon: null, title: t, text: 'Eén korte zin met de kern.' })),
      }),
    },
    resultaat: {
      name: 'Resultaat',
      sub: 'een cijfer in cyaan op Inkt',
      make: () => ({ label: 'Resultaat · Studio Noord', number: '+184%', text: 'meer aanvragen binnen drie maanden' }),
    },
    afsluiter: {
      name: 'Afsluiter',
      sub: 'kop, tekst en een rustige knop',
      real: ['title', 'body'],   // echte tekst van Pure Minds, geen voorbeeld: mag blijven staan
      make: () => ({
        title: 'Vragen? We denken graag mee',
        body: 'Bel ons op 045 369 0530 of stuur een mail naar info@pureminds.nl.',
        button: { text: 'mail ons', url: 'mailto:info@pureminds.nl' },
      }),
    },
  };
  const TYPES = Object.keys(BLOCKS);

  let counter = 0;
  const uid = () => `b${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  function block(type) {
    if (!BLOCKS[type]) throw new Error(`Onbekend blok: ${type}`);
    return { id: uid(), type, ...BLOCKS[type].make() };
  }

  const STARTERS = {
    nieuwsbrief: ['opening', 'foto', 'tekst', 'fototekst', 'punten', 'resultaat', 'afsluiter'],
    kort: ['opening', 'tekst', 'afsluiter'],
  };

  function starter(kind = 'nieuwsbrief') {
    return { v: 1, kind: STARTERS[kind] ? kind : 'nieuwsbrief', name: '', subject: '', preheader: SAMPLE_PREHEADER, ideas: [], blocks: (STARTERS[kind] || STARTERS.nieuwsbrief).map(block) };
  }

  /* ---------------------------------------------------------------------------
     Opgeslagen toestand netjes maken: onbekende blokken weg, ontbrekende velden erbij
     ------------------------------------------------------------------------- */

  const str = (v, max = 2000) => (typeof v === 'string' ? v.slice(0, max) : '');
  const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

  function normImg(v, fallback) {
    const o = obj(v);
    const out = { src: str(o.src, 1000), alt: str(o.alt, 200) };
    // Een blob-link van een upload die niet afkwam, werkt na herladen niet meer
    if (/^blob:/i.test(out.src)) out.src = '';
    if (!('src' in o) && fallback) return { ...fallback };
    for (const k of ['w', 'h']) if (Number.isFinite(o[k]) && o[k] > 0) out[k] = Math.round(o[k]);
    if (typeof o.orig === 'string') out.orig = o.orig;
    if (typeof o.name === 'string') out.name = o.name.slice(0, 120);
    if (typeof o.query === 'string') out.query = o.query.slice(0, 100);   // zoektermen van de AI (Pexels)
    if (['auto', '3:2', '16:9', '1:1'].includes(o.shape)) out.shape = o.shape;
    return out;
  }
  const normLink = (v) => ({ text: str(obj(v).text, 80), url: str(obj(v).url, 1000) });

  function normBlock(b) {
    const o = obj(b);
    if (!BLOCKS[o.type]) return null;
    const base = BLOCKS[o.type].make();
    const out = { id: typeof o.id === 'string' && o.id ? o.id.slice(0, 40) : uid(), type: o.type };
    for (const [key, value] of Object.entries(base)) {
      if (key === 'img') out.img = normImg(o.img, value);
      else if (key === 'button' || key === 'link') out[key] = key in o ? normLink(o[key]) : value;
      else if (key === 'items') {
        const items = Array.isArray(o.items) ? o.items.slice(0, 3) : value;
        out.items = items.map((it, i) => {
          const x = obj(it);
          const icon = obj(x.icon);
          return {
            icon: icon.src ? { src: str(icon.src, 1000), name: str(icon.name, 80) } : null,
            title: 'title' in x ? str(x.title, 120) : value[i] ? value[i].title : '',
            text: 'text' in x ? str(x.text, 400) : value[i] ? value[i].text : '',
          };
        });
        while (out.items.length < 2) out.items.push({ icon: null, title: '', text: '' });
      } else if (key === 'side') out.side = o.side === 'rechts' ? 'rechts' : 'links';
      else if (key === 'url') out.url = str(o.url, 1000);
      else out[key] = key in o ? str(o[key]) : value;
    }
    if (out.items) out.items.forEach((it) => { if (it.icon && /^blob:/i.test(it.icon.src)) it.icon = null; });
    return out;
  }

  function normalize(saved) {
    const o = obj(saved);
    if (!Array.isArray(o.blocks)) return starter(o.kind);
    const seen = new Set();
    const blocks = o.blocks.map(normBlock).filter(Boolean).slice(0, MAX_BLOCKS).map((b) => {
      if (seen.has(b.id)) b.id = uid();
      seen.add(b.id);
      return b;
    });
    return {
      v: 1,
      kind: STARTERS[o.kind] ? o.kind : 'nieuwsbrief',
      name: str(o.name, 120),
      subject: str(o.subject, 150),   // onderwerpregel: vul je in Brevo in, staat niet in de HTML
      preheader: 'preheader' in o ? str(o.preheader, 200) : SAMPLE_PREHEADER,
      ideas: Array.isArray(o.ideas) ? o.ideas.filter((x) => typeof x === 'string').map((x) => x.slice(0, 200)).slice(0, 12) : [],   // fotosuggesties van de AI
      blocks,
    };
  }

  /* ---------------------------------------------------------------------------
     Veilige tekst, links en plaatjes
     ------------------------------------------------------------------------- */

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  // Alleen http(s), mailto en tel. "www.site.nl" en een los e-mailadres of telefoonnummer mogen ook
  function safeUrl(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    // Telefoon: "045 369 0530" of "tel:+31 45 ..."; een 0 vooraan wordt +31
    const phone = /^(tel:)?(\+?[\d\s()-]{6,})$/i.exec(s);
    if (phone) {
      const digits = phone[2].replace(/[\s()-]/g, '');
      if (!/^\+?\d{6,15}$/.test(digits)) return '';
      if (!phone[1] && digits.length < 8) return '';
      return `tel:${digits.replace(/^0(?=[1-9])/, '+31')}`;
    }
    if (/[\s<>"'`\\]/.test(s)) return '';
    if (/^https?:\/\/[^/?#]+\.[^/?#]+/i.test(s)) return s;
    if (/^mailto:[^@]+@[^@]+\.[^@]+$/i.test(s)) return s;
    if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return '';   // javascript:, data:, ftp: ...
    if (/^[^@/]+@[^@/]+\.[a-z]{2,}$/i.test(s)) return `mailto:${s}`;
    if (/^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}([/?#]\S*)?$/i.test(s)) return `https://${s}`;
    return '';
  }

  function safeImg(src, preview = false) {
    const s = String(src || '').trim();
    if (/^https:\/\/[^\s"'<>]+$/i.test(s)) return s;
    if (preview && /^blob:[^\s"'<>]+$/i.test(s)) return s;
    return '';
  }

  // Lopende tekst: **vet**, [tekst](link), {voornaam}, enkele Enter = nieuwe regel
  function inline(raw, o, { dark = false } = {}) {
    const linkStyle = dark
      ? 'color:#ffffff;text-decoration:none;border-bottom:2px solid #1AB9E2;'
      : 'color:#303030;text-decoration:none;border-bottom:2px solid #1AB9E2;';
    const text = String(raw || '');
    const parts = [];
    const re = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;
    let last = 0;
    let m;
    while ((m = re.exec(text))) {
      parts.push(plain(text.slice(last, m.index), o));
      const href = safeUrl(m[2]);
      parts.push(href ? `<a href="${esc(href)}" target="_blank" style="${linkStyle}">${plain(m[1], o)}</a>` : plain(m[1], o));
      last = m.index + m[0].length;
    }
    parts.push(plain(text.slice(last), o));
    return parts.join('');
  }

  function plain(raw, o) {
    let s = esc(raw);
    s = s.replace(/\*\*([^*\n][^*]*?)\*\*/g, '<strong style="font-weight:700;">$1</strong>').replace(/\*\*/g, '');
    s = s.replace(/\{voornaam\}/gi, o.preview
      ? '<span style="background-color:#E3F6FC;color:#303030;padding:0 4px;border-radius:3px;">voornaam</span>'
      : FIRSTNAME);
    return s.replace(/\r?\n/g, '<br>');
  }

  const paragraphs = (raw) => String(raw || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

  // Kop met de cyaan punt erachter, behalve na ? ! of :
  function heading(raw, o) {
    const t = String(raw || '').trim();
    if (!t) return '';
    const dot = '<span style="color:#1AB9E2;">.</span>';
    if (/[?!:…]$/.test(t)) return plain(t, o);
    return plain(t.replace(/\.+$/, ''), o) + dot;
  }

  // Linktekst met een pijl (tenzij er al een staat)
  const arrowed = (t) => (/[→>»]\s*$/.test(t) ? t : `${t} →`);

  /* ---------------------------------------------------------------------------
     Bouwstenen
     ------------------------------------------------------------------------- */

  const td = (style, inner, attrs = '') => `<td${attrs} style="font-family:${FONT};${style}">${inner}</td>`;
  const table = (inner, extra = '') => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"${extra}>${inner}</table>`;

  // Magenta hoofdknop (één per mail) of rustige knop met Inkt-rand; ook in Outlook (VML)
  function button(b, kind) {
    const href = safeUrl(b && b.url);
    const text = String((b && b.text) || '').trim();
    if (!href || !text) return '';
    const label = esc(text);
    if (kind === 'hoofd') {
      const w = Math.max(160, Math.round(text.length * 9.5 + 60));
      return `<!--[if mso]>
<v:rect xmlns:v="urn:schemas-microsoft-com:vml" href="${esc(href)}" style="height:52px;v-text-anchor:middle;width:${w}px;" stroked="false" fillcolor="#B61B50">
<center style="color:#ffffff;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">${label}</center>
</v:rect>
<![endif]-->
<!--[if !mso]><!-- --><a class="pm-btn" href="${esc(href)}" target="_blank" style="display:inline-block;background-color:#B61B50;color:#ffffff;font-family:${FONT};font-size:16px;line-height:20px;font-weight:700;padding:16px 28px;text-decoration:none;">${label}</a><!--<![endif]-->`;
    }
    const w = Math.max(140, Math.round(text.length * 9 + 56));
    return `<!--[if mso]>
<v:rect xmlns:v="urn:schemas-microsoft-com:vml" href="${esc(href)}" style="height:48px;v-text-anchor:middle;width:${w}px;" strokecolor="#303030" strokeweight="2px" fillcolor="#ffffff">
<center style="color:#303030;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;">${label}</center>
</v:rect>
<![endif]-->
<!--[if !mso]><!-- --><a href="${esc(href)}" target="_blank" style="display:inline-block;border:2px solid #303030;color:#303030;font-family:${FONT};font-size:15px;line-height:20px;font-weight:700;padding:12px 24px;text-decoration:none;">${label}</a><!--<![endif]-->`;
  }

  // Tekstlink onder een tekstblok: Inkt met een cyaan streep eronder
  function textLink(l) {
    const href = safeUrl(l && l.url);
    const text = String((l && l.text) || '').trim();
    if (!href || !text) return '';
    return `<a href="${esc(href)}" target="_blank" style="color:#303030;text-decoration:none;border-bottom:2px solid #1AB9E2;">${esc(arrowed(text))}</a>`;
  }

  // Een foto: de geüploade, een die nog uploadt (preview), of een grijs vlak in de preview
  function photo(img, key, width, o, cls = 'pm-img-full') {
    const src = safeImg((o.pending && o.pending[key]) || (img && img.src), o.preview);
    if (!src) {
      if (!o.preview) return '';
      const h = Math.round(width * 2 / 3);
      return `<table role="presentation" width="${width}" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${width}px;"><tr><td align="center" valign="middle" height="${h}" style="height:${h}px;background-color:#E1E7EC;font-family:${FONT};font-size:14px;color:#5C6670;">kies een foto</td></tr></table>`;
    }
    const h = img && img.w && img.h ? Math.round((width * img.h) / img.w) : 0;
    return `<img class="${cls}" src="${esc(src)}" width="${width}"${h ? ` height="${h}"` : ''} alt="${esc((img && img.alt) || '')}" style="display:block;width:${width}px;max-width:100%;height:auto;">`;
  }

  /* ---------------------------------------------------------------------------
     De blokken als HTML. pad = { top, bottom } rond witte blokken (zie build)
     ------------------------------------------------------------------------- */

  const RENDER = {
    opening(b, o) {
      const btn = button(b.button, 'hoofd');
      const intro = paragraphs(b.intro);
      const rows = [];
      if (b.label.trim()) {
        rows.push(`<tr><td style="padding:0 0 18px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="middle" style="padding:0 10px 0 0;"><img src="${IMG}zeshoek-cyaan.png" width="14" height="16" alt="" style="display:block;width:14px;height:16px;"></td>
${td('font-size:13px;line-height:16px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#ffffff;', esc(b.label.trim()), ' valign="middle"')}
</tr></table></td></tr>`);
      }
      if (b.title.trim()) {
        rows.push(`<tr>${td(`font-size:36px;line-height:42px;font-weight:800;letter-spacing:-0.5px;color:#ffffff;padding:0 0 ${intro.length || btn ? 18 : 0}px 0;`, heading(b.title, o), ' class="pm-h1"')}</tr>`);
      }
      intro.forEach((p, i) => {
        const end = i === intro.length - 1;
        rows.push(`<tr>${td(`font-size:17px;line-height:28px;color:#e4e7ea;padding:0 0 ${end ? (btn ? 30 : 0) : 16}px 0;`, inline(p, o, { dark: true }))}</tr>`);
      });
      if (btn) rows.push(`<tr><td align="left">${btn}</td></tr>`);
      return `<td class="pm-px" style="padding:44px 40px 48px 40px;background-color:#303030;">${table(rows.join('\n'))}</td>`;
    },

    foto(b, o) {
      const img = photo(b.img, b.id, 600, o);
      if (!img) return '';
      const href = safeUrl(b.url);
      return `<td style="padding:0;">${href ? `<a href="${esc(href)}" target="_blank">${img}</a>` : img}</td>`;
    },

    tekst(b, o, pad) {
      const rows = [];
      const body = paragraphs(b.body);
      const link = textLink(b.link);
      if (b.title.trim()) rows.push(`<tr>${td('font-size:24px;line-height:30px;font-weight:700;color:#303030;padding:0 0 14px 0;', heading(b.title, o), ' class="pm-h2"')}</tr>`);
      body.forEach((p) => rows.push(`<tr>${td('font-size:16px;line-height:26px;color:#303030;padding:0 0 16px 0;', inline(p, o))}</tr>`));
      if (link) rows.push(`<tr>${td('font-size:16px;line-height:26px;font-weight:700;padding:4px 0 16px 0;', link)}</tr>`);
      if (!rows.length) return '';
      return `<td class="pm-px" style="padding:${pad.top}px 40px ${Math.max(0, pad.bottom - 16)}px 40px;">${table(rows.join('\n'))}</td>`;
    },

    fototekst(b, o, pad) {
      const right = b.side === 'rechts';
      const img = photo(b.img, b.id, 224, o);
      const body = paragraphs(b.body);
      const link = textLink(b.link);
      const rows = [];
      if (b.title.trim()) rows.push(`<tr>${td('font-size:19px;line-height:26px;font-weight:700;color:#303030;padding:0 0 10px 0;', heading(b.title, o))}</tr>`);
      body.forEach((p, i) => rows.push(`<tr>${td(`font-size:15px;line-height:24px;color:#303030;padding:0 0 ${i === body.length - 1 && !link ? 0 : 14}px 0;`, inline(p, o))}</tr>`));
      if (link) rows.push(`<tr>${td('font-size:15px;line-height:24px;font-weight:700;', link)}</tr>`);
      // Foto rechts: dir="rtl" zet hem rechts, op een telefoon blijft hij boven de tekst
      const dir = right ? ' dir="rtl"' : '';
      const ltr = right ? ' dir="ltr"' : '';
      const gap = right ? '0 0 0 24px' : '0 24px 0 0';
      const textW = img ? 272 : 520;
      const textCol = `<div class="pm-col"${ltr} style="display:inline-block;vertical-align:top;width:${textW}px;max-width:${textW}px;">${table(rows.join('\n'))}</div>`;
      const cols = img
        ? `<!--[if mso]><table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0"${dir}><tr><td width="248" valign="top"${ltr}><![endif]-->
<div class="pm-col pm-col-gap"${ltr} style="display:inline-block;vertical-align:top;width:224px;max-width:224px;padding:${gap};">${img}</div>
<!--[if mso]></td><td width="272" valign="top"${ltr}><![endif]-->
${textCol}
<!--[if mso]></td></tr></table><![endif]-->`
        : textCol;
      return `<td class="pm-px" style="padding:${pad.top}px 40px ${pad.bottom}px 40px;">${table(`<tr><td${dir} style="font-size:0;line-height:0;">
${cols}
</td></tr>`)}</td>`;
    },

    punten(b, o) {
      const items = b.items.slice(0, 3);
      const n = items.length;
      const widths = n === 2 ? [260, 260] : [173, 173, 174];
      const cols = items.map((it, i) => {
        const end = i === n - 1;
        const padR = end ? 0 : 16;
        const iconSrc = it.icon && safeImg((o.pending && o.pending[`${b.id}:${i}`]) || it.icon.src, o.preview);
        const icon = iconSrc
          ? `<img src="${esc(iconSrc)}" width="35" height="40" alt="" style="display:block;width:35px;height:40px;">`
          : `<img src="${IMG}zeshoek-cyaan.png" width="20" height="23" alt="" style="display:block;width:20px;height:23px;">`;
        const rows = [`<tr><td style="padding:0 ${padR}px 10px 0;">${icon}</td></tr>`];
        if (it.title.trim()) rows.push(`<tr>${td(`font-size:16px;line-height:22px;font-weight:700;color:#303030;padding:0 ${padR}px 6px 0;`, plain(it.title.trim(), o))}</tr>`);
        if (it.text.trim()) rows.push(`<tr>${td(`font-size:14px;line-height:22px;color:#303030;padding:0 ${padR}px 0 0;`, inline(it.text.trim(), o))}</tr>`);
        return `<!--[if mso]>${i ? '</td>' : ''}<td width="${widths[i]}" valign="top"><![endif]-->
<div class="pm-col${end ? '' : ' pm-col-gap'}" style="display:inline-block;vertical-align:top;width:${widths[i]}px;max-width:${widths[i]}px;">${table(rows.join('\n'))}</div>`;
      });
      const head = b.title.trim()
        ? `<tr>${td('font-size:22px;line-height:28px;font-weight:700;color:#303030;padding:0 0 24px 0;', heading(b.title, o), ' class="pm-h2"')}</tr>`
        : '';
      return `<td class="pm-px" style="padding:40px 40px 36px 40px;background-color:#F2FBFE;border-top:1px solid #E1E7EC;border-bottom:1px solid #E1E7EC;">${table(`${head}
<tr><td style="font-size:0;line-height:0;">
<!--[if mso]><table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0"><tr><![endif]-->
${cols.join('\n')}
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>`)}</td>`;
    },

    resultaat(b, o, pad) {
      const rows = [];
      if (b.label.trim()) rows.push(`<tr>${td('font-size:12px;line-height:16px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#c9cdd1;padding:0 0 8px 0;', esc(b.label.trim()))}</tr>`);
      if (b.number.trim()) rows.push(`<tr>${td('font-size:52px;line-height:56px;font-weight:800;letter-spacing:-1px;color:#1AB9E2;padding:0 0 6px 0;', esc(b.number.trim()), ' class="pm-big"')}</tr>`);
      if (b.text.trim()) rows.push(`<tr>${td('font-size:16px;line-height:24px;color:#ffffff;', plain(b.text.trim(), o))}</tr>`);
      if (!rows.length) return '';
      return `<td class="pm-px" style="padding:${pad.top}px 40px ${pad.bottom}px 40px;">${table(`<tr>
<td width="8" style="width:8px;background-color:#1AB9E2;font-size:0;line-height:0;">&nbsp;</td>
<td style="padding:26px 28px 28px 24px;">${table(rows.join('\n'))}</td>
</tr>`, ' style="background-color:#303030;"')}</td>`;
    },

    afsluiter(b, o, pad) {
      const rows = [];
      const body = paragraphs(b.body);
      const btn = button(b.button, 'rustig');
      if (b.title.trim()) rows.push(`<tr>${td('font-size:24px;line-height:30px;font-weight:700;color:#303030;padding:0 0 12px 0;', heading(b.title, o), ' class="pm-h2"')}</tr>`);
      body.forEach((p, i) => rows.push(`<tr>${td(`font-size:16px;line-height:26px;color:#303030;padding:0 0 ${i === body.length - 1 ? (btn ? 24 : 0) : 16}px 0;`, inline(p, o))}</tr>`));
      if (btn) rows.push(`<tr><td align="left">${btn}</td></tr>`);
      if (!rows.length) return '';
      return `<td class="pm-px" style="padding:${pad.top}px 40px ${pad.bottom}px 40px;">${table(rows.join('\n'))}</td>`;
    },
  };

  // Witte blokken: ruimte erboven, en eronder alleen als er geen wit blok volgt (anders dubbel)
  const WHITE = new Set(['tekst', 'fototekst', 'resultaat', 'afsluiter']);

  /* ---------------------------------------------------------------------------
     Vaste kop en voet
     ------------------------------------------------------------------------- */

  const HEADER = `<tr><td style="height:6px;line-height:6px;font-size:6px;background-color:#1AB9E2;">&nbsp;</td></tr>
<tr>
<td class="pm-px" style="padding:28px 40px 24px 40px;">${table(`<tr>
<td valign="middle" width="80"><a href="https://www.pureminds.nl/" target="_blank"><img src="${IMG}logo-inkt.png" width="80" height="92" alt="Pure Minds marketing group" style="display:block;width:80px;height:92px;"></a></td>
${td('font-size:13px;line-height:20px;color:#5C6670;', '<a href="{{ mirror }}" target="_blank" style="color:#5C6670;text-decoration:underline;">Bekijk deze e-mail online</a>', ' valign="middle" align="right"')}
</tr>`)}</td>
</tr>`;

  const contactRow = (icon, inner, last) => `<tr>
<td valign="middle" style="padding:0 10px ${last ? 0 : 10}px 0;"><img src="${IMG}icoon-${icon}.png" width="21" height="24" alt="" style="display:block;width:21px;height:24px;"></td>
${td(`font-size:14px;line-height:20px;color:#ffffff;padding:0 0 ${last ? 0 : 10}px 0;`, inner, ' valign="middle"')}
</tr>`;
  const social = (name, label, href, last) => `<td style="padding:0${last ? '' : ' 10px 0 0'};"><a href="${href}" target="_blank"><img src="${IMG}icoon-${name}.png" width="28" height="32" alt="${label}" style="display:block;width:28px;height:32px;"></a></td>`;

  const FOOTER = `<tr>
<td class="pm-px" style="padding:40px 40px 36px 40px;background-color:#303030;">${table(`<tr>
<td valign="top" width="96" class="pm-hide-sm" style="padding:0 24px 0 0;"><img src="${IMG}logo-wit.png" width="80" height="92" alt="Pure Minds marketing group" style="display:block;width:80px;height:92px;"></td>
<td valign="top"><table role="presentation" cellpadding="0" cellspacing="0" border="0">
${contactRow('adres', 'Pure Minds Marketing Group &middot; Spekhofstraat 2, 6466 LZ Kerkrade')}
${contactRow('telefoon', '<a href="tel:+31453690530" style="color:#ffffff;text-decoration:none;">045 369 0530</a>')}
${contactRow('mail', '<a href="mailto:info@pureminds.nl" style="color:#ffffff;text-decoration:none;">info@pureminds.nl</a>')}
${contactRow('web', '<a href="https://www.pureminds.nl/" target="_blank" style="color:#ffffff;text-decoration:none;">pureminds.nl</a>', true)}
</table></td>
</tr>
<tr>
<td colspan="2" style="padding:28px 0 0 0;">${table(`<tr>
<td valign="middle"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
${social('linkedin', 'LinkedIn', 'https://www.linkedin.com/company/puremindsmarketinggroup/')}
${social('instagram', 'Instagram', 'https://www.instagram.com/puremindsmarketinggroup/')}
${social('facebook', 'Facebook', 'https://www.facebook.com/puremindsmarketinggroup/', true)}
</tr></table></td>
<td valign="middle" align="right"><img src="${IMG}emerce-100-wit.png" width="88" height="33" alt="Emerce 100 2026" style="display:block;width:88px;height:33px;"></td>
</tr>`)}</td>
</tr>
<tr>
<td colspan="2" style="padding:28px 0 0 0;">${table(`<tr><td style="height:1px;line-height:1px;font-size:1px;background-color:#4a4a4a;">&nbsp;</td></tr>
<tr>${td('font-size:12px;line-height:19px;color:#c9cdd1;padding:20px 0 0 0;', `Je ontvangt deze e-mail omdat je contact hebt met Pure Minds of je hebt aangemeld voor onze updates.<br>
<a href="{{ unsubscribe }}" target="_blank" style="color:#ffffff;text-decoration:underline;">Afmelden</a> &nbsp;&middot;&nbsp; <a href="{{ update_profile }}" target="_blank" style="color:#ffffff;text-decoration:underline;">Gegevens wijzigen</a>`)}</tr>`)}</td>
</tr>`)}</td>
</tr>`;

  const HEAD_STYLE = `<!--[if mso]>
<noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
<style>td, th, div, p, a, h1, h2, h3 { font-family: Arial, sans-serif !important; }</style>
<![endif]-->
<style>
@font-face { font-family: "Pure Minds Sans"; font-weight: 400; font-style: normal; src: url("${SITE}assets/fonts/PureMindsSans-Regular.ttf") format("truetype"); }
@font-face { font-family: "Pure Minds Sans"; font-weight: 700; font-style: normal; src: url("${SITE}assets/fonts/PureMindsSans-Bold.ttf") format("truetype"); }
@font-face { font-family: "Pure Minds Sans"; font-weight: 800; font-style: normal; src: url("${SITE}assets/fonts/PureMindsSans-ExtraBold.ttf") format("truetype"); }
body { margin: 0 !important; padding: 0 !important; width: 100% !important; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; border-collapse: collapse; }
img { border: 0; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; display: block; }
a { text-decoration: none; }
a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; font-size: inherit !important; font-family: inherit !important; font-weight: inherit !important; line-height: inherit !important; }
u + #body a { color: inherit; text-decoration: none; font-size: inherit; font-family: inherit; font-weight: inherit; line-height: inherit; }
.pm-btn:hover { background-color: #9c1644 !important; }
@media only screen and (max-width: 620px) {
.pm-container { width: 100% !important; }
.pm-px { padding-left: 24px !important; padding-right: 24px !important; }
.pm-col { display: block !important; width: 100% !important; max-width: 100% !important; }
.pm-col-gap { padding: 0 0 24px 0 !important; }
.pm-h1 { font-size: 30px !important; line-height: 36px !important; }
.pm-h2 { font-size: 22px !important; line-height: 28px !important; }
.pm-big { font-size: 44px !important; line-height: 48px !important; }
.pm-img-full { width: 100% !important; height: auto !important; }
.pm-hide-sm { display: none !important; }
}
</style>`;

  /* ---------------------------------------------------------------------------
     De hele mail
     ------------------------------------------------------------------------- */

  function build(state, opts = {}) {
    const o = { preview: !!opts.preview, pending: opts.pending || null };
    const s = normalize(state);
    const blocks = s.blocks;
    const parts = blocks.map((b, i) => {
      const prev = blocks[i - 1];
      const next = blocks[i + 1];
      const pad = {
        top: i === 0 ? 16 : WHITE.has(prev.type) ? 8 : 40,
        bottom: next && WHITE.has(next.type) ? 32 : 44,
      };
      const cell = RENDER[b.type](b, o, pad);
      if (!cell) return '';
      const marked = o.preview ? cell.replace(/^<td/, `<td data-pm-blok="${esc(b.id)}"`) : cell;
      return `<!-- BLOK: ${BLOCKS[b.type].name} -->\n<tr>${marked}</tr>\n<!-- EINDE BLOK -->`;
    }).filter(Boolean);

    const pre = String(s.preheader || '').trim();
    const filler = '&#8199;&#65279;&#847;'.repeat(12);
    const title = esc(String(s.name || '').trim() || 'Pure Minds');
    return `<!DOCTYPE html>
<html lang="nl" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${title}</title>
<!-- Pure Minds e-mail. In Brevo: Create campaign > Email > Design: Start from scratch > HTML custom code, alles plakken. Afmelden ({{ unsubscribe }}) staat in de voet. -->
${HEAD_STYLE}
</head>
<body id="body" style="margin:0;padding:0;background-color:#EDF3F7;">
${pre ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#EDF3F7;">${esc(pre)}${filler}</div>\n` : ''}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#EDF3F7;">
<tr>
<td align="center" style="padding:24px 12px;">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" class="pm-container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background-color:#ffffff;">
${o.preview ? HEADER.replace('<td class="pm-px"', '<td data-pm-vast="kop" class="pm-px"') : HEADER}
${parts.join('\n')}
${o.preview ? FOOTER.replace('<td class="pm-px"', '<td data-pm-vast="voet" class="pm-px"') : FOOTER}
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td>
</tr>
</table>
</body>
</html>
`;
  }

  /* ---------------------------------------------------------------------------
     Controle vóór het kopiëren: wat moet nog? (nooit tegenhouden)
     ------------------------------------------------------------------------- */

  function bytes(text) {
    let n = 0;
    for (const ch of String(text)) {
      const c = ch.codePointAt(0);
      n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
    }
    return n;
  }

  const FIELD_NAMES = { label: 'label', title: 'kop', intro: 'intro', body: 'tekst', number: 'cijfer', text: 'tekst' };

  function check(state, html) {
    const s = normalize(state);
    const issues = [];
    const add = (level, key, block, text) => issues.push({ level, key, block: block ? block.id : null, text });
    if (!s.blocks.length) add('warn', 'leeg', null, 'Er staan nog geen blokken in je mail.');
    if (!String(s.preheader).trim() || s.preheader === SAMPLE_PREHEADER) add('warn', 'voorvertoning', null, 'Vul de voorvertoningstekst in: die staat in de inbox naast het onderwerp.');

    const names = {};
    s.blocks.forEach((b) => {
      names[b.type] = (names[b.type] || 0) + 1;
      const name = BLOCKS[b.type].name;
      const sample = BLOCKS[b.type].make();
      const real = BLOCKS[b.type].real || [];
      const left = Object.keys(FIELD_NAMES).filter((k) => typeof sample[k] === 'string' && sample[k] && b[k] === sample[k] && !real.includes(k));
      if (b.items) b.items.forEach((it, i) => { if (sample.items[i] && it.title === sample.items[i].title) left.push(`punt ${i + 1}`); });
      if (left.length) add('warn', 'voorbeeld', b, `${name}: nog voorbeeldtekst (${left.map((k) => FIELD_NAMES[k] || k).join(', ')}).`);
      if (b.img) {
        if (!safeImg(b.img.src)) add('warn', 'foto', b, `${name}: de foto ontbreekt of staat niet online.`);
        else if (!b.img.alt.trim()) add('info', 'alt', b, `${name}: beschrijf de foto in een paar woorden (voor wie plaatjes uit heeft staan).`);
      }
      for (const key of ['button', 'link']) {
        const l = b[key];
        if (l && l.text.trim() && !safeUrl(l.url)) add('warn', 'link', b, `${name}: de ${key === 'button' ? 'knop' : 'link'} “${l.text.trim()}” heeft nog geen goede link.`);
      }
      if (b.type === 'foto' && b.url.trim() && !safeUrl(b.url)) add('warn', 'link', b, `${name}: de link achter de foto klopt niet.`);
      for (const k of ['body', 'intro', 'text']) {
        for (const m of String(b[k] || '').matchAll(/\[([^\]\n]+)\]\(([^)\s]+)\)/g)) {
          if (!safeUrl(m[2])) add('warn', 'link', b, `${name}: de link “${m[1]}” in de tekst klopt niet.`);
        }
      }
    });
    if ((names.opening || 0) > 1) add('info', 'magenta', null, 'Er staan twee openingen in: magenta is voor één hoofdactie per mail.');

    const size = bytes(html || build(s));
    if (size > 95 * 1024) add('warn', 'groot', null, `Je mail is ${Math.round(size / 1024)} KB: Gmail knipt hem af vanaf 102 KB. Haal een paar blokken weg.`);
    return issues;
  }

  const PMEmail = { build, check, normalize, starter, block, BLOCKS, TYPES, STARTERS, STOCK, SAMPLE_PREHEADER, safeUrl, safeImg, inline, bytes, MAX_BLOCKS, SITE };
  global.PMEmail = PMEmail;
  if (typeof module !== 'undefined' && module.exports) module.exports = PMEmail;
})(typeof window !== 'undefined' ? window : globalThis);
