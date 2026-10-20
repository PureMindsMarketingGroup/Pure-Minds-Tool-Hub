# Server van de Tool Hub (Vercel)

De hub zelf staat op GitHub Pages en heeft geen server. Twee dingen hebben er wel een nodig. Die draaien
samen in één Vercel-project: deze map `uploads/`.

1. **Foto's en iconen online zetten** voor de Nieuwsbrief Maker (`api/upload.js`). Een e-mail kan alleen
   plaatjes tonen die online staan. De maker verkleint een foto tot 1200 px breed en stuurt hem hierheen. Hij
   komt in **Vercel Blob**, en er komt een vaste, openbare link terug voor in de HTML.
2. **De AI** (`api/generate.js`): Claude Opus maakt van ruwe content een presentatie, Instagram-post of
   e-mail. Passende foto's zoekt `api/photos.js` bij **Unsplash** (gratis licentie, ook zakelijk; Pexels als
   reserve). Het antwoord is altijd JSON volgens een vast schema (`lib/ai.js`), en de maker zet die JSON in zijn
   eigen velden. Zie [Maken met AI](../README.md#maken-met-ai).

Bestanden:

- `api/upload.js`: foto's (`GET` = status, `POST` = uploaden)
- `api/generate.js`: de AI (`GET` = status, `POST` = maken of aanpassen)
- `api/photos.js`: foto's zoeken (`GET` = status, `GET ?q=` = zoeken, `GET ?track=` = download melden bij Unsplash)
- `lib/photos.js`: de zoekvraag en het antwoord van Unsplash en Pexels (alleen foto's van hun eigen beeldserver)
- `lib/check.js`: alleen vanaf de Tool Hub, alleen JPG en PNG, hoogstens 4 MB (en een wachtwoord als dat is ingesteld)
- `lib/ai.js`: de JSON-schema's per formaat, de technische regels en het verzoek aan Claude
- `vercel.json`: de AI mag 300 seconden duren (een grote presentatie duurt een minuut of twee)
- `public/index.html`: een korte uitleg als iemand de link opent

Er is geen wachtwoord: de server accepteert alleen verzoeken vanaf de Tool Hub
(`puremindsmarketinggroup.github.io`), met een rem per kwartier. Wil je later toch een wachtwoord, zet dan
`APP_PASSWORD` in Vercel. De hub vraagt het dan vanzelf, één keer per browser. Een foto kan iedereen met de link
lezen: zo werkt een plaatje in een mail.

**Zet een maandlimiet bij Anthropic** (console.anthropic.com → *Settings* → *Limits*). Zonder wachtwoord is het
adres van de AI in principe door iedereen te gebruiken die het vindt; de limiet houdt de kosten in de hand.

## Instellen

Het project heet **Pure-Minds-Tool-Hub** (team Pure Minds) en staat op `https://pure-minds-tool-hub.vercel.app`.
De hub gebruikt dat adres al (`js/shared/service.js`).

1. **Root Directory:** zet hem bij *Settings* → *Build and Deployment* op **`uploads`**. Staat hij op `./`, dan
   zet Vercel alleen een kopie van de hub online. `/api/upload` en `/api/generate` geven dan 404.
2. **Opslag:** *Storage* → *Create* → **Blob**, en koppel hem aan dit project. Vercel zet
   `BLOB_READ_WRITE_TOKEN` dan zelf klaar.
3. **Environment Variables** (*Settings*):
   - `APP_PASSWORD` (optioneel): alleen als je een wachtwoord wilt; collega's vullen het dan één keer in
   - `ANTHROPIC_API_KEY`: de API-sleutel van Anthropic. Alleen hier invullen, nooit in de code of in een chat.
   - `AI_PROMPT`, `AI_PROMPT_PRESENTATIE`, `AI_PROMPT_INSTA`, `AI_PROMPT_EMAIL`: hoe Pure Minds schrijft
     (tone of voice, en wat een goede slide, post of mail is). Deze teksten staan bewust niet in deze openbare
     repo, maar in *vercel-instellingen* bij de beheerder. Ontbreken ze, dan werkt de AI met een korte, neutrale
     reserve uit `lib/ai.js`.
   - `UNSPLASH_ACCESS_KEY`: de *Access Key* van Unsplash voor foto's (gratis: unsplash.com/developers →
     *Your apps* → *New Application*). Zonder deze sleutel werkt de AI gewoon, maar dan zonder foto's.
     Om te beginnen 50 zoekvragen per uur; vraag voor meer *Apply for Production* aan in Unsplash (1.000 per
     uur). De kiezer noemt al de fotograaf en Unsplash, zoals hun regels vragen.
   - `PEXELS_API_KEY` (reserve): wordt alleen gebruikt als er geen sleutel van Unsplash is. Pexels geeft sinds
     oktober 2026 geen nieuwe sleutels uit.
   - Optioneel `AI_MODEL` (standaard `claude-opus-5-5`).
4. **Redeploy:** *Deployments* → de bovenste → *…* → *Redeploy*. Pas dan gelden de instellingen.
5. **Testen:** `/api/upload` geeft `{"ok":true,"blob":true,...}`, `/api/generate` geeft
   `{"ok":true,"ai":true,...}` en `/api/photos` geeft `{"ok":true,"photos":true}`.

## Goed om te weten

- **Kosten.** Het Hobby-tegoed van Vercel Blob is ruim genoeg voor nieuwsbrieven. Een foto is na verkleinen
  meestal 100 tot 250 KB, en Gmail en Outlook bewaren plaatjes zelf. De AI kost per opdracht tegoed bij
  Anthropic, voor een grote presentatie met Opus hooguit enkele tientallen centen. Kijk bij twijfel onder *Usage* (Vercel) en
  *Billing* (Anthropic).
- **Rem.** Hoogstens 60 uploads, 40 AI-opdrachten en 120 zoekvragen naar foto's per kwartier per adres.
  Unsplash zelf staat 50 zoekvragen per uur toe (na goedkeuring 1.000); een zoekvraag wordt 10 minuten bewaard.
- **Regels van Unsplash:** de kiezer noemt fotograaf en Unsplash met een link; in een mail blijft de foto op
  de link van Unsplash (geen kopie); en elke gebruikte foto meldt een download. Dat regelt de hub zelf.
- **Niets weggooien wat al verstuurd is.** Een foto in een verstuurde mail moet online blijven, anders ziet de
  lezer een leeg vlak. Ruim de opslag (*Storage → Blob → Browser*) alleen op als je zeker weet dat een bestand
  nergens meer in staat.
- **Wachtwoord aan of uit:** zet of verwijder `APP_PASSWORD` en doe *Redeploy*. Staat het aan, dan vraagt de
  hub het bij de volgende upload of AI-opdracht (en opnieuw als het verandert).
- **Prompts aanpassen:** wijzig de waarde in Vercel, *Save* en *Redeploy*. Aan de code hoeft niets te
  veranderen.
- **Vercel bouwt bij elke push opnieuw.** Het project hangt aan de hele repo, dus een push naar de hub geeft
  ook hier een nieuwe deploy. Dat kost niets en duurt een paar seconden.
