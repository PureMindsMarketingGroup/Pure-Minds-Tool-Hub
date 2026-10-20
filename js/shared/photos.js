/* =============================================================================
   photos.js — passende foto's van Pexels, voor de AI en het paneel AI
   -----------------------------------------------------------------------------
   Pexels is een fotobank met een gratis licentie, ook voor zakelijk gebruik,
   zonder naamsvermelding in je post of mail (https://www.pexels.com/license/).
   Geen willekeurige foto's van internet: daar zit bijna altijd auteursrecht op.
   Het zoeken loopt via de server van de Tool Hub (/api/photos, de sleutel
   blijft in Vercel); de foto zelf haalt de browser op van images.pexels.com.

     PM.photos.ready()                 belofte: staat zoeken aan?
     PM.photos.search(q, opties)       [{ id, w, h, alt, photographer, thumb, original, ... }]
                                       opties: orientation ('landscape' | 'portrait' | 'square'),
                                       n, locale ('en-US' voor de zoektermen van de AI, 'nl-NL' getypt)
     PM.photos.toFile(foto, breedte)   de foto als File (zoals een upload), breedte in px
     PM.photos.fill(plekken)           na de AI: per plek { key, query, orientation, width } de
                                       beste foto; geeft Map(key -> { file, photo })
     PM.photos.picker(el, opties)      zoeken en kiezen in het paneel AI (zie ai.js)
   ============================================================================= */
(function (global) {
  'use strict';

  const PM = global.PM;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let readyPromise = null;

  function ready() {
    if (!readyPromise) {
      readyPromise = PM.service.status('/api/photos').then((st) => !!(st && st.ok && st.photos));
    }
    return readyPromise;
  }

  async function search(q, { orientation = '', n = 12, locale = 'en-US' } = {}) {
    const params = new URLSearchParams({ q: String(q).slice(0, 100), n: String(n), locale });
    if (orientation) params.set('orientation', orientation);
    const data = await PM.service.request(`/api/photos?${params}`, { method: 'GET' });
    return Array.isArray(data.photos) ? data.photos : [];
  }

  async function toFile(photo, width = 1600) {
    const res = await fetch(`${photo.original}?auto=compress&cs=tinysrgb&w=${Math.round(width)}`);
    if (!res.ok) throw new Error('Deze foto kon niet laden. Kies een andere.');
    const blob = await res.blob();
    return new File([blob], `pexels-${photo.id}.jpg`, { type: blob.type || 'image/jpeg' });
  }

  // Alle plekken tegelijk; een plek zonder resultaat (of met een fout) blijft gewoon leeg
  async function fill(slots) {
    const out = new Map();
    await Promise.allSettled((slots || []).filter((s) => s && String(s.query || '').trim()).map(async (slot) => {
      const [photo] = await search(slot.query, { orientation: slot.orientation, n: 1 });
      if (!photo) return;
      out.set(slot.key, { file: await toFile(photo, slot.width || 1600), photo });
    }));
    return out;
  }

  /* ---------------------------------------------------------------------------
     Zoeken en kiezen: een rij foto's voor de open post, slide of blok
       opties.target()          { label, orientation, query, width } of null (geen fotoplek)
       opties.apply(file, foto) de foto plaatsen (zoals een upload)
     ------------------------------------------------------------------------- */

  function picker(root, opts) {
    root.innerHTML = `
<h3 class="ai-refine__title">Foto zoeken <button type="button" class="help" data-help="ai-fotos"></button></h3>
<p class="field-hint" data-ph-for></p>
<div class="ai-ph-search" role="search">
  <label class="sr-only" for="phQ-${opts.tool}">Zoek een foto</label>
  <input class="input" id="phQ-${opts.tool}" type="search" data-ph-q maxlength="100" placeholder="bijv. bakkerij, team aan tafel" autocomplete="off">
  <button type="button" class="btn btn-outline btn-sm" data-ph-go>zoek</button>
</div>
<div class="ai-ph-grid" data-ph-grid role="list" aria-label="Foto’s van Pexels"></div>
<p class="ai-ph-credit">Foto’s van <a href="https://www.pexels.com" target="_blank" rel="noopener">Pexels</a>: gratis, ook zakelijk, zonder naamsvermelding.</p>`;
    const q = root.querySelector('[data-ph-q]');
    const grid = root.querySelector('[data-ph-grid]');
    const forEl = root.querySelector('[data-ph-for]');
    let results = [];
    let lastQuery = '';
    let typed = false;

    function refresh() {
      const t = opts.target();
      forEl.textContent = t ? `Voor ${t.label}. Klik op een foto om hem te plaatsen.` : 'Open eerst een slide of blok met een plek voor een foto.';
      if (t && t.query && !typed && t.query !== lastQuery) {
        q.value = t.query;
        run(t.query, 'en-US');
      }
    }

    async function run(text, locale) {
      const query = String(text || '').trim();
      if (query.length < 2) return;
      lastQuery = query;
      const t = opts.target();
      grid.innerHTML = '<p class="field-hint">zoeken…</p>';
      try {
        results = await search(query, { orientation: t ? t.orientation : '', n: 12, locale });
        grid.innerHTML = results.length
          ? results.map((p, i) => `<button type="button" class="ai-ph" role="listitem" data-ph="${i}" style="background:${esc(p.color)}" title="Foto: ${esc(p.photographer)} (Pexels)"><img src="${esc(p.thumb)}" alt="${esc(p.alt || 'Foto van Pexels')}" loading="lazy"></button>`).join('')
          : '<p class="field-hint">Niets gevonden. Probeer andere woorden, of in het Engels.</p>';
      } catch (err) {
        grid.innerHTML = `<p class="field-hint">${esc(err.message || 'Zoeken lukte niet.')}</p>`;
      }
    }

    // Geen <form>: het paneel staat al in het formulier van de maker (een form in een form valt weg)
    const go = () => {
      typed = true;
      run(q.value, /^[\x20-\x7e]*$/.test(q.value) && !/\b(de|het|een|en|van|met)\b/i.test(q.value) ? 'en-US' : 'nl-NL');
    };
    root.querySelector('[data-ph-go]').addEventListener('click', go);
    q.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      go();
    });

    grid.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-ph]');
      if (!btn) return;
      const t = opts.target();
      if (!t) {
        PM.toast('Open eerst een slide of blok met een plek voor een foto.', true);
        return;
      }
      const photo = results[Number(btn.dataset.ph)];
      btn.classList.add('is-busy');
      try {
        const file = await toFile(photo, t.width || 1600);
        await opts.apply(file, photo);
      } catch (err) {
        PM.toast(err.message || 'Deze foto lukte niet. Kies een andere.', true);
      } finally {
        btn.classList.remove('is-busy');
      }
    });

    return { refresh, search: (text) => { typed = true; q.value = text; return run(text, 'nl-NL'); } };
  }

  if (PM) PM.photos = { ready, search, toFile, fill, picker };
})(window);
