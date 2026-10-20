/* =============================================================================
   app.js — Pure Minds Post Maker
   -----------------------------------------------------------------------------
   Houdt de toestand bij (template, teksten per template, formaat, uitsnede),
   koppelt die aan de invoervelden, en laat templates.js de preview, de
   miniaturen en de export tekenen. Teksten en instellingen staan in
   localStorage, de foto en het klantlogo in IndexedDB: alles overleeft een
   herlaadbeurt.

   De editor is de gedeelde indeling (js/shared/shell.js): rail met vier
   onderdelen, één paneel, het ontwerp op het podium. Tekstvelden tonen
   nadruk en invulplekken zoals ze zijn (richfield.js), met de werkbalk
   (toolbar.js) boven het ontwerp. Klik in de preview op een tekst en je
   staat in het goede veld.

   Ongedaan maken: PM.history over de hele post. Foto en klantlogo staan
   per stuk in IndexedDB onder een eigen sleutel (state.photoKey,
   state.logoKey, en per carousel-slide slide.photoKey); een oude foto blijft bewaard zolang hij in de
   geschiedenis kan terugkomen en wordt pas bij de volgende keer laden
   opgeruimd. Zo zet ongedaan maken ook een vervangen foto terug.
   ============================================================================= */
(function () {
  'use strict';

  const PM = window.PM;
  const T = window.PMTemplates;
  const STORAGE_KEY = 'pm-postmaker-v1';
  const FILES_KEY = 'pm-postmaker-files-v1';   // alle foto- en logosleutels in IndexedDB (om op te ruimen)
  const SAFE_KEY = 'pm-postmaker-safezone';
  const LEGACY_PHOTO = 'insta:photo';          // vóór de sleutels per foto
  const LEGACY_LOGO = 'insta:clientLogo';
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const toast = PM.toast;

  const TEMPLATE_NAMES = Object.fromEntries(T.TEMPLATE_META.map((t) => [t.id, t.name]));
  const DESTS = window.PMInstaExport.DESTS;
  const SIZES = ['klein', 'normaal', 'groot'];

  function defaults() {
    return {
      v: 2,           // 2: het donkere verloop staat standaard op 100%
      template: 'overlay',
      format: 'portrait',
      dot: true,
      badge: false,  // Emerce 100-badge: geldt voor elke post, tot je hem uitzet
      crop: { zoom: 1, fx: 0.5, fy: 0.5 },
      exportType: 'png',
      exportWidth: 1080,
      photoKey: '',   // sleutel van de foto in IndexedDB
      logoKey: '',    // sleutel van het klantlogo
      // Bij de post, niet op het plaatje: caption, hashtags en de fotosuggestie (AI of zelf)
      social: { caption: '', hashtags: '', photoIdea: '' },
      data: {
        photo: { style: 'full', label: '' },
        overlay: {
          label: '',
          title: 'Onze nieuwe **Google Ads-audit** is live',
          subtitle: 'In twee weken weet je precies waar je advertentiebudget weglekt.',
          strength: 100,
          position: 'bottom',
          decor: true,
          titleSize: 'normaal',
        },
        blog: {
          label: 'pure blog',
          title: '5 signalen dat je landingspagina conversies laat liggen',
          topic: 'conversie-optimalisatie',
          cta: 'Lees onze nieuwe blog over {onderwerp} op de website.',
          button: 'lees de blog',
          titleSize: 'normaal',
        },
        case: {
          label: 'pure case',
          client: 'Studio Noord',
          services: ['Google Ads', 'een nieuwe landingspagina', ''],
          sentence: 'Voor {klant} hebben wij {diensten} gedaan.',
          resultValue: '+184%',
          resultLabel: 'meer aanvragen binnen drie maanden',
          photoBg: false,
          titleSize: 'normaal',
        },
        carousel: {
          label: 'pure kennis',
          active: 0,
          titleSize: 'normaal',
          // De hook en de afsluiter zonder nummer: de eerste les is 01
          slides: [
            { title: 'Zo schrijf je een advertentie die wél klikt', body: 'Vijf lessen uit honderden Google Ads-accounts. Swipe mee.', numbered: false, last: false },
            { title: 'Begin met het zoekwoord', body: 'Laat het **zoekwoord** terugkomen in je eerste kop.\n- herkenbaar voor de zoeker\n- hogere kwaliteitsscore\n- lagere klikprijs', numbered: true, last: false },
            { title: 'Hulp nodig bij je campagnes?', body: 'Plan een gratis adviesgesprek via **pureminds.nl**.', numbered: false, last: true },
          ],
        },
      },
    };
  }

  /* ---------------------------------------------------------------------------
     Toestand en opslag
     ------------------------------------------------------------------------- */

  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

  // Opgeslagen waarden over de standaard heen leggen, zodat nieuwe velden
  // uit een latere versie altijd een waarde hebben
  function merge(base, saved) {
    if (!isObj(saved)) return base;
    for (const key of Object.keys(base)) {
      if (!(key in saved)) continue;
      if (isObj(base[key])) base[key] = merge(base[key], saved[key]);
      else if (Array.isArray(base[key])) base[key] = Array.isArray(saved[key]) ? saved[key] : base[key];
      else if (typeof saved[key] === typeof base[key]) base[key] = saved[key];
    }
    return base;
  }

  const CROP = { zoom: 1, fx: 0.5, fy: 0.5 };
  const num = (v, min, max, fallback) => (Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Number(v))) : fallback);
  const cropOf = (c) => (isObj(c) ? { zoom: num(c.zoom, 1, 3, 1), fx: num(c.fx, 0, 1, 0.5), fy: num(c.fy, 0, 1, 0.5) } : { ...CROP });

  // Eén slide met alle velden; de foto (aan of uit, zeshoek of achtergrond) hoort bij de slide
  function slideOf(s = {}) {
    return {
      title: String(s.title || ''),
      body: String(s.body || ''),
      numbered: s.numbered !== false,
      last: false,
      photo: !!s.photo,
      photoStyle: s.photoStyle === 'achtergrond' ? 'achtergrond' : 'zeshoek',
      photoKey: typeof s.photoKey === 'string' ? s.photoKey : '',
      crop: cropOf(s.crop),
      darken: num(s.darken, 30, 100, 80),   // donkere laag over een achtergrondfoto, in %
    };
  }

  // Een toestand gezond maken (na laden of ongedaan maken)
  function normalize(state) {
    const c = state.data.carousel;
    // numbered ontbrak vóór de slides zonder nummer: een oud concept houdt al zijn nummers
    c.slides = c.slides.filter(isObj);
    if (!c.slides.length) c.slides = defaults().data.carousel.slides;
    c.slides = c.slides.map(slideOf);
    c.active = Math.min(Math.max(0, c.active | 0), c.slides.length - 1);
    c.slides.forEach((s, i) => { s.last = i === c.slides.length - 1; });
    for (const id of ['overlay', 'blog', 'case', 'carousel']) {
      if (!SIZES.includes(state.data[id].titleSize)) state.data[id].titleSize = 'normaal';
    }
    if (!T.TEMPLATE_META.some((t) => t.id === state.template)) state.template = 'overlay';
    // Het vierkante formaat (1:1) bestaat niet meer: een oud concept wordt 4:5
    if (!T.FORMATS[state.format]) state.format = 'portrait';
    if (!DESTS[state.exportWidth]) state.exportWidth = 1080;
    if (!['png', 'jpg', 'pdf'].includes(state.exportType)) state.exportType = 'png';
    return state;
  }

  function load() {
    const state = defaults();
    let saved = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) saved = JSON.parse(raw);
    } catch (err) {
      /* geen opslag beschikbaar (privévenster): gewoon met de standaard verder */
    }
    if (saved) {
      merge(state, saved);
      // Concept van vóór de sleutels per foto: de foto en het logo staan onder de vaste sleutel
      if (!('photoKey' in saved)) state.photoKey = LEGACY_PHOTO;
      if (!('logoKey' in saved)) state.logoKey = LEGACY_LOGO;
    }
    // Oude standaardlabels uit een eerdere versie bijwerken
    if (state.data.blog.label === 'nieuwe blog') state.data.blog.label = 'pure blog';
    if (state.data.case.label === 'case') state.data.case.label = 'pure case';
    if (state.data.overlay.label === 'aankondiging') state.data.overlay.label = '';
    // Het verloop stond standaard op 80%; een concept dat dat nog had, gaat naar de nieuwe standaard
    if (saved && !(saved.v >= 2) && state.data.overlay.strength === 80) state.data.overlay.strength = 100;
    return normalize(state);
  }

  let state = load();
  // Gestart vanaf het dashboard (?template=carousel&format=portrait): meteen het
  // goede template en formaat. Pas opgeslagen bij de eerste wijziging.
  const start = PM.startParams();
  const quickStart = !!(start.template || start.format || start.ai);
  if (T.TEMPLATE_META.some((t) => t.id === start.template)) state.template = start.template;
  if (T.FORMATS[start.format]) state.format = start.format;

  const save = PM.debounce(() => PM.store.set(STORAGE_KEY, state), 300, { flushOnHide: true });
  let lib = null;   // de bieb (js/shared/library.js), aan het eind gekoppeld
  let aiSaver = null;   // na de AI: elke wijziging vanzelf in de bieb (PM.ai.keepSaved)
  let ai = null;        // het paneel AI (js/shared/ai.js)

  const env = { logo: null, badge: null, photo: null, clientLogo: null };
  const current = () => state.data[state.template];
  const carousel = () => state.data.carousel;
  const isCarousel = () => state.template === 'carousel';
  const activeSlide = () => carousel().slides[carousel().active];
  // De foto waar de knoppen nu over gaan: van de post, of van de slide die openstaat
  const slidePhotoOn = () => isCarousel() && !!activeSlide().photo;
  const photoKey = () => (isCarousel() ? activeSlide().photoKey : state.photoKey);
  const crop = () => (isCarousel() ? activeSlide().crop : state.crop);

  // De laatste slide krijgt geen swipe-aanwijzing; dat volgt uit de volgorde,
  // dus het kan niet meer vergeten of verkeerd staan
  function syncLast() {
    const slides = carousel().slides;
    slides.forEach((s, i) => { s.last = i === slides.length - 1; });
  }

  // Templates waarin de foto het beeld draagt; bij de case alleen als achtergrond
  const needsPhoto = () => ['photo', 'overlay', 'blog'].includes(state.template)
    || (state.template === 'case' && !!state.data.case.photoBg) || slidePhotoOn();

  function getPath(obj, path) {
    return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  }
  function setPath(obj, path, value) {
    const keys = path.split('.');
    const last = keys.pop();
    const target = keys.reduce((o, k) => (o[k] == null ? (o[k] = {}) : o[k]), obj);
    target[last] = value;
  }

  /* ---------------------------------------------------------------------------
     Elementen
     ------------------------------------------------------------------------- */

  const el = {
    app: $('.app'),
    editor: $('#editor'),
    stage: $('#stage'),
    design: $('#design'),
    canvas: $('#postCanvas'),
    tplPill: $('#tplPill'),
    dimPill: $('#dimPill'),
    docTitle: $('#docTitle'),
    docSub: $('#docSub'),
    warning: $('#warning'),
    warningText: $('#warningText'),
    warningBtn: $('#warningBtn'),
    photoStageNote: $('#photoStageNote'),
    photoStageText: $('#photoStageText'),
    strip: $('#slideStrip'),
    slideNav: $('#slideNav'),
    slideNo: $('#slideNo'),
    sTitle: $('#sTitle'),
    sBody: $('#sBody'),
    sNumbered: $('#sNumbered'),
    label: $('#fLabel'),
    dot: $('#dotToggle'),
    badge: $('#badgeToggle'),
    photoDrop: $('#photoDrop'),
    photoInput: $('#photoInput'),
    photoCard: $('#photoCard'),
    photoField: $('#photoField'),
    slidePhotoStyle: $('#slidePhotoStyle'),
    slidePhotoHint: $('#slidePhotoHint'),
    slideDarken: $('#slideDarken'),
    photoThumb: $('#photoThumb'),
    photoName: $('#photoName'),
    photoSize: $('#photoSize'),
    photoNote: $('#photoNote'),
    previewPhotoBtn: $('#previewPhotoBtn'),
    cropControls: $('#cropControls'),
    cropHint: $('#cropHint'),
    clientLogoBtn: $('#clientLogoBtn'),
    clientLogoInput: $('#clientLogoInput'),
    clientLogoThumb: $('#clientLogoThumb'),
    clientLogoName: $('#clientLogoName'),
    clientLogoClear: $('#clientLogoClear'),
    downloadBtn: $('#downloadBtn'),
    downloadBtn2: $('#downloadBtn2'),
    slideBtn: $('#slideBtn'),
    copyBtn: $('#copyBtn'),
    exportSum: $('#exportSum'),
    exportNote: $('#exportNote'),
    safeWrap: $('#safeWrap'),
    safeToggle: $('#safeToggle'),
    safeZone: $('#safeZone'),
  };

  /* ---------------------------------------------------------------------------
     Editor: indeling, tekstvelden, werkbalk, ongedaan maken
     ------------------------------------------------------------------------- */

  PM.richfield.init(el.editor);
  const shell = PM.shell(el.app, { tool: 'insta', quickStart });

  // De werkbalk: nadruk, invulplekken en de grootte van de kop (typeschaal van het merk)
  const toolbar = PM.toolbar($('#tbar'), {
    value: (field, cmd) => (cmd === 'grootte' ? current().titleSize || 'normaal' : null),
    apply(field, cmd, value) {
      if (cmd !== 'grootte' || !current() || !SIZES.includes(value)) return;
      current().titleSize = value;
      changed('grootte');
    },
  });

  // Alles behalve de exportkeuze: die is een voorkeur, geen onderdeel van het ontwerp
  const history = PM.history({
    snapshot: () => ({ ...state, exportType: undefined, exportWidth: undefined }),
    restore(saved) {
      const keep = { exportType: state.exportType, exportWidth: state.exportWidth };
      state = normalize(merge(defaults(), { ...saved, ...keep }));
      syncVisibility();
      syncInputs();
      applyFiles();
      save();
      render();
    },
  });
  history.bind({ undo: $('#undoBtn'), redo: $('#redoBtn') });

  /* ---------------------------------------------------------------------------
     Renderen
     ------------------------------------------------------------------------- */

  let lastInfo = {};
  let frameRequest = 0;
  let thumbTimer = 0;

  // Elke slide zijn eigen foto (of null); de uitsnede staat in de slide zelf
  const fileImg = (key) => (key && files.has(key) ? files.get(key).img : null);
  const renderEnv = (extra = {}) => ({
    ...env,
    crop: state.crop,
    slidePhotos: carousel().slides.map((s) => (s.photo ? fileImg(s.photoKey) : null)),
    ...extra,
  });
  // Het beeld waar de foto-knoppen nu over gaan
  const activePhoto = () => (isCarousel() ? (slidePhotoOn() ? fileImg(activeSlide().photoKey) : null) : env.photo);

  function render() {
    cancelAnimationFrame(frameRequest);
    frameRequest = requestAnimationFrame(() => {
      const fmt = T.FORMATS[state.format];
      el.design.style.setProperty('--ar', String(fmt.w / fmt.h));
      // Scherp op elk scherm: zoveel canvaspixels als het scherm laat zien (ook bij 150% of retina)
      lastInfo = T.renderPost(el.canvas, state, renderEnv(), { scale: PM.previewScale(el.canvas, fmt.w) });
      el.canvas.dataset.designW = String(lastInfo.width);
      el.canvas.dataset.designH = String(lastInfo.height);
      $$('[data-for-format]').forEach((n) => { n.hidden = n.dataset.forFormat !== state.format; });
      el.canvas.classList.toggle('can-pan', !!lastInfo.photo);
      const w = Number(state.exportWidth) || 1080;
      el.dimPill.textContent = `${w} × ${Math.round((fmt.h * w) / fmt.w)} px`;
      el.tplPill.textContent = isCarousel()
        ? `${TEMPLATE_NAMES.carousel} · slide ${carousel().active + 1}/${carousel().slides.length}`
        : TEMPLATE_NAMES[state.template];
      syncPhotoPrompt();
      syncRegions();
      syncWarning();
      syncPhotoCheck();
      syncSafeZone();
      syncDocName();
      syncExport();
    });
    clearTimeout(thumbTimer);
    thumbTimer = setTimeout(renderThumbs, 160);
  }

  // Miniaturen tonen elk template met jouw inhoud, in het gekozen formaat
  // (een story staat rechtop in het vakje, niet als vierkant), zonder badge
  const thumbBuffer = document.createElement('canvas');
  function renderThumbs() {
    const fmt = T.FORMATS[state.format];
    const dpr = window.devicePixelRatio || 1;
    for (const canvas of $$('[data-thumb]')) {
      // Vierkant vakje, scherp op dit scherm (minstens 240 px)
      const size = Math.max(240, Math.round(canvas.getBoundingClientRect().width * dpr));
      if (canvas.width !== size) { canvas.width = size; canvas.height = size; }
      const scale = Math.min(size / fmt.w, size / fmt.h);
      T.renderPost(thumbBuffer, { ...state, template: canvas.dataset.thumb, badge: false }, renderEnv(), { scale });
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#edf3f7';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(thumbBuffer, (canvas.width - thumbBuffer.width) / 2, (canvas.height - thumbBuffer.height) / 2);
    }
    if (isCarousel()) renderStrip();
  }

  function renderStrip() {
    const slides = carousel().slides;
    const fmt = T.FORMATS[state.format];
    const items = $$('.strip__item', el.strip);
    slides.forEach((_, i) => {
      let btn = items[i];
      if (!btn) {
        btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'strip__item';
        btn.appendChild(document.createElement('canvas'));
        btn.addEventListener('click', () => selectSlide(Number(btn.dataset.index)));
        el.strip.appendChild(btn);
      }
      btn.dataset.index = String(i);
      btn.setAttribute('aria-label', `Slide ${i + 1}`);
      btn.setAttribute('aria-current', String(i === carousel().active));
      // Scherp op dit scherm: 4,5rem breed keer de pixeldichtheid (minstens 144 px)
      const px = Math.max(144, Math.round(72 * (window.devicePixelRatio || 1)));
      T.renderPost(btn.firstChild, { ...state, template: 'carousel' }, renderEnv({ slideIndex: i }), { scale: px / fmt.w });
    });
    items.slice(slides.length).forEach((b) => b.remove());
  }

  // Naam van je post in de appbalk: dezelfde samenvatting als "Verder werken" op het dashboard
  const draft = (window.PM_TOOLS || []).find((t) => t.id === 'insta');
  function syncDocName() {
    const sum = draft && draft.draft ? draft.draft.summary(state) : {};
    const title = String(sum.title || '').replace(/\*\*/g, '').replace(/\{klant\}/gi, state.data.case.client || 'klant').replace(/\s+/g, ' ').trim();
    el.docTitle.textContent = title || 'Nieuwe post';
    el.docTitle.title = title;
    el.docSub.textContent = sum.sub || '';
  }

  /* ---------------------------------------------------------------------------
     Klikken in de preview: elk deel van de post hoort bij een veld
     ------------------------------------------------------------------------- */

  // Regio uit templates.js -> naam in de preview, onderdeel en veld
  function regionTarget(key) {
    const t = state.template;
    const title = { overlay: ['kop', '#oTitle'], blog: ['titel', '#bTitle'], case: ['zin', '#cSentence'], carousel: ['titel', '#sTitle'] }[t];
    switch (key) {
      case 'title': return title && { label: title[0], section: 'tekst', field: title[1] };
      case 'subtitle': return { label: 'toelichting', section: 'tekst', field: '#oSub' };
      case 'cta': return { label: 'call-to-action', section: 'tekst', field: '#bCta' };
      case 'button': return { label: 'magenta blok', section: 'tekst', field: '#bButton' };
      case 'label': return { label: 'label', section: 'tekst', field: '#fLabel' };
      case 'client': return { label: 'klantnaam', section: 'tekst', field: '#cClient' };
      case 'logo': return { label: 'klantlogo', section: 'tekst', field: '#clientLogoBtn' };
      case 'result': return { label: 'resultaat', section: 'tekst', field: '#cValue' };
      case 'body': return { label: 'tekst', section: 'tekst', field: '#sBody' };
      case 'slide': return { label: 'slides', section: 'tekst', field: '#slideNav [aria-selected="true"]' };
      case 'decor': return { label: 'zeshoek', section: 'details', field: '#decorToggle' };
      case 'background': return { label: 'foto als achtergrond', section: 'foto', field: '#photoBgToggle' };
      case 'photo': return { label: activePhoto() ? 'foto · sleep om te verschuiven' : 'foto toevoegen', section: 'foto', photo: true };
      default: return null;
    }
  }

  function syncRegions() {
    const regions = (lastInfo.regions || []).map((r) => {
      const target = regionTarget(r.key);
      return target && { ...r, ...target };
    }).filter(Boolean);
    shell.setRegions(el.canvas, regions, pickRegion);
  }

  function pickRegion(r) {
    if (r.photo) {
      if (!activePhoto()) {
        pickPhoto();
        return;
      }
      // Foto aanklikken: het paneel met de uitsnede open, de focus blijft op de preview (pijltjes)
      shell.open('foto');
      flash(el.cropControls);
      return;
    }
    shell.reveal(r.section, r.field);
  }

  function flash(node) {
    if (!node) return;
    node.classList.remove('is-flash');
    void node.offsetWidth;
    node.classList.add('is-flash');
  }

  /* ---------------------------------------------------------------------------
     Meldingen: tekst te lang (welk veld), foto te klein, veilige zone
     ------------------------------------------------------------------------- */

  const FIELD_NAMES = {
    title: () => ({ overlay: 'de kop', blog: 'de titel', case: 'de zin', carousel: `de titel van slide ${carousel().active + 1}` }[state.template]),
    subtitle: () => 'de toelichting',
    cta: () => 'de call-to-action',
    result: () => 'de toelichting bij het resultaat',
    client: () => 'de klantnaam',
    body: () => `de tekst van slide ${carousel().active + 1}`,
  };
  let warningKey = null;

  function syncWarning() {
    const keys = (lastInfo.overflowKeys || []).filter((k) => FIELD_NAMES[k]);
    warningKey = keys[0] || (lastInfo.overflow ? 'title' : null);
    const name = warningKey && FIELD_NAMES[warningKey] ? FIELD_NAMES[warningKey]() : 'de tekst';
    const fit = PM.brand.textFit({ overflow: !!warningKey, name });
    el.warning.hidden = fit.level === 'ok';
    el.warningText.textContent = fit.message;
    el.warningBtn.textContent = `naar ${name.replace(/^de /, '')}`;
  }
  el.warningBtn.addEventListener('click', () => {
    const target = warningKey && regionTarget(warningKey === 'result' ? 'result' : warningKey);
    if (warningKey === 'result') shell.reveal('tekst', '#cLabel');
    else if (target) shell.reveal(target.section, target.field);
  });

  // Is de foto groot genoeg voor deze export? Vak en uitsnede komen uit de template
  function syncPhotoCheck() {
    const photoRegion = (lastInfo.regions || []).find((r) => r.key === 'photo');
    const img = activePhoto();
    const res = img && lastInfo.photo && photoRegion
      ? PM.brand.photoCheck(img.naturalWidth, img.naturalHeight, photoRegion.rect.w, photoRegion.rect.h, (Number(state.exportWidth) || 1080) / 1080, { zoom: crop().zoom })
      : { level: 'ok', message: '' };
    const warn = res.level !== 'ok';
    for (const node of [el.photoNote, el.photoStageNote]) {
      node.hidden = !warn;
      node.classList.toggle('notice-error', res.level === 'te-klein');
      node.classList.toggle('notice-warn', res.level !== 'te-klein');
    }
    el.photoNote.textContent = res.message;
    el.photoStageText.textContent = res.message;
  }
  $('#photoStageBtn').addEventListener('click', () => {
    shell.open('foto');
    if (el.photoCard.hidden) el.photoDrop.focus();
    else $('#photoReplace').focus();
  });

  // Veilige zone van een story: alleen in de preview, nooit in een download
  el.safeToggle.checked = PM.store.get(SAFE_KEY, true) !== false;
  function syncSafeZone() {
    el.safeZone.hidden = !(state.format === 'story' && el.safeToggle.checked);
  }
  el.safeToggle.addEventListener('change', () => {
    PM.store.set(SAFE_KEY, el.safeToggle.checked);
    syncSafeZone();
  });

  // Lege fotoplek: de preview zelf is de uploadknop, zoals een placeholder in Canva
  function syncPhotoPrompt() {
    const empty = needsPhoto() && !activePhoto();
    el.previewPhotoBtn.hidden = !empty;
    el.canvas.classList.toggle('needs-photo', empty);
    el.canvas.tabIndex = empty || lastInfo.photo ? 0 : -1;
    el.canvas.setAttribute('aria-label', empty
      ? 'Preview van de post. Druk op Enter om een foto te kiezen.'
      : lastInfo.photo ? 'Preview van de post. Verschuif de foto met de pijltjestoetsen.' : 'Preview van de post');
  }

  /* ---------------------------------------------------------------------------
     Velden <-> toestand
     ------------------------------------------------------------------------- */

  // Welk veld is de kop van dit template (voor de rondleiding)
  const HEADLINE = { overlay: '#oTitle', blog: '#bTitle', case: '#cClient', carousel: '#sTitle' };

  function syncVisibility() {
    for (const node of $$('[data-for]')) {
      node.hidden = !node.dataset.for.split(/\s+/).includes(state.template);
    }
    el.app.dataset.template = state.template;
    // Een onderdeel dat bij dit template niet bestaat: uit, met de reden erbij
    shell.enable('foto');
    if (state.template === 'photo') shell.disable('details', 'Standaard foto heeft geen details: foto en label zijn alles wat erop staat.');
    else shell.enable('details');
    // De rondleiding wijst de kop van dit template aan
    $$('[data-tour="kop"]').forEach((n) => n.removeAttribute('data-tour'));
    const head = HEADLINE[state.template] && $(HEADLINE[state.template]);
    if (head) head.closest('.field').dataset.tour = 'kop';
  }

  function syncInputs() {
    const data = current();
    for (const input of $$('[data-bind]', el.editor)) {
      const value = getPath(data, input.dataset.bind);
      if (input.type === 'checkbox') input.checked = !!value;
      else if (input.type === 'radio') input.checked = input.value === value;
      else input.value = value == null ? '' : String(value);
    }
    $$('input[name="template"]').forEach((r) => { r.checked = r.value === state.template; });
    $$('input[name="format"]').forEach((r) => { r.checked = r.value === state.format; });
    $$('input[name="exportType"]').forEach((r) => { r.checked = r.value === state.exportType; });
    $$('input[name="dest"]').forEach((r) => { r.checked = Number(r.value) === Number(state.exportWidth); });
    el.dot.checked = state.dot !== false;
    el.badge.checked = !!state.badge;
    syncSlides();
    syncCrop();
    syncLabelChips();
    toolbar.refresh();
  }

  function syncCrop() {
    $('#cropZoom').value = String(Math.round(crop().zoom * 100));
    syncOutputs();
  }

  function syncOutputs() {
    $('#cropZoomVal').textContent = `${Math.round(crop().zoom * 100)}%`;
    $('#oStrengthVal').textContent = `${state.data.overlay.strength}%`;
    // Zonder kop en toelichting heeft de foto geen verloop: de schuif doet dan niets
    const noText = !T.hasText(state.data.overlay.title, state.data.overlay.subtitle);
    $('#oStrength').disabled = noText;
    $('#oStrengthNone').hidden = !noText;
  }

  // Snelkeuze voor het label: de labels die Pure Minds gebruikt
  function syncLabelChips() {
    const value = String(el.label.value || '').trim().toLowerCase();
    $$('[data-label-chip]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.labelChip === value)));
  }
  $$('[data-label-chip]').forEach((b) => b.addEventListener('click', () => {
    el.label.value = b.dataset.labelChip;
    el.label.dispatchEvent(new Event('input', { bubbles: true }));
    el.label.focus();
  }));

  el.editor.addEventListener('submit', (e) => e.preventDefault());

  el.editor.addEventListener('input', (e) => {
    const input = e.target;
    if (input.dataset.bind) {
      let value = input.value;
      if (input.type === 'checkbox') value = input.checked;
      else if (input.type === 'range') value = Number(value);
      else if (input.type === 'radio' && !input.checked) return;
      setPath(current(), input.dataset.bind, value);
      syncOutputs();
      if (input === el.label) syncLabelChips();
      changed(`${state.template}.${input.dataset.bind}`);
    } else if (input.dataset.crop) {
      crop()[input.dataset.crop] = Number(input.value) / 100;
      syncOutputs();
      changed('zoom');
    }
  });

  // Radio's en checkboxes vuren 'change'; niet alle browsers ook 'input'
  el.editor.addEventListener('change', (e) => {
    const input = e.target;
    if (input.name === 'template' && input.checked) {
      state.template = input.value;
      syncVisibility();
      syncInputs();
      changed(null);
    } else if (input.name === 'format' && input.checked) {
      state.format = input.value;
      changed(null);
    } else if (input === el.dot) {
      state.dot = input.checked;
      changed(null);
    } else if (input.dataset.bind && (input.type === 'checkbox' || input.type === 'radio')) {
      if (input.type === 'radio' && input.checked) setPath(current(), input.dataset.bind, input.value);
      if (input.type === 'checkbox') setPath(current(), input.dataset.bind, input.checked);
      if (input.dataset.bind === 'photoBg' && input.checked && !env.photo) toast('Kies hieronder een foto: hij komt donker achter de case.');
      changed(null);
    }
  });

  // Elke wijziging: een stap in de geschiedenis, opslaan en opnieuw tekenen
  function changed(key) {
    history.commit(key);
    save();
    if (lib) lib.touch();
    if (aiSaver) aiSaver.touch();
    render();
  }

  // Emerce 100-badge: de schakelaar staat in de kop van de preview (buiten het
  // formulier) en geldt voor elke post. Bij aanzetten zeggen waar hij komt:
  // in een carousel zie je hem alleen op de laatste slide
  el.badge.addEventListener('change', () => {
    state.badge = el.badge.checked;
    changed(null);
    if (state.badge) toast(`Emerce 100-badge staat aan: klein linksonder${isCarousel() ? ' op de laatste slide' : ' in de post'}.`);
  });

  /* ---------------------------------------------------------------------------
     Carousel-slides
     ------------------------------------------------------------------------- */

  function syncSlides() {
    const c = carousel();
    const slide = c.slides[c.active];
    el.slideNav.textContent = '';
    c.slides.forEach((s, i) => {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = `slide-tab${s.last ? ' is-last' : ''}`;
      tab.textContent = String(i + 1).padStart(2, '0');
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(i === c.active));
      tab.setAttribute('aria-label', `Slide ${i + 1}${s.last ? ' (laatste slide)' : ''}`);
      tab.addEventListener('click', () => selectSlide(i));
      el.slideNav.appendChild(tab);
    });
    if (c.slides.length < 20) {
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'slide-tab slide-tab--add';
      add.textContent = '+';
      add.title = 'Slide toevoegen';
      add.setAttribute('aria-label', 'Slide toevoegen');
      add.addEventListener('click', addSlide);
      el.slideNav.appendChild(add);
    }
    el.slideNo.textContent = `slide ${c.active + 1} van ${c.slides.length}`;
    el.sTitle.value = slide.title;
    el.sBody.value = slide.body;
    el.sNumbered.checked = slide.numbered !== false;
    $$('[data-slide-photo]').forEach((b) => { b.checked = !!slide.photo; });
    $$('input[name="slidePhotoStyle"]').forEach((r) => { r.checked = r.value === slide.photoStyle; });
    $('#sDarken').value = String(slide.darken);
    $('#sDarkenVal').textContent = `${slide.darken}%`;
    $$('[data-slide-no]').forEach((n) => { n.textContent = `slide ${c.active + 1}`; });
    syncPhotoUI();
    syncCrop();
    $('#slideLeft').disabled = c.active === 0;
    $('#slideRight').disabled = c.active === c.slides.length - 1;
    $('#slideDel').disabled = c.slides.length === 1;
  }

  // Na elke wijziging in de volgorde: laatste slide opnieuw bepalen
  function slidesChanged() {
    syncLast();
    syncSlides();
    changed(null);
  }

  function selectSlide(i) {
    const c = carousel();
    c.active = Math.min(Math.max(0, i), c.slides.length - 1);
    syncSlides();
    changed(null);
  }

  function addSlide() {
    const c = carousel();
    c.slides.splice(c.active + 1, 0, slideOf());
    c.active += 1;
    slidesChanged();
    el.sTitle.focus();
  }

  el.sTitle.addEventListener('input', (e) => {
    e.stopPropagation();
    carousel().slides[carousel().active].title = el.sTitle.value;
    changed(`slide.${carousel().active}.title`);
  });
  el.sBody.addEventListener('input', (e) => {
    e.stopPropagation();
    carousel().slides[carousel().active].body = el.sBody.value;
    changed(`slide.${carousel().active}.body`);
  });

  el.sNumbered.addEventListener('change', (e) => {
    e.stopPropagation();
    carousel().slides[carousel().active].numbered = el.sNumbered.checked;
    changed(null);
  });

  // Foto op deze slide: dezelfde schakelaar bij Tekst en bij Foto
  $$('[data-slide-photo]').forEach((box) => box.addEventListener('change', (e) => {
    e.stopPropagation();
    const slide = activeSlide();
    slide.photo = box.checked;
    syncSlides();
    changed(null);
    if (slide.photo && !fileImg(slide.photoKey) && box.closest('[data-section="tekst"]')) {
      toast(`Foto staat aan op slide ${carousel().active + 1}.`, false, { label: 'foto kiezen', run: pickPhoto });
    }
  }));
  $$('input[name="slidePhotoStyle"]').forEach((r) => r.addEventListener('change', (e) => {
    e.stopPropagation();
    if (!r.checked) return;
    activeSlide().photoStyle = r.value;
    syncPhotoUI();
    changed(null);
  }));
  $('#sDarken').addEventListener('input', (e) => {
    e.stopPropagation();
    const slide = activeSlide();
    slide.darken = Number(e.target.value);
    $('#sDarkenVal').textContent = `${slide.darken}%`;
    changed(`slide.${carousel().active}.darken`);
  });

  function moveSlide(delta) {
    const c = carousel();
    const to = c.active + delta;
    if (to < 0 || to >= c.slides.length) return;
    const [slide] = c.slides.splice(c.active, 1);
    c.slides.splice(to, 0, slide);
    c.active = to;
    slidesChanged();
  }
  $('#slideLeft').addEventListener('click', () => moveSlide(-1));
  $('#slideRight').addEventListener('click', () => moveSlide(1));
  $('#slideDup').addEventListener('click', () => {
    const c = carousel();
    if (c.slides.length >= 20) return;
    c.slides.splice(c.active + 1, 0, slideOf(c.slides[c.active]));
    c.active += 1;
    slidesChanged();
  });
  $('#slideDel').addEventListener('click', () => {
    const c = carousel();
    if (c.slides.length === 1) return;
    c.slides.splice(c.active, 1);
    c.active = Math.min(c.active, c.slides.length - 1);
    slidesChanged();
    toast('Slide verwijderd.', false, { label: 'ongedaan maken', run: () => history.undo() });
  });

  /* ---------------------------------------------------------------------------
     Foto en klantlogo: per stuk in IndexedDB, onder de sleutel uit de toestand
     ------------------------------------------------------------------------- */

  const files = new Map();   // sleutel -> { file, img, url }

  function trackFile(key) {
    const list = PM.store.get(FILES_KEY, []);
    if (!list.includes(key)) PM.store.set(FILES_KEY, [...list, key]);
  }

  // Bij het laden: alleen bewaren wat de post nu gebruikt (de geschiedenis is dan leeg)
  function cleanupFiles() {
    const keep = [state.photoKey, state.logoKey, ...carousel().slides.map((s) => s.photoKey)].filter(Boolean);
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

  // Foto en logo uit de toestand zichtbaar maken (na laden, wisselen of ongedaan maken)
  async function applyFiles() {
    const [photo, logo] = await Promise.all([
      loadFile(state.photoKey),
      loadFile(state.logoKey),
      ...carousel().slides.map((s) => loadFile(s.photoKey)),
    ]);
    env.photo = photo ? photo.img : null;
    env.clientLogo = logo ? logo.img : null;
    // Een logo met doorzichtige achtergrond gaat in de PDF als PNG, niet als JPEG
    if (logo && /png|webp|gif/i.test(logo.file.type || '')) logo.img.dataset.pdfType = 'PNG';
    syncPhotoUI();
    syncLogoUI(logo);
    render();
  }

  // Het fotopaneel: de foto van de post, of in een carousel die van de slide die openstaat.
  // Staat de foto op die slide uit, dan alleen de schakelaar
  function syncPhotoUI() {
    const key = photoKey();
    const entry = key && files.has(key) ? files.get(key) : null;
    const off = isCarousel() && !activeSlide().photo;
    const has = !!entry && !off;
    el.photoField.hidden = off;
    el.slidePhotoStyle.hidden = !isCarousel() || off;
    el.slidePhotoHint.hidden = !off;
    el.slideDarken.hidden = !isCarousel() || off || activeSlide().photoStyle !== 'achtergrond';
    el.photoCard.hidden = !has;
    el.photoDrop.hidden = has || off;
    el.cropControls.hidden = !has;
    el.cropHint.hidden = !has;
    if (!has) {
      el.photoInput.value = '';
      return;
    }
    el.photoThumb.style.backgroundImage = `url("${entry.url}")`;
    el.photoName.textContent = entry.file.name || 'foto';
    el.photoSize.textContent = `${entry.img.naturalWidth} × ${entry.img.naturalHeight} px${entry.file.size ? ` · ${PM.formatSize(entry.file.size)}` : ''}`;
  }

  function syncLogoUI(entry) {
    el.clientLogoThumb.style.backgroundImage = entry ? `url("${entry.url}")` : '';
    el.clientLogoBtn.classList.toggle('has-file', !!entry);
    el.clientLogoName.textContent = entry ? entry.file.name || 'klantlogo' : 'logo kiezen';
    el.clientLogoClear.hidden = !entry;
  }

  async function addFile(file, kind) {
    try {
      const { img, url } = await PM.readImage(file);
      const key = `insta:${kind}:${PM.uid()}`;
      files.set(key, { file, img, url });
      PM.idb.set(key, file);
      trackFile(key);
      return key;
    } catch (err) {
      toast(err.message, true);
      return null;
    }
  }

  async function setPhoto(file) {
    const key = await addFile(file, 'photo');
    if (!key) return;
    if (isCarousel()) {
      // In een carousel hoort de foto bij de slide die openstaat; kiezen zet hem daar aan
      const slide = activeSlide();
      slide.photoKey = key;
      slide.photo = true;
      slide.crop = { ...CROP };
      syncSlides();
    } else {
      state.photoKey = key;
      state.crop = { ...CROP };
    }
    // Pure case: een foto is er om als achtergrond te gebruiken
    if (state.template === 'case' && !state.data.case.photoBg) {
      state.data.case.photoBg = true;
      $('#photoBgToggle').checked = true;
      toast('Foto staat als donkere achtergrond achter de case.');
    }
    syncCrop();
    await applyFiles();
    changed('foto');
    if (window.PM.tour) PM.tour.signal('foto');
  }

  function clearPhoto() {
    if (isCarousel()) activeSlide().photoKey = '';
    else state.photoKey = '';
    applyFiles();
    changed('foto');
    toast('Foto verwijderd.', false, { label: 'ongedaan maken', run: () => history.undo() });
  }

  const pickPhoto = () => el.photoInput.click();
  el.photoDrop.addEventListener('click', pickPhoto);
  el.photoDrop.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      pickPhoto();
    }
  });
  el.previewPhotoBtn.addEventListener('click', pickPhoto);
  $('#photoReplace').addEventListener('click', pickPhoto);
  $('#photoClear').addEventListener('click', clearPhoto);
  el.photoInput.addEventListener('change', () => {
    if (el.photoInput.files[0]) setPhoto(el.photoInput.files[0]);
    el.photoInput.value = '';
  });

  $('#cropReset').addEventListener('click', () => {
    Object.assign(crop(), CROP);
    syncCrop();
    changed(null);
  });

  async function setClientLogo(file) {
    const key = await addFile(file, 'logo');
    if (!key) return;
    state.logoKey = key;
    await applyFiles();
    changed('logo');
  }

  el.clientLogoBtn.addEventListener('click', () => el.clientLogoInput.click());
  el.clientLogoInput.addEventListener('change', () => {
    const file = el.clientLogoInput.files[0];
    el.clientLogoInput.value = '';
    if (file) setClientLogo(file);
  });
  el.clientLogoClear.addEventListener('click', () => {
    state.logoKey = '';
    applyFiles();
    changed('logo');
  });

  // Slepen: foto overal op het podium of op de uploadzone, logo op de logoknop
  PM.bindDrop(el.photoDrop, setPhoto);
  PM.bindDrop(el.stage, setPhoto, el.stage);
  PM.bindDrop(el.clientLogoBtn, setClientLogo);
  PM.preventStrayDrops();

  // Plakken vanaf het klembord (alleen een afbeelding; tekst plakt gewoon in het veld)
  document.addEventListener('paste', (e) => {
    const item = Array.from(e.clipboardData ? e.clipboardData.items : []).find((i) => i.type.startsWith('image/'));
    if (!item) return;
    e.preventDefault();
    setPhoto(item.getAsFile());
  });

  // Uitsnede verschuiven door in de preview te slepen (een klik zonder slepen opent het veld)
  let pan = null;
  el.canvas.addEventListener('pointerdown', (e) => {
    if (!lastInfo.photo) return;
    pan = { x: e.clientX, y: e.clientY, fx: crop().fx, fy: crop().fy, moved: false };
    el.canvas.setPointerCapture(e.pointerId);
    el.canvas.classList.add('is-panning');
  });
  el.canvas.addEventListener('pointermove', (e) => {
    if (!pan || !lastInfo.photo) return;
    const k = lastInfo.width / el.canvas.getBoundingClientRect().width;   // ontwerppixels per schermpixel
    const { overflowX, overflowY } = lastInfo.photo;
    const c = crop();
    if (overflowX > 0.5) c.fx = Math.min(1, Math.max(0, pan.fx - ((e.clientX - pan.x) * k) / overflowX));
    if (overflowY > 0.5) c.fy = Math.min(1, Math.max(0, pan.fy - ((e.clientY - pan.y) * k) / overflowY));
    pan.moved = pan.moved || c.fx !== pan.fx || c.fy !== pan.fy;
    render();
  });
  const endPan = () => {
    if (!pan) return;
    const moved = pan.moved;
    pan = null;
    el.canvas.classList.remove('is-panning');
    if (moved) {
      history.seal();
      changed(null);
    }
  };
  el.canvas.addEventListener('pointerup', endPan);
  el.canvas.addEventListener('pointercancel', endPan);

  // Met het toetsenbord: Enter kiest een foto, pijltjes verschuiven hem
  el.canvas.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && needsPhoto() && !activePhoto()) {
      e.preventDefault();
      pickPhoto();
      return;
    }
    const dir = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
    if (!dir || !lastInfo.photo) return;
    e.preventDefault();
    const step = e.shiftKey ? 0.1 : 0.02;
    const c = crop();
    c.fx = Math.min(1, Math.max(0, c.fx + dir[0] * step));
    c.fy = Math.min(1, Math.max(0, c.fy + dir[1] * step));
    changed('verschuiven');
  });

  /* ---------------------------------------------------------------------------
     Export: de knop in de appbalk downloadt meteen; het pijltje zegt wat je krijgt
     ------------------------------------------------------------------------- */

  // Wat de knop oplevert (PNG, JPG, zip of PDF) en de zin erbij: js/insta/export.js
  const Export = window.PMInstaExport;
  const exportPlan = (only = null) => Export.plan({
    carousel: isCarousel(),
    slides: carousel().slides.length,
    fmt: T.FORMATS[state.format],
    width: state.exportWidth,
    type: state.exportType,
    only,
  });

  function syncExport() {
    const p = exportPlan();
    el.exportSum.textContent = p.summary;
    el.downloadBtn.title = `Download: ${p.summary} (Ctrl + S)`;
    // Een LinkedIn-carousel is altijd de PDF voor LinkedIn: dan staat PDF aan en de rest uit;
    // je eigen keuze blijft bewaard voor als je weer een ander kanaal kiest
    $$('input[name="exportType"]').forEach((r) => {
      r.disabled = p.linkedin && r.value !== 'pdf';
      r.checked = p.linkedin ? r.value === 'pdf' : r.value === state.exportType;
    });
    el.exportNote.textContent = p.note;
  }

  $$('input[name="exportType"]').forEach((r) => r.addEventListener('change', () => {
    if (!r.checked) return;
    state.exportType = r.value;
    syncExport();
    save();
  }));
  $$('input[name="dest"]').forEach((r) => r.addEventListener('change', () => {
    if (!r.checked) return;
    state.exportWidth = Number(r.value);
    save();
    render();
  }));

  const slug = PM.slug;

  function fileName(slideIndex, w, h) {
    const d = current();
    let subject = d.title || d.client || d.label;
    if (isCarousel()) subject = carousel().slides[0].title;
    const parts = ['pureminds', state.template, slug(subject)];
    if (slideIndex != null) parts.push(`slide-${String(slideIndex + 1).padStart(2, '0')}`);
    parts.push(`${w}x${h}`);
    return `${parts.filter(Boolean).join('-')}.${state.exportType === 'jpg' ? 'jpg' : 'png'}`;
  }

  async function makeBlob(slideIndex, type) {
    await fontsReady;
    const scale = (Number(state.exportWidth) || 1080) / 1080;
    const canvas = document.createElement('canvas');
    T.renderPost(canvas, state, renderEnv(slideIndex != null ? { slideIndex } : {}), { scale });
    const mime = (type || state.exportType) === 'jpg' ? 'image/jpeg' : 'image/png';
    let blob;
    try {
      blob = await PM.canvasToBlob(canvas, mime, 0.92);
    } catch (err) {
      throw err.name === 'SecurityError' ? PM.fileProtocolError() : err;
    }
    return { blob, name: fileName(slideIndex, canvas.width, canvas.height) };
  }

  const saveFile = ({ blob, name }) => PM.saveBlob(blob, name);
  const run = PM.run;
  // Een download is klaar: de rondleiding kan verder
  // Een download is klaar: de rondleiding kan verder, en een nieuw ontwerp gaat (stil) in de bieb
  const downloaded = () => {
    if (window.PM.tour) PM.tour.signal('download');
    if (lib) lib.autoSave();
  };

  // Het lege fotovak ("sleep hier je foto") gaat mee in een download, net als in de preview
  const emptyPhotoSlot = () => (isCarousel()
    ? carousel().slides.some((s) => s.photo && !fileImg(s.photoKey))
    : !env.photo && (lastInfo.regions || []).some((r) => r.key === 'photo'));

  function downloadSingle(button, index) {
    return run(button, 'bezig…', async () => {
      const file = await makeBlob(index);
      saveFile(file);
      if (emptyPhotoSlot()) toast(`Gedownload: ${file.name}. Er staat nog geen foto in: het lege fotovak gaat mee.`, false, { label: 'foto toevoegen', run: pickPhoto });
      else toast(`Gedownload: ${file.name}`);
      downloaded();
      return 'gedownload';
    });
  }

  // Alle slides in één zip: geen reeks losse downloads die de browser blokkeert
  function downloadZip(button) {
    return run(button, 'slides maken…', async (progress) => {
      const JSZip = await PM.libs.jszip();
      const zip = new JSZip();
      const slides = carousel().slides;
      for (let i = 0; i < slides.length; i++) {
        progress(`slide ${i + 1} van ${slides.length}…`);
        const file = await makeBlob(i);
        zip.file(file.name, file.blob);
      }
      progress('inpakken…');
      const blob = await zip.generateAsync({ type: 'blob' });
      const name = `pureminds-carousel-${slug(slides[0].title) || 'slides'}.zip`;
      saveFile({ blob, name });
      toast(`${slides.length} slides gedownload in ${name}`);
      downloaded();
      return `${slides.length} slides gedownload`;
    });
  }

  // De PDF zelf (lagen die Canva los houdt) bouwt js/insta/pdf.js; -> { blob, elements }
  async function buildPdf(pages, title, progress) {
    const logo = env.clientLogo ? files.get(state.logoKey) : null;
    return window.PMInstaPdf.build({
      pages: pages.map((p) => ({ state: p.state, env: renderEnv(p.env) })),
      title,
      clientLogoSvg: logo ? await window.PMInstaPdf.svgText(logo.file) : null,
      progress,
    });
  }

  // Onderwerp van de post voor de bestandsnaam en de titel van de PDF
  function postSubject() {
    const d = current();
    const subject = isCarousel() ? carousel().slides[0].title : d.title || d.client || d.label;
    return String(subject || '').replace(/\*\*/g, '').trim();
  }

  // PDF: één pagina voor een post of één slide, een pagina per slide voor een carousel
  function downloadPdf(button, only = null) {
    return run(button, 'pdf maken…', async (progress) => {
      const slides = carousel().slides;
      const indexes = isCarousel() ? (only == null ? slides.map((_, i) => i) : [only]) : [null];
      const pages = indexes.map((i) => (i == null
        ? { state, env: {} }
        : { state: { ...state, template: 'carousel' }, env: { slideIndex: i } }));
      const title = isCarousel() ? String(slides[0].title || 'carousel').replace(/\*\*/g, '') : postSubject() || 'Pure Minds-post';
      const { blob, elements } = await buildPdf(pages, title, progress);
      let name;
      if (!isCarousel()) name = `${['pureminds', state.template, slug(postSubject())].filter(Boolean).join('-')}.pdf`;
      else if (only == null) name = `pureminds-carousel-${slug(title) || 'slides'}.pdf`;
      else name = `pureminds-carousel-${slug(title) || 'slides'}-slide-${String(only + 1).padStart(2, '0')}.pdf`;
      saveFile({ blob, name });
      if (elements > window.PMPdfCanvas.CANVA_LIMIT * 0.95) {
        toast(`Deze PDF heeft ${elements} onderdelen; Canva importeert er hoogstens ${window.PMPdfCanvas.CANVA_LIMIT}. Exporteer de carousel in twee delen.`, true);
      } else if (emptyPhotoSlot()) {
        toast(`PDF gedownload: ${name}. Er staat nog geen foto in: het lege fotovak gaat mee.`, false, { label: 'foto toevoegen', run: pickPhoto });
      } else {
        // Wie PDF al gekozen had, ziet de uitleg in de download-opties niet: hier kort de weg naar Canva
        toast(`${pages.length > 1 ? `PDF met ${pages.length} slides gedownload` : 'PDF gedownload'}: ${name}. In Canva: sleep hem op de startpagina.`);
      }
      downloaded();
      return 'pdf gedownload';
    });
  }

  function primaryAction(button = el.downloadBtn) {
    const kind = exportPlan().kind;
    if (kind === 'pdf') return downloadPdf(button);
    return kind === 'zip' ? downloadZip(button) : downloadSingle(button, null);
  }

  el.downloadBtn.addEventListener('click', () => primaryAction(el.downloadBtn));
  el.downloadBtn2.addEventListener('click', async () => {
    await primaryAction(el.downloadBtn2);
    shell.closePopover();
  });
  el.slideBtn.addEventListener('click', () => {
    const index = carousel().active;
    if (exportPlan(index).kind === 'pdf') downloadPdf(el.slideBtn, index);
    else downloadSingle(el.slideBtn, index);
  });

  el.copyBtn.addEventListener('click', () => run(el.copyBtn, 'kopiëren…', async () => {
    if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
      throw new Error('Kopiëren naar het klembord werkt niet in deze browser. Gebruik download.');
    }
    const index = isCarousel() ? carousel().active : null;
    // Klembord accepteert alleen PNG
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': makeBlob(index, 'png').then((f) => f.blob) })]);
    return 'gekopieerd';
  }));

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      primaryAction(el.downloadBtn);
    }
  });

  /* ---------------------------------------------------------------------------
     Overig
     ------------------------------------------------------------------------- */

  // Alles wissen gaat meteen, met "ongedaan maken" in de melding in plaats van
  // een vraag vooraf. Foto en logo blijven in IndexedDB tot de volgende keer laden
  $('#resetBtn').addEventListener('click', () => {
    const keep = { exportType: state.exportType, exportWidth: state.exportWidth };
    state = normalize({ ...defaults(), ...keep });
    syncLast();
    syncVisibility();
    syncInputs();
    applyFiles();
    changed(null);
    if (lib) lib.detach();
    if (aiSaver) aiSaver.stop();
    syncSocial();
    toast('Alles gewist; je begint opnieuw met de voorbeelden.', false, { label: 'ongedaan maken', run: () => history.undo() });
  });

  // Logo en badge: het bestand via een server; bij file:// de ingebedde kopie,
  // anders blokkeert de browser de export (zie scripts/build-brand-data.js)
  env.logo = PM.brandImage('logoWhite', render);
  env.badge = PM.brandImage('badgeWhite', render);

  // Canvas kent alleen fonts die al geladen zijn: eerst laden, dan opnieuw tekenen
  const fontsReady = PM.fontsReady;
  fontsReady.then(render);
  // Andere maat of pixeldichtheid (venster, paneel, zoomen, ander scherm): opnieuw tekenen, scherp
  PM.watchPreview(el.canvas, render);
  // De miniaturen meten hun vakje: pas als het paneel Template open is, weten ze hoe groot dat is
  shell.onChange(({ id }) => { if (id === 'template') requestAnimationFrame(renderThumbs); });

  syncLast();
  syncVisibility();
  syncInputs();
  history.clear();
  render();

  // Bieb: dit ontwerp 14 dagen bewaren om het later aan te passen. Openen zet de hele post
  // terug (één stap om ongedaan te maken); je downloadinstellingen blijven zoals ze staan
  lib = PM.library ? PM.library.attach({
    tool: 'insta',
    getState: () => state,
    fileKeys: (s) => [s.photoKey, s.logoKey, ...(((s.data || {}).carousel || {}).slides || []).map((x) => x && x.photoKey)],
    async apply(saved, keys) {
      keys.forEach(trackFile);
      if (aiSaver) aiSaver.stop();
      const keep = { exportType: state.exportType, exportWidth: state.exportWidth };
      state = normalize({ ...merge(defaults(), saved), ...keep });
      syncLast();
      syncVisibility();
      syncInputs();
      await applyFiles();
      changed(null);
      syncSocial();
    },
    // De post, of de eerste slide van een carousel, zonder badge
    thumb() {
      const c = document.createElement('canvas');
      T.renderPost(c, { ...state, badge: false }, renderEnv({ slideIndex: 0 }), { scale: 240 / 1080 });
      return c;
    },
    undo: () => history.undo(),
    close: () => shell.closePopover(),
    openId: start.bieb,
  }) : null;

  /* ---------------------------------------------------------------------------
     AI: ruwe content in, post eruit (schema: vul_post in uploads/lib/ai.js)
     Caption, hashtags en de fotosuggestie staan in state.social: niet op het
     plaatje, wel bij de post (bieb, ongedaan maken), met kopieerknoppen
     ------------------------------------------------------------------------- */

  const AI_TEMPLATES = { overlay: 'foto met tekst', blog: 'blog', case: 'case', carousel: 'carousel' };
  const txt = (v) => (typeof v === 'string' ? v.trim() : '');
  const tags = (v) => (Array.isArray(v) ? v : String(v || '').split(/[\s,]+/))
    .map((t) => txt(t).replace(/^#*/, '#').replace(/[^#\p{L}\p{N}_]/gu, ''))
    .filter((t) => t.length > 1)
    .slice(0, 15)
    .join(' ');

  // De post in de vorm van het schema (om aan te passen)
  function toAI() {
    const t = state.template === 'photo' ? 'overlay' : state.template;
    const d = state.data;
    const out = { template: t, label: (d[t] || {}).label || '', caption: state.social.caption, hashtags: state.social.hashtags.split(/\s+/).filter(Boolean), fotoIdee: state.social.photoIdea };
    if (t === 'overlay') Object.assign(out, { titel: d.overlay.title, ondertitel: d.overlay.subtitle });
    if (t === 'blog') Object.assign(out, { titel: d.blog.title, onderwerp: d.blog.topic, cta: d.blog.cta, knop: d.blog.button });
    if (t === 'case') Object.assign(out, { klant: d.case.client, diensten: d.case.services.filter(Boolean), zin: d.case.sentence, resultaat: d.case.resultValue, resultaatTekst: d.case.resultLabel });
    if (t === 'carousel') {
      out.slides = d.carousel.slides.map((s, i, all) => ({
        soort: i === all.length - 1 ? 'afsluiter' : s.numbered ? 'les' : 'hook',
        titel: s.title,
        tekst: s.body,
      }));
    }
    return out;
  }

  // Eén carousel-slide uit de AI; foto en uitsnede van de slide die er stond blijven
  // Een les krijgt zijn nummer van de tool (01, 02): een "1." of "2)" van de AI ervoor eraf
  const slideFromAI = (x, prev) => ({
    ...(prev || slideOf({})),
    title: x && x.soort === 'les' ? txt(x.titel).replace(/^\d{1,2}\s*[.):-]\s+/, '') : txt(x && x.titel),
    body: txt(x && x.tekst),
    numbered: !!(x && x.soort === 'les'),
  });

  function applyAI(data, { mode, target }) {
    const d = data && typeof data === 'object' ? data : {};
    const c = carousel();
    if (target != null) {
      if (!c.slides[target]) return;
      c.slides[target] = slideFromAI(d, c.slides[target]);
      c.active = target;
    } else {
      const t = AI_TEMPLATES[d.template] ? d.template : (state.template === 'photo' ? 'overlay' : state.template);
      state.template = t;
      const data_ = state.data[t];
      if (txt(d.label)) data_.label = txt(d.label);
      if (t === 'overlay') Object.assign(data_, { title: txt(d.titel), subtitle: txt(d.ondertitel) });
      if (t === 'blog') {
        Object.assign(data_, { title: txt(d.titel) });
        if (txt(d.onderwerp)) data_.topic = txt(d.onderwerp);
        if (txt(d.cta)) data_.cta = txt(d.cta);
        if (txt(d.knop)) data_.button = txt(d.knop);
      }
      if (t === 'case') {
        const services = (Array.isArray(d.diensten) ? d.diensten : []).map(txt).filter(Boolean).slice(0, 3);
        while (services.length < 3) services.push('');
        Object.assign(data_, { client: txt(d.klant), services, resultValue: txt(d.resultaat), resultLabel: txt(d.resultaatTekst) });
        if (txt(d.zin)) data_.sentence = txt(d.zin);
      }
      if (t === 'carousel') {
        const list = (Array.isArray(d.slides) ? d.slides : []).slice(0, 20);
        if (list.length) {
          const old = mode === 'refine' ? c.slides : [];
          c.slides = list.map((x, i) => slideFromAI(x, old[i]));
          c.active = 0;
        }
      }
      if (txt(d.caption)) state.social.caption = txt(d.caption);
      if (d.hashtags) state.social.hashtags = tags(d.hashtags);
      if (typeof d.fotoIdee === 'string') state.social.photoIdea = txt(d.fotoIdee);
    }
    state = normalize(state);
    syncLast();
    syncVisibility();
    syncInputs();
    applyFiles();
    changed(null);
    syncSocial();
  }

  // Caption, hashtags en fotosuggestie in het paneel AI
  function syncSocial() {
    if (!ai) return;
    const box = ai.extras;
    if (!box.firstChild) {
      box.innerHTML = `<h3>Bij je post</h3>
<div class="field">
  <label class="label" for="aiCaption">Caption <i>voor Instagram of LinkedIn</i></label>
  <textarea class="input" id="aiCaption" rows="7" maxlength="2200" data-social="caption" placeholder="De tekst onder je post. De AI schrijft hem mee; je kunt hem ook zelf typen."></textarea>
</div>
<div class="field">
  <label class="label" for="aiTags">Hashtags</label>
  <input class="input" id="aiTags" maxlength="400" data-social="hashtags" placeholder="#onlinemarketing #googleads">
</div>
<div class="ai-copy"><button type="button" class="btn btn-outline btn-sm" data-social-copy>kopieer caption en hashtags</button></div>
<div class="field" data-photo-idea>
  <span class="label">Fotosuggestie</span>
  <p class="field-hint" data-photo-text></p>
</div>`;
      box.addEventListener('input', (e) => {
        const key = e.target.dataset.social;
        if (!key) return;
        state.social[key] = e.target.value;
        changed(`social.${key}`);
      });
      box.querySelector('[data-social-copy]').addEventListener('click', async () => {
        const text = [state.social.caption.trim(), state.social.hashtags.trim()].filter(Boolean).join('\n\n');
        if (!text) { toast('Er is nog geen caption.', true); return; }
        try {
          await navigator.clipboard.writeText(text);
          toast('Caption en hashtags gekopieerd: plak ze onder je post.');
        } catch (err) {
          toast('Kopiëren lukte niet. Selecteer de tekst en kopieer hem zelf.', true);
        }
      });
    }
    for (const input of box.querySelectorAll('[data-social]')) {
      if (document.activeElement !== input) input.value = state.social[input.dataset.social] || '';
    }
    box.querySelector('[data-photo-idea]').hidden = !state.social.photoIdea;
    box.querySelector('[data-photo-text]').textContent = state.social.photoIdea;
  }

  if (PM.ai) {
    aiSaver = PM.ai.keepSaved(lib);
    ai = PM.ai.panel($('[data-ai-panel]'), {
      tool: 'insta',
      format: 'insta',
      noun: 'post',
      current: toAI,
      target: () => (isCarousel() ? { index: carousel().active, label: `slide ${carousel().active + 1}` } : null),
      wishField: `<div class="field">
  <label class="label" for="aiTemplate">Template</label>
  <select class="input input--select" id="aiTemplate" data-ai-template>
    <option value="">laat de AI kiezen</option>
    ${Object.entries(AI_TEMPLATES).map(([id, name]) => `<option value="${id}">${name}</option>`).join('')}
  </select>
</div>`,
      wish: () => {
        const v = $('[data-ai-template]').value;
        return v ? `Gebruik het template ${v}.` : '';
      },
      wishPlaceholder: 'bijv. voor LinkedIn, met een vraag aan het eind',
      apply: applyAI,
      lib,
      saver: aiSaver,
      undo: () => history.undo(),
      autostart: !!start.ai,
      open: () => shell.open('ai'),
    });
    syncSocial();
    history.onChange(() => syncSocial());
    shell.onChange(({ id }) => { if (id === 'ai') { ai.refresh(); syncSocial(); } });
  }

  // Foto en klantlogo uit een vorige sessie terugzetten, dan oude bestanden opruimen
  if (state.photoKey) trackFile(state.photoKey);
  if (state.logoKey) trackFile(state.logoKey);
  carousel().slides.forEach((s) => { if (s.photoKey) trackFile(s.photoKey); });
  applyFiles().then(cleanupFiles);
})();
