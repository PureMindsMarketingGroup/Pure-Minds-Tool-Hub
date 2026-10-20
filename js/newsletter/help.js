/* =============================================================================
   newsletter/help.js — uitleg, rondleiding en sneltoetsen van de Nieuwsbrief Maker
   -----------------------------------------------------------------------------
   Alleen tekst, geen gedrag. Alles hangt onder window.PM_HELP.newsletter:

     sections  de knoppen in de zijbalk: id, label (één woord onder het icoon),
               title (kop van het paneel) en icon (Remix-icoon, -line-variant)
     help      de uitleg achter een [?]. De sleutel is gelijk aan
               data-help="<sleutel>" in tools/nieuwsbrief.html of in de velden
               die js/newsletter/app.js per blok maakt.
     tour      de rondleiding; target = data-tour="<target>", section opent
               eerst dat paneel. Signalen van de tool: 'blok' (een blok
               gekozen in de preview) en 'kopieer' (HTML gekopieerd of gedownload).
     keys      het venster met sneltoetsen. Ctrl is op een Mac de Cmd-toets.

   Aanpassen: verander de tekst tussen de aanhalingstekens en herlaad de tool.
   tests/newsletter.test.js controleert dat elke [?] en elk doel een tekst heeft.
   Schrijfwijze: je-vorm, korte zinnen, knoppen in kleine letters zoals in de
   tool, uitleg hoogstens 40 woorden, een stap hoogstens 35, een titel hoogstens 5.
   ============================================================================= */
(window.PM_HELP = window.PM_HELP || {}).newsletter = {

  sections: [
    { id: 'inhoud', label: 'Inhoud', title: 'Je mail, blok voor blok', icon: 'layout-row-line' },
    { id: 'blokken', label: 'Blokken', title: 'Blok toevoegen', icon: 'add-box-line' },
    { id: 'mail', label: 'Mail', title: 'Instellingen van je mail', icon: 'mail-settings-line' },
    { id: 'ai', label: 'AI', title: 'Maken met AI', icon: 'sparkling-line' },
  ],

  help: {
    // Inhoud
    'blokken': {
      title: 'Blokken',
      text: 'Je mail bestaat uit blokken onder elkaar. Klik op een blok om het te openen en aan te passen. Met de pijltjes zet je het hoger of lager; kopiëren en weggooien staan ernaast. Kop en voet staan vast.',
    },
    'opmaak': {
      title: 'Vet en voornaam',
      text: 'Zet **woorden** tussen twee sterretjes voor vet, of gebruik de werkbalk. {voornaam} wordt de voornaam van de lezer (Brevo vult hem in; zonder naam staat er “daar”). Een witregel begint een nieuwe alinea.',
    },
    'tekstlink': {
      title: 'Link in de tekst',
      text: 'Typ [de tekst](de link), bijvoorbeeld [onze cases](pureminds.nl/cases). In de mail staat dan alleen “onze cases”, met een cyaan streep eronder. Werkt in elk tekstvak.',
    },
    'kop': {
      title: 'Kop',
      text: 'Kort en concreet: wat heeft de lezer eraan? De cyaan punt van Pure Minds komt er vanzelf achter (niet na een vraagteken of uitroepteken).',
    },
    'hoofdknop': {
      title: 'Magenta knop',
      text: 'De hoofdactie van je mail, in magenta. Eén per mail: daarom staat hij alleen in de opening. Tekst in kleine letters met een werkwoord, zoals “plan een gesprek”. Laat je tekst of link leeg, dan verdwijnt de knop.',
    },
    'rustige-knop': {
      title: 'Rustige knop',
      text: 'Een tweede, rustige actie met een rand in Inkt, zoals “mail ons”. Magenta blijft voor de hoofdactie. Een link mag een website zijn, een e-mailadres of een telefoonnummer.',
    },
    'link': {
      title: 'Link',
      text: 'Plak de link van de pagina, bijvoorbeeld van je blog. www.pureminds.nl mag ook, net als een e-mailadres of telefoonnummer. Brevo zet er bij het versturen zelf de UTM-codes achter.',
    },
    'foto': {
      title: 'Foto',
      text: 'Kies een foto van je computer, sleep hem hierheen of plak hem (Ctrl + V). De tool verkleint hem en zet hem online, zodat hij in elke mail werkt. Uit de fotobank of een link naar een foto mag ook.',
    },
    'vorm': {
      title: 'Vorm van de foto',
      text: 'Zoals hij is: de hele foto. Liggend, breed of vierkant: de tool snijdt hem bij, vanuit het midden. Staande foto? Kies liggend, anders wordt je mail heel lang. Geldt voor foto’s die je hier uploadt.',
    },
    'alt': {
      title: 'Beschrijving',
      text: 'Wat staat er op de foto, in een paar woorden? Die tekst ziet de lezer als plaatjes uit staan (Outlook doet dat vaak), en een schermlezer leest hem voor.',
    },
    'fotolink': {
      title: 'Link achter de foto',
      text: 'Optioneel: wie op de foto klikt, gaat naar deze pagina. Laat hem leeg als de foto alleen sfeer is.',
    },
    'icoon': {
      title: 'Icoon',
      text: 'Zonder icoon staat er een klein cyaan zeshoekje. Kies je een icoon, dan komt het wit in een cyaan zeshoek, zoals in de huisstijl. Kies voor alle punten een icoon, of voor geen enkel.',
    },
    'resultaat': {
      title: 'Resultaat',
      text: 'Eén cijfer dat het verhaal vertelt, zoals +184% of 3x. Het label erboven zegt waarover het gaat (“Resultaat · Studio Noord”), de regel eronder wat het cijfer betekent.',
    },

    // Mail
    'naam': {
      title: 'Naam',
      text: 'Alleen voor jou: zo heet je mail in je bieb en als bestand. Het onderwerp van de mail vul je in Brevo in, bij de campagne.',
    },
    'onderwerp': {
      title: 'Onderwerp',
      text: 'De onderwerpregel staat niet in de HTML: je vult hem in Brevo in, bij Subject. Hier bewaar je hem bij je mail (de AI maakt er ook een), met kopieer om hem te plakken.',
    },
    'voorvertoning': {
      title: 'Voorvertoningstekst',
      text: 'De grijze regel die in de inbox naast of onder het onderwerp staat. Eén zin van zo’n 40 tot 90 tekens die nieuwsgierig maakt. In de mail zelf zie je hem niet.',
    },
    'uploaden': {
      title: 'Foto’s online',
      text: 'Een mail kan alleen plaatjes tonen die online staan. Je foto’s en iconen gaan daarom naar de opslag van Pure Minds bij Vercel. Het wachtwoord vul je één keer in; deze browser onthoudt het.',
    },
    'opnieuw': {
      title: 'Opnieuw beginnen',
      text: 'Nieuwsbrief: alle blokken, om weg te halen wat je niet nodig hebt. Korte mail: opening, tekst en afsluiter. Je huidige mail is niet weg: ongedaan maken staat in de melding, en je bieb bewaart wat je opsloeg.',
    },

    // Podium
    'preview': {
      title: 'Preview',
      text: 'Zo ziet je mail eruit. Klik op een blok om het aan te passen. Met telefoon zie je hoe de kolommen op een smal scherm onder elkaar vallen. Kop en voet staan vast, met de afmeldlink die Brevo verplicht.',
    },

    // Kopiëren
    'brevo': {
      title: 'In Brevo plakken',
      text: 'Brevo → Campaigns → Create campaign → Email. Bij Design: Start from scratch → **HTML custom code**, plakken en Save & quit. Stap voor stap: de handleiding onder dit menu.',
    },
    'download-html': {
      title: 'Download .html',
      text: 'Hetzelfde als kopiëren, maar als bestand: om te bewaren, te mailen naar een collega of later in Brevo te importeren. Dubbelklik erop om hem in je browser te bekijken.',
    },
  },

  tour: [
    {
      id: 'welkom',
      title: 'Maak je eerste nieuwsbrief',
      text: 'In een paar stappen maak je een mail in de huisstijl van Pure Minds, klaar voor Brevo. Je past alleen tekst, foto’s en links aan; opmaak, kop en voet regelt de tool.',
    },
    {
      id: 'preview', target: 'preview',
      title: 'Klik op een blok',
      text: 'Dit is je mail, in blokken onder elkaar. Klik op een blok, zoals de donkere opening bovenaan, en het opent links om aan te passen.',
      doe: { signal: 'blok', hint: 'Klik op een blok in je mail' },
    },
    {
      id: 'velden', section: 'inhoud', target: 'velden',
      title: 'Pas de tekst aan',
      text: 'Typ je eigen tekst: je ziet hem meteen in de mail. **Vet** en {voornaam} kunnen ook. Een foto vervangen? Klik op foto kiezen bij een fotoblok.',
      doe: { event: 'input', min: 3, hint: 'Typ een paar woorden' },
    },
    {
      id: 'toevoegen', section: 'blokken', target: 'toevoegen',
      title: 'Voeg een blok toe',
      text: 'Nog een tekst, een foto of drie punten met iconen? Kies een blok: het komt onder het blok dat je open had. Weggooien en verschuiven doe je bij Inhoud.',
      doe: { event: 'click', hint: 'Kies een blok' },
    },
    {
      id: 'opslaan', target: 'opslaan',
      title: 'Sla je mail op',
      text: 'Klik op opslaan: je mail blijft 14 dagen in je bieb. Pas je hem later aan? Sla dan opnieuw op en kies: vorige versie overschrijven of als nieuw opslaan.',
      doe: { event: 'click', hint: 'Klik op opslaan' },
    },
    {
      id: 'kopieer', target: 'kopieer',
      title: 'Kopieer en plak in Brevo',
      text: 'Klik op kopieer html. In Brevo maak je een campagne en kies je bij Design: Start from scratch → HTML custom code, en plakken. Foto’s en iconen staan al online.',
      doe: { signal: 'kopieer', hint: 'Klik op kopieer html' },
    },
    {
      id: 'klaar',
      title: 'Je mail is klaar',
      text: 'Onderwerp en ontvangers kies je in Brevo, bij de campagne. De handleiding voor Brevo, deze rondleiding en de sneltoetsen vind je altijd onder hulp rechtsboven.',
    },
  ],

  keys: [
    ['Ctrl + S', 'HTML kopiëren voor Brevo'],
    ['Ctrl + B', 'vet (in een tekstvak)'],
    ['Ctrl + V', 'foto plakken in het open fotoblok'],
    ['Ctrl + Z', 'ongedaan maken (in een tekstvak: je laatste typwerk)'],
    ['Ctrl + Shift + Z of Ctrl + Y', 'opnieuw'],
    ['Alt + F10', 'in een tekstvak: naar de werkbalk (Esc terug)'],
    ['?', 'sneltoetsen tonen'],
  ],
};
