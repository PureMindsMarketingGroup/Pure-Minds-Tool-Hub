/* =============================================================================
   library.js — de bieb: ontwerpen 14 dagen bewaren, in deze browser
   -----------------------------------------------------------------------------
   Een maker bewaart zijn ontwerp (de toestand plus de foto's en logo's die erin
   staan) om het later aan te passen in plaats van opnieuw te maken. Alles staat
   in deze browser: de lijst in localStorage (pm-library-v1, met een kleine
   miniatuur), het ontwerp zelf in IndexedDB (library:<id>, met eigen kopieën
   van de bestanden, zodat het opruimen in een maker ze niet weggooit).

   Een ontwerp blijft 14 dagen na de laatste keer opslaan staan; daarna ruimt
   elke pagina met de bieb het op.

   Opslaan (de knop in de appbalk, #libSave): staat het ontwerp nog niet in de
   bieb, dan meteen; staat het er al, dan de vraag of je de vorige versie
   overschrijft of het als nieuw opslaat. Vanzelf opslaan overschrijft nooit:
   een download slaat alleen op wat nog niet in de bieb staat, en wie een ander
   ontwerp opent terwijl het open ontwerp gewijzigd is, krijgt dat als nieuwe
   versie in de bieb. Een stip op de knop: er zijn wijzigingen die nog niet in
   de bieb staan.

     PM.library.list(tool?)       de bewaarde ontwerpen, nieuwste eerst (verlopen weg)
     PM.library.remove(id)        een ontwerp weggooien
     PM.library.attach(opts)      de bieb in een maker; geeft { save, autoSave, open, touch, detach }
       opts.tool                  id uit js/shared/tools.js (titel via draft.summary)
       opts.slot()                optioneel: soort binnen de tool (de presentatie heeft er drie)
       opts.getState()            de toestand die bewaard wordt
       opts.fileKeys(state)       sleutels in IndexedDB van de bestanden in die toestand
       opts.apply(state, keys)    een bewaard ontwerp openen (één stap om ongedaan te maken)
       opts.thumb()               optioneel: een canvas als miniatuur
       opts.undo()                optioneel: ongedaan maken (de knop in de melding)
       opts.close()               optioneel: de popover sluiten
       opts.openId                uit de link van het dashboard (?bieb=<id>, of 'lijst')
     controller.isClean(slot)     staat dat soort ongewijzigd in de bieb? (niets te bewaren)
     controller.isDirty()         gewijzigd sinds de laatste keer opslaan (iets te bewaren)

   De maker roept touch() bij elke wijziging (iets om op te slaan), detach() bij
   een nieuw, leeg ontwerp, en autoSave() na een download.
   ============================================================================= */
(function (global) {
  'use strict';

  const DAYS = 14;
  const DAY = 864e5;
  const INDEX_KEY = 'pm-library-v1';
  const CURRENT_KEY = 'pm-library-current-v1';   // { 'tool' of 'tool:soort': { id, dirty } }
  const recordKey = (id) => `library:${id}`;

  /* ---------------------------------------------------------------------------
     Rekenwerk, zonder browser (getest in tests/library.test.js)
     ------------------------------------------------------------------------- */

  const valid = (e) => !!(e && typeof e === 'object' && e.id && e.tool && Number.isFinite(e.expires));

  // Verlopen ontwerpen eruit: { keep, gone }
  function prune(list, now) {
    const keep = [];
    const gone = [];
    for (const e of Array.isArray(list) ? list : []) (valid(e) && e.expires > now ? keep : gone).push(e);
    return { keep, gone };
  }

  // Een ontwerp vooraan, zonder dubbele
  const upsert = (list, entry) => [entry, ...(Array.isArray(list) ? list : []).filter((e) => e && e.id !== entry.id)];

  // Hele dagen tot het ontwerp verdwijnt (een begonnen dag telt mee)
  const daysLeft = (entry, now) => Math.max(0, Math.ceil((entry.expires - now) / DAY));

  function leftText(n) {
    if (n <= 0) return 'verdwijnt vandaag';
    return n === 1 ? 'nog 1 dag' : `nog ${n} dagen`;
  }

  // "opgeslagen vandaag om 15:27", "opgeslagen gisteren om 9:05", "opgeslagen 3 dagen geleden":
  // met de tijd erbij zie je twee versies van hetzelfde ontwerp uit elkaar
  function savedText(at, now) {
    const midnight = (t) => new Date(t).setHours(0, 0, 0, 0);
    const days = Math.round((midnight(now) - midnight(at)) / DAY);
    const d = new Date(at);
    const clock = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
    if (days <= 0) return `opgeslagen vandaag om ${clock}`;
    return days === 1 ? `opgeslagen gisteren om ${clock}` : `opgeslagen ${days} dagen geleden`;
  }

  const cleanTitle = (t) => String(t || '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();

  const api = { DAYS, prune, upsert, daysLeft, leftText, savedText, cleanTitle };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  const PM = global.PM;
  if (!PM || !global.document) return;

  /* ---------------------------------------------------------------------------
     Opslag
     ------------------------------------------------------------------------- */

  const store = PM.store;
  const index = () => {
    const saved = store.get(INDEX_KEY, []);
    return Array.isArray(saved) ? saved.filter(valid) : [];
  };

  // De lijst zonder verlopen ontwerpen; die gaan ook uit IndexedDB
  function purge() {
    const { keep, gone } = prune(store.get(INDEX_KEY, []), Date.now());
    if (gone.length) {
      store.set(INDEX_KEY, keep);
      gone.forEach((e) => e && e.id && PM.idb.del(recordKey(e.id)));
    }
    return keep;
  }

  const list = (tool) => purge().filter((e) => !tool || e.tool === tool);

  async function remove(id) {
    store.set(INDEX_KEY, index().filter((e) => e.id !== id));
    await PM.idb.del(recordKey(id));
  }

  const clone = (v) => JSON.parse(JSON.stringify(v));
  const dateText = (t) => new Date(t).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' });

  // Miniatuur: hoogstens 240 px breed als JPEG, klein genoeg voor localStorage
  function shrink(canvas) {
    if (!canvas || !canvas.width || !canvas.height) return '';
    const w = Math.min(240, canvas.width);
    const h = Math.round((canvas.height * w) / canvas.width);
    const c = global.document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(canvas, 0, 0, w, h);
    try {
      return c.toDataURL('image/jpeg', 0.72);
    } catch (err) {
      return '';   // een "besmet" canvas (file://): dan zonder miniatuur
    }
  }

  /* ---------------------------------------------------------------------------
     De bieb in een maker
     ------------------------------------------------------------------------- */

  const esc = PM.esc;
  const ICON = {
    close: '<svg class="ri" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 10.59 16.95 5.64l1.41 1.41L13.41 12l4.95 4.95-1.41 1.41L12 13.41l-4.95 4.95-1.41-1.41L10.59 12 5.64 7.05l1.41-1.41z"/></svg>',
    del: '<svg class="ri" viewBox="0 0 24 24" aria-hidden="true"><path d="M17 6H22V8H20V21C20 21.5523 19.5523 22 19 22H5C4.44772 22 4 21.5523 4 21V8H2V6H7V3C7 2.44772 7.44772 2 8 2H16C16.5523 2 17 2.44772 17 3V6ZM18 8H6V20H18V8ZM9 11H11V17H9V11ZM13 11H15V17H13V11ZM9 4V6H15V4H9Z"/></svg>',
  };

  function attach(opts) {
    const tool = opts.tool;
    const meta = (global.PM_TOOLS || []).find((t) => t.id === tool) || {};
    const slotKey = () => (opts.slot ? `${tool}:${opts.slot()}` : tool);
    const readCurrent = () => (store.get(CURRENT_KEY, {}) || {})[slotKey()] || { id: null, dirty: false };
    const writeCurrent = (value) => store.set(CURRENT_KEY, { ...(store.get(CURRENT_KEY, {}) || {}), [slotKey()]: value });
    let applying = false;

    const body = global.document.querySelector('[data-lib]');
    const button = global.document.getElementById('libBtn');
    const saveBtn = global.document.getElementById('libSave');

    // De stip op opslaan: er zijn wijzigingen die nog niet in de bieb staan
    function syncDot() {
      if (!saveBtn) return;
      const unsaved = !!readCurrent().dirty;
      saveBtn.classList.toggle('has-dot', unsaved);
      saveBtn.title = unsaved ? 'Opslaan in je bieb: er zijn wijzigingen die nog niet zijn opgeslagen' : 'Opgeslagen in je bieb';
    }

    function summary(state) {
      try {
        return (meta.draft && meta.draft.summary(state)) || {};
      } catch (err) {
        return {};
      }
    }

    // Wat het open ontwerp in de bieb is (als het daar staat)
    const currentEntry = () => {
      const cur = readCurrent();
      return cur.id ? list(tool).find((e) => e.id === cur.id) || null : null;
    };

    function touch() {
      if (applying) return;
      const cur = readCurrent();
      if (!cur.dirty) {
        writeCurrent({ ...cur, dirty: true });
        syncDot();
      }
    }

    function detach() {
      writeCurrent({ id: null, dirty: false });
      render();
    }

    /**
     * Opslaan: het open ontwerp overschrijft zijn plek in de bieb (weer 14 dagen), of komt
     * er nieuw in. asNew: altijd als nieuw. state: een ander ontwerp dan het open ontwerp
     * (zonder miniatuur, niet gekoppeld). quiet: zonder melding.
     */
    async function save({ asNew = false, quiet = false, state: other = null } = {}) {
      const state = clone(other || opts.getState());
      const keys = Array.from(new Set((opts.fileKeys(state) || []).filter(Boolean)));
      const files = {};
      for (const key of keys) {
        const blob = await PM.idb.get(key);
        if (blob instanceof Blob) files[key] = blob;
      }
      const existing = !asNew && !other ? currentEntry() : null;
      const id = existing ? existing.id : `${Date.now().toString(36)}${PM.uid()}`;
      const ok = await PM.idb.set(recordKey(id), { id, tool, state, files, v: 1 });
      if (ok == null) {
        if (!quiet) PM.toast('Opslaan in je bieb lukte niet. Misschien is de opslag van je browser vol, of staat hij in een privévenster.', true);
        return null;
      }
      let thumb = '';
      if (!other && opts.thumb) {
        try {
          thumb = shrink(await opts.thumb());
        } catch (err) {
          thumb = '';
        }
      }
      const info = summary(state);
      const now = Date.now();
      const entry = {
        id,
        tool,
        title: cleanTitle(info.title) || 'Zonder titel',
        sub: info.sub || '',
        noun: info.noun || 'ontwerp',
        ratio: info.ratio || '1 / 1',
        thumb,
        savedAt: now,
        expires: now + DAYS * DAY,
      };
      // Past de lijst niet meer (localStorage vol): zonder miniaturen opnieuw proberen
      let next = upsert(purge(), entry);
      if (!store.set(INDEX_KEY, next)) {
        next = next.map((e) => ({ ...e, thumb: e.id === id ? thumb : '' }));
        if (!store.set(INDEX_KEY, next)) {
          await PM.idb.del(recordKey(id));
          if (!quiet) PM.toast('Je bieb is vol. Gooi een paar oude ontwerpen weg en probeer het opnieuw.', true);
          return null;
        }
      }
      if (!other) writeCurrent({ id, dirty: false });
      if (!quiet) PM.toast(`${existing ? 'Opgeslagen over de vorige versie' : 'Opgeslagen in je bieb'}: ${entry.title}. Hij blijft staan tot ${dateText(entry.expires)}.`);
      render();
      return entry;
    }

    // Na een download: alleen opslaan wat nog niet in de bieb staat (nooit overschrijven)
    function autoSave() {
      return currentEntry() ? Promise.resolve(null) : save({ quiet: true });
    }

    /* --- De vraag bij opslaan: overschrijven of als nieuw --- */

    let askDialog = null;
    function ask(entry) {
      if (!askDialog) {
        askDialog = global.document.createElement('dialog');
        askDialog.className = 'keys lib-ask';
        askDialog.setAttribute('aria-labelledby', 'libAskTitle');
        global.document.body.appendChild(askDialog);
      }
      askDialog.innerHTML = `
        <div class="keys__head">
          <h2 class="keys__title" id="libAskTitle">Opslaan<span class="dot">.</span></h2>
          <button type="button" class="panel__close keys__close" data-choice="" aria-label="Annuleren">${ICON.close}</button>
        </div>
        <div class="lib-ask__body">
          <p class="lib-ask__lead">Dit ontwerp staat al in je bieb als <b>${esc(entry.title)}</b>, ${esc(savedText(entry.savedAt, Date.now()))}.</p>
          <button type="button" class="lib-ask__choice" data-choice="over" autofocus>
            <b>Vorige versie overschrijven</b>
            <span>Je past hetzelfde ontwerp aan. In je bieb blijft één versie staan: deze.</span>
          </button>
          <button type="button" class="lib-ask__choice" data-choice="new">
            <b>Opslaan als nieuw ontwerp</b>
            <span>De vorige versie blijft ook staan. Handig voor een tweede variant of een andere klant.</span>
          </button>
          <button type="button" class="linkbtn lib-ask__cancel" data-choice="">annuleren</button>
        </div>`;
      return new Promise((resolve) => {
        const done = (choice) => {
          askDialog.onclick = null;
          askDialog.onclose = null;
          if (askDialog.open) askDialog.close();
          resolve(choice);
        };
        askDialog.onclick = (e) => {
          if (e.target === askDialog) return done(null);   // klik op de achtergrond
          const b = e.target.closest('[data-choice]');
          if (b) done(b.dataset.choice || null);
        };
        askDialog.onclose = () => done(null);   // Escape
        if (typeof askDialog.showModal === 'function') askDialog.showModal();
        else askDialog.setAttribute('open', '');
        const first = askDialog.querySelector('[data-choice="over"]');
        if (first) first.focus();
      });
    }

    // De knop opslaan: nieuw meteen; al in de bieb met wijzigingen: eerst de vraag
    async function saveClick() {
      const entry = currentEntry();
      if (!entry) return save();
      if (!readCurrent().dirty) {
        const saved = await save({ quiet: true });
        if (saved) PM.toast(`Al opgeslagen, er is niets veranderd. ${saved.title} blijft nu staan tot ${dateText(saved.expires)}.`);
        return saved;
      }
      const choice = await ask(entry);
      if (choice === 'over') return save();
      if (choice === 'new') return save({ asNew: true });
      return null;
    }

    async function open(id) {
      const entry = list(tool).find((e) => e.id === id);
      const record = entry ? await PM.idb.get(recordKey(id)) : null;
      if (!entry || !record || !record.state) {
        if (entry) await remove(id);
        PM.toast('Dit ontwerp staat niet meer in je bieb. Na 14 dagen verdwijnt een ontwerp vanzelf.', true);
        render();
        return false;
      }
      // Niets kwijtraken en niets overschrijven: wat er open stond en gewijzigd is, eerst als
      // nieuwe versie in de bieb
      const before = readCurrent();
      let kept = null;
      if (before.dirty && before.id !== id) kept = await save({ quiet: true, asNew: true });
      const prev = readCurrent();
      for (const [key, blob] of Object.entries(record.files || {})) await PM.idb.set(key, blob);
      applying = true;
      try {
        await opts.apply(clone(record.state), Object.keys(record.files || {}));
      } finally {
        applying = false;
      }
      writeCurrent({ id, dirty: false });
      if (opts.close) opts.close();
      const undo = opts.undo ? {
        label: 'ongedaan maken',
        run: () => {
          opts.undo();
          writeCurrent(prev);
          render();
        },
      } : null;
      PM.toast(`Geopend uit je bieb: ${entry.title}.${kept ? ` Wat je open had, staat ook in je bieb, als nieuwe versie (${kept.title}).` : ''}`, false, undo);
      render();
      return true;
    }

    async function removeEntry(id) {
      const entry = list(tool).find((e) => e.id === id);
      if (!entry) return;
      const record = await PM.idb.get(recordKey(id));
      await remove(id);
      const cur = readCurrent();
      if (cur.id === id) writeCurrent({ id: null, dirty: true });
      render();
      PM.toast(`Uit je bieb gehaald: ${entry.title}.`, false, record ? {
        label: 'ongedaan maken',
        run: async () => {
          await PM.idb.set(recordKey(id), record);
          store.set(INDEX_KEY, upsert(index(), entry).sort((a, b) => b.savedAt - a.savedAt));
          if (cur.id === id) writeCurrent(cur);
          render();
        },
      } : null);
    }

    /* --- De popover: de lijst met openen en weggooien --- */

    function itemHtml(e, isCurrent, now) {
      const n = daysLeft(e, now);
      // In de echte verhouding, passend in een vak van 3,5 × 3 rem (een story staat rechtop)
      const [a, b] = String(e.ratio || '1 / 1').split('/').map(Number);
      const ar = a > 0 && b > 0 ? a / b : 1;
      const w = Math.min(3.5, 3 * ar);
      const art = `<span class="lib__art" style="width:${w.toFixed(2)}rem;height:${(w / ar).toFixed(2)}rem">${e.thumb ? `<img src="${esc(e.thumb)}" alt="">` : ''}</span>`;
      return `
        <li class="lib__item${isCurrent ? ' is-current' : ''}">
          <span class="lib__thumb" aria-hidden="true">${art}</span>
          <span class="lib__txt">
            <b class="lib__title">${esc(e.title)}</b>
            ${e.sub ? `<span class="lib__meta">${esc(e.sub)}</span>` : ''}
            <span class="lib__meta lib__when">${esc(savedText(e.savedAt, now))} · <span class="lib__left${n <= 2 ? ' is-soon' : ''}">${esc(leftText(n))}</span></span>
          </span>
          ${isCurrent
            ? '<span class="lib__open">nu open</span>'
            : `<button type="button" class="btn btn-outline btn-xs" data-lib-open="${esc(e.id)}">open<span class="sr-only"> ${esc(e.title)}</span></button>`}
          <button type="button" class="iconbtn lib__del" data-lib-del="${esc(e.id)}" aria-label="${esc(`${e.title} uit je bieb halen`)}" title="uit je bieb halen">${ICON.del}</button>
        </li>`;
    }

    function render() {
      const entries = list(tool);
      const count = button && button.querySelector('[data-lib-count]');
      if (count) count.textContent = entries.length ? String(entries.length) : '';
      syncDot();
      if (!body) return;
      const now = Date.now();
      const cur = currentEntry();
      body.innerHTML = `
        <p class="lib__lead">Je opgeslagen ontwerpen. Ze blijven ${DAYS} dagen staan na de laatste keer opslaan, in deze browser. Opslaan doe je met de knop links van bieb.</p>
        ${entries.length
          ? `<ul class="lib__list" aria-label="Opgeslagen in je bieb">${entries.map((e) => itemHtml(e, cur && cur.id === e.id, now)).join('')}</ul>`
          : `<p class="lib__empty">Nog niets opgeslagen. Klik op opslaan; wat je opslaat, vind je hier en op het dashboard terug.</p>`}`;
    }

    if (body) {
      body.addEventListener('click', (e) => {
        const t = e.target.closest('button');
        if (!t) return;
        if (t.dataset.libOpen) open(t.dataset.libOpen);
        else if (t.dataset.libDel) removeEntry(t.dataset.libDel);
      });
    }
    // Elke keer dat je hem opent de stand van nu (dagen, wat er open staat)
    if (button) button.addEventListener('click', render);
    if (saveBtn) saveBtn.addEventListener('click', saveClick);
    render();

    // Van het dashboard: een ontwerp openen, of de lijst tonen
    if (opts.openId === 'lijst' && button) setTimeout(() => button.click(), 0);
    else if (opts.openId) setTimeout(() => open(opts.openId), 0);

    // Staat het ontwerp van dit soort al ongewijzigd in de bieb? Dan hoeft het niet nog eens
    function isClean(slot) {
      const cur = (store.get(CURRENT_KEY, {}) || {})[slot == null ? tool : `${tool}:${slot}`];
      return !!(cur && cur.id && !cur.dirty && list(tool).some((e) => e.id === cur.id));
    }

    // Gewijzigd sinds de laatste keer opslaan (of nooit opgeslagen en wel aangepast)?
    const isDirty = () => !!readCurrent().dirty;

    return { save, autoSave, saveClick, open, touch, detach, render, isClean, isDirty };
  }

  PM.library = { ...api, list, remove, attach };
})(typeof window !== 'undefined' ? window : globalThis);
