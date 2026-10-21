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
- `lib/check.js`: alleen vanaf de Tool Hub, alleen JPG en PNG, hoogstens 4 MB
- `lib/team.js`: alleen een ingelogde collega van de teamlijst (vraagt het aan Supabase, zie hieronder)
- `api/keepalive.js`: houdt Supabase wakker (elke ochtend, de cron in `vercel.json`)
- `lib/ai.js`: de JSON-schema's per formaat, de technische regels en het verzoek aan Claude
- `vercel.json`: de AI mag 300 seconden duren (een grote presentatie duurt een minuut of twee), en de cron
  van `api/keepalive.js`
- `public/index.html`: een korte uitleg als iemand de link opent

**Alleen voor het team.** De hub stuurt bij elk verzoek het inlogbewijs mee van de collega die ingelogd is
(`Authorization: Bearer …`, zie [Inloggen](../README.md#inloggen)). De server vraagt Supabase of dat bewijs geldt
en of die collega op de teamlijst staat (`lib/team.js`, een goed antwoord blijft vijf minuten onthouden). Verder
alleen vanaf de Tool Hub (`puremindsmarketinggroup.github.io`), met een rem per kwartier. De status (`GET` zonder
zoekvraag) kan zonder inloggen: die verklapt niets. Een foto kan iedereen met de link lezen: zo werkt een plaatje
in een mail.

**Zet toch een maandlimiet bij Anthropic** (console.anthropic.com → *Settings* → *Limits*): een vangnet voor als
er iets misgaat.

## Instellen

Het project heet **Pure-Minds-Tool-Hub** (team Pure Minds) en staat op `https://pure-minds-tool-hub.vercel.app`.
De hub gebruikt dat adres al (`js/shared/service.js`).

1. **Root Directory:** zet hem bij *Settings* → *Build and Deployment* op **`uploads`**. Staat hij op `./`, dan
   zet Vercel alleen een kopie van de hub online. `/api/upload` en `/api/generate` geven dan 404.
2. **Opslag:** *Storage* → *Create* → **Blob**, en koppel hem aan dit project. Vercel zet
   `BLOB_READ_WRITE_TOKEN` dan zelf klaar.
3. **Environment Variables** (*Settings*):
   - `SUPABASE_URL` en `SUPABASE_PUBLISHABLE_KEY` (optioneel): staan al in `lib/team.js` (ze zijn openbaar);
     alleen nodig als de hub ooit naar een ander Supabase-project verhuist
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
- **Wie mag:** de teamlijst in Supabase (tabel `team`). Weghalen uit de lijst sluit iemand binnen vijf minuten
  ook hier buiten.
- **Prompts aanpassen:** wijzig de waarde in Vercel, *Save* en *Redeploy*. Aan de code hoeft niets te
  veranderen.
- **Vercel bouwt bij elke push opnieuw.** Het project hangt aan de hele repo, dus een push naar de hub geeft
  ook hier een nieuwe deploy. Dat kost niets en duurt een paar seconden.
