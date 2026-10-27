/* =============================================================================
   newsletter/app.js — Nieuwsbrief Maker
   -----------------------------------------------------------------------------
   Een mail in de huisstijl van Pure Minds, blok voor blok, klaar om in Brevo
   te plakken. Wie geen HTML kent, past alleen tekst, foto's, iconen en links
   aan; de HTML zelf komt uit js/newsletter/email.js (zelfde opbouw als
   email/pure-minds-email.html).

     Inhoud    de blokken als kaartjes; het open blok heeft zijn velden
     Blokken   een blok toevoegen (onder het open blok)
     Mail      naam, onderwerp, voorvertoningstekst, foto's online, opnieuw beginnen
     AI        ruwe content in, blokken eruit (js/shared/ai.js); daarna aanpassen
               met de hand of met de AI, voor alles of alleen het open blok
     Podium    de mail in een iframe (computer of telefoon); klik op een blok

   Foto's en iconen moeten online staan om in een mail te werken. De tool
   verkleint een foto tot 1200 px breed (of snijdt hem bij in de gekozen vorm)
   en stuurt hem naar de upload-service (uploads/, Vercel Blob). Daar komt een
   vaste link uit, die in de HTML komt. Het origineel blijft in IndexedDB
   (nb-orig-*), zodat een andere vorm later nog kan; de bieb bewaart het mee.
   Staat de server nog niet klaar (PM.service.status), dan werken de fotobank
   en een link naar een foto die al online staat.

   Ongedaan maken: PM.history over de hele mail. Opslaan: PM.store
   (pm-newsletter-v1), en elke wijziging gaat vanzelf de bieb van het team in
   (js/shared/library.js).
   ============================================================================= */
(function () {
  'use strict';

  const PM = window.PM;
  const E = window.PMEmail;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Uploaden loopt via de server van de Tool Hub (js/shared/service.js, uploads/ in Vercel).
  // null = nog niet bekend; false = de server staat (nog) niet klaar: dan fotobank en links
  let uploadOk = null;
  const canUpload = () => PM.service.ready && uploadOk !== false;

  const KEY = 'pm-newsletter-v1';
  const FILES_KEY = 'pm-newsletter-files-v1';
  const ICONS_KEY = 'pm-newsletter-icons-v1';
  const MAX_W = 1200;
  const SHAPES = [
    { id: 'auto', label: 'zoals hij is', ratio: 0 },
    { id: '3:2', label: 'liggend', ratio: 3 / 2 },
    { id: '16:9', label: 'breed', ratio: 16 / 9 },
    { id: '1:1', label: 'vierkant', ratio: 1 },
  ];
  const KIND_NAME = { nieuwsbrief: 'Nieuwsbrief', kort: 'Korte mail' };

  const el = {
    app: $('[data-app="newsletter"]'),
    list: $('#blockList'),
    types: $('#typeGrid'),
    frame: $('#preview'),
    frameWrap: $('#frameWrap'),
    scroll: $('#stageScroll'),
    docTitle: $('#docTitle'),
    docSub: $('#docSub'),
    kindPill: $('#kindPill'),
    sizePill: $('#sizePill'),
    dlSum: $('#dlSum'),
    copyBtn: $('#copyBtn'),
    copyOpt: $('#copyOpt'),
    htmlBtn: $('#htmlBtn'),
    checkPop: $('#checkPop'),
    checkList: $('#checkList'),
    checkGo: $('#checkGo'),
    checkAnyway: $('#checkAnyway'),
    name: $('#mName'),
    subject: $('#mSubject'),
    mast: $('#mMast'),
    edition: $('#mEdition'),
    pre: $('#mPre'),
    preCount: $('#preCount'),
    uploadState: $('#uploadState'),
    fileInput: $('#fileInput'),
    stockDialog: $('#stockDialog'),
    stockGrid: $('#stockGrid'),
    iconDialog: $('#iconDialog'),
    iconSearch: $('#iconSearch'),
    iconGrid: $('#iconGrid'),
  };

  /* ---------------------------------------------------------------------------
     Toestand
     ------------------------------------------------------------------------- */

  // Een snelle start vanaf het dashboard (nieuwsbrief of korte mail): een nieuwe mail. De vorige
  // blijft in de bieb (library.js: opts.fresh); deze komt er pas in bij de eerste echte wijziging
  const start = PM.startParams();
  const savedDraft = PM.store.get(KEY, null);
  const quickKind = E.STARTERS[start.soort] ? start.soort : null;
  const before = quickKind && savedDraft ? E.normalize(savedDraft) : null;
  let state = savedDraft && !quickKind ? E.normalize(savedDraft) : { ...E.starter(quickKind || 'nieuwsbrief'), name: '' };
  if (before) PM.store.set(KEY, state);
  let selected = state.blocks[0] ? state.blocks[0].id : null;
  let lib = null;
  let ai = null;        // het paneel AI
  const pending = {};   // sleutel (blok-id of blok-id:punt) -> blob-url zolang een upload loopt

  const find = (id) => state.blocks.find((b) => b.id === id) || null;
  const indexOf = (id) => state.blocks.findIndex((b) => b.id === id);
  const save = () => PM.store.set(KEY, state);

  /* ---------------------------------------------------------------------------
     Editor: indeling, werkbalk, ongedaan maken
     ------------------------------------------------------------------------- */

  const shell = PM.shell(el.app, { tool: 'newsletter', quickStart: !!quickKind });
  PM.toolbar($('#tbar'));

  const history = PM.history({
    snapshot: () => state,
    restore(saved) {
      state = E.normalize(saved);
      if (!find(selected)) selected = state.blocks[0] ? state.blocks[0].id : null;
      save();
      if (lib) lib.touch();
      syncMail();
      renderList();
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

  /* ---------------------------------------------------------------------------
     Preview: de echte HTML in een iframe; klikken op een blok opent het
     ------------------------------------------------------------------------- */

  let lastHtml = '';
  const PREVIEW_CSS = `<style>
[data-pm-blok], [data-pm-vast] { cursor: pointer; }
[data-pm-blok]:hover { outline: 2px solid rgba(26,185,226,.55); outline-offset: -2px; }
[data-pm-blok].pm-sel { outline: 3px solid #1AB9E2; outline-offset: -3px; }
html { scrollbar-width: none; }
</style>`;

  function render() {
    lastHtml = E.build(state);
    const kb = Math.max(1, Math.round(E.bytes(lastHtml) / 1024));
    const n = state.blocks.length;
    const count = `${n} ${n === 1 ? 'blok' : 'blokken'}`;
    el.sizePill.textContent = `${kb} KB`;
    el.sizePill.title = kb > 95 ? 'Gmail knipt een mail af vanaf 102 KB' : 'Grootte van de HTML (Gmail knipt vanaf 102 KB)';
    el.sizePill.classList.toggle('pill-warn', kb > 95);
    el.dlSum.textContent = `${count} · ${kb} KB`;
    el.kindPill.textContent = KIND_NAME[state.kind] || 'Nieuwsbrief';
    const title = mailTitle();
    el.docTitle.textContent = title || `Nieuwe ${state.kind === 'kort' ? 'mail' : 'nieuwsbrief'}`;
    el.docTitle.title = title;
    el.docSub.textContent = `${count} · ${kb} KB`;
    writePreview();
  }
  const renderSoon = PM.debounce(render, 150);

  // Naam van de mail, of anders de kop van de opening
  function mailTitle() {
    if (state.name.trim()) return state.name.trim();
    const open = state.blocks.find((b) => b.type === 'opening' && b.title.trim());
    const sample = E.BLOCKS.opening.make().title;
    return open && open.title !== sample ? open.title.trim() : '';
  }

  function writePreview() {
    const html = E.build(state, { preview: true, pending }).replace('</head>', `${PREVIEW_CSS}</head>`);
    const doc = el.frame.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();
    applyTheme(doc);
    markSelected();
    bindPreview(doc);
    fitFrame();
    // Plaatjes laden later: daarna nog eens passend maken
    doc.addEventListener('load', fitFrame, true);
    setTimeout(fitFrame, 400);
  }

  /* ---------------------------------------------------------------------------
     Weergave: licht, donker of omgekeerd. Een nabootsing van wat mailapps in
     donkere modus doen; plaatjes blijven altijd zoals ze zijn.
       licht      gewoon scherm, en Apple Mail en iPhone (de mail zegt "alleen licht")
       donker     Gmail op Android, Outlook: lichte vlakken worden donker, donkere tekst en lijnen licht
       omgekeerd  Gmail op de iPhone: alle kleuren omgedraaid, ook donkere vlakken worden licht
     ------------------------------------------------------------------------- */

  let theme = 'licht';

  // "rgb(48, 48, 48)" of "rgba(…)" -> [h, s, l, a] (0..1), of null als hij doorzichtig is
  function hsl(color) {
    const m = /rgba?\(([^)]+)\)/.exec(color || '');
    if (!m) return null;
    const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    if (!a) return null;
    const [R, G, B] = [r, g, b].map((v) => v / 255);
    const max = Math.max(R, G, B);
    const min = Math.min(R, G, B);
    const l = (max + min) / 2;
    const d = max - min;
    let h = 0;
    if (d) h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
    return [(h * 60 + 360) % 360, d ? d / (1 - Math.abs(2 * l - 1)) : 0, l, a];
  }
  const css = ([h, s, l, a]) => `hsla(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%, ${a})`;

  function applyTheme(doc) {
    if (theme === 'omgekeerd') {
      const style = doc.createElement('style');
      style.textContent = 'html { filter: invert(1) hue-rotate(180deg); } img { filter: invert(1) hue-rotate(180deg); }';
      doc.head.appendChild(style);
      return;
    }
    if (theme !== 'donker') return;
    const win = doc.defaultView;
    doc.querySelectorAll('body, body *').forEach((node) => {
      const cs = win.getComputedStyle(node);
      // Lichte vlakken worden donker (wit bijna zwart, lichtgrijs iets lichter), kleur blijft herkenbaar
      const bg = hsl(cs.backgroundColor);
      if (bg && bg[2] > 0.6) node.style.setProperty('background-color', css([bg[0], bg[1] * 0.5, 0.07 + (1 - bg[2]) * 0.6, bg[3]]), 'important');
      // Donkere tekst wordt licht
      const fg = hsl(cs.color);
      if (fg && fg[2] < 0.45) node.style.setProperty('color', css([fg[0], fg[1] * 0.5, Math.min(0.9, 1.02 - fg[2]), fg[3]]), 'important');
      // Lijnen: donker wordt licht, licht wordt donker
      for (const side of ['top', 'right', 'bottom', 'left']) {
        if (!parseFloat(cs[`border-${side}-width`])) continue;
        const bc = hsl(cs[`border-${side}-color`]);
        if (bc && bc[2] < 0.45) node.style.setProperty(`border-${side}-color`, css([bc[0], bc[1] * 0.5, 1.02 - bc[2], bc[3]]), 'important');
        else if (bc && bc[2] > 0.6) node.style.setProperty(`border-${side}-color`, css([bc[0], bc[1] * 0.5, 0.07 + (1 - bc[2]) * 0.9, bc[3]]), 'important');
      }
    });
  }

  $$('input[name="theme"]').forEach((r) => r.addEventListener('change', () => {
    if (!r.checked) return;
    theme = r.value;
    writePreview();
  }));

  function fitFrame() {
    const doc = el.frame.contentDocument;
    if (!doc || !doc.documentElement) return;
    const h = Math.max(doc.documentElement.scrollHeight, doc.body ? doc.body.scrollHeight : 0);
    if (h && Math.abs(el.frame.offsetHeight - h) > 1) el.frame.style.height = `${h}px`;
  }

  function bindPreview(doc) {
    doc.addEventListener('click', (e) => {
      e.preventDefault();   // links in de preview openen niet
      const cell = e.target.closest('[data-pm-blok], [data-pm-vast]');
      if (!cell) return;
      // De kop: de naam bovenaan en de editie pas je aan bij Mail; de voet staat vast
      if (cell.dataset.pmVast === 'kop') {
        shell.reveal('mail', '#mMast');
        return;
      }
      if (cell.dataset.pmVast) {
        PM.toast('De voet staat vast: zo is elke mail in de huisstijl, met de afmeldlink die Brevo verplicht.');
        return;
      }
      select(cell.dataset.pmBlok, { open: true, focus: true });
      if (PM.tour) PM.tour.signal('blok');
    });
  }

  function markSelected() {
    const doc = el.frame.contentDocument;
    if (!doc) return;
    $$('.pm-sel', doc).forEach((c) => c.classList.remove('pm-sel'));
    const cell = selected && doc.querySelector(`[data-pm-blok="${CSS.escape(selected)}"]`);
    if (cell) cell.classList.add('pm-sel');
  }

  // Het gekozen blok in beeld op het podium
  function scrollPreviewTo(id) {
    const doc = el.frame.contentDocument;
    const cell = doc && doc.querySelector(`[data-pm-blok="${CSS.escape(id)}"]`);
    if (!cell) return;
    const box = el.scroll.getBoundingClientRect();
    const frameTop = el.frame.getBoundingClientRect().top - box.top + el.scroll.scrollTop;
    const top = frameTop + cell.getBoundingClientRect().top;
    const bottom = top + cell.offsetHeight;
    const view = el.scroll.scrollTop;
    if (top < view + 16 || bottom > view + el.scroll.clientHeight - 16) {
      el.scroll.scrollTo({ top: Math.max(0, top - 24), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
  }

  // Computer of telefoon
  $$('input[name="device"]').forEach((r) => r.addEventListener('change', () => {
    el.frameWrap.classList.toggle('is-phone', r.value === 'telefoon' && r.checked);
    setTimeout(fitFrame, 50);
    setTimeout(fitFrame, 350);
  }));
  if (window.ResizeObserver) new ResizeObserver(() => fitFrame()).observe(el.frameWrap);

  /* ---------------------------------------------------------------------------
     Inhoud: de blokken als kaartjes
     ------------------------------------------------------------------------- */

  const SVG = {
    up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11.9999 10.8284L7.0502 15.7782L5.63599 14.364L11.9999 8L18.3639 14.364L16.9497 15.7782L11.9999 10.8284Z"/></svg>',
    down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11.9999 13.1714L16.9497 8.22168L18.3639 9.63589L11.9999 15.9999L5.63599 9.63589L7.0502 8.22168L11.9999 13.1714Z"/></svg>',
    copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.9998 6V3C6.9998 2.44772 7.44752 2 7.9998 2H19.9998C20.5521 2 20.9998 2.44772 20.9998 3V17C20.9998 17.5523 20.5521 18 19.9998 18H16.9998V20.9991C16.9998 21.5519 16.5499 22 15.993 22H4.00666C3.45059 22 3 21.5554 3 20.9991L3.0026 7.00087C3.0027 6.44811 3.45264 6 4.00942 6H6.9998ZM5.00242 8L5.00019 20H14.9998V8H5.00242ZM8.9998 6H16.9998V16H18.9998V4H8.9998V6Z"/></svg>',
    bin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 6H22V8H20V21C20 21.5523 19.5523 22 19 22H5C4.44772 22 4 21.5523 4 21V8H2V6H7V3C7 2.44772 7.44772 2 8 2H16C16.5523 2 17 2.44772 17 3V6ZM18 8H6V20H18V8ZM9 11H11V17H9V11ZM13 11H15V17H13V11ZM9 4V6H15V4H9Z"/></svg>',
  };

  const art = (type) => `<span class="nb-art nb-art--${type}" aria-hidden="true"><i></i><i></i><i></i><i></i></span>`;
  const strip = (s) => String(s || '').replace(/\*\*/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ').trim();

  function summaryOf(b) {
    if (b.type === 'foto') return b.img.alt.trim() || (b.img.src ? 'foto' : 'nog geen foto');
    if (b.type === 'resultaat') return strip([b.number, b.text].filter(Boolean).join(' '));
    return strip(b.title || b.intro || b.body || '') || 'leeg';
  }

  function renderList() {
    const n = state.blocks.length;
    el.list.innerHTML = state.blocks.map((b, i) => {
      const open = b.id === selected;
      const name = E.BLOCKS[b.type].name;
      return `<li class="nb-card${open ? ' is-open' : ''}" data-id="${esc(b.id)}">
  <div class="nb-card__head">
    <button type="button" class="nb-card__toggle" data-act="toggle" aria-expanded="${open}" aria-controls="nb-body-${esc(b.id)}">
      ${art(b.type)}<span class="nb-card__txt"><span class="nb-card__name">${esc(name)}</span><span class="nb-card__sum" data-sum>${esc(summaryOf(b))}</span></span>
    </button>
    <div class="nb-card__acts">
      <button type="button" class="iconbtn nb-only-open" data-act="up" aria-label="${esc(name)} hoger zetten" title="Hoger"${i === 0 ? ' disabled' : ''}>${SVG.up}</button>
      <button type="button" class="iconbtn nb-only-open" data-act="down" aria-label="${esc(name)} lager zetten" title="Lager"${i === n - 1 ? ' disabled' : ''}>${SVG.down}</button>
      <button type="button" class="iconbtn nb-only-open" data-act="dup" aria-label="${esc(name)} kopiëren" title="Kopiëren">${SVG.copy}</button>
      <button type="button" class="iconbtn nb-only-open" data-act="del" aria-label="${esc(name)} weggooien" title="Weggooien">${SVG.bin}</button>
    </div>
  </div>
  ${open ? `<div class="nb-card__body" id="nb-body-${esc(b.id)}" data-tour="velden">${fieldsFor(b)}</div>` : ''}
</li>`;
    }).join('') || '<li class="nb-fixed">Nog geen blokken. Kies er een bij Blokken.</li>';
    el.list.insertAdjacentHTML('beforeend', '<li class="nb-fixed">Kop met logo en voet met contact en afmelden staan vast.</li>');
    const body = $('.nb-card__body', el.list);
    if (body) {
      PM.richfield.init(body);
      PM.help.init(body, 'newsletter');
      bindImageDrops(body);
    }
  }

  /* --- Velden per blok --- */

  let fieldNo = 0;
  const fid = () => `nbf${++fieldNo}`;

  function input(b, k, label, { max = 120, help = '', hint = '', ph = '', opt = false, type = 'text' } = {}) {
    const id = fid();
    return `<div class="field">
  <label class="label" for="${id}">${label}${opt ? ' <i>optioneel</i>' : ''}${help ? ` <button type="button" class="help" data-help="${help}"></button>` : ''}</label>
  <input class="input" id="${id}" type="${type}" data-k="${k}" value="${esc(get(b, k))}" maxlength="${max}"${ph ? ` placeholder="${esc(ph)}"` : ''}>
  ${hint ? `<p class="field-hint">${hint}</p>` : ''}
</div>`;
  }

  function text(b, k, label, { rows = 4, max = 1500, help = 'opmaak' } = {}) {
    const id = fid();
    return `<div class="field">
  <label class="label" for="${id}">${label}${help ? ` <button type="button" class="help" data-help="${help}"></button>` : ''}</label>
  <textarea class="input" id="${id}" data-k="${k}" rows="${rows}" maxlength="${max}" data-rich="vet" data-chips="{voornaam}" data-toolbar="vet invoegen" data-toolbar-insert="{voornaam}" data-toolbar-label="${esc(label.toLowerCase())}">${esc(get(b, k))}</textarea>
</div>`;
  }

  function link(b, k, label, { help = 'link', textPh = 'tekst', urlPh = 'https://www.pureminds.nl/…' } = {}) {
    const id = fid();
    const v = get(b, k) || { text: '', url: '' };
    const bad = v.url.trim() && !E.safeUrl(v.url);
    return `<div class="field">
  <span class="label" id="${id}">${label}${help ? ` <button type="button" class="help" data-help="${help}"></button>` : ''}</span>
  <div class="nb-link" role="group" aria-labelledby="${id}">
    <input class="input" data-k="${k}.text" value="${esc(v.text)}" maxlength="60" placeholder="${esc(textPh)}" aria-label="${esc(label)}: tekst">
    <input class="input${bad ? ' is-bad' : ''}" data-k="${k}.url" value="${esc(v.url)}" maxlength="1000" placeholder="${esc(urlPh)}" aria-label="${esc(label)}: link" inputmode="url" spellcheck="false">
  </div>
  <p class="nb-bad" data-bad-for="${k}.url"${bad ? '' : ' hidden'}>Deze link klopt nog niet: begin met https:// of www., of typ een e-mailadres.</p>
</div>`;
  }

  function imageField(b) {
    const img = b.img;
    const src = pending[b.id] || img.src;
    const shape = img.shape || 'auto';
    const sid = fid();
    const state0 = pending[b.id] ? ['', 'bezig met uploaden…'] : imgState(img);
    return `<div class="field" data-img-field>
  <span class="label">Foto <button type="button" class="help" data-help="foto"></button></span>
  <div class="nb-img" data-drop>
    <button type="button" class="nb-img__thumb${pending[b.id] ? ' is-busy' : ''}" data-act="choose" aria-label="Foto kiezen" style="${src ? `background-image:url('${esc(src)}')` : ''}"></button>
    <div class="nb-img__acts">
      <button type="button" class="btn btn-outline btn-sm" data-act="choose">${img.src ? 'andere foto' : 'foto kiezen'}</button>
      ${b.type === 'fototekst' ? '<button type="button" class="linkbtn" data-act="remove-photo">foto weghalen</button>' : ''}
      <span class="nb-img__state ${state0[0]}" data-img-state>${state0[1]}</span>
    </div>
  </div>
</div>
${canUpload() ? `<div class="field">
  <span class="label" id="${sid}">Vorm <button type="button" class="help" data-help="vorm"></button></span>
  <div class="seg seg--sm nb-shape" role="radiogroup" aria-labelledby="${sid}">
    ${SHAPES.map((s) => { const id = fid(); return `<input type="radio" name="shape-${esc(b.id)}" id="${id}" value="${s.id}" data-shape${s.id === shape ? ' checked' : ''}><label for="${id}">${s.label}</label>`; }).join('')}
  </div>
</div>` : ''}
${input(b, 'img.alt', 'Beschrijving', { max: 150, help: 'alt', ph: 'bijv. Ons team aan de vergadertafel' })}
<details class="nb-more">
  <summary>of plak een link naar een foto die al online staat</summary>
  ${input(b, 'img.src', 'Link naar de foto', { max: 1000, ph: 'https://…/foto.jpg', type: 'url' })}
</details>`;
  }

  function imgState(img) {
    if (!img.src) return ['', canUpload() ? 'Kies een foto, of sleep hem hierheen of plak hem (Ctrl + V).' : 'Kies een foto, of plak een link.'];
    if (!E.safeImg(img.src)) return ['is-err', 'Deze link werkt niet in een mail: hij moet met https:// beginnen.'];
    const size = img.w && img.h ? ` · ${img.w} × ${img.h} px` : '';
    if (img.src.startsWith(E.SITE)) return ['is-ok', `fotobank, staat online${size}`];
    return ['is-ok', `staat online${size}`];
  }

  // Punten naast of onder elkaar, met een klein plaatje van de schikking
  const LAYOUT_ART = {
    naast: '<span class="nb-lay nb-lay--naast" aria-hidden="true"><i></i><i></i><i></i></span>',
    onder: '<span class="nb-lay nb-lay--onder" aria-hidden="true"><i></i><i></i><i></i></span>',
  };
  const LAYOUT_NAME = { naast: 'naast elkaar', onder: 'onder elkaar' };

  function layoutField(b) {
    const id = fid();
    return `<div class="field">
  <span class="label" id="${id}">Punten staan <button type="button" class="help" data-help="punten-schikking"></button></span>
  <div class="seg seg--2 seg--sm nb-lays" role="radiogroup" aria-labelledby="${id}">
    ${E.POINT_LAYOUTS.map((s) => { const r = fid(); return `<input type="radio" name="layout-${esc(b.id)}" id="${r}" value="${s}" data-k="layout"${b.layout === s ? ' checked' : ''}><label for="${r}">${LAYOUT_ART[s]}${LAYOUT_NAME[s]}</label>`; }).join('')}
  </div>
  <p class="field-hint">Op een telefoon staan ze altijd onder elkaar.</p>
</div>`;
  }

  function pointsField(b) {
    const items = b.items;
    return `${layoutField(b)}${items.map((it, i) => {
      const iconSrc = pending[`${b.id}:${i}`] || (it.icon && it.icon.src);
      return `<div class="nb-point" data-point="${i}">
  <div class="nb-point__head"><span>Punt ${i + 1}</span>${items.length > 2 ? `<button type="button" class="linkbtn" data-act="point-del" data-i="${i}">weghalen</button>` : ''}</div>
  <div class="nb-icon-pick">
    ${iconSrc ? `<img class="nb-icon-pick__img" src="${esc(iconSrc)}" alt="">` : ''}
    <button type="button" class="btn btn-outline btn-xs" data-act="icon" data-i="${i}">${it.icon ? 'ander icoon' : 'icoon kiezen'}</button>
    ${it.icon ? `<button type="button" class="linkbtn" data-act="icon-off" data-i="${i}">zonder icoon</button>` : ''}
    ${i === 0 ? '<button type="button" class="help" data-help="icoon"></button>' : ''}
  </div>
  ${input(b, `items.${i}.title`, 'Titel', { max: 60 })}
  ${text(b, `items.${i}.text`, 'Tekst', { rows: 2, max: 300, help: '' })}
</div>`;
    }).join('')}
<div class="nb-points-foot">${items.length < E.MAX_POINTS ? '<button type="button" class="btn btn-quiet btn-sm" data-act="point-add">+ punt</button>' : ''}</div>`;
  }

  const SIDE_ART = {
    links: '<span class="nb-side nb-side--links" aria-hidden="true"><i></i><b></b></span>',
    rechts: '<span class="nb-side nb-side--rechts" aria-hidden="true"><i></i><b></b></span>',
    boven: '<span class="nb-side nb-side--boven" aria-hidden="true"><i></i><b></b></span>',
  };

  function sideField(b) {
    const id = fid();
    return `<div class="field">
  <span class="label" id="${id}">Foto staat <button type="button" class="help" data-help="foto-plek"></button></span>
  <div class="seg seg--3 seg--sm nb-sides" role="radiogroup" aria-labelledby="${id}">
    ${E.SIDES.map((s) => { const r = fid(); return `<input type="radio" name="side-${esc(b.id)}" id="${r}" value="${s}" data-k="side"${b.side === s ? ' checked' : ''}><label for="${r}">${SIDE_ART[s]}${s}</label>`; }).join('')}
  </div>
  <p class="field-hint">Op een telefoon staat de foto altijd boven de tekst.</p>
</div>`;
  }

  // Een tekstblok: in één klik foto erbij, links, rechts of boven (de tekst blijft)
  const addPhotoRow = () => `<div class="nb-convert" role="group" aria-label="Foto erbij">
  <span class="nb-convert__label">Foto erbij</span>
  ${E.SIDES.map((s) => `<button type="button" class="nb-convert__btn" data-act="add-photo" data-side="${s}" title="Foto ${s === 'boven' ? 'boven de tekst' : `${s} naast de tekst`}">${SIDE_ART[s]}${s}</button>`).join('')}
  <button type="button" class="help" data-help="foto-erbij"></button>
</div>`;

  function fieldsFor(b) {
    switch (b.type) {
      case 'opening':
        return input(b, 'label', 'Label', { max: 40, opt: true, hint: 'Klein, in hoofdletters, met een cyaan zeshoekje.' })
          + input(b, 'title', 'Kop', { max: 120, help: 'kop' })
          + text(b, 'intro', 'Intro', { rows: 4 })
          + link(b, 'button', 'Magenta knop', { help: 'hoofdknop', textPh: 'plan een gesprek' });
      case 'foto':
        return imageField(b) + input(b, 'url', 'Link achter de foto', { max: 1000, opt: true, help: 'fotolink', ph: 'https://…', type: 'url' })
          + '<div class="nb-convert"><button type="button" class="nb-convert__btn" data-act="add-text">+ tekst erbij</button><span class="field-hint">de foto komt dan boven de tekst</span></div>';
      case 'tekst':
        return addPhotoRow()
          + input(b, 'title', 'Tussenkop', { max: 120, help: 'kop', opt: true })
          + text(b, 'body', 'Tekst', { rows: 6 })
          + `<p class="field-hint">Een link in de tekst? Typ [tekst](link). <button type="button" class="help" data-help="tekstlink"></button></p>`
          + link(b, 'link', 'Link onder de tekst', { textPh: 'Lees verder' });
      case 'fototekst':
        return imageField(b) + sideField(b)
          + input(b, 'url', 'Link achter de foto', { max: 1000, opt: true, help: 'fotolink', ph: 'https://…', type: 'url' })
          + input(b, 'title', 'Kop', { max: 100, help: 'kop', opt: true })
          + text(b, 'body', 'Tekst', { rows: 4 })
          + link(b, 'link', 'Link', { textPh: 'Bekijk het' });
      case 'punten':
        return input(b, 'title', 'Kop', { max: 100, help: 'kop', opt: true }) + pointsField(b);
      case 'resultaat':
        return input(b, 'label', 'Label', { max: 50, help: 'resultaat', ph: 'Resultaat · klantnaam' })
          + input(b, 'number', 'Cijfer', { max: 12, ph: '+184%' })
          + input(b, 'text', 'Wat het betekent', { max: 90 });
      case 'afsluiter':
        return input(b, 'title', 'Kop', { max: 100, help: 'kop', opt: true })
          + text(b, 'body', 'Tekst', { rows: 3 })
          + link(b, 'button', 'Knop', { help: 'rustige-knop', textPh: 'mail ons', urlPh: 'info@pureminds.nl of https://…' });
      default:
        return '';
    }
  }

  /* --- Waarden lezen en schrijven via een pad: "button.text", "items.1.title" --- */

  function get(obj, path) {
    return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
  }
  function set(obj, path, value) {
    const keys = path.split('.');
    const last = keys.pop();
    const target = keys.reduce((o, k) => o[k], obj);
    target[last] = value;
  }

  el.list.addEventListener('input', (e) => {
    const field = e.target.closest('[data-k]');
    const card = e.target.closest('[data-id]');
    if (!field || !card) return;
    const b = find(card.dataset.id);
    if (!b) return;
    const k = field.dataset.k;
    if (field.type === 'radio') return;   // via change
    set(b, k, field.value);
    if (/\.url$|^url$/.test(k)) {
      const bad = field.value.trim() && !E.safeUrl(field.value);
      field.classList.toggle('is-bad', !!bad);
      const note = $(`[data-bad-for="${CSS.escape(k)}"]`, card);
      if (note) note.hidden = !bad;
    }
    if (k === 'img.src') {
      b.img.w = undefined;
      b.img.h = undefined;
      delete b.img.orig;
      measure(b.id, field.value);
    }
    const sum = $('[data-sum]', card);
    if (sum) sum.textContent = summaryOf(b);
    changed(`${b.id}:${k}`);
  });

  el.list.addEventListener('change', (e) => {
    const card = e.target.closest('[data-id]');
    const b = card && find(card.dataset.id);
    if (!b) return;
    if (e.target.matches('[data-k="side"]')) {
      b.side = e.target.value;
      changed(null);
    } else if (e.target.matches('[data-k="layout"]')) {
      b.layout = e.target.value;
      changed(null);
    } else if (e.target.matches('[data-shape]')) {
      setShape(b.id, e.target.value);
    }
  });

  // Afmetingen van een foto achter een link (voor de juiste hoogte in Outlook)
  function measure(id, src) {
    if (!E.safeImg(src)) return;
    const img = new Image();
    img.onload = () => {
      const b = find(id);
      if (!b || b.img.src !== src) return;
      b.img.w = img.naturalWidth;
      b.img.h = img.naturalHeight;
      save();
      refreshImgState(id);
      renderSoon();
    };
    img.src = src;
  }

  /* --- Knoppen in de kaartjes --- */

  el.list.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    const card = e.target.closest('[data-id]');
    if (!btn || !card) return;
    const id = card.dataset.id;
    const b = find(id);
    if (!b) return;
    const act = btn.dataset.act;
    const i = Number(btn.dataset.i);
    if (act === 'toggle') select(selected === id ? null : id, { open: false });
    else if (act === 'up' || act === 'down') move(id, act === 'up' ? -1 : 1);
    else if (act === 'dup') duplicate(id);
    else if (act === 'del') remove(id);
    else if (act === 'pick') pickFile(id);
    else if (act === 'stock' || act === 'choose') openChooser(id);
    else if (act === 'add-photo') convertBlock(id, 'fototekst', { side: btn.dataset.side, choose: true });
    else if (act === 'remove-photo') convertBlock(id, 'tekst');
    else if (act === 'add-text') convertBlock(id, 'fototekst', { side: 'boven', focus: 'title' });
    else if (act === 'icon') openIcons(id, i);
    else if (act === 'icon-off') {
      b.items[i].icon = null;
      changed(null);
      renderList();
    } else if (act === 'point-add' && b.items.length < E.MAX_POINTS) {
      b.items.push({ icon: null, title: 'Nog een punt', text: 'Eén korte zin met de kern.' });
      changed(null);
      renderList();
    } else if (act === 'point-del' && b.items.length > 2) {
      b.items.splice(i, 1);
      changed(null);
      renderList();
    }
  });

  function select(id, { open = false, focus = false } = {}) {
    selected = id && find(id) ? id : null;
    renderList();
    markSelected();
    if (!selected) return;
    const card = $(`[data-id="${CSS.escape(selected)}"]`, el.list);
    if (open) {
      shell.open('inhoud');
      const first = card && $('.nb-card__body .input, .nb-card__body [contenteditable]', card);
      if (focus && first) shell.reveal('inhoud', first);
      else if (card) card.scrollIntoView({ block: 'nearest' });
    }
    scrollPreviewTo(selected);
  }

  // Een blok omzetten met behoud van tekst, link en foto (PMEmail.convert); één stap om ongedaan te maken
  function convertBlock(id, to, { side, choose = false, focus = '' } = {}) {
    const i = indexOf(id);
    if (i < 0) return;
    const from = state.blocks[i];
    state.blocks[i] = E.convert(from, to, { side });
    selected = id;
    changed(null);
    renderList();
    render();
    if (to === 'tekst') {
      PM.toast('Foto weggehaald: het is nu een tekstblok. Je tekst staat er nog.', false, { label: 'ongedaan maken', run: () => history.undo() });
    } else if (choose && !state.blocks[i].img.src) {
      openChooser(id);
    }
    if (focus) {
      const f = $(`[data-id="${CSS.escape(id)}"] [data-k="${focus}"]`, el.list);
      if (f) f.focus();
    }
  }

  function move(id, dir) {
    const i = indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= state.blocks.length) return;
    const [b] = state.blocks.splice(i, 1);
    state.blocks.splice(j, 0, b);
    changed(null);
    renderList();
    render();
    const btn = $(`[data-id="${CSS.escape(id)}"] [data-act="${dir < 0 ? 'up' : 'down'}"]`, el.list);
    if (btn && !btn.disabled) btn.focus();
    else {
      const t = $(`[data-id="${CSS.escape(id)}"] [data-act="toggle"]`, el.list);
      if (t) t.focus();
    }
    scrollPreviewTo(id);
  }

  function duplicate(id) {
    const i = indexOf(id);
    if (i < 0) return;
    if (state.blocks.length >= E.MAX_BLOCKS) {
      PM.toast(`Hoogstens ${E.MAX_BLOCKS} blokken: dan wordt je mail te lang voor Gmail.`, true);
      return;
    }
    const copy = JSON.parse(JSON.stringify(state.blocks[i]));
    copy.id = E.block(copy.type).id;
    state.blocks.splice(i + 1, 0, copy);
    selected = copy.id;
    changed(null);
    renderList();
    render();
    PM.toast(`${E.BLOCKS[copy.type].name} gekopieerd: de kopie staat eronder.`, false, { label: 'ongedaan maken', run: () => history.undo() });
  }

  function remove(id) {
    const i = indexOf(id);
    if (i < 0) return;
    const [b] = state.blocks.splice(i, 1);
    const next = state.blocks[i] || state.blocks[i - 1];
    selected = next ? next.id : null;
    changed(null);
    renderList();
    render();
    const focusTo = selected && $(`[data-id="${CSS.escape(selected)}"] [data-act="toggle"]`, el.list);
    if (focusTo) focusTo.focus();
    PM.toast(`${E.BLOCKS[b.type].name} weggegooid.`, false, { label: 'ongedaan maken', run: () => history.undo() });
  }

  /* ---------------------------------------------------------------------------
     Blokken toevoegen
     ------------------------------------------------------------------------- */

  el.types.innerHTML = E.TYPES.map((t) => `<button type="button" class="nb-type" data-type="${t}">
  ${art(t)}<span class="nb-type__name">${esc(E.BLOCKS[t].name)}</span><span class="nb-type__sub">${esc(E.BLOCKS[t].sub)}</span>
</button>`).join('');

  el.types.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-type]');
    if (!btn) return;
    if (state.blocks.length >= E.MAX_BLOCKS) {
      PM.toast(`Hoogstens ${E.MAX_BLOCKS} blokken: dan wordt je mail te lang voor Gmail.`, true);
      return;
    }
    const b = E.block(btn.dataset.type);
    const at = selected ? indexOf(selected) + 1 : state.blocks.length;
    state.blocks.splice(at, 0, b);
    selected = b.id;
    changed(null);
    render();
    shell.open('inhoud');
    select(b.id, { open: true });
    const t = $(`[data-id="${CSS.escape(b.id)}"] [data-act="toggle"]`, el.list);
    if (t) t.focus();
    PM.toast(`${E.BLOCKS[b.type].name} toegevoegd. Pas het aan bij Inhoud.`, false, { label: 'ongedaan maken', run: () => history.undo() });
  });

  $('#addBtn').addEventListener('click', () => shell.open('blokken', { focus: '.nb-type' }));

  /* ---------------------------------------------------------------------------
     Mail: naam, voorvertoningstekst, opnieuw beginnen
     ------------------------------------------------------------------------- */

  function syncMail() {
    if (document.activeElement !== el.name) el.name.value = state.name;
    if (document.activeElement !== el.subject) el.subject.value = state.subject;
    if (document.activeElement !== el.mast) el.mast.value = state.masthead;
    if (document.activeElement !== el.edition) el.edition.value = state.edition;
    if (document.activeElement !== el.pre) el.pre.value = state.preheader;
    syncPreCount();
  }
  function syncPreCount() {
    const n = state.preheader.trim().length;
    el.preCount.textContent = n ? `${n} tekens${n > 110 ? ': de inbox toont er vaak maar zo’n 90' : ''}` : 'Eén zin, zo’n 40 tot 90 tekens.';
  }
  $('#subjectCopy').addEventListener('click', async () => {
    if (!state.subject.trim()) { PM.toast('Er is nog geen onderwerp.', true); return; }
    const ok = await writeClipboard(state.subject.trim());
    PM.toast(ok ? 'Onderwerp gekopieerd: plak het in Brevo bij Subject.' : 'Kopiëren lukte niet.', !ok);
  });
  [el.name, el.subject, el.mast, el.edition, el.pre].forEach((f) => f.addEventListener('input', () => {
    state[f.dataset.mail] = f.value;
    syncPreCount();
    changed(f.dataset.mail);
  }));

  // Een nieuwe mail: de vorige blijft in de bieb (alles wordt vanzelf opgeslagen); de melding brengt je er terug
  function restart(kind) {
    const prev = lib ? lib.detach() : { id: null };
    const reset = () => {
      state = { ...E.starter(kind), name: '' };
      selected = state.blocks[0] ? state.blocks[0].id : null;
      syncMail();
      changed(null);
      renderList();
      render();
    };
    if (lib) lib.hold(reset);
    else reset();
    PM.toast(`${kind === 'kort' ? 'Nieuwe korte mail' : 'Nieuwe nieuwsbrief'} gestart.${prev.id ? ' De vorige staat in de bieb.' : ''}`, false,
      prev.id ? { label: 'terug naar vorige', run: () => lib.open(prev.id) } : { label: 'ongedaan maken', run: () => history.undo() });
  }
  $$('[data-restart]').forEach((btn) => btn.addEventListener('click', () => restart(btn.dataset.restart)));

  /* ---------------------------------------------------------------------------
     Foto's: kiezen, slepen of plakken; verkleinen, bijsnijden en online zetten
     ------------------------------------------------------------------------- */

  let pickFor = null;
  function pickFile(id) {
    if (!canUpload()) {
      PM.toast('Foto’s uploaden staat nog niet aan. Kies er een uit de fotobank, of plak een link naar een foto die al online staat.', true);
      openStock(id);
      return;
    }
    pickFor = id;
    el.fileInput.value = '';
    el.fileInput.click();
  }
  el.fileInput.addEventListener('change', () => {
    const file = el.fileInput.files && el.fileInput.files[0];
    if (file && pickFor) uploadPhoto(pickFor, file);
  });

  function bindImageDrops(root) {
    $$('[data-drop]', root).forEach((zone) => {
      const card = zone.closest('[data-id]');
      PM.bindDrop(zone, (file) => uploadPhoto(card.dataset.id, file), zone);
    });
  }

  // Ctrl + V met een foto op het klembord: in het open fotoblok
  document.addEventListener('paste', (e) => {
    const b = find(selected);
    if (!b || !b.img) return;
    const item = Array.from((e.clipboardData && e.clipboardData.items) || []).find((x) => x.kind === 'file' && /^image\//.test(x.type));
    if (!item) return;
    e.preventDefault();
    uploadPhoto(b.id, item.getAsFile());
  });

  async function prepare(file, shapeId) {
    const { img, url } = await PM.readImage(file);
    try {
      const W = img.naturalWidth;
      const H = img.naturalHeight;
      if (!W || !H) throw new Error('Deze afbeelding heeft geen maat. Kies een JPG of PNG.');
      const shape = SHAPES.find((s) => s.id === shapeId) || SHAPES[0];
      let sx = 0;
      let sy = 0;
      let sw = W;
      let sh = H;
      if (shape.ratio) {
        // Vanuit het midden bijsnijden; bij een staande foto iets boven het midden (hoofden)
        if (W / H > shape.ratio) { sw = Math.round(H * shape.ratio); sx = Math.round((W - sw) / 2); }
        else { sh = Math.round(W / shape.ratio); sy = Math.round((H - sh) * 0.4); }
      }
      const w = Math.min(MAX_W, sw);
      const h = Math.round((w * sh) / sw);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      const keepPng = /png|gif/i.test(file.type) && !shape.ratio;
      if (!keepPng) {
        ctx.fillStyle = '#ffffff';   // doorzichtig wordt wit (een JPG kent geen doorzichtig)
        ctx.fillRect(0, 0, w, h);
      }
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
      const toBlob = (type, q) => new Promise((res) => canvas.toBlob(res, type, q));
      let blob = keepPng ? await toBlob('image/png') : null;
      if (!blob || blob.size > 900 * 1024) {
        if (keepPng) { ctx.globalCompositeOperation = 'destination-over'; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); }
        blob = await toBlob('image/jpeg', 0.84);
      }
      if (!blob) throw new Error('Deze foto kon de browser niet omzetten. Probeer een andere.');
      return { blob, w, h, small: sw < 600 };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // opts.alt: beschrijving (zoals de fotosuggestie van de AI); opts.quiet: geen melding (meer foto's tegelijk)
  async function uploadPhoto(id, file, opts = {}) {
    const b = find(id);
    if (!b || !b.img || !file) return;
    if (!canUpload()) {
      pickFile(id);
      return;
    }
    let prepared;
    try {
      prepared = await prepare(file, b.img.shape || 'auto');
    } catch (err) {
      PM.toast(err.message || 'Deze foto kon de browser niet lezen.', true);
      return;
    }
    const origKey = `nb-orig-${PM.uid()}`;
    await PM.idb.set(origKey, file);
    trackFile(origKey);
    await sendPhoto(id, prepared, file.name || 'foto', { orig: origKey, name: file.name || '', ...(opts.alt ? { alt: opts.alt } : {}), quiet: !!opts.quiet });
  }

  async function sendPhoto(id, prepared, name, extra) {
    if (pending[id]) URL.revokeObjectURL(pending[id]);
    pending[id] = URL.createObjectURL(prepared.blob);
    refreshCard(id);
    renderSoon();
    try {
      const url = await upload(prepared.blob, name);
      const b = find(id);
      if (!b) return;
      const fresh = b.img.src !== url;
      b.img = { ...b.img, ...extra, src: url, w: prepared.w, h: prepared.h, alt: extra.keepAlt ? b.img.alt : (extra.alt || '') };
      delete b.img.keepAlt;
      delete b.img.quiet;
      if (fresh) changed(null);
      if (!extra.quiet) PM.toast(prepared.small
        ? `Foto staat online, maar hij is klein (${prepared.w} px breed): in de mail kan hij wazig worden.`
        : `Foto staat online. ${extra.keepAlt || extra.alt ? '' : 'Beschrijf hem nog in een paar woorden.'}`);
    } catch (err) {
      PM.toast(err.message || 'Uploaden lukte niet.', true);
    } finally {
      URL.revokeObjectURL(pending[id]);
      delete pending[id];
      refreshCard(id);
      render();
    }
  }

  // Een andere vorm: opnieuw bijsnijden uit het origineel en online zetten
  // Een foto van Unsplash snijdt Unsplash zelf bij (imgix: fit=crop&ar=3:2); de link blijft bij hen
  function unsplashShape(src, shapeId) {
    const u = new URL(src);
    ['w', 'h', 'fit', 'ar', 'crop', 'q', 'fm'].forEach((k) => u.searchParams.delete(k));
    u.searchParams.set('w', '1200');
    const shape = SHAPES.find((s) => s.id === shapeId);
    if (shape && shape.ratio) {
      u.searchParams.set('fit', 'crop');
      u.searchParams.set('ar', shapeId);
      u.searchParams.set('crop', 'faces,entropy');
    } else u.searchParams.set('fit', 'max');
    u.searchParams.set('q', '80');
    u.searchParams.set('fm', 'jpg');
    return u.toString();
  }

  async function setShape(id, shapeId) {
    const b = find(id);
    if (!b) return;
    b.img.shape = shapeId;
    if (/^https:\/\/images\.unsplash\.com\//.test(b.img.src)) {
      b.img.src = unsplashShape(b.img.src, shapeId);
      b.img.w = undefined;
      b.img.h = undefined;
      changed(null);
      refreshCard(id);
      render();
      measure(id, b.img.src);   // de nieuwe hoogte, voor Outlook
      return;
    }
    changed(null);
    let orig = b.img.orig ? await PM.idb.get(b.img.orig) : null;
    // Een foto uit de fotobank staat op deze site: die kan de tool ook bijsnijden
    const stockPhoto = E.STOCK.find((p) => p.src === b.img.src);
    if (!(orig instanceof Blob) && stockPhoto && canUpload()) {
      try {
        const res = await fetch(PM.url(`assets/styleguide/photos/${stockPhoto.file}`));
        if (res.ok) {
          orig = await res.blob();
          b.img.orig = `nb-orig-${PM.uid()}`;
          b.img.name = stockPhoto.file;
          await PM.idb.set(b.img.orig, orig);
          trackFile(b.img.orig);
        }
      } catch (err) {
        orig = null;
      }
    }
    if (!(orig instanceof Blob)) {
      if (b.img.src && !b.img.orig) PM.toast('De vorm geldt voor foto’s die je hier uploadt. Kies de foto opnieuw om hem bij te snijden.');
      return;
    }
    if (!canUpload()) return;
    try {
      const prepared = await prepare(orig, shapeId);
      await sendPhoto(id, prepared, b.img.name || 'foto', { orig: b.img.orig, name: b.img.name || '', keepAlt: true });
    } catch (err) {
      PM.toast(err.message || 'Bijsnijden lukte niet.', true);
    }
  }

  // Alleen het kaartje van dit blok opnieuw (als het open is), zonder de focus elders te verliezen
  function refreshCard(id) {
    if (id !== selected) return;
    const active = document.activeElement;
    const keep = active && el.list.contains(active) ? active.dataset.k || active.dataset.act : null;
    renderList();
    if (keep) {
      const back = $(`[data-id="${CSS.escape(id)}"] [data-k="${CSS.escape(keep)}"], [data-id="${CSS.escape(id)}"] [data-act="${CSS.escape(keep)}"]`, el.list);
      if (back) back.focus();
    }
  }
  function refreshImgState(id) {
    const b = find(id);
    const node = b && $(`[data-id="${CSS.escape(id)}"] [data-img-state]`, el.list);
    if (!node) return;
    const [cls, txt] = imgState(b.img);
    node.className = `nb-img__state ${cls}`;
    node.textContent = txt;
  }

  /* --- Originelen in IndexedDB: bijhouden en opruimen wat nergens meer in staat --- */

  function trackFile(key) {
    const list = PM.store.get(FILES_KEY, []);
    if (!list.includes(key)) PM.store.set(FILES_KEY, [...list, key]);
  }
  const fileKeys = (s) => (s.blocks || []).map((b) => b.img && b.img.orig).filter(Boolean);
  async function cleanupFiles() {
    const keep = new Set(fileKeys(state));
    const list = PM.store.get(FILES_KEY, []);
    for (const key of list) if (!keep.has(key)) await PM.idb.del(key);
    PM.store.set(FILES_KEY, list.filter((k) => keep.has(k)));
  }

  /* ---------------------------------------------------------------------------
     Fotobank: foto's van Pure Minds die al online staan
     ------------------------------------------------------------------------- */

  let stockFor = null;
  el.stockGrid.innerHTML = E.STOCK.map((p, i) => `<button type="button" data-stock="${i}" aria-label="${esc(p.alt)}"><img src="${PM.url(`assets/styleguide/photos/${p.file}`)}" alt="" loading="lazy"></button>`).join('');

  // Zoekwoorden voor de fotobank uit de kop of tekst van het blok (Nederlands)
  const STOP = new Set('de het een en van in op met voor naar om te is je jij we wij ons onze dat die dit wat hoe bij aan uit zo of als ook nog meer'.split(' '));
  const keywords = (text) => String(text || '').replace(/\*\*|\[|\]\([^)]*\)/g, ' ').toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)).slice(0, 4).join(' ');

  function openChooser(id) {
    const b = find(id);
    if (!b || !b.img) return;
    stockFor = id;
    const upload = $('#stockUploadBtn');
    upload.disabled = !canUpload();
    upload.title = canUpload() ? '' : 'Foto’s uploaden staat nog niet aan';
    const box = $('#stockSearch');
    box.hidden = true;
    if (PM.photos) {
      PM.photos.ready().then((on) => {
        if (!on || stockFor !== id) return;
        box.hidden = false;
        const fromAi = b.img.query || '';
        const picker = PM.photos.picker(box, {
          tool: 'nbkies',
          target: () => ({ label: 'dit blok', orientation: 'landscape', query: fromAi || keywords(b.title || b.body), locale: fromAi ? 'en-US' : 'nl-NL', width: 1600 }),
          apply: async (file, photo) => {
            el.stockDialog.close();
            await placePhoto(id, file, photo);
          },
        });
        PM.help.init(box, 'newsletter');
        picker.refresh();
      });
    }
    el.stockDialog.showModal();
  }
  const openStock = openChooser;
  $('#stockUploadBtn').addEventListener('click', () => {
    el.stockDialog.close();
    pickFile(stockFor);
  });

  // Een foto uit de fotobank (online gezocht) in een blok: Unsplash op hun eigen link, anders online zetten
  async function placePhoto(id, file, photo) {
    const b = find(id);
    if (!b || !b.img) return;
    if (photo.provider === 'unsplash') {
      linkPhoto(b, photo, b.img.alt && !E.STOCK.some((p) => p.src === b.img.src) ? b.img.alt : photo.alt);
      changed(null);
      renderList();
      render();
      return;
    }
    if (!canUpload()) { PM.toast('Foto’s uploaden staat nog niet aan.', true); return; }
    await uploadPhoto(id, file, { alt: b.img.alt || photo.alt });
  }
  el.stockGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-stock]');
    const b = btn && find(stockFor);
    if (!b) return;
    const p = E.STOCK[Number(btn.dataset.stock)];
    b.img = { src: p.src, alt: p.alt, w: p.w, h: p.h, shape: b.img.shape };
    el.stockDialog.close();
    changed(null);
    renderList();
    render();
  });

  /* ---------------------------------------------------------------------------
     Iconen: zoeken in de Icon Finder, wit in een cyaan zeshoek, als PNG online
     ------------------------------------------------------------------------- */

  const loaded = {};
  function loadScript(path) {
    if (!loaded[path]) {
      loaded[path] = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = PM.url(path);
        s.onload = resolve;
        s.onerror = () => reject(new Error('De iconen konden niet laden. Controleer je internet en probeer het opnieuw.'));
        document.head.appendChild(s);
      });
    }
    return loaded[path];
  }

  let engine = null;
  let iconFor = null;
  const POPULAR = ['lightbulb', 'rocket', 'line-chart', 'bar-chart-box', 'team', 'calendar', 'time', 'mail', 'phone', 'check', 'star', 'heart', 'thumb-up', 'search', 'megaphone', 'trophy', 'map-pin', 'shield-check', 'settings-3', 'money-euro-circle', 'focus-3', 'flag', 'leaf', 'global', 'chat-3', 'user-smile', 'shopping-cart', 'gift', 'camera', 'pencil'];
  const CATEGORY_LABELS = {
    'Arrows': 'Pijlen', 'Buildings': 'Gebouwen', 'Business': 'Zakelijk', 'Communication': 'Communicatie',
    'Design': 'Design', 'Development': 'Development', 'Device': 'Apparaten', 'Document': 'Documenten',
    'Editor': 'Tekstopmaak', 'Finance': 'Financiën', 'Food': 'Eten & drinken', 'Game & Sports': 'Spel & sport',
    'Health & Medical': 'Gezondheid', 'Logos': "Logo's & merken", 'Map': 'Kaart & reizen', 'Media': 'Media',
    'Others': 'Overig', 'System': 'Systeem', 'User & Faces': 'Mensen', 'Weather': 'Weer',
  };

  async function openIcons(id, i) {
    if (!canUpload()) {
      PM.toast('Iconen kiezen kan zodra foto’s uploaden aanstaat: een icoon moet online staan om in een mail te werken.', true);
      return;
    }
    iconFor = { id, i };
    el.iconGrid.innerHTML = '<p class="nb-icons__empty">iconen laden…</p>';
    el.iconDialog.showModal();
    try {
      await Promise.all(['js/icons/hex.js', 'js/icons/icon-data.js', 'js/icons/icon-tags.js', 'js/icons/search.js'].map(loadScript));
      if (!engine) {
        const data = window.PM_ICON_DATA;
        engine = window.PMIconSearch.create({ icons: data.icons, categories: data.categories, categoryLabels: CATEGORY_LABELS, tags: window.PM_ICON_TAGS || {} });
      }
      showIcons(el.iconSearch.value);
      el.iconSearch.focus();
    } catch (err) {
      el.iconGrid.innerHTML = `<p class="nb-icons__empty">${esc(err.message)}</p>`;
    }
  }

  // Alleen iconen met een lijnvariant (de huisstijl: Line; wit in een effen zeshoek)
  function showIcons(q) {
    const data = window.PM_ICON_DATA;
    if (!data || !engine) return;
    const icons = data.icons;
    let ids;
    if (String(q || '').trim()) ids = engine.search(q).ids;
    else {
      const byName = new Map(icons.map((ic, i) => [ic[0], i]));
      ids = POPULAR.map((n) => byName.get(n)).filter((i) => i != null);
    }
    ids = ids.filter((i) => icons[i][3] === 1 && icons[i][1] !== data.categories.indexOf('Logos')).slice(0, 72);
    if (!ids.length) {
      el.iconGrid.innerHTML = '<p class="nb-icons__empty">Niets gevonden. Probeer een ander woord, in het Nederlands of Engels.</p>';
      return;
    }
    const preset = window.PMHex.presets.cyaan;
    el.iconGrid.innerHTML = ids.map((i) => {
      const [name, , d] = icons[i];
      return `<button type="button" role="option" data-icon="${i}" title="${esc(name)}">${window.PMHex.svg(d, { shape: 'hex', fill: preset.fill, color: preset.color, height: 40 })}<span>${esc(name.replace(/-/g, ' '))}</span></button>`;
    }).join('');
  }
  el.iconSearch.addEventListener('input', PM.debounce(() => showIcons(el.iconSearch.value), 120));

  el.iconGrid.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-icon]');
    if (!btn || !iconFor) return;
    const [name, , d] = window.PM_ICON_DATA.icons[Number(btn.dataset.icon)];
    const { id, i } = iconFor;
    el.iconDialog.close();
    const key = `${id}:${i}`;
    const cache = PM.store.get(ICONS_KEY, {});
    try {
      let url = cache[name];
      if (!url) {
        const blob = await iconPng(d);
        pending[key] = URL.createObjectURL(blob);
        refreshCard(id);
        renderSoon();
        url = await upload(blob, `icoon-${name}.png`);
        PM.store.set(ICONS_KEY, { ...PM.store.get(ICONS_KEY, {}), [name]: url });
      }
      const b = find(id);
      if (!b || !b.items[i]) return;
      b.items[i].icon = { src: url, name };
      changed(null);
    } catch (err) {
      PM.toast(err.message || 'Het icoon kon niet online.', true);
    } finally {
      if (pending[key]) URL.revokeObjectURL(pending[key]);
      delete pending[key];
      refreshCard(id);
      render();
    }
  });

  // Cyaan zeshoek met wit lijnicoon, 3x zo groot als in de mail (35 × 40): scherp op retina
  function iconPng(d) {
    const preset = window.PMHex.presets.cyaan;
    const svg = window.PMHex.svg(d, { shape: 'hex', fill: preset.fill, color: preset.color, height: 120 });
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 105;
        canvas.height = 120;
        canvas.getContext('2d').drawImage(img, 0, 0, 105, 120);
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Het icoon kon niet als PNG.'))), 'image/png');
      };
      img.onerror = () => reject(new Error('Het icoon kon niet als PNG.'));
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    });
  }

  /* ---------------------------------------------------------------------------
     Uploaden via de server van de Tool Hub (PM.service, met het inlogbewijs)
     ------------------------------------------------------------------------- */

  async function upload(blob, name) {
    const data = await PM.service.request('/api/upload', {
      body: blob,
      headers: { 'content-type': blob.type, 'x-file-name': String(name).slice(0, 120) },
    });
    if (!data.url) throw new Error('Uploaden lukte niet.');
    return data.url;
  }

  async function syncUploadState() {
    el.uploadState.className = 'notice nb-upload';
    el.uploadState.textContent = 'Even kijken of uploaden klaarstaat…';
    const st = await PM.service.status('/api/upload');
    const was = uploadOk;
    uploadOk = !!(st && st.ok && st.blob);
    if (uploadOk) {
      el.uploadState.innerHTML = '<b>Staat klaar.</b> Je foto’s en iconen gaan vanzelf online.';
    } else {
      el.uploadState.className = 'notice notice-warn nb-upload';
      el.uploadState.innerHTML = st && st.ok
        ? '<b>Uploaden is nog niet helemaal ingesteld</b> (de opslag in Vercel, zie uploads/README.md). Kies tot die tijd foto’s uit de fotobank, of plak een link naar een foto die al online staat.'
        : '<b>Uploaden staat nog niet aan.</b> Kies tot die tijd foto’s uit de fotobank, of plak een link naar een foto die al online staat.';
    }
    if (was !== uploadOk) renderList();   // de keuze voor de vorm hoort alleen bij uploaden
  }

  /* ---------------------------------------------------------------------------
     Naar Brevo: kopiëren of downloaden, met een controle vooraf (nooit tegenhouden)
     ------------------------------------------------------------------------- */

  let accepted = '';
  let checkRun = null;
  let checkIssues = [];

  function issues() {
    const html = E.build(state);
    const list = E.check(state, html);
    if (Object.keys(pending).length) list.unshift({ level: 'warn', key: 'bezig', block: null, text: 'Er staat nog een foto of icoon te uploaden. Wacht even tot hij online staat.' });
    return list;
  }

  function guard(run) {
    const list = issues().filter((i) => i.level === 'warn');
    const sig = JSON.stringify(list.map((i) => [i.key, i.block, i.text]));
    if (!list.length || sig === accepted) return run();
    shell.closePopover();
    checkIssues = list;
    checkRun = () => { accepted = sig; return run(true); };
    el.checkList.innerHTML = list.map((i, n) => `<li><button type="button" data-issue="${n}"${i.level === 'info' ? ' class="is-info"' : ''}><span>${esc(i.text)}</span>${i.block || i.key === 'voorvertoning' ? '<span class="nb-check__go" aria-hidden="true">erheen</span>' : ''}</button></li>`).join('');
    el.checkPop.hidden = false;
    el.checkGo.hidden = !list.some((i) => i.block || i.key === 'voorvertoning');
    (el.checkGo.hidden ? el.checkAnyway : el.checkGo).focus();
    return Promise.resolve();
  }

  function closeCheck({ focus = false } = {}) {
    if (el.checkPop.hidden) return;
    el.checkPop.hidden = true;
    checkRun = null;
    if (focus) el.copyBtn.focus();
  }

  function goToIssue(issue) {
    closeCheck();
    if (!issue) return;
    if (issue.key === 'voorvertoning') {
      shell.reveal('mail', '#mPre');
      return;
    }
    if (issue.block) select(issue.block, { open: true, focus: true });
  }

  el.checkGo.addEventListener('click', () => goToIssue(checkIssues.find((i) => i.block || i.key === 'voorvertoning')));
  el.checkList.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-issue]');
    if (btn) goToIssue(checkIssues[Number(btn.dataset.issue)]);
  });
  el.checkAnyway.addEventListener('click', () => {
    const run = checkRun;
    closeCheck({ focus: true });
    if (run) run();
  });
  el.checkPop.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    closeCheck({ focus: true });
  });
  document.addEventListener('pointerdown', (e) => {
    if (!el.checkPop.hidden && !el.checkPop.contains(e.target)) closeCheck();
  });

  async function writeClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.cssText = 'position:fixed;left:-9999px;top:0;';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    }
  }

  const exported = () => {
    if (PM.tour) PM.tour.signal('kopieer');
    if (lib) lib.autoSave();
  };

  async function copyHtml() {
    const ok = await writeClipboard(E.build(state));
    if (!ok) throw new Error('Kopiëren lukte niet. Gebruik download .html (het pijltje naast de knop).');
    PM.toast('HTML gekopieerd. In Brevo: Create campaign → Email → bij Design Start from scratch → HTML custom code, en plakken.', false, {
      label: 'handleiding',
      run: () => window.open(PM.url('tools/brevo-handleiding.html'), '_blank', 'noopener'),
    });
    exported();
  }

  function downloadHtml() {
    const base = (mailTitle() || (state.kind === 'kort' ? 'mail' : 'nieuwsbrief')).toLowerCase()
      .normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'nieuwsbrief';
    PM.saveBlob(new Blob([E.build(state)], { type: 'text/html;charset=utf-8' }), `pure-minds-${base}.html`);
    exported();
  }

  const copy = (button = el.copyBtn) => guard((fromCheck) => PM.run(fromCheck ? el.copyBtn : button, 'kopiëren…', copyHtml));
  const inMenu = (task) => async () => {
    await task();
    shell.closePopover();
  };
  el.copyBtn.addEventListener('click', () => copy(el.copyBtn));
  el.copyOpt.addEventListener('click', inMenu(() => copy(el.copyOpt)));
  el.htmlBtn.addEventListener('click', inMenu(() => guard((fromCheck) => PM.run(fromCheck ? el.copyBtn : el.htmlBtn, 'bestand maken…', async () => downloadHtml()))));

  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
    if (e.key.toLowerCase() === 's') {
      e.preventDefault();
      copy(el.copyBtn);
    }
  });

  /* ---------------------------------------------------------------------------
     Start
     ------------------------------------------------------------------------- */

  PM.preventStrayDrops();
  syncMail();
  renderList();
  history.clear();
  render();
  // Pure Minds Sans is in de preview pas zichtbaar als hij geladen is
  PM.fontsReady.then(fitFrame);
  syncUploadState();

  // Bieb: de mail gaat vanzelf de bieb van het team in
  lib = PM.library ? PM.library.attach({
    tool: 'newsletter',
    getState: () => state,
    fileKeys,
    apply(saved, keys) {
      keys.forEach(trackFile);
      state = E.normalize(saved);
      selected = state.blocks[0] ? state.blocks[0].id : null;
      syncMail();
      changed(null);
      renderList();
      render();
    },
    close: () => shell.closePopover(),
    openId: start.bieb,
    versionId: start.versie,
    fresh: before,
  }) : null;

  /* ---------------------------------------------------------------------------
     AI: ruwe content in, blokken eruit (schema: vul_mail in uploads/lib/ai.js)
     ------------------------------------------------------------------------- */

  // Een blok in de vorm van het schema (om aan te passen)
  function blockToAI(b) {
    switch (b.type) {
      case 'opening': return { type: b.type, label: b.label, kop: b.title, tekst: b.intro, knopTekst: b.button.text, knopLink: b.button.url };
      case 'tekst': return { type: b.type, kop: b.title, tekst: b.body, linkTekst: b.link.text, linkLink: b.link.url };
      case 'fototekst': return { type: b.type, kop: b.title, tekst: b.body, linkTekst: b.link.text, linkLink: b.link.url, fotoKant: b.side, fotoIdee: b.img.alt, fotoZoek: b.img.query || '' };
      case 'punten': return { type: b.type, kop: b.title, punten: b.items.map((it) => ({ titel: it.title, tekst: it.text })) };
      case 'resultaat': return { type: b.type, label: b.label, cijfer: b.number, cijferTekst: b.text };
      case 'afsluiter': return { type: b.type, kop: b.title, tekst: b.body, knopTekst: b.button.text, knopLink: b.button.url };
      case 'foto': return { type: b.type, fotoIdee: b.img.alt, fotoZoek: b.img.query || '' };
      default: return { type: b.type };
    }
  }
  const toAI = () => ({ onderwerp: state.subject, voorvertoning: state.preheader, blokken: state.blocks.map(blockToAI) });

  // Een blok uit de AI; prev = het blok dat er stond (foto, iconen en id blijven)
  const txt = (v) => (typeof v === 'string' ? v.trim() : '');
  function blockFromAI(x, prev, photoNo) {
    const type = x && E.BLOCKS[x.type] ? x.type : 'tekst';
    const same = !!(prev && prev.type === type);
    const b = same ? JSON.parse(JSON.stringify(prev)) : E.block(type);
    if (b.img && !same) {
      // Een foto uit de fotobank als begin; de suggestie van de AI zegt welke foto past
      const p = E.STOCK[photoNo % E.STOCK.length];
      b.img = { src: p.src, alt: p.alt, w: p.w, h: p.h };
    }
    if (b.img && txt(x.fotoZoek)) b.img.query = txt(x.fotoZoek);
    // Een knop zonder link uit de content: de vaste plek van Pure Minds (contact, mail)
    const link = (text, url, fallback = '') => ({ text: txt(text), url: txt(url) || (txt(text) ? fallback : '') });
    if (type === 'opening') Object.assign(b, { label: txt(x.label) || b.label, title: txt(x.kop), intro: txt(x.tekst), button: link(x.knopTekst, x.knopLink, 'https://www.pureminds.nl/contact/') });
    if (type === 'tekst') Object.assign(b, { title: txt(x.kop), body: txt(x.tekst), link: link(x.linkTekst, x.linkLink) });
    if (type === 'fototekst') Object.assign(b, { title: txt(x.kop), body: txt(x.tekst), link: link(x.linkTekst, x.linkLink), side: E.SIDES.includes(x.fotoKant) ? x.fotoKant : 'links' });
    if (type === 'punten') {
      const items = (Array.isArray(x.punten) ? x.punten : []).slice(0, 3).map((p, i) => ({
        icon: b.items[i] ? b.items[i].icon : null,
        title: txt(p && p.titel),
        text: txt(p && p.tekst),
      }));
      while (items.length < 2) items.push({ icon: null, title: '', text: '' });
      Object.assign(b, { title: txt(x.kop), items });
    }
    if (type === 'resultaat') Object.assign(b, { label: txt(x.label), number: txt(x.cijfer), text: txt(x.cijferTekst) });
    if (type === 'afsluiter') Object.assign(b, { title: txt(x.kop), body: txt(x.tekst), button: link(x.knopTekst, x.knopLink, 'mailto:info@pureminds.nl') });
    return b;
  }

  function applyAI(data, { mode, target, photos }) {
    const d = data && typeof data === 'object' ? data : {};
    if (target != null) {
      // Alleen het open blok: id, foto en iconen blijven
      const prev = state.blocks[target];
      if (!prev) return;
      const next = blockFromAI(d, prev, target);
      next.id = prev.id;
      state.blocks[target] = next;
      selected = next.id;
    } else {
      const list = Array.isArray(d.blokken) ? d.blokken.slice(0, E.MAX_BLOCKS) : [];
      if (!list.length) throw new Error('De AI gaf geen blokken terug. Probeer het nog eens.');
      const old = mode === 'refine' ? state.blocks : [];
      let stockNo = 0;   // welke foto uit de fotobank als begin (tot Pexels er een heeft)
      state.blocks = list.map((x, i) => {
        const b = blockFromAI(x, old[i], stockNo);
        if (b.img && !(old[i] && old[i].type === b.type)) stockNo++;
        return b;
      });
      if (txt(d.onderwerp)) state.subject = txt(d.onderwerp);
      if (txt(d.voorvertoning)) state.preheader = txt(d.voorvertoning);
      if (mode === 'generate') {
        state.name = txt(d.onderwerp).slice(0, 120);
        state.kind = state.blocks.length <= 4 ? 'kort' : 'nieuwsbrief';
        // Een korte mail heeft geen naam bovenaan; een nieuwsbrief wel (tenzij je er zelf een koos)
        if (state.kind === 'kort' && state.masthead === E.DEFAULT_MAST) state.masthead = state.edition = '';
        if (state.kind === 'nieuwsbrief' && !state.masthead) Object.assign(state, { masthead: E.DEFAULT_MAST, edition: E.thisEdition() });
      }
      // Fotosuggesties alleen voor een blok zonder foto van Pexels (daar staat dan nog de fotobank)
      state.ideas = list
        .map((x, i) => (x && ['foto', 'fototekst'].includes(x.type) && txt(x.fotoIdee) && !(photos && photos.has(i)) ? `Blok ${i + 1} (${E.BLOCKS[x.type].name.toLowerCase()}): ${txt(x.fotoIdee)}` : ''))
        .filter(Boolean);
      selected = state.blocks[0] ? state.blocks[0].id : null;
    }
    syncMail();
    changed(null);
    renderList();
    render();
    renderIdeas();
    // De foto's uit de fotobank in de fotoblokken
    if (target == null && photos && photos.size) {
      const list = Array.isArray(d.blokken) ? d.blokken : [];
      let linked = false;
      for (const [i, found] of photos) {
        const b = state.blocks[i];
        if (!b || !b.img) continue;
        const alt = txt(list[i] && list[i].fotoIdee) || found.photo.alt;
        if (found.photo.provider === 'unsplash') {
          linkPhoto(b, found.photo, alt);
          linked = true;
        } else if (found.file) uploadPhoto(b.id, found.file, { alt, quiet: true });
        else PM.photos.toFile(found.photo, 1600).then((file) => uploadPhoto(b.id, file, { alt, quiet: true })).catch(() => {});
      }
      if (linked) {
        changed(null);
        renderList();
        render();
      }
    }
  }

  // Unsplash: de foto blijft op de link van Unsplash (API-regels), 1200 px breed: scherp op retina
  function linkPhoto(b, photo, alt) {
    const w = 1200;
    b.img = { src: PM.photos.url(photo, w), alt: alt || photo.alt || '', w, h: photo.w && photo.h ? Math.round((w * photo.h) / photo.w) : undefined, query: b.img.query, shape: b.img.shape };
  }

  function renderIdeas() {
    if (!ai) return;
    ai.extras.innerHTML = state.ideas.length
      ? `<h3>Fotosuggesties van de AI</h3><ul class="ai-ideas">${state.ideas.map((t) => `<li>${esc(t)}</li>`).join('')}</ul><p class="field-hint">Er staat nu een foto uit de fotobank. Kies bij het blok een eigen foto die hierbij past.</p>`
      : '';
  }

  if (PM.ai) {
    ai = PM.ai.panel($('[data-ai-panel]'), {
      tool: 'newsletter',
      format: 'email',
      noun: 'mail',
      wishPlaceholder: 'bijv. korte mail, uitnodiging voor ons webinar',
      current: toAI,
      target: () => {
        const i = indexOf(selected);
        return i < 0 ? null : { index: i, label: `${E.BLOCKS[state.blocks[i].type].name} (blok ${i + 1})` };
      },
      apply: applyAI,
      // Foto's van Pexels: na het maken meteen in de fotoblokken (online gezet), en zelf zoeken voor het open blok
      photos: {
        // Unsplash: alleen de link (de foto blijft daar); een andere fotobank: downloaden en online zetten
        slots: (d) => {
          const linkOnly = PM.photos.provider() === 'unsplash';
          if (!linkOnly && !canUpload()) return [];
          return (Array.isArray(d && d.blokken) ? d.blokken : [])
            .map((x, i) => (x && ['foto', 'fototekst'].includes(x.type) && txt(x.fotoZoek) ? { key: i, query: txt(x.fotoZoek), orientation: 'landscape', width: 1600, download: !linkOnly } : null))
            .filter(Boolean).slice(0, 6);
        },
        target: () => {
          const b = find(selected);
          return b && b.img ? { label: `${E.BLOCKS[b.type].name.toLowerCase()} (blok ${indexOf(b.id) + 1})`, orientation: 'landscape', query: b.img.query || '', width: 1600 } : null;
        },
        apply: (file, photo) => placePhoto(selected, file, photo),
      },
      lib,
      undo: () => history.undo(),
    });
    renderIdeas();
    // "Dit onderdeel" volgt het open blok
    const refreshAI = () => ai.refresh();
    el.list.addEventListener('click', () => setTimeout(refreshAI, 0));
    shell.onChange(({ id }) => { if (id === 'ai') refreshAI(); });
    history.onChange(() => renderIdeas());
  }


  cleanupFiles();
})();
