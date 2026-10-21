/* =============================================================================
   presentation/help.js — uitleg, rondleiding en sneltoetsen van de
   Presentation Maker
   -----------------------------------------------------------------------------
   Alleen tekst, geen gedrag. Alles hangt onder window.PM_HELP.presentation,
   behalve de rondleidingen van het voorstel en de positionering (onderaan:
   PM_HELP.voorstel en PM_HELP.positionering):

     sections  de knoppen in de zijbalk, van boven naar beneden: id, label
               (één woord onder het icoon, hoogstens ~10 tekens), title (kop
               van het paneel) en icon (Remix-icoon uit
               assets/icons/<categorie>/<naam>.svg, altijd de -line-variant).
               'voorstel' en 'prijzen' horen alleen bij een voorstel,
               'gegevens' alleen bij een positionering; bij de andere soorten
               zijn ze verborgen. De canvassen hebben geen eigen knop: die vul
               je bij Inhoud in, net als elke andere slide. De strook met
               slides staat onder de preview, niet in de zijbalk.
     help      de uitleg achter een [?]. De sleutel is gelijk aan
               data-help="<sleutel>" in tools/presentation.html; zonder dat
               attribuut verschijnt de uitleg nergens.
     tour      de rondleiding. target is gelijk aan data-tour="<target>" in
               tools/presentation.html; section opent eerst dat paneel. doe
               laat een stap wachten tot je het echt doet:
                 event 'input' (min = aantal getypte tekens), 'change' of
                 'click' op het doel, of signal '<naam>' dat de tool zelf
                 geeft: 'nadruk', 'foto' en 'download'.
               hint staat bij de stap zolang hij wacht. Is het doel niet
               zichtbaar (geen foto bij een opsomming), dan slaat de
               rondleiding de stap over.
     keys      het venster met sneltoetsen: [toets, wat hij doet]. Ctrl is op
               een Mac de Cmd-toets.

   De rondleidingen "je eerste voorstel" (PM_HELP.voorstel.tour) en "je
   eerste positionering" (PM_HELP.positionering.tour) hebben elk een eigen
   stand (pm-tour-voorstel-v1, pm-tour-positionering-v1): wie al een
   presentatie maakte, krijgt ze bij zijn eerste voorstel of positionering
   toch. Ze gebruiken de panelen hierboven. Tot de positionering er was, hoorde
   pm-tour-positionering-v1 bij het voorstel: app.js zet die stand één keer
   over naar pm-tour-voorstel-v1.

   Aanpassen: verander de tekst tussen de aanhalingstekens en herlaad de tool.
   Een nieuwe [?] of stap werkt pas als het data-attribuut ook in de HTML staat.
   Schrijfwijze: je-vorm, korte zinnen, knoppen in kleine letters zoals in de
   tool (cyaan, + slide), uitleg hoogstens 40 woorden, een stap hoogstens 35,
   een titel hoogstens 5.
   ============================================================================= */
(window.PM_HELP = window.PM_HELP || {}).presentation = {

  sections: [
    { id: 'soort', label: 'Soort', title: 'Wat maak je?', icon: 'file-copy-2-line' },
    // Alleen bij een voorstel; in een presentatie of positionering zijn deze rail-knoppen verborgen
    { id: 'voorstel', label: 'Voorstel', title: 'Het voorstel', icon: 'file-list-3-line' },
    { id: 'prijzen', label: 'Prijzen', title: 'Investering', icon: 'money-euro-circle-line' },
    // Alleen bij een positionering; hetzelfde icoon als Gegevens in de Document Maker
    { id: 'gegevens', label: 'Gegevens', title: 'De positionering', icon: 'contacts-book-line' },
    { id: 'layout', label: 'Layout', title: 'Layout van deze slide', icon: 'layout-masonry-line' },
    { id: 'inhoud', label: 'Inhoud', title: 'Inhoud van deze slide', icon: 'input-method-line' },
    { id: 'foto', label: 'Foto', title: 'Foto op deze slide', icon: 'image-line' },
    { id: 'presentatie', label: 'Presentatie', title: 'Hele presentatie', icon: 'slideshow-line' },
    { id: 'ai', label: 'AI', title: 'Maken met AI', icon: 'sparkling-line' },
  ],

  help: {
    // Soort
    // De volgorde van het klanttraject: eerst het voorstel, na het traject de positionering
    'soort': {
      title: 'Presentatie, voorstel of positionering',
      text: 'Presentatie: vrije slides in zeven layouts. Voorstel: na het eerste gesprek; het formulier maakt de slides. Positionering: na het traject, met beide canvassen en een toelichting per blok. Wisselen mag altijd: niets gaat verloren.',
    },

    // Voorstel
    'voorstel': {
      title: 'Het voorstel',
      text: 'Vul de klant in: de slides volgen meteen en de fases nummeren zichzelf. Bedragen vul je in bij Prijzen, de waardepropositie op zijn eigen slide bij Inhoud. Wat je op een slide zelf aanpast, blijft staan.',
    },
    // Dezelfde punten als de controle vóór de download (checklist in voorstel.js), maar al tijdens het invullen
    'checklist': {
      title: 'Klaar om te versturen?',
      text: 'De lijst loopt na wat vaak vergeten wordt: klantnaam, prijzen, logo, waardepropositie, invulplekken en tekst die niet past. Klik op een punt om ernaartoe te gaan; optioneel mag open blijven. Bij downloaden kijkt de tool nog één keer.',
    },
    // Uitzetten parkeert de slide (met foto en eigen aanpassingen); vaste slides
    // hebben geen schakelaar en komen terug via "zet terug" (#pRestore, bovenaan Voorstel)
    'onderdelen': {
      title: 'Onderdelen',
      text: 'Zet aan wat erin komt. Uitzetten of verwijderen gooit niets weg: weer aan brengt de slide terug, met je aanpassingen. Vaste slides, zoals Onze belofte, komen terug met zet terug bovenaan. SEA wordt een regel, geen slide.',
    },

    // Prijzen. Eén keer ** in de tekst: twee keer zou help.js als vet lezen
    'prijsregels': {
      title: 'Prijsregels',
      text: 'Per regel een omschrijving en een bedrag: 1500 of 1.500,- wordt € 1.500,-, N.T.B. blijft staan. Een regel wordt vet met dubbele sterretjes (**) om de omschrijving, of als hij met Totaal begint. Totaal per groep staat standaard uit.',
    },

    // Gegevens (de positionering): alleen wat voor de hele presentatie geldt
    'gegevens': {
      title: 'De positionering',
      text: 'De opbouw ligt vast: elke slide hoort erin, in deze volgorde. De klantnaam komt op de titelslide, de sectieslides en de afsluiter. De canvassen en de toelichting schrijf je per slide, bij Inhoud.',
    },
    // Dezelfde kaart als bij Voorstel, met de punten van de positionering
    'checklist-positionering': {
      title: 'Klaar om te versturen?',
      text: 'De lijst loopt na wat vaak vergeten wordt: klantnaam, beide canvassen, elke toelichting, invulplekken en tekst die niet past. Klik op een punt om ernaartoe te gaan; optioneel mag open blijven. Bij downloaden kijkt de tool nog één keer.',
    },

    // Layout
    'layout': {
      title: 'Layout',
      text: 'Elke layout is een vaste opbouw in de huisstijl, van titelslide tot tabel. De miniaturen tonen je eigen tekst in elke layout. Wissel gerust: je tekst en foto blijven bewaard.',
    },

    // Inhoud
    'citaat-of-cijfer': {
      title: 'Citaat of kerncijfer',
      text: 'Citaat: een uitspraak groot naast een cyaan zeshoek met aanhalingsteken, met naam en functie eronder. Kerncijfer: één getal heel groot in cyaan, zoals +184%, met een toelichting en een bron.',
    },
    'kerncijfer': {
      title: 'Kerncijfer',
      text: 'Hoogstens 12 tekens. Het cijfer wordt zo groot als de slide toelaat en krimpt alleen als het niet past. Kort werkt het sterkst: +184%, 3x of € 2,4 mln.',
    },
    'nadruk': {
      title: 'Nadruk',
      text: 'Selecteer woorden en klik boven de slide op cyaan (of Ctrl + B): in titels en citaten krijgen ze de accentkleur. In de andere velden heet de knop vet. In het veld zie je nadruk als markering.',
    },
    // Staat bij het veld Tekst (#sBody), dus ook bij Tekst en Toelichting
    'opsomming': {
      title: 'Punten',
      text: 'Bij Opsomming en de afsluiter wordt elke regel een punt met een cyaan zeshoekje. Bij Beeld + tekst, Tekst en Toelichting alleen een regel met een streepje en een spatie ervoor (- ); een lege regel geeft daar extra ruimte.',
    },
    'label': {
      title: 'Label',
      text: 'Een kort woord linksboven, in hoofdletters met een cyaan zeshoekje, zoals ANALYSE. Een nieuwe slide neemt het label van de vorige over, zodat een hoofdstuk herkenbaar blijft. Leeg laten mag.',
    },
    'notities': {
      title: 'Sprekersnotities',
      text: 'Wat je bij deze slide vertelt. Ze staan niet op de slide, maar in PowerPoint en Google Slides onder de slide (Notities), en in de presentatieweergave alleen op jouw scherm. De AI schrijft ze mee.',
    },
    'tabel': {
      title: 'Tabel',
      text: 'Tot 14 rijen en 8 kolommen. Kolommen met alleen getallen of bedragen lijnen vanzelf rechts uit, en **woord** wordt cyaan. Hoe meer inhoud, hoe kleiner de letter; een lange titel mag daarvoor iets krimpen.',
    },
    'plakken-uit-excel': {
      title: 'Plakken uit Excel',
      text: 'Kopieer cellen in Excel, Google Sheets of Numbers en plak ze in een cel. De tabel vult zich vanaf die cel en groeit mee, tot 14 rijen en 8 kolommen. Wat niet past, valt weg.',
    },
    'kopregel': {
      title: 'Kopregel',
      text: 'De eerste rij wordt de kop van de tabel: vet, op een donker vlak met een cyaan lijn eronder. Zet hem uit als je tabel geen kolomnamen heeft.',
    },
    'eerste-kolom-vet': {
      title: 'Eerste kolom vet',
      text: 'De eerste kolom wordt halfvet en wit, als label per rij, zoals de kanalen in een overzicht per kanaal. Handig als elke rij over iets anders gaat.',
    },
    // Staat bij Inhoud (een slide uit het voorstel of de positionering) én onder de lead
    // van Voorstel en van Gegevens
    'uit-voorstel': {
      title: 'Je eigen aanpassingen',
      text: 'Slides uit het voorstel of de positionering volgen het formulier. Wat je zelf op een slide aanpast, blijft staan; het formulier werkt alleen de andere velden bij. Met terugzetten, bij Inhoud, volgt een slide weer helemaal het formulier.',
    },
    // De vakken van de canvas-slide staan bij Inhoud (data-for="vpc"), in het voorstel en
    // in de positionering. Een interne tool: geen bronvermelding, hier niet en op de slide niet
    'waardepropositie': {
      title: 'Waardepropositie',
      text: 'De vakken van deze slide: rechts het klantprofiel (wat de klant wil), links de waardemap (wat jullie bieden). Houd het bij trefwoorden. Een regel helemaal vet wordt een kopje zonder punt. Een leeg vak toont een korte uitleg.',
    },
    // De blokken van het business model canvas (data-for="bmc"), alleen in de positionering.
    // Inspringen kent de slide niet: een genest punt wordt een gewoon punt
    'business-model-canvas': {
      title: 'Business Model Canvas',
      text: 'Zeven blokken, zoals op de slide. Schrijf in trefwoorden: een vet kopje met punten eronder, elk met een streepje ervoor. Een punt onder een punt wordt een gewoon punt. De uitleg in zinnen komt op de toelichtingsslides.',
    },
    // De layout Toelichting: de tekst loopt over twee kolommen (templates.js, flowColumns)
    'toelichting': {
      title: 'Toelichting',
      text: 'Per blok of vak van de canvassen een eigen slide. Schrijf alinea\'s, of een vet kopje met punten eronder. Lange tekst loopt vanzelf over twee kolommen en wordt kleiner tot hij past. Vervang de tekst tussen blokhaken.',
    },

    // Foto
    'foto-in-zeshoek': {
      title: 'Foto in een zeshoek',
      text: 'Op de titelslide en de afsluiter staat je foto rechts in een grote zeshoek. Zonder foto staat daar een compositie van cyaan zeshoeken, dus een foto is optioneel.',
    },
    'foto-kant': {
      title: 'Foto staat',
      text: 'Bij Beeld + tekst vult de foto de linker- of rechterhelft, van boven tot onder, met een cyaan streep in het midden. Rechts krijgt hij onderin een donker verloop, zodat het logo leesbaar blijft.',
    },
    'uitsnede': {
      title: 'Inzoomen en verschuiven',
      text: 'Zoom in tot 300% en sleep de foto op de slide op zijn plek. Of klik op de foto en gebruik de pijltjestoetsen, met Shift in grotere stappen. Elke slide onthoudt zijn eigen uitsnede.',
    },
    'foto-of-logo': {
      title: 'Foto of logo',
      text: 'Foto vult de zeshoek; je kunt hem verschuiven en inzoomen. Logo staat in zijn geheel op een witte zeshoek, zoals het klantlogo op de titelslide van een voorstel. Het mooist: een PNG of SVG met transparante achtergrond.',
    },

    // Hele presentatie
    'slidenummers': {
      title: 'Slidenummers',
      text: 'Zet “03 / 07” naast het logo op elke slide. Standaard staat het uit. In PowerPoint wordt het een echt slidenummer (“3”), dat vanzelf meetelt als je daar slides verschuift of toevoegt.',
    },
    'cyaan-punt': {
      title: 'Cyaan punt',
      text: 'Zet een cyaan punt achter elke titel, net als in het logo van Pure Minds. Eindigt een titel al op een punt, dan wordt die cyaan; na ?, ! of : komt er geen punt.',
    },

    // Kop van de preview
    'emerce-badge': {
      title: 'Emerce 100',
      text: 'Pure Minds staat in de Emerce 100 van 2026: de beste e-businessbedrijven. Aan: de badge staat klein en wit rechtsonder op elke slide, naast het logo (of het slidenummer als dat aanstaat). Ook in PDF, PowerPoint en PNG.',
    },

    // Strook met slides onder de slide
    'slides': {
      title: 'Slides',
      text: 'Klik op een slide om hem te bewerken. Naar voren en naar achteren verplaatsen de gekozen slide; slepen kan ook. ← en → bladeren alleen. Hoogstens 40 slides; verwijderen maak je ongedaan in de melding of met Ctrl + Z.',
    },

    // Download
    'download-pdf': {
      title: 'PDF',
      text: 'Eén pagina per slide in 16:9, even groot als in PowerPoint. Tekst en vormen zijn vector, dus scherp op elk scherm. Het beste bestand om te presenteren of te versturen.',
    },
    'powerpoint': {
      title: 'PowerPoint',
      text: 'Om verder te bewerken in PowerPoint of Google Slides, met echte tekstvakken. Mist je computer Pure Minds Sans, dan kiest PowerPoint een ander lettertype. Voor Google Slides: upload in Drive en kies Bestand → Opslaan als Google Presentaties.',
    },
    'als-afbeelding': {
      title: 'Als afbeelding',
      text: 'Een PNG van deze slide, of een zip met alle slides, voor een mail, LinkedIn of een scherm. Full HD is 1920 × 1080 px; 4K is 3840 × 2160 px, voor grote schermen.',
    },
  },

  tour: [
    {
      id: 'welkom',
      title: 'Maak je eerste presentatie',
      text: 'Je begint niet bij nul: de voorbeeldslides laten zien wat kan. In een paar stappen maak je er je eigen presentatie van. Lettertype, kleuren en logo regelt de tool.',
    },
    {
      id: 'titel', section: 'inhoud', target: 'titel',
      title: 'Typ je titel',
      text: 'Vervang de voorbeeldtitel door die van jou. Hoe langer de titel, hoe kleiner de letter: de huisstijl past hem vanzelf op de slide.',
      doe: { event: 'input', min: 3, hint: 'Typ je titel' },
    },
    {
      id: 'nadruk', section: 'inhoud', target: 'titel',
      title: 'Laat een woord opvallen',
      text: 'Selecteer een of twee woorden in je titel en klik op cyaan. Ze krijgen de accentkleur van Pure Minds, zodat de kern van je verhaal eruitspringt.',
      doe: { signal: 'nadruk', hint: 'Selecteer een woord en klik op cyaan' },
    },
    {
      id: 'foto', section: 'foto', target: 'foto',
      title: 'Voeg een foto toe',
      text: 'Sleep een foto op de slide, of klik hier om er een te kiezen. Hij valt vanzelf in de vorm van de layout. Geen foto bij de hand? Sla deze stap over.',
      doe: { signal: 'foto', hint: 'Kies of sleep een foto' },
    },
    {
      id: 'nieuwe-slide', target: 'slide-toevoegen',
      title: 'Voeg een slide toe',
      text: 'Klik op + slide. De nieuwe slide komt na de slide die je nu ziet, en je kiest meteen een layout.',
      doe: { event: 'click', hint: 'Klik op + slide' },
    },
    {
      id: 'layout', section: 'layout', target: 'layout',
      title: 'Kies een layout',
      text: 'Kies hoe je nieuwe slide eruitziet: een opsomming, beeld + tekst, een tabel of een citaat. De miniaturen tonen je eigen tekst in elke layout.',
      doe: { event: 'click', hint: 'Klik op een layout' },
    },
    {
      id: 'slides', target: 'slides',
      title: 'Blader door je slides',
      text: 'Hier staan al je slides. Klik op een slide om hem te bewerken. Verplaatsen doe je met naar voren en naar achteren bij de gekozen slide, of door te slepen.',
      doe: { event: 'click', hint: 'Klik op een andere slide' },
    },
    // De bieb: opslaan om later aan te passen, en wat je kiest bij opnieuw opslaan
    {
      id: 'opslaan', target: 'opslaan',
      title: 'Sla je presentatie op',
      text: 'Klik op opslaan: je presentatie blijft 14 dagen in de bieb, ook voor je collega’s. Pas je hem later aan? Sla dan opnieuw op en kies: vorige versie overschrijven of als nieuw opslaan.',
      doe: { event: 'click', hint: 'Klik op opslaan' },
    },
    {
      id: 'download', target: 'download',
      title: 'Download je presentatie',
      text: 'Klik op download pdf. Staat er nog voorbeeldtekst in, dan zie je eerst waar. Het pijltje ernaast heeft PowerPoint (ook voor Google Slides) en afbeeldingen.',
      doe: { signal: 'download', hint: 'Klik op download pdf' },
    },
    {
      id: 'klaar',
      title: 'Je presentatie is klaar',
      text: 'Deze rondleiding en de sneltoetsen vind je altijd terug in het ?-menu rechtsboven. Tip: plak een tabel uit Excel of Google Sheets rechtstreeks in de layout Tabel.',
    },
  ],

  keys: [
    ['← →', 'vorige of volgende slide (buiten een tekstveld)'],
    ['Page Up / Page Down', 'vorige of volgende slide'],
    ['Home / End', 'in de strook: eerste of laatste slide'],
    ['Delete', 'in de strook: de gekozen slide verwijderen'],
    ['Enter', 'in de strook: de gekozen slide bewerken'],
    ['Ctrl + B', 'in een tekstveld: cyaan of vet'],
    ['Ctrl + S', 'pdf downloaden'],
    ['Ctrl + V', 'foto plakken op deze slide'],
    ['← ↑ → ↓', 'foto verschuiven (klik eerst op de foto in de preview)'],
    ['Shift + ← ↑ → ↓', 'foto in grotere stappen verschuiven'],
    ['Tab', 'in de tabel: naar de volgende cel'],
    ['Enter', 'in de tabel: naar de cel eronder, of een nieuwe rij'],
    ['Enter', 'in de prijsregels: naar de regel eronder, of een nieuwe regel'],
    ['Ctrl + Z', 'ongedaan maken'],
    ['Ctrl + Shift + Z of Ctrl + Y', 'opnieuw'],
    ['Alt + F10', 'naar de werkbalk'],
    ['?', 'sneltoetsen tonen'],
  ],
};

/* Rondleiding "je eerste voorstel": start vanzelf bij je eerste voorstel (PM.tour met
   tool 'voorstel', eigen stand). Dezelfde regels als hierboven; de panelen (section)
   komen uit PM_HELP.presentation.sections. Leren door te doen: de klantnaam typen, een
   onderdeel aanzetten en een prijs invullen verandert meteen de slides. */
window.PM_HELP.voorstel = {
  tour: [
    {
      id: 'welkom',
      title: 'Maak je eerste voorstel',
      text: 'Je begint niet bij nul: de opbouw en vaste teksten van Pure Minds staan klaar. Jij vult de klant in, het formulier maakt de slides, en alles blijft aanpasbaar. Doe gewoon mee.',
    },
    {
      id: 'klant', section: 'voorstel', target: 'voorstel',
      title: 'Typ de klantnaam',
      text: 'Typ de naam van de klant en kijk naar de preview: de titelslide, de situatie, de aanpak en de fases nemen hem meteen over. Het klantlogo kies je iets lager.',
      doe: { event: 'input', min: 3, hint: 'Typ de klantnaam' },
    },
    {
      id: 'situatie', section: 'voorstel', target: 'situatie',
      title: 'Beschrijf de situatie',
      text: 'Waar staat de klant nu? Klik in het veld: de preview springt naar die slide. Een lege regel begint een nieuwe alinea. Selecteer woorden en klik boven de slide op vet.',
    },
    {
      id: 'onderdelen', section: 'voorstel', target: 'onderdelen',
      title: 'Kies de onderdelen',
      text: 'Zet aan wat je de klant aanbiedt. Slides komen en gaan vanzelf en de fases nummeren zichzelf. Uitzetten gooit niets weg, ook je aanpassingen niet. SEA voegt alleen een regel toe bij de aanpak.',
      doe: { event: 'change', hint: 'Zet een onderdeel aan of uit' },
    },
    {
      id: 'prijzen', section: 'prijzen', target: 'prijzen',
      title: 'Vul de prijzen in',
      text: 'Eén regel per post: omschrijving en bedrag. Typ 1500 en de tool maakt er € 1.500,- van. Enter geeft een nieuwe regel, en rijen uit Excel plak je in één keer.',
      doe: { event: 'input', min: 1, hint: 'Vul een regel in' },
    },
    {
      id: 'eigen', target: 'slides',
      title: 'Pas een slide aan',
      text: 'Klik op een slide in de strook. Elke slide kun je zelf aanpassen bij Inhoud; het formulier werkt dan alleen de rest bij.',
      doe: { event: 'click', hint: 'Klik op een slide' },
    },
    // De melding boven de velden bij Inhoud (#posNote)
    {
      id: 'terugzetten', section: 'inhoud', target: 'posnote',
      title: 'Formulier of eigen tekst',
      text: 'Deze melding zegt of de slide het formulier volgt. Typ je hier zelf iets, dan blijft jouw tekst staan. Met terugzetten volgt hij weer het formulier.',
    },
    // Zonder doel: app.js kiest de canvas-slide (als de waardepropositie aan staat)
    {
      id: 'canvas', section: 'inhoud',
      title: 'Vul de waardepropositie in',
      text: 'De waardepropositie heeft een eigen slide: vul de vakken bij Inhoud in, met drie of vier trefwoorden per vak. Leeg laten? Dan staan er alleen hulpvragen op; zet hem dan uit bij Onderdelen.',
    },
    {
      id: 'checklist', section: 'voorstel', target: 'checklist',
      title: 'Wat ontbreekt er nog?',
      text: 'Deze lijst houdt bij wat nog ontbreekt: de klantnaam, prijzen, invulplekken zoals [klantnaam] en tekst die niet past. Klik op een punt en je springt ernaartoe. Optioneel mag open blijven.',
    },
    {
      id: 'badge', target: 'badge',
      title: 'Emerce 100 erbij?',
      text: 'Pure Minds staat in de Emerce 100: een sterk keurmerk in een voorstel. Zet het knopje aan en de badge staat klein rechtsonder op elke slide. Standaard staat hij uit.',
    },
    // De bieb: opslaan om later aan te passen, en wat je kiest bij opnieuw opslaan
    {
      id: 'opslaan', target: 'opslaan',
      title: 'Sla je voorstel op',
      text: 'Klik op opslaan: je voorstel blijft 14 dagen in de bieb, ook voor je collega’s. Pas je het later aan? Sla dan opnieuw op en kies: vorige versie overschrijven of als nieuw opslaan.',
      doe: { event: 'click', hint: 'Klik op opslaan' },
    },
    {
      id: 'download', target: 'download',
      title: 'Download je voorstel',
      text: 'Klik op download pdf. De tool kijkt eerst nog één keer naar invulplekken en tekst die niet past. Via het pijltje: PowerPoint om verder te bewerken, of afbeeldingen.',
      doe: { signal: 'download', hint: 'Klik op download pdf' },
    },
    // De valkuilen: waar mensen overheen kijken
    {
      id: 'klaar',
      title: 'Je voorstel is klaar',
      text: 'Opslaan zet het in de teambieb. Wisselen bij Soort bewaart je andere presentatie. Check vóór het versturen de lijst bij Voorstel; de PowerPoint blijft bewerkbaar.\n\nDeze rondleiding staat onder hulp.',
    },
  ],
};

/* Rondleiding "je eerste positionering": start vanzelf bij je eerste positionering (PM.tour
   met tool 'positionering', eigen stand). Dezelfde regels als hierboven. Elk doel bestaat
   altijd in een positionering; een titel-stap is er niet, want de titelslide volgt de
   klantnaam. Het formulier is klein: het werk zit in de canvassen en de toelichting. */
window.PM_HELP.positionering = {
  tour: [
    {
      id: 'welkom',
      title: 'Maak je eerste positionering',
      text: 'De positionering volgt na het traject, op het voorstel. De vaste opbouw en teksten van Pure Minds staan klaar; er kan niets uit. Jij vult de klant, de canvassen en de toelichting in.',
    },
    // Geen doe-stap: komt de positionering na een voorstel, dan staat de naam er al
    {
      id: 'klant', section: 'gegevens', target: 'gegevens-klant',
      title: 'Typ de klantnaam',
      text: 'Maakte je eerst het voorstel, dan staat de naam er al. Zo niet, typ hem hier: de titelslide, de sectieslides en de afsluiter nemen hem meteen over.',
    },
    // Zonder doel: app.js kiest de slide Business Model Canvas
    {
      id: 'canvas', section: 'inhoud',
      title: 'Vul de canvassen in',
      text: 'Beide canvassen hebben een eigen slide. Vul bij Inhoud de zeven blokken van het Business Model Canvas in, in trefwoorden: een vet kopje met punten eronder, elk met - ervoor. Daarna het Waarde Propositie Canvas.',
    },
    // Zonder doel: app.js kiest de eerste toelichting in de strook, Inhoud toont dan zijn tekst
    // (ook als je de rondleiding bij deze stap hervat)
    {
      id: 'toelichting', section: 'inhoud',
      title: 'Schrijf de toelichting',
      text: 'Elk blok en elk vak krijgt een eigen slide. Vervang de tekst tussen [blokhaken] door je uitleg: alinea\'s, of vette kopjes met punten. Lange tekst loopt vanzelf over twee kolommen.',
    },
    {
      id: 'checklist', section: 'gegevens', target: 'gegevens-checklist',
      title: 'Wat ontbreekt er nog?',
      text: 'Deze lijst houdt bij wat nog ontbreekt: de klantnaam, beide canvassen, elke toelichting, invulplekken en tekst die niet past. Klik op een punt en je springt ernaartoe.',
    },
    {
      id: 'badge', target: 'badge',
      title: 'Emerce 100 erbij?',
      text: 'Pure Minds staat in de Emerce 100. Zet het knopje aan en de badge staat klein rechtsonder op elke slide, ook in de PDF en PowerPoint. Standaard staat hij uit.',
    },
    // De bieb: opslaan om later aan te passen, en wat je kiest bij opnieuw opslaan
    {
      id: 'opslaan', target: 'opslaan',
      title: 'Sla je positionering op',
      text: 'Klik op opslaan: je positionering blijft 14 dagen in de bieb, ook voor je collega’s. Pas je hem later aan? Sla dan opnieuw op en kies: vorige versie overschrijven of als nieuw opslaan.',
      doe: { event: 'click', hint: 'Klik op opslaan' },
    },
    {
      id: 'download', target: 'download',
      title: 'Download je positionering',
      text: 'Klik op download pdf. De tool kijkt eerst nog één keer naar invulplekken, lege blokken of vakken en tekst die niet past. Via het pijltje: PowerPoint om verder te bewerken, of afbeeldingen.',
      doe: { signal: 'download', hint: 'Klik op download pdf' },
    },
    // De valkuilen: waar mensen overheen kijken
    {
      id: 'klaar',
      title: 'Je positionering is klaar',
      text: 'Opslaan zet het in de teambieb. Wisselen bij Soort bewaart je voorstel en je presentatie. Tip: eerst de canvassen in trefwoorden, dan per blok de toelichting in zinnen.\n\nDeze rondleiding staat onder hulp.',
    },
  ],
};
