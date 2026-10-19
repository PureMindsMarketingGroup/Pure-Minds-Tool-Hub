/* =============================================================================
   insta/help.js — uitleg, rondleiding en sneltoetsen van de Insta Post Maker
   -----------------------------------------------------------------------------
   Alleen tekst, geen gedrag. Alles hangt onder window.PM_HELP.insta:

     sections  de knoppen in de zijbalk, van boven naar beneden: id, label
               (één woord onder het icoon, hoogstens ~10 tekens), title (kop
               van het paneel) en icon (Remix-icoon uit
               assets/icons/<categorie>/<naam>.svg, altijd de -line-variant)
     help      de uitleg achter een [?]. De sleutel is gelijk aan
               data-help="<sleutel>" in tools/insta.html; zonder dat attribuut
               verschijnt de uitleg nergens.
     tour      de rondleiding. target is gelijk aan data-tour="<target>" in
               tools/insta.html; section opent eerst dat paneel. doe laat een
               stap wachten tot je het echt doet:
                 event 'input' (min = aantal getypte tekens), 'change' of
                 'click' op het doel, of signal '<naam>' dat de tool zelf
                 geeft: 'nadruk', 'foto' en 'download'.
               hint staat bij de stap zolang hij wacht. Is het doel in dit
               template niet zichtbaar (een slide zonder foto, geen cyaan
               in een case), dan slaat de rondleiding de stap over.
     keys      het venster met sneltoetsen: [toets, wat hij doet]. Ctrl is op
               een Mac de Cmd-toets.

   Aanpassen: verander de tekst tussen de aanhalingstekens en herlaad de tool.
   Een nieuwe [?] of stap werkt pas als het data-attribuut ook in de HTML staat.
   Schrijfwijze: je-vorm, korte zinnen, knoppen in kleine letters zoals in de
   tool (cyaan, download), uitleg hoogstens 40 woorden, een stap hoogstens 35,
   een titel hoogstens 5.
   ============================================================================= */
(window.PM_HELP = window.PM_HELP || {}).insta = {

  sections: [
    { id: 'template', label: 'Template', title: 'Kies template en formaat', icon: 'layout-masonry-line' },
    { id: 'foto', label: 'Foto', title: 'Foto en uitsnede', icon: 'image-line' },
    { id: 'tekst', label: 'Tekst', title: 'Tekst van je post', icon: 'input-method-line' },
    { id: 'details', label: 'Details', title: 'Fijnafstellen', icon: 'equalizer-line' },
  ],

  help: {
    // Template en formaat
    'formaat': {
      title: 'Formaat',
      text: '4:5 is de feedpost: hij staat rechtop en vult in de feed het meeste scherm. 9:16 is een story, met label en logo buiten de balken van Instagram. 1,91:1 is liggend: een foto in de breedte, op Instagram en LinkedIn.',
    },

    // Foto
    'foto-toevoegen': {
      title: 'Foto toevoegen',
      text: 'Je foto blijft staan als je van template wisselt, ook na herladen. Neem minstens 1080 px aan de korte kant, anders wordt hij onscherp. JPG, PNG en WebP werken, HEIC van een iPhone niet.',
    },
    'foto-in-zeshoek': {
      title: 'Foto staat',
      text: 'Volledig beeld: de foto vult de hele post, met een zacht donker verloop onder het logo. In zeshoek: de foto staat in een grote zeshoek op het donkere vlak. Handig voor een portret of een drukke foto.',
    },
    'foto-als-achtergrond': {
      title: 'Foto als achtergrond',
      text: 'Aan: je foto komt achter de hele case, bijna helemaal donker gemaakt zodat de tekst leesbaar blijft. Uit: een effen donkere achtergrond; een gekozen foto blijft dan bewaard, maar staat niet in de case.',
    },
    'uitsnede': {
      title: 'Inzoomen en verschuiven',
      text: 'Zoom in tot 300% en sleep de foto in de preview op zijn plek. Of klik op de preview en gebruik de pijltjestoetsen; met Shift gaat het in grotere stappen. Centreren zet zoom en positie terug.',
    },

    // Tekst
    'nadruk': {
      title: 'Nadruk',
      text: 'Selecteer woorden en klik op cyaan: in de kop krijgen ze de accentkleur. In de tekst van een carousel maakt vet ze wit en vet. Nog een keer klikken haalt het weg. In het veld staan ze tussen **.',
    },
    'invulplek': {
      title: 'Invulplekken',
      text: '+ klant, + diensten en + onderwerp zetten een invulplek bij je cursor, zoals {klant}. In de post komt daar de inhoud van dat veld, en die verandert mee als je het veld aanpast. Diensten en onderwerp krijgen nadruk.',
    },
    'diensten': {
      title: 'Wat hebben we gedaan?',
      text: "Vul één tot drie diensten in. De tool maakt er een lopende zin van, met komma’s en “en”, zoals: Google Ads, SEO en een nieuwe landingspagina. Ze komen in cyaan op de plek van {diensten}.",
    },
    'klantlogo': {
      title: 'Klantlogo',
      text: 'Het logo komt passend in de witte zeshoek rechtsboven. Zonder logo staat daar de klantnaam. Een PNG of SVG met transparante achtergrond werkt het best; een wit logo zie je op het witte vlak niet.',
    },
    'resultaat': {
      title: 'Resultaat',
      text: 'Het cijfer staat groot in cyaan in het resultaatblok onderin, met de toelichting ernaast. Kort werkt het sterkst: hoogstens 10 tekens, zoals +184% of 3x. Laat beide velden leeg en het blok verdwijnt.',
    },
    'cta-blok': {
      title: 'Magenta blok',
      text: 'Een oproep onderin de blogpost, zoals “lees de blog”. Het is geen knop: er staat geen pijl bij, want in een post kun je niet klikken. Houd het kort (hoogstens 32 tekens) en in kleine letters.',
    },
    'slides': {
      title: 'Slides',
      text: 'Een carousel heeft hoogstens 20 slides; eerder en later veranderen de volgorde. De laatste slide krijgt vanzelf geen swipe-aanwijzing. Staat de Emerce 100-badge aan, dan staat hij alleen op die laatste slide.',
    },
    'foto-op-slide': {
      title: 'Foto op deze slide',
      text: 'Elke slide kan een eigen foto hebben. Zet hem aan op de slides waar een beeld helpt, bijvoorbeeld de hook vooraan. Kiezen, verschuiven en inzoomen doe je bij Foto.',
    },
    'foto-op-slide-stijl': {
      title: 'Foto staat',
      text: 'In zeshoek: rechtsboven, met de titel ernaast en de tekst eronder. Als achtergrond: de foto vult de slide, donker gemaakt zodat de witte tekst goed leesbaar blijft.',
    },
    'donkere-laag': {
      title: 'Donkere laag',
      text: 'Hoe donker de achtergrondfoto wordt achter de tekst, per slide: standaard 80%. Hoger maakt de witte tekst beter leesbaar, lager laat meer van de foto zien.',
    },
    'slidenummer': {
      title: 'Nummer in zeshoek',
      text: 'Zet het nummer uit voor een slide die geen tip is, zoals de hook vooraan of de afsluiter. Die slide krijgt een grotere titel, iets boven het midden. Hij telt niet mee: de eerste slide met nummer is 01.',
    },
    'opsomming': {
      title: 'Opsomming',
      text: 'Begin een regel met een streepje en een spatie (- ) en hij wordt een punt met een cyaan zeshoekje. Een lege regel geeft wat extra ruimte. Past het niet, dan worden titel en tekst samen kleiner.',
    },
    'label': {
      title: 'Label',
      text: 'Een kort woord linksboven, in hoofdletters en met een cyaan zeshoekje ervoor, zoals PURE KENNIS. Het zegt in één oogopslag wat voor post het is. Laat het leeg voor een post zonder label.',
    },

    // Details
    'verloop': {
      title: 'Donker verloop',
      text: 'Hoe donker de foto wordt achter de tekst: standaard 100%, zodat de tekst altijd goed leesbaar is. Lager laat meer van de foto zien. Zonder kop en toelichting krijgt de foto geen verloop.',
    },
    'cyaan-punt': {
      title: 'Cyaan punt',
      text: 'Zet een cyaan punt achter de kop, net als in het logo van Pure Minds. Eindigt je kop al op een punt, dan wordt die cyaan; na ?, ! of : komt er geen punt. Geldt voor elk template.',
    },

    // Kop van de tool
    'emerce-badge': {
      title: 'Emerce 100',
      text: 'Pure Minds staat in de Emerce 100 van 2026, de beste e-businessbedrijven. Aan: de badge komt klein en wit linksonder in de post; in een carousel alleen op de laatste slide. Blijft aan voor je volgende posts.',
    },

    // Download
    'export-voor': {
      title: 'Instagram, LinkedIn of extra scherp',
      text: 'Instagram: 1080 px breed. LinkedIn: 1200 px, en een carousel wordt daar één PDF, want LinkedIn toont hem als document. Extra scherp: 2160 px, voor een groot scherm of drukwerk. Het ontwerp blijft precies gelijk.',
    },
    'bestandstype': {
      title: 'PNG, JPG of PDF',
      text: 'PNG is scherp, JPG kleiner. Kies PDF om verder te werken in Canva: tekst, vormen en logo blijven losse lagen die je kunt aanpassen. Foto’s en verlopen zijn afbeeldingen. Werkt ook in Illustrator en Acrobat. Kopiëren is altijd PNG.',
    },
    'kopieer': {
      title: 'Kopieer',
      text: 'Zet je post als afbeelding op het klembord, zonder te downloaden. Plak hem met Ctrl + V in een mail, Slack of Teams. In een carousel kopieer je de slide die je ziet. Aanpassen in Canva? Download de PDF.',
    },
  },

  tour: [
    {
      id: 'welkom',
      title: 'Maak je eerste post',
      text: 'In een paar stappen maak je een post in de huisstijl, en je doet het meteen echt. Lettertype, kleuren en logo regelt de tool; jij kiest de inhoud.',
    },
    {
      id: 'template', section: 'template', target: 'template',
      title: 'Kies een template',
      text: 'Een template is een vaste opmaak, zoals foto met tekst of een carousel. Klik er een aan en je post verandert meteen. Het formaat kies je eronder.',
      doe: { event: 'click', hint: 'Klik op een template' },
    },
    {
      id: 'kop', section: 'tekst', target: 'kop',
      title: 'Schrijf je eigen tekst',
      text: 'Vervang de voorbeeldtekst door je eigen woorden. Hoe langer de tekst, hoe kleiner de letter: de huisstijl past hem vanzelf in het vak.',
      doe: { event: 'input', min: 3, hint: 'Typ je eigen tekst' },
    },
    {
      id: 'nadruk', section: 'tekst', target: 'kop',
      title: 'Laat een woord opvallen',
      text: 'Selecteer een woord in je kop en klik op cyaan. Het krijgt de accentkleur van Pure Minds. Kies één kernwoord, dan springt het eruit.',
      doe: { signal: 'nadruk', hint: 'Selecteer een woord en klik op cyaan' },
    },
    {
      id: 'foto', section: 'foto', target: 'foto',
      title: 'Voeg een foto toe',
      text: 'Sleep een foto op de preview, of klik hier om er een te kiezen. Hij vult vanzelf de fotoplek. Geen foto bij de hand? Sla deze stap over.',
      doe: { signal: 'foto', hint: 'Kies of sleep een foto' },
    },
    {
      id: 'preview', target: 'preview',
      title: 'Bekijk je post',
      text: 'Zo wordt je post, precies zoals je hem downloadt. Staat er een foto in? Sleep hem hier op zijn plek. Is een tekst te lang, dan zie je eronder een melding.',
    },
    // De bieb: opslaan om later aan te passen, en wat je kiest bij opnieuw opslaan
    {
      id: 'opslaan', target: 'opslaan',
      title: 'Sla je post op',
      text: 'Klik op opslaan: je post blijft 14 dagen in je bieb. Pas je hem later aan? Sla dan opnieuw op en kies: vorige versie overschrijven of als nieuw opslaan.',
      doe: { event: 'click', hint: 'Klik op opslaan' },
    },
    {
      id: 'download', target: 'download',
      title: 'Download je post',
      text: 'Klik op download. Met het pijltje kies je waarvoor (Instagram, LinkedIn of extra scherp) en het bestand: PNG, JPG of een bewerkbare PDF voor Canva. Een carousel wordt een zip of één PDF.',
      doe: { signal: 'download', hint: 'Klik op download' },
    },
    {
      id: 'klaar',
      title: 'Je post is klaar',
      text: 'Deze rondleiding en de sneltoetsen vind je altijd terug in het hulpmenu rechtsboven. Tip: je opgeslagen posts vind je onder bieb en op het dashboard, 14 dagen lang.',
    },
  ],

  keys: [
    ['Ctrl + S', 'downloaden, net als de downloadknop'],
    ['Ctrl + V', 'foto plakken uit je klembord'],
    ['← ↑ → ↓', 'foto verschuiven (klik eerst op de preview)'],
    ['Shift + ← ↑ → ↓', 'foto in grotere stappen verschuiven'],
    ['Ctrl + Z', 'ongedaan maken'],
    ['Ctrl + Shift + Z', 'opnieuw'],
    ['Alt + F10', 'naar de werkbalk'],
    ['?', 'sneltoetsen tonen'],
  ],
};
