/* =============================================================================
   designs.js — de ontwerpen van het team in Supabase (de bieb)
   -----------------------------------------------------------------------------
   Eén plek voor alles wat met de ontwerpen in de cloud te maken heeft. De
   makers (via js/shared/library.js), het dashboard (js/hub.js) en het overzicht
   (bieb.html) gebruiken dit. Wie wat mag, regelt de database
   (supabase/teambieb.sql); het inloggen js/shared/account.js.

     tabel designs          een ontwerp: de toestand van een maker, titel, naam,
                            wie en wanneer; deleted_at = in de prullenbak
     tabel design_versions  eerdere versies (de database maakt ze zelf)
     opslag designs         de bestanden in een ontwerp, als <id>/<sleutel>

   De lijst staat ook in localStorage (pm-designs-v1, zonder miniaturen), zodat
   alles meteen iets toont; refresh() haalt de stand van nu op en meldt dat met
   het event pm-designs op window. Miniaturen komen apart (thumbs) en blijven in
   IndexedDB (thumb:<id>), per versie.

     PM.designs.list(tool?)          ontwerpen uit het geheugen, laatst bewerkt eerst
     PM.designs.refresh()            belofte: de lijst van nu (en het event pm-designs)
     PM.designs.status()             'laden', 'klaar' of 'fout'
     PM.designs.thumbs(entries)      belofte: Map id -> miniatuur (data-URL)
     PM.designs.get(id)              belofte: het hele ontwerp (met toestand) of null
     PM.designs.create(fields)       belofte: de nieuwe regel
     PM.designs.update(id, rev, f)   belofte: { row } of { conflict: regel of null } (rev = updated_at)
     PM.designs.copy(id)             belofte: de kopie (met kopieën van de bestanden)
     PM.designs.rename(id, naam)     een eigen naam ('' = weer de titel uit de inhoud)
     PM.designs.trash(id)            naar de prullenbak; restore(id) haalt hem terug
     PM.designs.trashed()            belofte: de prullenbak (30 dagen)
     PM.designs.versions(id)         belofte: eerdere versies, nieuwste eerst
     PM.designs.version(versieId)    belofte: één versie met toestand
     PM.designs.keepVersion(id)      wat er nu staat ook als versie bewaren
     PM.designs.here(id), leave(id)  "ik heb dit open" (voor collega's), en weer niet
     PM.designs.putFile / getFile    een bestand van een ontwerp
   ============================================================================= */
(function (global) {
  'use strict';

  const DAY = 864e5;
  const TRASH_DAYS = 30;
  const BUCKET = 'designs';
  const CACHE_KEY = 'pm-designs-v1';
  const PURGE_KEY = 'pm-designs-purge-v1';
  const META = 'id, tool, slot, name, title, sub, noun, ratio, files, created_at, created_by, created_by_name, updated_at, updated_by, updated_by_name, deleted_at, deleted_by_name, editing_by, editing_name, editing_at';
  const PRESENT = 90e3;   // zo lang telt "heeft het open" na het laatste teken van leven

  /* ---------------------------------------------------------------------------
     Rekenwerk, zonder browser (getest in tests/library.test.js)
     ------------------------------------------------------------------------- */

  const cleanTitle = (t) => String(t || '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();

  // Een regel uit Supabase als ontwerp in de lijst
  function fromRow(row) {
    const name = cleanTitle(row.name);
    return {
      id: row.id,
      tool: row.tool,
      slot: row.slot || null,
      name,
      title: name || cleanTitle(row.title) || 'Zonder titel',
      auto: cleanTitle(row.title) || 'Zonder titel',
      sub: row.sub || '',
      noun: row.noun || 'ontwerp',
      ratio: row.ratio || '1 / 1',
      files: Array.isArray(row.files) ? row.files : [],
      createdAt: Date.parse(row.created_at) || 0,
      createdBy: row.created_by_name || '',
      createdById: row.created_by || null,
      savedAt: Date.parse(row.updated_at) || 0,
      rev: row.updated_at || null,
      by: row.updated_by_name || '',
      byId: row.updated_by || null,
      deletedAt: row.deleted_at ? Date.parse(row.deleted_at) : 0,
      deletedBy: row.deleted_by_name || '',
      editingBy: row.editing_by || null,
      editingName: row.editing_name || '',
      editingAt: row.editing_at ? Date.parse(row.editing_at) : 0,
    };
  }

  const valid = (e) => !!(e && typeof e === 'object' && e.id && e.tool && Number.isFinite(e.savedAt));

  // Waar een bestand van een ontwerp staat: <id>/<sleutel>, met alleen veilige tekens
  const filePath = (id, key) => `${id}/${String(key).replace(/[^A-Za-z0-9._-]/g, '_')}`;

  // Heeft iemand het ontwerp opgeslagen sinds jij het opende of opsloeg? (rev = updated_at)
  const changedSince = (cur, row) => !!(cur && cur.rev && row && row.updated_at && row.updated_at !== cur.rev);

  // Wie het bewerkte, zoals de lijst het zegt: "jou" of de naam
  const byWho = (entry, meId) => (!entry || !entry.by ? '' : meId && entry.byId === meId ? 'jou' : entry.by);

  // Heeft een collega (niet jij) het nu open?
  const openBy = (entry, meId, now) => (entry && entry.editingBy && entry.editingBy !== meId && now - entry.editingAt < PRESENT ? entry.editingName || 'Een collega' : '');

  // "bewerkt vandaag om 15:27 door Ashley", "bewerkt gisteren om 9:05", "bewerkt 3 dagen geleden",
  // "bewerkt op 12 oktober": met de tijd erbij zie je twee versies uit elkaar
  function editedText(at, now, by = '', verb = 'bewerkt') {
    const midnight = (t) => new Date(t).setHours(0, 0, 0, 0);
    const days = Math.round((midnight(now) - midnight(at)) / DAY);
    const d = new Date(at);
    const clock = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
    const who = by ? ` door ${by}` : '';
    if (days <= 0) return `${verb} vandaag om ${clock}${who}`;
    if (days === 1) return `${verb} gisteren om ${clock}${who}`;
    if (days < 7) return `${verb} ${days} dagen geleden${who}`;
    const months = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
    const year = d.getFullYear() !== new Date(now).getFullYear() ? ` ${d.getFullYear()}` : '';
    return `${verb} op ${d.getDate()} ${months[d.getMonth()]}${year}${who}`;
  }

  // Hele dagen tot iets uit de prullenbak verdwijnt
  const trashLeft = (entry, now) => Math.max(0, Math.ceil((entry.deletedAt + TRASH_DAYS * DAY - now) / DAY));

  // Zoeken: elk woord moet ergens voorkomen (naam, titel, onderregel, wie), zonder accenten
  const fold = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
  function matches(entry, query) {
    const words = fold(query).split(/\s+/).filter(Boolean);
    if (!words.length) return true;
    const hay = fold([entry.title, entry.auto, entry.sub, entry.noun, entry.by, entry.createdBy].join(' '));
    return words.every((w) => hay.includes(w));
  }

  const api = { TRASH_DAYS, cleanTitle, fromRow, filePath, changedSince, byWho, openBy, editedText, trashLeft, matches };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  const PM = global.PM;
  if (!PM || !global.document) return;

  /* ---------------------------------------------------------------------------
     Supabase
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
  const nowIso = () => new Date().toISOString();
  const fail = (error) => {
    if (error) throw Object.assign(new Error(error.message || 'Supabase gaf een fout.'), { status: error.status, code: error.code });
  };

  // Een fout in gewone taal, achter "Opslaan lukte niet."
  function reason(err) {
    const msg = String((err && err.message) || '');
    const status = Number(err && err.status) || 0;
    if (/fetch|network|verbinding|Load failed/i.test(msg) || (err && err.name === 'TypeError')) return 'Geen verbinding met de server.';
    if (status === 401 || /JWT|jwt|not authenticated|Log in/i.test(msg)) return 'Je bent niet (meer) ingelogd. Log opnieuw in.';
    if (status === 413 || /too large|Payload/i.test(msg)) return 'Een foto in je ontwerp is te groot (hoogstens 25 MB).';
    return msg ? `(${msg})` : 'Probeer het zo nog eens.';
  }
  const offline = (err) => /Geen verbinding/.test(reason(err));

  /* --- De lijst --- */

  const cached = () => {
    const saved = store.get(CACHE_KEY, []);
    return Array.isArray(saved) ? saved.filter(valid) : [];
  };
  const writeCache = (list) => store.set(CACHE_KEY, list);
  const emit = () => global.dispatchEvent(new CustomEvent('pm-designs'));
  const byDate = (a, b) => b.savedAt - a.savedAt;
  function put(entry) {
    writeCache([entry, ...cached().filter((e) => e.id !== entry.id)].sort(byDate));
    emit();
  }
  function drop(id) {
    writeCache(cached().filter((e) => e.id !== id));
    emit();
  }

  const list = (tool) => cached().filter((e) => !e.deletedAt && (!tool || e.tool === tool));

  let state = cached().length ? 'klaar' : 'laden';
  let lastRefresh = 0;
  let refreshing = null;
  const status = () => state;
  const age = () => Date.now() - lastRefresh;

  function refresh() {
    if (!refreshing) {
      refreshing = (async () => {
        const moved = await migrate().catch(() => 0);
        if (moved) PM.toast(`De bieb is nu van het hele team. ${moved === 1 ? 'Je ontwerp uit deze browser staat' : `Je ${moved} ontwerpen uit deze browser staan`} er nu ook in, voor je collega’s.`);
        const c = await cloud();
        const { data, error } = await c.from('designs').select(META)
          .is('deleted_at', null)
          .order('updated_at', { ascending: false })
          .limit(2000);
        fail(error);
        writeCache((data || []).map(fromRow).filter((e) => !(e.deletedAt)));
        state = 'klaar';
        lastRefresh = Date.now();
        emit();
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

  // Terug in dit tabblad: misschien heeft een collega intussen iets gemaakt
  doc.addEventListener('visibilitychange', () => {
    if (doc.visibilityState === 'visible' && age() > 30e3) refresh().catch(() => {});
  });

  /* --- Miniaturen: apart, en per versie bewaard in deze browser --- */

  async function thumbs(entries) {
    const out = new Map();
    const missing = [];
    for (const e of entries || []) {
      const saved = await PM.idb.get(`thumb:${e.id}`);
      if (saved && saved.rev === e.rev) out.set(e.id, saved.src);
      else missing.push(e);
    }
    if (!missing.length) return out;
    try {
      const c = await cloud();
      const { data, error } = await c.from('designs').select('id, thumb, updated_at').in('id', missing.map((e) => e.id));
      fail(error);
      for (const row of data || []) {
        if (!row.thumb) continue;
        out.set(row.id, row.thumb);
        PM.idb.set(`thumb:${row.id}`, { rev: row.updated_at, src: row.thumb });
      }
    } catch (err) {
      /* zonder miniatuur */
    }
    return out;
  }

  /* --- Eén ontwerp --- */

  async function get(id) {
    const c = await cloud();
    const { data, error } = await c.from('designs').select(`${META}, state`).eq('id', id).maybeSingle();
    fail(error);
    return data || null;
  }

  async function putFile(id, key, blob) {
    const c = await cloud();
    const { error } = await c.storage.from(BUCKET).upload(filePath(id, key), blob, {
      upsert: true,
      contentType: blob.type || 'application/octet-stream',
    });
    fail(error);
  }

  async function getFile(id, key) {
    const c = await cloud();
    const { data, error } = await c.storage.from(BUCKET).download(filePath(id, key));
    if (error || !(data instanceof Blob)) return null;
    return data;
  }

  async function copyFile(fromId, toId, key) {
    const c = await cloud();
    const { error } = await c.storage.from(BUCKET).copy(filePath(fromId, key), filePath(toId, key));
    return !error;
  }

  // Alleen velden die in de tabel horen, met de grenzen van de database
  function fields(f) {
    const out = {};
    if ('tool' in f) out.tool = f.tool;
    if ('slot' in f) out.slot = /^[a-z0-9_-]{1,32}$/.test(String(f.slot || '')) ? f.slot : null;
    if ('title' in f) out.title = (cleanTitle(f.title) || 'Zonder titel').slice(0, 300);
    if ('sub' in f) out.sub = String(f.sub || '').slice(0, 300);
    if ('noun' in f) out.noun = String(f.noun || 'ontwerp').slice(0, 60);
    if ('ratio' in f) out.ratio = String(f.ratio || '1 / 1').slice(0, 20);
    if ('thumb' in f && f.thumb) out.thumb = String(f.thumb);
    if ('state' in f) out.state = f.state;
    if ('files' in f) out.files = Array.from(new Set((f.files || []).filter(Boolean)));
    if ('name' in f) out.name = cleanTitle(f.name).slice(0, 200) || null;
    return out;
  }

  async function create(f) {
    const c = await cloud();
    const row = { id: f.id || newId(), ...fields(f), editing_at: f.here ? nowIso() : null };
    const { data, error } = await c.from('designs').insert(row).select(META).single();
    fail(error);
    put(fromRow(data));
    return data;
  }

  // Overschrijven, maar alleen als niemand het intussen opsloeg (rev = updated_at)
  async function update(id, rev, f) {
    const c = await cloud();
    let q = c.from('designs').update({ ...fields(f), ...(f.here ? { editing_at: nowIso() } : {}) }).eq('id', id).is('deleted_at', null);
    if (rev) q = q.eq('updated_at', rev);
    const { data, error } = await q.select(META);
    fail(error);
    if (data && data.length) {
      put(fromRow(data[0]));
      return { row: data[0] };
    }
    const { data: now } = await c.from('designs').select(META).eq('id', id).maybeSingle();
    return { conflict: now || null };
  }

  async function patch(id, values) {
    const c = await cloud();
    const { data, error } = await c.from('designs').update(values).eq('id', id).select(META).maybeSingle();
    fail(error);
    if (data) {
      const e = fromRow(data);
      if (e.deletedAt) drop(id);
      else put(e);
    }
    return data;
  }

  const rename = (id, name) => patch(id, { name: cleanTitle(name).slice(0, 200) || null });
  const trash = (id) => patch(id, { deleted_at: nowIso(), editing_at: null });
  const restore = (id) => patch(id, { deleted_at: null });

  async function copy(id, { name } = {}) {
    const src = await get(id);
    if (!src) throw new Error('Dit ontwerp bestaat niet meer.');
    const to = newId();
    const files = [];
    for (const key of src.files || []) if (await copyFile(src.id, to, key)) files.push(key);
    const label = cleanTitle(src.name) || cleanTitle(src.title) || 'Zonder titel';
    return create({
      id: to, tool: src.tool, slot: src.slot, title: src.title, sub: src.sub, noun: src.noun, ratio: src.ratio,
      thumb: src.thumb, state: src.state, files, name: name || `${label} (kopie)`,
    });
  }

  async function trashed() {
    const c = await cloud();
    const { data, error } = await c.from('designs').select(META)
      .not('deleted_at', 'is', null)
      .gt('deleted_at', new Date(Date.now() - TRASH_DAYS * DAY).toISOString())
      .order('deleted_at', { ascending: false });
    fail(error);
    return (data || []).map(fromRow);
  }

  async function versions(id) {
    const c = await cloud();
    const { data, error } = await c.from('design_versions').select('id, title, saved_at, saved_by, saved_by_name, kept_at')
      .eq('design_id', id).order('saved_at', { ascending: false });
    fail(error);
    return data || [];
  }

  async function version(versionId) {
    const c = await cloud();
    const { data, error } = await c.from('design_versions').select('id, design_id, title, state, files, saved_at, saved_by_name').eq('id', versionId).maybeSingle();
    fail(error);
    return data || null;
  }

  async function keepVersion(id) {
    const c = await cloud();
    const { error } = await c.rpc('keep_version', { design: id });
    fail(error);
  }

  /* --- Wie heeft het open --- */

  // Werkt er al een collega in, dan blijft die staan (en zie jij dat); anders sta jij erop
  async function here(id) {
    if (!id) return null;
    const c = await cloud();
    const { data: row } = await c.from('designs').select(META).eq('id', id).maybeSingle();
    if (!row || openBy(fromRow(row), meId(), Date.now())) return row || null;
    const { data } = await c.from('designs').update({ editing_at: nowIso() }).eq('id', id).select(META).maybeSingle();
    return data || row;
  }

  async function leave(id) {
    if (!id) return;
    try {
      const c = await cloud();
      await c.from('designs').update({ editing_at: null, editing_by: null, editing_name: null }).eq('id', id).eq('editing_by', meId());
    } catch (err) {
      /* niets: het verloopt vanzelf */
    }
  }

  /* --- De oude bieb van alleen deze browser (van vóór het inloggen) naar het team --- */

  const OLD_INDEX_KEY = 'pm-library-v1';
  let migrating = null;
  function migrate() {
    if (!migrating) {
      migrating = (async () => {
        const old = store.get(OLD_INDEX_KEY, null);
        if (!Array.isArray(old)) return 0;
        let moved = 0;
        for (const e of old) {
          const id = e && e.id;
          const record = id ? await PM.idb.get(`library:${id}`) : null;
          if (record && record.state && e.tool) {
            const to = /^[a-z0-9-]{6,64}$/.test(id) ? id : newId();
            const files = [];
            for (const [key, blob] of Object.entries(record.files || {})) {
              if (!(blob instanceof Blob)) continue;
              await putFile(to, key, blob);
              files.push(key);
            }
            const c = await cloud();
            const { error } = await c.from('designs').upsert({
              id: to, ...fields({ tool: e.tool, slot: e.tool === 'presentation' ? record.state.type : null, title: e.title, sub: e.sub, noun: e.noun, ratio: e.ratio, thumb: e.thumb, state: record.state, files }),
            }, { onConflict: 'id' });
            fail(error);
            moved++;
          }
          if (id) await PM.idb.del(`library:${id}`);
          store.set(OLD_INDEX_KEY, (store.get(OLD_INDEX_KEY, []) || []).filter((x) => x && x.id !== id));
        }
        store.remove(OLD_INDEX_KEY);
        store.remove('pm-library-team-v1');   // de lijst van de eerste teambieb
        return moved;
      })().finally(() => {
        migrating = null;
      });
    }
    return migrating;
  }

  /* --- Opruimen: wat langer dan 30 dagen in de prullenbak ligt, met de bestanden --- */

  async function purge() {
    if (Date.now() - (Number(store.get(PURGE_KEY, 0)) || 0) < 6 * 36e5) return;
    store.set(PURGE_KEY, Date.now());
    const c = await cloud();
    const { data, error } = await c.from('designs').select('id')
      .lt('deleted_at', new Date(Date.now() - TRASH_DAYS * DAY).toISOString()).limit(50);
    if (error) return;
    for (const row of data || []) {
      const { data: files } = await c.storage.from(BUCKET).list(row.id, { limit: 1000 });
      const paths = (files || []).map((f) => `${row.id}/${f.name}`);
      if (paths.length) await c.storage.from(BUCKET).remove(paths);
      await c.from('designs').delete().eq('id', row.id);
    }
  }

  PM.designs = {
    ...api, list, refresh, status, age, thumbs, get, create, update, copy, rename, trash, restore, trashed,
    versions, version, keepVersion, here, leave, putFile, getFile, copyFile, newId, meId, reason, offline,
  };
})(typeof window !== 'undefined' ? window : globalThis);
