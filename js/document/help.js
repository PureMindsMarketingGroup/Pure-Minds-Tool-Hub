/* =============================================================================
   document/help.js — uitleg, rondleiding en sneltoetsen van de Document Maker
   -----------------------------------------------------------------------------
   Alleen tekst, geen gedrag. Alles hangt onder window.PM_HELP.document:

     sections  de knoppen in de zijbalk, van boven naar beneden: id, label
               (één woord onder het icoon, hoogstens ~10 tekens), title (kop
               van het paneel) en icon (Remix-icoon uit
               assets/icons/<categorie>/<naam>.svg, altijd de -line-variant).
               'prijzen' hoort alleen bij een offerte.
     help      de uitleg achter een [?]. De sleutel is gelijk aan
               data-help="<sleutel>" in tools/document.html; zonder dat
               attribuut verschijnt de uitleg nergens.
     tour      de rondleiding. target is gelijk aan data-tour="<target>" in
               tools/document.html; section opent eerst dat paneel. doe laat
               een stap wachten tot je het echt doet:
                 event 'input' (min = aantal getypte tekens), 'change' of
                 'click' op het doel, of signal '<naam>' dat de tool zelf
                 geeft: 'opmaak' (de werkbalk) en 'download' (na elke
                 export). Bij de stap 'opmaak' zet js/document/app.js het
                 kaartje zelf onder of boven de werkbalk (placement), zodat
                 de tekst ernaast te gebruiken blijft.
               hint staat bij de stap zolang hij wacht. Is het doel niet
               zichtbaar (de offerteregels bij een brief), dan slaat de
               rondleiding de stap over.
     keys      het venster met sneltoetsen: [toets, wat hij doet]. Ctrl is op
               een Mac de Cmd-toets.

   Aanpassen: verander de tekst tussen de aanhalingstekens en herlaad de tool.
   Een nieuwe [?] of stap werkt pas als het data-attribuut ook in de HTML staat
   (tests/document.test.js controleert dat). De [?] bij koppen en lijsten
   staan in <template id="tbarHelp"> en komen in de werkbalk.
   Schrijfwijze: je-vorm, korte zinnen, knoppen in kleine letters zoals in de
   tool (kop, download), uitleg hoogstens 40 woorden, een stap hoogstens 35,
   een titel hoogstens 5.
   ============================================================================= */
(window.PM_HELP = window.PM_HELP || {}).document = {

  sections: [
    { id: 'soort', label: 'Soort', title: 'Soort document', icon: 'file-copy-2-line' },
    { id: 'gegevens', label: 'Gegevens', title: 'Titel en gegevens', icon: 'contacts-book-line' },
    { id: 'tekst', label: 'Tekst', title: 'Je tekst', icon: 'input-method-line' },
    { id: 'prijzen', label: 'Prijzen', title: 'Prijzen en btw', icon: 'money-euro-circle-line' },
    { id: 'afsluiting', label: 'Afsluiting', title: 'Ondertekening', icon: 'quill-pen-line' },
    { id: 'briefpapier', label: 'Briefpapier', title: 'Je briefpapier', icon: 'building-line' },
  ],

  help: {
    // Soort
    'soort': {
      title: 'Soort document',
      text: 'Brief: met adres, kenmerk en aanhef. Offerte: met prijsregels, btw en een blok voor akkoord. Memo: aan, van en cc, voor intern gebruik. Notitie: alleen titel en datum. Wisselen mag altijd: je tekst blijft staan.',
    },

    // Gegevens
    'adres': {
      title: 'Adres',
      text: 'Typ elke adresregel op een eigen regel: naam, bedrijf, straat, postcode en plaats. Lege regels vallen weg. In een brief staat het adres linksboven, in een offerte onder “Offerte voor”.',
    },
    'kenmerk': {
      title: 'Kenmerk',
      text: 'Een referentie waarmee de ontvanger je brief terugvindt, zoals een dossier- of projectnummer. Het staat rechtsboven, onder de datum. Laat je het leeg, dan verdwijnt de regel.',
    },
    'geldig-tot': {
      title: 'Geldig tot',
      text: 'Tot wanneer je aanbod geldt. Bij een nieuw document staat hij op 30 dagen na vandaag. De datum staat rechtsboven, onder het offertenummer en de datum van de offerte.',
    },
    'label': {
      title: 'Label',
      text: 'Het kleine woord in hoofdletters boven de titel, met een cyaan zeshoekje. Laat je het leeg, dan staat er het soort document: BRIEF, OFFERTE, MEMO of NOTITIE. Typ iets anders, zoals VOORSTEL, om het te vervangen.',
    },

    // Tekst
    'koppen': {
      title: 'Stijl: kop en citaat',
      text: 'Zet je cursor in een alinea en kies een stijl. Kop en tussenkop geven structuur; citaat zet een alinea apart met een cyaan lijn. Maat, lettertype en uitlijning (links) kiest de huisstijl. Een kop blijft bij de tekst eronder.',
    },
    'lijst': {
      title: 'Lijsten',
      text: 'Opsomming maakt een lijst met cyaan zeshoekjes als opsommingsteken. Genummerde lijst nummert vanzelf, en telt door als de lijst op de volgende pagina verdergaat. Nog eens klikken haalt de lijst weg.',
    },
    'plakken': {
      title: 'Plakken uit Word',
      text: 'Plak gerust tekst uit Word, Google Docs of een mail. Koppen, lijsten, vet, cursief en onderstreept blijven over; lettertype, kleur en grootte komen uit de huisstijl, dus alles blijft netjes.',
    },

    // Prijzen
    'offerteregels': {
      title: 'Offerteregels',
      text: 'Eén regel per onderdeel: omschrijving, aantal en prijs per stuk, zonder btw. Typ bedragen zoals je gewend bent: 1.250,50 of 1250,50. Totalen en btw rekent de tool uit; lege regels komen niet in de offerte.',
    },
    'plakken-uit-excel': {
      title: 'Plakken uit Excel',
      text: 'Kopieer rijen in Excel of Google Sheets en plak ze in een omschrijving. Drie kolommen worden omschrijving, aantal en prijs; twee kolommen omschrijving en prijs. Bedragen als € 1.250,50 worden goed gelezen.',
    },
    'btw': {
      title: 'Btw',
      text: 'Eén tarief voor de hele offerte: 21%, 9% of 0% / verlegd. Onder de tabel staan subtotaal, btw en totaal. Kies 0% / verlegd als er geen btw bij komt, bijvoorbeeld omdat die naar de klant is verlegd.',
    },
    'voor-akkoord': {
      title: 'Voor akkoord',
      text: 'Een blok onderaan met lege regels voor naam, datum en handtekening van de klant. Zo kan de klant de offerte tekenen en terugsturen. Loopt je offerte net over naar een extra pagina, zet het dan uit.',
    },

    // Afsluiting
    'ondertekening': {
      title: 'Ondertekening',
      text: 'Zet slotgroet, naam, functie en eventueel je handtekening onder het document. Achter je functie komt vanzelf de bedrijfsnaam uit Briefpapier, zoals “Accountmanager · Pure Minds Marketing Group”.',
    },
    'handtekening': {
      title: 'Handtekening',
      text: 'Een scan of foto van je handtekening. Een PNG met transparante achtergrond werkt het mooist: dan staat hij zonder wit vlak op het papier. Hij blijft in deze browser bewaard voor je volgende documenten.',
    },

    // Briefpapier
    'briefpapier': {
      title: 'Briefpapier',
      text: 'Je bedrijfsgegevens voor de kop en de voet van elk document: adres, contact, KvK, btw-nummer en IBAN. Eén keer invullen is genoeg, ook voor een nieuw document. Het stipje bij Briefpapier verdwijnt zodra adres, KvK of e-mail er staat.',
    },

    // Kop van de tool
    'emerce-badge': {
      title: 'Emerce 100',
      text: 'Pure Minds staat in de Emerce 100 van 2026, de beste e-businessbedrijven. Aan: de badge staat klein en zwart rechts in de voet van elke pagina. Hij hoort bij het briefpapier, dus hij geldt voor al je documenten.',
    },
    'paginas': {
      title: "Pagina's",
      text: "Tekst loopt vanzelf door naar een volgende pagina. Alinea's splitsen op woorden, de offertetabel op regels, en een kop blijft bij de tekst eronder. Staan er op de laatste pagina maar een paar regels, dan zegt een melding wat helpt.",
    },

    // Download
    'download-pdf': {
      title: 'PDF',
      text: 'Om te versturen of te printen. Tekst, logo en vormen zijn vector: haarscherp op elk formaat, en de tekst is te selecteren en te doorzoeken. Je krijgt precies wat je in de preview ziet. De grote knop maakt deze PDF.',
    },
    'download-word': {
      title: 'Word',
      text: 'Om verder te bewerken in Word of Google Docs, in dezelfde huisstijl: kop, voet, koppen en tabellen zijn echte opmaak. Voor Google Docs: upload in Drive en kies Bestand → Opslaan als Google Documenten.',
    },
  },

  tour: [
    {
      id: 'welkom',
      title: 'Maak je eerste document',
      text: 'In een paar stappen zet je een brief, offerte, memo of notitie op het briefpapier van Pure Minds. Logo, lettertype en voet regelt de tool; jij schrijft de inhoud.',
    },
    {
      id: 'soort', section: 'soort', target: 'soort',
      title: 'Kies wat je maakt',
      text: 'Een brief krijgt adres en aanhef, een offerte prijsregels en een blok voor akkoord. Wisselen mag altijd: je tekst blijft staan.',
      doe: { event: 'click', hint: 'Kies brief, offerte, memo of notitie' },
    },
    {
      id: 'titel', section: 'gegevens', target: 'titel',
      title: 'Geef het een titel',
      text: "Typ het onderwerp. Het komt groot bovenaan, met de cyaan punt van Pure Minds erachter. Op de volgende pagina's staat het klein in de kop.",
      doe: { event: 'input', min: 3, hint: 'Typ je onderwerp' },
    },
    {
      id: 'tekst', section: 'tekst', target: 'tekst',
      title: 'Schrijf je tekst',
      text: 'Typ hier je tekst, of plak hem uit Word of Google Docs. Lettertype en maten komen vanzelf uit de huisstijl. Te lang voor één pagina? Hij loopt door naar de volgende.',
      doe: { event: 'input', min: 10, hint: 'Typ of plak een zin' },
    },
    {
      id: 'opmaak', section: 'tekst', target: 'werkbalk',
      title: 'Geef je tekst structuur',
      text: 'Dit is de werkbalk, zoals in Word. Zet je cursor in een alinea en kies kop bij stijl, of selecteer een paar woorden en klik op B voor vet. Maat en lettertype kiest de huisstijl.',
      doe: { signal: 'opmaak', hint: 'Kies een stijl of klik op B' },
    },
    {
      id: 'prijzen', section: 'prijzen', target: 'regels',
      title: 'Vul je prijzen in',
      text: 'Eén regel per onderdeel, met de prijs per stuk zonder btw; de totalen rekent de tool uit. Staan je prijzen in Excel? Plak de rijen in een omschrijving.',
      doe: { event: 'input', min: 1, hint: 'Pas een regel aan' },
    },
    {
      id: 'preview', target: 'preview',
      title: 'Klik in je document',
      text: 'Zo wordt je document geprint. Klik op een onderdeel, zoals de titel of het adres, en je springt naar het veld. Klik je in de tekst, dan staat je cursor precies daar.',
      doe: { event: 'click', hint: 'Klik op een onderdeel in de preview' },
    },
    // De bieb: opslaan om later aan te passen, en wat je kiest bij opnieuw opslaan
    {
      id: 'opslaan', target: 'opslaan',
      title: 'Sla je document op',
      text: 'Klik op opslaan: je document blijft 14 dagen in de bieb, ook voor je collega’s. Pas je het later aan? Sla dan opnieuw op en kies: vorige versie overschrijven of als nieuw opslaan.',
      doe: { event: 'click', hint: 'Klik op opslaan' },
    },
    {
      id: 'download', target: 'download',
      title: 'Download je document',
      text: 'Klik op download pdf om te versturen of te printen. Het pijltje ernaast geeft Word, om verder te bewerken (ook in Google Docs), en afdrukken. Staat er nog voorbeeldtekst in, dan zegt de tool waar.',
      doe: { signal: 'download', hint: 'Klik op download pdf' },
    },
    {
      id: 'klaar',
      title: 'Je document is klaar',
      text: 'Deze rondleiding en de sneltoetsen vind je altijd terug onder hulp rechtsboven. Tip: staat er een stipje bij Briefpapier? Vul daar één keer je adres, KvK en e-mail in, voor de voet van elk document.',
    },
  ],

  keys: [
    ['Ctrl + S', 'pdf downloaden'],
    ['Ctrl + P', 'afdrukken'],
    ['Ctrl + B', 'vet'],
    ['Ctrl + I', 'cursief'],
    ['Ctrl + U', 'onderstrepen'],
    ['Ctrl + V', 'plakken uit Word, Google Docs of Excel'],
    ['Enter', 'in de offerteregels: naar de regel eronder, of een nieuwe regel'],
    ['Ctrl + Z', 'ongedaan maken (in de tekst: je laatste typwerk)'],
    ['Ctrl + Shift + Z of Ctrl + Y', 'opnieuw'],
    ['Alt + F10', 'in de tekst: naar de werkbalk (Esc terug)'],
    ['?', 'sneltoetsen tonen'],
  ],
};
