/* =============================================================================
   presentation/app.js — Presentation Maker
   -----------------------------------------------------------------------------
   Houdt de presentatie bij (slides met layout, tekst, uitsnede en foto),
   koppelt die aan de velden en laat js/presentation/templates.js de slide,
   de miniaturen en de export tekenen. Tekst staat in localStorage, foto's in
   IndexedDB, zodat alles een herlaadbeurt overleeft.

   De editor is de gedeelde indeling (js/shared/shell.js): de rail (soort,
   bij een voorstel ook voorstel en prijzen, bij een positionering gegevens,
   en dan layout, inhoud, foto en presentatie), één paneel, de slide op het
   podium en daaronder de strook met slides. Tekstvelden tonen nadruk zoals
   hij is (richfield.js), met de werkbalk (toolbar.js) boven de slide. Klik
   op de slide op een tekst, een cel of de foto en je staat in het goede veld.

   Drie soorten (state.type), te kiezen bij Soort: een gewone presentatie,
   een voorstel (na het eerste gesprek) en een positionering (na het
   traject). Wisselen bewaart de andere in state.stash, met foto's en al,
   dus niets gaat verloren. Bij een voorstel en een positionering maakt het
   formulier (state.form: Voorstel en Prijzen, of Gegevens) de slides via
   een recept voor js/presentation/generator.js (voorstel.js en
   positionering.js, samen window.PMDecks). Elke wijziging in het formulier
   werkt de slides meteen bij en toont de slide die het veld maakt; wat je
   zelf op een slide aanpast, blijft staan (sync houdt per veld bij wat de
   generator schreef). De canvassen (waardepropositie, business model
   canvas) en de toelichting van een positionering vul je in op de slide
   zelf, bij Inhoud. Een slide uit het voorstel verwijderen zet die slide
   uit en parkeert hem (state.parked): zet je hem weer aan, dan komt hij
   terug zoals hij was, met logo, foto en eigen tekst. De positionering heeft
   een vaste opbouw (fixed): zijn slides verwijder je niet, alleen je eigen
   extra slides. Bovenaan het formulier
   staat wat nog ontbreekt ("Klaar om te versturen?"), en elke soort heeft
   een eigen rondleiding (PM_HELP.voorstel, PM_HELP.positionering). De Emerce
   100-badge (state.badge, schakelaar boven de slide) staat klein rechtsonder
   op elke slide.

   Ongedaan maken: PM.history over de hele presentatie (slides, volgorde,
   layouts, tekst, tabel, uitsnede, foto's). Elke foto staat in IndexedDB onder
   een eigen sleutel (slide.photoKey); een oude foto blijft bewaard zolang hij
   in de geschiedenis kan terugkomen en wordt pas bij de volgende keer laden
   opgeruimd. Vóór elke download controleert de tool op voorbeeldtekst,
   [invulplekken] en tekst die niet past (js/presentation/deck.js).
   ============================================================================= */
(function () {
  'use strict';

  const PM = window.PM;
  const S = window.PMSlides;
  const D = window.PMDeck;
  // Alleen nodig bij een voorstel of positionering: een gewone presentatie werkt ook als deze
  // bestanden niet laden. Een soort zonder recept (laadfout) is er dan niet
  const DECKS = window.PMDecks || {};
  const G = window.PMGenerator || null;
  const KEY = 'pm-presentation-v1';
  const FILES_KEY = 'pm-presentation-files-v1';   // alle fotosleutels in IndexedDB (om op te ruimen)
  const TOUR_KEY = 'pm-tour-presentation-v1';
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const toast = PM.toast;
  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  // Leeg, ook als er alleen nadruktekens staan
  const blankText = (v) => !String(v == null ? '' : v).replace(/\*\*/g, '').trim();

  const PHOTO_LAYOUTS = new Set(['title', 'split', 'closing']);
  const MAX_SLIDES = 40;
  const TYPES = ['regulier', 'voorstel', 'positionering'];
  // Per gegenereerde soort: de tabs in de rail, het paneel met het formulier en zijn elementen,
  // en hoe je hem noemt ("Uit het voorstel gehaald", "Terug in de positionering")
  const DECK_UI = {
    voorstel: {
      tabs: ['voorstel', 'prijzen'], panel: 'voorstel', panelName: 'Voorstel', klant: '#pKlant',
      check: '#pCheck', checkList: '#pCheckList', checkCount: '#pCheckCount',
      restore: '#pRestore', restoreText: '#pRestoreText', restoreBtn: '#pRestoreBtn',
      noun: 'het voorstel', newLabel: 'nieuw voorstel', go: 'naar voorstel',
    },
    positionering: {
      tabs: ['gegevens'], panel: 'gegevens', panelName: 'Gegevens', klant: '#psKlant',
      check: '#psCheck', checkList: '#psCheckList', checkCount: '#psCheckCount',
      // Een vaste opbouw: geen "zet terug"
      noun: 'de positionering', newLabel: 'nieuwe positionering', go: 'naar gegevens',
    },
  };
  // "Je voorstel blijft bewaard bij Soort"
  const OWN = { regulier: 'Je presentatie', voorstel: 'Je voorstel', positionering: 'Je positionering' };
  const PRICE_GROUPS = ['eenmalig', 'maandelijks'];
  const MAX_PRICES = 12;   // prijsregels per groep (voorstel.js)
  // De vakken van de waardepropositie en de blokken van het business model canvas (zoals
  // generator.js), hier zelf: een gewone presentatie mag niet van de generator afhangen
  const VPC_KEYS = ['segment', 'klanttype', 'taken', 'pijnen', 'voordelen', 'producten', 'verzachters', 'verschaffers'];
  const emptyVpc = () => Object.fromEntries(VPC_KEYS.map((k) => [k, '']));
  const BMC_KEYS = ['partners', 'activiteiten', 'resources', 'proposities', 'relaties', 'kanalen', 'segmenten'];
  const emptyBmc = () => Object.fromEntries(BMC_KEYS.map((k) => [k, '']));
  const SIZES = ['klein', 'normaal', 'groot'];
  const legacyKey = (id) => `slide:${id}`;   // foto's van vóór de sleutels per foto

  // Hoe je een layout noemt in een zin ("Een opsomming heeft geen foto")
  const NOUN = {
    section: 'Een sectieslide', bullets: 'Een opsomming', quote: 'Een citaat of kerncijfer', table: 'Een tabel',
    tekst: 'Een tekstslide', kolommen: 'Een slide met kolommen', vragen: 'Een genummerde lijst', vpc: 'De waardepropositie',
    bmc: 'Het Business Model Canvas', toelichting: 'Een toelichting',
  };

  /* ---------------------------------------------------------------------------
     Toestand
     ------------------------------------------------------------------------- */

  function newSlide(layout, fields = {}) {
    return {
      id: PM.uid(),
      layout,
      label: '',
      title: '',
      subtitle: '',
      body: '',
      meta: '',
      quote: '',
      author: '',
      value: '',
      style: 'quote',
      imageSide: 'left',
      crop: { zoom: 1, fx: 0.5, fy: 0.5 },
      table: S.defaultTable(),
      titleSize: 'normaal',   // klein, normaal of groot (typeschaal van het merk)
      photoKey: '',           // sleutel van de foto in IndexedDB
      role: '',               // plek in een voorstel of positionering ('' = gewone slide)
      gen: {},                // per veld wat het formulier het laatst schreef (sync)
      photoFit: 'cover',      // cover: foto vult de zeshoek; logo: in zijn geheel op wit
      vpc: emptyVpc(),        // de vakken van de waardepropositie
      bmc: emptyBmc(),        // de blokken van het business model canvas
      notes: '',              // sprekersnotities: niet op de slide, wel in PowerPoint (Notities)
      photoQuery: '',         // zoektermen van de AI voor een foto (Pexels, paneel AI)
      ...fields,
    };
  }

  // Een lege slide voor een nieuwe slide van het formulier: sync vult rol en velden in.
  // Een slide die terugkomt, komt uit state.parked (met logo, foto en eigen tekst)
  const make = (spec) => newSlide(spec.layout);
  // De slides van een nieuw voorstel of een nieuwe positionering uit het formulier
  const deckSlides = (type, form) => DECKS[type].sync([], DECKS[type].build(form), make, {}).slides;
  // Datum op de titelslide van een voorstel of positionering: "september 2026"
  const today = () => new Date().toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' });
  // Het recept van de soort die openstaat (null bij een gewone presentatie)
  const deck = () => DECKS[state.type] || null;
  const isGen = () => !!deck();
  // Prijzen, klantlogo en "wat wij gaan doen" horen alleen bij een voorstel
  const isVoorstel = () => state.type === 'voorstel' && isGen();
  // Een vaste opbouw (de positionering): zijn eigen slides verwijder je niet, anders klopt
  // hij niet meer. Een kopie of een eigen extra slide (role '') wel
  const isLocked = (slide = current()) => isGen() && deck().fixed === true && !!slide && !!slide.role && deck().ROLES.includes(slide.role);
  const LOCKED_TITLE = 'Hoort bij de vaste opbouw van de positionering';
  const ORDER_TITLE = 'De volgorde van de positionering ligt vast';
  // Een vaste opbouw: verplaatsen mag alleen als de vaste slides hun onderlinge volgorde houden
  // (een eigen slide mag wel tussen twee vaste slides schuiven)
  function orderKept(from, to) {
    if (!isGen() || deck().fixed !== true) return true;
    const roles = (list) => list.map((s) => s.role).filter((r) => r && deck().ROLES.includes(r)).join();
    return roles(D.move(state.slides, from, to)) === roles(state.slides);
  }
  const clampIndex = (i, list) => Math.min(Math.max(0, i | 0), list.length - 1);

  // De voorbeeldslides van een nieuwe gewone presentatie
  function exampleSlides() {
    const date = new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
    return D.example(date).map(({ layout, ...fields }) => newSlide(layout, fields));
  }

  const emptyStash = () => ({ regulier: null, voorstel: null, positionering: null });

  function defaults() {
    return {
      v: 2,           // sinds de positionering; zonder v was 'positionering' het voorstel
      dot: true,
      showNumbers: false,   // slidenummers standaard uit (aanzetten bij Presentatie)
      exportWidth: 1920,
      active: 0,
      type: 'regulier',
      form: null,     // het formulier van het voorstel of de positionering die openstaat
      parked: {},     // voorstel en positionering: slides die uit staan, per plek, tot ze terugkomen
      badge: false,   // Emerce 100-badge rechtsonder op elke slide
      stash: emptyStash(),   // de andere soorten, bewaard tot je terugwisselt
      slides: exampleSlides(),
    };
  }

  const LAYOUT_IDS = new Set(S.LAYOUTS.map((l) => l.id));

  function normalizeSlide(s) {
    const base = newSlide(LAYOUT_IDS.has(s.layout) ? s.layout : 'bullets');
    for (const k of Object.keys(base)) {
      if (k === 'crop') base.crop = { ...base.crop, ...(isObj(s.crop) ? s.crop : {}) };
      else if (k === 'table') base.table = S.normalizeTable(s.table);
      // Vóór de typeof-vergelijking: typeof null is ook 'object'
      else if (k === 'gen') base.gen = G ? G.normalizeGen(s.gen) : {};
      else if (k === 'vpc') base.vpc = G ? G.normalizeVpc(s.vpc) : emptyVpc();
      else if (k === 'bmc') base.bmc = G ? G.normalizeBmc(s.bmc) : emptyBmc();
      else if (typeof s[k] === typeof base[k]) base[k] = s[k];
    }
    // Opgeslagen vóór de sleutels per foto: de foto staat onder slide:<id>
    if (!('photoKey' in s)) base.photoKey = legacyKey(base.id);
    if (!SIZES.includes(base.titleSize)) base.titleSize = 'normaal';
    if (!['cover', 'logo'].includes(base.photoFit)) base.photoFit = 'cover';
    return base;
  }

  const normalizeSlides = (list) => (Array.isArray(list) ? list.filter(isObj).map(normalizeSlide).slice(0, MAX_SLIDES) : []);

  // Geparkeerde slides van een voorstel of positionering: per plek één gewone slide
  function normalizeParked(saved, type) {
    const out = {};
    if (!DECKS[type] || !isObj(saved)) return out;
    for (const role of DECKS[type].ROLES) if (isObj(saved[role])) out[role] = normalizeSlide(saved[role]);
    return out;
  }

  // Het formulier van een opgeslagen soort; vóór v 2 heette het pos
  const formOf = (saved) => (isObj(saved) ? saved.form || saved.pos : null);
  // Een formulier van het voorstel (de positionering heeft deze velden niet)
  const looksVoorstel = (f) => isObj(f) && ['traject', 'situatie', 'diensten', 'eenmalig', 'maandelijks', 'websiteSoort'].some((k) => k in f);

  // De bewaarde andere soort: { slides, active, showNumbers } en bij een voorstel of positionering
  // ook form en parked; leeg = null
  function normalizeStash(saved, type) {
    if (!isObj(saved)) return null;
    // Zonder het recept (laadfout) onaangeroerd bewaren: normalizeSlide zou de vakken en wat
    // het formulier schreef (gen) wissen
    if (type !== 'regulier' && !DECKS[type]) return Array.isArray(saved.slides) && saved.slides.length ? saved : null;
    const slides = normalizeSlides(saved.slides);
    if (!slides.length) return null;
    const out = { slides, active: clampIndex(saved.active, slides) };
    // Elke soort houdt zijn eigen slidenummers; ontbreekt het, dan blijft de stand zoals hij is
    if (typeof saved.showNumbers === 'boolean') out.showNumbers = saved.showNumbers;
    if (type !== 'regulier') {
      out.form = DECKS[type].normalizeInput(formOf(saved), today());
      out.parked = normalizeParked(saved.parked, type);
    }
    return out;
  }

  // Een toestand gezond maken (na laden of ongedaan maken). type, form, parked, badge
  // en stash expliciet: anders vallen ze bij herladen of ongedaan maken weg
  function normalize(saved) {
    const state = { v: 2, dot: true, showNumbers: false, exportWidth: 1920, active: 0, type: 'regulier', form: null, parked: {}, badge: false, stash: emptyStash(), slides: [] };
    if (isObj(saved)) {
      for (const k of ['dot', 'showNumbers', 'exportWidth', 'active']) {
        if (typeof saved[k] === typeof state[k]) state[k] = saved[k];
      }
      // Opgeslagen vóór v 2: 'positionering' was toen het voorstel. Ook later een formulier van
      // het voorstel onder 'positionering' (vangnet): dan is het een voorstel
      const legacy = !(saved.v >= 2);
      let type = TYPES.includes(saved.type) ? saved.type : 'regulier';
      if (type === 'positionering' && (legacy || looksVoorstel(formOf(saved)))) type = 'voorstel';
      state.badge = saved.badge === true;
      const stash = isObj(saved.stash) ? { ...saved.stash } : {};
      if (legacy) {
        stash.voorstel = stash.positionering;
        stash.positionering = null;
      } else if (looksVoorstel(formOf(stash.positionering)) && !isObj(stash.voorstel)) {
        stash.voorstel = stash.positionering;
        stash.positionering = null;
      }
      for (const t of TYPES) state.stash[t] = normalizeStash(stash[t], t);
      if (type !== 'regulier' && !DECKS[type]) {
        // Een voorstel of positionering open, maar het recept laadde niet: ongemoeid naar de
        // bewaarplek en de gewone presentatie open (of een nieuwe). Er gaat niets verloren
        const back = state.stash.regulier;
        state.stash[type] = normalizeStash({ slides: saved.slides, active: saved.active, showNumbers: saved.showNumbers, form: formOf(saved), parked: saved.parked }, type);
        state.slides = back ? back.slides : [];
        state.active = back ? back.active : 0;
        state.showNumbers = back && typeof back.showNumbers === 'boolean' ? back.showNumbers : false;
        type = 'regulier';
      } else state.slides = normalizeSlides(saved.slides);
      state.type = type;
    }
    // Wat openstaat, staat niet ook in de bewaarplek
    state.stash[state.type] = null;
    const R = DECKS[state.type];
    if (state.type !== 'regulier') {
      state.form = R.normalizeInput(formOf(saved), today());
      state.parked = normalizeParked(isObj(saved) ? saved.parked : null, state.type);
    }
    if (!state.slides.length) state.slides = state.form ? deckSlides(state.type, state.form) : exampleSlides();
    // Nog steeds leeg (alles uitgezet): de vaste slides terug, met wat er geparkeerd stond
    if (!state.slides.length && state.form) {
      if (!R.fixed) state.form.hidden = [];
      const res = R.sync([], R.build(state.form), make, state.parked);
      state.slides = res.slides;
      if (isObj(res.parked)) state.parked = res.parked;
    }
    if (!state.slides.length) state.slides = exampleSlides();
    state.active = clampIndex(state.active, state.slides);
    if (![1920, 3840].includes(state.exportWidth)) state.exportWidth = 1920;
    return state;
  }

  let state = normalize(PM.store.get(KEY, null));
  // Een opgeslagen voorstel of positionering krijgt bij het laden de vaste teksten van nu (zoals de
  // verbeterde spelling), ook wat bij Soort bewaard staat. Wat je zelf aanpaste, blijft staan
  function refreshDeck(type, box) {
    const R = DECKS[type];
    if (!R || !isObj(box) || !box.form || !Array.isArray(box.slides)) return;
    const id = box.slides[box.active] && box.slides[box.active].id;
    const res = R.sync(box.slides, R.build(box.form), make, box.parked);
    // Zou er een slide bij moeten komen boven het maximum: dan laten zoals het was
    if (!res.slides.length || res.slides.length > Math.max(MAX_SLIDES, box.slides.length)) return;
    box.slides = res.slides;
    if (isObj(res.parked)) box.parked = res.parked;
    const i = box.slides.findIndex((s) => s.id === id);
    box.active = i >= 0 ? i : clampIndex(box.active, box.slides);
  }
  refreshDeck(state.type, state);
  for (const t of TYPES) refreshDeck(t, state.stash[t]);
  // Gestart vanaf het dashboard: dan bij de rondleiding alleen een melding.
  // Eenmalig te lezen (daarna weg uit de adresbalk), dus bewaard voor de start
  const start = PM.startParams();
  let lib = null;   // de bieb (js/shared/library.js), aan het eind gekoppeld
  // De rondleiding vanaf de hub (#rondleiding) is die van een gewone presentatie. Lezen vóór
  // PM.shell: die haalt de hash weg
  const hubTour = location.hash === '#rondleiding';
  // Een tegel op de hub kiest de soort (?type=regulier, voorstel of positionering). De wissel volgt
  // na het laden (zodat ongedaan maken hem terugdraait), maar de rondleiding past meteen bij de soort
  const wanted = TYPES.includes(start.type) ? start.type : hubTour ? 'regulier' : null;
  let startType = wanted && (wanted === 'regulier' || DECKS[wanted]) && wanted !== state.type ? wanted : null;
  // type=regulier is geen snelle start: bij een eerste bezoek start de rondleiding zoals altijd
  const quickStart = Object.keys(start).some((k) => k !== 'type' && k !== 'bieb') || (TYPES.includes(start.type) && start.type !== 'regulier');
  // De rondleiding begint bij de titel van slide 1
  const tourStatus = (PM.store.get(TOUR_KEY, null) || {}).status;
  if (!tourStatus || tourStatus === 'nieuw' || tourStatus === 'bezig') state.active = 0;

  const save = PM.debounce(() => PM.store.set(KEY, state), 300, { flushOnHide: true });
  const current = () => state.slides[state.active];
  const layoutOf = (slide) => S.LAYOUTS.find((l) => l.id === slide.layout) || S.LAYOUTS[0];
  // De naam van een layout in deze soort (de positionering: Waarde Propositie Canvas)
  const layoutName = (l) => (l.names && l.names[state.type]) || l.name;

  /* ---------------------------------------------------------------------------
     Elementen
     ------------------------------------------------------------------------- */

  const el = {
    app: $('.app'),
    editor: $('#editor'),
    stage: $('#stage'),
    canvas: $('#slideCanvas'),
    strip: $('#slideStrip'),
    layoutGrid: $('#layoutGrid'),
    layoutFor: $('#layoutFor'),
    inhoudSlide: $('#inhoudSlide'),
    inhoudLayout: $('#inhoudLayout'),
    slidePill: $('#slidePill'),
    dimPill: $('#dimPill'),
    docTitle: $('#docTitle'),
    docSub: $('#docSub'),
    warning: $('#warning'),
    warningText: $('#warningText'),
    warningBtn: $('#warningBtn'),
    photoStageNote: $('#photoStageNote'),
    photoStageText: $('#photoStageText'),
    photoDrop: $('#photoDrop'),
    photoInput: $('#photoInput'),
    photoCard: $('#photoCard'),
    photoThumb: $('#photoThumb'),
    photoName: $('#photoName'),
    photoSize: $('#photoSize'),
    photoNote: $('#photoNote'),
    previewPhotoBtn: $('#previewPhotoBtn'),
    previewPhotoTxt: $('#previewPhotoTxt'),
    photoDropTitle: $('#photoDropTitle'),
    photoLead: $('#photoLead'),
    photoStageBtn: $('#photoStageBtn'),
    cropControls: $('#cropControls'),
    cropHint: $('#cropHint'),
    showNumbers: $('#showNumbers'),
    dot: $('#dotToggle'),
    tableGrid: $('#tableGrid'),
    tableHeader: $('#tableHeader'),
    tableFirstCol: $('#tableFirstCol'),
    slideAdd: $('#slideAdd'),
    slideCount: $('#slideCount'),
    slideMenuBtn: $('#slideMenuBtn'),
    slideMenuNo: $('#slideMenuNo'),
    downloadBtn: $('#downloadBtn'),
    pdfBtn: $('#pdfBtn'),
    pptxBtn: $('#pptxBtn'),
    pngBtn: $('#pngBtn'),
    pngAllBtn: $('#pngAllBtn'),
    pdfSum: $('#pdfSum'),
    pngSum: $('#pngSum'),
    zipSum: $('#zipSum'),
    dlPhotoNote: $('#dlPhotoNote'),
    dropHint: $('#dropHint b'),
    check: $('#checkDialog'),
    resetBtn: $('#resetBtn'),
    deckTypeGrid: $('#deckTypeGrid'),
    badge: $('#badgeToggle'),
    posNote: $('#posNote'),
    posNoteText: $('#posNoteText'),
    posNoteGo: $('#posNoteGo'),
    posNoteCanvas: $('#posNoteCanvas'),
    posNoteHelp: $('#posNote .help[data-help="uit-voorstel"]'),
    posResetBtn: $('#posResetBtn'),
    pDiensten: $('#pDiensten'),
    pLogoState: $('#pLogoState'),
    pLogoBtn: $('#pLogoBtn'),
    psFotoState: $('#psFotoState'),
    psFotoBtn: $('#psFotoBtn'),
    pPriceNote: $('#pPriceNote'),
    priceRows: Object.fromEntries(PRICE_GROUPS.map((g) => [g, $(`[data-price-rows="${g}"]`)])),
  };
  // De tabs en het formulier van elke gegenereerde soort (DECK_UI): klantnaam, checklist, "zet terug"
  // (alleen het voorstel; de positionering heeft een vaste opbouw)
  const deckEl = Object.fromEntries(Object.entries(DECK_UI).map(([t, u]) => [t, {
    tabs: u.tabs.map((id) => $(`.rail__item[data-section="${id}"]`)),
    klant: $(u.klant), check: $(u.check), checkList: $(u.checkList), checkCount: $(u.checkCount),
    restore: u.restore ? $(u.restore) : null, restoreText: u.restoreText ? $(u.restoreText) : null,
    restoreBtn: u.restoreBtn ? $(u.restoreBtn) : null,
  }]));

  // Logo en Emerce 100-badge (wit), en de foto's per sleutel: { file, img, url }
  const env = { logo: null, badge: null };
  const files = new Map();

  const photoOf = (slide) => (slide && slide.photoKey && files.get(slide.photoKey)) || null;

  function sectionNumber(index) {
    let n = 0;
    for (let i = 0; i <= index; i++) if (state.slides[i].layout === 'section') n++;
    return Math.max(1, n);
  }

  function slideEnv(index, slide = state.slides[index]) {
    const photo = photoOf(slide);
    return { logo: env.logo, badge: env.badge, photo: photo ? photo.img : null, crop: slide.crop, sectionNumber: sectionNumber(index), fit: slide.photoFit };
  }

  // Vingerafdruk van alles wat de tekening van slide i bepaalt: de slide zelf, zijn plek, de
  // instellingen van de presentatie en of de foto er is. drawEpoch telt op als het logo, de badge,
  // het lettertype of de foto's (opnieuw) geladen zijn: dan klopt geen enkele oude tekening meer
  let drawEpoch = 0;
  const drawn = new WeakMap();   // miniatuur -> vingerafdruk van wat erop staat
  const measured = [];           // per slide: { sig, info } van de laatste tekening (tekst die niet past)
  function slideSig(i) {
    const slide = state.slides[i];
    return JSON.stringify([drawEpoch, i, state.slides.length, state.dot, state.showNumbers, state.badge, sectionNumber(i), photoOf(slide) ? slide.photoKey : '', slide]);
  }
  const assetsChanged = () => {
    drawEpoch += 1;
    render();
  };

  // Staat er op deze slide een klantlogo in plaats van een foto? (voor de woorden in knoppen en meldingen)
  const isLogo = (slide = current()) => slide.photoFit === 'logo' && (slide.layout === 'title' || slide.layout === 'closing');
  const photoWord = (slide) => (isLogo(slide) ? 'logo' : 'foto');

  /* ---------------------------------------------------------------------------
     Editor: indeling, tekstvelden, werkbalk, ongedaan maken
     ------------------------------------------------------------------------- */

  PM.richfield.init(el.editor);
  // Voorstel en Prijzen bestaan alleen bij een voorstel, Gegevens alleen bij een positionering.
  // Vóór de shell: die opent geen verborgen tab. Het paneel dat opengaat hangt van de soort af
  // (anders zou de shell een onthouden, verborgen paneel openen)
  const syncDeckTabs = () => {
    for (const [t, e] of Object.entries(deckEl)) e.tabs.forEach((tab) => { tab.hidden = t !== state.type || !isGen(); });
  };
  syncDeckTabs();
  // Tot v 2 was de rondleiding van het voorstel die van 'positionering': één keer overzetten, zodat
  // wie hem al deed hem niet opnieuw krijgt en de nieuwe positionering zijn eigen stand heeft
  if (!PM.store.get('pm-presentation-migrated-v2', false)) {
    const old = PM.store.get('pm-tour-positionering-v1', null);
    if (old && PM.store.get('pm-tour-voorstel-v1', null) == null) PM.store.set('pm-tour-voorstel-v1', old);
    PM.store.remove('pm-tour-positionering-v1');
    PM.store.set('pm-presentation-migrated-v2', true);
  }
  // Een voorstel en een positionering hebben elk een eigen rondleiding (PM_HELP.voorstel en
  // .positionering, eigen stand): vanzelf de eerste keer, en onder hulp die van de soort die openstaat
  const tourTool = () => {
    const t = startType || state.type;
    return t === 'regulier' ? 'presentation' : t;
  };
  const shell = PM.shell(el.app, { tool: 'presentation', open: isGen() ? DECK_UI[state.type].panel : 'inhoud', quickStart, tourTool });

  // De werkbalk: nadruk of vet, en de grootte van de titel (typeschaal van het merk, per slide)
  const toolbar = PM.toolbar($('#tbar'), {
    value: (field, cmd) => (cmd === 'grootte' ? current().titleSize || 'normaal' : null),
    apply(field, cmd, value) {
      if (cmd !== 'grootte' || !SIZES.includes(value)) return;
      current().titleSize = value;
      changed('grootte');
    },
  });

  // Alles behalve de gekozen slide en de resolutie: dat zijn geen wijzigingen aan de presentatie
  const history = PM.history({
    snapshot: () => ({ ...state, exportWidth: undefined, active: undefined }),
    restore(saved) {
      const prev = state;
      state = normalize({ ...saved, exportWidth: prev.exportWidth, active: prev.active });
      // Laat zien wat er terugkwam: de slide die veranderde, of na een wissel van soort
      // de slide waar je in die andere presentatie was
      const back = prev.stash[state.type];
      if (state.type !== prev.type) state.active = back ? clampIndex(back.active, state.slides) : 0;
      else state.active = D.changedSlide(prev.slides, state.slides, prev.active);
      const inStrip = !!document.activeElement.closest('.strip__item');
      syncAll();
      if (inStrip) focusActiveThumb();
      applyPhotos();
      save();
      render();
    },
  });
  history.bind({ undo: $('#undoBtn'), redo: $('#redoBtn') });

  // Na de AI: elke wijziging vanzelf in de bieb (PM.ai.keepSaved); het paneel AI (js/shared/ai.js)
  let aiSaver = null;
  let ai = null;

  // Elke wijziging: een stap in de geschiedenis, opslaan en opnieuw tekenen
  function changed(key) {
    history.commit(key);
    save();
    if (lib) lib.touch();
    if (aiSaver) aiSaver.touch();
    render();
  }

  /* ---------------------------------------------------------------------------
     Renderen
     ------------------------------------------------------------------------- */

  let lastInfo = {};
  let frameRequest = 0;

  function render() {
    cancelAnimationFrame(frameRequest);
    frameRequest = requestAnimationFrame(() => {
      // Scherp op elk scherm: zoveel canvaspixels als het scherm laat zien (ook bij 150% of retina)
      lastInfo = S.renderSlide(el.canvas, state, state.active, slideEnv(state.active), { scale: PM.previewScale(el.canvas, S.W) });
      el.canvas.dataset.designW = String(S.W);
      el.canvas.dataset.designH = String(S.H);
      el.canvas.classList.toggle('can-pan', !!lastInfo.photo);
      syncPhotoPrompt();
      syncRegions();
      syncWarning();
      syncPhotoCheck();
      syncDocName();
      syncExport();
      syncPosNote();
    });
    renderThumbsSoon();
  }

  const renderThumbsSoon = PM.debounce(() => {
    drawStrip();
    if (shell.current === 'layout') renderLayoutTiles();
    if (shell.current === 'soort') renderTypeTiles();
    if (isGen() && shell.current === DECK_UI[state.type].panel) syncChecklist();
  }, 160);

  // Miniaturen van de layouts tonen de huidige slide in elke layout
  function renderLayoutTiles() {
    const slide = current();
    for (const canvas of $$('canvas', el.layoutGrid)) {
      const variant = { ...slide, layout: canvas.dataset.layout };
      const slides = state.slides.slice();
      slides[state.active] = variant;
      S.renderSlide(canvas, { ...state, slides }, state.active, slideEnv(state.active, variant), { scale: 272 / S.W });
    }
  }
  // Soort: de titelslide van elk soort presentatie, zoals hij nu is (of zoals een nieuwe begint)
  const freshDecks = {};
  function deckOf(type) {
    if (type === state.type) return state.slides;
    // Zonder recept is de tegel weg (en een bewaard voorstel of bewaarde positionering ongelezen)
    if (type !== 'regulier' && !DECKS[type]) return null;
    if (state.stash[type]) return state.stash[type].slides;
    if (!freshDecks[type]) freshDecks[type] = freshDeck(type).slides;
    return freshDecks[type];
  }

  function renderTypeTiles() {
    for (const canvas of $$('canvas[data-deck]', el.deckTypeGrid)) {
      const slides = deckOf(canvas.dataset.deck);
      if (!slides) continue;
      const slide = slides[0];
      const photo = photoOf(slide);
      const tileEnv = { logo: env.logo, badge: env.badge, photo: photo ? photo.img : null, crop: slide.crop, sectionNumber: 1, fit: slide.photoFit };
      S.renderSlide(canvas, { ...state, slides }, 0, tileEnv, { scale: 272 / S.W });
    }
  }

  shell.onChange(({ id }) => {
    if (id === 'layout') renderLayoutTiles();
    if (id === 'soort') renderTypeTiles();
    if (isGen() && id === DECK_UI[state.type].panel) syncChecklist();
  });

  // Naam van de presentatie in de appbalk: dezelfde samenvatting als "Verder werken" op het dashboard
  const draft = (window.PM_TOOLS || []).find((t) => t.id === 'presentation');
  function syncDocName() {
    const sum = draft && draft.draft ? draft.draft.summary(state) : {};
    const title = String(sum.title || '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
    el.docTitle.textContent = title || 'Nieuwe presentatie';
    el.docTitle.title = title;
    el.docSub.textContent = [sum.sub, '16:9'].filter(Boolean).join(' · ');
  }

  /* ---------------------------------------------------------------------------
     Slides: de strook onder de slide en de acties voor de gekozen slide
     ------------------------------------------------------------------------- */

  function slideName(i) {
    const slide = state.slides[i];
    const title = String(slide.title || slide.quote || slide.value || '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
    return `Slide ${i + 1} van ${state.slides.length}: ${layoutName(layoutOf(slide))}${title ? `, ${title.slice(0, 60)}` : ''}`;
  }

  // Aantal miniaturen, nummers en de gekozen slide: meteen (tekenen volgt even later)
  function syncStrip() {
    const items = $$('.strip__item', el.strip);
    state.slides.forEach((slide, i) => {
      let item = items[i];
      if (!item) {
        item = document.createElement('div');
        item.className = 'strip__item';
        item.setAttribute('role', 'option');
        item.draggable = true;
        item.innerHTML = '<canvas width="240" height="135" aria-hidden="true"></canvas><span class="strip__no" aria-hidden="true"></span>';
        el.strip.appendChild(item);
      }
      const on = i === state.active;
      item.dataset.index = String(i);
      item.tabIndex = on ? 0 : -1;
      item.setAttribute('aria-selected', String(on));
      item.setAttribute('aria-label', slideName(i));
      item.querySelector('.strip__no').textContent = String(i + 1);
    });
    items.slice(state.slides.length).forEach((b) => b.remove());
    syncSlideBar();
    keepActiveInView();
    syncCues();
  }

  // Alleen de miniaturen die veranderden opnieuw tekenen: een volle positionering (22 slides,
  // lange toelichtingen) helemaal tekenen kost bij elke pauze in het typen te veel tijd.
  // De tekening onthoudt ook wat niet past (voor de controle vóór het downloaden)
  function drawStrip() {
    $$('.strip__item', el.strip).forEach((item, i) => {
      if (!state.slides[i]) return;
      const canvas = item.querySelector('canvas');
      const sig = slideSig(i);
      if (drawn.get(canvas) === sig) return;
      const info = S.renderSlide(canvas, state, i, slideEnv(i), { scale: 240 / S.W });
      drawn.set(canvas, sig);
      measured[i] = { sig, info };
    });
  }

  function syncSlideBar() {
    const n = state.slides.length;
    const i = state.active;
    el.slideCount.textContent = `slide ${i + 1} van ${n}`;
    el.slideMenuNo.textContent = `${i + 1} / ${n}`;
    el.slideMenuBtn.setAttribute('aria-label', `Acties voor slide ${i + 1} van ${n}`);
    el.slidePill.textContent = `slide ${i + 1} van ${n} · ${layoutName(layoutOf(current()))}`;
    el.inhoudSlide.textContent = `slide ${i + 1}`;
    el.inhoudLayout.textContent = layoutName(layoutOf(current()));
    el.layoutFor.textContent = `Kies een layout voor slide ${i + 1}`;
    const full = n >= MAX_SLIDES;
    el.slideAdd.disabled = full;
    el.slideAdd.title = full ? `Hoogstens ${MAX_SLIDES} slides` : 'Nieuwe slide na deze';
    const set = (sel, off) => $$(sel).forEach((b) => { b.disabled = off; });
    set('#slideDup, [data-action="slide-dupliceer"]', full);
    const left = i > 0 && !orderKept(i, i - 1);
    const right = i < n - 1 && !orderKept(i, i + 1);
    set('#slideLeft, [data-action="slide-voren"]', i === 0 || left);
    set('#slideRight, [data-action="slide-achteren"]', i === n - 1 || right);
    $$('#slideLeft, [data-action="slide-voren"]').forEach((b) => { b.title = left ? ORDER_TITLE : ''; });
    $$('#slideRight, [data-action="slide-achteren"]').forEach((b) => { b.title = right ? ORDER_TITLE : ''; });
    set('#slideDel, [data-action="slide-verwijder"]', n === 1 || isLocked());
    // Uit: waarom, zoals bij andere knoppen die uit staan
    const why = n === 1 ? 'Een presentatie heeft minstens één slide' : isLocked() ? LOCKED_TITLE : '';
    $$('#slideDel, [data-action="slide-verwijder"]').forEach((b) => { b.title = why; });
    set('[data-browse="-1"]', i === 0);
    set('[data-browse="1"]', i === n - 1);
  }

  // De gekozen miniatuur in beeld houden (alleen de strook scrolt, nooit de pagina)
  function keepActiveInView() {
    const item = el.strip.children[state.active];
    if (!item) return;
    const pad = 48;
    const left = item.offsetLeft;   // de strook is position: relative
    if (left - pad < el.strip.scrollLeft) el.strip.scrollLeft = Math.max(0, left - pad);
    else if (left + item.offsetWidth + pad > el.strip.scrollLeft + el.strip.clientWidth) el.strip.scrollLeft = left + item.offsetWidth + pad - el.strip.clientWidth;
  }

  // Past de strook niet, dan een verloop met een pijl aan de kant waar nog slides staan
  const cues = { prev: $('.slidebar__cue--prev'), next: $('.slidebar__cue--next') };
  function syncCues() {
    const s = el.strip;
    const more = s.scrollWidth > s.clientWidth + 2;
    cues.prev.hidden = !more || s.scrollLeft <= 2;
    cues.next.hidden = !more || s.scrollLeft + s.clientWidth >= s.scrollWidth - 2;
  }
  el.strip.addEventListener('scroll', syncCues, { passive: true });
  window.addEventListener('resize', PM.debounce(syncCues, 100));
  cues.prev.addEventListener('click', () => el.strip.scrollBy({ left: -el.strip.clientWidth * 0.8 }));
  cues.next.addEventListener('click', () => el.strip.scrollBy({ left: el.strip.clientWidth * 0.8 }));

  function focusActiveThumb() {
    const item = el.strip.children[state.active];
    if (item) item.focus({ preventScroll: true });
  }

  function selectSlide(i, { focus = false } = {}) {
    const next = Math.min(Math.max(0, i), state.slides.length - 1);
    if (next !== state.active) {
      state.active = next;
      syncAll();
      save();
      render();
    }
    if (focus) focusActiveThumb();
  }

  // Klikken kiest, slepen verandert de volgorde
  el.strip.addEventListener('click', (e) => {
    const item = e.target.closest('.strip__item');
    if (item) selectSlide(Number(item.dataset.index));
  });
  el.strip.addEventListener('dragstart', (e) => {
    const item = e.target.closest('.strip__item');
    if (!item) return;
    // Een vaste slide van de positionering sleep je niet
    if (isLocked(state.slides[Number(item.dataset.index)])) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('text/x-pm-slide', item.dataset.index);
    e.dataTransfer.effectAllowed = 'move';
    item.classList.add('is-dragging');
  });
  el.strip.addEventListener('dragend', () => {
    $$('.is-dragging, .is-drop', el.strip).forEach((n) => n.classList.remove('is-dragging', 'is-drop'));
  });
  el.strip.addEventListener('dragover', (e) => {
    const item = e.target.closest('.strip__item');
    if (!item || !e.dataTransfer.types.includes('text/x-pm-slide')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    $$('.is-drop', el.strip).forEach((n) => n !== item && n.classList.remove('is-drop'));
    item.classList.add('is-drop');
  });
  el.strip.addEventListener('drop', (e) => {
    const item = e.target.closest('.strip__item');
    const from = e.dataTransfer.getData('text/x-pm-slide');
    if (!item || from === '') return;
    e.preventDefault();
    moveSlideTo(Number(from), Number(item.dataset.index));
  });

  // Toetsenbord in de strook: pijltjes, Home en End kiezen, Delete verwijdert, Enter bewerkt
  el.strip.addEventListener('keydown', (e) => {
    if (!e.target.closest('.strip__item') || e.altKey || e.ctrlKey || e.metaKey) return;
    const n = state.slides.length;
    const to = { ArrowRight: state.active + 1, ArrowDown: state.active + 1, ArrowLeft: state.active - 1, ArrowUp: state.active - 1, Home: 0, End: n - 1 }[e.key];
    if (to != null) {
      e.preventDefault();
      selectSlide(to, { focus: true });
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      deleteSlide();
      focusActiveThumb();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      shell.open('inhoud', { focus: true });
    }
  });

  function moveSlideTo(from, to) {
    if (from === to || from < 0 || to < 0 || from >= state.slides.length || to >= state.slides.length) return;
    if (!orderKept(from, to)) {
      toast('De volgorde van de positionering ligt vast; eigen slides kun je wel verplaatsen.');
      return;
    }
    state.slides = D.move(state.slides, from, to);
    state.active = to;
    syncAll();
    changed(null);
    PM.announce(`Slide staat nu op plek ${to + 1}.`);
  }

  function moveSlide(delta, button) {
    moveSlideTo(state.active, state.active + delta);
    // Aan het begin of eind gaat de knop uit: de focus naar de andere richting
    if (button && button.disabled) {
      const other = button.id === 'slideLeft' ? $('#slideRight') : $('#slideLeft');
      if (!other.disabled) other.focus();
    }
  }

  // Een nieuwe slide na deze; meteen de layout kiezen
  function addSlide({ byKeyboard = false } = {}) {
    if (state.slides.length >= MAX_SLIDES) {
      toast(`Hoogstens ${MAX_SLIDES} slides: verdeel je verhaal over twee presentaties.`);
      return;
    }
    // Na een canvas een tekstslide (in een positionering een toelichting): een tweede leeg canvas
    // is zelden wat je zoekt
    const from = current().layout;
    const afterCanvas = state.type === 'positionering' ? 'toelichting' : 'tekst';
    const layout = ['title', 'closing'].includes(from) ? 'bullets' : from === 'vpc' || from === 'bmc' ? afterCanvas : from;
    state.slides.splice(state.active + 1, 0, newSlide(layout, { label: current().label }));
    state.active += 1;
    syncAll();
    changed(null);
    shell.open('layout', { focus: byKeyboard ? '#layoutGrid input:checked' : false });
    PM.announce(`Slide ${state.active + 1} toegevoegd. Kies een layout.`);
  }

  function duplicateSlide() {
    if (state.slides.length >= MAX_SLIDES) return;
    const src = current();
    // De foto hoeft niet mee te verhuizen: beide slides wijzen naar hetzelfde bestand.
    // De kopie van een slide uit het formulier is een gewone slide: het formulier laat hem met rust
    // (een kopie van een canvas heeft dus zijn eigen vakken of blokken)
    const copy = { ...JSON.parse(JSON.stringify(src)), id: PM.uid(), role: '', gen: {} };
    state.slides.splice(state.active + 1, 0, copy);
    state.active += 1;
    syncAll();
    changed(null);
    toast(`Slide ${state.active} gedupliceerd: je staat nu op de kopie, slide ${state.active + 1}.`);
  }

  // Verwijderen gaat meteen, met "ongedaan maken" in de melding (en Ctrl + Z)
  function deleteSlide() {
    if (state.slides.length === 1) {
      toast('Een presentatie heeft minstens één slide.');
      return;
    }
    if (isLocked()) {
      toast('Deze slide hoort bij de vaste opbouw van de positionering; vul hem in bij Inhoud.');
      return;
    }
    const index = state.active;
    // Uit het formulier: die slide gaat uit (anders zet de volgende wijziging in het formulier
    // hem terug) en gaat de parkeerplek in, zodat "zet terug" hem mét je aanpassingen terugbrengt
    const role = isGen() && state.slides[index].role;
    const fromGen = !!role && deck().ROLES.includes(role);
    if (fromGen) {
      deck().markRemoved(state.form, role);
      state.parked = { ...state.parked, [role]: state.slides[index] };
    }
    state.slides.splice(index, 1);
    state.active = Math.min(index, state.slides.length - 1);
    // De fases nummeren opnieuw en "Wat wij gaan doen" (of de slide Onderdelen) volgt
    if (fromGen) resync();
    syncAll();
    changed(null);
    const undo = { label: 'ongedaan maken', run: () => history.undo() };
    toast(fromGen ? `Slide ${index + 1} verwijderd. Bij ${DECK_UI[state.type].panelName} zet je hem terug.` : `Slide ${index + 1} verwijderd.`, false, undo);
  }

  el.slideAdd.addEventListener('click', (e) => addSlide({ byKeyboard: e.detail === 0 }));
  $('#slideDup').addEventListener('click', duplicateSlide);
  $('#slideLeft').addEventListener('click', (e) => moveSlide(-1, e.currentTarget));
  $('#slideRight').addEventListener('click', (e) => moveSlide(1, e.currentTarget));
  $('#slideDel').addEventListener('click', deleteSlide);
  shell.onAction('slide-dupliceer', duplicateSlide);
  shell.onAction('slide-voren', () => moveSlide(-1));
  shell.onAction('slide-achteren', () => moveSlide(1));
  shell.onAction('slide-verwijder', deleteSlide);

  /* ---------------------------------------------------------------------------
     Klikken op de slide: elk deel hoort bij een veld
     ------------------------------------------------------------------------- */

  const FIELD = { title: '#sTitle', subtitle: '#sSubtitle', meta: '#sMeta', body: '#sBody', quote: '#sQuote', author: '#sAuthor', value: '#sValue', label: '#sLabel' };

  // Velden van het formulier, per soort: hoe ze heten (label, en "naar …")
  const FORM_NAMES = {
    voorstel: {
      klant: ['klantnaam', 'de klantnaam'], datum: ['datum', 'de datum'], traject: ['ondertitel', 'de ondertitel'],
      gesprek: ['gesprek in', 'de maand van het gesprek'], situatie: ['huidige situatie', 'de huidige situatie'],
      gewenst: ['gewenste situatie', 'de gewenste situatie'], diensten: ['wat wij gaan doen', 'wat wij gaan doen'],
      namen: ['interview met', 'de namen'], websiteNu: ['huidige website', 'de huidige website'],
      eenmalig: ['prijsregels', 'de prijsregels'], maandelijks: ['prijsregels', 'de prijsregels'],
      totaal: ['totaal', 'het totaal'], voetnoot: ['voetnoot', 'de voetnoot'],
    },
    positionering: {
      klant: ['klantnaam', 'de klantnaam'], datum: ['datum', 'de datum'], aanbod: ['aanbod', 'het aanbod'],
    },
  };

  // Een vak van de waardepropositie: dat vul je in bij Inhoud, op de slide zelf
  function vpcTarget(zone) {
    const info = G && G.VPC_INFO[zone];
    const label = info ? info.name.toLowerCase() : zone === 'klanttype' ? 'klanttype' : 'klantsegment';
    return { label, name: info ? `het vak ${label}` : `het ${label}`, section: 'inhoud', field: `#sv-${VPC_KEYS.includes(zone) ? zone : 'segment'}` };
  }
  // Het eerste vak dat aan een voorwaarde voldoet (bijv. een invulplek), anders klanttaken.
  // keys: alleen deze vakken (de positionering telt de zes vakken, zonder klantsegment en -type)
  const vpcZone = (slide, test, keys = VPC_KEYS) => keys.find((z) => test(String((slide.vpc || {})[z] || ''))) || 'taken';

  // Een blok van het business model canvas: ook dat vul je in bij Inhoud
  function bmcTarget(key) {
    const info = G && G.BMC_INFO[key];
    const name = info ? info.name : 'Key Partners';
    return { label: name.toLowerCase(), name: `het blok ${name}`, section: 'inhoud', field: `#sb-${BMC_KEYS.includes(key) ? key : 'partners'}` };
  }
  // Het eerste blok dat aan een voorwaarde voldoet, anders Key Partners
  const bmcZone = (slide, test) => BMC_KEYS.find((k) => test(String((slide.bmc || {})[k] || ''))) || 'partners';

  // Het veld van het formulier bij een pad uit het recept ('klant', 'eenmalig'); row: welke prijsregel
  function formTarget(path, row = 0) {
    if (!path || !isGen()) return null;
    if (path.startsWith('vpc.')) return vpcTarget(path.slice(4));
    const [label, name] = FORM_NAMES[state.type][path] || [path, path];
    if (isVoorstel() && PRICE_GROUPS.includes(path)) return { label, name, section: 'prijzen', field: priceSel(path, row) };
    if (isVoorstel() && (path === 'totaal' || path === 'voetnoot')) return { label, name, section: 'prijzen', field: `[data-form="${path}"]` };
    return { label, name, section: DECK_UI[state.type].panel, field: `[data-form="${path}"]` };
  }

  // Een veld dat het formulier vult en dat je niet zelf aanpaste: dat pas je aan in het
  // formulier (anders wordt het jouw tekst en volgt de slide het formulier niet meer).
  // found: de invulplek, want [klantnaam] vul je altijd bij de klantnaam in. De canvassen
  // zijn altijd van de slide zelf
  function formRegion(key, slide = current(), found = '') {
    if (!isGen() || !slide.role || key === 'vpc' || key === 'bmc' || deck().touched(slide).includes(key)) return null;
    return formTarget(deck().fieldFor(slide.role, key, found));
  }

  // Een cel van de investering: de prijsregel die hem maakt (groepsrij, dan de regels met inhoud)
  function priceCell(cell) {
    const [r] = cell.split(',').map(Number);
    const cells = current().table.cells;
    let group = 'eenmalig';
    let n = -1;
    for (let i = 0; i <= r && i < cells.length; i++) {
      const head = String(cells[i][0] || '').replace(/\*\*/g, '').trim();
      if (/^(eenmalig|maandelijks)$/i.test(head) && !String(cells[i][1] || '').trim()) {
        group = head.toLowerCase();
        n = -1;
      } else n += 1;
    }
    const filled = priceList(group).map((row, i) => ({ row, i })).filter(({ row }) => row.label.trim() || row.amount.trim());
    const hit = filled[n];
    return formTarget(group, hit ? hit.i : 0);
  }

  function regionTarget(key) {
    // Emerce 100 op de slide: de schakelaar boven de slide
    if (key === 'badge') return { label: 'Emerce 100', badge: true };
    if (key.startsWith('cell:')) {
      if (isVoorstel() && formRegion('table')) return priceCell(key.slice(5));
      return { label: 'tabel', section: 'inhoud', field: `[data-cell="${key.slice(5)}"]` };
    }
    if (key === 'photo') {
      const word = photoWord(current());
      return { label: photoOf(current()) ? (isLogo() ? 'logo' : 'foto · sleep om te verschuiven') : `${word} toevoegen`, section: 'foto', photo: true };
    }
    // De canvassen vul je in bij Inhoud: elk vak en elk blok heeft daar zijn eigen veld
    if (key === 'vpc') return { ...vpcTarget(vpcZone(current(), (v) => v.trim())), name: D.nameOf(current(), 'vpc').name };
    if (key.startsWith('vpc:')) return vpcTarget(key.slice(4));
    if (key === 'bmc') return { ...bmcTarget(bmcZone(current(), (v) => v.trim())), name: D.nameOf(current(), 'bmc').name };
    if (key.startsWith('bmc:')) return bmcTarget(key.slice(4));
    if (key === 'table') return formRegion('table') || { label: 'tabel', name: 'de tabel', section: 'inhoud', field: '[data-cell="0,0"]' };
    // Met de invulplekken erbij: [klantnaam] vul je bij de klantnaam in, de rest van een vaste tekst bij Inhoud
    const value = current()[key];
    const fromForm = formRegion(key, current(), D.placeholders(String(value == null ? '' : value)).join(' '));
    if (fromForm) return fromForm;
    if (!FIELD[key]) return null;
    return { label: D.nameOf(current(), key).label, section: 'inhoud', field: FIELD[key] };
  }

  function syncRegions() {
    const regions = (lastInfo.regions || []).map((r) => {
      const target = regionTarget(r.key);
      return target && { ...r, ...target };
    }).filter(Boolean);
    shell.setRegions(el.canvas, regions, pickRegion);
  }

  function pickRegion(r) {
    if (r.badge) {
      el.badge.focus({ preventScroll: true });
      flash(el.badge.closest('.badge-toggle'));
      return;
    }
    if (r.photo) {
      if (!photoOf(current())) {
        pickPhoto();
        return;
      }
      // Foto aanklikken: het paneel met de uitsnede open, de focus blijft op de slide (pijltjes).
      // Een logo heeft geen uitsnede: dan de keuze foto of logo
      shell.open('foto');
      flash(isLogo() ? $('#fit-logo').closest('.field') : el.cropControls);
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
     Meldingen onder de slide: tekst te lang (welk veld), foto te klein
     ------------------------------------------------------------------------- */

  const PLURAL = new Set(['de punten', 'de contactgegevens', 'de kolommen', 'de vragen']);
  let warningKey = null;

  function overflowText(slide, key) {
    if (key === 'table') return 'De tabel past niet op de slide, ook niet op de kleinste letter. Haal rijen weg, maak teksten korter of verdeel de tabel over twee slides.';
    const { name } = D.nameOf(slide, key);
    const Name = name.charAt(0).toUpperCase() + name.slice(1);
    // Een canvas van de positionering verdeel je niet over twee slides: korter maken is de oplossing
    if (key === 'bmc' || (key === 'vpc' && slide.style === 'vol')) {
      return `${Name} past niet op de slide, ook niet op de kleinste letter. Maak de langste ${key === 'bmc' ? 'blokken' : 'vakken'} korter: trefwoorden hier, de uitleg op de toelichtingsslides.`;
    }
    return PLURAL.has(name)
      ? `${Name} zijn te lang voor deze slide en zo klein mogelijk gemaakt. Maak ze korter of verdeel ze over twee slides.`
      : `${Name} is te lang voor deze slide en is zo klein mogelijk gemaakt. Maak de tekst korter of verdeel hem over twee slides.`;
  }

  // Het blok of vak van een canvas dat niet past ('bmc:proposities'): de tekening zet het achter het canvas
  const overPart = (keys, key) => (keys || []).find((k) => k.startsWith(`${key}:`)) || null;

  function syncWarning() {
    const keys = lastInfo.overflowKeys || [];
    warningKey = keys[0] || (lastInfo.overflow ? 'title' : null);
    el.warning.hidden = !warningKey;
    if (!warningKey) return;
    el.warningText.textContent = overflowText(current(), warningKey);
    // Komt de tekst uit het voorstel, dan naar het veld in het formulier (Voorstel of Prijzen);
    // past een canvas niet, dan naar het blok of vak dat te lang is
    const target = regionTarget(overPart(keys, warningKey) || warningKey);
    el.warningBtn.textContent = `naar ${target && target.name ? target.name : D.nameOf(current(), warningKey).name}`;
  }
  el.warningBtn.addEventListener('click', () => {
    const target = warningKey && regionTarget(overPart(lastInfo.overflowKeys, warningKey) || warningKey);
    if (target && target.field) shell.reveal(target.section, target.field);
  });

  // Het vak van de foto op de slide (ontwerp-px): zeshoek of halve slide
  function photoBox(slide) {
    if (slide.layout === 'split') return { w: S.W / 2, h: S.H };
    // Een logo past in zijn geheel in het vak op de witte zeshoek (templates.js: GEOM.heroLogo)
    const L = S.GEOM.heroLogo;
    if (isLogo(slide) && L) return L.box || { w: L.r * L.w, h: L.r * L.h };
    const { r } = S.GEOM.hero;
    return { w: r * Math.sqrt(3), h: r * 2 };
  }

  // Is een logo (bijna) wit? Eén keer per foto: verkleind op 64 × 64 px, de gemiddelde relatieve
  // luminantie van wat niet doorzichtig is. Alleen met doorzichtige delen: een logo op een eigen
  // witte achtergrond (jpg) valt niet weg. Niet te lezen (SecurityError): dan niet controleren
  const whiteLogos = new Map();
  function isWhiteLogo(key, img) {
    if (!key || !img) return false;
    if (whiteLogos.has(key)) return whiteLogos.get(key);
    let white = false;
    try {
      const size = 64;
      const iw = img.naturalWidth || size;
      const ih = img.naturalHeight || size;
      const k = Math.min(size / iw, size / ih);
      const dw = Math.max(1, Math.round(iw * k));
      const dh = Math.max(1, Math.round(ih * k));
      const c = document.createElement('canvas');
      c.width = dw;
      c.height = dh;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, dw, dh);
      const { data } = ctx.getImageData(0, 0, dw, dh);
      const lin = (v) => (v <= 10.31 ? v / 3294.6 : ((v / 255 + 0.055) / 1.055) ** 2.4);   // sRGB → lineair
      let sum = 0;
      let solid = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] <= 128) continue;
        sum += 0.2126 * lin(data[i]) + 0.7152 * lin(data[i + 1]) + 0.0722 * lin(data[i + 2]);
        solid += 1;
      }
      const clear = data.length / 4 - solid;
      white = solid > 0 && clear >= 0.02 * (data.length / 4) && sum / solid >= 0.85;
    } catch (err) {
      white = false;
    }
    whiteLogos.set(key, white);
    return white;
  }

  // Is de foto groot genoeg voor de gekozen resolutie?
  function photoCheck(index, width = state.exportWidth) {
    const slide = state.slides[index];
    const photo = photoOf(slide);
    if (!photo || !PHOTO_LAYOUTS.has(slide.layout)) return { level: 'ok', message: '' };
    const box = photoBox(slide);
    const { naturalWidth: w, naturalHeight: h } = photo.img;
    if (isLogo(slide)) {
      // Een wit logo valt weg op de witte zeshoek (white: geen kwestie van resolutie)
      if (isWhiteLogo(slide.photoKey, photo.img)) {
        return { level: 'waarschuwing', white: true, message: 'Dit logo is (bijna) wit en valt weg op de witte zeshoek. Kies de gekleurde of donkere versie.' };
      }
      // Een SVG is overal scherp; anders de maat waarop het logo er in zijn geheel in komt
      if (/svg/i.test(photo.file.type || '') || /\.svg$/i.test(photo.file.name || '')) return { level: 'ok', message: '' };
      const k = Math.min(box.w / w, box.h / h);
      const res = PM.brand.photoCheck(w, h, w * k, h * k, width / S.W);
      return { ...res, message: res.message.replace('Deze foto', 'Dit logo').replace('een foto', 'een logo') };
    }
    return PM.brand.photoCheck(w, h, box.w, box.h, width / S.W, { zoom: slide.crop.zoom });
  }

  function syncPhotoCheck() {
    const res = photoCheck(state.active);
    const warn = res.level !== 'ok';
    const text = warn && !res.white && state.exportWidth === 3840 ? `In 4K: ${res.message.charAt(0).toLowerCase()}${res.message.slice(1)}` : res.message;
    for (const node of [el.photoNote, el.photoStageNote]) {
      node.hidden = !warn;
      node.classList.toggle('notice-error', res.level === 'te-klein');
      node.classList.toggle('notice-warn', res.level !== 'te-klein');
    }
    el.photoNote.textContent = text;
    el.photoStageText.textContent = text;
    el.photoStageBtn.textContent = isLogo() ? 'ander logo' : 'andere foto';
  }
  $('#photoStageBtn').addEventListener('click', () => {
    shell.open('foto');
    if (el.photoCard.hidden) el.photoDrop.focus();
    else $('#photoReplace').focus();
  });

  // Lege fotoplek: de slide zelf is de uploadknop, zoals een placeholder in Canva
  function syncPhotoPrompt() {
    const s = current();
    const empty = PHOTO_LAYOUTS.has(s.layout) && !photoOf(s);
    const word = photoWord(s);
    el.previewPhotoBtn.hidden = !empty;
    el.previewPhotoTxt.textContent = word;   // "foto" of "logo"; " toevoegen" staat erachter (smal: alleen voor schermlezers)
    el.canvas.classList.toggle('needs-photo', empty);
    el.canvas.tabIndex = empty || lastInfo.photo ? 0 : -1;
    el.canvas.setAttribute('aria-label', empty
      ? `Slide ${state.active + 1}. Druk op Enter om een ${word} te kiezen.`
      : lastInfo.photo ? `Slide ${state.active + 1}. Verschuif de foto met de pijltjestoetsen.` : `Slide ${state.active + 1}`);
  }

  /* ---------------------------------------------------------------------------
     Velden <-> toestand
     ------------------------------------------------------------------------- */

  // De layouts van het voorstel en de positionering (types) alleen bij die soorten
  function buildLayoutTiles() {
    el.layoutGrid.innerHTML = S.LAYOUTS.filter((l) => !l.types || l.types.includes(state.type)).map((l) => `
      <label class="layout-tile">
        <input type="radio" name="layout" value="${l.id}">
        <canvas data-layout="${l.id}" width="272" height="153" aria-hidden="true"></canvas>
        <b>${PM.esc(layoutName(l))}</b><i>${PM.esc(l.sub)}</i>
      </label>`).join('');
  }

  // Een veld dat per layout anders heet of anders nadruk geeft (cyaan of vet)
  function setField(sel, mode, label) {
    const source = $(sel);
    const rf = PM.richfield.of(source);
    const target = rf ? rf.editor : source;
    const before = `${target.dataset.toolbar}|${target.dataset.toolbarLabel}`;
    target.dataset.toolbar = mode;
    target.dataset.toolbarLabel = label;
    if (rf) {
      rf.editor.classList.toggle('rf--vet', mode === 'vet');
      rf.editor.classList.toggle('rf--nadruk', mode === 'nadruk');
    }
    if (toolbar.field === target && before !== `${mode}|${label}`) {
      toolbar.detach();
      toolbar.attach(target);
    }
  }

  // De soort zoals de slide hem tekent: een citaat, tenzij het een kerncijfer is (deck.js), ook bij de
  // waardepropositie van de positionering ('vol') die je naar Citaat omzet. Alleen het beeld: terug naar
  // de waardepropositie is hij weer vol
  const styleOf = (s) => (s.layout === 'quote' && s.style !== 'stat' ? 'quote' : s.style);

  function syncVisibility() {
    const s = current();
    const keys = [s.layout, `${s.layout}.${styleOf(s)}`];
    // data-for: bij welke layouts; data-type: alleen bij deze soorten presentatie (lijst)
    for (const n of $$('[data-for], [data-type]', el.app)) {
      const forLayout = !n.dataset.for || n.dataset.for.split(/\s+/).some((k) => keys.includes(k));
      n.hidden = !forLayout || (!!n.dataset.type && !n.dataset.type.split(/\s+/).includes(state.type));
    }
    // Formulier: wat bij een onderdeel hoort alleen als dat onderdeel aan staat
    for (const n of $$('[data-form-if]', el.editor)) n.hidden = !(state.form && isGen() && deck().isOn(state.form, n.dataset.formIf));
    syncRestore();
    syncPosNote();
    for (const n of $$('[data-layout-text]', el.app)) {
      const map = Object.fromEntries(n.dataset.layoutText.split('|').map((p) => [p.slice(0, p.indexOf(':')), p.slice(p.indexOf(':') + 1)]));
      // Eerst voor deze plek in de presentatie (vragen@agenda: de onderdelen van de positionering), dan de soort, dan de layout
      const text = [`${s.layout}@${s.role}`, keys[1], s.layout].map((k) => map[k]).find((t) => t != null);
      if (text != null) n.textContent = text;
    }
    // Nadruk: in titel en citaat altijd cyaan; in de tekst van een afsluiter en bij een kerncijfer ook,
    // verder betekent ** vet (wit en vet op de slide)
    setField('#sSubtitle', s.layout === 'quote' ? 'nadruk' : 'vet', D.nameOf(s, 'subtitle').label);
    setField('#sBody', s.layout === 'closing' ? 'nadruk' : 'vet', D.nameOf(s, 'body').label);
    setField('#sAuthor', 'vet', D.nameOf(s, 'author').label);
    // De rondleiding wijst de hoofdtekst van deze slide aan: de titel, of het citaat. Alleen bij
    // een gewone presentatie: anders maakt het formulier de titels (typ je er een over, dan volgt
    // hij het niet meer)
    $$('[data-tour="titel"]').forEach((n) => n.removeAttribute('data-tour'));
    if (state.type === 'regulier') $(keys[1] === 'quote.quote' ? '#sQuote' : '#sTitle').closest('.field').dataset.tour = 'titel';
    // Een onderdeel dat bij deze layout niet bestaat: uit, met de reden erbij
    if (PHOTO_LAYOUTS.has(s.layout)) shell.enable('foto');
    else shell.disable('foto', `${NOUN[s.layout] || 'Deze layout'} heeft geen foto. Kies onder Layout een titelslide, beeld + tekst of afsluiter.`);
    el.dropHint.textContent = PHOTO_LAYOUTS.has(s.layout)
      ? 'laat los om de foto op deze slide te zetten'
      : `${NOUN[s.layout] || 'Deze layout'} heeft geen foto. Laat los, dan kun je beeld + tekst kiezen.`;
  }

  function syncInputs() {
    const s = current();
    for (const input of $$('[data-bind]', el.editor)) {
      const value = input.dataset.bind === 'style' ? styleOf(s) : s[input.dataset.bind];
      if (input.type === 'radio') input.checked = input.value === value;
      else {
        const text = value == null ? '' : String(value);
        if (input.value !== text) input.value = text;
      }
    }
    // De vakken en blokken van een canvas (van deze slide); niet in het veld waarin je typt
    for (const input of $$('[data-vpc]', el.editor)) {
      const text = String((s.vpc || {})[input.dataset.vpc] || '');
      if (input !== typingIn && input.value !== text) input.value = text;
    }
    for (const input of $$('[data-bmc]', el.editor)) {
      const text = String((s.bmc || {})[input.dataset.bmc] || '');
      if (input !== typingIn && input.value !== text) input.value = text;
    }
    $$('input[name="layout"]', el.layoutGrid).forEach((r) => { r.checked = r.value === s.layout; });
    $$('input[name="deckType"]', el.deckTypeGrid).forEach((r) => { r.checked = r.value === state.type; });
    el.showNumbers.checked = state.showNumbers !== false;
    el.dot.checked = state.dot !== false;
    el.badge.checked = !!state.badge;
    $$('input[name="res"]').forEach((r) => { r.checked = Number(r.value) === state.exportWidth; });
    syncFormInputs();
    syncCrop();
    syncPhotoUI();
    renderTableEditor();
    toolbar.refresh();
  }

  // Het formulier van deze soort uit state.form (alleen de velden in zijn eigen panelen:
  // data-form-deck). Alleen schrijven wat anders is, en nooit in het veld waarin je typt:
  // anders springt de cursor bij elke letter
  let typingIn = null;
  function syncFormInputs() {
    if (!state.form || !isGen()) return;
    const own = `[data-form-deck="${state.type}"]`;
    for (const input of $$(`${own} [data-form]`, el.editor)) {
      const value = deck().get(state.form, input.dataset.form);
      if (input.type === 'radio') input.checked = input.value === value;
      else if (input.type === 'checkbox') input.checked = !!value;
      else if (input !== typingIn) {
        const text = value == null ? '' : String(value);
        if (input.value !== text) input.value = text;
      }
    }
    for (const input of $$(`${own} [data-form-on]`, el.editor)) input.checked = deck().isOn(state.form, input.dataset.formOn);
    if (!isVoorstel()) return;
    // Leeg = de punten uit de onderdelen: die staan als voorbeeld in het veld
    el.pDiensten.placeholder = deck().services(state.form).join('\n');
    PRICE_GROUPS.forEach(syncPriceRows);
    syncPriceNote();
  }

  function syncAll() {
    applyType();
    syncVisibility();
    syncInputs();
    syncStrip();
  }

  /* ---------------------------------------------------------------------------
     Soort presentatie: gewoon, voorstel of positionering
     ------------------------------------------------------------------------- */

  let shownType = null;

  // Rail, layouts en de linkknop "nieuw …" passen bij de soort (na laden, wisselen en ongedaan maken)
  function applyType() {
    if (shownType === state.type) return;
    shownType = state.type;
    syncDeckTabs();
    // CSS: zes of zeven tabs op een smal scherm
    el.app.classList.toggle('is-voorstel', state.type === 'voorstel');
    el.app.classList.toggle('is-positionering', state.type === 'positionering');
    // Een paneel van een andere soort open (of als laatste open): naar het formulier van deze
    // soort, of bij een gewone presentatie naar Inhoud. Was er niets open, dan blijft dat zo
    const foreign = (id) => Object.keys(DECK_UI).some((t) => t !== state.type && DECK_UI[t].tabs.includes(id));
    if (foreign(shell.current) || foreign(shell.last)) {
      const wasOpen = !!shell.current;
      shell.open(isGen() ? DECK_UI[state.type].panel : 'inhoud');
      if (!wasOpen) shell.close({ focusRail: false });
    }
    buildLayoutTiles();
    if (shell.current === 'layout') renderLayoutTiles();
    el.resetBtn.textContent = isGen() ? DECK_UI[state.type].newLabel : 'nieuwe presentatie';
    // Het stipje op hulp hoort bij de rondleiding van deze soort
    if (shell.syncTour) shell.syncTour();
  }

  // Het formulier opnieuw op de slides leggen; de gekozen slide blijft dezelfde (op id).
  // Een slide die uit gaat, gaat de parkeerplek in; een die terugkomt, komt daar vandaan
  function resync() {
    const id = current() && current().id;
    const res = deck().sync(state.slides, deck().build(state.form), make, state.parked);
    state.slides = res.slides;
    if (isObj(res.parked)) state.parked = res.parked;
    const i = state.slides.findIndex((s) => s.id === id);
    state.active = i >= 0 ? i : clampIndex(state.active, state.slides);
    return res;
  }

  // Elke wijziging in het formulier: de slides meteen bij. Typen in één veld is één stap
  function regenerate(key) {
    const res = resync();
    syncAll();
    changed(key);
    // Een slide die terugkomt van de parkeerplek kan een foto of logo hebben
    if (res.added && res.added.length) applyPhotos();
    return res;
  }

  // Hoeveel slides het formulier met deze keuzes geeft (proef op een kopie)
  const countFor = (form) => deck().sync(JSON.parse(JSON.stringify(state.slides)), deck().build(form), make, state.parked).slides.length;
  // Minstens één slide en niet meer dan het maximum
  function fits(form) {
    const n = countFor(form);
    return n >= 1 && n <= MAX_SLIDES;
  }

  // Naar de slide met deze rol (als hij er is)
  function selectRole(role) {
    const i = role ? state.slides.findIndex((s) => s.role === role) : -1;
    if (i >= 0 && i !== state.active) selectSlide(i);
  }

  // De preview volgt het formulier: de slide die dit veld maakt (FEEDS)
  const follow = (path) => { if (isGen() && deck().FEEDS) selectRole(deck().FEEDS[path]); };

  // Een onderdeel aan of uit. Aan kan niet als het maximum aantal slides al bereikt is, uit niet
  // als het de laatste slide is; gaat hij aan, dan toont de preview zijn (eerste) slide. SEA in het
  // voorstel heeft er geen: dan de aanpak
  function setPart(part, on, input) {
    const next = JSON.parse(JSON.stringify(state.form));
    deck().setOn(next, part, on);
    const n = countFor(next);
    if (n === 0) {
      input.checked = true;
      toast('Een presentatie heeft minstens één slide.');
      return;
    }
    if (n > MAX_SLIDES) {
      input.checked = false;
      toast(`Hoogstens ${MAX_SLIDES} slides: haal eerst een slide weg, dan kan ${deck().ROLE_NAMES[part]} erbij.`, true);
      return;
    }
    state.form = next;
    const res = regenerate(null);
    if (!on) return;
    if (res.added && res.added.length) selectRole(res.added[0]);
    else if (isVoorstel()) selectRole(deck().ROLES.includes(part) ? part : 'aanpak');
  }

  // Vaste slides die je uit het formulier verwijderde: hier zet je ze terug (elk formulier zijn eigen melding)
  function syncRestore() {
    for (const [t, e] of Object.entries(deckEl)) {
      const R = DECKS[t];
      if (!e.restore) continue;
      const gone = t === state.type && state.form && R ? R.hiddenRoles(state.form) : [];
      e.restore.hidden = !gone.length;
      if (gone.length) e.restoreText.textContent = `Uit ${DECK_UI[t].noun} gehaald: ${gone.map((r) => R.ROLE_NAMES[r]).join(', ')}.`;
    }
  }

  function restoreHidden() {
    if (!isGen()) return;
    const names = deck().hiddenRoles(state.form).map((r) => deck().ROLE_NAMES[r]);
    const next = { ...JSON.parse(JSON.stringify(state.form)), hidden: [] };
    if (!fits(next)) {
      toast(`Hoogstens ${MAX_SLIDES} slides: haal eerst een paar slides weg.`, true);
      return;
    }
    state.form = next;
    const res = regenerate(null);
    if (res.added && res.added.length) selectRole(res.added[0]);
    // De melding verdwijnt: de focus naar de miniatuur van de slide die terugkwam (op een smal
    // scherm is de strook weg zolang het blad open is: dan naar de lijst erboven)
    const e = deckEl[state.type];
    const spot = [el.strip.querySelector('.strip__item[aria-selected="true"]'), ...$$('[data-check-item]', e.checkList).reverse(), e.klant]
      .find((n) => n && n.getClientRects().length);
    if (spot) spot.focus({ preventScroll: true });
    toast(`Terug in ${DECK_UI[state.type].noun}: ${names.join(', ')}.`, false, { label: 'ongedaan maken', run: () => history.undo() });
  }
  Object.values(deckEl).forEach((e) => { if (e.restoreBtn) e.restoreBtn.addEventListener('click', restoreHidden); });

  // In Inhoud: deze slide komt uit het formulier, en of je hem zelf hebt aangepast. Bij een
  // canvas en een toelichting (positionering) schrijf je de inhoud juist hier
  function syncPosNote() {
    const s = current();
    const R = deck();
    const on = !!R && !!s.role && R.ROLES.includes(s.role);
    el.posNote.hidden = !on;
    if (!on) return;
    const touched = R.touched(s).length > 0;
    const canvas = s.role === 'vpc' || s.role === 'bmc';
    const link = R.LINKS[s.role];
    const noun = DECK_UI[state.type].noun;
    let text;
    if (touched) text = `Je hebt deze slide zelf aangepast; ${noun} werkt alleen de andere velden bij.`;
    else if (link) text = `Deze slide licht ${link.role === 'vpc' ? 'het vak' : 'het blok'} ${R.ROLE_NAMES[s.role]} toe. Schrijf de toelichting hier; het formulier laat je tekst met rust.`;
    else if (canvas) text = `Deze slide komt uit ${noun}; de ${s.role === 'bmc' ? 'blokken' : 'vakken'} vul je hier in.`;
    else text = `Deze slide volgt ${noun}. Wat je hier zelf typt, blijft staan; de rest werkt het formulier bij.`;
    if (el.posNoteText.textContent !== text) el.posNoteText.textContent = text;
    el.posResetBtn.hidden = !touched;
    // Een canvas en een toelichting staan niet in het formulier: dan geen "naar …" (bij een canvas
    // ook geen uitleg daarover). Een toelichting brengt je naar zijn blok op het canvas
    el.posNoteGo.hidden = canvas || !!link;
    el.posNoteHelp.hidden = canvas;
    el.posNoteGo.textContent = isVoorstel() && s.role === 'investering' ? 'naar prijzen' : DECK_UI[state.type].go;
    const canvasSlide = link ? state.slides.find((x) => x.role === link.role && x.layout === link.role) : null;
    el.posNoteCanvas.hidden = !canvasSlide;
  }

  // Van een toelichting naar zijn blok of vak op het canvas (bij Inhoud)
  el.posNoteCanvas.addEventListener('click', () => {
    const link = isGen() && deck().LINKS[current().role];
    if (!link) return;
    const i = state.slides.findIndex((x) => x.role === link.role && x.layout === link.role);
    if (i < 0) return;
    selectSlide(i);
    shell.reveal('inhoud', link.role === 'bmc' ? bmcTarget(link.key).field : vpcTarget(link.key).field);
  });

  // Terugzetten: de slide volgt weer helemaal het formulier (een toelichting die je schreef, blijft)
  el.posResetBtn.addEventListener('click', () => {
    const s = current();
    const spec = isGen() && s.role ? deck().specFor(state.form, s.role) : null;
    if (!spec) return;
    state.slides[state.active] = deck().resetSlide(s, spec);
    syncAll();
    changed(null);
    // De knop verdwijnt: de focus naar de melding zelf
    el.posNote.focus({ preventScroll: true });
    toast(`De slide volgt ${DECK_UI[state.type].noun} weer.`, false, { label: 'ongedaan maken', run: () => history.undo() });
  });

  // Klantlogo (voorstel) of foto (positionering): via de titelslide (in IndexedDB, zoals elke foto)
  function syncLogo() {
    const cover = isGen() ? state.slides.find((s) => s.role === 'cover') : null;
    const has = !!photoOf(cover);
    if (isVoorstel()) {
      el.pLogoBtn.disabled = !cover;
      el.pLogoBtn.title = cover ? '' : 'de titelslide staat uit';
      el.pLogoBtn.textContent = has ? 'ander logo' : 'logo kiezen';
      el.pLogoState.textContent = !cover ? 'de titelslide staat uit' : has ? 'staat op de titelslide' : 'nog geen logo';
    } else if (state.type === 'positionering' && isGen()) {
      el.psFotoBtn.disabled = !cover;
      el.psFotoBtn.title = cover ? '' : 'de titelslide staat uit';
      el.psFotoBtn.textContent = !has ? 'foto kiezen' : isLogo(cover) ? 'ander logo' : 'andere foto';
      el.psFotoState.textContent = !cover ? 'de titelslide staat uit' : has ? 'staat op de titelslide' : 'nog geen foto';
    }
  }

  // Je blijft in het formulier: het logo of de foto komt op de titelslide (vervangen of weghalen kan bij Foto)
  function pickCoverPhoto() {
    const i = state.slides.findIndex((s) => s.role === 'cover');
    if (i < 0) return;
    selectSlide(i);
    pickPhoto();
  }
  el.pLogoBtn.addEventListener('click', pickCoverPhoto);
  el.psFotoBtn.addEventListener('click', pickCoverPhoto);

  /* --- Wisselen van soort en opnieuw beginnen --- */

  // Een nieuwe presentatie (voorbeeldslides), of een nieuw voorstel of een nieuwe positionering:
  // leeg formulier, dus overal [klantnaam] tot je hem invult (ook niet de naam uit een voorstel)
  function freshDeck(type) {
    if (type === 'regulier' || !DECKS[type]) return { slides: exampleSlides(), active: 0, form: null, parked: {} };
    const form = DECKS[type].defaults(today());
    return { slides: deckSlides(type, form), active: 0, form, parked: {} };
  }

  // Na wisselen of opnieuw beginnen: alles bij, één stap om ongedaan te maken. Een voorstel of
  // positionering begint bij het formulier, een nieuwe met de cursor in de klantnaam
  function afterSwitch(fresh) {
    syncAll();
    changed(null);
    applyPhotos();
    if (!isGen()) return;
    shell.open(DECK_UI[state.type].panel, { focus: fresh && !shell.isNarrow ? deckEl[state.type].klant : true });
  }

  // Wisselen van soort: wat openstaat gaat de bewaarplek in, de andere komt eruit (of een nieuwe).
  // Zo raak je niets kwijt; ongedaan maken draait de wissel ook terug
  function switchType(type, { atStart = false } = {}) {
    if (type === state.type || !TYPES.includes(type) || (type !== 'regulier' && !DECKS[type])) return;
    const from = state.type;
    const back = state.stash[type];
    // Elke soort houdt zijn eigen slidenummers; een nieuwe begint zonder
    const keep = { slides: state.slides, active: state.active, showNumbers: state.showNumbers };
    if (from !== 'regulier') Object.assign(keep, { form: state.form, parked: state.parked });
    state.stash = { ...state.stash, [from]: keep, [type]: null };
    Object.assign(state, back ? { form: null, parked: {}, ...back } : { ...freshDeck(type), showNumbers: false }, { type });
    afterSwitch(!back);
    const text = {
      regulier: back ? 'Terug in je presentatie.' : 'Nieuwe presentatie gestart met de voorbeeldslides.',
      voorstel: back ? 'Terug in je voorstel.' : 'Nieuw voorstel: vul de gegevens van de klant in.',
      positionering: back ? 'Terug in je positionering.' : 'Nieuwe positionering: vul de klantnaam in.',
    }[type];
    toast(`${text} ${OWN[from]} blijft bewaard bij Soort.`, false, { label: 'ongedaan maken', run: () => history.undo() });
    // Eerste keer een voorstel of positionering: zijn eigen rondleiding (bij het laden doet de shell dat)
    if (type !== 'regulier' && !atStart && PM.tour) PM.tour.auto(type, { quickStart: false });
  }

  // Opnieuw beginnen met de soort die openstaat: meteen, met "ongedaan maken" in de melding in
  // plaats van een vraag vooraf. De andere soorten blijven bewaard, de badge blijft zoals hij stond
  function startDeck(type) {
    Object.assign(state, freshDeck(type), { type, dot: true, showNumbers: false });
    state.stash = { ...state.stash, [type]: null };
    afterSwitch(true);
    if (lib) lib.detach();
    if (aiSaver) aiSaver.stop();
    const undo = { label: 'ongedaan maken', run: () => history.undo() };
    const text = {
      regulier: 'Nieuwe presentatie gestart met de voorbeeldslides.',
      voorstel: 'Nieuw voorstel gestart. Vul bij Voorstel de gegevens van de klant in.',
      positionering: 'Nieuwe positionering gestart. Vul bij Gegevens de klantnaam in.',
    }[type];
    toast(text, false, undo);
  }

  el.resetBtn.addEventListener('click', () => startDeck(state.type));
  shell.onAction('nieuw-voorstel', () => startDeck('voorstel'));
  shell.onAction('nieuwe-positionering', () => startDeck('positionering'));

  // Emerce 100-badge: de schakelaar staat in de kop van de preview (buiten het formulier)
  // en geldt voor elke slide, ook in PDF, PowerPoint en PNG
  el.badge.addEventListener('change', () => {
    state.badge = el.badge.checked;
    changed(null);
    if (state.badge) toast('Emerce 100-badge staat aan: klein rechtsonder op elke slide.');
  });

  /* ---------------------------------------------------------------------------
     Prijzen: regels zoals de offerteregels van de Document Maker. Het raster
     wordt alleen opnieuw opgebouwd als het aantal regels verandert, niet bij
     typen, zodat de cursor blijft staan.
     ------------------------------------------------------------------------- */

  // De regels van een groep ({ label, amount }); zonder regels één lege om in te typen
  const priceList = (group) => (isVoorstel() && state.form ? deck().get(state.form, group) : []);
  const priceRowsOf = (group) => {
    const list = priceList(group);
    return list.length ? list : [{ label: '', amount: '' }];
  };
  const priceSel = (group, row = 0) => `[data-price-rows="${group}"] [data-price-row="${Math.max(0, Math.min(row, priceRowsOf(group).length - 1))}"][data-price-field="label"]`;
  const priceGroupOf = (input) => { const box = input.closest('[data-price-rows]'); return box ? box.dataset.priceRows : null; };

  function priceRowHtml(group, row, i) {
    const n = i + 1;
    const example = group === 'eenmalig' && i === 0;
    return `<div class="item" role="row">
        <input class="input item__desc" role="cell" aria-label="Omschrijving, ${group} regel ${n}" data-price-row="${i}" data-price-field="label" value="${PM.esc(row.label)}" maxlength="160" placeholder="${example ? 'bijv. Positionering en merkverhaal' : 'Omschrijving'}">
        <input class="input input--amount item__price" role="cell" aria-label="Bedrag, ${group} regel ${n}" autocomplete="off" spellcheck="false" data-price-row="${i}" data-price-field="amount" value="${PM.esc(row.amount)}" maxlength="160" placeholder="${example ? 'bijv. 1500' : '€'}">
        <button type="button" class="iconbtn item__del" data-price-del="${i}" aria-label="Regel ${n} verwijderen">&times;</button>
      </div>`;
  }

  function syncPriceRows(group) {
    const box = el.priceRows[group];
    if (!box || !isVoorstel()) return;
    const rows = priceRowsOf(group);
    if (box.children.length !== rows.length) {
      // Stond je in een regel, dan blijf je daar
      const at = box.contains(document.activeElement) ? document.activeElement : null;
      const spot = at && at.dataset.priceRow != null ? [Number(at.dataset.priceRow), at.dataset.priceField || 'del'] : null;
      box.innerHTML = rows.map((row, i) => priceRowHtml(group, row, i)).join('');
      if (spot) {
        const i = Math.min(spot[0], rows.length - 1);
        const back = $(spot[1] === 'del' ? `[data-price-del="${i}"]` : `[data-price-row="${i}"][data-price-field="${spot[1]}"]`, box);
        if (back) back.focus();
      }
    } else {
      rows.forEach((row, i) => {
        for (const field of ['label', 'amount']) {
          const input = $(`[data-price-row="${i}"][data-price-field="${field}"]`, box);
          if (input && input !== typingIn && input.value !== row[field]) input.value = row[field];
        }
      });
    }
    // Eén lege regel: niets om te verwijderen
    const empty = rows.length === 1 && !rows[0].label && !rows[0].amount;
    $$('[data-price-del]', box).forEach((b) => { b.disabled = empty; });
    const add = $(`[data-price-add="${group}"]`);
    if (add) add.disabled = rows.length >= MAX_PRICES;
  }

  // De tabel heeft 14 rijen (met de kopjes Eenmalig en Maandelijks en de totalen): zeg wat wegvalt
  function syncPriceNote() {
    const n = isVoorstel() && state.form ? deck().priceOverflow(state.form) : 0;
    el.pPriceNote.hidden = !n;
    if (n) el.pPriceNote.textContent = `Er passen 14 regels in de tabel; ${n === 1 ? '1 regel valt' : `${n} regels vallen`} weg. Maak regels korter of zet regels samen.`;
  }

  // Een nieuwe lijst regels opslaan: tabel en preview meteen bij
  function setPrices(group, list, key = null) {
    deck().set(state.form, group, list);
    follow(group);
    regenerate(key);
  }

  function focusPrice(group, i, field = 'label') {
    const input = $(`[data-price-row="${i}"][data-price-field="${field}"]`, el.priceRows[group]);
    if (input) input.focus();
  }

  // Typen in een regel: één stap per veld, zoals elk ander veld
  function priceInput(t) {
    const group = priceGroupOf(t);
    const i = Number(t.dataset.priceRow);
    const list = priceRowsOf(group);
    if (!group || !list[i]) return;
    list[i][t.dataset.priceField] = t.value;
    typingIn = t;
    try {
      setPrices(group, list, `form.${group}.${i}.${t.dataset.priceField}`);
    } finally {
      typingIn = null;
    }
  }

  function addPrice(group, { focus = true } = {}) {
    const list = priceRowsOf(group);
    if (list.length >= MAX_PRICES) {
      toast(`Hoogstens ${MAX_PRICES} regels per groep: meer past niet in de tabel.`, true);
      return false;
    }
    list.push({ label: '', amount: '' });
    setPrices(group, list);
    if (focus) focusPrice(group, list.length - 1);
    return true;
  }

  // Een knop die (nog) focus kan krijgen, of null
  const focusable = (sel) => { const b = $(sel); return b && !b.disabled ? b : null; };

  $$('[data-price-add]').forEach((btn) => btn.addEventListener('click', () => addPrice(btn.dataset.priceAdd)));

  PRICE_GROUPS.forEach((group) => {
    const box = el.priceRows[group];
    // Enter: naar hetzelfde veld een regel lager, en aan het eind een nieuwe regel
    box.addEventListener('keydown', (e) => {
      const t = e.target;
      if (e.key !== 'Enter' || !t.dataset || !t.dataset.priceField || e.isComposing) return;
      e.preventDefault();
      const i = Number(t.dataset.priceRow);
      if (i < priceRowsOf(group).length - 1) focusPrice(group, i + 1, t.dataset.priceField);
      else addPrice(group);
    });
    // Weghalen gaat meteen, met "ongedaan maken" in de melding
    box.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-price-del]');
      if (!btn || btn.disabled) return;
      const i = Number(btn.dataset.priceDel);
      const list = priceRowsOf(group);
      const label = list[i] ? list[i].label.replace(/\*\*/g, '').trim() : '';
      list.splice(i, 1);
      setPrices(group, list);
      // Focus niet kwijt: naar dezelfde plek, anders naar "regel toevoegen"
      const next = $$('[data-price-del]:not(:disabled)', box)[Math.min(i, priceRowsOf(group).length - 1)] || focusable(`[data-price-add="${group}"]`) || $('[data-price-field="label"]', box);
      if (next) next.focus();
      toast(label ? `Regel “${label}” verwijderd.` : 'Regel verwijderd.', false, { label: 'ongedaan maken', run: () => history.undo() });
    });
    // Plakken uit Excel of Google Sheets (omschrijving en bedrag), of regels als "GA4-audit: 550"
    box.addEventListener('paste', (e) => {
      const t = e.target;
      const text = e.clipboardData && e.clipboardData.getData('text/plain');
      if (!t.dataset || !t.dataset.priceField || !text || !/[\t\n]/.test(text.replace(/\r?\n$/, ''))) return;
      e.preventDefault();
      const rows = deck().parsePrices(text).map(({ label, amount }) => ({ label, amount }));
      if (!rows.length) return;
      const at = Number(t.dataset.priceRow);
      const list = priceRowsOf(group);
      rows.forEach((row, n) => { list[at + n] = row; });
      const cut = list.length > MAX_PRICES;
      setPrices(group, list.slice(0, MAX_PRICES));
      focusPrice(group, Math.min(at + rows.length - 1, MAX_PRICES - 1), 'amount');
      const n = Math.min(rows.length, MAX_PRICES - at);
      toast(cut ? `Geplakt, maar er passen ${MAX_PRICES} regels per groep.` : `${n} ${n === 1 ? 'regel' : 'regels'} geplakt.`, cut, { label: 'ongedaan maken', run: () => history.undo() });
    });
  });

  /* ---------------------------------------------------------------------------
     Klaar om te versturen? Wat nog ontbreekt, bovenaan het formulier (checklist
     van het recept). Dezelfde controle als vóór het downloaden, maar dan al
     tijdens het werk
     ------------------------------------------------------------------------- */

  // Invulplekken (met de eerste als voorbeeld) en slides met tekst die niet past
  function checkCounts() {
    const issues = checkIssues();
    let placeholders = 0;
    let first = '';
    for (const slide of state.slides) {
      for (const f of D.fields(slide)) {
        const values = f.key === 'table' ? slide.table.cells.flat()
          : f.key === 'vpc' || f.key === 'bmc' ? Object.values(slide[f.key] || {}) : [slide[f.key]];
        for (const v of values) {
          const found = D.placeholders(String(v == null ? '' : v));
          placeholders += found.length;
          if (!first && found.length) first = found[0];
        }
      }
    }
    return { placeholders, overflow: issues.filter((x) => x.kind === 'te-lang').length, first, issues };
  }

  // De lijst van de soort die openstaat; elk formulier heeft zijn eigen lijst (en zijn eigen html)
  let checkItems = [];
  const checkHtml = {};
  function syncChecklist() {
    for (const [t, e] of Object.entries(deckEl)) if (t !== state.type) e.check.hidden = true;
    const e = deckEl[state.type];
    if (!e) return;
    e.check.hidden = !isGen();
    if (!isGen()) return;
    checkItems = deck().checklist(state.form, state.slides, checkCounts()) || [];
    const need = checkItems.filter((x) => !x.optional);
    const done = need.filter((x) => x.done).length;
    e.checkCount.textContent = done === need.length ? 'alles klaar' : `${done} van ${need.length}`;
    const html = checkItems.map((x, i) => `<li><button type="button" class="pos-check__item${x.done ? ' is-done' : ''}" data-check-item="${i}">`
      + `<span class="pos-check__mark" aria-hidden="true"></span>`
      + `<span class="pos-check__txt">${PM.esc(x.label)}${x.optional ? ' <i>optioneel</i>' : ''}${!x.done && x.hint ? `<small>${PM.esc(x.hint)}</small>` : ''}</span>`
      + `<span class="sr-only">${x.done ? ': klaar' : ': nog doen'}</span></button></li>`).join('');
    // Alleen opnieuw opbouwen als er iets veranderde (de focus blijft op het punt waar je stond)
    if (html !== checkHtml[state.type]) {
      const at = e.checkList.contains(document.activeElement) ? document.activeElement.dataset.checkItem : null;
      e.checkList.innerHTML = html;
      checkHtml[state.type] = html;
      if (at != null) { const b = $(`[data-check-item="${at}"]`, e.checkList); if (b) b.focus(); }
    }
  }

  // Een punt aanklikken: naar het veld, de slide of de invulplek waar het om gaat
  function goCheck(go) {
    if (!isObj(go) || !isGen()) return;
    if (go.issue) {
      const { issues } = checkCounts();
      // De invulplek die de lijst noemt: niet een in de tekst van een toelichting (die telt het recept zelf)
      const counted = (k) => !(deck().CONTENT[state.slides[k.index].role] || []).includes(k.key);
      const x = go.issue === 'overflow' ? issues.find((k) => k.kind === 'te-lang')
        : issues.find((k) => k.kind === 'invulplek' && counted(k)) || issues.find((k) => k.kind === 'invulplek') || issues[0];
      if (x) gotoField(x.index, x.key, x.found);
      return;
    }
    if (go.role) {
      const i = state.slides.findIndex((s) => s.role === go.role);
      if (i < 0) return;
      selectSlide(i);
      // Een canvas: het eerste lege vak (voorstel) of het eerste vak of blok zonder eigen tekst (positionering)
      if (go.role === 'vpc' || go.role === 'bmc') {
        shell.reveal('inhoud', emptyCanvasTarget(current(), go.role).field);
        return;
      }
    }
    // Prijzen: de eerste regel zonder bedrag, anders de eerste
    if (isVoorstel() && go.section === 'prijzen' && !go.field) {
      const rows = priceRowsOf('eenmalig');
      const i = Math.max(0, rows.findIndex((r) => !r.amount.trim()));
      shell.reveal('prijzen', `[data-price-rows="eenmalig"] [data-price-row="${i}"][data-price-field="${rows[i] && rows[i].label.trim() ? 'amount' : 'label'}"]`);
      follow('eenmalig');
      return;
    }
    // Ook na het kiezen van een slide (de toelichting): het veld erbij
    if (go.field) shell.reveal(go.section || DECK_UI[state.type].panel, go.field);
    else if (go.section) shell.open(go.section, { focus: true });
  }

  // Het eerste vak of blok van een canvas dat nog leeg is. Het voorstel zoals altijd (het eerste
  // lege vak); de positionering telt zoals zijn checklist: de zes vakken of zeven blokken, en een
  // invulplek is nog niet geschreven
  function emptyCanvasTarget(slide, key) {
    const open = (v) => (G && state.type === 'positionering' ? !G.written(v) : !v.trim());
    if (key === 'bmc') return bmcTarget(bmcZone(slide, open));
    return vpcTarget(vpcZone(slide, open, state.type === 'positionering' && G ? Object.keys(G.VPC_INFO) : VPC_KEYS));
  }

  Object.values(deckEl).forEach((e) => e.checkList.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-check-item]');
    if (btn) goCheck((checkItems[Number(btn.dataset.checkItem)] || {}).go);
  }));

  function syncCrop() {
    const c = current().crop;
    $('#cropZoom').value = String(Math.round(c.zoom * 100));
    $('#cropZoomVal').textContent = `${Math.round(c.zoom * 100)}%`;
  }

  function setLayout(id) {
    const s = current();
    if (!LAYOUT_IDS.has(id) || s.layout === id) return;
    s.layout = id;
    syncAll();
    changed(null);
    if (shell.current === 'layout') renderLayoutTiles();
  }

  el.editor.addEventListener('submit', (e) => e.preventDefault());

  el.editor.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.bind) {
      if (t.type === 'radio') return;   // via 'change'
      current()[t.dataset.bind] = t.value;
      changed(`${current().id}.${t.dataset.bind}`);
    } else if (t.dataset.crop) {
      current().crop[t.dataset.crop] = Number(t.value) / 100;
      syncCrop();
      changed('zoom');
    } else if (t.dataset.cell) {
      const [r, c] = t.dataset.cell.split(',').map(Number);
      const row = tbl().cells[r];
      if (row) row[c] = t.value;
      changed(`${current().id}.cel.${r},${c}`);
    } else if (t.dataset.vpc) {
      // Een vak van de waardepropositie: van deze slide, zoals elk ander veld bij Inhoud
      const s = current();
      if (!isObj(s.vpc)) s.vpc = emptyVpc();
      s.vpc[t.dataset.vpc] = t.value;
      changed(`${s.id}.vpc.${t.dataset.vpc}`);
    } else if (t.dataset.bmc) {
      // Een blok van het business model canvas: ook van deze slide
      const s = current();
      if (!isObj(s.bmc)) s.bmc = emptyBmc();
      s.bmc[t.dataset.bmc] = t.value;
      changed(`${s.id}.bmc.${t.dataset.bmc}`);
    } else if (t.dataset.priceField && isVoorstel()) {
      priceInput(t);
    } else if (t.dataset.form && state.form && t.closest(`[data-form-deck="${state.type}"]`)) {
      if (t.type === 'radio' || t.type === 'checkbox') return;   // via 'change'
      deck().set(state.form, t.dataset.form, t.value);
      // Niet terugschrijven in het veld waarin je typt; de preview toont de slide die het maakt
      typingIn = t;
      try {
        follow(t.dataset.form);
        regenerate(`form.${t.dataset.form}`);
      } finally {
        typingIn = null;
      }
    }
  });

  el.editor.addEventListener('change', (e) => {
    const t = e.target;
    if (t.name === 'layout' && t.checked) {
      setLayout(t.value);
    } else if (t.name === 'deckType' && t.checked) {
      switchType(t.value);
    } else if (t.dataset.bind && t.type === 'radio' && t.checked) {
      current()[t.dataset.bind] = t.value;
      syncVisibility();
      if (t.dataset.bind === 'photoFit') syncPhotoUI();
      changed(null);
    } else if (t.dataset.formOn && state.form && t.closest(`[data-form-deck="${state.type}"]`)) {
      setPart(t.dataset.formOn, t.checked, t);
    } else if (t.dataset.form && state.form && t.closest(`[data-form-deck="${state.type}"]`) && (t.type === 'checkbox' || (t.type === 'radio' && t.checked))) {
      deck().set(state.form, t.dataset.form, t.type === 'checkbox' ? t.checked : t.value);
      follow(t.dataset.form);
      regenerate(null);
    } else if (t === el.showNumbers) {
      state.showNumbers = t.checked;
      changed(null);
    } else if (t === el.dot) {
      state.dot = t.checked;
      changed(null);
    } else if (t === el.tableHeader || t === el.tableFirstCol) {
      tbl()[t === el.tableHeader ? 'header' : 'firstCol'] = t.checked;
      tableChanged();
    }
  });

  // Naar het formulier vanaf een slide: meteen het veld dat die slide maakt (of zijn schakelaar)
  const ROLE_FIELD = {
    voorstel: {
      cover: '#pKlant', situatie: '#pSituatie', gewenst: '#pGewenst', aanpak: '#pDiensten', interview: '#pNamen',
      vpc: '[data-form-on="vpc"]', website: '[data-form-on="website"]', ga4: '[data-form-on="ga4"]', gbp: '[data-form-on="gbp"]',
      uitvoering: '[data-form-on="uitvoering"]', meetbaar: '[data-form-on="meetbaar"]',
    },
    // Een vaste opbouw zonder schakelaars: de sectieslides volgen de klantnaam, de afsluiter het
    // gekozen aanbod. De slide Onderdelen heeft geen veld: dan opent Gegevens gewoon
    positionering: {
      cover: '#psKlant', afsluiter: '[data-form="aanbod"]:checked',
      sectieBmc: '#psKlant', sectieVpc: '#psKlant', sectieBmcUitleg: '#psKlant', sectieVpcUitleg: '#psKlant',
    },
  };

  // "andere layout", "naar voorstel", "naar prijzen" of "naar gegevens" en bladeren (smal scherm,
  // blad open) in het paneel Inhoud. data-open="voorstel": het formulier van deze soort
  el.editor.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-open]');
    const browse = e.target.closest('[data-browse]');
    if (btn && btn.dataset.open === 'voorstel') {
      if (!isGen()) return;
      const panel = DECK_UI[state.type].panel;
      const role = current().role;
      const field = (ROLE_FIELD[state.type] || {})[role];
      if (isVoorstel() && role === 'investering') shell.reveal('prijzen', priceSel('eenmalig', 0));
      else if (field) shell.reveal(panel, field);
      else shell.open(panel, { focus: e.detail === 0 });
    } else if (btn) shell.open(btn.dataset.open, { focus: e.detail === 0 ? '#layoutGrid input:checked' : false });
    else if (browse) selectSlide(state.active + Number(browse.dataset.browse));
  });

  // De preview volgt het formulier: klik je in een veld, dan toont hij de slide die het maakt
  el.editor.addEventListener('focusin', (e) => {
    if (!isGen()) return;
    const rf = PM.richfield.of(e.target);
    const t = rf ? rf.source : e.target;
    if (!t.dataset) return;
    if (t.dataset.form) follow(t.dataset.form);
    else if (t.dataset.priceField) follow(priceGroupOf(t));
  });

  /* ---------------------------------------------------------------------------
     Tabel bewerken: een raster van invoervelden. Het raster wordt alleen
     opnieuw opgebouwd bij rijen/kolommen toevoegen of weghalen, niet bij
     typen, zodat de cursor blijft staan. De ×-knoppen zijn voor de muis; met
     het toetsenbord gaat Tab van cel naar cel en werken "− rij" en "− kolom"
     op de cel waar je stond.
     ------------------------------------------------------------------------- */

  const LIM = S.TABLE_LIMITS;
  const tbl = () => current().table;
  let lastCell = [0, 0];

  function renderTableEditor(focus) {
    const t = tbl();
    const nR = t.cells.length;
    const nC = t.cells[0].length;
    el.tableHeader.checked = t.header;
    el.tableFirstCol.checked = t.firstCol;
    el.tableGrid.style.setProperty('--cols', nC);
    const colBtns = Array.from({ length: nC }, (_, c) => `<button type="button" class="tbl__del" data-del-col="${c}" tabindex="-1" aria-label="Kolom ${c + 1} verwijderen" title="Kolom ${c + 1} verwijderen"${nC === 1 ? ' disabled' : ''}>&times;</button>`).join('');
    const rows = t.cells.map((row, r) => {
      const head = t.header && r === 0;
      const inputs = row.map((v, c) => `<input class="input tbl__cell${head ? ' is-head' : ''}" data-cell="${r},${c}" value="${PM.esc(v)}" maxlength="160" aria-label="${head ? 'Kop' : `Rij ${t.header ? r : r + 1}`}, kolom ${c + 1}" spellcheck="true">`).join('');
      return `${inputs}<button type="button" class="tbl__del" data-del-row="${r}" tabindex="-1" aria-label="Rij ${r + 1} verwijderen" title="Rij ${r + 1} verwijderen"${nR === 1 ? ' disabled' : ''}>&times;</button>`;
    }).join('');
    el.tableGrid.innerHTML = `${colBtns}<span></span>${rows}`;
    lastCell = [Math.min(lastCell[0], nR - 1), Math.min(lastCell[1], nC - 1)];
    $('#addRow').disabled = nR >= LIM.rows;
    $('#addCol').disabled = nC >= LIM.cols;
    syncDelButtons();
    if (focus) {
      const input = $(`[data-cell="${focus[0]},${focus[1]}"]`, el.tableGrid);
      if (input) {
        input.focus();
        input.select();
      }
    }
  }

  function syncDelButtons() {
    const t = tbl();
    const [r, c] = lastCell;
    const delRow = $('#delRow');
    const delCol = $('#delCol');
    delRow.disabled = t.cells.length === 1;
    delCol.disabled = t.cells[0].length === 1;
    delRow.setAttribute('aria-label', `Rij ${r + 1} verwijderen`);
    delRow.title = `Rij ${r + 1} verwijderen (de rij van de cel waar je stond)`;
    delCol.setAttribute('aria-label', `Kolom ${c + 1} verwijderen`);
    delCol.title = `Kolom ${c + 1} verwijderen (de kolom van de cel waar je stond)`;
  }

  el.tableGrid.addEventListener('focusin', (e) => {
    const cell = e.target.dataset && e.target.dataset.cell;
    if (!cell) return;
    lastCell = cell.split(',').map(Number);
    syncDelButtons();
  });

  function tableChanged(focus) {
    renderTableEditor(focus);
    changed(null);
  }

  function addRow(at = tbl().cells.length) {
    const t = tbl();
    if (t.cells.length >= LIM.rows) {
      toast(`Hoogstens ${LIM.rows} rijen: meer is op een slide niet te lezen. Verdeel de tabel over twee slides.`, true);
      return false;
    }
    t.cells.splice(at, 0, Array(t.cells[0].length).fill(''));
    return true;
  }

  function addCol() {
    const t = tbl();
    if (t.cells[0].length >= LIM.cols) {
      toast(`Hoogstens ${LIM.cols} kolommen: meer is op een slide niet te lezen.`, true);
      return false;
    }
    t.cells.forEach((row) => row.push(''));
    return true;
  }

  // Weghalen gaat meteen, met "ongedaan maken" in de melding
  function delRow(r) {
    const t = tbl();
    if (t.cells.length === 1) return;
    t.cells.splice(r, 1);
    tableChanged();
    toast(`Rij ${r + 1} verwijderd.`, false, { label: 'ongedaan maken', run: () => history.undo() });
  }

  function delCol(c) {
    const t = tbl();
    if (t.cells[0].length === 1) return;
    t.cells.forEach((row) => row.splice(c, 1));
    tableChanged();
    toast(`Kolom ${c + 1} verwijderd.`, false, { label: 'ongedaan maken', run: () => history.undo() });
  }

  $('#addRow').addEventListener('click', () => {
    if (addRow()) tableChanged([tbl().cells.length - 1, 0]);
  });
  $('#addCol').addEventListener('click', () => {
    if (addCol()) tableChanged([0, tbl().cells[0].length - 1]);
  });
  $('#delRow').addEventListener('click', () => delRow(lastCell[0]));
  $('#delCol').addEventListener('click', () => delCol(lastCell[1]));

  el.tableGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.delRow != null) delRow(Number(btn.dataset.delRow));
    else if (btn.dataset.delCol != null) delCol(Number(btn.dataset.delCol));
  });

  // Enter: naar de cel eronder (en aan het eind een nieuwe rij), zoals in een spreadsheet
  el.tableGrid.addEventListener('keydown', (e) => {
    const cell = e.target.dataset && e.target.dataset.cell;
    if (!cell || e.key !== 'Enter') return;
    e.preventDefault();
    const [r, c] = cell.split(',').map(Number);
    if (r + 1 < tbl().cells.length) {
      renderTableEditor([r + 1, c]);
    } else if (addRow()) {
      tableChanged([r + 1, c]);
    }
  });

  // Plakken uit Excel, Google Sheets of Numbers: tabs en regels vullen de cellen vanaf hier
  el.tableGrid.addEventListener('paste', (e) => {
    const cell = e.target.dataset && e.target.dataset.cell;
    const text = e.clipboardData && e.clipboardData.getData('text/plain');
    if (!cell || !text || !/[\t\n]/.test(text.replace(/\r?\n$/, ''))) return;
    e.preventDefault();
    const [r0, c0] = cell.split(',').map(Number);
    const data = text.replace(/\r/g, '').replace(/\n+$/, '').split('\n').map((line) => line.split('\t').map((v) => v.trim()));
    const t = tbl();
    let cut = false;
    data.forEach((row, i) => {
      const r = r0 + i;
      if (r >= LIM.rows) {
        cut = true;
        return;
      }
      while (t.cells.length <= r) addRow();
      row.forEach((v, j) => {
        const c = c0 + j;
        if (c >= LIM.cols) {
          cut = true;
          return;
        }
        while (t.cells[0].length <= c) addCol();
        t.cells[r][c] = v.slice(0, 160);
      });
    });
    tableChanged([r0, c0]);
    toast(cut ? `Geplakt, maar alleen de eerste ${LIM.rows} rijen en ${LIM.cols} kolommen passen.` : `${data.length} ${data.length === 1 ? 'rij' : 'rijen'} geplakt.`, cut);
  });

  /* ---------------------------------------------------------------------------
     Foto's: per slide een sleutel in IndexedDB
     ------------------------------------------------------------------------- */

  function trackFile(key) {
    const list = PM.store.get(FILES_KEY, []);
    if (!list.includes(key)) PM.store.set(FILES_KEY, [...list, key]);
  }

  // Alle foto's die nog nodig zijn: deze presentatie, de geparkeerde slides van een voorstel of
  // positionering en de bewaarde andere soorten (met hun geparkeerde slides)
  function photoKeys() {
    const lists = [state.slides, Object.values(state.parked || {})];
    for (const t of TYPES) {
      const kept = state.stash[t];
      if (kept) lists.push(kept.slides, Object.values(kept.parked || {}));
    }
    return Array.from(new Set(lists.flat().map((s) => s && s.photoKey).filter(Boolean)));
  }

  // Bij het laden: alleen bewaren wat nog nodig is (de geschiedenis is dan leeg)
  function cleanupFiles() {
    // Zonder generator of een recept niets weggooien: een bewaard voorstel of een bewaarde
    // positionering is dan niet helemaal gelezen
    if (!G || TYPES.some((t) => t !== 'regulier' && !DECKS[t])) return;
    const keep = photoKeys();
    PM.store.get(FILES_KEY, []).filter((k) => !keep.includes(k)).forEach((k) => PM.idb.del(k));
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

  // Foto's uit de toestand laden (na laden, wisselen, ongedaan maken of een nieuwe foto);
  // ook die van de andere soort (de miniatuur bij Soort) en van geparkeerde slides
  async function applyPhotos() {
    await Promise.all(photoKeys().map(loadFile));
    drawEpoch += 1;
    syncPhotoUI();
    render();
  }

  function syncPhotoUI() {
    const entry = photoOf(current());
    // Een logo verschuif je niet en zoom je niet in: het staat altijd in zijn geheel
    const logo = current().photoFit === 'logo';
    el.photoCard.hidden = !entry;
    el.photoDrop.hidden = !!entry;
    el.cropControls.hidden = !entry || logo;
    el.cropHint.hidden = !entry || logo;
    // Een klantlogo heet ook zo (de uitleg bovenaan komt anders uit data-layout-text)
    el.photoDropTitle.textContent = `${photoWord(current())} toevoegen`;
    if (isLogo()) el.photoLead.textContent = 'Het logo staat in zijn geheel op een witte zeshoek, rechts op de slide.';
    syncLogo();
    if (!entry) return;
    el.photoThumb.style.backgroundImage = `url("${entry.url}")`;
    el.photoName.textContent = entry.file.name || 'foto';
    el.photoSize.textContent = `${entry.img.naturalWidth} × ${entry.img.naturalHeight} px${entry.file.size ? ` · ${PM.formatSize(entry.file.size)}` : ''}`;
  }

  async function addFile(file) {
    try {
      const { img, url } = await PM.readImage(file);
      const key = `slide:${PM.uid()}${PM.uid()}`;
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
    const s = current();
    // Geen fotoplek in deze layout: uitleggen, en de layout die het wel kan in één klik
    if (!PHOTO_LAYOUTS.has(s.layout)) {
      toast(`${NOUN[s.layout] || 'Deze layout'} heeft geen plek voor een foto. Met beeld + tekst staat hij naast je tekst.`, false, {
        label: 'gebruik beeld + tekst',
        run: () => {
          setLayout('split');
          setPhoto(file);
        },
      });
      return;
    }
    const key = await addFile(file);
    if (!key) return;
    s.photoKey = key;
    s.crop = { zoom: 1, fx: 0.5, fy: 0.5 };
    syncCrop();
    syncPhotoUI();
    changed('foto');
    if (PM.tour) PM.tour.signal('foto');
  }

  function clearPhoto() {
    const logo = isLogo();
    current().photoKey = '';
    syncPhotoUI();
    changed('foto');
    toast(logo ? 'Logo verwijderd.' : 'Foto verwijderd.', false, { label: 'ongedaan maken', run: () => history.undo() });
  }

  const pickPhoto = () => el.photoInput.click();
  el.photoDrop.addEventListener('click', pickPhoto);
  el.photoDrop.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      pickPhoto();
    }
  });
  $('#photoReplace').addEventListener('click', pickPhoto);
  $('#photoClear').addEventListener('click', clearPhoto);
  el.previewPhotoBtn.addEventListener('click', pickPhoto);
  el.photoInput.addEventListener('change', () => {
    const file = el.photoInput.files[0];
    el.photoInput.value = '';
    if (file) setPhoto(file);
  });
  $('#cropReset').addEventListener('click', () => {
    current().crop = { zoom: 1, fx: 0.5, fy: 0.5 };
    syncCrop();
    changed(null);
  });

  // Slepen: foto overal op het podium of op de uploadzone
  PM.bindDrop(el.photoDrop, setPhoto);
  PM.bindDrop(el.stage, setPhoto, el.stage);
  PM.preventStrayDrops();

  // Plakken vanaf het klembord (alleen een afbeelding; tekst plakt gewoon in het veld)
  document.addEventListener('paste', (e) => {
    if (e.target.closest && e.target.closest('input, textarea')) return;
    const item = Array.from(e.clipboardData ? e.clipboardData.items : []).find((i) => i.type.startsWith('image/'));
    if (!item) return;
    e.preventDefault();
    setPhoto(item.getAsFile());
  });

  // Uitsnede verschuiven door op de slide te slepen (een klik zonder slepen opent het veld)
  let pan = null;
  el.canvas.addEventListener('pointerdown', (e) => {
    if (!lastInfo.photo) return;
    const c = current().crop;
    pan = { x: e.clientX, y: e.clientY, fx: c.fx, fy: c.fy, moved: false };
    el.canvas.setPointerCapture(e.pointerId);
    el.canvas.classList.add('is-panning');
  });
  el.canvas.addEventListener('pointermove', (e) => {
    if (!pan || !lastInfo.photo) return;
    const k = S.W / el.canvas.getBoundingClientRect().width;   // ontwerppixels per schermpixel
    const { overflowX, overflowY } = lastInfo.photo;
    const c = current().crop;
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
    const s = current();
    if ((e.key === 'Enter' || e.key === ' ') && PHOTO_LAYOUTS.has(s.layout) && !photoOf(s)) {
      e.preventDefault();
      pickPhoto();
      return;
    }
    const dir = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
    if (!dir || !lastInfo.photo) return;
    e.preventDefault();
    const c = s.crop;
    const step = e.shiftKey ? 0.1 : 0.02;
    c.fx = Math.min(1, Math.max(0, c.fx + dir[0] * step));
    c.fy = Math.min(1, Math.max(0, c.fy + dir[1] * step));
    changed('verschuiven');
  });

  /* ---------------------------------------------------------------------------
     Export: "download pdf" rechtsboven; het pijltje toont PowerPoint en afbeeldingen
     ------------------------------------------------------------------------- */

  const deckName = () => PM.slug(state.slides[0].title || state.slides[0].label) || 'presentatie';
  const slideFile = (i) => `pureminds-presentatie-${deckName()}-slide-${String(i + 1).padStart(2, '0')}.png`;
  const sizeText = () => `${state.exportWidth} × ${state.exportWidth * 9 / 16} px`;

  // Precies wat je krijgt, per knop in één regel
  function syncExport() {
    const n = state.slides.length;
    el.dimPill.textContent = sizeText();
    el.pdfSum.textContent = `${n} ${n === 1 ? 'pagina' : "pagina's"}, om te presenteren of te versturen`;
    el.pngSum.textContent = `1 PNG · ${sizeText()}`;
    el.zipSum.textContent = `zip met ${n} PNG's · ${sizeText()}`;
    el.downloadBtn.title = `Download ${n === 1 ? 'de slide' : `alle ${n} slides`} als pdf (Ctrl + S)`;
    // Foto's die voor deze resolutie te klein zijn, rustig gemeld bij de afbeeldingen
    const small = state.slides.map((_, i) => i).filter((i) => { const res = photoCheck(i); return res.level !== 'ok' && !res.white; });
    el.dlPhotoNote.hidden = !small.length;
    if (small.length) {
      const list = small.map((i) => i + 1);
      const which = list.length === 1 ? `slide ${list[0]}` : `slide ${list.slice(0, -1).join(', ')} en ${list[list.length - 1]}`;
      el.dlPhotoNote.textContent = `${list.length === 1 ? 'De foto op' : "De foto's op"} ${which} ${list.length === 1 ? 'is' : 'zijn'} kleiner dan ${state.exportWidth === 3840 ? '4K' : 'Full HD'} nodig heeft en ${list.length === 1 ? 'kan' : 'kunnen'} zacht worden.${state.exportWidth === 3840 ? ' Full HD is scherp genoeg voor de meeste schermen.' : ''}`;
    }
  }

  $$('input[name="res"]').forEach((r) => r.addEventListener('change', () => {
    if (!r.checked) return;
    state.exportWidth = Number(r.value) === 3840 ? 3840 : 1920;
    save();
    render();
  }));

  async function slideBlob(i) {
    await PM.fontsReady;
    const canvas = document.createElement('canvas');
    S.renderSlide(canvas, state, i, slideEnv(i), { scale: state.exportWidth / S.W });
    return PM.canvasToBlob(canvas, 'image/png');
  }

  async function exportPng() {
    const name = slideFile(state.active);
    PM.saveBlob(await slideBlob(state.active), name);
    toast(`Gedownload: ${name}`);
    return 'gedownload';
  }

  // Alle slides in één zip: geen reeks losse downloads die de browser blokkeert
  async function exportZip(progress) {
    const JSZip = await PM.libs.jszip();
    const zip = new JSZip();
    for (let i = 0; i < state.slides.length; i++) {
      progress(`slide ${i + 1} van ${state.slides.length}…`);
      zip.file(slideFile(i), await slideBlob(i));
    }
    progress('inpakken…');
    const name = `pureminds-presentatie-${deckName()}-slides.zip`;
    PM.saveBlob(await zip.generateAsync({ type: 'blob' }), name);
    toast(`Zip met ${state.slides.length} slides gedownload: ${name}`);
    return `${state.slides.length} slides`;
  }

  // PDF: één 16:9-pagina per slide (960 × 540 pt, zoals PowerPoint), als vector
  // met echte tekst. Dezelfde renderfunctie als de preview tekent via
  // PMPdfCanvas rechtstreeks in de PDF; alleen foto's zijn afbeeldingen.
  async function exportPdf(progress) {
    const { blob } = await window.PMPdfCanvas.build({
      width: S.W,
      height: S.H,
      pageWidth: 960,
      count: state.slides.length,
      draw: (canvas, i) => S.renderSlide(canvas, state, i, slideEnv(i)),
      // Logo en Emerce 100-badge als vector (scherp op elk formaat)
      vectors: new Map([[env.logo, PM.brandSvg('logoWhiteSvg')], [env.badge, PM.brandSvg('badgeWhite')]]),
      title: String(state.slides[0].title || 'Presentatie').replace(/\*\*/g, ''),
      subject: 'Pure Minds-presentatie',
      progress,
    });
    const name = `pureminds-presentatie-${deckName()}.pdf`;
    PM.saveBlob(blob, name);
    toast(`PDF met ${state.slides.length} slides gedownload: ${name}`);
    return 'pdf gedownload';
  }

  // PowerPoint: dezelfde slides als bewerkbare tekstvakken, vormen en foto's
  // (js/presentation/pptx.js). Opent ook in Google Presentaties en Keynote.
  async function exportPptx(progress) {
    const images = {};
    for (const s of state.slides) {
      const photo = photoOf(s);
      if (photo) images[s.id] = { img: photo.img, url: photo.url, name: photo.file.name || 'afbeelding' };
    }
    const blob = await window.PMSlidesPptx.exportDeck(state, slideEnv, images, (i, total) => progress(`slide ${i + 1} van ${total}…`));
    const name = `pureminds-presentatie-${deckName()}.pptx`;
    PM.saveBlob(blob, name);
    toast(`PowerPoint met ${state.slides.length} slides gedownload: ${name}`);
    return 'powerpoint gedownload';
  }

  const EXPORTS = {
    pdf: { busy: 'pdf maken…', task: exportPdf },
    pptx: { busy: 'powerpoint maken…', task: exportPptx },
    png: { busy: 'bezig…', task: exportPng },
    zip: { busy: 'slides maken…', task: exportZip },
  };

  // De voortgang staat op de knop waar je klikte; is die weg (popover dicht), dan op "download pdf"
  function runExport(kind, button) {
    const btn = button && button.getClientRects().length ? button : el.downloadBtn;
    const { busy, task } = EXPORTS[kind];
    return PM.run(btn, busy, async (progress) => {
      const done = await task(progress);
      if (PM.tour) PM.tour.signal('download');
      // Wat je downloadt en nog niet in de bieb staat, gaat er (stil) in
      if (lib) lib.autoSave();
      return done;
    });
  }

  function download(kind, button) {
    if (button && button.disabled) return;
    beforeDownload(() => runExport(kind, button));
  }

  el.downloadBtn.addEventListener('click', () => download('pdf', el.downloadBtn));
  // Opties geopend met het toetsenbord: begin bij de eerste keuze, pdf
  $('.split__more').addEventListener('click', (e) => {
    if (e.detail === 0 && !$('#dlPop').hidden) el.pdfBtn.focus();
  });
  el.pdfBtn.addEventListener('click', () => download('pdf', el.pdfBtn));
  el.pptxBtn.addEventListener('click', () => download('pptx', el.pptxBtn));
  el.pngBtn.addEventListener('click', () => download('png', el.pngBtn));
  el.pngAllBtn.addEventListener('click', () => download('zip', el.pngAllBtn));

  /* ---------------------------------------------------------------------------
     Nog even checken: voorbeeldtekst, [invulplekken] en tekst die niet past
     ------------------------------------------------------------------------- */

  let checkedSig = null;   // "toch downloaden" voor precies deze inhoud: dan niet opnieuw vragen
  let checkGo = null;
  const measure = document.createElement('canvas');

  // Wat de tekening van slide i zegt over tekst die niet past: van de miniatuur als die slide sindsdien
  // niet veranderde (de maat hangt niet af van de schaal), anders op een klein canvas, alleen om te meten
  function slideInfo(i) {
    const sig = slideSig(i);
    if (!measured[i] || measured[i].sig !== sig) measured[i] = { sig, info: S.renderSlide(measure, state, i, slideEnv(i), { scale: 0.05 }) };
    return measured[i].info;
  }

  function checkIssues() {
    const list = D.exampleIssues(state, {
      exampleTable: S.defaultTable().cells,
      hasPhoto: (i) => PHOTO_LAYOUTS.has(state.slides[i].layout) && !!photoOf(state.slides[i]),
    });
    // Tekst die ook op de kleinste letter niet past
    state.slides.forEach((slide, i) => {
      const info = slideInfo(i);
      const key = (info.overflowKeys || [])[0] || (info.overflow ? 'title' : null);
      if (key) out(i, key);
      function out(index, k) {
        const f = D.nameOf(slide, k);
        list.push({ index, key: k, label: f.label, name: f.name, kind: 'te-lang', found: '' });
      }
    });
    // Een canvas met lege vakken of blokken toont daar alleen de uitleg: dezelfde punten als in de
    // lijst "Klaar om te versturen?" (canvas bij het voorstel, bmc en vpc bij de positionering)
    if (isGen()) {
      for (const item of deck().checklist(state.form, state.slides, {}) || []) {
        const key = CANVAS_CHECK[item.id];
        if (!key || item.done) continue;
        const index = state.slides.findIndex((s) => s.role === key);
        if (index < 0 || state.slides[index].layout !== key) continue;
        const row = { index, key, label: D.nameOf(state.slides[index], key).label, name: D.nameOf(state.slides[index], key).name, kind: 'leeg', found: '' };
        if (isVoorstel()) {
          list.push(row);
          continue;
        }
        // Positionering: hoeveel vakken of blokken nog helemaal leeg zijn (een invulplek meldt de controle al)
        const keys = key === 'bmc' ? BMC_KEYS : Object.keys(G.VPC_INFO);
        const box = state.slides[index][key] || {};
        const empty = keys.filter((k) => blankText(box[k])).length;
        if (empty) list.push({ ...row, empty, total: keys.length });
      }
      // Een toelichting die je leegmaakte (positionering): op de slide staat dan alleen de titel
      state.slides.forEach((slide, index) => {
        const shown = D.fields(slide).map((f) => f.key);
        for (const k of deck().CONTENT[slide.role] || []) {
          if (!shown.includes(k) || !blankText(slide[k])) continue;
          const f = D.nameOf(slide, k);
          list.push({ index, key: k, label: f.label, name: f.name, kind: 'leeg', found: '', content: true });
        }
      });
    }
    return list.sort((a, b) => a.index - b.index);
  }

  // Het punt van de checklist bij een canvas, en de layout (en rol) van dat canvas
  const CANVAS_CHECK = { canvas: 'vpc', vpc: 'vpc', bmc: 'bmc' };

  // Eén regel per veld: "Titel: nog de voorbeeldtekst “…”"
  function checkRow(x) {
    const Label = x.label.charAt(0).toUpperCase() + x.label.slice(1);
    if (x.kind === 'leeg' && x.empty) {
      const name = x.key === 'bmc' ? 'Business Model Canvas' : 'Waarde Propositie Canvas';
      const what = x.key === 'bmc' ? 'blokken' : 'vakken';
      return `<b>${name}</b>: ${x.empty} van ${x.total} ${what} leeg; op de slide staat dan de uitleg.`;
    }
    if (x.key === 'vpc' && x.kind === 'leeg') return '<b>Waardepropositie</b>: nog leeg, op de slide staan alleen de hulpvragen. Vul hem in of zet hem uit bij Onderdelen.';
    if (x.kind === 'leeg' && x.content) return `<b>${PM.esc(Label)}</b>: nog leeg, op de slide staat alleen de titel.`;
    if (x.kind === 'leeg' && x.key !== 'value') return 'Deze slide is nog leeg.';
    const what = {
      voorbeeld: () => (x.key === 'table' ? 'nog de voorbeeldcijfers' : `nog de voorbeeldtekst “${x.found}”`),
      invulplek: () => `nog invullen: ${x.found}`,
      leeg: () => 'nog leeg, op de slide staat nu 0%',
      'te-lang': () => 'te lang, past ook op de kleinste letter niet',
    }[x.kind]();
    return `<b>${PM.esc(Label)}</b>: ${PM.esc(what)}`;
  }

  function beforeDownload(run) {
    const list = checkIssues();
    const sig = JSON.stringify(list);
    if (!list.length || sig === checkedSig) {
      run();
      return;
    }
    const slides = Array.from(new Set(list.map((x) => x.index)));
    const n = slides.length;
    const kinds = { voorbeeld: 'voorbeeldtekst', invulplek: 'iets om in te vullen', leeg: 'een lege plek', 'te-lang': 'tekst die niet past' };
    const found = Object.keys(kinds).filter((k) => list.some((x) => x.kind === k)).map((k) => kinds[k]);
    $('#checkLead').textContent = `Op ${n} ${n === 1 ? 'slide' : 'slides'} staat nog ${listNames(found)}. Zo komt het ook in je download.`;
    $('#checkList').innerHTML = slides.map((index) => {
      const rows = list.filter((x) => x.index === index);
      const slide = state.slides[index];
      return `<li class="check__item">
        <span class="check__slide"><b>Slide ${index + 1}</b> ${PM.esc(layoutName(layoutOf(slide)))}</span>
        <ul class="check__rows">${rows.map((x) => `<li>${checkRow(x)}</li>`).join('')}</ul>
        <button type="button" class="btn btn-quiet btn-xs check__goto" data-goto="${index}" data-key="${PM.esc(rows[0].key)}" data-found="${PM.esc(rows[0].found)}">naar slide ${index + 1}</button>
      </li>`;
    }).join('');
    checkGo = () => {
      checkedSig = sig;
      run();
    };
    shell.closePopover();
    if (typeof el.check.showModal === 'function') el.check.showModal();
    else el.check.setAttribute('open', '');
    $('#checkTitle').focus();
  }

  // "a, b en c"
  function listNames(names) {
    return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} en ${names[names.length - 1]}`;
  }

  function closeCheck() {
    if (el.check.open) el.check.close();
  }

  // Naar het veld dat nog aandacht nodig heeft. Een invulplek of te lange tekst die het formulier
  // schreef, los je op in het formulier (Voorstel, Prijzen of Gegevens): typ je hem op de slide weg,
  // dan is dat veld van jou en volgt het het formulier niet meer. found: de gevonden invulplek(ken)
  function gotoField(index, key, found = '') {
    closeCheck();
    selectSlide(index);
    let section = 'inhoud';
    let sel = FIELD[key];
    const fromForm = formRegion(key, current(), found);
    if (fromForm) {
      section = fromForm.section;
      sel = fromForm.field;
    } else if (key === 'vpc' || key === 'bmc') {
      // Een canvas (bij Inhoud): het eerste vak of blok met een invulplek; dan bij de positionering het
      // blok of vak dat niet past, anders het eerste zonder eigen tekst (daar staat de uitleg op de
      // slide); bij het voorstel het eerste met tekst
      const slide = current();
      const pick = (test) => (key === 'bmc' ? bmcTarget(bmcZone(slide, test)) : vpcTarget(vpcZone(slide, test)));
      const hasBlank = (key === 'bmc' ? BMC_KEYS : VPC_KEYS).some((z) => D.placeholders(String((slide[key] || {})[z] || '')).length);
      const part = overPart(slideInfo(index).overflowKeys, key);
      const target = hasBlank ? pick((v) => D.placeholders(v).length > 0)
        : part ? regionTarget(part)
          : state.type === 'positionering' ? emptyCanvasTarget(slide, key) : pick((v) => v.trim());
      section = target.section;
      sel = target.field;
    } else if (key === 'table') {
      const cells = tbl().cells;
      let at = '0,0';
      cells.some((row, r) => row.some((v, c) => {
        if (D.placeholders(v).length) at = `${r},${c}`;
        return D.placeholders(v).length > 0;
      }));
      sel = `[data-cell="${at}"]`;
    }
    requestAnimationFrame(() => shell.reveal(section, sel || '#sTitle'));
  }

  el.check.addEventListener('click', (e) => {
    const go = e.target.closest('[data-check-go]');
    const to = e.target.closest('[data-goto]');
    // Klik op de achtergrond (buiten het vak) sluit ook
    const r = el.check.getBoundingClientRect();
    const outside = e.target === el.check && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom);
    if (e.target.closest('[data-check-close]') || outside) closeCheck();
    else if (to) gotoField(Number(to.dataset.goto), to.dataset.key, to.dataset.found);
    else if (go) {
      closeCheck();
      const fn = checkGo;
      checkGo = null;
      if (fn) fn();
    }
  });
  // Esc sluit alleen de controle (niet ook de rondleiding)
  el.check.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    closeCheck();
  });

  /* ---------------------------------------------------------------------------
     Toetsen en overig
     ------------------------------------------------------------------------- */

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 's') {
      e.preventDefault();
      if (!el.check.open) download('pdf', el.downloadBtn);
      return;
    }
    const typing = e.target.closest && e.target.closest('input, textarea, select, [contenteditable="true"]');
    if (typing || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (document.querySelector('dialog[open]')) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') selectSlide(state.active + 1);
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') selectSlide(state.active - 1);
  });

  // Rondleiding: de stap "titel" gaat over slide 1; die van een voorstel en een positionering
  // begint bij de titelslide, waar de klantnaam op komt
  document.addEventListener('pm:tour', (e) => {
    const d = e.detail || {};
    // Een melding (zoals na een wissel van soort) ligt niet over het kaartje en het uitgelichte veld
    if (d.status === 'bezig') {
      const t = document.querySelector('.toast');
      if (t) t.classList.remove('is-visible');
    }
    const gen = !!DECK_UI[d.tool];
    // De rondleiding van een voorstel of positionering alleen in die soort (snel teruggewisseld):
    // stoppen zonder stand, dan start hij bij het volgende voorstel of de volgende positionering
    if (gen && d.status === 'bezig' && d.tool !== state.type) {
      PM.tour.stop();
      return;
    }
    if (d.tool === 'presentation' && d.step === 'welkom' && state.active !== 0) selectSlide(0);
    if (gen && d.step === 'welkom') selectRole('cover');
    if (!gen || d.status !== 'stap') return;
    // De stap over het canvas: de slide met het canvas in beeld (de vakken en blokken staan bij Inhoud):
    // de waardepropositie van het voorstel, het business model canvas van de positionering
    if (d.step === 'canvas') selectRole(d.tool === 'voorstel' ? 'vpc' : 'bmc');
    // Positionering: de stap over de toelichting toont de eerste toelichting in de strook
    if (d.step === 'toelichting' && deck()) {
      const first = state.slides.find((s) => deck().CONTENT[s.role]);
      if (first) selectRole(first.role);
    }
  });

  /* ---------------------------------------------------------------------------
     Start
     ------------------------------------------------------------------------- */

  // Logo: het bestand via een server; bij file:// de ingebedde kopie,
  // anders blokkeert de browser de export (zie scripts/build-brand-data.js)
  // Zonder recept (laadfout) geen voorstel of positionering: de tegel weg, een gewone presentatie werkt gewoon
  for (const t of TYPES) {
    const tile = t !== 'regulier' && !DECKS[t] && $(`input[name="deckType"][value="${t}"]`);
    if (tile) tile.closest('.layout-tile').hidden = true;
  }
  env.logo = PM.brandImage('logoWhite', assetsChanged);
  env.badge = PM.brandImage('badgeWhite', assetsChanged);
  syncAll();   // bouwt ook de layouts (applyType)
  history.clear();
  photoKeys().forEach(trackFile);
  // Vanaf het dashboard naar de gekozen soort: wisselen zoals bij Soort (je vorige presentatie,
  // voorstel of positionering komt terug, of een nieuwe). Ongedaan maken of Soort brengt de andere terug
  if (startType) {
    switchType(startType, { atStart: true });
    startType = null;
  }
  render();
  // Andere maat of pixeldichtheid (venster, paneel, zoomen, ander scherm): opnieuw tekenen, scherp
  PM.watchPreview(el.canvas, render);
  PM.fontsReady.then(() => {
    drawEpoch += 1;
    render();
    drawStrip();
  });

  // Bieb: de presentatie, het voorstel of de positionering die openstaat 14 dagen bewaren.
  // Elke soort heeft zijn eigen plek (slot). Openen van een andere soort werkt als wisselen:
  // wat openstaat gaat naar Soort; wat daar van die soort stond, gaat eerst in de bieb
  const biebDeck = (s, box = s) => ({
    v: 2, type: s.type, dot: s.dot, badge: s.badge,
    slides: box.slides, active: 0, showNumbers: box.showNumbers === true, form: box.form || null, parked: box.parked || {},
  });
  lib = PM.library ? PM.library.attach({
    tool: 'presentation',
    slot: () => state.type,
    getState: () => biebDeck(state),
    fileKeys: (s) => [...(s.slides || []), ...Object.values(s.parked || {})].map((x) => x && x.photoKey),
    async apply(saved, keys) {
      keys.forEach(trackFile);
      if (aiSaver) aiSaver.stop();
      const deck = normalize({ ...saved, exportWidth: state.exportWidth, stash: {} });
      const stash = { ...state.stash };
      if (deck.type !== state.type) {
        const keep = { slides: state.slides, active: state.active, showNumbers: state.showNumbers };
        if (state.type !== 'regulier') Object.assign(keep, { form: state.form, parked: state.parked });
        stash[state.type] = keep;
        if (stash[deck.type] && !lib.isClean(deck.type)) await lib.save({ quiet: true, state: biebDeck({ ...state, type: deck.type }, stash[deck.type]) });
      }
      stash[deck.type] = null;
      state = { ...deck, stash, exportWidth: state.exportWidth, active: 0 };
      syncAll();
      changed(null);
      applyPhotos();
    },
    thumb() {
      const c = document.createElement('canvas');
      S.renderSlide(c, state, 0, slideEnv(0), { scale: 240 / S.W });
      return c;
    },
    undo: () => history.undo(),
    close: () => shell.closePopover(),
    openId: start.bieb,
  }) : null;

  /* ---------------------------------------------------------------------------
     AI: ruwe content in, slides eruit (schema: vul_presentatie in uploads/lib/ai.js)
     Alleen voor een gewone presentatie: een voorstel of positionering heeft zijn
     eigen formulier en vaste opbouw. Maken vanuit een voorstel wisselt eerst naar
     de gewone presentatie (het voorstel blijft bewaard bij Soort)
     ------------------------------------------------------------------------- */

  const AI_LAYOUTS = new Set(['title', 'section', 'bullets', 'split', 'quote', 'table', 'closing']);
  const IDEAS_KEY = 'pm-ai-ideas-presentation-v1';
  const txt = (v) => (typeof v === 'string' ? v.trim() : '');
  const lines = (v) => String(v || '').split('\n').map((l) => l.trim()).filter(Boolean);

  function slideToAI(s) {
    const layout = s.layout === 'quote' && styleOf(s) === 'stat' ? 'stat' : s.layout;
    const out = { layout, label: s.label, titel: s.title, notities: s.notes || '' };
    if (PHOTO_LAYOUTS.has(s.layout)) out.fotoZoek = s.photoQuery || '';
    if (['title', 'section', 'table', 'closing', 'stat'].includes(layout)) out.ondertitel = s.subtitle;
    if (layout === 'bullets' || layout === 'closing') out.punten = lines(s.body);
    if (layout === 'split') {
      const all = lines(s.body);
      out.tekst = all.filter((l) => !l.startsWith('- ')).join(' ');
      out.punten = all.filter((l) => l.startsWith('- ')).map((l) => l.slice(2));
    }
    if (layout === 'quote' || layout === 'stat') Object.assign(out, { citaat: s.quote, bron: s.author });
    if (layout === 'stat') out.cijfer = s.value;
    if (layout === 'table') out.tabel = s.table.cells;
    return out;
  }
  const toAI = () => ({ titel: (state.slides[0] && state.slides[0].title) || '', slides: state.slides.map(slideToAI) });

  // Een slide uit de AI; prev = de slide die er stond (foto, uitsnede en id blijven bij dezelfde layout)
  function slideFromAI(x, prev) {
    const stat = x && x.layout === 'stat';
    const layout = stat ? 'quote' : AI_LAYOUTS.has(x && x.layout) ? x.layout : 'bullets';
    const keep = prev && prev.layout === layout ? {
      id: prev.id, photoKey: prev.photoKey, crop: prev.crop, imageSide: prev.imageSide, photoFit: prev.photoFit, titleSize: prev.titleSize, meta: prev.meta,
    } : {};
    const punten = (Array.isArray(x.punten) ? x.punten : []).map(txt).filter(Boolean);
    const fields = { label: txt(x.label), title: txt(x.titel), subtitle: txt(x.ondertitel), notes: txt(x.notities), photoQuery: txt(x.fotoZoek) };
    if (layout === 'title' && !keep.meta) fields.meta = `Pure Minds Marketing Group · ${today()}`;
    if (layout === 'bullets' || layout === 'closing') fields.body = punten.join('\n');
    if (layout === 'split') fields.body = [txt(x.tekst), ...punten.map((p) => `- ${p}`)].filter(Boolean).join('\n');
    if (layout === 'quote') Object.assign(fields, { style: stat ? 'stat' : 'quote', quote: txt(x.citaat), author: txt(x.bron), value: txt(x.cijfer) });
    if (layout === 'table' && Array.isArray(x.tabel)) fields.table = S.normalizeTable({ header: true, firstCol: true, cells: x.tabel });
    const slide = newSlide(layout, { ...keep, ...fields });
    return slide;
  }

  // Foto's van Pexels: titelslide en afsluiter in de zeshoek (vierkant), beeld + tekst staand
  const photoShape = (layout) => (layout === 'split' ? 'portrait' : 'square');

  async function applyAI(data, { mode, target, photos }) {
    const d = data && typeof data === 'object' ? data : {};
    if (state.type !== 'regulier') switchType('regulier', { atStart: true });
    if (target != null) {
      const prev = state.slides[target];
      if (!prev) return;
      const next = slideFromAI(d, prev);
      next.id = prev.id;
      state.slides[target] = next;
      state.active = target;
    } else {
      const list = (Array.isArray(d.slides) ? d.slides : []).slice(0, MAX_SLIDES);
      if (!list.length) throw new Error('De AI gaf geen slides terug. Probeer het nog eens.');
      const old = mode === 'refine' ? state.slides : [];
      state.slides = list.map((x, i) => slideFromAI(x || {}, old[i]));
      state.active = 0;
      const ideas = list
        .map((x, i) => (x && txt(x.fotoIdee) ? `Slide ${i + 1}: ${txt(x.fotoIdee)}` : ''))
        .filter(Boolean);
      PM.store.set(IDEAS_KEY, ideas);
      // De foto's die de AI zocht, op hun slide
      for (const [i, found] of photos || []) {
        const slide = state.slides[i];
        if (!slide || !PHOTO_LAYOUTS.has(slide.layout)) continue;
        const key = await addFile(found.file);
        if (key) Object.assign(slide, { photoKey: key, crop: { zoom: 1, fx: 0.5, fy: 0.5 } });
      }
    }
    syncAll();
    changed(null);
    applyPhotos();
    renderIdeas();
  }

  function renderIdeas() {
    if (!ai) return;
    const ideas = state.type === 'regulier' ? PM.store.get(IDEAS_KEY, []) : [];
    ai.extras.innerHTML = Array.isArray(ideas) && ideas.length
      ? `<h3>Fotosuggesties van de AI</h3><ul class="ai-ideas">${ideas.map((t) => `<li>${PM.esc(t)}</li>`).join('')}</ul><p class="field-hint">Voeg een foto toe bij Foto, op de slides met een titelslide, beeld + tekst of afsluiter.</p>`
      : '';
  }

  if (PM.ai) {
    aiSaver = PM.ai.keepSaved(lib);
    ai = PM.ai.panel($('[data-ai-panel]'), {
      tool: 'presentation',
      format: 'presentatie',
      noun: 'presentatie',
      wishPlaceholder: 'bijv. 8 slides, voor een klantpitch van 15 minuten',
      current: toAI,
      canRefine: () => (state.type === 'regulier' ? '' : 'Aanpassen met AI kan bij een gewone presentatie. Een voorstel of positionering vul je in met zijn eigen formulier.'),
      target: () => (state.type === 'regulier' ? { index: state.active, label: `slide ${state.active + 1}` } : null),
      apply: applyAI,
      // Foto's van Pexels: na het maken meteen op de slides met een fotoplek, en zelf zoeken voor de open slide
      photos: {
        slots: (d) => (Array.isArray(d && d.slides) ? d.slides : [])
          .map((x, i) => (x && ['title', 'split', 'closing'].includes(x.layout) && txt(x.fotoZoek) ? { key: i, query: txt(x.fotoZoek), orientation: photoShape(x.layout), width: 2400 } : null))
          .filter(Boolean).slice(0, 6),
        target: () => {
          const s = current();
          return s && PHOTO_LAYOUTS.has(s.layout) ? { label: `slide ${state.active + 1}`, orientation: photoShape(s.layout), query: s.photoQuery || '', width: 2400 } : null;
        },
        apply: (file) => setPhoto(file),
      },
      lib,
      saver: aiSaver,
      undo: () => history.undo(),
    });
    renderIdeas();
    shell.onChange(({ id }) => { if (id === 'ai') { ai.refresh(); renderIdeas(); } });
    history.onChange(() => ai.refresh());
  }

  // Foto's uit een vorige sessie terugzetten, dan oude bestanden opruimen. De bewaarde
  // andere soort en geparkeerde slides houden hun foto's (photoKeys)
  applyPhotos().then(cleanupFiles);
})();
