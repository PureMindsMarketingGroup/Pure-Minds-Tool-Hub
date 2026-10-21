/* =============================================================================
   library.js — de bieb: ontwerpen 14 dagen bewaren, gedeeld met het team
   -----------------------------------------------------------------------------
   Een maker bewaart zijn ontwerp (de toestand plus de foto's en logo's die erin
   staan) om het later aan te passen in plaats van opnieuw te maken. De bieb is
   van het hele team en staat in Supabase: wat jij opslaat, kan een collega
   openen en verder aanpassen, en andersom.
     - het ontwerp: tabel designs (toestand, titel, miniatuur, wie en wanneer)
     - de bestanden: opslag designs, als <id>/<sleutel>. Openen zet ze in de
       IndexedDB van deze browser, onder dezelfde sleutel als in de toestand.
   Wie er mag lezen en schrijven, regelt de database (supabase/teambieb.sql).
   De lijst staat ook in localStorage (pm-library-team-v1), zodat het dashboard
   en de maker hem meteen tonen; refresh() haalt de stand van nu op en meldt
   dat met het event pm-library op window.

   Een ontwerp blijft 14 dagen na de laatste keer opslaan staan. Weggooien zet
   het op verlopen (ongedaan maken kan dus); een dag na het verlopen ruimt de
   bieb het op, met de bestanden.

   Opslaan (de knop in de appbalk, #libSave): staat het ontwerp nog niet in de
   bieb, dan meteen; staat het er al, dan de vraag of je de vorige versie
   overschrijft of het als nieuw opslaat. Heeft iemand anders het intussen
   opgeslagen, dan zegt de vraag dat (met wie en wanneer). Vanzelf opslaan
   overschrijft nooit: een download slaat alleen op wat nog niet in de bieb
   staat; wie een ander ontwerp opent terwijl het open ontwerp gewijzigd is,
   krijgt dat als nieuw ontwerp in de bieb; en heeft een collega het intussen
   opgeslagen, dan wordt jouw versie een nieuw ontwerp. Een stip op de knop: er
   zijn wijzigingen die nog niet in de bieb staan.

   Wat er nog in de oude bieb van alleen deze browser stond (pm-library-v1, en
   library:<id> in IndexedDB), verhuist de eerste keer vanzelf naar de bieb van
   het team.

     PM.library.list(tool?)       de bewaarde ontwerpen, nieuwste eerst (uit het geheugen)
     PM.library.refresh()         belofte: de lijst van nu uit Supabase (daarna het event pm-library)
     PM.library.status()          'laden', 'klaar' of 'fout'
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
  const BUCKET = 'designs';
  const CACHE_KEY = 'pm-library-team-v1';         // de lijst van de bieb, om meteen te tonen
  const CURRENT_KEY = 'pm-library-current-v1';   // { 'tool' of 'tool:soort': { id, dirty, rev } }
  const OLD_INDEX_KEY = 'pm-library-v1';         // de bieb van vóór het inloggen (alleen deze browser)
  const PURGE_KEY = 'pm-library-purge-v1';       // wanneer deze browser voor het laatst opruimde
  const oldRecordKey = (id) => `library:${id}`;
  const COLUMNS = 'id, tool, slot, title, sub, noun, ratio, thumb, files, updated_at, updated_by, updated_by_name, expires_at';
  const BRIEF = 'id, tool, title, files, updated_at, updated_by, updated_by_name, expires_at';   // zonder miniatuur

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

  // "opgeslagen vandaag om 15:27 door Ashley", "opgeslagen 3 dagen geleden": met de tijd
  // erbij zie je twee versies van hetzelfde ontwerp uit elkaar
  function savedText(at, now, by = '') {
    const midnight = (t) => new Date(t).setHours(0, 0, 0, 0);
    const days = Math.round((midnight(now) - midnight(at)) / DAY);
    const d = new Date(at);
    const clock = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
    const who = by ? ` door ${by}` : '';
    if (days <= 0) return `opgeslagen vandaag om ${clock}${who}`;
    return days === 1 ? `opgeslagen gisteren om ${clock}${who}` : `opgeslagen ${days} dagen geleden${who}`;
  }

  const cleanTitle = (t) => String(t || '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();

  // Een regel uit Supabase als ontwerp in de lijst
  function fromRow(row) {
    return {
      id: row.id,
      tool: row.tool,
      slot: row.slot || null,
      title: cleanTitle(row.title) || 'Zonder titel',
      sub: row.sub || '',
      noun: row.noun || 'ontwerp',
      ratio: row.ratio || '1 / 1',
      thumb: row.thumb || '',
      files: Array.isArray(row.files) ? row.files : [],
      savedAt: Date.parse(row.updated_at),
      expires: Date.parse(row.expires_at),
      rev: row.updated_at,
      by: row.updated_by_name || '',
      byId: row.updated_by || null,
    };
  }

  // Waar een bestand van een ontwerp staat: <id>/<sleutel>, met alleen veilige tekens
  const filePath = (id, key) => `${id}/${String(key).replace(/[^A-Za-z0-9._-]/g, '_')}`;

  // Heeft iemand het ontwerp opgeslagen sinds jij het opende of opsloeg? (rev = updated_at)
  const changedSince = (cur, row) => !!(cur && cur.rev && row && row.updated_at && row.updated_at !== cur.rev);

  // Wie het opsloeg, zoals de lijst het zegt: "jou" of de naam
  const byWho = (entry, meId) => (!entry || !entry.by ? '' : meId && entry.byId === meId ? 'jou' : entry.by);

  const api = { DAYS, prune, upsert, daysLeft, leftText, savedText, cleanTitle, fromRow, filePath, changedSince, byWho };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  const PM = global.PM;
  if (!PM || !global.document) return;

  /* ---------------------------------------------------------------------------
     Opslag: Supabase, met de lijst ook in het geheugen van deze browser
     ------------------------------------------------------------------------- */

  const store = PM.store;
  const doc = global.document;
  const cloud = () => (PM.account ? PM.account.client() : Promise.reject(new Error('Log in om de bieb te gebruiken.')));
  const meId = () => {
    const me = PM.account && PM.account.current();
    return me ? me.id : null;
  };
  const newId = () => (global.crypto && global.crypto.randomUUID
    ? global.crypto.randomUUID()
    : `${Date.now().toString(36)}-${PM.uid()}${PM.uid()}`);

  // Een fout in gewone taal, achter "Opslaan lukte niet."
  function reason(err) {
    const msg = String((err && err.message) || '');
    const status = Number(err && err.status) || 0;
    if (/fetch|network|verbinding|Load failed/i.test(msg)) return 'Geen verbinding met de server. Controleer je internet en probeer het opnieuw.';
    if (status === 401 || /JWT|jwt|not authenticated|Log in/i.test(msg)) return 'Je bent niet (meer) ingelogd. Log opnieuw in en probeer het nog eens.';
    if (status === 413 || /too large|Payload/i.test(msg)) return 'Een foto in je ontwerp is te groot (hoogstens 25 MB).';
    return msg ? `(${msg})` : 'Probeer het zo nog eens.';
  }

  const cached = () => {
    const saved = store.get(CACHE_KEY, []);
    return Array.isArray(saved) ? saved.filter(valid) : [];
  };
  function writeCache(list) {
    if (!store.set(CACHE_KEY, list)) store.set(CACHE_KEY, list.map((e) => ({ ...e, thumb: '' })));   // vol: zonder miniaturen
  }
  const putCache = (entry) => writeCache(upsert(cached(), entry));
  const dropCache = (id) => writeCache(cached().filter((e) => e.id !== id));
  const emit = () => global.dispatchEvent(new CustomEvent('pm-library'));

  const list = (tool) => prune(cached(), Date.now()).keep.filter((e) => !tool || e.tool === tool);

  let state = 'laden';
  let lastRefresh = 0;
  let refreshing = null;
  const status = () => state;

  // De lijst van nu (zonder de toestanden zelf: die komen pas bij openen)
  function refresh() {
    if (!refreshing) {
      refreshing = (async () => {
        const moved = await migrate().catch(() => 0);
        const c = await cloud();
        const { data, error } = await c.from('designs').select(COLUMNS)
          .gt('expires_at', new Date().toISOString())
          .order('updated_at', { ascending: false })
          .limit(300);
        if (error) throw error;
        writeCache((data || []).map(fromRow));
        state = 'klaar';
        lastRefresh = Date.now();
        emit();
        if (moved) PM.toast(`De bieb is nu van het hele team. ${moved === 1 ? 'Je ontwerp uit deze browser staat' : `Je ${moved} ontwerpen uit deze browser staan`} er nu ook in, voor je collega's.`);
        purge().catch(() => {});
        return list();
      })().catch((err) => {
        state = cached().length ? 'klaar' : 'fout';
        emit();
        throw err;
      }).finally(() => {
        refreshing = null;
      });
    }
    return refreshing;
  }

  // Terug in dit tabblad: misschien heeft een collega intussen iets opgeslagen
  doc.addEventListener('visibilitychange', () => {
    if (doc.visibilityState === 'visible' && Date.now() - lastRefresh > 30e3) refresh().catch(() => {});
  });

  async function putFile(c, id, key, blob) {
    const { error } = await c.storage.from(BUCKET).upload(filePath(id, key), blob, {
      upsert: true,
      contentType: blob.type || 'application/octet-stream',
    });
    if (error) throw error;
  }

  // Weggooien: verlopen zetten (een dag later ruimt purge het op), dus terug te zetten
  async function setExpires(id, time) {
    const c = await cloud();
    const { data, error } = await c.from('designs').update({ expires_at: new Date(time).toISOString() }).eq('id', id).select(COLUMNS).maybeSingle();
    if (error) throw error;
    return data;
  }

  async function remove(id) {
    await setExpires(id, Date.now());
    dropCache(id);
    emit();
  }

  // Verlopen en weggegooide ontwerpen opruimen, met hun bestanden. Hoogstens eens per zes uur per
  // browser, en pas een dag na het verlopen: zo kan weggooien nog ongedaan
  async function purge() {
    if (Date.now() - (Number(store.get(PURGE_KEY, 0)) || 0) < 6 * 36e5) return;
    store.set(PURGE_KEY, Date.now());
    const c = await cloud();
    const { data, error } = await c.from('designs').select('id, files').lt('expires_at', new Date(Date.now() - DAY).toISOString()).limit(50);
    if (error) return;
    for (const row of data || []) {
      const paths = (row.files || []).map((k) => filePath(row.id, k));
      if (paths.length) await c.storage.from(BUCKET).remove(paths);
      await c.from('designs').delete().eq('id', row.id);
    }
  }

  // De oude bieb van alleen deze browser naar de bieb van het team (eenmalig, ontwerp voor ontwerp)
  let migrating = null;
  function migrate() {
    if (!migrating) {
      migrating = (async () => {
        const old = store.get(OLD_INDEX_KEY, null);
        if (!Array.isArray(old)) return 0;
        const { keep, gone } = prune(old, Date.now());
        for (const e of gone) if (e && e.id) await PM.idb.del(oldRecordKey(e.id));
        const c = keep.length ? await cloud() : null;
        let moved = 0;
        for (const e of keep) {
          const record = await PM.idb.get(oldRecordKey(e.id));
          if (record && record.state) {
            const id = /^[a-z0-9-]{6,64}$/.test(e.id) ? e.id : newId();
            const files = [];
            for (const [key, blob] of Object.entries(record.files || {})) {
              if (!(blob instanceof Blob)) continue;
              await putFile(c, id, key, blob);
              files.push(key);
            }
            const { data, error } = await c.from('designs').upsert({
              id,
              tool: e.tool,
              slot: (e.tool === 'presentation' && record.state.type) || null,
              title: (cleanTitle(e.title) || 'Zonder titel').slice(0, 300),
              sub: String(e.sub || '').slice(0, 300),
              noun: String(e.noun || 'ontwerp').slice(0, 60),
              ratio: String(e.ratio || '1 / 1').slice(0, 20),
              thumb: e.thumb || '',
              state: record.state,
              files,
              expires_at: new Date(e.expires).toISOString(),
            }, { onConflict: 'id' }).select('id, updated_at').single();
            if (error) throw error;
            // Stond dit ontwerp open in een maker? Dan hoort het daar nu bij de bieb van het team
            const current = store.get(CURRENT_KEY, {}) || {};
            for (const [slot, cur] of Object.entries(current)) {
              if (cur && cur.id === e.id) current[slot] = { ...cur, id: data.id, rev: data.updated_at };
            }
            store.set(CURRENT_KEY, current);
            moved++;
          }
          await PM.idb.del(oldRecordKey(e.id));
          store.set(OLD_INDEX_KEY, (store.get(OLD_INDEX_KEY, []) || []).filter((x) => x && x.id !== e.id));
        }
        store.remove(OLD_INDEX_KEY);
        return moved;
      })().finally(() => {
        migrating = null;
      });
    }
    return migrating;
  }

  const clone = (v) => JSON.parse(JSON.stringify(v));
  const dateText = (t) => new Date(t).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' });

  // Miniatuur: hoogstens 240 px breed als JPEG, klein genoeg voor de lijst
  function shrink(canvas) {
    if (!canvas || !canvas.width || !canvas.height) return '';
    const w = Math.min(240, canvas.width);
    const h = Math.round((canvas.height * w) / canvas.width);
    const c = doc.createElement('canvas');
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
    const readCurrent = () => (store.get(CURRENT_KEY, {}) || {})[slotKey()] || { id: null, dirty: false, rev: null };
    const writeCurrent = (value) => store.set(CURRENT_KEY, { ...(store.get(CURRENT_KEY, {}) || {}), [slotKey()]: value });
    let applying = false;

    const body = doc.querySelector('[data-lib]');
    const button = doc.getElementById('libBtn');
    const saveBtn = doc.getElementById('libSave');

    // De stip op opslaan: er zijn wijzigingen die nog niet in de bieb staan
    function syncDot() {
      if (!saveBtn) return;
      const unsaved = !!readCurrent().dirty;
      saveBtn.classList.toggle('has-dot', unsaved);
      saveBtn.title = unsaved ? 'Opslaan in de bieb: er zijn wijzigingen die nog niet zijn opgeslagen' : 'Opgeslagen in de bieb';
    }

    function summary(st) {
      try {
        return (meta.draft && meta.draft.summary(st)) || {};
      } catch (err) {
        return {};
      }
    }

    // Wat het open ontwerp in de bieb is (volgens de lijst in het geheugen)
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
      writeCurrent({ id: null, dirty: false, rev: null });
      render();
    }

    // Het ontwerp in Supabase, zonder de toestand: bestaat het nog, en van wanneer is het?
    async function remote(c, id) {
      const { data, error } = await c.from('designs').select(BRIEF).eq('id', id).maybeSingle();
      if (error) throw error;
      return data && Date.parse(data.expires_at) > Date.now() ? data : null;
    }

    /**
     * Opslaan: het open ontwerp overschrijft zijn plek in de bieb (weer 14 dagen), of komt
     * er nieuw in. asNew: altijd als nieuw. state: een ander ontwerp dan het open ontwerp
     * (zonder miniatuur, niet gekoppeld). quiet: zonder melding. force: ook overschrijven als
     * iemand anders het intussen opsloeg (na de vraag); anders wordt het dan een nieuw ontwerp.
     * Eén tegelijk, op volgorde.
     */
    let queue = Promise.resolve();
    function save(o = {}) {
      const run = queue.then(() => write(o));
      queue = run.catch(() => null);
      return run;
    }

    async function write({ asNew = false, quiet = false, state: other = null, force = false } = {}) {
      const st = clone(other || opts.getState());
      const keys = Array.from(new Set((opts.fileKeys(st) || []).filter(Boolean)));
      const cur = other ? { id: null } : readCurrent();
      try {
        const c = await cloud();
        const found = !asNew && cur.id ? await remote(c, cur.id) : null;
        const forked = !!(found && !force && changedSince(cur, found));
        const row = forked ? null : found;
        const id = row ? row.id : newId();
        const had = new Set(row ? row.files || [] : []);

        // De bestanden: wat er al staat blijft, de rest uit deze browser (of gekopieerd uit het
        // ontwerp waar het van afkomt)
        const files = [];
        for (const key of keys) {
          if (had.has(key)) {
            files.push(key);
            continue;
          }
          const blob = await PM.idb.get(key);
          if (blob instanceof Blob) {
            await putFile(c, id, key, blob);
            files.push(key);
          } else if (found && (found.files || []).includes(key)) {
            const { error } = await c.storage.from(BUCKET).copy(filePath(found.id, key), filePath(id, key));
            if (!error) files.push(key);
          }
        }

        let thumb = '';
        if (!other && opts.thumb) {
          try {
            thumb = shrink(await opts.thumb());
          } catch (err) {
            thumb = '';
          }
        }
        const info = summary(st);
        const slot = opts.slot ? String((other ? other.type : opts.slot()) || '') : '';
        const { data, error } = await c.from('designs').upsert({
          id,
          tool,
          slot: /^[a-z0-9_-]{1,32}$/.test(slot) ? slot : null,
          title: (cleanTitle(info.title) || 'Zonder titel').slice(0, 300),
          sub: String(info.sub || '').slice(0, 300),
          noun: String(info.noun || 'ontwerp').slice(0, 60),
          ratio: String(info.ratio || '1 / 1').slice(0, 20),
          thumb,
          state: st,
          files,
          expires_at: new Date(Date.now() + DAYS * DAY).toISOString(),
        }, { onConflict: 'id' }).select(COLUMNS).single();
        if (error) throw error;

        // Bestanden die niet meer in het ontwerp staan, weg (stil: een rest kan geen kwaad)
        const stale = [...had].filter((k) => !files.includes(k));
        if (stale.length) c.storage.from(BUCKET).remove(stale.map((k) => filePath(id, k))).catch(() => {});

        const entry = fromRow(data);
        putCache(entry);
        if (!other) writeCurrent({ id, dirty: false, rev: data.updated_at });
        render();
        emit();
        if (forked) {
          const who = found.updated_by && found.updated_by === meId() ? 'Je had dit ontwerp in een ander venster' : `${found.updated_by_name || 'Een collega'} had dit ontwerp intussen ook`;
          PM.toast(`${who} aangepast. Jouw versie staat apart in de bieb, als nieuw ontwerp: ${entry.title}.`);
        } else if (!quiet) {
          PM.toast(`${row ? 'Opgeslagen over de vorige versie' : 'Opgeslagen in de bieb'}: ${entry.title}. Je collega's zien hem ook; hij blijft staan tot ${dateText(entry.expires)}.`);
        }
        return entry;
      } catch (err) {
        if (!quiet) PM.toast(`Opslaan in de bieb lukte niet. ${reason(err)}`, true);
        return null;
      }
    }

    // Na een download: alleen opslaan wat nog niet in de bieb staat (nooit overschrijven)
    function autoSave() {
      return readCurrent().id ? Promise.resolve(null) : save({ quiet: true });
    }

    /* --- De vraag bij opslaan: overschrijven of als nieuw --- */

    let askDialog = null;
    function ask(row, conflict) {
      if (!askDialog) {
        askDialog = doc.createElement('dialog');
        askDialog.className = 'keys lib-ask';
        askDialog.setAttribute('aria-labelledby', 'libAskTitle');
        doc.body.appendChild(askDialog);
      }
      const e = fromRow(row);
      const when = savedText(e.savedAt, Date.now());
      const mine = e.byId && e.byId === meId();
      const lead = conflict
        ? `${mine ? 'Je hebt' : `<b>${esc(e.by || 'Een collega')}</b> heeft`} <b>${esc(e.title)}</b> intussen ${mine ? 'in een ander venster ' : ''}ook aangepast (${esc(when.replace(/^opgeslagen /, ''))}). Overschrijf je het, dan is ${mine ? 'die versie' : 'hun versie'} weg.`
        : `Dit ontwerp staat al in de bieb als <b>${esc(e.title)}</b>, ${esc(savedText(e.savedAt, Date.now(), byWho(e, meId())))}.`;
      const over = `<button type="button" class="lib-ask__choice" data-choice="over">
            <b>${conflict ? (mine ? 'Die versie overschrijven' : 'Hun versie overschrijven') : 'Vorige versie overschrijven'}</b>
            <span>${conflict ? 'Jouw versie komt ervoor in de plaats. In de bieb blijft één versie staan: deze.' : 'Je past hetzelfde ontwerp aan. In de bieb blijft één versie staan: deze.'}</span>
          </button>`;
      const fresh = `<button type="button" class="lib-ask__choice" data-choice="new">
            <b>Opslaan als nieuw ontwerp</b>
            <span>${conflict ? 'Allebei de versies blijven staan. Zo raakt niemand iets kwijt.' : 'De vorige versie blijft ook staan. Handig voor een tweede variant of een andere klant.'}</span>
          </button>`;
      askDialog.innerHTML = `
        <div class="keys__head">
          <h2 class="keys__title" id="libAskTitle">Opslaan<span class="dot">.</span></h2>
          <button type="button" class="panel__close keys__close" data-choice="" aria-label="Annuleren">${ICON.close}</button>
        </div>
        <div class="lib-ask__body">
          <p class="lib-ask__lead">${lead}</p>
          ${conflict ? fresh + over : over + fresh}
          <button type="button" class="linkbtn lib-ask__cancel" data-choice="">annuleren</button>
        </div>`;
      return new Promise((resolve) => {
        const done = (choice) => {
          askDialog.onclick = null;
          askDialog.onclose = null;
          if (askDialog.open) askDialog.close();
          resolve(choice);
        };
        askDialog.onclick = (ev) => {
          if (ev.target === askDialog) return done(null);   // klik op de achtergrond
          const b = ev.target.closest('[data-choice]');
          if (b) done(b.dataset.choice || null);
        };
        askDialog.onclose = () => done(null);   // Escape
        if (typeof askDialog.showModal === 'function') askDialog.showModal();
        else askDialog.setAttribute('open', '');
        const first = askDialog.querySelector('.lib-ask__choice');
        if (first) first.focus();
      });
    }

    // De knop opslaan: nieuw meteen; al in de bieb met wijzigingen: eerst de vraag
    async function saveClick() {
      const cur = readCurrent();
      if (!cur.id) return save();
      let row = null;
      try {
        row = await remote(await cloud(), cur.id);
      } catch (err) {
        PM.toast(`Opslaan in de bieb lukte niet. ${reason(err)}`, true);
        return null;
      }
      if (!row) return save({ asNew: true });   // weggegooid of verlopen: opnieuw erin
      const conflict = changedSince(cur, row);
      if (!cur.dirty && conflict) {
        // Niets veranderd, maar er is een nieuwere versie: die openen in plaats van terugzetten
        const e = fromRow(row);
        PM.toast(`${e.by || 'Een collega'} heeft ${e.title} intussen aangepast. Je hebt zelf niets veranderd.`, false, { label: 'open de nieuwste', run: () => open(row.id) });
        return null;
      }
      if (!cur.dirty) {
        try {
          const data = await setExpires(row.id, Date.now() + DAYS * DAY);
          const entry = fromRow(data || row);
          putCache(entry);
          render();
          emit();
          PM.toast(`Al opgeslagen, er is niets veranderd. ${entry.title} blijft nu staan tot ${dateText(entry.expires)}.`);
          return entry;
        } catch (err) {
          PM.toast(`Opslaan in de bieb lukte niet. ${reason(err)}`, true);
          return null;
        }
      }
      const choice = await ask(row, conflict);
      if (choice === 'over') return save({ force: true });
      if (choice === 'new') return save({ asNew: true });
      return null;
    }

    // Een ontwerp uit de bieb openen, altijd de nieuwste versie (ook als het al open staat)
    async function open(id) {
      const before = readCurrent();
      let c;
      let row;
      try {
        c = await cloud();
        const { data, error } = await c.from('designs').select(`${COLUMNS}, state`).eq('id', id).maybeSingle();
        if (error) throw error;
        row = data && Date.parse(data.expires_at) > Date.now() ? data : null;
      } catch (err) {
        PM.toast(`Openen lukte niet. ${reason(err)}`, true);
        return false;
      }
      if (!row || !row.state) {
        dropCache(id);
        render();
        emit();
        PM.toast('Dit ontwerp staat niet meer in de bieb. Iemand heeft het weggehaald, of het is na 14 dagen vanzelf verdwenen.', true);
        return false;
      }
      // Niets kwijtraken en niets overschrijven: wat er open stond en gewijzigd is, eerst als
      // nieuw ontwerp in de bieb
      let kept = null;
      if (before.dirty && before.id !== id) kept = await save({ quiet: true, asNew: true });
      const prev = readCurrent();

      // De bestanden in deze browser zetten (wat er al staat, hoeft niet opnieuw)
      const keys = (await Promise.all((row.files || []).map(async (key) => {
        if ((await PM.idb.get(key)) instanceof Blob) return key;
        const { data: blob, error } = await c.storage.from(BUCKET).download(filePath(id, key));
        if (error || !(blob instanceof Blob)) return null;
        await PM.idb.set(key, blob);
        return key;
      }))).filter(Boolean);
      const missing = (row.files || []).length - keys.length;

      applying = true;
      try {
        await opts.apply(clone(row.state), keys);
      } finally {
        applying = false;
      }
      writeCurrent({ id, dirty: false, rev: row.updated_at });
      const entry = fromRow(row);
      putCache(entry);
      if (opts.close) opts.close();
      const undo = opts.undo ? {
        label: 'ongedaan maken',
        run: () => {
          opts.undo();
          writeCurrent(prev);
          render();
        },
      } : null;
      const who = byWho(entry, meId());
      PM.toast(`Geopend uit de bieb: ${entry.title}${who && who !== 'jou' ? `, van ${who}` : ''}.${kept ? ` Wat je open had, staat ook in de bieb, als nieuw ontwerp (${kept.title}).` : ''}${missing ? ` ${missing === 1 ? 'Eén foto kon' : `${missing} foto's konden`} niet mee; zet ${missing === 1 ? 'hem' : 'ze'} er opnieuw in.` : ''}`, !!missing, undo);
      render();
      return true;
    }

    async function removeEntry(id) {
      const entry = list(tool).find((e) => e.id === id);
      if (!entry) return;
      try {
        await remove(id);
      } catch (err) {
        PM.toast(`Weggooien lukte niet. ${reason(err)}`, true);
        return;
      }
      const cur = readCurrent();
      if (cur.id === id) writeCurrent({ id: null, dirty: true, rev: null });
      render();
      PM.toast(`Uit de bieb gehaald: ${entry.title}. Ook voor je collega's.`, false, {
        label: 'ongedaan maken',
        run: async () => {
          try {
            const data = await setExpires(id, entry.expires);
            putCache(data ? fromRow(data) : entry);
            if (cur.id === id) writeCurrent(cur);
            render();
            emit();
          } catch (err) {
            PM.toast(`Terugzetten lukte niet. ${reason(err)}`, true);
          }
        },
      });
    }

    /* --- De popover: de lijst met openen en weggooien --- */

    function itemHtml(e, isCurrent, now, me) {
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
            <span class="lib__meta lib__when">${esc(savedText(e.savedAt, now, byWho(e, me)))} · <span class="lib__left${n <= 2 ? ' is-soon' : ''}">${esc(leftText(n))}</span></span>
          </span>
          ${isCurrent
            ? '<span class="lib__open">nu open</span>'
            : `<button type="button" class="btn btn-outline btn-xs" data-lib-open="${esc(e.id)}">open<span class="sr-only"> ${esc(e.title)}</span></button>`}
          <button type="button" class="iconbtn lib__del" data-lib-del="${esc(e.id)}" aria-label="${esc(`${e.title} uit de bieb halen, ook voor je collega's`)}" title="uit de bieb halen (ook voor je collega's)">${ICON.del}</button>
        </li>`;
    }

    function render() {
      const entries = list(tool);
      const count = button && button.querySelector('[data-lib-count]');
      if (count) count.textContent = entries.length ? String(entries.length) : '';
      syncDot();
      if (!body) return;
      const now = Date.now();
      const cur = readCurrent();
      const empty = state === 'laden'
        ? '<p class="lib__empty">Even laden…</p>'
        : state === 'fout'
          ? '<p class="lib__empty">De bieb is nu niet bereikbaar. Controleer je internet en open hem opnieuw.</p>'
          : '<p class="lib__empty">Nog niets opgeslagen. Klik op opslaan; wat je opslaat, vind je hier en op het dashboard terug, en je collega\'s ook.</p>';
      body.innerHTML = `
        <p class="lib__lead">De ontwerpen van het hele team: open er een om verder te werken. Ze blijven ${DAYS} dagen staan na de laatste keer opslaan. Opslaan doe je met de knop links van bieb.</p>
        ${entries.length
          ? `<ul class="lib__list" aria-label="Opgeslagen in de bieb">${entries.map((e) => itemHtml(e, cur.id === e.id, now, meId())).join('')}</ul>`
          : empty}`;
    }

    if (body) {
      body.addEventListener('click', (e) => {
        const t = e.target.closest('button');
        if (!t) return;
        if (t.dataset.libOpen) open(t.dataset.libOpen);
        else if (t.dataset.libDel) removeEntry(t.dataset.libDel);
      });
    }
    // Elke keer dat je hem opent de stand van nu (dagen, wat er open staat, wat collega's opsloegen)
    if (button) {
      button.addEventListener('click', () => {
        render();
        if (Date.now() - lastRefresh > 10e3) refresh().catch(() => {});
      });
    }
    if (saveBtn) saveBtn.addEventListener('click', saveClick);
    global.addEventListener('pm-library', render);
    render();
    refresh().catch(() => {});

    // Van het dashboard: een ontwerp openen, of de lijst tonen
    if (opts.openId === 'lijst' && button) setTimeout(() => button.click(), 0);
    else if (opts.openId) setTimeout(() => open(opts.openId), 0);

    // Staat het ontwerp van dit soort al ongewijzigd in de bieb? Dan hoeft het niet nog eens
    function isClean(slot) {
      const cur = (store.get(CURRENT_KEY, {}) || {})[slot == null ? tool : `${tool}:${slot}`];
      return !!(cur && cur.id && !cur.dirty);
    }

    // Gewijzigd sinds de laatste keer opslaan (of nooit opgeslagen en wel aangepast)?
    const isDirty = () => !!readCurrent().dirty;

    return { save, autoSave, saveClick, open, touch, detach, render, isClean, isDirty, currentEntry };
  }

  PM.library = { ...api, list, refresh, status, remove, attach };
})(typeof window !== 'undefined' ? window : globalThis);
