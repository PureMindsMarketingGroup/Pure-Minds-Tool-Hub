/* =============================================================================
   tools.js — register van alle tools in de Pure Minds Generator Hub
   -----------------------------------------------------------------------------
   Eén plek voor de hub (index.html: een kaart per tool, met formaten, je
   concept en de rondleiding) én de toolwisselaar in de kop van elke tool. Een
   nieuwe tool toevoegen:

     1. Maak tools/<id>.html (kopieer de kop van een bestaande tool).
     2. Voeg hieronder een regel toe.

   Een tool die buiten de hub draait (een web-app elders, of een tool die je
   downloadt en op je eigen computer start) heeft geen pagina in tools/: zet
   dan kind op 'web' of 'lokaal' en href op de link of de download.

   Velden:
     id           korte naam, ook gebruikt als data-toolnav="<id>" in de kop
     name         naam op de kaart en in de kop
     short        korte naam voor de toolwisselaar
     href         pad vanaf de root van de site
     group        zone op het dashboard: een id uit PM_GROUPS (standaard de eerste, 'design')
     kind         leeg = een pagina in deze hub; 'web' = web-app elders, opent in een
                  nieuw tabblad ("open de web-app"); 'lokaal' = downloaden en op je
                  eigen computer starten ("hoe start je hem?" plus "direct downloaden")
     guide        bij 'lokaal': id van de <dialog> met de uitleg in index.html
     file         bij 'lokaal': wat je downloadt, naast "direct downloaden" ('zip 0,6 MB')
     description  één korte zin op de kaart: wat maak je ermee
     exports      hoe je het meeneemt (PNG, PDF, Word ...); bij tools van buiten
                  de hub: wat je eruit krijgt ("je krijgt ...")
     cta          knop op de kaart van een maker zonder formaten, of het label van
                  zijn zoekveld; begint met een werkwoord ('zoek een icoon')
     tone         'light' = de output is wit (briefpapier); anders donker zoals posts en slides
     status       'live' | 'nieuw' | 'binnenkort' (binnenkort = niet klikbaar)
     newUntil     tot deze datum (JJJJ-MM-DD) kan er "nieuw" op de kaart staan, en
                  alleen zolang je de tool in deze browser nog niet geopend hebt
     starts       formaten op de kaart (snelle starts): [{ label, sub, ratio, stack, params }]
                  ratio = verhouding van het formaat ('1 / 1', '210 / 297' ...),
                  stack = meerdere pagina's (carousel), params gaan als
                  ?sleutel=waarde mee; de tool leest ze met PM.startParams()
     search       de tool kan meteen zoeken: een zoekveld op de kaart dat
                  <href>?<param>=<zoekterm> opent. { param, placeholder }; het
                  label is de cta. In plaats van formaten.
     tour         de tool heeft een rondleiding (js/<id>/help.js): wat je erin maakt,
                  bijv. 'je eerste post'. Op de kaart staat dan "hoe werkt het?
                  (2 min)"; die link opent <href>#rondleiding en de rondleiding
                  start direct. Is hij gedaan, dan verdwijnt de link.
     draft        het concept in deze browser: { key, summary(opgeslagen) }
                  summary geeft { title, sub, ratio, noun }: noun is wat het is
                  ('post', 'offerte' ...), voor "jouw post" onder "verder waar je was".
                  De tool zelf gebruikt title en sub voor zijn appbalk.
   ============================================================================= */

// Zones op het dashboard, in deze volgorde. De eerste is "maken" (de vraag
// bovenaan index.html); de andere krijgen hun eigen kop en staan ernaast.
//   name      naam van de zone
//   question  kop als vraag (niet bij de eerste: die staat in index.html)
//   lead      één regel uitleg onder de kop
//   tone      'dark' = donker vlak met zeshoekpatroon
//   place     'bottom' = over de volle breedte onder de andere zones (anders in de zijkolom)
window.PM_GROUPS = [
  { id: 'design', name: 'Design & content' },
  { id: 'techniek', name: 'Techniek & analyse', question: 'Wat wil je checken?', tone: 'dark', lead: 'Deze tools openen buiten de hub: in een nieuw tabblad of op je eigen computer.' },
  // Tools in de huisstijl van een klant, niet van Pure Minds: elke klant met een eigen tool komt hier bij
  { id: 'klanten', name: 'Voor klanten', question: 'Maak je iets voor een klant?', place: 'bottom', lead: 'Post makers in de huisstijl van onze klanten. Ze openen in een nieuw tabblad.' },
];

window.PM_TOOLS = [
  {
    id: 'insta',
    name: 'Insta Post Maker',
    short: 'posts',
    href: 'tools/insta.html',
    description: 'Posts voor Instagram en LinkedIn in vijf templates, van losse foto tot swipe-carousel.',
    exports: ['PNG', 'JPG', 'PDF'],
    tour: 'je eerste post',
    status: 'live',
    starts: [
      { label: 'Instagram-post', sub: '4:5 · feed', ratio: '4 / 5', params: { template: 'overlay', format: 'portrait' } },
      { label: 'Story', sub: '9:16 · story, reel', ratio: '9 / 16', params: { template: 'overlay', format: 'story' } },
      { label: 'Carousel', sub: '4:5 · LinkedIn', ratio: '4 / 5', stack: true, params: { template: 'carousel', format: 'portrait' } },
    ],
    draft: {
      key: 'pm-postmaker-v1',
      summary(s) {
        const names = { photo: 'foto', overlay: 'foto met tekst', blog: 'blogpost', case: 'casepost', carousel: 'carousel' };
        const formats = { portrait: ['4:5', '4 / 5'], story: ['9:16', '9 / 16'] };
        const d = (s.data && s.data[s.template]) || {};
        const title = s.template === 'carousel' ? d.slides && d.slides[0] && d.slides[0].title : d.title || d.client || d.label;
        const f = formats[s.format] || formats.portrait;
        const noun = s.template === 'carousel' ? 'carousel' : s.format === 'story' ? 'story' : 'post';
        return { title, sub: [names[s.template], f[0]].filter(Boolean).join(' · '), ratio: f[1], noun };
      },
    },
  },
  {
    id: 'document',
    name: 'Document Maker',
    short: 'documenten',
    href: 'tools/document.html',
    description: 'Brief, offerte, memo of notitie op het A4-briefpapier van Pure Minds.',
    exports: ['PDF', 'Word', 'Google Docs', 'afdrukken'],
    tour: 'je eerste document',
    tone: 'light',
    status: 'nieuw',
    newUntil: '2026-11-01',
    starts: [
      { label: 'Brief', sub: 'A4 · briefpapier', ratio: '210 / 297', params: { type: 'brief' } },
      { label: 'Offerte', sub: 'A4 · met prijzen', ratio: '210 / 297', params: { type: 'offerte' } },
    ],
    draft: {
      key: 'pm-document-v1',
      summary: (s) => ({ title: s.title, sub: s.type, ratio: '210 / 297', noun: s.type || 'document' }),
    },
  },
  {
    id: 'presentation',
    name: 'Presentation Maker',
    short: 'presentaties',
    href: 'tools/presentation.html',
    description: 'Slides in zeven layouts, en voorstellen en positioneringen in de vaste opbouw van Pure Minds.',
    exports: ['PDF', 'PowerPoint', 'Google Slides', 'PNG'],
    tour: 'je eerste presentatie',
    status: 'nieuw',
    newUntil: '2026-11-01',
    starts: [
      // Altijd de gewone presentatie (je voorstel en positionering blijven bij Soort); app.js telt
      // type=regulier niet als snelle start, dus bij een eerste bezoek start de rondleiding zoals altijd.
      { label: 'Presentatie', sub: '16:9 · slides', ratio: '16 / 9', stack: true, params: { type: 'regulier' } },
      // Wisselen naar je voorstel of positionering (of er een beginnen); wat open stond, blijft bewaard.
      // In de volgorde van het klanttraject: eerst het voorstel, na het traject de positionering
      { label: 'Voorstel', sub: '16:9 · voorstel', ratio: '16 / 9', stack: true, params: { type: 'voorstel' } },
      { label: 'Positionering', sub: '16:9 · positionering', ratio: '16 / 9', stack: true, params: { type: 'positionering' } },
    ],
    draft: {
      key: 'pm-presentation-v1',
      // Alleen het soort dat open staat; de andere (state.stash) wachten bij Soort
      summary: (s) => {
        const slides = Array.isArray(s.slides) ? s.slides : [];
        const n = slides.length;
        const count = n === 1 ? '1 slide' : `${n} slides`;
        // Het formulier heette vóór versie 2 pos
        const raw = s.form || s.pos;
        const form = raw && typeof raw === 'object' ? raw : {};
        // Zoals normalize in app.js: een 'positionering' van vóór versie 2 was altijd een
        // voorstel (de positionering bestond nog niet); de vorm van het formulier is het vangnet
        const looksVoorstel = ['traject', 'situatie', 'diensten', 'eenmalig', 'maandelijks', 'websiteSoort'].some((k) => k in form);
        const type = s.type === 'positionering' && (!(s.v >= 2) || looksVoorstel) ? 'voorstel' : s.type;
        const names = type === 'voorstel' ? ['Voorstel', 'Nieuw voorstel'] : type === 'positionering' ? ['Positionering', 'Nieuwe positionering'] : null;
        if (names) {
          // Naar de titelslide; staat die uit of staat er nog [klantnaam], dan naar de klant
          const cover = slides.find((x) => x && x.role === 'cover');
          const coverTitle = cover && cover.title && !/\[klantnaam\]/i.test(cover.title) ? cover.title : '';
          const klant = typeof form.klant === 'string' ? form.klant.trim() : '';
          return { title: coverTitle || (klant ? `${names[0]} ${klant}` : names[1]), sub: `${type} · ${count}`, ratio: '16 / 9', noun: type };
        }
        return { title: n ? slides[0].title || slides[0].label : '', sub: count, ratio: '16 / 9', noun: 'presentatie' };
      },
    },
  },
  {
    id: 'icons',
    name: 'Icon Finder',
    short: 'iconen',
    href: 'tools/icons.html',
    description: '1.690 lijniconen, te zoeken in het Nederlands of Engels. Los of in de zeshoek, in de merkkleuren.',
    exports: ['SVG', 'PNG', 'kopiëren'],
    cta: 'zoek een icoon',
    search: { param: 'q', placeholder: 'bijv. euro, pijl of grafiek' },   // js/icons/app.js leest ?q=
    status: 'nieuw',
    newUntil: '2026-12-01',
  },
  {
    id: 'styleguide',
    name: 'Brand Styleguide',
    short: 'styleguide',
    href: 'tools/styleguide.html',
    group: 'design',
    description: 'Het brandbook van Pure Minds, digitaal: kleuren kopiëren, logo’s downloaden en alles exporteren als bewerkbare PDF.',
    exports: ['PDF', 'SVG', 'PNG', 'ASE'],
    cta: 'zoek in de huisstijl',
    search: { param: 'q', placeholder: 'bijv. magenta of clear space' },   // js/styleguide/app.js leest ?q=
    tour: 'het brandbook',
    status: 'nieuw',
    newUntil: '2026-12-01',
  },
  {
    id: 'consent-check',
    name: 'Consent Check',
    group: 'techniek',
    kind: 'lokaal',
    href: 'https://github.com/PureMindsMarketingGroup/consent-check/archive/refs/heads/main.zip',
    guide: 'guide-consent',
    file: 'zip 0,6 MB',
    description: 'Meet per website welke cookies en trackers er vóór en ná het cookie-akkoord laden.',
    exports: ['12 bevindingen', 'prioriteiten', 'PDF', 'JSON'],
    status: 'nieuw',
    newUntil: '2026-12-01',
  },
  {
    id: 'ads-optimizer',
    name: 'Landingpage & Ads Optimizer',
    group: 'techniek',
    kind: 'web',
    href: 'https://landingpage-ads-optimizer-qr13.vercel.app/',
    description: 'Checkt of je Google Ads-advertentie en je landingspagina op elkaar aansluiten, met een CRO-briefing in twee minuten.',
    exports: ['CRO-briefing', 'PDF', 'Word', 'Google Docs'],
    status: 'nieuw',
    newUntil: '2026-12-01',
  },
  {
    id: 'seo-gap',
    name: 'SEO Content Gap Analyzer',
    group: 'techniek',
    kind: 'web',
    href: 'https://seo-content-gap-analyzer-1yxm.vercel.app/',
    description: 'Zet je pagina naast de Google-top 10 en laat zien welke koppen, termen en vragen jij nog mist.',
    exports: ['contentbriefing', 'markdown'],
    status: 'nieuw',
    newUntil: '2026-12-01',
  },
  {
    id: 'keyword-focus',
    name: 'Keyword Focus & Intent Check',
    group: 'techniek',
    kind: 'web',
    href: 'https://keyword-focus-intent-check.vercel.app/',
    description: 'Past je pagina bij het focuszoekwoord en de zoekintentie? En wat mist er dan nog?',
    exports: ['intentcheck', 'contentbriefing', 'PDF', 'markdown'],
    status: 'nieuw',
    newUntil: '2026-12-01',
  },
  {
    id: 'speedstar',
    name: 'Speedstar Post Maker',
    group: 'klanten',
    kind: 'web',
    href: 'https://puremindsmarketinggroup.github.io/Speedstar-Socials-Tool/',
    description: 'On-brand Instagram-posts voor Speedstar Logistics in vier templates, met een AI-assistent in hun tone of voice.',
    exports: ['4:5-post', 'PNG', 'JPG'],
    status: 'nieuw',
    newUntil: '2026-12-01',
  },
];
