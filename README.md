# Pure Minds Generator Hub

Interne tools van Pure Minds op één plek: social posts, documenten op
briefpapier, presentaties en iconen, allemaal in de huisstijl en direct te
downloaden.
Daarnaast vier technische tools voor websites, ads en SEO; zie
[Techniek & analyse](#techniek--analyse).
Plain HTML, CSS en JavaScript: geen framework, geen buildstap.

**Live:** https://puremindsmarketinggroup.github.io/Pure-Minds-Tool-Hub/ (alleen voor het team: je logt in
met je eigen account, zie [Inloggen](#inloggen)). Alles wat je maakt, gaat vanzelf de [bieb van het
team](#de-bieb) in, zoals in Canva of Google Docs: een collega kan het openen en verder aanpassen.

> **Verhuisd (oktober 2026)** van `github.com/Jelger1/Pure-Minds-Tool-Hub` naar
> `github.com/PureMindsMarketingGroup/Pure-Minds-Tool-Hub`, het account van
> Pure Minds zelf. Alles draait vanaf hier, ook de
> [e-mailhandtekeningen](#e-mailhandtekeningen): die laden hun foto's en
> iconen van dit adres. **Hernoem dit account of deze repo dus niet, en zet de
> repo niet op privé**: dan verdwijnen de plaatjes uit alle handtekeningen.
> Het oude adres (`jelger1.github.io/Pure-Minds-Tool-Hub`) stuurt door naar
> hier en bewaart alleen nog de plaatjes voor e-mails die vóór de verhuizing
> zijn verstuurd.

| Tool | Wat | Export |
|---|---|---|
| [Insta Post Maker](tools/insta.html) | Instagram- en LinkedIn-posts in vijf templates | PNG, JPG, PDF om verder te bewerken in Canva (elke post; een carousel als één PDF met een pagina per slide) |
| [Document Maker](tools/document.html) | Brief, offerte, memo of notitie op A4-briefpapier | bewerkbare PDF, Word (.docx, ook voor Google Docs), afdrukken |
| [Presentation Maker](tools/presentation.html) | 16:9-slides in zeven layouts, waaronder een tabel, plus voorstellen en positioneringen in de vaste opbouw van Pure Minds | bewerkbare PDF, PowerPoint (.pptx, ook voor Google Slides), PNG (Full HD of 4K) |
| [Icon Finder](tools/icons.html) | 1.690 lijniconen, te zoeken in het Nederlands of Engels; los of in de zeshoek, in de merkkleuren | SVG, PNG (128 tot 2048 px), kopiëren om te plakken |
| [Nieuwsbrief Maker](tools/nieuwsbrief.html) | Nieuwsbrieven en mails in de huisstijl, blok voor blok; foto's en iconen gaan vanzelf online. Met een [handleiding voor Brevo](tools/brevo-handleiding.html) | HTML om in Brevo te plakken (kopiëren of .html) |
| [Brand Styleguide](tools/styleguide.html) | Het brandbook digitaal: kleurwaarden kopiëren, logo's downloaden, contrast checken, zoeken in alle richtlijnen | bewerkbare PDF met lagen (Canva, Illustrator), logo-pakket (SVG en PNG), kleuren als ASE en JSON |

Alle PDF's hebben **echte tekst** in ingesloten Pure Minds Sans, met per gewicht een
eigen fontnaam (te selecteren en aan te passen in Canva, Acrobat of
Illustrator), en vormen en het logo als vector. Foto's en een geüploade
handtekening zijn afbeeldingen; in posts en slides ook elk verloop (één
transparante PNG). De PDF's van posts en slides importeert Canva laag voor
laag, zie [Bewerkbare PDF's](#bewerkbare-pdfs).

Word- en PowerPoint-bestanden zijn **echt bewerkbaar** in dezelfde huisstijl:
het briefpapier als Word-opmaak (kop, voet, koppen, zeshoek-bullets, tabellen),
de slides als tekstvakken, vormen en foto's op een Pure Minds-master. Zie
[Word, PowerPoint en Google](#word-powerpoint-en-google).

## Starten

```bash
npm start            # http://localhost:3000
npm test             # unittests (node --test, zonder dependencies)
```

GitHub Pages serveert de map zoals hij is. Een tool direct vanaf schijf
openen werkt ook: de logo's en lettertypen die in exports komen, staan dan als
ingebedde kopie in `js/shared/brand-data.js` en `js/shared/pdf-fonts.js`,
zodat de browser de export niet blokkeert.

## Structuur

```
index.html                    de hub: maken (een kaart per tool) en checken (de technische tools),
                              en de uitleg bij de Consent Check (<dialog>)
login.html                    inloggen, account maken, wachtwoord vergeten (js/login.js, css/login.css)
bieb.html                     alle ontwerpen van het team: zoeken, kopie, versies, prullenbak (js/bieb.js, css/bieb.css)
supabase/teambieb.sql         de database van Supabase: teamlijst, ontwerpen, versies, reservekopie, beveiliging
email/                        de e-mailtemplate voor Brevo, met plaatjes in email/img/
uploads/                      de server van de hub (Vercel, Root Directory uploads): foto's
                              online zetten (Vercel Blob) en de AI (Claude); zie uploads/README.md
handtekeningen/                de e-mailhandtekeningen: index.html (kies je naam) en
                              een pagina per collega; plaatjes in assets/handtekeningen/
tools/
  insta.html                  Insta Post Maker
  document.html               Document Maker
  presentation.html           Presentation Maker
  icons.html                  Icon Finder
  styleguide.html             Brand Styleguide
  nieuwsbrief.html            Nieuwsbrief Maker
  brevo-handleiding.html      handleiding: van de Nieuwsbrief Maker naar Brevo, stap voor stap
css/
  global.css                  gedeeld designsysteem (kleuren, Pure Minds Sans, kaarten,
                              knoppen, velden, kop met toolwisselaar)
  editor.css                  editor-bouwstenen: appbalk, rail, paneel, podium,
                              werkbalk, [?]-uitleg, rondleiding, sneltoetsen
  hub.css                     dashboard
  login.css                   de inlogpagina
  insta.css                   Insta Post Maker
  document.css                Document Maker + het A4-briefpapier
  presentation.css            Presentation Maker
  icons.css                   Icon Finder
  styleguide.css              Brand Styleguide
  newsletter.css              Nieuwsbrief Maker
  handleiding.css             handleidingen (leespagina)
js/
  login.js                    de inlogpagina: inloggen, account maken, wachtwoord vergeten en kiezen
  bieb.js                     alle ontwerpen (bieb.html)
  shared/account.js           inloggen (Supabase) en de deur van elke pagina; in de <head> (PM.account)
  shared/tools.js             register van alle tools (hub + toolwisselaar)
  shared/core.js              gedeelde hulpfuncties (window.PM)
  shared/brand.js             huisstijl als gegevens, plus controles (PM.brand)
  shared/history.js           ongedaan maken en opnieuw (PM.history)
  shared/designs.js           de ontwerpen van het team in Supabase: lijst, openen, opslaan, kopie, versies (PM.designs)
  shared/library.js           de bieb in een maker: vanzelf opslaan, opslagstatus, botsingen, versies (PM.library)
  shared/service.js           de server van de hub: adres en verzoeken, met het inlogbewijs (PM.service)
  shared/ai.js                het paneel AI in de makers, vanzelf opslaan na de AI (PM.ai)
  shared/photos.js            passende foto's uit een fotobank (Unsplash) zoeken en plaatsen (PM.photos)
  shared/shell.js             indeling zoals Canva: rail, één paneel, podium (PM.shell)
  shared/help.js              [?]-uitleg naast instellingen (PM.help)
  shared/toolbar.js           tekstwerkbalk zoals Word (PM.toolbar)
  shared/tour.js              rondleiding: leren door te doen (PM.tour)
  shared/richfield.js         tekstvelden met nadruk en invulplekken zoals ze zijn (PM.richfield)
  shared/canvas-kit.js        tekenbouwstenen voor posts en slides (window.PMCanvas)
  shared/pdf-canvas.js        canvas dat in een PDF tekent: posts en slides als losse lagen (Canva)
  shared/pptx-writer.js       schrijft een .pptx (Office Open XML) zonder bibliotheek
  shared/brand-data.js        ingebedde logo's (gegenereerd: npm run brand)
  shared/pdf-fonts.js         Pure Minds Sans voor PDF en Word (gegenereerd, pas geladen bij export)
  hub.js                      dashboard: per tool een kaart met concept, formaten of zoekveld en
                              rondleiding, de technische tools ernaast, en de uitleg bij lokale tools
  insta/templates.js, app.js
  insta/export.js             wat een download oplevert (PNG, JPG, zip of PDF), de zin en de uitleg erbij
  insta/pdf.js                de PDF van een post of carousel (PMInstaPdf.build)
  insta/help.js               [?]-uitleg, rondleiding en sneltoetsen (PM_HELP.insta)
  newsletter/email.js         de HTML van een mail uit blokken (PMEmail, ook in Node getest)
  newsletter/app.js           Nieuwsbrief Maker: blokken, preview, uploaden, iconen, kopiëren
  newsletter/help.js          [?]-uitleg, rondleiding en sneltoetsen (PM_HELP.newsletter)
  document/app.js             editor, blokken en paginering
  document/model.js           bedragen, totalen en de controle op voorbeeldtekst (zonder DOM)
  document/help.js            [?]-uitleg, rondleiding en sneltoetsen (PM_HELP.document)
  document/pdf.js             A4-pagina's uit de preview als vector-PDF
  document/docx.js            het document als Word-bestand
  presentation/templates.js   zeven layouts, plus vier voor het voorstel en de positionering en twee alleen
                              voor de positionering: plan (maten, regelval), tekenen, regio's
  presentation/deck.js        voorbeeldslides, velden per layout en de controle op voorbeeldtekst (zonder DOM)
  presentation/generator.js   wat het voorstel en de positionering delen: slides uit het formulier bijwerken
                              zonder je eigen aanpassingen te raken, parkeren, checklist (zonder DOM)
  presentation/voorstel.js    het voorstel (na het eerste gesprek): vaste opbouw en teksten, prijzen
  presentation/positionering.js de positionering (na het traject): vaste opbouw en teksten, canvassen,
                              toelichting per blok
  presentation/help.js        [?]-uitleg, rondleiding en sneltoetsen (PM_HELP.presentation), plus de
                              rondleidingen van het voorstel en de positionering (PM_HELP.voorstel,
                              PM_HELP.positionering)
  presentation/pptx.js        de slides als PowerPoint-bestand
  presentation/app.js         editor, strook met slides, foto's en export
  icons/icon-data.js          alle iconen als pad (gegenereerd: npm run icons)
  icons/icon-tags.js          Nederlandse en Engelse zoekwoorden per icoon (gegenereerd)
  icons/hex.js                de zeshoek om een icoon, gelijk aan maak-zeshoeken.py
  icons/search.js             zoeken met rangschikking, meervouden en typfouten
  icons/app.js                Icon Finder
  styleguide/brand-tokens.js  de huisstijl als gegevens: kleuren met rol, typeschaal, logo-regels, A4-raster
  styleguide/content.js       alle teksten van het brandbook, de hoofdstukken en de pagina's
  styleguide/svg-path.js      logo, badge en iconen als canvas-paden (alleen M, L, C en Z)
  styleguide/model.js         contrast, zoeken, kleurbestanden (ASE, JSON) en PDF-delen (zonder DOM)
  styleguide/pages.js         de brandbook-pagina's als tekenfuncties (podium én PDF)
  styleguide/export.js        PDF met lagen (pdf-lib), logo-pakket, kleurbestanden, badge
  styleguide/help.js          [?]-uitleg, rondleiding en sneltoetsen (PM_HELP.styleguide)
  styleguide/app.js           podium, hoofdstukken, panelen, zoeken en export
assets/fonts/                 Pure Minds Sans (het huislettertype), alle sneden
assets/brand/                 logo's, favicon, brandbook
  emerce/                     Emerce 100-badge 2026, strak uitgesneden (posts, documenten, slides)
assets/icons/                 Remix-iconen per categorie, lijnstijl (bron voor de Icon Finder), met LICENSE
  maak-zeshoeken.py           maakt Zeshoek/ (vier kleurvarianten) en overzicht.html
  uitsnijpaden.json           paden zonder overlap voor de doorzichtige uitsnede
  Zeshoek/                    alle iconen in de zeshoek, één map per kleurvariant
  Los/                        alle iconen zonder zeshoek, één map per huiskleur (cyaan, inkt, magenta, blauw, wit)
scripts/build-brand-data.js   maakt brand-data.js en pdf-fonts.js
scripts/setup-supabase.mjs    zet Supabase klaar: database, inloggen, mails (npm run supabase)
scripts/build-icon-data.js    maakt js/icons/icon-data.js uit assets/icons/
scripts/build-icon-tags.js    maakt js/icons/icon-tags.js uit scripts/icon-words/
scripts/icon-words/           nl.json (Nederlands woordenboek), remix-tags.json
server/server.js              kleine statische server (npm start, Render)
tests/                        unittests van de editor-bouwstenen, de Insta Post Maker, de Document Maker,
                              de Presentation Maker, het voorstel, de positionering, de PowerPoint-schrijver,
                              de Brand Styleguide en de PDF-export (npm test)
```

## Een tool toevoegen

1. Maak `tools/<naam>.html`. Kopieer de `<head>`, de cyaan balk en de
   `<header>` van een bestaande tool, en zet `data-toolnav="<naam>"` op de
   `<nav>`. Laad `../css/global.css` en je eigen `../css/<naam>.css`.
2. Laad onderaan `../js/shared/tools.js` en `../js/shared/core.js`; voor
   canvas-output ook `../js/shared/canvas-kit.js`.
3. Zet de tool in `js/shared/tools.js`. De hub en de toolwisselaar in elke
   kop pakken hem dan vanzelf op. Met `status: 'binnenkort'` staat hij als
   niet-klikbare kaart in de hub.
4. Optioneel: `starts` geeft formaten op de kaart (de tool leest de
   meegegeven instellingen met `PM.startParams()`), `search` in plaats daarvan
   een zoekveld, en `draft` laat het concept van de tool zien onder *verder
   waar je was*. Heeft de tool een rondleiding (`js/<id>/help.js`), zet dan
   `tour: 'je eerste …'`.
   - De kaart toont dan de link *hoe werkt het? (2 min)*. Die opent
     `tools/<id>.html#rondleiding`, en de rondleiding start direct.
   - De link verdwijnt als de rondleiding gedaan is.
5. Draait de tool buiten de hub (een web-app elders, of een download)? Geef
   hem dan `kind: 'web'` of `kind: 'lokaal'`, `href` naar de app of de
   download, en `group: 'techniek'`. Hij staat dan alleen op het dashboard,
   niet in de toolwisselaar van de andere tools. Een lokale tool krijgt met
   `guide` de id van een `<dialog class="guide">` in `index.html` met de
   uitleg; tabjes, kopiëren en de downloadknop regelt `js/hub.js`. Een nieuw
   blok is een regel in `PM_GROUPS` (`tone: 'dark'` geeft het donkere vlak).

## Gedeelde huisstijl

Alle kleuren komen uit het brandbook (`assets/brand/PureMinds-Brandbook-v1.svg`):
Pure Cyaan `#1AB9E2` voor accenten, Pure Magenta `#B61B50` alleen voor de
hoofdactie, Inkt `#303030` voor tekst en donkere vlakken. Typografie is
Pure Minds Sans (lokaal in `assets/fonts/`; de vormen van Open Sans onder de
naam van Pure Minds, zodat Illustrator, Canva en Word het herkennen). Knoppen hebben rechte hoeken en
kleine letters; koppen krijgen de cyaan punt uit "Pure Minds.".

Posts en slides delen `js/shared/canvas-kit.js`, en dus hetzelfde:
zeshoek (puntig, zoals het logo), zeshoekpatroon, label met zeshoek-bullet,
`**nadruk**` in cyaan en het witte logo rechtsonder. De voetregel
`pureminds.nl` linksonder staat alleen op slides, niet op posts.

**Emerce 100-badge.** Pure Minds staat in de Emerce 100 van 2026 (beste
e-businessbedrijven, gepubliceerd 21 april 2026). Op posts, documenten en
slides kan de badge erbij, als klein keurmerk:

- **Aanzetten:** met het knopje *Emerce 100* (met het merkje erin) in de kop
  van de preview, direct naast wat het verandert. Het staat standaard uit en
  blijft aan tot je het weer uitzet. Na aanzetten zegt een melding waar de
  badge staat.
- **Bestanden:** de originelen van Emerce (`Badge-E100-2026-*.svg`, een
  A4-vel met de badge in het midden) staan niet in de repo. De tools gebruiken
  strak uitgesneden kopieën zonder `<style>` uit `assets/brand/emerce/`:

  | Bestand | Vorm | Kleur |
  |---|---|---|
  | `e100-2026-liggend-wit.svg` | liggend | wit, voor donkere posts en slides |
  | `e100-2026-liggend-zwart.svg` | liggend | zwart, voor het briefpapier |
  | `e100-2026-staand-*.svg` | staand | voor gebruik buiten de tools |

  De liggende versies zitten ook in `brand-data.js`, voor export vanaf schijf.

## Gedeelde interactie

De makers (posts, documenten, presentaties) voelen hetzelfde aan, omdat ze
dezelfde bouwstenen gebruiken; hoe je ze inbouwt staat onder
[Editor-bouwstenen](#editor-bouwstenen).

- **Indeling** (`PM.shell`): een rail met grote knoppen, één paneel tegelijk
  en het ontwerp op het podium; op mobiel een tabbalk onderin en het paneel
  als blad. Klik in het ontwerp en je staat in het goede veld. Hoort een
  onderdeel niet bij je keuze, dan staat het uit met de reden erbij.
- **Tekst** (`PM.richfield`, `PM.toolbar`): nadruk en invulplekken staan in
  het veld zoals ze bedoeld zijn, niet als `**...**` of `{klant}`. De
  werkbalk boven het ontwerp (op mobiel bovenin het blad) toont alleen wat bij
  dat veld mag: cyaan of vet, invulplekken, de grootte uit de typeschaal, en in
  een document koppen en lijsten. Hij verdwijnt pas als je tik of klik is
  aangekomen, zodat er niets onder je vinger wegschuift.
- **Ongedaan maken** (`PM.history`): de knoppen in de appbalk en `Ctrl` + `Z`
  gelden voor het hele ontwerp; in een tekstveld maakt `Ctrl` + `Z` je typen
  ongedaan. Verwijderen en opnieuw beginnen gebeurt direct, met *ongedaan
  maken* in de melding (`PM.toast` met `{ label, run }`) in plaats van een
  "weet je het zeker?"-vraag.
- **Uitleg** (`PM.help`, `PM.tour`): kleine [?]-knoppen naast instellingen die
  uitleg nodig hebben, en bij het eerste bezoek een korte rondleiding waarin
  je het meteen zelf doet. Beide staan ook onder *hulp* in de appbalk, met de
  sneltoetsen.
- **Downloaden** (`PM.run`): één magenta knop rechtsboven. De knop zelf toont
  wat er gebeurt ("slide 3 van 8…"), daarna kort "✓ gedownload"; dubbelklikken
  kan niet. Het pijltje ernaast: waarvoor, welk bestand, en wat je precies
  krijgt.
- **Per apparaat:** tips over slepen en sneltoetsen hebben de klasse
  `for-mouse`, de tik-variant `for-touch`; op een touchscreen verschijnt
  alleen wat daar werkt. Knoppen zijn op een touchscreen minstens 44 px, en
  vanaf 320 px breed past alles zonder zijwaarts te scrollen.

`PM.textTools` (losse knoppen *cyaan* en *vet*) en `PM.miniPreview` (zwevende
preview) staan nog in `core.js`, maar de makers gebruiken ze niet meer: de
werkbalk en het altijd zichtbare ontwerp nemen hun rol over.

## Editor-bouwstenen

De makers (posts, documenten, presentaties) werken als Canva: links een rail
met grote knoppen, daarnaast één paneel tegelijk, en de rest van het scherm is
het ontwerp. Boven het ontwerp staat een tekstwerkbalk zoals in Word. Alles
is gewone HTML met `css/editor.css`; de scripts voegen het gedrag toe.

**Laden**, na `core.js` (dat `window.PM` aanmaakt):

```html
<script src="../js/shared/brand.js"></script>
<script src="../js/shared/history.js"></script>
<script src="../js/shared/shell.js"></script>
<script src="../js/shared/help.js"></script>
<script src="../js/shared/richfield.js"></script>
<script src="../js/shared/toolbar.js"></script>
<script src="../js/shared/tour.js"></script>
<script src="../js/<tool>/help.js"></script>   <!-- teksten: PM_HELP.<tool> -->
```

**Markup**

```html
<div class="app" data-app="insta">
  <header class="appbar">
    <div class="appbar__left">
      <input class="appbar__name" aria-label="Naam van je ontwerp">
      <span class="appbar__sep appbar__sep--name"></span>
      <button class="appbar__btn" id="undoBtn" aria-label="Ongedaan maken">svg</button>
      <button class="appbar__btn" id="redoBtn" aria-label="Opnieuw">svg</button>
    </div>
    <div class="appbar__right">
      <div class="menu">
        <button class="appbar__btn" data-help-menu aria-haspopup="menu" aria-controls="helpMenu">svg<span class="appbar__txt">hulp</span></button>
        <div class="menu__list" id="helpMenu" role="menu">
          <button class="menu__item" role="menuitem" data-action="tour">svg<span data-label>rondleiding starten</span></button>
          <button class="menu__item" role="menuitem" data-action="sneltoetsen">svg sneltoetsen</button>
        </div>
      </div>
      <div class="split" data-tour="download">
        <button class="btn btn-primary" id="downloadBtn">svg<span data-label>download</span></button>
        <button class="btn btn-primary split__more" aria-haspopup="dialog" aria-controls="dlPop" aria-label="Downloadopties">svg</button>
        <div class="popover" id="dlPop" role="dialog" aria-labelledby="…">exportinstellingen</div>
      </div>
    </div>
  </header>
  <nav class="rail" aria-label="Onderdelen">
    <button class="rail__item" data-section="tekst">svg<span>Tekst</span></button>
  </nav>
  <div class="panels">
    <section class="panel" data-section="tekst">
      <header class="panel__head"><h2 class="panel__title">Tekst<span class="dot">.</span></h2></header>
      <div class="panel__body">velden</div>
    </section>
  </div>
  <main class="stage">
    <div class="stage__head"><div class="stage__group">pills</div><div class="stage__group">Emerce 100</div></div>
    <div class="stage__tools"><div id="tbar"></div></div>
    <div class="stage__canvas"><div class="stage__fit"><canvas style="--ar: .8"></canvas></div></div>
    <div class="stage__foot">slidestrook (optioneel)</div>
  </main>
</div>
```

- Iconen staan als inline SVG in de HTML: het pad uit
  `assets/icons/<categorie>/<naam>.svg`, met `class="ri"` in een knop.
- Zonder `.panel__head` maakt de shell een kop uit `PM_HELP.<tool>.sections`;
  de sluitknop komt er vanzelf in.
- `--ar` (breedte / hoogte) op het canvas: het ontwerp past altijd in het
  podium (`.stage__fit` is een size container). Pagina's die scrollen (A4)
  staan in `.stage__scroll`.
- Onder de 1024 px staat het ontwerp bovenaan, is de rail een tabbalk onderin
  en is het paneel een blad (hoogstens 60% van het scherm). Dezelfde HTML.

**PM.shell** (`js/shared/shell.js`)

```js
const shell = PM.shell(document.querySelector('.app'), { tool: 'insta', open: 'tekst', quickStart: false });
shell.open('tekst', { focus: true });   // focus: true = de kop, of een selector of element
shell.close(); shell.toggle('tekst'); shell.current;
shell.reveal('tekst', '#kop');          // paneel open, veld in beeld, focus en kort oplichten
shell.setRegions(canvas, [{ key: 'kop', rect: { x, y, w, h }, label: 'kop', section: 'tekst', field: '#kop' }]);
shell.disable('foto', 'Een carousel heeft geen foto.'); shell.enable('foto');
shell.onChange(({ id, open, narrow }) => {});
shell.onAction('nieuw', () => {});
```

- De rail is een tablist: pijltjes verplaatsen, Enter of spatie opent; het
  actieve item nog eens klikken klapt het paneel in. Het laatste paneel staat
  per tool in `pm-shell-<tool>-v1`.
- Op mobiel sluit het blad met ×, Esc, tikken ernaast of dezelfde tab.
- Hoort een onderdeel niet bij de keuze (geen foto in een carousel), dan zet
  `disable()` de rail-knop uit mét de reden: grijs, de reden als tooltip,
  een melding bij klikken, en voor schermlezers in `aria-describedby`. Niet
  stil verbergen: dan zoekt iemand zich suf.
- Regio's zijn de klikbare delen van het ontwerp, in canvas-px: bij het
  aanwijzen een cyaan kader met naam, klikken springt naar het veld. De
  kleinste regio onder de muis wint; slepen (een foto verschuiven) telt niet
  als klik.
- `data-action="tour"` en `data-action="sneltoetsen"` in het menu zijn
  ingebouwd; de toets `?` opent de sneltoetsen uit `PM_HELP.<tool>.keys`.
  De shell start ook `PM.help` en de rondleiding.
- Voor de andere bouwstenen: `PM.place` (zwevend element naast een ander, klapt
  om aan de rand), `PM.announce` (tekst voor schermlezers) en `PM.rovingIndex`.

**PM.history** (`js/shared/history.js`)

```js
const history = PM.history({ snapshot: () => state, restore: (s) => { state = s; syncInputs(); render(); }, limit: 100 });
history.bind({ undo: undoBtn, redo: redoBtn });
history.commit('kop');   // na elke wijziging; dezelfde sleutel binnen 700 ms = één stap
```

`Ctrl` + `Z`, `Ctrl` + `Shift` + `Z` en `Ctrl` + `Y` (op een Mac `⌘`), maar niet
in een tekstveld: daar maakt de browser het typen zelf ongedaan. Verder
`undo()`, `redo()`, `canUndo`, `canRedo`, `seal()`, `clear()` en `onChange(cb)`.

**PM.help** (`js/shared/help.js`): `<button type="button" class="help" data-help="formaat"></button>`
naast een label geeft een kleine zeshoek met een `?`. Klikken of tikken opent
de uitleg uit `PM_HELP.<tool>.help.formaat`, met een muis ook na een korte
pauze; Esc of ernaast klikken sluit. Met `data-help-mode="inline"` staat de
uitleg onder het veld in plaats van in een ballon.

**PM.richfield** (`js/shared/richfield.js`): een `<textarea>` of `<input>` met
`data-rich="nadruk"` (of `"vet"`, zoals de tekst van een carousel) toont
`**nadruk**` als cyaan markeerstift (of vet) en `{klant}` uit
`data-chips="{klant} {diensten}"` als een vast blokje. Het veld zelf blijft de
bron: het richfield schrijft precies dezelfde markup terug en stuurt een
`input`-event, dus bestaande code, concepten en exports merken niets.

- `veld.value` lezen en zetten werkt zoals altijd (zetten tekent de editor
  opnieuw), `veld.focus()` zet de focus in de editor.
- Plakken wordt platte tekst; Enter alleen in een `<textarea>`; `maxlength`
  telt de markup, net als het oude veld; typen met IME wordt niet onderbroken.
- Ongedaan maken binnen het veld (`Ctrl` + `Z`, typen is één stap) regelt het
  veld zelf: de browser kan dat niet meer zodra een chip of nadruk opnieuw
  getekend is. `Ctrl` + `Z` buiten een veld is de hele post (`PM.history`).
- `role="textbox"`, `aria-multiline` en het label van het veld; lukt het niet
  (oude browser), dan blijft het gewone tekstveld staan.
- `PM.richfield.init(form)` verbetert alle `[data-rich]`; de werkbalk ziet het
  richfield vanzelf en past nadruk en invulplekken toe op de markup.

**PM.toolbar** (`js/shared/toolbar.js`): `PM.toolbar(document.getElementById('tbar'))`.
Een veld doet mee met `data-toolbar="…"`; alleen die knoppen verschijnen.

| Opdracht | Waar | Wat |
|---|---|---|
| `nadruk` | tekstveld | `**woord**` in cyaan (`Ctrl` + `B`) |
| `vet` | beide | tekstveld: `**woord**`; contenteditable: vet |
| `cursief`, `onderstreept`, `opsomming`, `nummering`, `wissen` | contenteditable | zoals in Word |
| `stijl` | contenteditable | alinea, kop, tussenkop, citaat (`data-toolbar-blocks`) |
| `invoegen` | tekstveld | invulplekken: `data-toolbar-insert="{klant} {diensten}"` |
| `grootte` | beide | klein, normaal, groot (`PM.brand.SIZES`) |
| `uitlijnen` | beide | alleen wat de tool toestaat: `data-toolbar-align="links midden"` |

Grootte en uitlijning horen bij de tool: de werkbalk zet `data-size` of
`data-align` op het veld en stuurt een `pm:format`-event `{ cmd, value }`.
`Alt` + `F10` gaat naar de werkbalk, Esc terug naar het veld. Op mobiel staat
de werkbalk bovenin het blad, zodat het ontwerp groot blijft. Na elke opdracht
geeft de werkbalk `PM.tour.signal('<opdracht>')` (en `'opmaak'`), dus een
doe-stap "maak een woord cyaan" werkt zonder extra code.

**PM.tour** (`js/shared/tour.js`): de rondleiding uit `PM_HELP.<tool>.tour`.
Een stap met `target` licht `[data-tour="<target>"]` uit (en opent eerst
`section`); zonder target is het een kaart in het midden. Een doe-stap
(`doe: { event: 'input', min: 3, hint: 'Typ je kop' }`, of `signal`) gaat
vanzelf verder als je het gedaan hebt; voor iets anders dan een DOM-event
roept de tool `PM.tour.signal('<naam>')` aan. Bij het eerste bezoek start hij
na een seconde; via een snelle start van het dashboard (`quickStart: true`)
alleen een melding met een knop. Esc of × stopt; het hulpmenu biedt daarna
"rondleiding verder (stap 3 van 6)". De stand staat in `pm-tour-<tool>-v1`.
Een tool met meer soorten kan per soort een eigen rondleiding onder een eigen
naam hebben, met een eigen stand (de optie `tourTool` van `PM.shell` kiest
welke): de Presentation Maker heeft `voorstel` en `positionering`.

**PM.brand** (`js/shared/brand.js`): kleuren, typeschaal, raster, formaten en
exportmaten als gegevens, gelijk aan `global.css`, `canvas-kit.js` en de
templates (de tests controleren dat). Controles met een zin voor de gebruiker:
`photoCheck(fotoB, fotoH, vakB, vakH, exportschaal, { zoom })` (let op vanaf
1,25× vergroten, te klein vanaf 2×), `textFit({ size, base, overflow, name })`
en `safeZone('story')`.

**Het contract** (`js/<tool>/help.js`):

```js
(window.PM_HELP = window.PM_HELP || {}).insta = {
  sections: [{ id: 'template', label: 'Template', title: 'Kies je template', icon: 'layout-masonry-line' }],
  help: { formaat: { title: 'Formaat', text: 'Korte uitleg; **vet** mag.' } },
  tour: [
    { id: 'welkom', title: '…', text: '…' },
    { id: 'kop', section: 'tekst', target: 'kop', title: '…', text: '…', doe: { event: 'input', min: 3, hint: 'Typ je kop' } },
  ],
  keys: [['Ctrl + Z', 'ongedaan maken'], ['Ctrl + Shift + Z of Ctrl + Y', 'opnieuw']],
};
```

## Insta Post Maker

Vijf templates: standaard foto, foto met tekst, Pure blog post, Pure case post en een
informatieve carousel met swipe-indicator (de laatste slide krijgt er vanzelf
geen). Formaten 4:5 (feed), 9:16 (story) en 1,91:1 (liggend, Instagram en
LinkedIn); een ouder 1:1-concept opent als 4:5. Liggend is even breed als een
staande post, dus de letters blijven even groot: alleen marges, logo en
tussenruimtes zijn kleiner, de tekst staat naast het logo (en naast een
fotozeshoek) in plaats van erboven, en een slidenummer staat naast de titel.
Staat de Emerce-badge aan, dan blijft de tekst boven de voetregel. Alle posts zijn donker. De editor
gebruikt de [editor-bouwstenen](#editor-bouwstenen).

- **Rail:** *Template* (template en formaat, en *alles wissen*), *Foto*,
  *Tekst* (belangrijkste veld eerst, het label als laatste) en *Details*.
  Bestaat een onderdeel niet bij het template, dan staat het uit met de reden:
  standaard foto heeft geen details.
- **Foto per carousel-slide:** elke slide kan een eigen foto hebben (schakelaar
  *Foto op deze slide* bij Tekst en bij Foto), in een zeshoek rechtsboven met de
  titel ernaast, of als achtergrond onder een effen laag Inkt. Uitsnede en zoom
  horen bij de slide; de foto's gaan mee in de zip en de PDF.
- **Klik in de preview:** een cyaan kader toont wat je aanwijst (kop, label,
  foto, klantlogo, resultaat, magenta blok …); klikken opent het paneel en
  zet je in het veld. Slepen verschuift de foto, zoals voorheen.
- **Tekst:** nadruk staat in het veld als cyaan markeerstift (in de tekst van
  een carousel als vet), invulplekken als blokje. De werkbalk boven de post:
  *cyaan* (of *vet*), *+ klant* / *+ diensten* / *+ onderwerp*, en bij de kop
  de *grootte* uit de typeschaal (klein, normaal, groot; per template
  bewaard). Koppen staan altijd links, zoals de huisstijl. Het label heeft
  snelknoppen (pure kennis, pure blog, pure case, pure nieuws).
- **Te lange tekst:** de melding onder de post zegt welk veld het is, met een
  knop die je erheen brengt.
- **Foto:** klik op de lege fotoplek, sleep hem overal op het podium of plak
  hem. Is hij te klein voor de gekozen export, dan zegt een rustige melding
  bij de foto en onder de post hoe groot hij moet zijn. Bij Pure case post staat
  *foto als donkere achtergrond* bovenaan en gaat hij vanzelf aan als je een
  foto kiest.
- **Story:** de schakelaar *veilige zone* in de kop van de preview toont de
  balken van Instagram over de preview, nooit in de download.
- **Download** rechtsboven downloadt meteen; het pijltje ernaast toont
  waarvoor (Instagram, LinkedIn, extra scherp), het bestand (PNG, JPG of PDF),
  *alleen deze slide*, *kopieer* (altijd PNG), en in één regel wat je krijgt
  ("zip met 3 PNG's · 1080 × 1350 px", "1 PDF met 5 pagina's · bewerkbaar in Canva",
  "1 PDF voor LinkedIn met 3 pagina's"). De keuze wordt onthouden; `Ctrl` + `S`
  werkt nog. Wat welke keuze oplevert staat op één plek: `js/insta/export.js`.
- **PDF (voor Canva):** voor elke post, net als in de andere makers. Bedoeld
  om verder te bewerken in Canva (ook Illustrator en Acrobat): sleep hem op de
  startpagina van Canva of klik op *Uploaden*. Elk onderdeel is een eigen laag:
  tekst is echte tekst in ingesloten Pure Minds Sans (per regel en stijl één
  tekstobject, met het juiste gewicht), effen vlakken en losse zeshoeken zijn
  vector, het logo, de Emerce 100-badge en een klantlogo in SVG ook (elk één
  vorm). Afbeeldingen zijn elk verloop en het zeshoekpatroon op de achtergrond
  (elk één transparante PNG), foto's (uitgesneden tot wat je ziet, hoogstens
  twee pixels per ontwerp-px), een foto in een zeshoek (PNG met doorzichtige
  hoeken, want Canva negeert uitknippaden) en een klantlogo dat geen SVG is.
  Heeft de PDF meer onderdelen dan Canva importeert (1.400), dan zegt de tool
  dat. Een post is één pagina, een carousel een pagina per slide (ook
  voor Instagram), *alleen deze slide* één pagina. Pagina: 0,75 pt per
  ontwerp-px (4:5 is 810 × 1012,5 pt), net als de LinkedIn-PDF; in Canva is hij
  weer 1080 px breed. Bestand: `pureminds-<template>-<onderwerp>.pdf`.
- **Ongedaan maken** (appbalk, `Ctrl` + `Z`): de hele post, ook een foto
  vervangen of weghalen. Foto en klantlogo staan elk onder een eigen sleutel
  in IndexedDB (`photoKey`, `logoKey` in het concept); oude versies blijven
  tot de volgende keer laden bewaard, dan ruimt de tool ze op.
- **Rondleiding:** bij het eerste bezoek (niet via een snelle start van het
  dashboard; dan een melding met een knop). Stappen die bij het template niet
  bestaan worden overgeslagen.
- **Pure blog post:** onderin staat een magenta blok met de CTA ("lees de
  blog"), zonder pijl: het is een oproep, geen knop om op te klikken.
- **Emerce 100-badge:** de schakelaar staat altijd in de kop van de preview.
  Wit, klein linksonder.
  - Hij is 45% van de hoogte van het logo, staat even ver van de rand als het
    logo en is verticaal op het logo gecentreerd.
  - In een carousel staat hij alleen op de laatste slide: op de eerste staat
    linksonder de swipe-aanwijzing.
  - In PNG en JPG wordt hij op de exportmaat getekend, in de PDF als vector
    (één vorm). In de miniaturen van de templates staat hij niet.

| Formaat | 1080 px (Instagram) | 1200 px (LinkedIn) | 2160 px |
|---|---|---|---|
| 4:5 | 1080 × 1350 | 1200 × 1500 | 2160 × 2700 |
| 9:16 (story) | 1080 × 1920 | 1200 × 2133 | 2160 × 3840 |
| 1,91:1 (liggend) | 1080 × 566 | 1200 × 629 | 2160 × 1132 |

## Document Maker

Brief, offerte, memo of notitie op het A4-briefpapier. De editor gebruikt de
[editor-bouwstenen](#editor-bouwstenen); de pagina's staan op het podium,
passend in de breedte (nooit groter dan echt), en meer pagina's scrollen.

- **Rail:** *Soort* (vier kaartjes met een mini-A4, en *nieuw document*),
  *Gegevens* (eerst het onderwerp, dan aan wie: adres, kenmerk of
  offertegegevens, en de aanhef; datum en label als laatste), *Tekst*,
  *Prijzen* (alleen bij een offerte; anders uit met de reden), *Afsluiting*
  (slotgroet, naam, functie, handtekening) en *Briefpapier*. Zolang adres,
  KvK en e-mail van het briefpapier leeg zijn, staat er een cyaan stipje bij
  *Briefpapier*.
- **Kop van de preview:** soort, aantal pagina's en de Emerce 100-schakelaar
  (altijd zichtbaar, ook op mobiel met het blad open).
- **Klik in de preview:** een cyaan kader met de naam toont wat je aanwijst
  (titel, adres, datum en kenmerk, aanhef, tekst, offerteregels, voor akkoord,
  ondertekening, briefpapier, Emerce 100); klikken opent het paneel en zet je
  in het veld. Klik je in de tekst, dan staat de cursor op precies die plek in
  de editor. Andersom schuiven de pagina's mee naar wat je invult of typt.
- **Tekst:** de werkbalk zoals in Word staat boven de pagina's (op mobiel
  bovenin het blad) zolang *Tekst* open is: *stijl* (alinea, kop, tussenkop,
  citaat), vet, cursief, onderstreept, opsomming, genummerde lijst en *opmaak
  wissen*. Geen lettergrootte of uitlijning: die komen uit de huisstijl.
  `Ctrl` + `B` / `I` / `U`, `Alt` + `F10` naar de werkbalk. Plakken uit Word of
  Google Docs mag; alleen die opmaak blijft over.
- **Offerteregels:** per regel de omschrijving, daaronder aantal, prijs per
  stuk (excl. btw) en het regeltotaal. Plakken uit Excel of Google Sheets vult
  de regels (omschrijving, aantal, prijs, of omschrijving en prijs). Bedragen
  als "€ 1.250,50" worden goed gelezen en na het typen netjes teruggezet.
  Enter springt naar de volgende regel of maakt een nieuwe. Btw, subtotaal en
  totaal staan eronder, net als op de pagina.
- **Download** rechtsboven maakt meteen de PDF; het pijltje ernaast toont PDF,
  Word (.docx, ook voor Google Docs) en afdrukken, elk met wat je krijgt.
  `Ctrl` + `S` is de PDF, `Ctrl` + `P` afdrukken.
- **Voorbeeldtekst:** een nieuw document heeft voorbeeldinhoud. Staat daar
  vóór een download nog iets van (een voorbeeldregel in het adres, een
  voorbeeldzin, een voorbeeldregel in de offerte) of een invulplek als
  `[naam]`, dan zegt de tool waar: "Nog voorbeeldtekst in: aanhef en adres",
  met *naar het veld* (de tekst staat dan geselecteerd, typen vervangt hem) en
  *toch downloaden*. Nooit stil tegenhouden; dezelfde voorbeeldtekst vraagt hij
  maar één keer. De controle staat in `js/document/model.js`.
- **Pagina's:** tekst loopt vanzelf door naar een volgende pagina. Alinea's
  en lijsten worden op woorden gesplitst, de offertetabel op regels, en een
  kop gaat mee met de tekst eronder. Staan er op de laatste pagina maar een
  paar regels, dan zegt een melding onder de pagina's hoe het op een pagina
  minder past, met *naar de tekst* en bij een offerte *voor akkoord
  uitzetten*. Marges en typeschaal van het briefpapier liggen vast.
- **Ongedaan maken** (appbalk, `Ctrl` + `Z`): het hele document, de tekst en
  de offerteregels inbegrepen, en ook het briefpapier en de badge: die zie je
  op de pagina veranderen, dus ze horen bij "wat ik net deed". Ze blijven wel
  apart bewaard (`pm-document-sender-v1`) en staan bij *nieuw document* nog.
  In de tekst zelf maakt `Ctrl` + `Z` je laatste typwerk ongedaan.
- **Handtekening:** een tegel met voorbeeld; klik of sleep een afbeelding. Hij
  staat in IndexedDB onder een eigen sleutel (`sigKey` in het concept), zodat
  ongedaan maken ook een vervangen handtekening terugzet; oude blijven tot de
  volgende keer laden bewaard, dan ruimt de tool ze op.
- **Nieuw document** begint direct opnieuw (briefpapier, naam, functie en
  handtekening blijven), met *ongedaan maken* in de melding.
- **Rondleiding:** bij het eerste bezoek (via een snelle start van het
  dashboard alleen een melding met een knop). De stap over prijzen doet
  alleen mee bij een offerte.
- **Logo:** het zwarte zeshoek-logo (vector), net als op de posts en slides.
- **Emerce 100-badge:** zwart, rechts in de voet vóór het paginanummer, op
  elke pagina.
  - Hij is ongeveer 7 mm hoog en loopt van de bovenkant van de eerste
    voetregel tot de grondlijn van de laatste. Voet en pagina-indeling
    veranderen er niet door.
  - De keuze hoort bij het briefpapier: hij geldt voor elk document en blijft
    staan bij *nieuw document*.
  - PDF: vector via svg2pdf. Word: SVG met een PNG-reserve voor Google Docs,
    in de voet van de eerste en de volgende pagina's.
- **PDF:** `js/document/pdf.js` bouwt elke pagina opnieuw op in jsPDF, op de
  posities die de browser in de preview heeft berekend: tekst per regel als
  echte tekst, vlakken en lijnen als vector, logo en zeshoeken via svg2pdf.
  Dezelfde lettertypebestanden in preview en PDF, dus alles staat op zijn plek.
- **Word:** `js/document/docx.js` bouwt het briefpapier na als Word-opmaak
  (bibliotheek docx): kop met logo en afzender, vervolgkop met de titel, voet
  met "pagina X van Y" als veld, koppen, zeshoek-bullets, genummerde lijsten,
  citaten, de offertetabel en het akkoordblok als tabellen, en de
  handtekening als afbeelding. Pure Minds Sans (regular, semibold, extrabold) zit
  in het bestand, zodat het ook klopt zonder dat lettertype.

## Presentation Maker

16:9-slides in zeven layouts, plus de twee soorten van het klanttraject in
de vaste opbouw van Pure Minds: het voorstel (na het eerste gesprek) en de
positionering (na het traject), met zes layouts erbij. De editor gebruikt de
[editor-bouwstenen](#editor-bouwstenen): de slide groot op het podium, de
strook met alle slides eronder.

- **Rail:** *Soort* (wat maak je: *Presentatie*, *Voorstel* of
  *Positionering*, drie kaarten met de titelslide van elk soort, en *nieuwe
  presentatie*, *nieuw voorstel* of *nieuwe positionering*), dan alleen bij
  een voorstel *Voorstel* en *Prijzen* en alleen bij een positionering
  *Gegevens*, *Layout* (het raster met de layouts staat altijd open, met je
  eigen slide in elke miniatuur en de huidige gemarkeerd), *Inhoud* (de
  velden van deze layout, het label als laatste; bij een canvas de blokken of
  vakken), *Foto* (alleen bij titelslide, beeld + tekst en afsluiter; anders
  uit met de reden; bij een voorstel of positionering kies je daar ook *foto*
  of *logo*) en *Presentatie* (slidenummers, standaard uit; cyaan punt).
- **Kop van de preview:** welke slide, de exportmaat, *foto toevoegen* en de
  Emerce 100-schakelaar.
- **Layouts:** titelslide, sectie (automatisch genummerd), opsomming,
  beeld + tekst (foto links of rechts), citaat of kerncijfer, tabel,
  afsluiter. Bij een voorstel of positionering komen er vier bij: tekst
  (titel met alinea's), kolommen (twee of drie blokken), genummerd (vragen of
  stappen in cyaan zeshoeken) en waardepropositie (het canvas; de vakken vul
  je bij *Inhoud*). Bij een positionering nog twee: business model canvas
  (zeven blokken) en toelichting (titel met tekst die over twee kolommen
  loopt). Wisselen houdt tekst en foto vast.
- **Het klanttraject:** na het eerste gesprek het voorstel, na het traject de
  positionering. Beide staan in de vaste opbouw en met de vaste teksten van
  Pure Minds: een formulier vult de slides, en alles blijft aanpasbaar.
  - **Kiezen:** bij *Soort*, of met de tegels *Voorstel* en *Positionering*
    op het dashboard (`?type=voorstel`, `?type=positionering`). Wisselen mag
    altijd: wat open stond, blijft bewaard en staat weer klaar als je
    terugwisselt. *Nieuwe presentatie*, *nieuw voorstel* of *nieuwe
    positionering* onderaan *Soort* begint opnieuw met het soort dat open
    staat, met *ongedaan maken* in de melding. De tegel *Presentatie* opent
    altijd de gewone presentatie (`?type=regulier`); je voorstel en je
    positionering blijven bewaard bij *Soort*. Bij een eerste bezoek start de
    rondleiding zoals altijd.
  - **Nieuwe positionering begint leeg:** net als een nieuw voorstel staat er
    overal `[klantnaam]` tot je de naam bij *Gegevens* invult. De naam uit een
    voorstel wordt niet overgenomen.
  - **Eigen aanpassingen blijven:** wat je zelf op een slide verandert, laat
    het formulier staan; het werkt alleen de andere velden bij. Een melding
    bij *Inhoud* zegt dat, met *terugzetten* om de slide weer helemaal het
    formulier te laten volgen. Eigen slides tussendoor en je volgorde blijven
    ook staan.
  - **Uitzetten gooit niets weg (voorstel):** een slide die je uitzet of
    verwijdert, wordt geparkeerd, met zijn foto, eigen vakken en aanpassingen.
    Zet je hem weer aan bij *Onderdelen*, dan komt precies die slide terug;
    een vaste slide haal je terug met *zet terug* bovenaan bij *Voorstel*. De
    positionering heeft een vaste opbouw: daar gaat niets uit (zie
    hieronder).
  - **Klaar om te versturen?** Bovenaan *Voorstel* en *Gegevens* een lijst
    die meeloopt terwijl je invult, met wat vaak vergeten wordt (per soort
    hieronder), invulplekken ("3 invulplekken over, zoals [klantnaam]") en
    tekst die niet past. Elk punt is een ✓ of een open rondje, en klikken
    brengt je naar het veld of de slide. De controle vóór de download kijkt
    nog één keer naar hetzelfde. De punten komen uit `checklist` van het
    soort (zonder DOM, getest).
  - **Hoe het werkt:** `js/presentation/generator.js` (`PMGenerator`) doet
    wat beide soorten delen: het formulier gezond maken, de slides bouwen en
    bijwerken, parkeren, *zet terug* en de checklist. Een recept per soort
    zegt welke slides er zijn, in welke volgorde en met welke vaste teksten:
    `js/presentation/voorstel.js` en `js/presentation/positionering.js`
    (`PMDecks.voorstel` en `PMDecks.positionering`). Het concept krijgt
    `v: 2`, `type` (`'regulier'`, `'voorstel'` of `'positionering'`), de
    invoer van het formulier in `form`, de geparkeerde slides in `parked` en
    de soorten die niet open staan in `stash`.
  - **Oude concepten:** vóór de positionering was er één gegenereerd soort,
    het voorstel, onder de naam `positionering`. Een concept van vóór
    versie 2 (zonder `v`) met `type: 'positionering'` opent daarom als
    voorstel, net als het voorstel dat bij *Soort* bewaard was (het formulier
    in `pos` wordt `form`); foto's en eigen aanpassingen blijven. Een
    vangnet: een positionering met het formulier van een voorstel (situatie,
    diensten, prijzen) is ook een voorstel. De kaart op het dashboard telt
    op dezelfde manier (`summary` in `js/shared/tools.js`). De stand van de
    rondleiding gaat één keer mee, van `pm-tour-positionering-v1` naar
    `pm-tour-voorstel-v1` (`pm-presentation-migrated-v2`). Bij het laden
    krijgt een bewaard voorstel of een bewaarde positionering (ook die bij
    *Soort*) de vaste teksten van nu, zoals de verbeterde spelling; wat je
    zelf aanpaste, blijft staan.
  - **Oud tabblad:** stond de tool bij de update nog open in een ander
    tabblad, herlaad dat tabblad dan eerst. De oude versie kent de
    positionering niet en schrijft bij de volgende wijziging zijn eigen,
    oudere stand terug: wat je intussen in de nieuwe versie maakte, zoals een
    positionering, is dan weg.
- **Voorstel:** een "Voorstel ‹klant›" voor een traject positionering en
  merkverhaal, in de vaste opbouw van Pure Minds: titelslide, Onze belofte,
  huidige situatie, marketingaanpak, de fases interview en
  positioneringsdocument, investering en slogan. Aan of uit: gewenste
  situatie, waardepropositie, website (nieuw of optimaliseren), SEA,
  GA4-audit, Google Bedrijfsprofiel, uitvoering en meetbaar maken. SEA krijgt
  geen eigen slide, maar een regel bij *Wat wij gaan doen* op de
  marketingaanpak.
  - **Voorstel** (het paneel): klant (naam, datum, logo), situatie, aanpak en
    onderdelen. Een nieuw voorstel opent hier, met de cursor in de klantnaam.
    De slides volgen meteen, en de preview springt naar de slide die je
    invult: de klantnaam staat op de titelslide, de situatie, de aanpak en
    in de fases, de fases nummeren zichzelf, en het klantlogo staat op een
    witte zeshoek op de titelslide (het mooist een PNG of SVG met
    transparante achtergrond). Een leeg veld wordt een invulplek zoals
    `[klantnaam]`; *nog even checken* noemt hem en brengt je naar het veld
    in het formulier.
  - **Klaar om te versturen?** klantnaam, huidige situatie, prijzen,
    klantlogo (optioneel) en de waardepropositie (als hij aan staat).
  - **Prijzen:** regels zoals de offerteregels van de Document Maker, per
    groep (*Eenmalig*, *Maandelijks*): omschrijving en bedrag, *+ regel
    toevoegen*, Enter naar de volgende regel, en plakken uit Excel of Google
    Sheets (twee kolommen). "1500" en "1.500,-" worden € 1.500,-; tekst als
    N.T.B. blijft staan. Een omschrijving tussen `**` of een die met "Totaal"
    begint, wordt een vette regel. *Totaal per groep* staat standaard uit; een
    voetnoot kan onder de tabel. In de tabel passen 14 regels; valt er iets
    weg, dan zegt een melding hoeveel.
  - **Waardepropositie:** het canvas als eigen tekening in de huisstijl
    (klantprofiel en waardemap), zonder bronregel: het is een interne tool.
    De vakken vul je bij *Inhoud*, net als de velden van elke andere slide:
    eerst de klant (klantsegment, klanttype, taken, pijnen, voordelen), dan
    wat het aanbod doet (producten en diensten, pijnverzachters,
    voordeelverschaffers). Trefwoorden, één per regel, drie of vier per vak;
    een regel die helemaal vet is, wordt een kopje zonder punt, en een leeg
    vak toont op de slide een korte uitleg. Klik je op een vak in de
    preview, dan sta je in dat veld. De inhoud hoort bij de slide, niet bij
    het formulier: een kopie (*dupliceer*) heeft zijn eigen vakken, voor een
    tweede doelgroep. Of de slide erin zit, zet je bij *Onderdelen*.
- **Positionering:** een "Positionering ‹klant›" na het traject, in de vaste
  opbouw van de positioneringen van Pure Minds: altijd dezelfde 22 slides. De
  titelslide met de vaste inleiding over het positioneringsinterview en een
  foto in de zeshoek, Onderdelen (genummerd, altijd alle drie), het
  Business Model Canvas en het Waarde Propositie Canvas als overzicht, per
  blok of vak een toelichting (zeven en zes slides), elke groep na een eigen
  sectieslide, en de afsluiter *Van gesprek naar positionering* met de
  contactgegevens.
  - **Gegevens:** alleen wat voor de hele positionering geldt: de klantnaam
    (op de titelslide, de sectieslides en in de afsluiter), de datum (op de
    titelslide), het aanbod (*diensten* of *producten & diensten*, in de
    afsluiter) en een foto op de titelslide (optioneel). Een
    nieuwe positionering opent hier, met de cursor in de klantnaam. De
    canvassen en de toelichting schrijf je per slide, bij *Inhoud*; de
    lange inleiding en de afsluiter pas je daar ook aan.
  - **Vaste opbouw:** er kan niets uit, anders klopt de positionering niet
    meer. Geen schakelaars en geen *zet terug*: het recept heeft `fixed: true`
    (`setOn` en `markRemoved` doen niets). *Verwijder* staat uit op een slide
    van de positionering (Delete geeft een melding); een kopie (*dupliceer*)
    of een eigen extra slide verwijder je wel. Een oud concept met een
    onderdeel uit of een verwijderde slide krijgt bij het laden alle 22
    slides terug, met je tekst (`parts` en `hidden` vallen weg).
    Ook de volgorde ligt vast: een vaste slide sleep of verschuif je niet
    (*naar voren*/*naar achteren* staan dan uit); een eigen slide mag wel
    tussen twee vaste slides staan.
  - **Business Model Canvas:** de zeven blokken in vijf kolommen, zoals op
    het canvas: Key Partners met Key Resources eronder, Kernactiviteiten,
    Waardeproposities, Klantrelaties boven Kanalen (verdeeld naar hoeveel
    tekst er in elk staat), en Klantsegmenten. Elk blok is een donker vlak
    met een cyaan balk bovenaan. Bij *Inhoud* staat
    een veld per blok, in trefwoorden: een vet kopje met punten eronder
    (`**Kopje**`, dan `- punt`), of een gewone regel. Inspringen kent de
    slide niet: een punt onder een punt wordt een gewoon punt. Alle blokken
    krijgen dezelfde lettergrootte, op zijn kleinst 14 px; een leeg blok toont
    een korte uitleg. Klik op een blok in de preview en je staat in dat veld.
    Past het canvas ook zo niet, dan brengen de melding, de checklist en de
    controle vóór het downloaden je naar het blok dat te lang is.
  - **Waarde Propositie Canvas:** dezelfde tekening als in het voorstel,
    maar voor veel meer tekst (`style: 'vol'`): een kleinere letter (punten
    op zijn kleinst 13 px), punten dichter op elkaar, en past een vak niet,
    dan loopt de tekst door over de hele driehoek of wig. Bij *Inhoud*
    dezelfde vakken, met de tip: kort en krachtig, de uitleg per vak komt op
    de toelichtingsslides. Past het niet, dan brengt de melding je naar het
    vak dat te lang is.
  - **Toelichting:** per blok of vak een slide, met de naam als titel. Hij
    begint met een vraag tussen blokhaken (een invulplek); vervang die door
    je uitleg: alinea's, of vette kopjes met punten. Lange tekst loopt vanzelf
    over twee kolommen (eerst links; een kopje gaat mee met de tekst eronder)
    en wordt kleiner tot hij past. Die tekst is altijd van jou: het formulier
    en *terugzetten* laten hem staan, en maak je hem leeg, dan komt de vraag
    terug. De melding bij *Inhoud* heeft *naar het canvas*: naar het blok of
    vak op de canvas-slide.
  - **Klaar om te versturen?** klantnaam, foto op de titelslide (optioneel),
    "Business Model Canvas: 5 van 7 blokken ingevuld", hetzelfde voor de zes
    vakken van het Waarde Propositie Canvas, en "Toelichting: 3 van 13
    slides geschreven". De vragen van de toelichting tellen niet mee bij de
    invulplekken: die staan al bij de toelichting.
- **Slidenummers:** "03 / 07" naast het logo, aan of uit bij *Presentatie*.
  Een nieuwe presentatie, een nieuw voorstel of een nieuwe positionering
  begint zonder slidenummers; een bewaard concept houdt zijn eigen keuze
  (`showNumbers`, zonder die sleutel: uit).
- **Emerce 100-badge:** met de schakelaar *Emerce 100* in de kop van de
  preview; standaard uit. Wit en klein rechts in de voetregel, links van het
  logo; staan de slidenummers aan, dan links van het nummer. Op elke slide
  van een presentatie, voorstel of positionering. De keuze wordt in het
  concept bewaard (`badge`). In de PDF als vector (één vorm), in PowerPoint
  als scherpe afbeelding op elke slide, in PNG op de exportmaat.
- **Klik op de slide:** een cyaan kader toont wat je aanwijst (titel,
  ondertitel, punten, citaat, kerncijfer, label, foto, een cel van de tabel,
  een blok of vak van een canvas); klikken opent het paneel en zet je in dat
  veld of die cel. Slepen verschuift de foto, de pijltjestoetsen ook.
- **Tekst:** nadruk staat in het veld als markering. De werkbalk boven de
  slide: *cyaan* in titel, citaat, de toelichting bij een kerncijfer en de
  contactgegevens; *vet* in de andere velden (wit en vet op de slide). Bij
  titel en citaat ook de *grootte* (klein, normaal, groot; per slide en binnen
  het passend maken, dus lange tekst krimpt nog steeds). Geen uitlijning:
  slides staan links.
- **Slides:** *+ slide* zet een nieuwe slide na deze en opent de layoutkeuze.
  Voor de gekozen slide: *dupliceer*, *naar voren*, *naar achteren* en
  *verwijder* (met *ongedaan maken* in de melding); bij weinig ruimte in het
  menu achter "3 / 8 ⋮". Klikken kiest, slepen verplaatst, `←` `→` bladeren
  alleen. In de strook: `Home`, `End`, `Delete` (verwijderen) en `Enter`
  (bewerken). Past de strook niet, dan wijst een verloop met pijl naar de rest.
- **Tabel:** een raster; Tab en Enter springen door de cellen (de ×-knoppen
  zitten niet in de Tab-volgorde, *− rij* en *− kolom* werken op de cel waar
  je stond). Plakken uit Excel of Google Sheets vult de tabel vanaf de gekozen
  cel, tot 14 rijen en 8 kolommen. Kopregel en vette eerste kolom aan of uit,
  `**woord**` wordt cyaan, kolommen met getallen lijnen rechts uit, korps en
  kolombreedtes schalen mee. In PowerPoint en Google Slides een echte tabel.
- **Foto's:** per slide. Klik op de lege plek op de slide, sleep hem op het
  podium of plak hem. Zoomen en *centreren* in het paneel. Een foto op een
  layout zonder fotoplek geeft uitleg en de knop *gebruik beeld + tekst*. Is
  hij te klein voor de gekozen resolutie (let op 4K), dan zegt een rustige
  melding bij de foto, onder de slide en in de download-opties hoe groot hij
  moet zijn.
- **Te lange tekst:** past tekst ook op de kleinste letter niet, dan noemt de
  melding onder de slide het veld, met een knop erheen. Bij een canvas van de
  positionering zegt hij de langste blokken of vakken korter te maken (een
  canvas verdeel je niet over twee slides).
- **Download** rechtsboven maakt meteen de PDF; het pijltje ernaast toont
  PDF, PowerPoint (.pptx, ook voor Google Slides) en *als afbeelding* (Full HD
  of 4K; deze slide of een zip met alle slides), elk met wat je krijgt ("zip
  met 8 PNG's · 3840 × 2160 px"). `Ctrl` + `S` is de PDF.
- **Nog even checken:** staat er vóór een download nog voorbeeldtekst (ook de
  voorbeeldtabel), een invulplek als `[bron invullen]`, een lege slide of
  tekst die niet past, dan toont de tool per slide wat er is, met *naar slide
  3* en *toch downloaden*. Dezelfde inhoud vraagt hij maar één keer; labels,
  de regel onderaan en "Bedankt" tellen niet als voorbeeld. De controle staat
  in `js/presentation/deck.js`. Bij een invulplek uit het voorstel of de
  positionering brengt *naar slide* je naar het veld in het formulier dat hem
  vult (bij een canvas naar het blok of vak bij *Inhoud*, bij een
  toelichting naar de tekst van die slide). Heeft een canvas lege blokken of
  vakken, dan staat dat er ook: "Business Model Canvas: 2 van 7 blokken
  leeg; op de slide staat dan de uitleg."
- **Ongedaan maken** (appbalk, `Ctrl` + `Z`): de hele presentatie, van tekst,
  grootte en layout tot volgorde, verwijderen, tabel, uitsnede en foto's; je
  springt naar de slide die veranderde. Elke foto staat onder een eigen
  sleutel in IndexedDB (`photoKey` per slide; een ouder concept met
  `slide:<id>` werkt nog). Wat niet meer gebruikt wordt, ruimt de tool bij
  het volgende laden op; de foto's van de soorten die bij *Soort* bewaard
  staan en van geparkeerde slides (zoals de titelslide met het klantlogo)
  blijven.
- **Rondleiding:** negen stappen, van je titel tot de download. Stappen die
  bij slide 1 niet bestaan (een foto bij een citaat) worden overgeslagen.
- **Rondleidingen "je eerste voorstel" en "je eerste positionering":** elk
  soort heeft een eigen rondleiding (`PM_HELP.voorstel` en
  `PM_HELP.positionering`, stand in `pm-tour-voorstel-v1` en
  `pm-tour-positionering-v1`), dus ook wie al een presentatie maakte krijgt
  hem bij zijn eerste voorstel of positionering. Hij start vanzelf bij je
  eerste van dat soort (via een tegel op het dashboard alleen een melding
  met een knop); *hulp* → *rondleiding* start de rondleiding van het soort
  dat open staat; de knop op het dashboard (`#rondleiding`) die van de
  presentatie.
  - **Voorstel:** twaalf stappen, leren door te doen: de klantnaam typen (de
    slides veranderen mee), de situatie, onderdelen aan- en uitzetten, een
    prijs, een slide zelf aanpassen, de melding bij *Inhoud* die zegt of een
    slide het formulier volgt (met *terugzetten*), de waardepropositie bij
    *Inhoud* (de tool toont die slide), de lijst *Klaar om te versturen?*, de
    Emerce 100-badge en de download. De laatste stap noemt waar je overheen
    kijkt: alles staat alleen in deze browser, wisselen bij *Soort* bewaart
    je andere presentatie, check de lijst vóór het versturen, en de
    PowerPoint blijft bewerkbaar.
  - **Positionering:** negen stappen: de klantnaam (overgenomen uit het
    voorstel, of zelf typen), de vier onderdelen, de canvassen bij *Inhoud*
    (de tool toont het Business Model Canvas), de toelichting, de lijst
    *Klaar om te versturen?*, de Emerce 100-badge en de download. De laatste
    stap: alles staat alleen in deze browser, wisselen bij *Soort* bewaart je
    voorstel en je presentatie, en eerst de canvassen in trefwoorden, dan per
    blok de toelichting in zinnen.
- **Mobiel en tablet:** de slide boven, het blad eronder. De strook is één
  rij (*+ slide*, miniaturen, menu) en verdwijnt zolang het blad open is;
  bladeren kan dan met ‹ › bovenin *Inhoud*.
- **PDF:** één pagina per slide (960 × 540 pt, zoals PowerPoint), in losse
  lagen met echte tekst (zie [Bewerkbare PDF's](#bewerkbare-pdfs)).
- **PowerPoint:** `js/presentation/pptx.js` zet elke slide om in tekstvakken,
  vormen en foto's op precies de plek van de preview, met dezelfde
  korpsgrootte en regelval (het "plan" uit `templates.js`). Tekstvakken
  krimpen bij te veel tekst, net als in de tool. Foto's zijn de vulling van
  een zeshoek of een bijgesneden afbeelding met dezelfde uitsnede. Het
  Business Model Canvas wordt losse vlakken met een cyaan balk en een
  tekstvak per blok; een toelichting een tekstvak per kolom, met de tekst
  verdeeld zoals in de preview. Loopt de tekst van een vak in het volle
  Waarde Propositie Canvas door, dan krijgt dat vak meer tekstvakken. De
  achtergrond, cyaan balk, logo en voetregel staan op een Pure Minds-master:
  een nieuwe slide in PowerPoint krijgt ze vanzelf. Het slidenummer is een
  veld en telt mee bij verschuiven of toevoegen.

## Icon Finder

Alle 3.229 iconen van [Remix Icon](https://remixicon.com/) (1.690 namen, de
meeste in een lijn- en een volle stijl) op één plek, te downloaden in de
huisstijl. De iconen vallen onder de Remix Icon License v1.0 (een kopie staat
in `assets/icons/LICENSE`): vrij te gebruiken in eigen werk, niet te verkopen
als los iconenpakket.

- **Zoeken in het Nederlands of Engels:** "prullenbak" vindt `delete-bin`,
  "tandwiel" vindt `settings`. Meervouden en verkleinwoorden werken ook
  ("pijlen", "huisje"). Staat er een typfout in, dan toont de tool wat erop
  lijkt ("prulenbak"). De beste treffer staat eerst: een exacte naam, dan
  namen die met het woord beginnen, dan kortere namen.
- **Vorm en kleur** gelden voor het hele raster, dus wat je ziet,
  download je (lijniconen; uitgesneden in de witte zeshoek alleen de volle
  stijl, zie hieronder):
  - vorm: *los* of *zeshoek*
  - kleur, altijd effen: inkt, cyaan, blauw, magenta, wit of een eigen kleur
    (los); cyaan, donker of magenta met een wit icoon, wit met een
    uitgesneden (doorzichtig) icoon, of een eigen kleur (zeshoek)

  Bij wit worden raster en preview vanzelf donker.
- **Witte zeshoek: alleen de volle stijl (Fill).** Uitgesneden gebruik je
  nooit de lijnstijl: het wit slokt dunne uitgesneden lijnen op (op 24 px nog
  dunner), een vol silhouet heeft minder kleine randjes en is op een scherm
  sneller herkenbaar. De volle iconen (`js/icons/icon-fill-data.js`) laden pas
  als je de witte zeshoek kiest; tot dan zijn de iconen onzichtbaar. Laden ze
  niet, dan springt de kleur terug naar cyaan en komt er geen download: nooit
  een uitgesneden lijnicoon. Iconen die maar in één stijl bestaan (zoals
  `bold`) worden uitgesneden zoals ze zijn.
- **Categorieën:** de knoppen boven het raster tonen per categorie hoeveel
  iconen er bij de zoekterm horen.
- **Laatst gebruikt:** zonder zoekterm staan iconen die je al gedownload of
  gekopieerd hebt bovenaan.
- **Export:**
  - SVG: vector, voor Figma, Illustrator en het web.
  - PNG: 128, 256, 512, 1024 of 2048 px hoog, met een transparante
    achtergrond, voor PowerPoint, Google Slides, Canva en Word. De zeshoek is
    smaller dan hij hoog is, dus 512 px hoog wordt 452 × 512.
  - *Kopieer* zet de SVG-code (plakt als vector in Figma) of de PNG
    (plakt in een slide of document) op het klembord.
- **PNG-kwaliteit:** de SVG krijgt eerst zelf de maat van de export en wordt
  pas dan op een canvas van precies die maat getekend. Er wordt dus nooit een
  klein plaatje opgeschaald: ook 2048 px is haarscherp.
- **Bestandsnamen:** `home-line.svg` (los, inkt), `home-line-cyaan.svg`,
  `home-line-zeshoek-donker-512px.png`, `home-line-zeshoek-wit-doorzichtig.svg`, `…-eigen-1a2b3c` voor een eigen kleur.
- **Sneltoetsen:**

  | Toets | Wat |
  |---|---|
  | `/` of `Ctrl` + `K` | naar het zoekveld |
  | `Esc` | zoekveld leegmaken |
  | pijltjes, `Home`, `End`, `PgUp`, `PgDn` | door het raster bladeren |
  | `Enter` | naar de downloadknop |
  | `Ctrl` + `S` | het gekozen icoon downloaden |
  | `Ctrl` + `C` (op een icoon) | het icoon kopiëren |

  Dubbelklikken op een icoon downloadt het direct.
- **Mobiel:** een gekozen icoon opent in een paneel van onderen, met dezelfde
  export.
- **Adres en opslag:** zoekterm, categorie en gekozen icoon staan in het adres
  (`?q=mail&cat=Arrows&icoon=mail`), dus een link doorsturen werkt. Vorm,
  kleur, formaat en de laatst gebruikte iconen staan in `localStorage`
  (`pm-icons-v1`).

### Iconen en zoekwoorden bijwerken

- **Nieuwe iconen:** zet de SVG's in `assets/icons/<categorie>/` (één pad op
  het 24-raster, zoals Remix) en draai `npm run icons`.
- **Zoekwoorden:** pas `scripts/icon-words/nl.json` aan (Engels woord of
  combinatie → Nederlandse zoekwoorden; woorden na een `|` tellen minder) en
  draai `npm run icons`.
- **De zeshoek:** `js/icons/hex.js` rekent in de browser precies na wat
  `assets/icons/maak-zeshoeken.py` doet. Een zeshoek-SVG uit de tool is dus
  gelijk aan het bestand dat het script in `assets/icons/Zeshoek/` zet, op
  afronding na (hoogstens 0,001 eenheid, onzichtbaar). Die map staat in de
  repo, zodat je de iconen ook los kunt pakken. Verander je maten of varianten in
  het Python-script, doe dat dan ook in `hex.js`.

  De varianten zijn effen, zonder verloop of rand:

  | Map | Zeshoek | Icoon |
  |---|---|---|
  | `Cyaan zeshoek - wit icoon` (huisvariant) | `#1ab9e2` | wit |
  | `Donkere zeshoek - wit icoon` | `#303030` | wit |
  | `Magenta zeshoek - wit icoon` | `#b61b50` | wit |
  | `Witte zeshoek - doorzichtig icoon` | `#ffffff` | uitgesneden, alleen de volle stijl (`naam-fill.svg`) |

  De doorzichtige variant is één samengesteld pad (zeshoek plus icoon, regel
  evenodd), zodat hij in Illustrator, Figma, Canva en PowerPoint werkt. Twee
  iconen met overlappende delen gebruiken een pad zonder overlap uit
  `uitsnijpaden.json`. Nieuwe iconen: draai `python assets/icons/maak-zeshoeken.py`
  (met `pip install skia-pathops` controleert het script zelf op overlap) en
  daarna `npm run icons`.

## Brand Styleguide

Het tijdloze brandbook van Pure Minds Marketing Group als tool, op basis
van `assets/PureMinds-Brandbook-v2.0.pdf`. Missie, visie en kernwaarden staan
er letterlijk in (alleen opgeschoond; "on-aangetapt" blijft zoals in de
voorstellen). Het bevat tone of voice en schrijfregels, clear space en
minimum formaat van het logo, regels voor de zeshoek en de iconen, contrast,
de 60/30/10-regel en beeldtaal. De gebruikte gewichten zijn Regular 400,
Bold 700 en ExtraBold 800.

- **Indeling:** zoals de andere makers. De rail heeft zeven hoofdstukken
  (Merk, Logo, Kleur, Type, Beeld, Iconen, Gebruik); een hoofdstuk kiezen
  scrolt naar zijn eerste pagina en opent zijn paneel. Blader je zelf naar een
  ander hoofdstuk (scrollen, miniaturen, `Page Up` en `Page Down`), dan volgt
  het paneel (breed scherm, als er een paneel open staat). Het podium toont de
  18 pagina's (A4 liggend) onder elkaar, met miniaturen eronder. Op een
  telefoon is de rail een tabbalk en het paneel een blad van onderen.
- **Panelen:** teksten kopiëren (naam, slogan, missie, visie); het logo in wit
  of Inkt als SVG of PNG; de **clear space** aan en uit (om elk logo op elke
  pagina, alleen op het scherm) met een rekenhulp; HEX, RGB en CMYK met één
  klik kopiëren; een **contrastchecker** tussen twee merkkleuren (WCAG 2.1);
  de 60/30/10-regel licht en donker; de typeschaal als CSS; een fotocheck;
  de icoonvarianten met een zoekveld naar de Icon Finder; de makers en de
  Emerce 100-badge.
- **Zoeken** (`/`) doorzoekt alle teksten en springt naar de pagina. Op een
  telefoon staat het veld achter het vergrootglas links in de appbalk en ligt
  het open over de hele balk. Vanaf het dashboard opent
  `tools/styleguide.html?q=magenta` meteen de resultaten.
- **Eén bron:** kleuren, typeschaal en logo-regels staan in
  `brand-tokens.js` (gelijk aan `css/global.css` en `PM.brand`; de test
  bewaakt dat), de teksten in `content.js`. Het podium en de PDF tekenen met
  dezelfde functies (`pages.js`).
- **Export** (*exporteer brandbook*, `Ctrl` + `S`):

  | Bestand | Wat |
  |---|---|
  | `brandbook-pure-minds-marketing-group.pdf` | alle pagina's, bewerkbaar |
  | `brandbook-<hoofdstuk>.pdf` | alleen het hoofdstuk dat in beeld is (menu) |
  | `pure-minds-logo-pakket.zip` | `pure-minds-logo-wit` en `-inkt`, SVG en PNG (2000 px, doorzichtig), met LEESMIJ |
  | `pure-minds-kleuren.ase` | stalen voor Illustrator, InDesign en Photoshop: een map RGB en een map CMYK |
  | `pure-minds-kleuren.json` | kleuren met rol en CSS-variabele, de verhouding en het lettertype |

- **De PDF:** echte tekst in Pure Minds Sans (elk gewicht een eigen
  PostScript-naam, ook `PureMindsSans-Light`), vormen, logo, badge en iconen
  als vector-paden (geen afbeeldingen, geen uitknippaden, geen verlopen),
  kleuren exact: alleen de huiskleuren en een vaste set neutrale grijzen voor
  lijnen en vlakjes (`NEUTRALS` in `pages.js`). Een witte vorm krijgt nooit
  een rand; hij staat op Inkt, op een kleur of op een licht vlak. A4 liggend
  (841,89 × 595,28 pt). Daarna zet pdf-lib er vijf
  **lagen** in (optionele inhoudsgroepen: Achtergrond, Vormen, Tekst, Logo,
  Beeld), plus titel, onderwerp en auteur. `PMPdfCanvas` markeert de blokken
  daarvoor (`beginLayer`/`endLayer`, zie `js/shared/pdf-canvas.js`); de andere
  makers gebruiken dat niet en hun PDF's blijven gelijk. Het hele brandbook
  is zo'n 1.100 elementen, onder de 1.400 van Canva; wordt het ooit meer, dan
  komen er delen van hele hoofdstukken in een zip.
- **Controle:** `npm test` tekent elke pagina zonder browser door
  `PMPdfCanvas` en bewaakt wat hierboven staat: alleen `PureMindsSans-*`,
  geen afbeeldingen, uitknippaden of verlopen, alleen toegestane kleuren
  (exact), alles in een laag, onder de 1.400 elementen, en alle teksten uit
  `content.js` als echte tekst. Eén keer per release: de PDF in Canva slepen
  en openen in Illustrator.
- **Canva en Illustrator:** Canva opent elk tekstvak en elke vorm los (zet
  Pure Minds Sans in de Brand Kit, anders kiest Canva een vervanger).
  Illustrator opent de tekst bewerkbaar; de lagen van een PDF die niet uit
  Illustrator komt, zet Illustrator meestal samen in één laag met groepen,
  in de goede volgorde. Acrobat toont de vijf lagen.
- **Het logo** in de exports is het origineel uit `assets/brand/logo/`; de
  zwarte variant (`#24282e`) krijgt in het pakket de kleur Inkt (`#303030`).
- **Opslag:** variant, clear space, compositie, contrastkleuren, logobreedte
  en de fotocheck staan in `localStorage` (`pm-styleguide-v1`).

## Techniek & analyse

Vier tools die buiten de hub draaien, in een eigen donker blok naast de
makers op het dashboard (*Wat wil je checken?*). `index.html#techniek`
springt er meteen heen (handig als bladwijzer), `index.html#design` naar de
makers.

| Tool | Wat | Draait |
|---|---|---|
| [Consent Check](https://github.com/PureMindsMarketingGroup/consent-check) | Meet per website welke cookies en trackers er vóór en ná het cookie-akkoord laden | lokaal: downloaden (zip) en starten op je eigen Mac of Windows-pc |
| [Landingpage & Ads Optimizer](https://landingpage-ads-optimizer-qr13.vercel.app/) | Checkt of Google Ads-advertentie en landingspagina op elkaar aansluiten, met een CRO-briefing | web-app, opent in een nieuw tabblad |
| [SEO Content Gap Analyzer](https://seo-content-gap-analyzer-1yxm.vercel.app/) | Zet een pagina naast de Google-top 10: ontbrekende koppen, termen en vragen | web-app, opent in een nieuw tabblad |
| [Keyword Focus & Intent Check](https://focus-keyword-tool.vercel.app/) | Past een pagina bij het focuszoekwoord en de zoekintentie, en wat mist er nog: intentcheck, keyword mapping en contentbriefing (PDF of markdown) | web-app, opent in een nieuw tabblad |

- **Kaarten:** elke tool dezelfde opbouw: naam, wat hij doet, waar hij draait
  (*web-app* of *lokaal*), wat je krijgt, en één knop. Een web-app opent in
  een nieuw tabblad (*open de web-app*); de pijl op de knop wijst daarom
  schuin omhoog.
- **Consent Check:** de knop *hoe start je hem?* en de link *direct
  downloaden* (de zip van GitHub). Na het downloaden wijst een melding de weg
  naar de uitleg.
- **Uitleg** (`<dialog id="guide-consent">` in `index.html`): een paneel van
  rechts met een tabje voor Mac en voor Windows; het tabje van je eigen
  computer staat al open. De Mac-tekst is letterlijk die van de maker van de
  tool. Windows gebruikt de Opdrachtprompt en `start.cmd` uit de repo: via
  de Opdrachtprompt geeft Windows geen melding over een bestand van internet
  (dubbelklikken kan dat wel), en in PowerShell zou je `.\start.cmd` moeten
  typen. Opdrachten zijn te kopiëren, stap 1 heeft zelf een downloadknop, en
  *Lukt het niet?* vangt de vier meest voorkomende problemen op.

## Bewerkbare PDF's

Posts en slides worden getekend met canvas-opdrachten. Voor de PDF krijgt
dezelfde renderfunctie `PMPdfCanvas` (`js/shared/pdf-canvas.js`) in plaats van
een echt canvas. Die onthoudt elke opdracht en schrijft bij `flush()` alles in
tekenvolgorde weg als losse PDF-objecten, zodat Canva elk onderdeel als eigen
laag importeert en de PDF er precies zo uitziet als de preview:

- **Tekst:** echte tekst, per regel en stijl één object, met de spaties erin.
  De browser meet, net als in de preview, dus regelval en posities zijn gelijk.
  Elk gewicht heeft een eigen fontnaam (`PureMindsSans-ExtraBold`, via
  `PM.pdfFonts` in `core.js`, dat ook `/StemV` per gewicht goed zet); met één
  naam voor alle gewichten maakte Canva alle tekst even dik en liet het koppen
  weg. Alle makers maken hun PDF met `PM.pdfDocument` en `PM.pdfFinish`.
- **Vormen:** effen vlakken en lijnen als vector. Een effen vlak dat een
  uitsnede vult, wordt de vorm van die uitsnede.
- **Verlopen:** elk verloop is één transparante PNG, getekend door de browser
  (over een rechthoek op halve resolutie; na vergroten is dat gelijk). PDF
  kent geen transparante verlopen, en de oude benadering met 64 banen of
  ringen maakte Canva samen met de rest tot één platte afbeelding.
- **Foto's:** uitgesneden tot wat je ziet (JPEG; PNG bij transparantie of
  als de bron een PNG of SVG is). In een zeshoek een PNG met doorzichtige
  hoeken, op hoogstens 1,5 px per ontwerp-px: Canva negeert uitknippaden.
- **Logo's:** SVG via svg2pdf.js; vormen van één kleur worden één pad, zodat
  het logo in Canva één element is (alleen als de browser bevestigt dat het er
  zo precies hetzelfde uitziet). Een SVG die svg2pdf niet aankan, gaat als
  afbeelding mee in plaats van de export te laten mislukken.
- **Tekens die Pure Minds Sans niet heeft** (emoji) worden een kleine PNG, anders
  kapt jsPDF de tekst af.

Een afbeelding die op meer pagina's terugkomt (een verloop in een carousel)
zit maar één keer in het bestand; het logo en de Emerce-badge zijn vector en
staan op elke pagina als vorm. Kleuren staan met vier decimalen in de PDF
(jsPDF rondt anders af, en wordt merkcyaan `#1ab9e2` in Canva `#1abae3`). Canva importeert hoogstens 1.400 elementen
per PDF; een post heeft er hoogstens zo'n 30, een slide met een grote tabel
zo'n 90. Controleren: `npm test` (tests/pdf-canvas.test.js) dekt de keuzes per
tekenopdracht zonder browser.

## Word, PowerPoint en Google

- **Word en PowerPoint** openen de .docx en .pptx direct. Op een computer
  zonder Pure Minds Sans vervangt PowerPoint het lettertype; installeer dan de
  bestanden uit `assets/fonts/` (Word heeft ze al in het bestand).
- **Google Docs en Google Slides:** upload het Word- of PowerPoint-bestand in
  Google Drive, open het, en kies *Bestand → Opslaan als Google Documenten*
  (of *Google Presentaties*). Google kent Pure Minds Sans niet en kiest
  een ander lettertype; kies daar zo nodig Open Sans (dezelfde vormen).
  Een knop die het bestand rechtstreeks in Drive zet is
  mogelijk, maar vraagt een OAuth-koppeling met de Google Workspace.
- **Wat anders is dan de PDF:** het slidenummer in PowerPoint toont "3" in
  plaats van "03 / 06" (PowerPoint kent geen veld voor het totaal), en Word
  toont ook op een document van één pagina "pagina 1 van 1".
- **Zeshoek-bullets** zijn het teken ⬢ in Segoe UI Symbol (Windows), zodat
  een opsomming een opsomming blijft; op andere systemen kiest het programma
  een vergelijkbaar lettertype.
- De .pptx wordt zonder bibliotheek geschreven (`js/shared/pptx-writer.js`):
  master met achtergrond, tekstvakken met alinea-opmaak, zeshoeken als eigen
  vorm (ook met foto-vulling), cirkels en lijnen met pijlpunten (de
  waardepropositie), effen vlakken (de blokken van het Business Model
  Canvas), verlopen, en het slidenummer als veld.

## Export-bibliotheken

jsPDF 4.2.1, svg2pdf.js 2.8.1, docx 9.7.1 (Word), JSZip 3.10.1
(PowerPoint, zips) en pdf-lib 1.17.1 (de lagen in het brandbook) komen van
jsDelivr, met een vaste versie en SRI-hash (`js/shared/core.js`). Ze worden
pas geladen bij de eerste export, dus bewerken werkt ook zonder internet.

## Maken met AI

Ruwe content (notities, een transcript, een oude blog, losse ideeën) wordt in één keer een ingevulde
presentatie, Instagram-post of e-mail, in de huisstijl. Claude Opus doet het schrijfwerk. De makers blijven
de editor: de AI vult hun velden, en daarna pas je alles gewoon aan.

- **Starten:** in elke maker zit het paneel **AI** (het icoon met de sterretjes in de rail). Plak de content,
  zet er eventueel een wens bij ("voor ondernemers, hoogstens 8 slides") en klik op *maak met AI*.
- **Foto's:** de AI geeft per fotoplek zoektermen; de server zoekt bij **Unsplash** (`uploads/api/photos.js`,
  sleutel `UNSPLASH_ACCESS_KEY` in Vercel; Pexels als reserve) en de maker zet de beste foto er meteen in: op
  de post (bij een carousel de eerste slide, als achtergrond), op de slides met een fotoplek, en in de
  fotoblokken van een mail (daar op de link van Unsplash, zoals hun regels vragen). Onder *Foto zoeken* in het
  paneel AI kies je met één klik een andere; de fotograaf staat erbij. Unsplash heeft een gratis licentie, ook
  zakelijk, zonder naamsvermelding in je post of mail; willekeurige foto's van internet niet (auteursrecht).
- **Altijd JSON:** de server (`uploads/api/generate.js`) geeft Claude één tool met een vast schema
  (`uploads/lib/ai.js`: `vul_presentatie`, `vul_post`, `vul_mail`) en laat hem alleen daarmee antwoorden.
  Opus 5.5 denkt eerst na en staat dan geen gedwongen tool toe; antwoordt hij toch in tekst, dan vraagt de
  server het één keer opnieuw. Structured outputs van Anthropic kan niet: voor deze schema's "te complex". De maker zet de JSON in zijn eigen toestand: slides met layout, titel,
  punten, tabel en **sprekersnotities**; een post of carousel met **caption, hashtags en een fotosuggestie**
  (`state.social`); een mail met **onderwerp**, voorvertoning en blokken. Foto's kiest de mens. De AI zegt
  welke passen, en een mail begint met foto's uit de fotobank.
- **Aanpassen:** in het paneel AI zeg je wat er anders moet ("korter", "formeler", of eigen woorden), voor
  alles of alleen de open slide of het open blok (`target`: dan krijgt Claude het schema van één element).
  Wat je zelf schreef, blijft zoveel mogelijk staan. Met de hand aanpassen kan altijd, en ongedaan maken
  werkt voor elke AI-stap.
- **Bewaren:** vanzelf, in de bieb van het team. Maken met AI begint een nieuw ontwerp: wat er open stond,
  gaat eerst nog de bieb in en blijft staan (de melding heeft *terug naar vorige*). Tijdens het invullen
  schrijft de bieb niets weg (`lib.pause()`), daarna wordt het ingevulde een eigen ontwerp (`lib.fork()`) (`PM.ai.keepSaved`, een debounce), tot je een ander ontwerp opent of opnieuw begint.
- **Sprekersnotities:** elk slide heeft ze (Inhoud, onderaan). Ze staan niet op de slide, maar komen in de
  PowerPoint (en Google Slides) bij Notities. Zonder notities blijft het .pptx-bestand precies zoals het was.
- **Een voorstel of positionering** heeft zijn eigen formulier en vaste opbouw. Maken met AI wisselt eerst
  naar de gewone presentatie (het voorstel blijft bewaard bij Soort). Aanpassen met AI kan alleen bij een
  gewone presentatie.
- **Prompts:** de technische regels en schema's staan in de repo; hoe Pure Minds schrijft (tone of voice, wat
  een goede slide, post of mail is) staat alleen in Vercel (`AI_PROMPT*`, zie `uploads/README.md`). De sleutel
  van Anthropic ook.

## Nieuwsbrief Maker

Nieuwsbrieven en mails in de huisstijl, zonder HTML te kennen
(`tools/nieuwsbrief.html`). Je mail bestaat uit blokken onder elkaar; je past
alleen tekst, foto's, iconen en links aan. De HTML komt uit
`js/newsletter/email.js` en bouwt voort op `email/pure-minds-email.html`.

- **Kop:** logo met de *naam bovenaan* groot ernaast (een nieuwsbrief heet
  "Nieuwsbrief.", met de maand als *editie* eronder; een korte mail heeft
  alleen het logo). Aanpassen bij *Mail*, of klik op de kop in de preview.
  "Bekijk deze e-mail online" staat klein boven de mail.
- **Voet (vast):** logo, contact (adres, telefoon, mail, site) met de socials
  eronder in dezelfde kolom, Emerce 100 en afmelden. Het adres opent Google
  Maps.
- **Donkere modus:** het logo is altijd doorzichtig, nooit gevuld en zonder vlak
  erachter (brandbook). Kop en voet staan daarom op Inkt met het witte logo
  (`email/img/logo-wit.png`). Apple Mail en iOS houden de mail licht
  (`color-scheme: light only`); Gmail op Android en Outlook maken alleen lichte
  vlakken donker, dus Inkt blijft Inkt. Gmail op de iPhone keert ook donkere
  vlakken om, maar geen achtergrondafbeelding: daarom ook
  `background-image: linear-gradient(#303030, #303030)`. Witte tekst op Inkt
  houdt in Gmail zijn kleur met twee lagen `mix-blend-mode` (screen en
  difference, alleen via `u + #body`); de naam bovenaan is cyaan en heeft dat
  niet nodig.
- **Preview:** *computer* of *telefoon*, en *licht*, *donker* of *omgekeerd*.
  Donker doet Gmail op Android en Outlook na (lichte vlakken donker, donkere
  tekst en lijnen licht), omgekeerd Gmail op de iPhone (alles omgedraaid);
  plaatjes blijven zoals ze zijn. Alleen in de preview, niet in de HTML.
- **Typografie:** één schaal (`PMEmail.TYPE`). H1 36/42 ExtraBold alleen in de
  opening, H2 24/30 Bold boven elk blok, H3 18/24 Bold per punt, p 16/26 voor
  alle lopende tekst, labels 13 px in hoofdletters. Echte `h1`–`h3`- en
  `p`-tags, met margin 0.
- **Blokken uit elkaar:** elke tussenkop heeft een cyaan streepje erboven, en
  twee tekstblokken na elkaar krijgen een lijn ertussen. Overal 40 px ruimte.

- **Blokken:** opening (kop, intro, magenta hoofdknop), foto, tekst, foto en
  tekst (foto links, rechts of boven de tekst), punten (twee tot vijf, met een
  zeshoek of icoon; naast elkaar in kolommen of onder elkaar met het icoon
  links), resultaat en afsluiter (rustige knop). Achter de foto van Foto en
  Foto en tekst kan een link: dan is de foto klikbaar. Toevoegen bij
  *Blokken* (onder het open blok), verschuiven, kopiëren en weggooien op het
  kaartje. Hoogstens 30 blokken.
- **Omzetten zonder overtypen** (`PMEmail.convert`): een tekstblok krijgt met
  *foto erbij* in één klik een foto links, rechts of boven; *foto weghalen*
  maakt er weer een tekstblok van; een fotoblok krijgt met *tekst erbij* tekst
  onder de foto. Tekst, link en foto blijven staan.
- **Foto kiezen:** één venster met een eigen foto uploaden, online zoeken
  (Unsplash, zoekwoorden uit de kop van het blok) en de foto's van Pure Minds.
  Een foto van Unsplash snijdt Unsplash zelf bij in de gekozen vorm.
- **Tekst:** `**vet**`, `{voornaam}` (Brevo: `{{ contact.FIRSTNAME }}`, anders
  "beste lezer"; een begroeting vooraan zoals "Hoi {voornaam}" wordt een
  als-dan-regel van Brevo: met naam "Hoi Jelger", zonder naam "Beste lezer"),
  `[tekst](link)` en een witregel voor een nieuwe alinea. Koppen
  krijgen vanzelf de cyaan punt, tekstlinks een pijl.
- **Links:** alleen https, mailto en tel; `www.…`, een e-mailadres of een
  telefoonnummer wordt vanzelf goed. Een link die niet klopt krijgt een oranje
  rand en komt niet in de mail. Links zijn schoon: UTM-codes (`utm_…`) gaan
  eraf. Zet in Brevo ook de Google Analytics-tracking uit, anders zet Brevo bij
  het versturen `?utm_source=brevo` achter elke link (zie de handleiding).
- **Foto's en iconen:** een mail toont alleen plaatjes die online staan. Een
  foto wordt in de browser verkleind tot 1200 px breed (of bijgesneden:
  liggend, breed, vierkant) en gaat naar de [upload-service](uploads/README.md)
  (Vercel Blob); de link komt in de HTML. Iconen komen uit de Icon Finder: wit
  lijnicoon in een cyaan zeshoek, als PNG van 105 × 120 (getoond op 35 × 40).
  Zonder upload-service werken de fotobank (de foto's van het brandbook, al
  online) en een link naar een foto die al online staat. Het adres van de
  server staat in `js/shared/service.js` (`DEFAULT_SERVICE_URL`); je
  inlog gaat vanzelf mee.
- **Naar Brevo:** *kopieer html* (Ctrl + S) of *download .html*. Eerst een
  controle: voorbeeldtekst, de voorvertoningstekst, links en foto's die niet
  online staan, en de grootte (Gmail knipt vanaf 102 KB). Nooit tegenhouden.
  De [handleiding](tools/brevo-handleiding.html) legt stap voor stap uit hoe
  je de HTML in een campagne plakt, test en verstuurt.
- **Opslaan:** vanzelf in de bieb van het team, met een kopie in deze browser (`pm-newsletter-v1`).

## E-mailtemplate (Brevo)

`email/pure-minds-email.html` is de huisstijl-template voor e-mails in Brevo
(nieuwsbrief, aankondiging, uitnodiging). De plaatjes staan in `email/img/` en
laden van het GitHub-account van Pure Minds; de foto's in het voorbeeld komen
uit `assets/styleguide/photos/`.

- **Makkelijker:** maak je mail in de [Nieuwsbrief Maker](#nieuwsbrief-maker);
  deze template is de basis daarvan. De maker is verder: naam bovenaan, één
  typeschaal en lijnen tussen de blokken staan alleen daarin.
- **In Brevo zetten:** Marketing → Templates → Create template → Email
  template → Add content → Start from scratch → HTML custom code. Plak de hele
  inhoud van het bestand en sla op (Save & quit).
  Stuur jezelf eerst een test (Preview & test) en kijk in Gmail en Outlook.
- **Blokken:** alles staat tussen `<!-- BLOK: … -->` en `<!-- EINDE BLOK -->`:
  kop met logo, opening op Inkt met de magenta hoofdknop, foto, tekst met
  tussenkop, foto naast tekst, drie punten met een cyaan zeshoek, resultaat
  (zoals de case-post), afsluiter met een rustige knop en de voet. Dupliceer de
  template per mailing en verwijder of kopieer blokken; kop en voet blijven.
- **Huisstijl:** Inkt voor tekst, cyaan alleen als accent (op wit nooit als
  tekst), één magenta knop per mail. Pure Minds Sans waar de mailapp dat kan
  (Apple Mail, iPhone), anders Open Sans, anders Arial.
- **Brevo-codes:** `{{ contact.FIRSTNAME }}` (voornaam, met "Beste lezer" als hij
  ontbreekt), `{{ mirror }}` (bekijk online), `{{ unsubscribe }}` (afmelden,
  verplicht) en `{{ update_profile }}`.
- **Eigen foto's:** 1200 px breed (scherp op retina), in Brevo uploaden of op
  een vaste plek online zetten, en de `src` vervangen. Een `alt` erbij.
- **Werkt overal:** tabellen en inline stijlen; de knoppen werken ook in
  Outlook (VML) en de kolommen staan op een telefoon onder elkaar. Ongeveer
  27 KB: ruim onder de grens waarboven Gmail een mail afknipt (102 KB).

## E-mailhandtekeningen

De handtekeningen van alle collega's staan in `handtekeningen/`, online op
https://puremindsmarketinggroup.github.io/Pure-Minds-Tool-Hub/handtekeningen/.
Daar klikt een collega op zijn of haar naam, kopieert de handtekening (Ctrl + A,
Ctrl + C) en plakt hem in Gmail of Outlook; de stappen staan op de pagina. De
foto, de iconen, het logo en de Emerce-badge laden van dit adres
(`assets/handtekeningen/`), omdat Gmail geen plaatjes uit een map op je computer
kan gebruiken. Zoekmachines slaan de pagina's over (`noindex`).

- **Alles in de body gaat mee bij het kopiëren.** Zet in een handtekening dus
  niets extra's (geen knop, geen uitleg); alleen de `<head>` blijft achter.
- **Een collega erbij:** kopieer een bestaande pagina (bijvoorbeeld
  `jim-vleugels.html`) naar `voornaam-achternaam.html` en pas naam, e-mail,
  dagen en de `utm_source` (`mailvoornaam`) aan. Zet de foto als PNG van
  318 × 360 px in `assets/handtekeningen/foto-voornaam.png` (wordt getoond op
  106 × 120) en voeg de naam toe aan de lijst in `handtekeningen/index.html`.
- **Een plaatje vervangen:** Gmail bewaart plaatjes lang. Verhoog dan het getal
  achter `?v=` in de handtekeningen, zodat het nieuwe plaatje laadt, en laat
  de collega's de handtekening opnieuw plakken.
- **Een collega weg:** haal de pagina en de naam uit de lijst, maar laat de
  foto in `assets/handtekeningen/` staan: verstuurde e-mails tonen hem nog.

## Opslag

Alles wat je maakt, gaat **vanzelf** de bieb van het team in (Supabase), zoals in Canva of Google
Docs. Je browser houdt daarnaast een kopie van wat er open staat (`localStorage` en, voor
afbeeldingen, IndexedDB): zo werkt een maker ook even zonder verbinding.

### De bieb

- **Vanzelf opslaan** (`js/shared/library.js`): elke wijziging, ook ongedaan maken, staat binnen een
  paar seconden in de bieb. Rechtsboven in de appbalk staat hoe het ervoor staat (`#libSave`):
  *opgeslagen*, *opslaan…*, *offline* (je werk blijft in de browser en gaat mee zodra er weer verbinding
  is) of *niet opgeslagen* (nog een poging volgt vanzelf). Een klik slaat meteen op.
- **Nieuw beginnen** (een starttegel op het dashboard, *nieuwe post*, *nieuw document*, *nieuwe
  presentatie*, maken met AI) begint een nieuw ontwerp. Het vorige blijft gewoon in de bieb; de melding
  heeft *terug naar vorige*. Een nieuw, onaangeraakt ontwerp komt pas in de bieb bij de eerste echte
  wijziging (geen lege ontwerpen). Werk van vóór het vanzelf opslaan dat nog nooit in de bieb stond, gaat
  er bij nieuw beginnen eerst in.
- **De presentatie** heeft per soort (presentatie, voorstel, positionering) een eigen ontwerp. Wisselen bij
  *Soort* is geen wijziging; de soort waar je naartoe gaat, komt in de nieuwste versie.
- **Openen** (`?bieb=<id>`, de lijst onder **bieb**, het dashboard of `bieb.html`) haalt altijd de
  nieuwste versie. Werkte een collega intussen aan het open ontwerp, dan komt die versie vanzelf (alleen
  als je zelf niets onopgeslagen hebt).
- **Tegelijk aan hetzelfde ontwerp:** wie het ontwerp open heeft, staat in de database (`editing_by`,
  elke 45 seconden). Opent een collega het, dan ziet die *Jim heeft dit open* in de appbalk. Slaan jullie
  toch allebei op, dan overschrijft niemand iets: opslaan controleert de versie (`updated_at`), en wie
  later opslaat, krijgt zijn versie als kopie (*… (jouw versie)*) met een melding.
- **Eerdere versies:** de database bewaart zelf een versie (tabel `design_versions`), hoogstens elke 10
  minuten en altijd voordat een collega het aanpast; de nieuwste 50 per ontwerp. Terugzetten (menu ⋯ bij
  een ontwerp → *eerdere versies*) maakt van wat er nu staat ook eerst een versie.
- **Prullenbak:** weggooien (menu ⋯) zet een ontwerp in de prullenbak, voor het hele team en met *ongedaan
  maken*. Op `bieb.html` → *prullenbak* staat wie het weggooide, en zet je het terug. Na 30 dagen ruimt de
  bieb het op, met de bestanden.
- **Een tweede bieb achter de schermen:** elke nacht om 2:30 kopieert de database alles wat die dag
  veranderde naar `designs_backup` (60 dagen, `pg_cron`). Niemand in de hub ziet die tabel of kan eruit
  weggooien; terughalen gaat met SQL in Supabase. Zo is er nog iets, ook na de prullenbak.
- **Alle ontwerpen** (`bieb.html`, en *bieb* in de kop van elke pagina): zoeken op titel, klant of
  collega, per tool, *van mij*, en per ontwerp openen, naam wijzigen, kopie maken, eerdere versies en naar de
  prullenbak. Het dashboard toont per maker de laatste drie en, op een andere computer, *verder waar je
  was* (je laatst bewerkte ontwerp).
- **Opslag:** tabel `designs` (de toestand van de maker, titel, eigen naam, miniatuur, wie en wanneer),
  de bestanden in de opslag `designs` als `<id>/<sleutel>`. Openen zet ze in de IndexedDB van je browser,
  onder dezelfde sleutel. De lijst staat ook in `localStorage` (`pm-designs-v1`, zonder miniaturen;
  die staan per versie in IndexedDB). Uitloggen haalt de lijst weg.
- **Uit de oude bieb:** wat er nog in de bieb van alleen je browser stond (`pm-library-v1`, van vóór het
  inloggen), verhuist de eerste keer vanzelf naar de bieb van het team.
- **Een maker koppelen:** knoppen `#libSave` (status) en `#libBtn` met `#libPop` in de appbalk, en
  `PM.library.attach({ tool, slot?, getState, fileKeys, apply, thumb?, close, openId, versionId, fresh? })`.
  Roep `touch()` bij elke wijziging (ook in de `restore` van ongedaan maken), `detach()` vóór een nieuw
  ontwerp en zet het nieuwe in `hold(fn)`, en `autoSave()` na een download. Een nieuwe maker moet ook in
  de lijst van tools in `supabase/teambieb.sql` (`designs.tool`).

Vervang je een logo in `assets/brand/`, draai dan `npm run brand`.

## Inloggen

De hub is alleen voor het team. Elke pagina heeft in de `<head>` een deur
(`js/shared/account.js`): zonder sessie in je browser ga je meteen naar
`login.html`, en na het inloggen terug naar waar je was. Rechtsboven in de kop
staat wie er ingelogd is, met **uitloggen**. De e-mailtemplate (`email/`) en de
handtekeningen (`handtekeningen/`) hebben geen deur: die staan in verstuurde
mails.

- **Supabase** (project `PureMindsMarketingGroup`, eu-west-1, gratis) doet het
  inloggen, de database en de opslag van de bieb. De hub praat er rechtstreeks
  mee via supabase-js (jsDelivr, vaste versie met SRI-hash).
- **Account maken:** zelf, op de inlogpagina, met je e-mailadres van het werk
  en een wachtwoord van minstens 10 tekens. Daarna een mail om het adres te
  bevestigen. Alleen adressen op de **teamlijst** (tabel `team`) kunnen een
  account maken; een ander adres krijgt *staat niet op de teamlijst*.
  **Wachtwoord vergeten** stuurt een link om een nieuw te kiezen.
- **Een collega toevoegen of weghalen:** Supabase → *Table Editor* → `team`
  (e-mailadres in kleine letters, en de naam die de bieb toont). Weghalen uit
  `team` sluit iemand meteen buiten de bieb en de server; het account zelf
  verwijder je bij *Authentication* → *Users*.
- **Beveiliging:** de echte deur zit in de database. Row Level Security laat
  alleen een ingelogde collega van de teamlijst lezen of schrijven, ook in de
  opslag van de bestanden. Wie en wanneer zet de database zelf. De server van
  de hub (AI, foto's uploaden en zoeken) vraagt Supabase bij elk verzoek of het
  inlogbewijs van een teamlid is (`uploads/lib/team.js`). De code van de hub
  zelf is openbaar (deze repo, GitHub Pages); de publieke sleutel in
  `account.js` geeft zonder inloggen nergens toegang toe.
- **Mails:** via Brevo (SMTP), in het Nederlands en in de huisstijl
  (`scripts/setup-supabase.mjs`). Zonder eigen mailserver stuurt Supabase alleen
  naar leden van de organisatie in Supabase.
- **Instellen of bijwerken:** zet in `.env.local` (nooit in de repo)
  `SUPABASE_ACCESS_TOKEN` (supabase.com → *Account* → *Access Tokens*),
  `BREVO_SMTP_LOGIN`, `BREVO_SMTP_KEY` en `MAIL_FROM`, en draai
  `npm run supabase`. Dat zet de database (`supabase/teambieb.sql`), de
  adressen van de hub, de wachtwoordregel, de mailserver en de mails. Opnieuw
  draaien kan altijd.
- **Wakker blijven:** een gratis Supabase-project slaapt na 7 dagen zonder
  verkeer. De server van de hub roept het elke ochtend aan
  (`uploads/api/keepalive.js`, een cron in `uploads/vercel.json`).
- **Ruimte:** de gratis versie heeft 1 GB voor bestanden en 500 MB database.
  Ontwerpen zijn klein (de foto's verkleind); kijk eens per kwartaal in Supabase onder *Usage*. Wordt
  het krap, ruim dan oude ontwerpen op via `bieb.html` of stap over op Pro (dan ook dagelijkse backups
  van Supabase zelf).
