/* =============================================================================
   ai.js — de AI van de Tool Hub: van ruwe content naar de velden van een maker
   (getest in tests/ai.test.js, zonder netwerk)
   -----------------------------------------------------------------------------
   Claude (Opus) krijgt ruwe content (notities, een transcript, losse ideeën)
   en vult daarmee een presentatie, een Instagram-post of een e-mail. Het
   antwoord is altijd JSON volgens een vast schema: we geven Claude één tool
   (vul_presentatie, vul_post of vul_mail) en dwingen hem die te gebruiken
   (tool_choice). De maker zet die JSON in zijn eigen velden.

     FORMATS                       presentatie, insta, email: tool, schema, element
     buildRequest(input, env)      de body voor POST /v1/messages
     readResponse(format, body)    { data } of { error } uit het antwoord van Claude
     checkInput(input)             { ok } of { ok: false, status, error }

   Twee soorten verzoeken:
     maken      content -> het hele schema
     aanpassen  instruction + current (het huidige ontwerp als JSON), en
                optioneel target (één slide of blok): dan alleen dat element

   Wat Claude schrijft (tone of voice, hoe een goede slide of mail eruitziet)
   staat NIET in deze openbare repo maar in Vercel: AI_PROMPT (algemeen) en
   AI_PROMPT_PRESENTATIE, AI_PROMPT_INSTA, AI_PROMPT_EMAIL. Hier staan alleen
   de technische regels en de schema's (welke velden, hoe lang).
   ============================================================================= */

export const MODEL = 'claude-opus-5-5';
export const MAX_CONTENT = 60000;      // tekens ruwe content
export const MAX_CURRENT = 120000;     // tekens van het huidige ontwerp (JSON)
export const MAX_INSTRUCTION = 1000;

const str = (description, max) => ({ type: 'string', description: max ? `${description} Hoogstens ${max} tekens.` : description });
const list = (items, description, min, max) => ({ type: 'array', description, items, ...(min != null ? { minItems: min } : {}), ...(max != null ? { maxItems: max } : {}) });

/* ---------------------------------------------------------------------------
   Presentatie: de layouts van de Presentation Maker
   ------------------------------------------------------------------------- */

const SLIDE = {
  type: 'object',
  required: ['layout', 'titel', 'notities'],
  properties: {
    layout: {
      type: 'string',
      enum: ['title', 'section', 'bullets', 'split', 'quote', 'stat', 'table', 'closing'],
      description: 'title = openingsslide met foto (alleen de eerste slide). section = nieuw hoofdstuk. bullets = titel met 3 tot 6 punten. split = foto naast een korte intro en punten. quote = uitspraak van een klant of expert. stat = één kerncijfer met uitleg. table = rijen en kolommen. closing = afsluiter met contact (alleen de laatste slide).',
    },
    label: str('Klein woord boven de titel, in kleine letters, zoals "analyse" of "aanpak". Bij title de naam van de presentatie of de klant.', 30),
    titel: str('Titel van de slide: kort en concreet, een stelling of vraag. Zet het belangrijkste woord tussen **dubbele sterretjes** voor nadruk in cyaan (hoogstens één keer). Bij quote en stat een korte titel voor intern gebruik.', 70),
    ondertitel: str('title en section: één regel onder de titel. stat: wat het cijfer betekent. table: periode of bron. closing: één uitnodigende zin.', 120),
    tekst: str('Alleen bij split: één korte inleidende zin boven de punten.', 160),
    punten: list(str('Eén punt, geen hele alinea.', 90), 'bullets en split: de punten (bullets 3 tot 6, split 2 tot 4). closing: contactregels, zoals naam, e-mail en website.', 0, 6),
    citaat: str('quote: de uitspraak, letterlijk uit de content. stat: optioneel een korte uitspraak erbij.', 180),
    bron: str('quote en stat: wie het zei of waar het cijfer vandaan komt.', 80),
    cijfer: str('Alleen bij stat: het kerncijfer, zoals "+184%" of "3x".', 12),
    tabel: list(list({ type: 'string' }, 'Een rij cellen.', 2, 5), 'Alleen bij table: de rijen, de eerste rij is de kop. Hoogstens 8 rijen en 5 kolommen.', 2, 8),
    notities: str('Sprekersnotities: wat de spreker bij deze slide vertelt, in 2 tot 5 zinnen, in spreektaal.', 900),
    fotoIdee: str('Bij title, split en closing: welke foto past (onderwerp en sfeer), zodat de gebruiker er een kan kiezen.', 140),
  },
};

const PRESENTATIE = {
  type: 'object',
  required: ['titel', 'slides'],
  properties: {
    titel: str('Naam van de hele presentatie, voor de bieb.', 80),
    slides: list(SLIDE, 'De slides in volgorde. Begin met title, eindig met closing. Wissel layouts af; gebruik section bij elk nieuw hoofdstuk.', 3, 20),
  },
};

/* ---------------------------------------------------------------------------
   Instagram: de templates van de Insta Post Maker, plus caption en hashtags
   ------------------------------------------------------------------------- */

const CAROUSEL_SLIDE = {
  type: 'object',
  required: ['soort', 'titel', 'tekst'],
  properties: {
    soort: { type: 'string', enum: ['hook', 'les', 'afsluiter'], description: 'hook = de eerste slide die doet swipen, les = een genummerde les of tip, afsluiter = de laatste slide met een actie.' },
    titel: str('Titel van de slide. **Dubbele sterretjes** = nadruk in cyaan (hoogstens één keer).', 70),
    tekst: str('Tekst eronder. **vet** mag; een regel die begint met "- " wordt een opsommingspunt. Kort: dit staat op een plaatje.', 220),
  },
};

const INSTA = {
  type: 'object',
  required: ['template', 'caption', 'hashtags'],
  properties: {
    template: {
      type: 'string',
      enum: ['overlay', 'blog', 'case', 'carousel'],
      description: 'overlay = foto met een kop en een zin (nieuws, aankondiging, mening). blog = aankondiging van een blog. case = klantresultaat met een cijfer. carousel = 3 tot 10 slides met lessen of stappen (kennis delen). Kies wat het best bij de content past, tenzij de gebruiker een template opgeeft.',
    },
    label: str('Klein label bovenaan in kleine letters, zoals "pure kennis", "pure blog" of "pure case".', 24),
    titel: str('overlay en blog: de kop op de post. **Dubbele sterretjes** = nadruk in cyaan (hoogstens één keer).', 90),
    ondertitel: str('Alleen overlay: één zin onder de kop.', 140),
    onderwerp: str('Alleen blog: het onderwerp in een paar woorden, zoals "conversie-optimalisatie".', 40),
    cta: str('Alleen blog: één zin die naar de blog stuurt. {onderwerp} wordt het onderwerp.', 120),
    knop: str('Alleen blog: tekst op de knop, kleine letters, zoals "lees de blog".', 20),
    klant: str('Alleen case: naam van de klant.', 40),
    diensten: list(str('Een dienst, zoals "Google Ads".', 40), 'Alleen case: 1 tot 3 diensten die Pure Minds deed.', 0, 3),
    zin: str('Alleen case: de zin met {klant} en {diensten}, zoals "Voor {klant} hebben wij {diensten} gedaan."', 120),
    resultaat: str('Alleen case: het cijfer, zoals "+184%". Alleen als het in de content staat.', 12),
    resultaatTekst: str('Alleen case: wat het cijfer betekent.', 60),
    slides: list(CAROUSEL_SLIDE, 'Alleen carousel: de slides, beginnend met een hook en eindigend met een afsluiter.', 0, 10),
    caption: str('De caption onder de post: een sterke eerste zin (die is te zien voor "meer"), dan de kern in korte alinea\'s met witregels, en een vraag of actie aan het eind. Geen hashtags in de caption.', 2000),
    hashtags: list(str('Een hashtag met #, zonder spaties.', 40), '5 tot 12 hashtags: een mix van breed en specifiek, passend bij de content.', 0, 15),
    fotoIdee: str('Welke foto past bij de post (onderwerp, sfeer, kader), zodat de gebruiker er een kan kiezen of maken.', 200),
  },
};

/* ---------------------------------------------------------------------------
   E-mail: de blokken van de Nieuwsbrief Maker
   ------------------------------------------------------------------------- */

const BLOK = {
  type: 'object',
  required: ['type'],
  properties: {
    type: {
      type: 'string',
      enum: ['opening', 'tekst', 'fototekst', 'punten', 'resultaat', 'afsluiter', 'foto'],
      description: 'opening = de eerste, donkere blok met label, kop, intro en de magenta hoofdknop (één per mail, altijd het eerste blok). tekst = tussenkop, alinea\'s en een link. fototekst = foto naast een korte tekst met link. punten = 2 of 3 korte punten. resultaat = één cijfer. afsluiter = het laatste blok met een rustige knop. foto = een foto over de hele breedte.',
    },
    label: str('opening: klein label boven de kop, zoals "Pure nieuws". resultaat: waarover het cijfer gaat, zoals "Resultaat · klantnaam".', 40),
    kop: str('De kop of tussenkop van het blok.', 90),
    tekst: str('De tekst. **vet** mag, {voornaam} wordt de voornaam van de lezer (gebruik het hoogstens in de opening, als "Hoi {voornaam},"). Een witregel begint een nieuwe alinea; houd alinea\'s kort. Een link in de tekst: [tekst](link), alleen met links uit de content.', 1200),
    knopTekst: str('opening en afsluiter: tekst op de knop, kleine letters met een werkwoord, zoals "plan een gesprek".', 30),
    knopLink: str('Link van de knop. Alleen een link uit de content, een e-mailadres of een telefoonnummer; anders leeg laten.', 300),
    linkTekst: str('tekst en fototekst: tekst van de link onder het blok, zoals "Lees verder".', 40),
    linkLink: str('De link daarvan. Alleen een link uit de content; anders leeg laten.', 300),
    punten: list({
      type: 'object',
      required: ['titel', 'tekst'],
      properties: { titel: str('Titel van het punt.', 40), tekst: str('Eén korte zin.', 160) },
    }, 'Alleen punten: 2 of 3 punten.', 0, 3),
    cijfer: str('Alleen resultaat: het cijfer, zoals "+184%". Alleen als het in de content staat.', 12),
    cijferTekst: str('Alleen resultaat: wat het cijfer betekent.', 80),
    fotoIdee: str('foto en fototekst: welke foto past, zodat de gebruiker er een kan kiezen.', 160),
    fotoKant: { type: 'string', enum: ['links', 'rechts'], description: 'Alleen fototekst: aan welke kant de foto staat. Wissel af als er meer fototekst-blokken zijn.' },
  },
};

const EMAIL = {
  type: 'object',
  required: ['onderwerp', 'voorvertoning', 'blokken'],
  properties: {
    onderwerp: str('De onderwerpregel: concreet, nieuwsgierig makend, zonder hoofdletters in elk woord.', 60),
    voorvertoning: str('De voorvertoningstekst naast het onderwerp in de inbox: vult het onderwerp aan, herhaalt het niet.', 100),
    blokken: list(BLOK, 'De blokken van boven naar beneden. Begin met opening, eindig met afsluiter.', 2, 12),
  },
};

export const FORMATS = {
  presentatie: { tool: 'vul_presentatie', name: 'presentatie', schema: PRESENTATIE, element: SLIDE, elementName: 'slide', list: 'slides', env: 'AI_PROMPT_PRESENTATIE' },
  insta: { tool: 'vul_post', name: 'Instagram-post', schema: INSTA, element: CAROUSEL_SLIDE, elementName: 'carousel-slide', list: 'slides', env: 'AI_PROMPT_INSTA' },
  email: { tool: 'vul_mail', name: 'e-mail', schema: EMAIL, element: BLOK, elementName: 'blok', list: 'blokken', env: 'AI_PROMPT_EMAIL' },
};

/* ---------------------------------------------------------------------------
   De technische regels (altijd). Schrijfstijl en tone of voice: Vercel (zie boven)
   ------------------------------------------------------------------------- */

const BASE = `Je zet ruwe content (notities, een transcript, losse ideeën of een bestaande tekst) om in content voor een tool van Pure Minds Marketing Group. Je antwoordt altijd en alleen door de tool aan te roepen die je krijgt; schrijf geen tekst buiten de tool.

Regels:
- Schrijf in het Nederlands, tenzij de content duidelijk in een andere taal is geschreven.
- Verzin geen feiten, cijfers, klantnamen, citaten, resultaten of links die niet in de content staan. Ontbreekt iets wat een veld nodig heeft, laat het dan leeg of zet er [invullen: wat er moet komen] in.
- Houd je aan de lengtes in het schema: de tekst moet passen op een slide, een post of in een mail.
- Gebruik **dubbele sterretjes** alleen waar het schema het noemt. Geen andere opmaak, geen emoji's in titels.
- Laat velden die niet bij de gekozen layout, template of het bloktype horen leeg of weg.`;

// Als de prompts in Vercel nog ontbreken: kort en neutraal, zodat het toch werkt
const FALLBACK = {
  algemeen: 'Pure Minds is een online marketingbureau. Schrijf helder, concreet en zonder vakjargon, met je en jij, in korte zinnen.',
  presentatie: 'Maak een presentatie met een duidelijke verhaallijn: opening, de kern in een paar hoofdstukken, en een afsluiter met een volgende stap.',
  insta: 'Maak een post die opvalt in de feed en die je in één oogopslag snapt.',
  email: 'Maak een mail die de lezer in een paar seconden scant: één hoofdboodschap, korte blokken, één duidelijke actie.',
};

// Een prompt uit Vercel; uit een .env-bestand kan een nieuwe regel als letterlijk \n binnenkomen
const fromEnv = (v) => String(v || '').replace(/\\n/g, '\n').trim();

export function systemPrompt(format, env = {}) {
  const f = FORMATS[format];
  return [
    BASE,
    `Je maakt nu: een ${f.name}, met de tool ${f.tool}.`,
    fromEnv(env.AI_PROMPT) || FALLBACK.algemeen,
    fromEnv(env[f.env]) || FALLBACK[format],
  ].join('\n\n');
}

/* ---------------------------------------------------------------------------
   Invoer controleren en het verzoek bouwen
   ------------------------------------------------------------------------- */

export function checkInput(input) {
  const o = input && typeof input === 'object' ? input : {};
  if (!FORMATS[o.format]) return { ok: false, status: 400, error: 'Kies een formaat: presentatie, insta of email.' };
  const mode = o.mode === 'refine' ? 'refine' : 'generate';
  const content = typeof o.content === 'string' ? o.content.trim() : '';
  if (content.length > MAX_CONTENT) return { ok: false, status: 413, error: `Je content is te lang: hoogstens ${MAX_CONTENT.toLocaleString('nl-NL')} tekens.` };
  if (mode === 'generate' && content.length < 20) return { ok: false, status: 400, error: 'Geef wat meer content: een paar zinnen of notities.' };
  if (mode === 'refine') {
    const instruction = typeof o.instruction === 'string' ? o.instruction.trim() : '';
    if (!instruction) return { ok: false, status: 400, error: 'Zeg wat er anders moet, bijvoorbeeld: korter, formeler of met meer voorbeelden.' };
    if (instruction.length > MAX_INSTRUCTION) return { ok: false, status: 413, error: 'Je instructie is te lang.' };
    if (!o.current || typeof o.current !== 'object') return { ok: false, status: 400, error: 'Er is nog niets om aan te passen.' };
    if (JSON.stringify(o.current).length > MAX_CURRENT) return { ok: false, status: 413, error: 'Het ontwerp is te groot om in één keer aan te passen.' };
    const list = o.current[FORMATS[o.format].list];
    if (o.target != null && !(Number.isInteger(o.target) && Array.isArray(list) && o.target >= 0 && o.target < list.length)) {
      return { ok: false, status: 400, error: 'Dat onderdeel bestaat niet (meer).' };
    }
  }
  return { ok: true, mode };
}

const tag = (name, text) => `<${name}>\n${text}\n</${name}>`;

export function buildRequest(input, env = {}) {
  const f = FORMATS[input.format];
  const mode = input.mode === 'refine' ? 'refine' : 'generate';
  const content = typeof input.content === 'string' ? input.content.trim() : '';
  const wish = typeof input.wish === 'string' ? input.wish.trim().slice(0, 300) : '';
  const scoped = mode === 'refine' && Number.isInteger(input.target);
  const tool = scoped
    ? { name: `pas_${f.elementName.replace(/-/g, '_')}_aan`, description: `Geef de aangepaste ${f.elementName} terug, met alle velden.`, input_schema: f.element }
    : { name: f.tool, description: `Vul de ${f.name} in.`, input_schema: f.schema };

  let text;
  if (mode === 'generate') {
    text = [
      tag('content', content),
      wish ? tag('wens', wish) : '',
      `Maak hiervan een ${f.name}${wish ? ', rekening houdend met de wens' : ''}. Roep ${tool.name} aan.`,
    ].filter(Boolean).join('\n\n');
  } else {
    const which = scoped ? `${f.elementName} ${input.target + 1} (nummer ${input.target + 1} in ${f.list})` : `de hele ${f.name}`;
    text = [
      content ? tag('oorspronkelijke_content', content) : '',
      tag('huidig', JSON.stringify(input.current, null, 1)),
      tag('instructie', String(input.instruction).trim()),
      scoped
        ? `Pas alleen ${which} aan volgens de instructie. De rest staat erbij als context. Houd wat de instructie niet noemt zoveel mogelijk gelijk, ook wat de gebruiker zelf heeft geschreven. Roep ${tool.name} aan met alleen deze ${f.elementName}.`
        : `Pas ${which} aan volgens de instructie. Houd wat de instructie niet noemt zoveel mogelijk gelijk, ook wat de gebruiker zelf heeft geschreven. Roep ${tool.name} aan met het hele resultaat.`,
    ].filter(Boolean).join('\n\n');
  }

  return {
    model: env.AI_MODEL || MODEL,
    max_tokens: 8000,
    system: systemPrompt(input.format, env),
    tools: [tool],
    tool_choice: { type: 'tool', name: tool.name },
    messages: [{ role: 'user', content: text }],
  };
}

/* ---------------------------------------------------------------------------
   Het antwoord van Claude lezen
   ------------------------------------------------------------------------- */

export function readResponse(body, toolName) {
  const blocks = body && Array.isArray(body.content) ? body.content : [];
  const call = blocks.find((b) => b && b.type === 'tool_use' && (!toolName || b.name === toolName));
  if (body && body.stop_reason === 'max_tokens') return { error: 'Het antwoord werd te lang. Probeer minder content tegelijk, of vraag om minder slides of blokken.' };
  if (!call || !call.input || typeof call.input !== 'object' || Array.isArray(call.input)) return { error: 'De AI gaf geen bruikbaar antwoord. Probeer het nog eens.' };
  return { data: call.input };
}

// Fout van de Anthropic-API in een zin voor de gebruiker (de echte fout blijft in de logs van Vercel)
export function apiError(status) {
  if (status === 401 || status === 403) return 'De AI-sleutel in Vercel klopt niet (ANTHROPIC_API_KEY).';
  if (status === 429) return 'De AI is even druk of het tegoed is op. Probeer het over een minuut opnieuw.';
  if (status === 529 || status >= 500) return 'De AI is even overbelast. Probeer het zo nog eens.';
  if (status === 400) return 'De AI kon dit verzoek niet verwerken. Probeer het met minder of andere content.';
  return `De AI gaf een fout (${status}).`;
}
