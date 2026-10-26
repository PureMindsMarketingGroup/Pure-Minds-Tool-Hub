/* =============================================================================
   document/app.js — Document Maker
   -----------------------------------------------------------------------------
   Maakt A4-documenten (brief, offerte, memo, notitie) op het briefpapier van
   Pure Minds. De preview is echte HTML op pagina's van 794 × 1123 px:

     1. buildBlocks()  zet de invoer om in blokken (titel, gegevens, alinea's,
                       lijsten, offertetabel, ondertekening)
     2. paginate()     giet de blokken in pagina's; alinea's, lijsten en de
                       tabel lopen door naar de volgende pagina, koppen gaan
                       mee met de tekst eronder
     3. exportPdf()    bouwt elke pagina opnieuw op als vector-PDF met echte,
                       bewerkbare tekst (js/document/pdf.js), precies zoals de
                       preview. Word (js/document/docx.js) en afdrukken kan ook.

   De editor is de gedeelde indeling (js/shared/shell.js): rail met zes
   onderdelen, één paneel, de pagina's op het podium. De tekst heeft een
   werkbalk zoals Word (toolbar.js) boven de pagina's. Klik in de preview op
   een onderdeel en je staat in het goede veld; klik in de tekst en de cursor
   staat op die plek in de editor.

   Ongedaan maken: PM.history over het hele document, het briefpapier
   inbegrepen (dat zie je immers ook op de pagina). De handtekening staat in
   IndexedDB onder een eigen sleutel (state.sigKey); een oude blijft bewaard
   zolang hij in de geschiedenis kan terugkomen en wordt pas bij de volgende
   keer laden opgeruimd.

   Rekenwerk zonder DOM (bedragen, totalen, de controle op voorbeeldtekst)
   staat in js/document/model.js.
   ============================================================================= */
(function () {
  'use strict';

  const PM = window.PM;
  const M = window.PMDocModel;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const KEY = 'pm-document-v1';
  const SENDER_KEY = 'pm-document-sender-v1';
  const FILES_KEY = 'pm-document-files-v1';   // alle handtekeningsleutels in IndexedDB (om op te ruimen)
  const LEGACY_SIG = 'document:signature';    // vóór de sleutels per handtekening
  const PAGE_W = 794;

  const TYPE_LABEL = { brief: 'brief', offerte: 'offerte', memo: 'memo', notitie: 'notitie' };
  const TYPE_NAME = { brief: 'Brief', offerte: 'Offerte', memo: 'Memo', notitie: 'Notitie' };

  // Zeshoeken als SVG (inline of als <img> met een SVG-data-URL), niet met
  // clip-path of ::before: zo neemt de PDF-export ze over als vector.
  const HEX_PATH = 'M43.3 0 86.6 25v50L43.3 100 0 75V25z';
  const HEX = `<svg viewBox="0 0 86.6 100" width="11" height="12.7" aria-hidden="true"><path d="${HEX_PATH}" fill="#1ab9e2"/></svg>`;
  const BULLET = `<img class="a4-bullet" alt="" src="data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 86.6 100' width='70' height='81'><path d='${HEX_PATH}' fill='#1ab9e2'/></svg>`)}">`;

  /* ---------------------------------------------------------------------------
     Toestand
     ------------------------------------------------------------------------- */

  function isoDate(d) {
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }
  const addDays = (d, n) => new Date(d.getTime() + n * 86400000);

  // Een nieuw document laat met voorbeeldinhoud zien hoe het eruitziet (M.EXAMPLE);
  // vóór een download zegt de tool waar die voorbeeldtekst nog staat
  function defaults() {
    const now = new Date();
    return {
      type: 'brief',
      label: '',
      title: 'Voorstel voor de samenwerking',
      date: isoDate(now),
      recipient: M.EXAMPLE.recipient,
      reference: '',
      salutation: M.EXAMPLE.salutation,
      quoteNumber: `${now.getFullYear()}-001`,
      validUntil: isoDate(addDays(now, 30)),
      memoTo: 'Het team',
      memoFrom: '',
      memoCc: '',
      body: M.EXAMPLE.body,
      items: M.EXAMPLE.items.map((it) => ({ ...it })),
      vat: '21',
      acceptBlock: true,
      showSignature: true,
      closing: 'Met vriendelijke groet,',
      signName: '',
      signRole: '',
      sigKey: '',   // sleutel van de handtekening in IndexedDB
    };
  }

  const SENDER_DEFAULTS = {
    company: 'Pure Minds Marketing Group',
    street: '',
    city: '',
    phone: '',
    email: '',
    web: 'pureminds.nl',
    kvk: '',
    vat: '',
    iban: '',
    // Emerce 100-badge in de voet: hoort bij het briefpapier, dus bij elk document
    badge: false,
  };

  // Opgeslagen waarden over de standaard heen leggen en gezond maken (na laden of ongedaan maken)
  function normalize(saved) {
    const base = defaults();
    const s = saved && typeof saved === 'object' ? saved : {};
    for (const k of Object.keys(base)) {
      if (!(k in s)) continue;
      if (Array.isArray(base[k])) base[k] = Array.isArray(s[k]) ? s[k] : base[k];
      else if (typeof s[k] === typeof base[k]) base[k] = s[k];
    }
    if (!TYPE_LABEL[base.type]) base.type = 'brief';
    base.items = base.items
      .filter((it) => it && typeof it === 'object')
      .map((it) => ({ desc: String(it.desc || ''), qty: Number(it.qty) || 0, price: Number(it.price) || 0 }));
    base.body = sanitize(base.body);
    return base;
  }

  function loadState() {
    const saved = PM.store.get(KEY, null);
    const state = normalize(saved || {});
    // Concept van vóór de sleutels per handtekening: die staat onder de vaste sleutel
    if (saved && !('sigKey' in saved)) state.sigKey = LEGACY_SIG;
    return state;
  }

  const normalizeSender = (s) => {
    const out = { ...SENDER_DEFAULTS, ...(s && typeof s === 'object' ? s : {}) };
    out.badge = out.badge === true;
    // De bedrijfsnaam schrijf je met hoofdletters; oude opgeslagen briefpapieren rechtzetten
    if (typeof out.company === 'string' && /^pure minds marketing group$/i.test(out.company.trim())) out.company = SENDER_DEFAULTS.company;
    return out;
  };

  /* ---------------------------------------------------------------------------
     Opmaak van de teksteditor opschonen
     ------------------------------------------------------------------------- */

  const ALLOWED = {
    P: 'p', DIV: 'p', H1: 'h2', H2: 'h2', H3: 'h3', H4: 'h3', H5: 'h3', H6: 'h3',
    UL: 'ul', OL: 'ol', LI: 'li', BLOCKQUOTE: 'blockquote',
    STRONG: 'strong', B: 'strong', EM: 'em', I: 'em', U: 'u', BR: 'br',
  };
  const DROP = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'IFRAME', 'OBJECT', 'EMBED', 'META', 'LINK', 'TITLE', 'HEAD', 'SVG', 'IMG', 'VIDEO', 'AUDIO', 'CANVAS', 'NOSCRIPT']);
  const BLOCKS = new Set(['p', 'h2', 'h3', 'ul', 'ol', 'blockquote']);
  const INLINE_PARENTS = new Set(['p', 'h2', 'h3', 'li', 'strong', 'em', 'u', 'blockquote']);

  /**
   * Laat alleen alinea's, koppen, lijsten, citaten, vet, cursief, onderstreept
   * en regeleindes over, zonder attributen. Losse tekst bovenaan komt in een <p>.
   */
  function sanitize(html) {
    const doc = new DOMParser().parseFromString(`<body>${html || ''}</body>`, 'text/html');
    const out = document.createElement('div');

    function walk(src, dst) {
      for (const node of Array.from(src.childNodes)) {
        if (node.nodeType === 3) {
          dst.appendChild(document.createTextNode(node.nodeValue.replace(/ /g, ' ')));
        } else if (node.nodeType === 1) {
          if (DROP.has(node.tagName)) continue;
          let tag = ALLOWED[node.tagName];
          const parentTag = dst === out ? null : dst.tagName.toLowerCase();
          // Een blok binnen een alinea of lijstitem (zoals een <div> uit Word) wordt uitgepakt
          if (tag && BLOCKS.has(tag) && parentTag && INLINE_PARENTS.has(parentTag) && tag !== 'ul' && tag !== 'ol') tag = null;
          if (tag === 'li' && parentTag !== 'ul' && parentTag !== 'ol') tag = 'p';
          if (tag) {
            const el = document.createElement(tag);
            walk(node, el);
            dst.appendChild(el);
          } else {
            walk(node, dst);
          }
        }
      }
    }
    walk(doc.body, out);

    // Losse tekst en inline-elementen bovenaan groeperen in alinea's
    const clean = document.createElement('div');
    let para = null;
    for (const node of Array.from(out.childNodes)) {
      const isBlock = node.nodeType === 1 && BLOCKS.has(node.tagName.toLowerCase());
      if (isBlock) {
        para = null;
        clean.appendChild(node);
      } else {
        if (node.nodeType === 3 && !node.nodeValue.trim() && !para) continue;
        if (!para) {
          para = document.createElement('p');
          clean.appendChild(para);
        }
        para.appendChild(node);
      }
    }
    // Lege blokken weg (een alinea met alleen <br> blijft: dat is een witregel)
    for (const el of Array.from(clean.querySelectorAll('p, h2, h3, li, blockquote, ul, ol, strong, em, u'))) {
      if (!el.textContent.trim() && !el.querySelector('br')) el.remove();
    }
    return clean.innerHTML;
  }

  let state = loadState();
  // Een nieuw, leeg document; je naam, functie en handtekening blijven staan (het briefpapier staat apart)
  const blankDoc = (type, from = state) => ({
    ...defaults(), type, signName: from.signName, signRole: from.signRole, sigKey: from.sigKey,
    title: '', recipient: '', reference: '', salutation: '', memoTo: '', memoFrom: '', memoCc: '',
    body: '', items: [{ desc: '', qty: 1, price: 0 }],
  });
  // Gestart vanaf het dashboard (?type=offerte): een nieuw document van die soort. Het vorige
  // blijft in de bieb (library.js: opts.fresh); dit komt er pas in bij de eerste echte wijziging
  const start = PM.startParams();
  let lib = null;   // de bieb (js/shared/library.js), aan het eind gekoppeld
  const quickStart = !!TYPE_LABEL[start.type];
  const before = quickStart && PM.store.get(KEY) ? state : null;   // er stond al iets
  if (quickStart) {
    state = normalize(blankDoc(start.type));
    PM.store.set(KEY, state);
  }
  let sender = normalizeSender(PM.store.get(SENDER_KEY, {}));
  let signature = null;  // { url, name, width } van state.sigKey

  const save = PM.debounce(() => {
    PM.store.set(KEY, state);
    PM.store.set(SENDER_KEY, sender);
  }, 300, { flushOnHide: true });

  /* ---------------------------------------------------------------------------
     Elementen
     ------------------------------------------------------------------------- */

  const el = {
    app: $('.app'),
    editor: $('#editor'),
    rte: $('#rte'),
    sheets: $('#sheets'),
    sheetsWrap: $('#sheetsWrap'),
    stageScroll: $('#stageScroll'),
    typePill: $('#typePill'),
    pagePill: $('#pagePill'),
    docTitle: $('#docTitle'),
    docSub: $('#docSub'),
    itemRows: $('#itemRows'),
    itemsTotal: $('#itemsTotal'),
    signFields: $('#signFields'),
    sigInput: $('#sigInput'),
    sigName: $('#sigName'),
    sigThumb: $('#sigThumb'),
    sigBtn: $('#sigBtn'),
    sigClear: $('#sigClear'),
    docNote: $('#docNote'),
    docNoteText: $('#docNoteText'),
    docNoteAccept: $('#docNoteAccept'),
    clipNote: $('#clipNote'),
    senderTab: $('#senderTab'),
    senderTabNote: $('#senderTabNote'),
    downloadBtn: $('#downloadBtn'),
    pdfBtn: $('#pdfBtn'),
    docxBtn: $('#docxBtn'),
    printBtn: $('#printBtn'),
    dlSum: $('#dlSum'),
    checkPop: $('#checkPop'),
    checkNames: $('#checkNames'),
    checkList: $('#checkList'),
    checkGo: $('#checkGo'),
    checkAnyway: $('#checkAnyway'),
    printRoot: $('#printRoot'),
    label: $('#dLabel'),
    badge: $('#sBadge'),
  };

  const esc = PM.esc;
  const money = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' });
  const number = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 2 });
  const smooth = () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function longDate(iso) {
    if (!iso) return '';
    const d = new Date(`${iso}T12:00:00`);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  const lines = (text) => String(text || '').split('\n').map((l) => l.trim()).filter(Boolean);

  function titleHtml(title) {
    const t = String(title || '').trim();
    if (!t) return '';
    if (/[^.]\.$/.test(t)) return `${esc(t.slice(0, -1))}<span class="dot">.</span>`;
    if (/[!?…:]$/.test(t)) return esc(t);
    return `${esc(t)}<span class="dot">.</span>`;
  }

  const totals = () => M.totals(state.items, state.vat);

  /* ---------------------------------------------------------------------------
     1. Blokken
     ------------------------------------------------------------------------- */

  function node(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  // kind: 'text' (op woorden te splitsen), 'list', 'table' of 'keep' (heel laten)
  const block = (elm, kind, opts = {}) => ({ el: elm, kind, keepNext: !!opts.keepNext });

  function spaced(b, px) {
    b.el.style.marginTop = `${px}px`;
    return b;
  }

  function buildBlocks() {
    const d = state;
    const out = [];
    const label = d.label.trim() || TYPE_LABEL[d.type];

    const titleBlock = () => block(node('div', 'a4-titleblock',
      `<div class="a4-label">${HEX}${esc(label)}</div>${d.title.trim() ? `<h1 class="a4-title">${titleHtml(d.title)}</h1>` : ''}`), 'keep', { keepNext: true });

    const dl = (pairs, cls = 'a4-dl', field = 'date') => `<dl class="${cls}" data-field="${field}">${pairs
      .filter(([, v]) => String(v || '').trim())
      .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;

    if (d.type === 'brief') {
      out.push(block(node('div', 'a4-meta',
        `<address class="a4-address" data-field="recipient">${lines(d.recipient).map(esc).join('\n')}</address>${dl([['Datum', longDate(d.date)], ['Kenmerk', d.reference]])}`), 'keep'));
      out.push(spaced(titleBlock(), 40));
      if (d.salutation.trim()) {
        const sal = node('p', null, esc(d.salutation.trim()));
        sal.dataset.field = 'salutation';
        out.push(spaced(block(sal, 'text'), 22));
      }
    } else if (d.type === 'offerte') {
      out.push(titleBlock());
      out.push(spaced(block(node('div', 'a4-meta',
        `<div><div class="a4-address__label">Offerte voor</div><address class="a4-address" data-field="recipient">${lines(d.recipient).map(esc).join('\n')}</address></div>${dl([['Offertenummer', d.quoteNumber], ['Datum', longDate(d.date)], ['Geldig tot', longDate(d.validUntil)]], 'a4-dl', 'quote')}`), 'keep'), 26));
    } else if (d.type === 'memo') {
      out.push(titleBlock());
      out.push(spaced(block(node('div', null, dl([['Aan', d.memoTo], ['Van', d.memoFrom], ['CC', d.memoCc], ['Datum', longDate(d.date)]], 'a4-dl a4-dl--memo', 'memo')), 'keep'), 18));
    } else {
      out.push(titleBlock());
      if (d.date) out.push(spaced(block(node('div', null, dl([['Datum', longDate(d.date)]])), 'keep'), 10));
    }

    // Lopende tekst uit de editor; opsommingen krijgen een zeshoek-bullet
    const holder = node('div', null, sanitize(d.body));
    for (const li of holder.querySelectorAll('ul > li')) li.insertAdjacentHTML('afterbegin', BULLET);
    let first = true;
    for (const child of Array.from(holder.children)) {
      child.dataset.field = 'body';
      const tag = child.tagName.toLowerCase();
      let b;
      if (tag === 'ul' || tag === 'ol') b = block(child, 'list');
      else if (tag === 'h2' || tag === 'h3') {
        child.dataset.keepNext = '1';
        b = block(child, 'keep', { keepNext: true });
      } else b = block(child, 'text');
      if (first) spaced(b, d.type === 'brief' ? 12 : 26);
      first = false;
      out.push(b);
    }

    if (d.type === 'offerte') {
      const t = totals();
      if (t.rows.length) {
        const rows = t.rows.map((it) => `<tr><td>${esc(it.desc)}</td><td class="num">${number.format(Number(it.qty) || 0)}</td><td class="num">${money.format(Number(it.price) || 0)}</td><td class="num">${money.format((Number(it.qty) || 0) * (Number(it.price) || 0))}</td></tr>`).join('');
        out.push(spaced(block(node('table', 'a4-table',
          `<thead><tr><th>Omschrijving</th><th class="num">Aantal</th><th class="num">Prijs</th><th class="num">Totaal</th></tr></thead><tbody>${rows}</tbody>`), 'table'), 26));
        out.push(block(node('div', 'a4-totals',
          `<dl><div><dt>Subtotaal</dt><dd>${money.format(t.subtotal)}</dd></div><div><dt>Btw ${t.vatRate}%</dt><dd>${money.format(t.vat)}</dd></div><div class="is-total"><dt>Totaal</dt><dd>${money.format(t.total)}</dd></div></dl>`), 'keep'));
      }
      if (d.acceptBlock) {
        out.push(spaced(block(node('div', 'a4-accept',
          '<div class="a4-accept__title">Voor akkoord</div><div class="a4-accept__field"><span>naam</span></div><div class="a4-accept__field"><span>datum</span></div><div class="a4-accept__field"><span>handtekening</span></div>'), 'keep'), 28));
      }
    }

    if (d.showSignature) {
      const role = [d.signRole.trim(), sender.company.trim()].filter(Boolean).join(' · ');
      out.push(spaced(block(node('div', 'a4-sign',
        `${d.closing.trim() ? `<p>${esc(d.closing.trim())}</p>` : ''}${signature ? `<img class="a4-sign__img" src="${esc(signature.url)}" alt="">` : '<div class="a4-sign__space"></div>'}${d.signName.trim() ? `<p class="a4-sign__name">${esc(d.signName.trim())}</p>` : ''}${role ? `<p class="a4-sign__role">${esc(role)}</p>` : ''}`), 'keep'), 28));
    }
    for (const b of out) {
      const c = b.el.classList;
      if (b.el.dataset.field) continue;
      if (c.contains('a4-titleblock')) b.el.dataset.field = 'title';
      else if (c.contains('a4-table') || c.contains('a4-totals')) b.el.dataset.field = 'items';
      else if (c.contains('a4-accept')) b.el.dataset.field = 'accept';
      else if (c.contains('a4-sign')) b.el.dataset.field = 'sign';
    }
    return out;
  }

  /* ---------------------------------------------------------------------------
     2. Pagina's
     ------------------------------------------------------------------------- */

  // Zeshoek-lijnpatroon rechtsboven, als SVG-afbeelding. Elke zeshoek krijgt
  // zijn eigen dekking, zodat het patroon vanuit de hoek vervaagt.
  const PATTERN_SVG = (() => {
    const r = 34;
    const w = Math.sqrt(3) * r;
    const reach = 380;
    const paths = [];
    for (let row = -1; row < 7; row++) {
      const y = row * 1.5 * r;
      const shift = row % 2 ? w / 2 : 0;
      for (let x = -w + shift; x < 360 + w; x += w) {
        const alpha = 0.42 * (1 - Math.hypot(360 - x, y) / reach);
        if (alpha < 0.03) continue;
        let d = '';
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI / 3) * i - Math.PI / 2;
          d += `${i ? 'L' : 'M'}${(x + r * Math.cos(a)).toFixed(1)} ${(y + r * Math.sin(a)).toFixed(1)}`;
        }
        paths.push(`<path d="${d}Z" stroke-opacity="${alpha.toFixed(2)}"/>`);
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 240" width="360" height="240"><g fill="none" stroke="#90a4b4" stroke-width="1">${paths.join('')}</g></svg>`;
  })();
  const PATTERN = `<img class="a4__pattern" alt="" src="data:image/svg+xml,${encodeURIComponent(PATTERN_SVG)}">`;

  function senderHtml() {
    const s = sender;
    const rows = [s.street, s.city, s.phone && `T ${s.phone}`, s.email, s.web].filter((v) => String(v || '').trim()).map(esc);
    return `<address class="a4__sender" data-field="sender">${s.company.trim() ? `<b>${esc(s.company)}</b>` : ''}${rows.join('<br>')}</address>`;
  }

  function footerHtml() {
    const s = sender;
    const one = [s.company && `<b>${esc(s.company)}</b>`, esc(s.street), esc(s.city), esc(s.web)].filter(Boolean).join(' &middot; ');
    const two = [s.kvk && `KvK ${esc(s.kvk)}`, s.vat && `Btw ${esc(s.vat)}`, s.iban && `IBAN ${esc(s.iban)}`].filter(Boolean).join(' &middot; ');
    return `<div>${one}${two ? `<br>${two}` : ''}</div>`;
  }

  // Emerce 100-badge: klein keurmerk rechts in de voet, vóór het paginanummer.
  // Een <img> met de SVG, zodat de PDF hem als vector overneemt, net als het logo.
  function badgeHtml() {
    if (!sender.badge) return '';
    return `<span class="a4__badge" data-field="badge"><img src="${esc(PM.brandSrc('badgeBlack'))}" alt="Emerce 100 2026"></span>`;
  }

  function makePage(first) {
    const page = node('article', `a4 ${first ? 'a4--first' : 'a4--next'}`);
    const running = state.title.trim() || TYPE_LABEL[state.type];
    // Het patroon alleen op de eerste pagina: op vervolgpagina's begint de tekst hoger
    page.innerHTML = `${first ? PATTERN : ''}<div class="a4__bar"></div>`
      + `<header class="a4__head"><img class="a4__logo" src="${esc(PM.brandSrc('logoBlack'))}" alt="Pure Minds">${first ? senderHtml() : `<span class="a4__running" data-field="title">${esc(running)}</span>`}</header>`
      + '<div class="a4__body"><div class="a4__flow"></div></div>'
      + `<footer class="a4__foot" data-field="sender">${footerHtml()}${badgeHtml()}<span class="a4__pageno">${HEX}<span data-pageno></span></span></footer>`;
    el.sheets.appendChild(page);
    return { page, body: $('.a4__body', page), flow: $('.a4__flow', page) };
  }

  // Beginposities van woorden (na een spatie) binnen een element
  function wordBounds(elm) {
    const out = [];
    const walker = document.createTreeWalker(elm, NodeFilter.SHOW_TEXT);
    let seen = '';
    let n;
    while ((n = walker.nextNode())) {
      const re = /\s+/g;
      let m;
      while ((m = re.exec(n.nodeValue))) {
        const offset = m.index + m[0].length;
        if ((seen + n.nodeValue.slice(0, m.index)).trim() && offset < n.nodeValue.length) out.push({ node: n, offset });
      }
      seen += n.nodeValue;
    }
    return out;
  }

  function slice(elm, from, to) {
    const range = document.createRange();
    if (from) range.setStart(from.node, from.offset);
    else range.setStart(elm, 0);
    if (to) range.setEnd(to.node, to.offset);
    else range.setEnd(elm, elm.childNodes.length);
    const out = elm.cloneNode(false);
    out.appendChild(range.cloneContents());
    return out;
  }

  // Zoveel mogelijk woorden van `elm` in `container` zetten (binair zoeken)
  function splitText(elm, container, fits) {
    const bounds = wordBounds(elm);
    let lo = 1;
    let hi = bounds.length;
    let best = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const part = slice(elm, null, bounds[mid - 1]);
      container.appendChild(part);
      const ok = fits();
      part.remove();
      if (ok) {
        best = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    if (!best) return null;
    const head = slice(elm, null, bounds[best - 1]);
    container.appendChild(head);
    return slice(elm, bounds[best - 1], null);
  }

  // Probeert een deel van het blok op de pagina te zetten. Geeft terug wat overblijft.
  function trySplit(b, cur, fits) {
    if (b.kind === 'text') {
      const rest = splitText(b.el, cur.flow, fits);
      return rest ? { placed: true, rest: { ...b, el: rest } } : { placed: false };
    }

    if (b.kind === 'list') {
      const list = b.el;
      const head = list.cloneNode(false);
      cur.flow.appendChild(head);
      const start = Number(list.getAttribute('start')) || 1;
      let moved = 0;
      while (list.firstElementChild) {
        const li = list.firstElementChild;
        head.appendChild(li);
        if (fits()) {
          moved++;
          continue;
        }
        list.insertBefore(li, list.firstElementChild);
        break;
      }
      // Het eerste item dat niet past zo mogelijk op woorden splitsen
      let partial = false;
      if (list.firstElementChild) {
        const li = list.firstElementChild;
        const rest = splitText(li, head, fits);
        if (rest) {
          rest.classList.add('is-cont');
          list.replaceChild(rest, li);
          partial = true;
        }
      }
      if (!moved && !partial) {
        head.remove();
        return { placed: false };
      }
      if (list.tagName === 'OL') list.setAttribute('start', String(start + moved));
      return { placed: true, rest: list.firstElementChild ? { ...b, el: list } : null };
    }

    if (b.kind === 'table') {
      const table = b.el;
      const tbody = table.tBodies[0];
      const head = table.cloneNode(false);
      if (table.tHead) head.appendChild(table.tHead.cloneNode(true));
      const body = document.createElement('tbody');
      head.appendChild(body);
      cur.flow.appendChild(head);
      let moved = 0;
      while (tbody.rows.length) {
        const row = tbody.rows[0];
        body.appendChild(row);
        if (fits()) {
          moved++;
          continue;
        }
        tbody.insertBefore(row, tbody.firstChild);
        break;
      }
      if (!moved) {
        head.remove();
        return { placed: false };
      }
      return { placed: true, rest: tbody.rows.length ? { ...b, el: table } : null };
    }

    return { placed: false };
  }

  function paginate(blocks) {
    el.sheets.textContent = '';
    const pages = [makePage(true)];
    let cur = pages[0];
    let clipped = false;
    const next = () => {
      cur = makePage(false);
      pages.push(cur);
    };
    const fits = () => cur.flow.offsetHeight <= cur.body.clientHeight + 0.5;
    const blockOf = new Map(blocks.map((b) => [b.el, b]));
    const queue = blocks.slice();
    let guard = 0;

    while (queue.length && guard++ < 5000) {
      const b = queue.shift();
      cur.flow.appendChild(b.el);

      if (fits()) {
        // Een kop blijft niet onderaan een pagina hangen zonder tekst eronder
        if (b.keepNext && queue.length && cur.flow.children.length > 1 && cur.body.clientHeight - cur.flow.offsetHeight < 64) {
          b.el.remove();
          queue.unshift(b);
          next();
        }
        continue;
      }

      b.el.remove();
      const emptyPage = cur.flow.children.length === 0;
      const result = trySplit(b, cur, fits);
      if (result.placed) {
        if (result.rest) queue.unshift(result.rest);
        next();
      } else if (emptyPage) {
        // Past op geen enkele pagina: toch plaatsen (wordt afgekapt) en melden
        cur.flow.appendChild(b.el);
        clipped = true;
        if (queue.length) next();
      } else {
        queue.unshift(b);
        const last = cur.flow.lastElementChild;
        const lastBlock = last && blockOf.get(last);
        if (lastBlock && lastBlock.keepNext && cur.flow.children.length > 1) {
          last.remove();
          queue.unshift(lastBlock);
        }
        next();
      }
    }

    // Een lege laatste pagina (kan na een geforceerde sprong) weghalen
    const lastPage = pages[pages.length - 1];
    if (pages.length > 1 && !lastPage.flow.children.length) {
      lastPage.page.remove();
      pages.pop();
    }

    const total = pages.length;
    pages.forEach((p, i) => {
      const no = $('[data-pageno]', p.page);
      if (total > 1) no.textContent = `pagina ${i + 1} van ${total}`;
      else no.parentElement.hidden = true;
    });
    return { total, clipped };
  }

  /* ---------------------------------------------------------------------------
     Editor: indeling, werkbalk, ongedaan maken
     ------------------------------------------------------------------------- */

  const shell = PM.shell(el.app, { tool: 'document', quickStart });

  // Werkbalk zoals Word, vast aan de tekst: hij blijft staan zolang het paneel Tekst open is
  const toolbar = PM.toolbar($('#tbar'), { field: el.rte });

  // Het hele document, het briefpapier inbegrepen: alles wat je op de pagina ziet veranderen
  const history = PM.history({
    snapshot: () => ({ doc: state, sender }),
    restore(saved) {
      state = normalize(saved.doc);
      sender = normalizeSender(saved.sender);
      syncInputs();
      syncVisibility();
      applySignature();
      save();
      if (lib) lib.touch();
      render();
    },
  });
  history.bind({ undo: $('#undoBtn'), redo: $('#redoBtn') });

  // Elke wijziging: een stap in de geschiedenis (zelfde sleutel kort na elkaar = één stap), opslaan, tekenen
  function changed(key = null) {
    history.commit(key);
    save();
    if (lib) lib.touch();
    renderSoon();
  }

  // Het open paneel op de app: de werkbalk hoort alleen bij Tekst
  function syncPanel({ id }) {
    el.app.dataset.panel = id || '';
    if (id === 'tekst') addToolbarHelp();
  }
  shell.onChange(syncPanel);
  syncPanel({ id: shell.current });

  // [?] naast de stijl en de lijsten in de werkbalk (uit <template id="tbarHelp">)
  function addToolbarHelp() {
    const bar = toolbar.el;
    if (!bar.querySelector('[data-cmd]') || bar.querySelector('.help')) return;
    for (const tpl of $$('.help', $('#tbarHelp').content)) {
      const anchor = bar.querySelector(`[data-cmd="${tpl.dataset.after}"]`);
      if (!anchor) continue;
      const btn = tpl.cloneNode(true);
      btn.classList.add('tbar__help');
      (anchor.closest('.tbar__field') || anchor).after(btn);
    }
    PM.help.init(bar, 'document');
  }
  setTimeout(addToolbarHelp, 0);

  /* ---------------------------------------------------------------------------
     Renderen
     ------------------------------------------------------------------------- */

  let lastResult = { total: 1, clipped: false };

  function render() {
    lastResult = paginate(buildBlocks());
    const n = lastResult.total;
    const pages = `${n} ${n === 1 ? 'pagina' : "pagina's"}`;
    el.typePill.textContent = TYPE_NAME[state.type];
    el.pagePill.textContent = `${pages} · A4`;
    el.dlSum.textContent = `${pages} A4`;
    el.docTitle.textContent = state.title.trim() || 'Nieuw document';
    el.docTitle.title = state.title.trim();
    el.docSub.textContent = `${TYPE_LABEL[state.type]} · ${pages}`;
    syncNotes();
    syncSenderDot();
    scalePreview();
    refreshHover();
    followCaret();
  }
  const renderSoon = PM.debounce(render, 120);

  // Meldingen onder de pagina's: rustig, met een knop die helpt
  function syncNotes() {
    el.clipNote.hidden = !lastResult.clipped;
    // Een laatste pagina met maar een paar regels kost een vel papier en oogt slordig
    const pages = $$('.a4', el.sheets);
    const last = pages[pages.length - 1];
    let msg = '';
    if (pages.length > 1 && last) {
      const fill = $('.a4__flow', last).offsetHeight / $('.a4__body', last).clientHeight;
      if (fill < 0.2) {
        const fewer = pages.length - 1;
        const tip = state.type === 'offerte' && state.acceptBlock ? ', of zet het blok “voor akkoord” uit' : '';
        msg = `Pagina ${pages.length} heeft maar een paar regels. Kort je tekst iets in${tip}, dan past alles op ${fewer} ${fewer === 1 ? 'pagina' : "pagina's"}.`;
      }
    }
    el.docNote.hidden = !msg;
    el.docNoteText.textContent = msg;
    el.docNoteAccept.hidden = !(state.type === 'offerte' && state.acceptBlock);
  }
  $$('[data-note-go="tekst"]').forEach((b) => b.addEventListener('click', () => revealBody(null)));
  el.docNoteAccept.addEventListener('click', () => {
    state.acceptBlock = false;
    syncInputs();
    changed(null);
    PM.toast('Blok “voor akkoord” staat uit.', false, { label: 'ongedaan maken', run: () => history.undo() });
  });

  // De pagina's passen in de breedte van het podium (nooit groter dan echt); meer pagina's scrollen
  function scalePreview() {
    const style = getComputedStyle(el.stageScroll);
    const avail = el.stageScroll.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const k = Math.min(1, Math.max(0.2, avail / PAGE_W));
    el.sheets.style.transform = `scale(${k})`;
    el.sheetsWrap.style.width = `${PAGE_W * k}px`;
    el.sheetsWrap.style.height = `${el.sheets.offsetHeight * k}px`;
  }
  if ('ResizeObserver' in window) new ResizeObserver(() => { scalePreview(); refreshHover(); }).observe(el.stageScroll);
  else window.addEventListener('resize', scalePreview);

  /* ---------------------------------------------------------------------------
     Klik in de preview: elk onderdeel hoort bij een veld
     ------------------------------------------------------------------------- */

  const firstEmptySender = () => $$('[data-sender]', el.editor).find((i) => !i.value.trim()) || $('#sCompany');

  // data-field in de preview -> naam, paneel en veld
  const REGIONS = {
    title: { label: 'titel', section: 'gegevens', field: '#dTitle' },
    recipient: { label: () => (state.type === 'offerte' ? 'klant' : 'adres'), section: 'gegevens', field: '#dRecipient' },
    date: { label: () => (state.type === 'brief' ? 'datum en kenmerk' : 'datum'), section: 'gegevens', field: '#dDate' },
    quote: { label: 'offertegegevens', section: 'gegevens', field: '#dQuoteNo' },
    memo: { label: 'aan, van en cc', section: 'gegevens', field: '#dMemoTo' },
    salutation: { label: 'aanhef', section: 'gegevens', field: '#dSalutation' },
    body: { label: 'tekst', section: 'tekst', field: '#rte' },
    items: { label: 'offerteregels', section: 'prijzen', field: () => $('[data-item-field="desc"]', el.itemRows) || $('#addItem') },
    accept: { label: 'voor akkoord', section: 'prijzen', field: '#dAccept' },
    sign: { label: 'ondertekening', section: 'afsluiting', field: () => (state.showSignature ? $('#dClosing') : $('#dShowSign')) },
    sender: { label: 'briefpapier', section: 'briefpapier', field: firstEmptySender },
    badge: { label: 'Emerce 100', badge: true },
  };
  const val = (v) => (typeof v === 'function' ? v() : v);
  const regionAt = (t) => {
    const hit = t && t.closest ? t.closest('[data-field]') : null;
    return hit && el.sheets.contains(hit) && REGIONS[hit.dataset.field] ? hit : null;
  };

  // Aanwijzen: een cyaan kader met de naam, zoals bij de posts (.region-hover uit editor.css)
  const hover = document.createElement('div');
  hover.className = 'region-hover';
  hover.hidden = true;
  hover.setAttribute('aria-hidden', 'true');
  hover.innerHTML = '<span class="region-hover__tag"></span>';
  el.sheetsWrap.appendChild(hover);
  let pointer = null;   // laatste muispositie boven de pagina's

  function showHover(hit) {
    if (!hit) {
      hover.hidden = true;
      return;
    }
    const base = el.sheetsWrap.getBoundingClientRect();
    const r = hit.getBoundingClientRect();
    hover.style.left = `${r.left - base.left}px`;
    hover.style.top = `${r.top - base.top}px`;
    hover.style.width = `${r.width}px`;
    hover.style.height = `${r.height}px`;
    hover.firstChild.textContent = val(REGIONS[hit.dataset.field].label);
    hover.hidden = false;
  }
  // Na opnieuw tekenen staat er een nieuw element onder de muis: kader bijwerken
  function refreshHover() {
    if (!pointer) {
      hover.hidden = true;
      return;
    }
    const t = document.elementFromPoint(pointer.x, pointer.y);
    showHover(regionAt(t));
  }
  el.sheets.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    pointer = { x: e.clientX, y: e.clientY };
    showHover(regionAt(e.target));
  });
  el.sheets.addEventListener('pointerleave', () => {
    pointer = null;
    hover.hidden = true;
  });
  el.stageScroll.addEventListener('scroll', () => { if (pointer) hover.hidden = true; }, { passive: true });

  el.sheets.addEventListener('click', (e) => {
    const hit = regionAt(e.target);
    if (!hit) {
      // Naast een onderdeel tikken sluit het blad (op mobiel), net als elders op het podium
      if (shell.isNarrow && shell.current) shell.close({ focusRail: false });
      return;
    }
    if (e.pointerType && e.pointerType !== 'mouse') hover.hidden = true;
    pick(hit.dataset.field, e);
  });

  function flash(n) {
    if (!n) return;
    n.classList.remove('is-flash');
    void n.offsetWidth;  // animatie opnieuw starten
    n.classList.add('is-flash');
  }

  function pick(key, e) {
    const r = REGIONS[key];
    if (r.badge) {
      el.badge.focus({ preventScroll: true });
      flash(el.badge.closest('.badge-toggle'));
      return;
    }
    if (key === 'body') {
      revealBody(caretFromPoint(e.clientX, e.clientY));
      return;
    }
    const field = val(r.field);
    shell.reveal(r.section, field);
  }

  /* --- Tekst: van een plek in de preview naar dezelfde plek in de editor, en terug --- */

  // Tekst van een element met alle witruimte als één spatie, en per teken de plek in de DOM
  function textMap(root) {
    const chars = [];
    let text = '';
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      for (let i = 0; i < n.nodeValue.length; i++) {
        const c = /\s/.test(n.nodeValue[i]) ? ' ' : n.nodeValue[i];
        if (c === ' ' && (!text || text.endsWith(' '))) continue;
        text += c;
        chars.push({ node: n, offset: i });
      }
    }
    return { text, chars };
  }

  const BLOCK_SEL = 'li, p, h2, h3, blockquote';

  // Waar in de editor hoort een punt in de preview? { block, index } in de editor, of null
  function caretFromPoint(x, y) {
    let node = null;
    let offset = 0;
    if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(x, y);
      if (pos) ({ offsetNode: node, offset } = pos);
    } else if (document.caretRangeFromPoint) {
      const range = document.caretRangeFromPoint(x, y);
      if (range) ({ startContainer: node, startOffset: offset } = range);
    }
    if (!node || !el.sheets.contains(node)) return null;
    // Soms geeft de browser een element met een kindnummer: naar de tekst daarin
    if (node.nodeType === 1) {
      const child = node.childNodes[offset];
      const texts = [];
      const walker = document.createTreeWalker(child || node, NodeFilter.SHOW_TEXT);
      for (let t = walker.nextNode(); t; t = walker.nextNode()) texts.push(t);
      const t = child ? texts[0] : texts[texts.length - 1];
      if (t) {
        offset = child ? 0 : t.nodeValue.length;
        node = t;
      }
    }
    const host = (node.nodeType === 1 ? node : node.parentElement).closest(BLOCK_SEL);
    if (!host || !el.sheets.contains(host)) return null;
    const map = textMap(host);
    let at = map.chars.findIndex((c) => c.node === node && c.offset >= offset);
    if (at < 0) at = map.text.length;
    return findInEditor(map.text, at);
  }

  // Het blok in de editor met deze tekst (een doorlopend deel staat er als stuk in)
  function findInEditor(text, at = 0) {
    const needle = text.trim();
    if (!needle) return null;
    for (const b of $$(BLOCK_SEL, el.rte)) {
      if (b.querySelector(BLOCK_SEL)) continue;   // alleen de binnenste blokken
      const map = textMap(b);
      const i = map.text.indexOf(needle);
      if (i >= 0) return { block: b, index: i + Math.min(at, needle.length) };
    }
    return null;
  }

  function placeCaret(spot) {
    const sel = document.getSelection();
    const range = document.createRange();
    if (spot && spot.block && spot.block.isConnected) {
      const map = textMap(spot.block);
      const c = map.chars[spot.index] || map.chars[map.chars.length - 1];
      if (c) range.setStart(c.node, spot.index < map.chars.length ? c.offset : c.offset + 1);
      else range.selectNodeContents(spot.block);
      if (spot.length) {
        const end = map.chars[Math.min(map.chars.length - 1, spot.index + spot.length - 1)];
        if (end) range.setEnd(end.node, end.offset + 1);
      } else range.collapse(true);
    } else {
      range.selectNodeContents(el.rte);
      range.collapse(true);
    }
    sel.removeAllRanges();
    sel.addRange(range);
    return range;
  }

  // Paneel Tekst open, cursor op de plek (of aan het begin), die plek in beeld
  function revealBody(spot) {
    shell.open('tekst');
    el.rte.focus({ preventScroll: true });
    const range = placeCaret(spot);
    const panel = el.rte.closest('.panel');
    const rect = (range.getClientRects()[0]) || (spot && spot.block ? spot.block.getBoundingClientRect() : el.rte.getBoundingClientRect());
    const box = panel.getBoundingClientRect();
    if (rect.top < box.top + 90 || rect.bottom > box.bottom - 24) {
      panel.scrollBy({ top: rect.top - box.top - box.height / 3, behavior: smooth() ? 'smooth' : 'auto' });
    }
    flash(el.rte.closest('.field'));
  }

  // Een element in de preview in beeld brengen (niet als het al te zien is)
  function showInPreview(target) {
    if (!target) return;
    const box = el.stageScroll.getBoundingClientRect();
    const r = target.getBoundingClientRect();
    if (r.bottom > box.top + 16 && r.top < box.bottom - 16) return;
    const top = r.height > box.height - 48 ? r.top - box.top - 24 : r.top - box.top - (box.height - r.height) / 2;
    el.stageScroll.scrollBy({ top, behavior: smooth() ? 'smooth' : 'auto' });
  }

  // Tijdens het typen in de editor: het stuk van de pagina waar je typt blijft in beeld
  function followCaret() {
    if (document.activeElement !== el.rte) return;
    const sel = document.getSelection();
    if (!sel || !sel.rangeCount || !el.rte.contains(sel.anchorNode)) return;
    const n = sel.anchorNode;
    const b = (n.nodeType === 1 ? n : n.parentElement).closest(BLOCK_SEL);
    if (!b || !el.rte.contains(b)) return;
    const text = textMap(b).text.trim();
    if (!text) return;
    const hit = $$('[data-field="body"]', el.sheets).flatMap((p) => (p.matches(BLOCK_SEL) ? [p] : $$(BLOCK_SEL, p)))
      .find((p) => {
        const t = textMap(p).text.trim();
        return t && text.includes(t);
      });
    showInPreview(hit);
  }

  // Veld in een paneel gekozen: laat zien waar het op de pagina staat
  const PREVIEW_OF = {
    dTitle: 'title', dLabel: 'title', dRecipient: 'recipient', dRef: 'date', dSalutation: 'salutation',
    dQuoteNo: 'quote', dValid: 'quote', dMemoTo: 'memo', dMemoFrom: 'memo', dMemoCc: 'memo',
    dAccept: 'accept', dShowSign: 'sign', dClosing: 'sign', dSignName: 'sign', dSignRole: 'sign', sigBtn: 'sign',
  };
  el.editor.addEventListener('focusin', (e) => {
    const t = e.target;
    let key = PREVIEW_OF[t.id];
    if (t.id === 'dDate') key = { offerte: 'quote', memo: 'memo' }[state.type] || 'date';
    else if (t.dataset && t.dataset.itemField) key = 'items';
    else if (t.dataset && t.dataset.sender) key = 'sender';
    if (key) showInPreview($(`[data-field="${key}"]`, el.sheets));
  });

  /* --- Briefpapier: een stipje zolang adres, KvK en e-mail ontbreken --- */

  function syncSenderDot() {
    const missing = M.senderMissing(sender);
    el.senderTab.classList.toggle('has-dot', missing);
    el.senderTabNote.hidden = !missing;
    el.senderTab.title = missing ? 'Vul één keer je adres, KvK en e-mail in voor de voet van het briefpapier' : '';
  }

  /* --- Emerce 100-badge: schakelaar in de kop van de preview, bewaard bij het briefpapier --- */

  el.badge.addEventListener('change', () => {
    sender.badge = el.badge.checked;
    changed(null);
    if (sender.badge) PM.toast('Emerce 100-badge staat aan: klein in de voet van elke pagina.');
  });

  /* ---------------------------------------------------------------------------
     Velden
     ------------------------------------------------------------------------- */

  function syncVisibility() {
    for (const n of $$('[data-for]', el.editor)) n.hidden = !n.dataset.for.split(/\s+/).includes(state.type);
    for (const n of $$('[data-type-text]', el.editor)) {
      const map = Object.fromEntries(n.dataset.typeText.split('|').map((p) => p.split(':')));
      if (map[state.type]) n.textContent = map[state.type];
    }
    el.label.placeholder = TYPE_LABEL[state.type];
    el.signFields.hidden = !state.showSignature;
    el.app.dataset.type = state.type;
    // Prijzen horen alleen bij een offerte: uit, met de reden erbij (niet stil verbergen)
    if (state.type === 'offerte') shell.enable('prijzen');
    else shell.disable('prijzen', 'Alleen een offerte heeft prijzen. Kies offerte bij Soort.');
  }

  function syncInputs() {
    for (const input of $$('[data-bind]', el.editor)) {
      const value = state[input.dataset.bind];
      if (input.type === 'checkbox') input.checked = !!value;
      else input.value = value == null ? '' : String(value);
    }
    for (const input of $$('[data-sender]', el.editor)) input.value = sender[input.dataset.sender] || '';
    el.badge.checked = sender.badge;
    $$('input[name="type"]').forEach((r) => { r.checked = r.value === state.type; });
    if (el.rte.innerHTML !== state.body) el.rte.innerHTML = state.body;
    renderItems();
    toolbar.refresh();
  }

  el.editor.addEventListener('submit', (e) => e.preventDefault());

  el.editor.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.bind) {
      if (t.type === 'checkbox' || t.tagName === 'SELECT') return;   // die gaan via 'change'
      state[t.dataset.bind] = t.value;
      changed(t.dataset.bind);
    } else if (t.dataset.sender) {
      sender[t.dataset.sender] = t.value;
      changed(`sender.${t.dataset.sender}`);
    } else if (t.dataset.itemField) {
      const i = Number(t.dataset.itemIndex);
      const item = state.items[i];
      if (!item) return;
      // Bedragen lezen zoals een Nederlander ze typt: "1.250,50" is twaalfhonderdvijftig
      item[t.dataset.itemField] = t.dataset.itemField === 'desc' ? t.value : M.parseAmount(t.value);
      updateItemsTotal();
      changed(`item.${i}.${t.dataset.itemField}`);
    }
  });

  el.editor.addEventListener('change', (e) => {
    const t = e.target;
    if (t.name === 'type' && t.checked) {
      state.type = t.value;
      syncVisibility();
      changed(null);
    } else if (t.dataset.bind && (t.type === 'checkbox' || t.tagName === 'SELECT')) {
      state[t.dataset.bind] = t.type === 'checkbox' ? t.checked : t.value;
      syncVisibility();
      if (t.dataset.bind === 'vat') updateItemsTotal();
      changed(null);
    }
  });

  /* --- Offerteregels --- */

  const lineTotal = (it) => money.format((Number(it.qty) || 0) * (Number(it.price) || 0));

  function renderItems() {
    el.itemRows.innerHTML = state.items.map((it, i) => `
      <div class="item" role="row">
        <input class="input item__desc" role="cell" aria-label="Omschrijving regel ${i + 1}" data-item-index="${i}" data-item-field="desc" value="${esc(it.desc)}" maxlength="120" placeholder="Omschrijving">
        <input class="input input--amount item__qty" role="cell" aria-label="Aantal regel ${i + 1}" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" data-item-index="${i}" data-item-field="qty" value="${esc(M.formatAmount(it.qty, 'qty'))}">
        <input class="input input--amount item__price" role="cell" aria-label="Prijs per stuk regel ${i + 1}, excl. btw" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" data-item-index="${i}" data-item-field="price" value="${esc(M.formatAmount(it.price, 'price'))}">
        <span class="item__sum" role="cell" data-item-sum="${i}">${lineTotal(it)}</span>
        <button type="button" class="iconbtn item__del" data-item-remove="${i}" aria-label="Regel ${i + 1} verwijderen">&times;</button>
      </div>`).join('');
    updateItemsTotal();
  }

  function updateItemsTotal() {
    const t = totals();
    state.items.forEach((it, i) => {
      const sum = $(`[data-item-sum="${i}"]`, el.itemRows);
      if (sum) sum.textContent = lineTotal(it);
    });
    el.itemsTotal.innerHTML = `<div><dt>Subtotaal</dt><dd>${money.format(t.subtotal)}</dd></div><div><dt>Btw ${t.vatRate}%</dt><dd>${money.format(t.vat)}</dd></div><div class="is-total"><dt>Totaal</dt><dd>${money.format(t.total)}</dd></div>`;
  }

  function addLine() {
    state.items.push({ desc: '', qty: 1, price: 0 });
    renderItems();
    changed(null);
    const inputs = $$('[data-item-field="desc"]', el.itemRows);
    inputs[inputs.length - 1].focus();
  }
  $('#addItem').addEventListener('click', addLine);

  // Na het typen het bedrag netjes terugzetten, zodat je ziet wat er gelezen is
  el.itemRows.addEventListener('change', (e) => {
    const t = e.target;
    const field = t.dataset && t.dataset.itemField;
    const item = field && field !== 'desc' && state.items[Number(t.dataset.itemIndex)];
    if (item) t.value = M.formatAmount(item[field], field);
  });

  // Plakken uit Excel of Google Sheets in een omschrijving: omschrijving, (aantal,) prijs
  el.itemRows.addEventListener('paste', (e) => {
    const input = e.target;
    const text = e.clipboardData && e.clipboardData.getData('text/plain');
    if (!input.dataset || input.dataset.itemField !== 'desc' || !text || !/[\t\n]/.test(text.replace(/\r?\n$/, ''))) return;
    e.preventDefault();
    const at = Number(input.dataset.itemIndex);
    const rows = text.replace(/\r/g, '').replace(/\n+$/, '').split('\n').map((l) => l.split('\t').map((c) => c.trim()));
    rows.forEach((cols, i) => {
      const item = state.items[at + i] || (state.items[at + i] = { desc: '', qty: 1, price: 0 });
      item.desc = cols[0] || '';
      if (cols.length >= 3) {
        item.qty = M.parseAmount(cols[1]) || 1;
        item.price = M.parseAmount(cols[2]);
      } else if (cols.length === 2) {
        item.qty = 1;
        item.price = M.parseAmount(cols[1]);
      }
    });
    renderItems();
    changed(null);
    PM.toast(`${rows.length} ${rows.length === 1 ? 'regel' : 'regels'} geplakt.`, false, { label: 'ongedaan maken', run: () => history.undo() });
  });

  // Enter: naar hetzelfde veld een regel lager, en aan het eind een nieuwe regel
  el.itemRows.addEventListener('keydown', (e) => {
    const input = e.target;
    if (e.key !== 'Enter' || !input.dataset || !input.dataset.itemField) return;
    e.preventDefault();
    const i = Number(input.dataset.itemIndex);
    if (i === state.items.length - 1) {
      state.items.push({ desc: '', qty: 1, price: 0 });
      renderItems();
      changed(null);
      $$('[data-item-field="desc"]', el.itemRows)[i + 1].focus();
    } else {
      $(`[data-item-index="${i + 1}"][data-item-field="${input.dataset.itemField}"]`, el.itemRows).focus();
    }
  });

  el.itemRows.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-item-remove]');
    if (!btn) return;
    const i = Number(btn.dataset.itemRemove);
    const desc = state.items[i] && state.items[i].desc.trim();
    state.items.splice(i, 1);
    renderItems();
    changed(null);
    // Focus niet kwijt: naar dezelfde plek, anders naar "regel toevoegen"
    const next = $$('[data-item-remove]', el.itemRows)[Math.min(i, state.items.length - 1)] || $('#addItem');
    next.focus();
    PM.toast(desc ? `Regel “${desc}” verwijderd.` : 'Regel verwijderd.', false, { label: 'ongedaan maken', run: () => history.undo() });
  });

  /* --- Teksteditor --- */

  try {
    document.execCommand('defaultParagraphSeparator', false, 'p');
  } catch (err) {
    /* oudere browsers: dan <div>, die sanitize() omzet naar <p> */
  }

  // Typen wordt één stap in de geschiedenis; een opdracht uit de werkbalk een eigen stap
  let bodyTimer = 0;
  function commitBody(key) {
    clearTimeout(bodyTimer);
    const html = sanitize(el.rte.innerHTML);
    if (html === state.body) return;
    state.body = html;
    if (!key) history.seal();
    changed(key);
  }
  el.rte.addEventListener('input', () => {
    clearTimeout(bodyTimer);
    bodyTimer = setTimeout(() => commitBody('body'), 150);
  });
  el.rte.addEventListener('pm:toolbar', () => commitBody(null));
  const flushBody = () => { if (bodyTimer) commitBody('body'); };

  el.rte.addEventListener('focus', () => {
    if (!el.rte.innerHTML.trim()) el.rte.innerHTML = '<p><br></p>';
  });

  // Plakken: alleen toegestane opmaak blijft over
  el.rte.addEventListener('paste', (e) => {
    const data = e.clipboardData;
    if (!data) return;
    e.preventDefault();
    const html = data.getData('text/html');
    let insert;
    if (html) {
      insert = sanitize(html);
    } else {
      const text = data.getData('text/plain');
      insert = text.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
    }
    document.execCommand('insertHTML', false, insert);
  });

  /* --- Handtekening: per bestand in IndexedDB, onder de sleutel uit de toestand --- */

  const files = new Map();   // sleutel -> { file, img, url }

  function trackFile(key) {
    const list = PM.store.get(FILES_KEY, []);
    if (!list.includes(key)) PM.store.set(FILES_KEY, [...list, key]);
  }

  // Bij het laden: alleen bewaren wat het document nu gebruikt (de geschiedenis is dan leeg)
  function cleanupFiles() {
    const keep = [state.sigKey].filter(Boolean);
    const list = PM.store.get(FILES_KEY, []);
    list.filter((k) => !keep.includes(k)).forEach((k) => PM.idb.del(k));
    PM.store.set(FILES_KEY, keep);
  }

  async function loadFile(key) {
    if (!key) return null;
    if (files.has(key)) return files.get(key);
    const blob = await PM.idb.get(key);
    if (!(blob instanceof Blob)) return null;
    try {
      const { img, url } = await PM.readImage(blob);
      const entry = { file: blob, img, url };
      files.set(key, entry);
      return entry;
    } catch (err) {
      return null;
    }
  }

  // Handtekening uit de toestand zichtbaar maken (na laden, kiezen of ongedaan maken)
  async function applySignature() {
    const key = state.sigKey;
    const entry = await loadFile(key);
    if (key !== state.sigKey) return;   // intussen alweer gewijzigd
    signature = entry ? { url: entry.url, name: entry.file.name || 'handtekening', width: entry.img.naturalWidth } : null;
    el.sigName.textContent = signature ? signature.name : 'handtekening kiezen';
    el.sigThumb.style.backgroundImage = signature ? `url("${signature.url}")` : '';
    el.sigBtn.classList.toggle('has-file', !!signature);
    el.sigClear.hidden = !signature;
    render();
  }

  async function setSignature(file) {
    try {
      const { img, url } = await PM.readImage(file);
      const key = `document:signature:${PM.uid()}`;
      files.set(key, { file, img, url });
      PM.idb.set(key, file);
      trackFile(key);
      state.sigKey = key;
      await applySignature();
      changed(null);
    } catch (err) {
      PM.toast(err.message, true);
    }
  }

  el.sigBtn.addEventListener('click', () => el.sigInput.click());
  PM.bindDrop(el.sigBtn, (file) => setSignature(file));
  el.sigInput.addEventListener('change', () => {
    const file = el.sigInput.files[0];
    el.sigInput.value = '';
    if (file) setSignature(file);
  });
  el.sigClear.addEventListener('click', () => {
    state.sigKey = '';
    applySignature();
    changed(null);
    el.sigBtn.focus();
    PM.toast('Handtekening verwijderd.', false, { label: 'ongedaan maken', run: () => history.undo() });
  });

  /* ---------------------------------------------------------------------------
     3. Export
     ------------------------------------------------------------------------- */

  function imagesReady(root) {
    return Promise.all($$('img', root).map((img) => (img.complete ? Promise.resolve() : new Promise((r) => {
      img.onload = r;
      img.onerror = r;
    }))));
  }

  function fileName(ext = 'pdf') {
    return `pureminds-${state.type}-${PM.slug(state.title) || 'document'}.${ext}`;
  }

  // Een export is klaar: de rondleiding kan verder
  // Een export is klaar: de rondleiding kan verder, en een nieuw document gaat (stil) in de bieb
  const downloaded = () => {
    if (PM.tour) PM.tour.signal('download');
    if (lib) lib.autoSave();
  };

  // Bewerkbare vector-PDF: de pagina's worden ongeschaald gekloond (de preview
  // is verkleind) en door js/document/pdf.js opnieuw opgebouwd in jsPDF
  async function exportPdf(progress) {
    await PM.fontsReady;
    render();
    const host = node('div', 'a4-export');
    document.body.appendChild(host);
    try {
      const pages = $$('.a4', el.sheets).map((page) => host.appendChild(page.cloneNode(true)));
      await imagesReady(host);
      const blob = await window.PMDocPdf.exportPages(pages, {
        title: state.title.trim() || TYPE_LABEL[state.type],
        subject: TYPE_LABEL[state.type],
        author: sender.company || 'Pure Minds',
      }, (i, total) => progress(`pagina ${i + 1} van ${total}…`));
      const name = fileName();
      PM.saveBlob(blob, name);
      PM.toast(`Gedownload: ${name}`);
      downloaded();
      return 'pdf gedownload';
    } finally {
      host.remove();
    }
  }

  // Word: alles wat js/document/docx.js nodig heeft, al opgemaakt (datums,
  // bedragen) en met de tekst als opgeschoonde HTML
  function docxModel() {
    const d = state;
    const t = totals();
    const q = (v) => Number(v) || 0;
    return {
      type: d.type,
      typeLabel: TYPE_LABEL[d.type],
      label: d.label.trim() || TYPE_LABEL[d.type],
      title: d.title.trim(),
      date: longDate(d.date),
      recipient: lines(d.recipient),
      reference: d.reference.trim(),
      salutation: d.salutation.trim(),
      quoteNumber: d.quoteNumber.trim(),
      validUntil: longDate(d.validUntil),
      memoTo: d.memoTo.trim(),
      memoFrom: d.memoFrom.trim(),
      memoCc: d.memoCc.trim(),
      bodyHtml: sanitize(d.body),
      items: d.type === 'offerte' && t.rows.length ? {
        rows: t.rows.map((it) => ({ desc: it.desc, qty: number.format(q(it.qty)), price: money.format(q(it.price)), total: money.format(q(it.qty) * q(it.price)) })),
        subtotal: money.format(t.subtotal), vatRate: t.vatRate, vat: money.format(t.vat), total: money.format(t.total),
      } : null,
      acceptBlock: d.type === 'offerte' && d.acceptBlock,
      sign: d.showSignature ? {
        closing: d.closing.trim(),
        name: d.signName.trim(),
        role: [d.signRole.trim(), sender.company.trim()].filter(Boolean).join(' · '),
        image: signature ? signature.url : null,
      } : null,
      sender: { ...sender },
      running: d.title.trim() || TYPE_LABEL[d.type],
      pattern: PATTERN_SVG,
      logo: PM.brandSvg('logoBlack'),
      badge: sender.badge ? PM.brandSvg('badgeBlack') : null,
      hexPath: HEX_PATH,
    };
  }

  async function exportDocx() {
    await PM.fontsReady;
    const blob = await window.PMDocDocx.build(docxModel());
    const name = fileName('docx');
    PM.saveBlob(blob, name);
    PM.toast(`Gedownload: ${name}`);
    downloaded();
    return 'word gedownload';
  }

  // Afdrukken: kopie van de pagina's in #printRoot; de print-CSS toont alleen die
  function preparePrint() {
    el.printRoot.innerHTML = '';
    for (const page of $$('.a4', el.sheets)) el.printRoot.appendChild(page.cloneNode(true));
  }
  window.addEventListener('beforeprint', preparePrint);
  window.addEventListener('afterprint', () => { el.printRoot.innerHTML = ''; });
  function printNow() {
    render();
    preparePrint();
    window.print();
    downloaded();
  }

  /* --- Vóór een download: staat er nog voorbeeldtekst in? Zeggen waar, nooit stil tegenhouden --- */

  // Waar elk veld uit de controle staat
  const ISSUE_FIELDS = {
    title: ['gegevens', '#dTitle'], recipient: ['gegevens', '#dRecipient'], reference: ['gegevens', '#dRef'],
    salutation: ['gegevens', '#dSalutation'], quoteNumber: ['gegevens', '#dQuoteNo'], label: ['gegevens', '#dLabel'],
    memoTo: ['gegevens', '#dMemoTo'], memoFrom: ['gegevens', '#dMemoFrom'], memoCc: ['gegevens', '#dMemoCc'],
    closing: ['afsluiting', '#dClosing'], signName: ['afsluiting', '#dSignName'], signRole: ['afsluiting', '#dSignRole'],
  };
  let accepted = '';   // deze voorbeeldtekst mag mee: niet nog eens vragen
  let pending = null;  // { run, issues }

  function guard(kind, run) {
    flushBody();
    const issues = M.exampleIssues(state);
    const sig = JSON.stringify(issues.map((i) => [i.key, i.match]));
    if (!issues.length || sig === accepted) return run();
    openCheck(issues, kind, () => {
      accepted = sig;
      return run(true);
    });
    return Promise.resolve();
  }

  function openCheck(issues, kind, run) {
    shell.closePopover();
    pending = { run, issues };
    el.checkNames.textContent = M.listNames(issues.map((i) => i.label));
    el.checkList.innerHTML = issues.map((i, n) => `<li><button type="button" class="check__item" data-issue="${n}" aria-label="Naar ${esc(i.label)}: ${esc(i.found)}"><b>${esc(i.label)}</b><q>${esc(i.found)}</q><span class="check__go" aria-hidden="true">naar het veld</span></button></li>`).join('');
    el.checkAnyway.textContent = kind === 'print' ? 'toch afdrukken' : 'toch downloaden';
    el.checkPop.hidden = false;
    el.checkGo.focus();   // een alertdialog: de schermlezer leest titel en tekst voor
  }

  function closeCheck({ focus = false } = {}) {
    if (el.checkPop.hidden) return;
    el.checkPop.hidden = true;
    pending = null;
    if (focus) el.downloadBtn.focus();
  }

  // Naar het veld, met de voorbeeldtekst geselecteerd: typen vervangt hem meteen
  function goToIssue(issue) {
    closeCheck();
    if (issue.key === 'body') {
      const spot = findInEditor(issue.match);
      revealBody(spot ? { ...spot, index: spot.index, length: issue.match.trim().length } : null);
      return;
    }
    if (issue.key === 'items') {
      const i = state.items.findIndex((it) => it.desc.trim() === issue.match || it.desc.includes(issue.match));
      const input = $(`[data-item-index="${Math.max(0, i)}"][data-item-field="desc"]`, el.itemRows);
      const f = shell.reveal('prijzen', input || '#addItem');
      if (f && f.select) f.select();
      return;
    }
    const [section, sel] = ISSUE_FIELDS[issue.key] || ['gegevens', '#dTitle'];
    const f = shell.reveal(section, sel);
    if (f && typeof f.setSelectionRange === 'function') {
      const at = f.value.indexOf(issue.match);
      if (at >= 0) f.setSelectionRange(at, at + issue.match.length);
    }
  }

  el.checkGo.addEventListener('click', () => { if (pending) goToIssue(pending.issues[0]); });
  el.checkList.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-issue]');
    if (btn && pending) goToIssue(pending.issues[Number(btn.dataset.issue)]);
  });
  el.checkAnyway.addEventListener('click', () => {
    const run = pending && pending.run;
    closeCheck({ focus: true });
    if (run) run();
  });
  el.checkPop.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    closeCheck({ focus: true });
  });
  el.checkPop.addEventListener('focusout', (e) => {
    const to = e.relatedTarget;
    if (to && !el.checkPop.contains(to)) closeCheck();
  });
  document.addEventListener('pointerdown', (e) => {
    if (!el.checkPop.hidden && !el.checkPop.contains(e.target)) closeCheck();
  });

  /* --- De knoppen: download (PDF) meteen, het pijltje voor Word en afdrukken --- */

  // Na "toch downloaden" is het menu dicht: dan toont de grote knop wat er gebeurt
  function downloadPdf(button = el.downloadBtn) {
    return guard('pdf', (fromCheck) => PM.run(fromCheck ? el.downloadBtn : button, 'pdf maken…', exportPdf));
  }
  function downloadDocx(button = el.docxBtn) {
    return guard('word', (fromCheck) => PM.run(fromCheck ? el.downloadBtn : button, 'word maken…', exportDocx));
  }
  const inMenu = (task) => async () => {
    await task();
    shell.closePopover();
  };

  el.downloadBtn.addEventListener('click', () => downloadPdf(el.downloadBtn));
  el.pdfBtn.addEventListener('click', inMenu(() => downloadPdf(el.pdfBtn)));
  el.docxBtn.addEventListener('click', inMenu(() => downloadDocx(el.docxBtn)));
  el.printBtn.addEventListener('click', () => {
    shell.closePopover();
    guard('print', printNow);
  });

  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
    const key = e.key.toLowerCase();
    if (key === 's') {
      e.preventDefault();
      downloadPdf(el.downloadBtn);
    } else if (key === 'p') {
      e.preventDefault();
      guard('print', printNow);
    }
  });

  /* ---------------------------------------------------------------------------
     Overig
     ------------------------------------------------------------------------- */

  // Nieuw document: meteen beginnen, zonder vraag vooraf. Het vorige blijft in de bieb (alles wordt
  // vanzelf opgeslagen); de melding brengt je er terug. Briefpapier, naam en handtekening blijven staan
  $('#resetBtn').addEventListener('click', () => {
    const prev = lib ? lib.detach() : { id: null };
    const reset = () => {
      state = blankDoc(state.type);
      syncInputs();
      syncVisibility();
      changed(null);
    };
    if (lib) lib.hold(reset);
    else reset();
    PM.toast(prev.id ? 'Nieuw, leeg document gestart. Het vorige staat in de bieb.' : 'Nieuw, leeg document gestart.', false,
      prev.id ? { label: 'terug naar vorige', run: () => lib.open(prev.id) } : { label: 'ongedaan maken', run: () => history.undo() });
  });

  // Rondleiding, stap werkbalk: de tekst ernaast moet te gebruiken blijven. Breed staat het kaartje
  // onder de werkbalk (niet over het paneel); op een telefoon is het doel de tekst zelf, met de
  // werkbalk erboven meegelicht (net als bij de posts), anders dekt het kaartje de tekst af
  const opmaak = (((window.PM_HELP || {}).document || {}).tour || []).find((s) => s.id === 'opmaak');
  const narrow = window.matchMedia('(max-width: 1023px)');
  const phone = window.matchMedia('(max-width: 639px)');
  const placeTour = () => {
    if (!opmaak) return;
    opmaak.placement = narrow.matches ? 'top' : 'bottom';
    opmaak.target = phone.matches ? 'tekst' : 'werkbalk';
  };
  narrow.addEventListener('change', placeTour);
  phone.addEventListener('change', placeTour);
  placeTour();

  /* ---------------------------------------------------------------------------
     Start
     ------------------------------------------------------------------------- */

  PM.preventStrayDrops();
  syncInputs();
  syncVisibility();
  history.clear();
  render();
  PM.fontsReady.then(render);
  // Bieb: het document gaat vanzelf de bieb van het team in. Openen zet het hele document
  // terug; je briefpapier blijft zoals het staat
  lib = PM.library ? PM.library.attach({
    tool: 'document',
    getState: () => state,
    fileKeys: (s) => [s.sigKey],
    apply(saved, keys) {
      keys.forEach(trackFile);
      state = normalize(saved);
      syncInputs();
      syncVisibility();
      applySignature();
      changed(null);
    },
    close: () => shell.closePopover(),
    openId: start.bieb,
    versionId: start.versie,
    fresh: before,
  }) : null;

  // Handtekening uit een vorige sessie terugzetten, dan oude bestanden opruimen
  if (state.sigKey) trackFile(state.sigKey);
  applySignature().then(cleanupFiles);
})();
