/* =============================================================================
   photos.js — passende foto's uit een fotobank, voor de AI en het paneel AI
   -----------------------------------------------------------------------------
   Unsplash (of Pexels als reserve): gratis licentie, ook voor zakelijk gebruik,
   zonder naamsvermelding in je post of mail. Geen willekeurige foto's van
   internet: daar zit bijna altijd auteursrecht op. Het zoeken loopt via de
   server van de Tool Hub (/api/photos, de sleutel blijft in Vercel); de foto
   zelf haalt de browser op van de beeldserver van de fotobank.

   De API-regels van Unsplash: in de kiezer staan fotograaf en Unsplash met een
   link; in een mail blijft de foto op de link van Unsplash (url, geen kopie);
   en zodra een foto gebruikt wordt, melden we een download (used).

     PM.photos.ready()                 belofte: staat zoeken aan?
     PM.photos.provider()              'unsplash' | 'pexels' | null (na ready)
     PM.photos.search(q, opties)       [{ id, provider, w, h, alt, photographer, thumb, src, track, ... }]
                                       opties: orientation ('landscape' | 'portrait' | 'square'),
                                       n, locale ('en-US' voor de zoektermen van de AI, 'nl-NL' getypt)
     PM.photos.url(foto, breedte)      de link naar de foto op die breedte
     PM.photos.toFile(foto, breedte)   de foto als File (zoals een upload)
     PM.photos.used(foto)              de foto wordt gebruikt (Unsplash: download melden)
     PM.photos.fill(plekken)           na de AI: per plek { key, query, orientation, width, download }
                                       de beste foto; Map(key -> { photo, file? })
     PM.photos.picker(el, opties)      zoeken en kiezen in het paneel AI (zie ai.js)
   ============================================================================= */
(function (global) {
  'use strict';

  const PM = global.PM;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const NAMES = { unsplash: 'Unsplash', pexels: 'Pexels' };
  const SITES = { unsplash: 'https://unsplash.com/?utm_source=pure_minds_tool_hub&utm_medium=referral', pexels: 'https://www.pexels.com' };
  let readyPromise = null;
  let current = null;

  function ready() {
    if (!readyPromise) {
      readyPromise = PM.service.status('/api/photos').then((st) => {
        current = st && st.ok && st.photos ? st.provider || 'unsplash' : null;
        return !!current;
      });
    }
    return readyPromise;
  }
  const provider = () => current;
  const providerName = () => NAMES[current] || 'de fotobank';

  async function search(q, { orientation = '', n = 9, locale = 'en-US' } = {}) {
    const params = new URLSearchParams({ q: String(q).slice(0, 100), n: String(n), locale });
    if (orientation) params.set('orientation', orientation);
    const data = await PM.service.request(`/api/photos?${params}`, { method: 'GET' });
    return Array.isArray(data.photos) ? data.photos : [];
  }

  function url(photo, width = 1600) {
    const w = Math.round(width);
    if (photo.provider === 'unsplash') return `${photo.src}${photo.src.includes('?') ? '&' : '?'}w=${w}&fit=max&q=80&fm=jpg`;
    return `${photo.src}?auto=compress&cs=tinysrgb&w=${w}`;
  }

  async function toFile(photo, width = 1600) {
    const res = await fetch(url(photo, width));
    if (!res.ok) throw new Error('Deze foto kon niet laden. Kies een andere.');
    const blob = await res.blob();
    return new File([blob], `${photo.provider || 'foto'}-${photo.id}.jpg`, { type: blob.type || 'image/jpeg' });
  }

  // Unsplash wil een melding als een foto echt gebruikt wordt; stil, en een fout maakt niets uit
  function used(photo) {
    if (!photo || !photo.track) return;
    PM.service.request(`/api/photos?track=${encodeURIComponent(photo.track)}`, { method: 'GET' }).catch(() => {});
  }

  // Alle plekken tegelijk; een plek zonder resultaat (of met een fout) blijft gewoon leeg
  async function fill(slots) {
    const out = new Map();
    await Promise.allSettled((slots || []).filter((s) => s && String(s.query || '').trim()).map(async (slot) => {
      const [photo] = await search(slot.query, { orientation: slot.orientation, n: 1 });
      if (!photo) return;
      out.set(slot.key, slot.download === false ? { photo } : { photo, file: await toFile(photo, slot.width || 1600) });
    }));
    return out;
  }

  /* ---------------------------------------------------------------------------
     Zoeken en kiezen: een rij foto's voor de open post, slide of blok
       opties.target()          { label, orientation, query, width } of null (geen fotoplek)
       opties.apply(file, foto) de foto plaatsen (zoals een upload)
     ------------------------------------------------------------------------- */

  const credit = (p) => `Foto: <a href="${esc(p.photographerUrl)}" target="_blank" rel="noopener">${esc(p.photographer || 'onbekend')}</a> op <a href="${esc(p.pageUrl)}" target="_blank" rel="noopener">${esc(NAMES[p.provider] || 'de fotobank')}</a>`;
  const general = () => `Foto’s van <a href="${esc(SITES[current] || '#')}" target="_blank" rel="noopener">${esc(providerName())}</a>: gratis, ook zakelijk, zonder naamsvermelding in je post of mail.`;

  function picker(root, opts) {
    root.innerHTML = `
<h3 class="ai-refine__title">Foto zoeken <button type="button" class="help" data-help="ai-fotos"></button></h3>
<p class="field-hint" data-ph-for></p>
<div class="ai-ph-search" role="search">
  <label class="sr-only" for="phQ-${opts.tool}">Zoek een foto</label>
  <input class="input" id="phQ-${opts.tool}" type="search" data-ph-q maxlength="100" placeholder="bijv. bakkerij, team aan tafel" autocomplete="off">
  <button type="button" class="btn btn-outline btn-sm" data-ph-go>zoek</button>
</div>
<div class="ai-ph-grid" data-ph-grid role="list" aria-label="Foto’s van ${esc(providerName())}"></div>
<p class="ai-ph-credit" data-ph-credit aria-live="polite">${general()}</p>`;
    const q = root.querySelector('[data-ph-q]');
    const grid = root.querySelector('[data-ph-grid]');
    const forEl = root.querySelector('[data-ph-for]');
    const creditEl = root.querySelector('[data-ph-credit]');
    let results = [];
    let lastQuery = '';
    let typed = false;

    // Zoeken met de zoektermen van de AI, maar alleen als het paneel zichtbaar is (zoekvragen zijn schaars)
    function refresh() {
      const t = opts.target();
      forEl.textContent = t ? `Voor ${t.label}. Klik op een foto om hem te plaatsen.` : 'Open eerst een slide of blok met een plek voor een foto.';
      if (t && t.query && !typed && t.query !== lastQuery && root.offsetParent !== null) {
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
        results = await search(query, { orientation: t ? t.orientation : '', n: 9, locale });
        grid.innerHTML = results.length
          ? results.map((p, i) => `<button type="button" class="ai-ph" role="listitem" data-ph="${i}" style="background:${esc(p.color)}" aria-label="${esc(p.alt || 'foto')}, door ${esc(p.photographer)}"><img src="${esc(p.thumb)}" alt="" loading="lazy"></button>`).join('')
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

    // De fotograaf en de fotobank bij de foto waar je naar kijkt (API-regels van Unsplash)
    const showCredit = (e) => {
      const btn = e.target.closest('[data-ph]');
      const p = btn && results[Number(btn.dataset.ph)];
      creditEl.innerHTML = p ? credit(p) : general();
    };
    grid.addEventListener('mouseover', showCredit);
    grid.addEventListener('focusin', showCredit);

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
        used(photo);
        creditEl.innerHTML = credit(photo);
      } catch (err) {
        PM.toast(err.message || 'Deze foto lukte niet. Kies een andere.', true);
      } finally {
        btn.classList.remove('is-busy');
      }
    });

    return { refresh, search: (text) => { typed = true; q.value = text; return run(text, 'nl-NL'); } };
  }

  if (PM) PM.photos = { ready, provider, providerName, search, url, toFile, used, fill, picker };
})(window);
