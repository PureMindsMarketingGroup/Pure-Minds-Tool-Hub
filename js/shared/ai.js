/* =============================================================================
   ai.js — de AI in de makers: ruwe content in, ingevulde velden eruit
   -----------------------------------------------------------------------------
   Claude Opus (via de server van de Tool Hub, /api/generate in uploads/) maakt
   van ruwe content (notities, een transcript, losse ideeën) een presentatie,
   een Instagram-post of een e-mail, altijd als JSON volgens een vast schema
   (uploads/lib/ai.js). De maker zet die JSON in zijn eigen velden; daarna pas
   je alles gewoon zelf aan, of vraag je de AI om een aanpassing ("korter",
   "formeler"), voor het hele ontwerp of alleen de open slide of het open blok.

     PM.ai.request(verzoek)          { data } van /api/generate (gooit een Error met een zin)
     PM.ai.status()                  { ok, ai, ... } of null
     PM.ai.panel(el, opties)         het paneel AI in een maker; geeft { extras, refresh, run }
       opties.tool                   id van de maker ('insta', 'presentation', 'newsletter')
       opties.format                 'presentatie' | 'insta' | 'email' (het schema)
       opties.noun                   'presentatie', 'post', 'mail'
       opties.current()              het huidige ontwerp in de vorm van het schema (aanpassen)
       opties.target()               { index, label } van de open slide of het open blok, of null
       opties.wish()                 optioneel: extra wens bij maken (zoals een template), naast
                                     het vrije veld Wens
       opties.wishField              optioneel: HTML van een veld voor die wens
       opties.wishPlaceholder        voorbeeld in het veld Wens
       opties.apply(data, { mode, target })   de JSON in de velden zetten (één stap ongedaan maken)
       opties.lib                    de bieb van de maker (PM.library.attach)
       opties.canRefine()            optioneel: '' = aanpassen mag, anders de reden waarom niet
       opties.photos                 optioneel: foto's van Pexels (js/shared/photos.js)
         .slots(data)                na het maken: [{ key, query, orientation, width, download }] per fotoplek;
                                     de foto's gaan als opties.apply(data, { photos: Map }) mee
         .target()                   { label, orientation, query, width } van de open fotoplek, of null
         .apply(file, foto)          een gekozen foto plaatsen (zoals een upload)
     PM.ai.keepSaved(lib)            na de AI: elke wijziging vanzelf in de bieb (debounce);
                                     geeft { start, stop, touch }

   Bewaren: in de bieb van het team (js/shared/library.js). Na de AI staat het
   resultaat meteen in de bieb, als nieuw ontwerp (wat er open stond en
   gewijzigd was, eerst ook). Elke wijziging daarna komt er na 3 seconden
   rust vanzelf overheen, tot je een ander ontwerp opent of opnieuw begint.
   ============================================================================= */
(function (global) {
  'use strict';

  const PM = global.PM;
  const doc = global.document;
  const RAW_KEY = (tool) => `pm-ai-raw-${tool}-v1`;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MAX_CONTENT = 60000;
  const CHIPS = ['korter', 'formeler', 'informeler', 'pakkender', 'concreter', 'met meer voorbeelden'];

  // Uitleg achter de [?] in het paneel; komt bij de uitleg van de maker zelf
  const HELP = {
    'ai-maken': {
      title: 'Maken met AI',
      text: 'Plak je ruwe content: notities, een transcript, een oude tekst of losse ideeën. Claude zet het in de velden van de tool, in de huisstijl. Hij verzint geen cijfers of namen: wat ontbreekt, staat er als [invullen]. Lees altijd na.',
    },
    'ai-aanpassen': {
      title: 'Aanpassen met AI',
      text: 'Zeg wat er anders moet: korter, formeler, meer voor ondernemers, of "maak van punt 3 een vraag". Kies alles of alleen de open slide of het open blok. Wat je zelf schreef, blijft zoveel mogelijk staan.',
    },
    'ai-fotos': {
      title: 'Foto’s van Pexels',
      text: 'Na het maken zet de AI er meteen passende foto’s in, uit een gratis fotobank (Unsplash): ook zakelijk te gebruiken, zonder naamsvermelding in je post of mail. Niet goed? Zoek hier een andere en klik erop: hij komt op de open slide, post of blok. Eigen foto’s kan ook altijd.',
    },
    'ai-bewaren': {
      title: 'Vanzelf bewaard',
      text: 'Na de AI staat je ontwerp meteen in de bieb, ook voor je collega’s. Elke aanpassing daarna, van jou of van de AI, gaat er vanzelf in. Je vorige ontwerp gaat niet verloren: dat staat ook in de bieb, en ongedaan maken werkt gewoon.',
    },
  };

  /* ---------------------------------------------------------------------------
     Verzoeken
     ------------------------------------------------------------------------- */

  async function request(body, { signal } = {}) {
    return PM.service.request('/api/generate', {
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
      signal,
    });
  }
  const status = () => PM.service.status('/api/generate');

  /* ---------------------------------------------------------------------------
     Na de AI: elke wijziging vanzelf in de bieb, met een debounce
     ------------------------------------------------------------------------- */

  function keepSaved(lib, { delay = 3000 } = {}) {
    let on = false;
    let timer = 0;
    const flush = () => {
      timer = 0;
      if (on && lib) lib.save({ quiet: true });
    };
    return {
      get on() { return on; },
      start() { on = true; },
      stop() { on = false; clearTimeout(timer); timer = 0; },
      touch() {
        if (!on) return;
        clearTimeout(timer);
        timer = setTimeout(flush, delay);
      },
    };
  }

  /* ---------------------------------------------------------------------------
     Het paneel
     ------------------------------------------------------------------------- */

  function panel(root, opts) {
    const tool = opts.tool;
    const noun = opts.noun || 'ontwerp';
    // Uitleg van het paneel bij die van de maker (PM.help zoekt in PM_HELP.<tool>.help)
    const helpData = (global.PM_HELP = global.PM_HELP || {})[tool] = global.PM_HELP[tool] || {};
    helpData.help = { ...(helpData.help || {}), ...HELP };

    root.innerHTML = `
<p class="panel__lead">Plak je ruwe content: notities, een transcript of losse ideeën. De AI vult je ${esc(noun)} in de huisstijl; daarna pas je alles zelf aan. <button type="button" class="help" data-help="ai-maken"></button></p>
<div class="notice notice-warn ai-off" data-ai-off hidden></div>
<div class="field">
  <label class="label" for="aiRaw-${tool}">Ruwe content</label>
  <textarea class="input ai-raw" id="aiRaw-${tool}" rows="9" maxlength="${MAX_CONTENT}" placeholder="Bijvoorbeeld: aantekeningen van een klantgesprek, een blog, een opsomming van ideeën…" data-ai-raw></textarea>
  <p class="field-hint" data-ai-count aria-live="polite"></p>
</div>
<div class="field">
  <label class="label" for="aiWish-${tool}">Wens <i>optioneel</i></label>
  <input class="input" id="aiWish-${tool}" maxlength="300" placeholder="${esc(opts.wishPlaceholder || 'bijv. voor ondernemers, informeel, kort')}" data-ai-wish>
</div>
${opts.wishField || ''}
<div class="ai-go">
  <button type="button" class="btn btn-outline" data-ai-make><svg class="ri" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4.4375C15.3462 4.4375 16.4375 3.34619 16.4375 2H17.5625C17.5625 3.34619 18.6538 4.4375 20 4.4375V5.5625C18.6538 5.5625 17.5625 6.65381 17.5625 8H16.4375C16.4375 6.65381 15.3462 5.5625 14 5.5625V4.4375ZM1 11C4.31371 11 7 8.31371 7 5H9C9 8.31371 11.6863 11 15 11V13C11.6863 13 9 15.6863 9 19H7C7 15.6863 4.31371 13 1 13V11ZM4.87601 12C6.18717 12.7276 7.27243 13.8128 8 15.124 8.72757 13.8128 9.81283 12.7276 11.124 12 9.81283 11.2724 8.72757 10.1872 8 8.87601 7.27243 10.1872 6.18717 11.2724 4.87601 12ZM17.25 14C17.25 15.7949 15.7949 17.25 14 17.25V18.75C15.7949 18.75 17.25 20.2051 17.25 22H18.75C18.75 20.2051 20.2051 18.75 22 18.75V17.25C20.2051 17.25 18.75 15.7949 18.75 14H17.25Z"/></svg><span data-label>maak met AI</span></button>
  <p class="field-hint">Vervangt je huidige ${esc(noun)}. Die gaat eerst naar de bieb, en ongedaan maken kan altijd. <button type="button" class="help" data-help="ai-bewaren"></button></p>
</div>
<div class="ai-busy" data-ai-busy hidden role="status"><span class="ai-busy__hex" aria-hidden="true"></span><span data-ai-busy-text>De AI is bezig…</span></div>

<section class="ai-refine" aria-labelledby="aiRefTitle-${tool}">
  <h3 class="ai-refine__title" id="aiRefTitle-${tool}">Pas aan met AI <button type="button" class="help" data-help="ai-aanpassen"></button></h3>
  <div class="ai-chips" role="group" aria-label="Snelle aanpassingen">${CHIPS.map((c) => `<button type="button" class="ai-chip" data-ai-chip="${esc(c)}">${esc(c)}</button>`).join('')}</div>
  <label class="sr-only" for="aiIns-${tool}">Wat moet er anders?</label>
  <textarea class="input" id="aiIns-${tool}" rows="2" maxlength="1000" placeholder="Wat moet er anders? Bijv.: maak het korter en zakelijker" data-ai-ins></textarea>
  <div class="seg seg--2 seg--sm ai-scope" role="radiogroup" aria-label="Wat aanpassen" data-ai-scope>
    <input type="radio" name="aiScope-${tool}" id="aiScopeAll-${tool}" value="all" checked><label for="aiScopeAll-${tool}">alles</label>
    <input type="radio" name="aiScope-${tool}" id="aiScopeOne-${tool}" value="one"><label for="aiScopeOne-${tool}" data-ai-one>dit onderdeel</label>
  </div>
  <button type="button" class="btn btn-outline btn-sm" data-ai-refine>pas aan</button>
</section>

<section class="ai-photos" data-ai-photos hidden></section>
<div class="ai-extras" data-ai-extras></div>
<p class="ai-foot">Claude Opus van Anthropic, via de server van Pure Minds. Lees altijd na: de AI kan zich vergissen.</p>`;

    const $ = (sel) => root.querySelector(sel);
    const raw = $('[data-ai-raw]');
    const wishInput = $('[data-ai-wish]');
    const count = $('[data-ai-count]');
    const makeBtn = $('[data-ai-make]');
    const refineBtn = $('[data-ai-refine]');
    const ins = $('[data-ai-ins]');
    const busy = $('[data-ai-busy]');
    const busyText = $('[data-ai-busy-text]');
    const off = $('[data-ai-off]');
    const oneLabel = $('[data-ai-one]');
    const oneRadio = root.querySelector('[data-ai-scope] input[value="one"]');
    let running = null;

    raw.value = PM.store.get(RAW_KEY(tool), '') || '';
    const syncCount = () => {
      const n = raw.value.trim().length;
      count.textContent = n ? `${n.toLocaleString('nl-NL')} tekens${n > MAX_CONTENT * 0.9 ? ': bijna het maximum' : ''}` : 'Tot 60.000 tekens: van een paar zinnen tot een heel verslag.';
    };
    const saveRaw = PM.debounce(() => PM.store.set(RAW_KEY(tool), raw.value), 400);
    raw.addEventListener('input', () => { syncCount(); saveRaw(); });
    syncCount();

    root.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-ai-chip]');
      if (!chip) return;
      const word = chip.dataset.aiChip;
      ins.value = ins.value.trim() ? `${ins.value.trim().replace(/[.,;]$/, '')}, ${word}` : `Maak het ${word}`;
      ins.focus();
    });

    // De open slide of het open blok: "dit onderdeel" (of uit, als er niets open is)
    function refresh() {
      const t = opts.target ? opts.target() : null;
      oneRadio.disabled = !t;
      oneLabel.textContent = t ? t.label : 'dit onderdeel';
      oneLabel.title = t ? '' : 'Open eerst een slide of blok';
      if (!t && oneRadio.checked) root.querySelector('[data-ai-scope] input[value="all"]').checked = true;
    }

    const setBusy = (text) => {
      busy.hidden = !text;
      busyText.textContent = text || '';
      makeBtn.disabled = !!text;
      refineBtn.disabled = !!text;
      root.classList.toggle('is-busy', !!text);
    };

    // Lange wachttijd: zeg wat er gebeurt, zodat niemand denkt dat het vastzit
    function waitTexts(kind) {
      const steps = kind === 'make'
        ? ['De AI leest je content…', 'De AI schrijft je ' + noun + '…', 'Bijna klaar: de AI vult de laatste velden…', 'Nog even: bij veel content duurt het een minuut of twee…']
        : ['De AI past aan…', 'Nog even…'];
      let i = 0;
      setBusy(steps[0]);
      const timer = setInterval(() => { i = Math.min(i + 1, steps.length - 1); busyText.textContent = steps[i]; }, 12000);
      return () => clearInterval(timer);
    }

    async function make() {
      const content = raw.value.trim();
      if (content.length < 20) {
        PM.toast('Plak eerst je ruwe content: een paar zinnen of notities.', true);
        raw.focus();
        return;
      }
      if (running) return;
      const stop = waitTexts('make');
      running = true;
      try {
        const wish = [wishInput.value.trim(), opts.wish ? opts.wish() : ''].filter(Boolean).join(' ');
        const res = await request({ format: opts.format, mode: 'generate', content, wish });
        // Passende foto's van Pexels voor de fotoplekken (als zoeken aanstaat); mislukt er een, dan blijft die plek leeg
        let photos = null;
        if (opts.photos && PM.photos && await PM.photos.ready()) {
          const slots = opts.photos.slots(res.data);
          if (slots.length) {
            busyText.textContent = 'De AI zoekt passende foto’s…';
            photos = await PM.photos.fill(slots);
          }
        }
        // Wat er open stond en gewijzigd was, eerst als nieuwe versie in de bieb
        if (opts.lib && opts.lib.isDirty && opts.lib.isDirty()) await opts.lib.save({ quiet: true, asNew: true });
        await opts.apply(res.data, { mode: 'generate', photos });
        if (photos) photos.forEach(({ photo }) => PM.photos.used(photo));
        if (opts.lib) await opts.lib.save({ quiet: true, asNew: true });
        if (opts.saver) opts.saver.start();
        const n = photos ? photos.size : 0;
        PM.toast(`Je ${noun} is ingevuld${n ? `, met ${n === 1 ? 'een foto' : `${n} foto’s`} van ${PM.photos.providerName()},` : ''} en staat in de bieb. Lees hem na en pas aan wat je wilt.`, false, opts.undo ? { label: 'ongedaan maken', run: opts.undo } : null);
        if (picker) picker.refresh();
        if (PM.tour) PM.tour.signal('ai');
      } catch (err) {
        PM.toast(err.message || 'De AI lukte niet. Probeer het opnieuw.', true);
      } finally {
        stop();
        setBusy('');
        running = null;
        refresh();
      }
    }

    async function refine() {
      const blocked = opts.canRefine ? opts.canRefine() : '';
      if (blocked) {
        PM.toast(blocked, true);
        return;
      }
      const instruction = ins.value.trim();
      if (!instruction) {
        PM.toast('Zeg eerst wat er anders moet, of kies een van de knopjes.', true);
        ins.focus();
        return;
      }
      if (running) return;
      const t = oneRadio.checked && opts.target ? opts.target() : null;
      const stop = waitTexts('refine');
      running = true;
      try {
        const res = await request({
          format: opts.format,
          mode: 'refine',
          instruction,
          current: opts.current(),
          target: t ? t.index : undefined,
          content: raw.value.trim().slice(0, 20000),
        });
        await opts.apply(res.data, { mode: 'refine', target: t ? t.index : null });
        if (opts.saver && !opts.saver.on && opts.lib) {
          await opts.lib.save({ quiet: true });
          opts.saver.start();
        }
        PM.toast(t ? `${t.label} is aangepast.` : `Je ${noun} is aangepast.`, false, opts.undo ? { label: 'ongedaan maken', run: opts.undo } : null);
      } catch (err) {
        PM.toast(err.message || 'Aanpassen lukte niet. Probeer het opnieuw.', true);
      } finally {
        stop();
        setBusy('');
        running = null;
      }
    }

    makeBtn.addEventListener('click', make);
    refineBtn.addEventListener('click', refine);
    ins.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); refine(); }
    });

    // Staat de AI klaar? Zo niet: zeggen waarom, maar niets op slot (een storing kan voorbijgaan)
    status().then((st) => {
      if (st && st.ok && st.ai) return;
      off.hidden = false;
      off.innerHTML = st && st.ok
        ? '<b>De AI staat nog niet aan.</b> In Vercel ontbreekt de sleutel van Anthropic (ANTHROPIC_API_KEY); zie uploads/README.md.'
        : '<b>De AI is nu niet bereikbaar.</b> Is de server van de Tool Hub al ingesteld in Vercel (Root Directory uploads)?';
    });

    // Foto zoeken bij Pexels: alleen als de server het aan heeft staan
    let picker = null;
    if (opts.photos && PM.photos) {
      PM.photos.ready().then((on) => {
        if (!on) return;
        const box = $('[data-ai-photos]');
        box.hidden = false;
        picker = PM.photos.picker(box, { tool, target: opts.photos.target, apply: opts.photos.apply });
        if (PM.help && PM.help.init) PM.help.init(box, tool);
        picker.refresh();
      });
    }

    if (PM.help && PM.help.init) PM.help.init(root, tool);
    refresh();

    return {
      extras: $('[data-ai-extras]'),
      refresh() {
        refresh();
        if (picker) picker.refresh();
      },
      make,
      refine,
    };
  }

  if (PM) PM.ai = { request, status, panel, keepSaved, HELP };
})(window);
