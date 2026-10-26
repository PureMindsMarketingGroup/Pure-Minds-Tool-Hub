/* =============================================================================
   library.js — de bieb in een maker: vanzelf opslaan, zoals Google Docs en Canva
   -----------------------------------------------------------------------------
   Elk ontwerp is een document in de bieb van het team (js/shared/designs.js,
   Supabase). Elke wijziging komt er binnen een paar seconden vanzelf in; er is
   geen knop opslaan meer nodig. Rechtsboven staat hoe het ervoor staat
   (#libSave: opgeslagen, opslaan…, offline); een klik slaat meteen op.

   - Een leeg, onaangeraakt ontwerp wordt niet bewaard: pas bij de eerste
     echte wijziging komt het in de bieb.
   - Nieuw beginnen (een starttegel, "nieuw", de AI) begint een nieuw ontwerp;
     het vorige blijft gewoon in de bieb, en de melding kan er terug naartoe.
   - Heeft een collega hetzelfde ontwerp intussen opgeslagen, dan overschrijft
     opslaan niets: jouw versie wordt een kopie, met een melding. Zie je dat een
     collega het ontwerp open heeft, dan zegt de appbalk dat al vooraf.
   - Opent een ontwerp waar een collega intussen aan werkte, dan komt de
     nieuwste versie vanzelf (alleen als je zelf niets onopgeslagen hebt).
   - Eerdere versies (de database bewaart ze, supabase/teambieb.sql) en de
     prullenbak (30 dagen) zitten in het menu bij elk ontwerp in de bieb.
   - Zonder verbinding blijft je werk in deze browser staan (de maker bewaart
     het zelf al) en gaat het mee zodra er weer verbinding is.

   Een maker heeft per soort één open ontwerp (de presentatie heeft er drie:
   presentatie, voorstel, positionering). Welk ontwerp dat is, staat in
   localStorage (pm-library-current-v1: { 'tool' of 'tool:soort': { id, rev,
   dirty, files } }).

     PM.library.attach(opts)    de bieb in een maker; geeft de controller hieronder
       opts.tool                id uit js/shared/tools.js (titel via draft.summary)
       opts.slot()              optioneel: soort binnen de tool
       opts.getState()          de toestand die bewaard wordt
       opts.fileKeys(state)     sleutels in IndexedDB van de bestanden in die toestand
       opts.apply(state, keys)  een ontwerp uit de bieb openen
       opts.thumb()             optioneel: een canvas als miniatuur
       opts.close()             optioneel: de popover sluiten
       opts.openId              uit de link: ?bieb=<id> (of 'lijst'), en ?versie=<id>
       opts.fresh               gestart met een starttegel: de toestand van vóór de
                                start (die gaat eerst nog naar zijn eigen ontwerp)
     controller.touch()         er is iets veranderd (elke wijziging, ook ongedaan maken)
     controller.hold(fn)        fn telt niet als wijziging (wisselen van soort, leeg beginnen)
     controller.detach()        een nieuw ontwerp beginnen; geeft het vorige { id } terug
     controller.fork()          wat er openstaat wordt een nieuw ontwerp (na de AI)
     controller.pause(), resume()  even niet wegschrijven (terwijl de AI invult)
     controller.flush()         nu opslaan (belofte); autoSave() hetzelfde, na een download
     controller.open(id)        een ontwerp openen (de nieuwste versie)
     controller.sync()          de nieuwste versie ophalen als een collega hem aanpaste
     controller.saveOther(st)   een andere toestand apart in de bieb (een geparkeerde soort)
     controller.saveSlot(s, st) een geparkeerde soort met wijzigingen naar zijn eigen ontwerp
     controller.isClean(slot), isDirty()
   ============================================================================= */
(function (global) {
  'use strict';

  const CURRENT_KEY = 'pm-library-current-v1';
  const DELAY = 1500;       // zo lang na de laatste wijziging gaat het de cloud in
  const MAX_WAIT = 8000;    // en nooit later dan dit na de eerste
  const BEAT = 45e3;        // "ik heb dit open" voor collega's

  /* ---------------------------------------------------------------------------
     Rekenwerk, zonder browser (getest in tests/library.test.js)
     ------------------------------------------------------------------------- */

  // Wat de knop rechtsboven zegt
  function statusText(status, pending) {
    if (status === 'offline') return { label: 'offline', title: 'Geen verbinding. Je werk blijft in deze browser staan en gaat de bieb in zodra er weer verbinding is.' };
    if (status === 'fout') return { label: 'niet opgeslagen', title: 'Opslaan in de bieb lukte niet. Klik om het opnieuw te proberen.' };
    if (status === 'bezig' || pending) return { label: 'opslaan…', title: 'Je wijzigingen gaan de bieb van het team in.' };
    return { label: 'opgeslagen', title: 'Alles staat in de bieb van het team. Opslaan gaat vanzelf.' };
  }

  // Na een mislukte poging: steeds wat langer wachten, hoogstens een minuut
  const retryDelay = (attempt) => Math.min(60e3, 3000 * 2 ** Math.max(0, attempt - 1));

  const api = { statusText, retryDelay, DELAY, MAX_WAIT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  const PM = global.PM;
  if (!PM || !global.document || !PM.designs) return;

  const D = PM.designs;
  const store = PM.store;
  const doc = global.document;
  const esc = PM.esc;
  const clone = (v) => JSON.parse(JSON.stringify(v));

  const svg = (d) => `<svg class="ri" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
  const ICON = {
    close: svg('M12 10.59 16.95 5.64l1.41 1.41L13.41 12l4.95 4.95-1.41 1.41L12 13.41l-4.95 4.95-1.41-1.41L10.59 12 5.64 7.05l1.41-1.41z'),
    cloud: svg('M12 2C15.866 2 19 5.134 19 9C19 9.114 18.997 9.226 18.992 9.339C21.327 10.16 23 12.385 23 15C23 18.314 20.314 21 17 21H7C3.686 21 1 18.314 1 15C1 12.385 2.673 10.16 5.008 9.339C5.003 9.226 5 9.114 5 9C5 5.134 8.134 2 12 2ZM12 4C9.239 4 7 6.239 7 9C7 9.081 7.002 9.163 7.006 9.243L7.077 10.731L5.672 11.225C4.084 11.784 3 13.289 3 15C3 17.209 4.791 19 7 19H17C19.209 19 21 17.209 21 15C21 12.79 19.21 11 17 11C15.233 11 13.734 12.146 13.204 13.735L11.306 13.102C12.101 10.719 14.35 9 17 9C17 6.239 14.761 4 12 4Z'),
    off: svg('M3.515 2.101L22.607 21.192L21.192 22.607L19.178 20.592C18.503 20.856 17.768 21 17 21H7C3.686 21 1 18.314 1 15C1 12.385 2.673 10.16 5.008 9.339C5.003 9.226 5 9.114 5 9C5 8.222 5.127 7.474 5.361 6.775L2.101 3.515L3.515 2.101ZM7 9C7 9.081 7.002 9.163 7.006 9.243L7.077 10.731L5.672 11.225C4.084 11.784 3 13.289 3 15C3 17.209 4.791 19 7 19H17C17.186 19 17.369 18.987 17.548 18.963L7.03 8.445C7.01 8.627 7 8.812 7 9ZM12 2C15.866 2 19 5.134 19 9C19 9.114 18.997 9.226 18.992 9.339C21.327 10.16 23 12.385 23 15C23 16.088 22.71 17.109 22.204 17.989L20.711 16.496C20.897 16.034 21 15.529 21 15C21 12.79 19.21 11 17 11C16.471 11 15.966 11.103 15.504 11.289L14.011 9.796C14.891 9.29 15.912 9 17 9C17 6.239 14.761 4 12 4C10.93 4 9.938 4.336 9.124 4.909L7.694 3.481C8.882 2.553 10.376 2 12 2Z'),
    sync: svg('M5.463 4.433C7.216 2.917 9.501 2 12 2C17.523 2 22 6.477 22 12C22 14.136 21.33 16.116 20.189 17.741L17 12H20C20 7.582 16.418 4 12 4C9.85 4 7.898 4.848 6.46 6.228L5.463 4.433ZM18.537 19.567C16.784 21.083 14.499 22 12 22C6.477 22 2 17.523 2 12C2 9.864 2.67 7.884 3.811 6.259L7 12H4C4 16.418 7.582 20 12 20C14.15 20 16.102 19.152 17.54 17.772L18.537 19.567Z'),
    more: svg('M12 3C11.175 3 10.5 3.675 10.5 4.5C10.5 5.325 11.175 6 12 6C12.825 6 13.5 5.325 13.5 4.5C13.5 3.675 12.825 3 12 3ZM12 18C11.175 18 10.5 18.675 10.5 19.5C10.5 20.325 11.175 21 12 21C12.825 21 13.5 20.325 13.5 19.5C13.5 18.675 12.825 18 12 18ZM12 10.5C11.175 10.5 10.5 11.175 10.5 12C10.5 12.825 11.175 13.5 12 13.5C12.825 13.5 13.5 12.825 13.5 12C13.5 11.175 12.825 10.5 12 10.5Z'),
    search: svg('M18.031 16.617L22.314 20.9L20.9 22.314L16.617 18.031C15.077 19.263 13.124 20 11 20C6.032 20 2 15.968 2 11C2 6.032 6.032 2 11 2C15.968 2 20 6.032 20 11C20 13.124 19.263 15.077 18.031 16.617ZM16.025 15.875C17.248 14.615 18 12.896 18 11C18 7.133 14.868 4 11 4C7.133 4 4 7.133 4 11C4 14.868 7.133 18 11 18C12.896 18 14.615 17.248 15.875 16.025L16.025 15.875Z'),
  };

  /* ---------------------------------------------------------------------------
     Dialogen: naam wijzigen en eerdere versies (ook voor bieb.html)
     ------------------------------------------------------------------------- */

  let dialog = null;
  function openDialog(title, body) {
    if (!dialog) {
      dialog = doc.createElement('dialog');
      dialog.className = 'keys lib-ask';
      dialog.setAttribute('aria-labelledby', 'libDlgTitle');
      doc.body.appendChild(dialog);
      dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
    }
    dialog.innerHTML = `
      <div class="keys__head">
        <h2 class="keys__title" id="libDlgTitle">${esc(title)}<span class="dot">.</span></h2>
        <button type="button" class="panel__close keys__close" data-close aria-label="Sluiten">${ICON.close}</button>
      </div>
      <div class="lib-ask__body">${body}</div>`;
    dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    return dialog;
  }

  // Een eigen naam: belofte met de nieuwe naam, '' (terug naar de titel uit de inhoud) of null (annuleren)
  function askName(entry) {
    const d = openDialog('Naam wijzigen', `
      <form class="lib-name" method="dialog">
        <label class="label" for="libName">Naam in de bieb</label>
        <input class="input" id="libName" maxlength="200" value="${esc(entry.name || entry.title)}" placeholder="${esc(entry.auto)}">
        <p class="field-hint">Leeg laten: de titel uit het ontwerp zelf (${esc(entry.auto)}).</p>
        <div class="lib-name__foot">
          <button type="button" class="linkbtn" data-close-cancel>annuleren</button>
          <button type="submit" class="btn btn-primary btn-sm">opslaan</button>
        </div>
      </form>`);
    const input = d.querySelector('#libName');
    input.focus();
    input.select();
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => {
        if (done) return;
        done = true;
        if (d.open) d.close();
        resolve(v);
      };
      d.querySelector('form').addEventListener('submit', (e) => {
        e.preventDefault();
        finish(input.value.trim());
      });
      d.querySelector('[data-close-cancel]').addEventListener('click', () => finish(null));
      d.addEventListener('close', () => finish(null), { once: true });
    });
  }

  // De lijst met eerdere versies; kiezen geeft de versie terug (belofte), annuleren null
  async function askVersion(entry) {
    const d = openDialog('Eerdere versies', '<p class="lib-ask__lead">Even laden…</p>');
    let list = [];
    try {
      list = await D.versions(entry.id);
    } catch (err) {
      d.querySelector('.lib-ask__body').innerHTML = `<p class="lib-ask__lead">De versies zijn nu niet te laden. ${esc(D.reason(err))}</p>`;
      return null;
    }
    const now = Date.now();
    const me = D.meId();
    d.querySelector('.lib-ask__body').innerHTML = `
      <p class="lib-ask__lead"><b>${esc(entry.title)}</b>. De bieb bewaart vanzelf een versie, hoogstens elke 10 minuten en altijd voordat een collega het aanpast. Terugzetten maakt van wat er nu staat ook eerst een versie.</p>
      ${list.length
        ? `<ul class="lib-versions">${list.map((v) => {
          const who = v.saved_by && v.saved_by === me ? 'jou' : v.saved_by_name || '';
          return `<li><span><b>${esc(D.editedText(Date.parse(v.saved_at), now, who, 'versie van').replace(/^versie van /, ''))}</b><span class="lib__meta">${esc(D.cleanTitle(v.title) || 'Zonder titel')}</span></span>
            <button type="button" class="btn btn-outline btn-xs" data-version="${esc(v.id)}">zet terug</button></li>`;
        }).join('')}</ul>`
        : '<p class="lib__empty">Nog geen eerdere versies. Die komen vanzelf zodra er aan dit ontwerp gewerkt wordt.</p>'}`;
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => {
        if (done) return;
        done = true;
        if (d.open) d.close();
        resolve(v);
      };
      d.querySelector('.lib-ask__body').addEventListener('click', (e) => {
        const b = e.target.closest('[data-version]');
        if (b) finish(list.find((v) => String(v.id) === b.dataset.version) || null);
      });
      d.addEventListener('close', () => finish(null), { once: true });
    });
  }

  /* ---------------------------------------------------------------------------
     De bieb in een maker
     ------------------------------------------------------------------------- */

  function attach(opts) {
    const tool = opts.tool;
    const meta = (global.PM_TOOLS || []).find((t) => t.id === tool) || {};
    const slotKey = (slot) => (opts.slot ? `${tool}:${slot == null ? opts.slot() : slot}` : tool);
    const slotOf = (key) => (key.includes(':') ? key.split(':')[1] : null);

    // Het open ontwerp per soort. Een link is een object: wat er nog moet worden opgeslagen,
    // houdt zijn eigen link vast, ook als je intussen iets nieuws begint
    const links = {};
    for (const [key, v] of Object.entries(store.get(CURRENT_KEY, {}) || {})) {
      if (key === tool || key.startsWith(`${tool}:`)) links[key] = { id: v && v.id || null, rev: v && v.rev || null, dirty: !!(v && v.dirty), files: Array.isArray(v && v.files) ? v.files : [], blank: !!(v && v.blank) };
    }
    // blank: net nieuw begonnen en nog niet aangeraakt (dat hoeft niet de bieb in)
    const fresh = (blank = false) => ({ id: null, rev: null, dirty: false, files: [], blank });
    const link = (key = slotKey()) => (links[key] = links[key] || fresh());
    function persist() {
      const all = { ...(store.get(CURRENT_KEY, {}) || {}) };
      for (const key of Object.keys(all)) if (key === tool || key.startsWith(`${tool}:`)) delete all[key];
      for (const [key, l] of Object.entries(links)) all[key] = { id: l.id, rev: l.rev, dirty: l.dirty, files: l.files, blank: l.blank };
      store.set(CURRENT_KEY, all);
    }

    const body = doc.querySelector('[data-lib]');
    const button = doc.getElementById('libBtn');
    const saveBtn = doc.getElementById('libSave');

    function summary(st) {
      try {
        return (meta.draft && meta.draft.summary(st)) || {};
      } catch (err) {
        return {};
      }
    }

    /* --- Wat er nog moet: per link de toestand van de laatste wijziging --- */

    const pending = new Map();   // link -> { state, keys, slot, at }
    let status = 'klaar';
    let applying = false;
    let holding = 0;
    let paused = false;
    let timer = 0;
    let firstAt = 0;
    let attempt = 0;
    let running = null;

    function snapshot(l, key = slotKey(), st = null) {
      const state = clone(st || opts.getState());
      pending.set(l, { state, keys: Array.from(new Set((opts.fileKeys(state) || []).filter(Boolean))), slot: key, at: Date.now() });
      l.dirty = true;
      l.blank = false;
      persist();
    }

    function touch() {
      if (applying || holding) return;
      snapshot(link());
      schedule();
      paint();
    }

    function hold(fn) {
      holding++;
      try {
        return fn();
      } finally {
        holding--;
        // Terug in een soort met nog niet opgeslagen werk (van een vorige keer): alsnog bewaren
        const l = link();
        if (!holding && l.dirty && !pending.has(l)) {
          snapshot(l);
          schedule();
        }
        paint();
      }
    }

    function schedule(delay = DELAY) {
      if (!firstAt) firstAt = Date.now();
      clearTimeout(timer);
      const wait = Math.max(0, Math.min(delay, MAX_WAIT - (Date.now() - firstAt)));
      timer = setTimeout(() => { flush().catch(() => {}); }, wait);
    }

    // Alles wat nog moet, één voor één, wegschrijven
    function flush() {
      clearTimeout(timer);
      if (paused) return Promise.resolve(status);
      if (!running) {
        running = (async () => {
          while (pending.size && !paused) {
            const [l, entry] = pending.entries().next().value;
            pending.delete(l);
            firstAt = 0;
            status = 'bezig';
            paint();
            try {
              await write(l, entry);
              attempt = 0;
              if (!pending.has(l)) l.dirty = false;
              persist();
            } catch (err) {
              if (!pending.has(l)) pending.set(l, entry);   // niets kwijt: later opnieuw
              attempt++;
              status = D.offline(err) ? 'offline' : 'fout';
              paint();
              if (status === 'fout' && attempt === 1) PM.toast(`Opslaan in de bieb lukte niet. ${D.reason(err)} Je werk staat nog in deze browser; we proberen het zo opnieuw.`, true);
              clearTimeout(timer);
              timer = setTimeout(() => { flush().catch(() => {}); }, retryDelay(attempt));
              return status;
            }
          }
          status = 'klaar';
          paint();
          return status;
        })().finally(() => {
          running = null;
        });
      }
      return running;
    }

    async function write(l, entry) {
      const info = summary(entry.state);
      const live = entry.slot === slotKey() && link(entry.slot) === l;
      let thumb = '';
      if (live && opts.thumb) {
        try {
          thumb = shrink(await opts.thumb());
        } catch (err) {
          thumb = '';
        }
      }
      const fields = {
        tool, slot: slotOf(entry.slot), title: info.title, sub: info.sub, noun: info.noun, ratio: info.ratio,
        state: entry.state, thumb,
      };

      // Nieuw: het id blijft hetzelfde als de eerste poging mislukt (dan geen dubbele)
      if (!l.id) {
        const id = l.next || (l.next = D.newId());
        const files = await upload(id, entry.keys, []);
        const row = await D.create({ id, ...fields, files });
        Object.assign(l, { id, rev: row.updated_at, files, next: null });
        if (live) beat();
        return;
      }
      const files = await upload(l.id, entry.keys, l.files);
      const res = await D.update(l.id, l.rev, { ...fields, files });
      if (res.row) {
        l.rev = res.row.updated_at;
        l.files = files;
        return;
      }
      // Niet overschreven: weg (prullenbak) of intussen door iemand anders opgeslagen. Jouw
      // versie wordt een nieuw ontwerp, met de bestanden erbij
      const other = res.conflict ? D.fromRow(res.conflict) : null;
      const was = l.id;
      const id = l.next || (l.next = D.newId());
      const copied = [];
      for (const key of entry.keys) {
        const blob = await PM.idb.get(key);
        if (blob instanceof Blob) {
          await D.putFile(id, key, blob);
          copied.push(key);
        } else if (files.includes(key) && await D.copyFile(was, id, key)) {
          copied.push(key);
        }
      }
      const label = D.cleanTitle(info.title) || 'Zonder titel';
      const who = other && other.byId && other.byId === D.meId() ? null : other && other.by;
      const row = await D.create({ id, ...fields, files: copied, name: `${label} (jouw versie)` });
      Object.assign(l, { id, rev: row.updated_at, files: copied, next: null });
      if (!other || other.deletedAt) {
        PM.toast(`${other && other.deletedBy ? `${other.deletedBy} heeft dit ontwerp in de prullenbak gezet` : 'Dit ontwerp staat niet meer in de bieb'}. Jouw versie staat er apart in: ${label} (jouw versie).`);
      } else {
        PM.toast(`${who ? `${who} heeft` : 'Je hebt in een ander venster'} dit ontwerp intussen ook aangepast. Niets overschreven: jouw versie staat apart in de bieb, als ${label} (jouw versie).`, false,
          { label: who ? `open de versie van ${who}` : 'open de andere versie', run: () => open(was) });
      }
    }

    // Wat nog niet bij dit ontwerp in de opslag staat, erbij zetten
    async function upload(id, keys, have) {
      const out = [];
      for (const key of keys) {
        if (have.includes(key)) {
          out.push(key);
          continue;
        }
        const blob = await PM.idb.get(key);
        if (!(blob instanceof Blob)) continue;
        await D.putFile(id, key, blob);
        out.push(key);
      }
      return out;
    }

    // Miniatuur: hoogstens 240 px breed als JPEG
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

    /* --- Nieuw, kopie, pauze --- */

    // Een nieuw ontwerp beginnen: wat er nog moest, gaat naar het vorige ontwerp. Stond er werk dat
    // nog nooit in de bieb kwam (van vóór het vanzelf opslaan), dan gaat dat er eerst in
    const hasDraft = () => !!(meta.draft && store.get(meta.draft.key));
    function detach() {
      const key = slotKey();
      const prev = link(key);
      if (!pending.has(prev) && (prev.dirty || (!prev.id && !prev.blank && hasDraft()))) snapshot(prev, key);
      links[key] = fresh(true);
      persist();
      schedule(0);
      paint();
      return { id: prev.id };
    }

    // Wat er nu openstaat, wordt een nieuw ontwerp (de laatste wijzigingen gaan mee)
    function fork() {
      const key = slotKey();
      const prev = link(key);
      const entry = pending.get(prev);
      pending.delete(prev);
      links[key] = fresh();
      if (entry) {
        pending.set(links[key], { ...entry, slot: key });
        links[key].dirty = true;
      } else {
        snapshot(links[key]);
      }
      prev.dirty = false;
      persist();
      schedule();
      return { id: prev.id };
    }

    const pause = () => { paused = true; clearTimeout(timer); };
    function resume() {
      paused = false;
      if (pending.size) schedule();
      paint();
    }

    function saveOther(st) {
      snapshot(fresh(), slotKey(st && st.type), st);
      schedule(0);
    }

    // Een geparkeerde soort met wijzigingen die nog niet in de bieb staan (van een vorige keer): naar
    // zijn eigen ontwerp
    function saveSlot(slot, st) {
      const key = slotKey(slot);
      const l = links[key];
      if (!l || !l.dirty || pending.has(l)) return;
      snapshot(l, key, st);
      schedule(500);
    }

    /* --- Openen, en de nieuwste versie --- */

    async function filesOf(id, keys) {
      return (await Promise.all((keys || []).map(async (key) => {
        if ((await PM.idb.get(key)) instanceof Blob) return key;
        const blob = await D.getFile(id, key);
        if (!blob) return null;
        await PM.idb.set(key, blob);
        return key;
      }))).filter(Boolean);
    }

    async function load(row, keys) {
      applying = true;
      try {
        await opts.apply(clone(row.state), keys);
      } finally {
        applying = false;
      }
      const l = fresh();
      Object.assign(l, { id: row.id, rev: row.updated_at, files: row.files || [] });
      links[slotKey()] = l;
      persist();
      paint();
    }

    async function open(id, { quiet = false } = {}) {
      const before = link();
      await flush();
      let row;
      try {
        row = await D.get(id);
      } catch (err) {
        PM.toast(`Openen lukte niet. ${D.reason(err)}`, true);
        return false;
      }
      if (!row || row.deleted_at || !row.state) {
        PM.toast(row && row.deleted_at
          ? `Dit ontwerp ligt in de prullenbak${row.deleted_by_name ? ` (weggegooid door ${row.deleted_by_name})` : ''}. Haal het terug via alle ontwerpen.`
          : 'Dit ontwerp staat niet meer in de bieb.', true);
        return false;
      }
      const keys = await filesOf(id, row.files);
      const missing = (row.files || []).length - keys.length;
      await load(row, keys);
      if (opts.close) opts.close();
      presence(row);
      beat();
      if (!quiet) {
        const e = D.fromRow(row);
        const who = D.byWho(e, D.meId());
        PM.toast(`Geopend: ${e.title}${who && who !== 'jou' ? `, laatst bewerkt door ${who}` : ''}.${missing ? ` ${missing === 1 ? 'Eén foto kon' : `${missing} foto's konden`} niet mee; zet ${missing === 1 ? 'hem' : 'ze'} er opnieuw in.` : ''}`,
          !!missing, before.id && before.id !== id ? { label: 'terug naar vorige', run: () => open(before.id) } : null);
      }
      render();
      return true;
    }

    // Heeft een collega (of jij, elders) het open ontwerp intussen aangepast? Dan de nieuwste
    // versie, als je zelf niets hebt dat nog moet. Weggegooid: je werk wordt een nieuw ontwerp
    async function sync() {
      const l = link();
      if (!l.id || applying) return;
      let row;
      try {
        row = await D.get(l.id);
      } catch (err) {
        return;
      }
      if (link() !== l) return;
      if (!row || row.deleted_at) {
        links[slotKey()] = Object.assign(fresh(), { dirty: true });
        snapshot(links[slotKey()]);
        schedule();
        PM.toast(row && row.deleted_by_name
          ? `${row.deleted_by_name} heeft dit ontwerp in de prullenbak gezet. Wat je hier ziet, bewaren we als nieuw ontwerp.`
          : 'Dit ontwerp staat niet meer in de bieb. Wat je hier ziet, bewaren we als nieuw ontwerp.');
        return;
      }
      if (row.updated_at !== l.rev && !l.dirty && !pending.has(l)) {
        const e = D.fromRow(row);
        await load(row, await filesOf(row.id, row.files));
        PM.toast(`Bijgewerkt naar de nieuwste versie${e.byId !== D.meId() && e.by ? ` van ${e.by}` : ''}.`);
      }
      presence(row);
    }

    /* --- Wie heeft het open --- */

    let warned = '';
    const presenceEl = (() => {
      if (!saveBtn) return null;
      const el = doc.createElement('span');
      el.className = 'lib-presence';
      el.hidden = true;
      saveBtn.insertAdjacentElement('beforebegin', el);
      return el;
    })();

    function presence(row) {
      if (!presenceEl) return;
      const who = row ? D.openBy(D.fromRow(row), D.meId(), Date.now()) : '';
      presenceEl.hidden = !who;
      presenceEl.textContent = who ? `${who} heeft dit open` : '';
      presenceEl.title = who ? `${who} werkt nu ook in dit ontwerp. Werken jullie tegelijk, dan wordt de versie van wie later opslaat een kopie: er gaat niets verloren.` : '';
      if (who && warned !== `${row.id}:${who}`) {
        warned = `${row.id}:${who}`;
        PM.toast(`${who} heeft dit ontwerp nu ook open. Werken jullie tegelijk, dan wordt een van de versies een kopie; er gaat niets verloren.`);
      }
    }

    async function beat() {
      const l = link();
      if (!l.id || doc.visibilityState === 'hidden') return;
      try {
        presence(await D.here(l.id));
      } catch (err) {
        /* niets */
      }
    }

    /* --- De knop rechtsboven: hoe staat het ervoor --- */

    function paint() {
      if (!saveBtn) return;
      const busy = pending.size > 0;
      const s = statusText(status, busy);
      saveBtn.classList.toggle('is-busy', status === 'bezig' || (busy && status === 'klaar'));
      saveBtn.classList.toggle('is-off', status === 'offline' || status === 'fout');
      saveBtn.title = s.title;
      saveBtn.setAttribute('aria-label', `${s.label}. ${s.title}`);
      const icon = status === 'offline' || status === 'fout' ? ICON.off : busy || status === 'bezig' ? ICON.sync : ICON.cloud;
      saveBtn.innerHTML = `${icon}<span class="appbar__txt" aria-hidden="true">${esc(s.label)}</span>`;
    }

    async function saveClick() {
      const result = await flush();
      if (result === 'klaar') PM.toast('Alles staat in de bieb van het team. Opslaan gaat vanzelf, ook als je niets doet.');
    }

    /* --- De popover: zoeken, openen, en per ontwerp een menu --- */

    let query = '';
    let mine = false;

    function itemHtml(e, isCurrent, now, me) {
      const [a, b] = String(e.ratio || '1 / 1').split('/').map(Number);
      const ar = a > 0 && b > 0 ? a / b : 1;
      const w = Math.min(3.5, 3 * ar);
      const busy = D.openBy(e, me, now);
      return `
        <li class="lib__item${isCurrent ? ' is-current' : ''}" data-id="${esc(e.id)}">
          <span class="lib__thumb" aria-hidden="true"><span class="lib__art" style="width:${w.toFixed(2)}rem;height:${(w / ar).toFixed(2)}rem"><img alt="" data-lib-thumb="${esc(e.id)}" hidden></span></span>
          <span class="lib__txt">
            <b class="lib__title">${esc(e.title)}</b>
            ${e.sub ? `<span class="lib__meta">${esc(e.sub)}</span>` : ''}
            <span class="lib__meta lib__when">${esc(D.editedText(e.savedAt, now, D.byWho(e, me)))}${busy ? ` · <span class="lib__busy">nu open bij ${esc(busy)}</span>` : ''}</span>
          </span>
          ${isCurrent
            ? '<span class="lib__open">nu open</span>'
            : `<button type="button" class="btn btn-outline btn-xs" data-lib-open="${esc(e.id)}">open<span class="sr-only"> ${esc(e.title)}</span></button>`}
          <div class="menu lib__menu">
            <button type="button" class="iconbtn" data-lib-menu="${esc(e.id)}" aria-haspopup="menu" aria-expanded="false" aria-label="${esc(`Meer voor ${e.title}`)}" title="naam wijzigen, kopie, versies, weggooien">${ICON.more}</button>
          </div>
        </li>`;
    }

    // Staat het menu bij een ontwerp open, dan wacht de lijst tot het dicht is (anders klapt het dicht
    // zodra er iets is opgeslagen)
    let stale = false;
    function render() {
      if (menuEl && body && !body.closest('[hidden]')) {
        stale = true;
        paint();
        return;
      }
      closeMenu();
      const all = D.list(tool);
      const count = button && button.querySelector('[data-lib-count]');
      if (count) count.textContent = all.length ? String(all.length) : '';
      paint();
      if (!body) return;
      const now = Date.now();
      const me = D.meId();
      const cur = link();
      const shown = all.filter((e) => (!mine || e.byId === me || e.createdById === me) && D.matches(e, query));
      const empty = D.status() === 'laden'
        ? 'Even laden…'
        : D.status() === 'fout'
          ? 'De bieb is nu niet bereikbaar. Controleer je internet en open hem opnieuw.'
          : query || mine ? 'Niets gevonden. Probeer een ander woord, of kijk bij alle ontwerpen.' : 'Nog niets in de bieb. Wat je maakt, komt er vanzelf in, en je collega’s zien het ook.';
      const listHtml = shown.length
        ? `<ul class="lib__list" aria-label="Ontwerpen in de bieb">${shown.slice(0, 60).map((e) => itemHtml(e, cur.id === e.id, now, me)).join('')}</ul>`
        : `<p class="lib__empty">${esc(empty)}</p>`;
      const tools = body.querySelector('.lib__tools');
      if (!tools) {
        body.innerHTML = `
          <p class="lib__lead">Alles wat het team maakt, vanzelf opgeslagen. Open een ontwerp om verder te werken.</p>
          <div class="lib__tools">
            <label class="lib__search">${ICON.search}<span class="sr-only">Zoek in de bieb</span><input type="search" class="input" data-lib-query placeholder="zoek op titel, klant of collega" autocomplete="off"></label>
            <div class="lib__filter" role="group" aria-label="Welke ontwerpen">
              <button type="button" data-lib-mine="0" aria-pressed="true">alles</button>
              <button type="button" data-lib-mine="1" aria-pressed="false">van mij</button>
            </div>
          </div>
          <div data-lib-list></div>
          <p class="lib__foot"><a href="${esc(PM.url(`bieb.html?tool=${tool}`))}">alle ontwerpen, en de prullenbak</a></p>`;
      }
      body.querySelector('[data-lib-list]').innerHTML = listHtml;
      body.querySelectorAll('[data-lib-mine]').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.libMine === '1') === mine)));
      const visible = shown.slice(0, 60);
      D.thumbs(visible).then((map) => {
        for (const img of body.querySelectorAll('img[data-lib-thumb]')) {
          const src = map.get(img.dataset.libThumb);
          if (src) {
            img.src = src;
            img.hidden = false;
          }
        }
      });
    }

    // Het menu bij een ontwerp
    let menuEl = null;
    function closeMenu() {
      if (!menuEl) return;
      const owner = body && body.querySelector('[data-lib-menu][aria-expanded="true"]');
      if (owner) owner.setAttribute('aria-expanded', 'false');
      menuEl.remove();
      menuEl = null;
      if (stale) {
        stale = false;
        render();
      }
    }

    function showMenu(btn, id) {
      closeMenu();
      btn.setAttribute('aria-expanded', 'true');
      menuEl = doc.createElement('div');
      menuEl.className = 'menu__list is-open lib__menulist';
      menuEl.setAttribute('role', 'menu');
      menuEl.innerHTML = [
        ['naam', 'naam wijzigen'], ['kopie', 'kopie maken'], ['versies', 'eerdere versies'], ['weg', 'naar de prullenbak'],
      ].map(([act, label]) => `<button type="button" class="menu__item" role="menuitem" data-act="${act}" data-id="${esc(id)}">${esc(label)}</button>`).join('');
      // Vast op het scherm, onder de knop: de lijst scrolt, dan valt het menu niet weg
      body.appendChild(menuEl);
      const r = btn.getBoundingClientRect();
      const w = menuEl.offsetWidth;
      const h = menuEl.offsetHeight;
      menuEl.style.left = `${Math.max(8, Math.min(r.right - w, global.innerWidth - w - 8))}px`;
      menuEl.style.top = `${r.bottom + h + 8 > global.innerHeight ? Math.max(8, r.top - h - 4) : r.bottom + 4}px`;
      const first = menuEl.querySelector('button');
      if (first) first.focus();
    }

    async function act(action, id) {
      closeMenu();
      const e = D.list(tool).find((x) => x.id === id);
      if (!e) return;
      try {
        if (action === 'naam') {
          const name = await askName(e);
          if (name == null) return;
          await D.rename(id, name);
          render();
          PM.toast(name ? `De naam is nu ${name}.` : `De naam komt weer uit het ontwerp: ${e.auto}.`);
        } else if (action === 'kopie') {
          const row = await D.copy(id);
          render();
          PM.toast(`Kopie gemaakt: ${D.fromRow(row).title}.`, false, { label: 'open de kopie', run: () => open(row.id) });
        } else if (action === 'versies') {
          const v = await askVersion(e);
          if (v) await restoreVersion(id, v.id);
        } else if (action === 'weg') {
          await D.trash(id);
          const l = link();
          const wasOpen = l.id === id;
          if (wasOpen) {
            links[slotKey()] = fresh(true);
            persist();
          }
          render();
          PM.toast(`${e.title} ligt in de prullenbak, ook voor je collega’s. Na 30 dagen is hij weg.`, false, {
            label: 'ongedaan maken',
            run: async () => {
              await D.restore(id);
              if (wasOpen && !link().id) {
                links[slotKey()] = l;
                persist();
              }
              render();
            },
          });
        }
      } catch (err) {
        PM.toast(`Dat lukte niet. ${D.reason(err)}`, true);
      }
    }

    // Een eerdere versie terugzetten: eerst openen (als het een ander ontwerp is), wat er nu
    // staat als versie bewaren, en dan de oude inhoud als nieuwe wijziging opslaan
    async function restoreVersion(id, versionId) {
      if (link().id !== id && !(await open(id, { quiet: true }))) return;
      await flush();
      const v = await D.version(versionId);
      if (!v) throw new Error('Deze versie bestaat niet meer.');
      await D.keepVersion(id);
      const keys = await filesOf(id, v.files);
      applying = true;
      try {
        await opts.apply(clone(v.state), keys);
      } finally {
        applying = false;
      }
      snapshot(link());
      await flush();
      render();
      PM.toast(`Teruggezet: de versie van ${D.editedText(Date.parse(v.saved_at), Date.now(), v.saved_by_name || '', 'versie van').replace(/^versie van /, '')}. Wat er net stond, vind je bij eerdere versies.`);
    }

    if (body) {
      body.addEventListener('click', (e) => {
        const t = e.target.closest('button');
        if (!t) {
          if (!e.target.closest('.lib__menulist')) closeMenu();
          return;
        }
        if (t.dataset.libOpen) open(t.dataset.libOpen);
        else if (t.dataset.libMenu) {
          if (t.getAttribute('aria-expanded') === 'true') closeMenu();
          else showMenu(t, t.dataset.libMenu);
        } else if (t.dataset.act) act(t.dataset.act, t.dataset.id);
        else if (t.dataset.libMine) {
          mine = t.dataset.libMine === '1';
          render();
        }
      });
      body.addEventListener('input', (e) => {
        if (!e.target.matches('[data-lib-query]')) return;
        query = e.target.value;
        render();
      });
      body.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && menuEl) {
          e.stopPropagation();
          closeMenu();
        }
      });
    }
    if (button) {
      button.addEventListener('click', () => {
        render();
        if (D.age() > 10e3) D.refresh().catch(() => {});
      });
    }
    if (saveBtn) saveBtn.addEventListener('click', saveClick);
    global.addEventListener('pm-designs', render);

    /* --- Opstarten --- */

    // Gestart met een starttegel: wat er stond, gaat eerst nog naar zijn eigen ontwerp (ook als het
    // nog nooit in de bieb stond: werk van vóór het vanzelf opslaan)
    if (opts.fresh) {
      const key = slotKey(opts.fresh.type);
      const prev = link(key);
      if (prev.dirty || (!prev.id && !prev.blank)) snapshot(prev, key, opts.fresh);
      links[slotKey()] = fresh(true);
      persist();
      if (prev.id) {
        setTimeout(() => PM.toast(`Je begint iets nieuws. ${summary(opts.fresh).title || 'Je vorige ontwerp'} staat in de bieb.`, false, { label: 'terug naar vorige', run: () => open(prev.id) }), 0);
      }
    }
    // Wat de vorige keer nog niet in de bieb kwam (gesloten of offline), alsnog
    for (const [key, l] of Object.entries(links)) {
      if (l.dirty && key === slotKey() && !pending.has(l)) snapshot(l, key);
    }
    if (pending.size) schedule(500);
    paint();
    render();
    D.refresh().catch(() => {});

    if (opts.openId === 'lijst' && button) setTimeout(() => button.click(), 0);
    else if (opts.openId) {
      setTimeout(async () => {
        if (opts.versionId) await restoreVersion(opts.openId, opts.versionId).catch((err) => PM.toast(`Terugzetten lukte niet. ${D.reason(err)}`, true));
        else await open(opts.openId);
      }, 0);
    } else {
      setTimeout(sync, 0);
    }

    // Collega's zien dat je het open hebt; terug in dit tabblad: de nieuwste versie
    beat();
    setInterval(beat, BEAT);
    doc.addEventListener('visibilitychange', () => {
      if (doc.visibilityState === 'hidden') flush().catch(() => {});
      else if (D.age() > 20e3) sync();
    });
    global.addEventListener('pagehide', () => {
      flush().catch(() => {});
      D.leave(link().id);
    });
    global.addEventListener('online', () => { if (pending.size) flush().catch(() => {}); });

    // Staat dat soort helemaal in de bieb? (niets dat nog moet). Nog nooit gezien: niet zeker, dus nee
    function isClean(slot) {
      const l = links[slotKey(slot)];
      return !!l && !l.dirty && !pending.has(l);
    }
    const isDirty = () => { const l = link(); return !!(l.dirty || pending.has(l)); };

    return {
      touch, hold, detach, fork, pause, resume, flush, autoSave: flush, open, sync, saveOther, saveSlot,
      isClean, isDirty, render, current: () => ({ ...link() }),
    };
  }

  PM.library = { ...api, attach, askName, askVersion };
})(typeof window !== 'undefined' ? window : globalThis);
