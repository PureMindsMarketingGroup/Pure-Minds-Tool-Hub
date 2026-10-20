# Upload-service van de Nieuwsbrief Maker

Een e-mail kan alleen plaatjes tonen die online staan. Deze kleine service zet de foto's en iconen uit de
Nieuwsbrief Maker (`tools/nieuwsbrief.html`) in **Vercel Blob**: de maker verkleint een foto tot 1200 px breed,
stuurt hem hierheen en krijgt een vaste, openbare link terug. Die link komt in de HTML die je in Brevo plakt.

- `api/upload.js`: de functie (`GET` = status, `POST` = uploaden)
- `lib/check.js`: de controles: wachtwoord, alleen JPG en PNG, hoogstens 4 MB, alleen vanaf de Tool Hub
- `public/index.html`: een korte uitleg als iemand de link opent

Alleen wie het wachtwoord kent, kan uploaden. Lezen kan iedereen met de link: zo werkt een plaatje in een mail.

## Eenmalig instellen (ongeveer 5 minuten)

Doe dit met het Vercel-account van Pure Minds, niet met een persoonlijk account.

1. **Project maken.** Vercel → *Add New…* → *Project* → importeer de repo
   `PureMindsMarketingGroup/Pure-Minds-Tool-Hub`.
2. **Root Directory** → *Edit* → kies de map `uploads`. Framework Preset: *Other*. Verder niets aanpassen.
   Geef het project een herkenbare naam, bijvoorbeeld `pm-nieuwsbrief-uploads`, en klik *Deploy*.
3. **Opslag koppelen.** Open het project → tab *Storage* → *Create Database* → **Blob** → naam bijvoorbeeld
   `nieuwsbrief-fotos` → *Create* en koppel hem aan dit project (alle omgevingen). Vercel zet dan zelf
   `BLOB_READ_WRITE_TOKEN` klaar.
4. **Wachtwoord.** *Settings* → *Environment Variables* → nieuwe variabele `APP_PASSWORD` met een wachtwoord
   dat je met je collega's deelt (minstens 12 tekens). Opslaan.
5. **Opnieuw deployen.** Tab *Deployments* → de bovenste → *…* → *Redeploy*. Pas dan gelden opslag en wachtwoord.
6. **Testen.** Open `https://<jouw-project>.vercel.app/api/upload`. Je ziet
   `{"ok":true,"blob":true,"password":true}`: alles staat klaar.
7. Geef de link (`https://<jouw-project>.vercel.app/api/upload`) door: hij komt als `UPLOAD_URL` bovenin
   `js/newsletter/app.js`.

Elke collega vult het wachtwoord één keer in, bij de eerste upload. De browser onthoudt het.

## Goed om te weten

- **Gratis tegoed.** Het Hobby-tegoed van Vercel Blob is ruim genoeg voor nieuwsbrieven: een foto is na
  verkleinen meestal 100 tot 250 KB, en Gmail en Outlook bewaren plaatjes zelf (ze halen ze niet bij elke lezer
  opnieuw op). Kijk bij twijfel onder *Usage* in Vercel.
- **Niets weggooien wat al verstuurd is.** Een foto die in een verstuurde mail staat, moet online blijven,
  anders ziet de lezer een leeg vlak. Ruim de opslag (*Storage → Blob → Browser*) dus alleen op als je zeker weet
  dat een bestand nergens meer in staat.
- **Wachtwoord wijzigen.** Pas `APP_PASSWORD` aan en doe *Redeploy*. Collega's krijgen bij hun volgende upload
  de vraag om het nieuwe wachtwoord.
- **Vercel bouwt bij elke push opnieuw.** Het project hangt aan de hele repo; een push naar de hub geeft dus ook
  hier een nieuwe deploy. Dat kost niets en duurt een paar seconden.
