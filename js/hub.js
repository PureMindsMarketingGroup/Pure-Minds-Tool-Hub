/* =============================================================================
   hub.js — het dashboard op index.html, helemaal uit js/shared/tools.js.
   Twee zones: links "maken" met één kaart per tool (je concept, de formaten of
   een zoekveld, en "hoe werkt het?"), rechts "checken" met de tools die buiten
   de hub draaien, elk met één duidelijke knop. Plus de uitleg bij een lokale
   tool (<dialog>) en de deeplinks #design en #techniek.
   ============================================================================= */
(function () {
  'use strict';

  const { esc, url, store, recentTools, toast } = window.PM;
  const tools = (Array.isArray(window.PM_TOOLS) ? window.PM_TOOLS : []).filter((t) => t && t.id);
  const groups = Array.isArray(window.PM_GROUPS) && window.PM_GROUPS.length ? window.PM_GROUPS : [{ id: 'design', name: 'Tools' }];
  const live = (t) => t.status !== 'binnenkort';
  const groupOf = (t) => (groups.some((g) => g.id === t.group) ? t.group : groups[0].id);

  const $ = (id) => document.getElementById(id);
  const DAY = 864e5;
  const TOUR_TIME = '2 min';   // zo lang duurt een rondleiding ongeveer

  const ICON = {
    arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6"/></svg>',
    external: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7m-9 0h9v9"/></svg>',
    download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m-5-5 5 5 5-5M5 20h14"/></svg>',
    computer: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18v11H3zm5 15h8m-4-4v4"/></svg>',
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m20 20-4.6-4.6M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z"/></svg>',
    help: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-2.5-11.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7M12 16.5v.5"/></svg>',
    resume: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4M12 8v4l3 2"/></svg>',
    bieb: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h18v5H3zm1 5v11h16V9M9 13h6"/></svg>',
  };

  // Formaat-icoon: een vlakje in de echte verhouding, passend in een vak van w × h rem
  function shape(ratio, w, h, cls = '') {
    const [a, b] = String(ratio || '1 / 1').split('/').map(Number);
    const ar = a > 0 && b > 0 ? a / b : 1;
    const width = Math.min(w, h * ar);
    return `<span class="shape ${cls}" style="width:${width.toFixed(2)}rem;height:${(width / ar).toFixed(2)}rem" aria-hidden="true"></span>`;
  }
  const cap = (s) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);

  // Kop van een zone: de vraag met een cyaan vraagteken, anders de naam met een cyaan punt
  function heading(g) {
    const q = String(g.question || '');
    if (q.endsWith('?')) return `${esc(q.slice(0, -1))}<span class="dot">?</span>`;
    return `${esc(q || g.name)}<span class="dot">.</span>`;
  }

  /* ---------------------------------------------------------------------------
     Wat er in deze browser staat: concepten, gedane rondleidingen, geopende tools
     ------------------------------------------------------------------------- */

  const relative = new Intl.RelativeTimeFormat('nl', { numeric: 'auto' });

  function when(time) {
    const midnight = (t) => new Date(t).setHours(0, 0, 0, 0);
    const days = Math.round((midnight(time) - midnight(Date.now())) / DAY);
    const clock = new Date(time).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
    return days >= -1 ? `${relative.format(days, 'day')} om ${clock}` : relative.format(days, 'day');
  }

  // Het concept van een tool, als je hem de afgelopen 30 dagen hier gebruikt hebt en er echt iets bewaard is
  function draftOf(tool) {
    const seen = recentTools()[tool.id];
    if (!live(tool) || !tool.draft || !seen || Date.now() - seen >= 30 * DAY) return null;
    const saved = store.get(tool.draft.key);
    if (!saved || typeof saved !== 'object') return null;   // alleen geopend, niets gemaakt
    let info = {};
    try {
      info = tool.draft.summary(saved) || {};
    } catch (err) {
      info = {};
    }
    const title = String(info.title || '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
    return { at: seen, title: title || 'Zonder titel', noun: info.noun || 'ontwerp', ratio: info.ratio };
  }

  // De bieb van het team (js/shared/designs.js), laatst bewerkt eerst. Eerst uit het geheugen van
  // deze browser; zodra Supabase antwoordt (het event pm-designs) opnieuw. Miniaturen komen apart
  const DES = window.PM.designs;
  const BIEB_SHOWN = 3;
  const me = () => (DES ? DES.meId() : null);

  // "Verder waar je was" op een andere computer: je laatst bewerkte ontwerp uit de bieb
  function cloudDraft(tool, list) {
    const mine = list.find((e) => e.byId && e.byId === me());
    if (!mine) return '';
    return `
      <a class="draft" href="${esc(`${url(tool.href)}?bieb=${encodeURIComponent(mine.id)}`)}">
        <span class="draft__art">${shape(mine.ratio, 2.6, 2, tool.tone === 'light' ? 'shape--light' : '')}</span>
        <span class="draft__text">
          <span class="draft__kicker">${ICON.resume}verder waar je was</span>
          <span class="draft__title">${esc(mine.title)}</span>
          <span class="draft__meta">jouw ${esc(mine.noun)} · ${esc(when(mine.savedAt))}</span>
        </span>
        <span class="draft__go" aria-hidden="true">${ICON.arrow}</span>
      </a>`;
  }

  function bieb(tool, list) {
    if (!list.length) return '';
    const now = Date.now();
    const meId = me();
    const base = url(tool.href);
    const item = (e) => {
      const [a, b] = String(e.ratio || '1 / 1').split('/').map(Number);
      const ar = a > 0 && b > 0 ? a / b : 1;
      const w = Math.min(2.6, 2.25 * ar);
      const art = `<span class="bieb__img" style="width:${w.toFixed(2)}rem;height:${(w / ar).toFixed(2)}rem"><img alt="" data-thumb="${esc(e.id)}" hidden></span>`;
      return `
        <li><a class="bieb__item" href="${esc(`${base}?bieb=${encodeURIComponent(e.id)}`)}">
          <span class="bieb__art" aria-hidden="true">${art}</span>
          <span class="bieb__text">
            <span class="bieb__title">${esc(e.title)}</span>
            <span class="bieb__meta">${esc(DES.editedText(e.savedAt, now, DES.byWho(e, meId)))}</span>
          </span>
        </a></li>`;
    };
    const total = DES.list(tool.id).length;
    return `
      <div class="bieb">
        <p class="bieb__head">${ICON.bieb}in de bieb <span class="bieb__count">${total}</span><span class="bieb__note">· van het team, vanzelf opgeslagen</span></p>
        <ul class="bieb__list">${list.slice(0, BIEB_SHOWN).map(item).join('')}</ul>
        <a class="bieb__more" href="${esc(url(`bieb.html?tool=${tool.id}`))}">${total > BIEB_SHOWN ? `alle ${total} in de bieb` : 'zoeken en de prullenbak'}${ICON.arrow}</a>
      </div>`;
  }

  // De bieb van een tool, en "of begin iets nieuws" als er iets boven de formaten staat. Zonder
  // concept in deze browser: je laatste ontwerp uit de bieb als "verder waar je was"
  function savedPart(tool, hasDraft) {
    let list = DES && live(tool) ? DES.list(tool.id) : [];
    let resume = '';
    if (!hasDraft && list.length) {
      resume = cloudDraft(tool, list);
      if (resume) list = list.filter((e) => e !== list.find((x) => x.byId && x.byId === me()));
    }
    const saved = bieb(tool, list);
    return `${resume}${saved}${hasDraft || resume || saved ? '<p class="maker__or">of begin iets nieuws</p>' : ''}`;
  }

  function syncBieb() {
    document.querySelectorAll('[data-bieb]').forEach((box) => {
      const tool = tools.find((t) => t.id === box.dataset.bieb);
      if (tool) box.innerHTML = savedPart(tool, box.hasAttribute('data-draft'));
    });
    if (!DES) return;
    const ids = [...document.querySelectorAll('img[data-thumb]')].map((img) => img.dataset.thumb);
    DES.thumbs(DES.list().filter((e) => ids.includes(e.id))).then((map) => {
      document.querySelectorAll('img[data-thumb]').forEach((img) => {
        const src = map.get(img.dataset.thumb);
        if (src) {
          img.src = src;
          img.hidden = false;
        }
      });
    });
  }

  const tourDone = (tool) => {
    const saved = store.get(`pm-tour-${tool.id}-v1`);
    return !!(saved && saved.status === 'done');
  };

  // Nieuw: alleen binnen newUntil én zolang je de tool in deze browser nog niet geopend hebt
  function isNew(tool) {
    if (tool.status !== 'nieuw' || (tool.newUntil && Date.now() >= Date.parse(tool.newUntil))) return false;
    return !recentTools()[tool.id];
  }
  // Tools buiten de hub tellen we als geopend bij de klik hier (de tool zelf kan dat niet)
  function markSeen(id) {
    store.set('pm-hub-recent-v1', { ...recentTools(), [id]: Date.now() });
  }

  const tag = (tool) => (!live(tool) ? '<span class="tag tag--soon">binnenkort</span>' : isNew(tool) ? '<span class="tag">nieuw</span>' : '');

  /* ---------------------------------------------------------------------------
     Maken: per tool één kaart. Bovenaan je concept, dan de formaten (of een
     zoekveld), onderaan wat je eruit krijgt en "hoe werkt het?".
     ------------------------------------------------------------------------- */

  function formats(tool) {
    const list = Array.isArray(tool.starts) && tool.starts.length
      ? tool.starts.map((s) => {
        const query = new URLSearchParams(s.params || {}).toString();
        const cls = [s.stack && 'shape--stack', tool.tone === 'light' && 'shape--light'].filter(Boolean).join(' ');
        return { href: url(tool.href) + (query ? `?${query}` : ''), label: s.label, sub: s.sub || '', art: shape(s.ratio, 4, 2.9, cls) };
      })
      // Een maker zonder formaten: één tegel die de tool opent
      : [{ href: url(tool.href), label: cap(tool.cta || `open ${tool.name}`), sub: (tool.exports || []).slice(0, 2).join(' · '), art: '<span class="fmt__hex" aria-hidden="true"></span>' }];
    return `
      <ul class="fmts" aria-label="Nieuw met de ${esc(tool.name)}">${list.map((f) => `
        <li><a class="fmt" href="${esc(f.href)}">
          <span class="fmt__art">${f.art}</span>
          <span class="fmt__label">${esc(f.label)}</span>
          <span class="fmt__sub">${esc(f.sub)}</span>
        </a></li>`).join('')}
      </ul>`;
  }

  function searchForm(tool) {
    const s = tool.search;
    const label = cap(tool.cta || `zoek in ${tool.name}`);
    return `
      <form class="find" role="search" aria-label="${esc(label)}" action="${esc(url(tool.href))}" method="get">
        <label class="sr-only" for="find-${esc(tool.id)}">${esc(label)}</label>
        <span class="find__field">${ICON.search}<input class="find__input" type="search" id="find-${esc(tool.id)}" name="${esc(s.param || 'q')}" placeholder="${esc(s.placeholder || '')}" autocomplete="off" enterkeyhint="search"></span>
        <button type="submit" class="btn btn-outline find__btn">zoek</button>
      </form>`;
  }

  function maker(tool) {
    const soon = !live(tool);
    const name = soon ? esc(tool.name) : `<a class="maker__link" href="${esc(url(tool.href))}">${esc(tool.name)}</a>`;
    const d = soon ? null : draftOf(tool);
    const draft = d ? `
      <a class="draft" href="${esc(url(tool.href))}">
        <span class="draft__art">${shape(d.ratio, 2.6, 2, tool.tone === 'light' ? 'shape--light' : '')}</span>
        <span class="draft__text">
          <span class="draft__kicker">${ICON.resume}verder waar je was</span>
          <span class="draft__title">${esc(d.title)}</span>
          <span class="draft__meta">jouw ${esc(d.noun)} · ${esc(when(d.at))}</span>
        </span>
        <span class="draft__go" aria-hidden="true">${ICON.arrow}</span>
      </a>` : '';
    // De bieb en "of begin iets nieuws" in een eigen vak: dat tekent opnieuw als de bieb binnen is
    const saved = soon ? '' : `<div class="maker__saved" data-bieb="${esc(tool.id)}"${draft ? ' data-draft' : ''}>${savedPart(tool, !!draft)}</div>`;

    const body = soon ? '' : tool.search ? searchForm(tool) : formats(tool);
    const exports = (tool.exports || []).join(' · ');
    const help = !soon && tool.tour && !tool.kind && !tourDone(tool)
      ? `<a class="help-link" href="${esc(url(tool.href))}#rondleiding" title="Rondleiding: ${esc(tool.tour)}">${ICON.help}hoe werkt het?<span class="sr-only"> Rondleiding in de ${esc(tool.name)}: ${esc(tool.tour)},</span> (${TOUR_TIME})</a>`
      : '';
    return `
      <li class="maker${soon ? ' is-soon' : ''}">
        <div class="maker__head">
          <h2 class="maker__name">${name}<span class="dot">.</span></h2>${tag(tool)}
          <p class="maker__desc">${esc(tool.description)}</p>
        </div>
        ${draft}
        ${saved}
        ${body}
        ${exports || help ? `<div class="maker__foot">${exports ? `<span class="maker__exports">${esc(exports)}</span>` : ''}${help}</div>` : ''}
      </li>`;
  }

  /* ---------------------------------------------------------------------------
     Checken: elke tool dezelfde opbouw. Naam, wat hij doet, waar hij draait en
     wat je krijgt, en één knop met een werkwoord en de plek waar het gebeurt.
     ------------------------------------------------------------------------- */

  function check(tool) {
    const soon = !live(tool);
    const exports = (tool.exports || []).join(' · ');
    let where = '';
    let actions = '';
    if (!soon && tool.kind === 'lokaal') {
      where = `${ICON.computer}lokaal: downloaden en starten`;
      actions = `
        ${tool.guide ? `<button type="button" class="btn btn-outline check__cta" data-guide="${esc(tool.guide)}" aria-haspopup="dialog">hoe start je hem?</button>` : ''}
        <a class="check__alt" href="${esc(tool.href)}" data-download="${esc(tool.id)}">${ICON.download}direct downloaden${tool.file ? `<span class="check__file">· ${esc(tool.file)}</span>` : ''}</a>`;
    } else if (!soon && tool.kind === 'web') {
      where = `${ICON.external}web-app: opent in een nieuw tabblad`;
      actions = `<a class="btn btn-outline check__cta" href="${esc(tool.href)}" target="_blank" rel="noopener" data-tool="${esc(tool.id)}">open de web-app<span class="sr-only">: ${esc(tool.name)} (nieuw tabblad)</span>${ICON.external}</a>`;
    } else if (!soon) {
      actions = `<a class="btn btn-outline check__cta" href="${esc(url(tool.href))}">open de tool<span class="sr-only">: ${esc(tool.name)}</span>${ICON.arrow}</a>`;
    }
    return `
      <li class="check${soon ? ' is-soon' : ''}">
        <h3 class="check__name">${esc(tool.name)}${tag(tool)}</h3>
        <p class="check__desc">${esc(tool.description)}</p>
        <p class="check__meta">${where ? `<span class="check__where">${where}</span>` : ''}${exports ? `<span class="check__gets">je krijgt: ${esc(exports)}</span>` : ''}</p>
        ${actions ? `<div class="check__actions">${actions}</div>` : ''}
      </li>`;
  }

  function render() {
    const [first, ...rest] = groups
      .map((g) => ({ ...g, list: tools.filter((t) => groupOf(t) === g.id) }))
      .filter((g) => g.list.length);
    if (!first) return;
    // De eerste zone (maken) staat al in index.html, met de vraag als h1; zijn id is de deeplink
    $('makeZone').id = first.id;
    $('makerList').innerHTML = first.list.map(maker).join('');
    $('zones').insertAdjacentHTML('beforeend', rest.map((g) => `
      <section class="zone ${g.place === 'bottom' ? 'zone--bottom' : 'zone--side'}${g.tone === 'dark' ? ' zone--dark' : ''}" id="${esc(g.id)}" aria-labelledby="zone-${esc(g.id)}">
        <div class="zone__head">
          <h2 class="zone__title zone__title--sm" id="zone-${esc(g.id)}">${heading(g)}</h2>
          ${g.lead ? `<p class="zone__lead">${esc(g.lead)}</p>` : ''}
        </div>
        <ul class="checks">${g.list.map(check).join('')}</ul>
      </section>`).join(''));
    if (rest.some((g) => g.place !== 'bottom')) $('zones').classList.add('has-side');
  }

  /* ---------------------------------------------------------------------------
     Uitleg bij een lokale tool: een paneel van rechts met een tabje per
     systeem. Het tabje van je eigen computer staat al open.
     ------------------------------------------------------------------------- */

  const platform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || navigator.userAgent || '';
  const myOs = /win/i.test(platform) ? 'windows' : 'mac';

  function selectTab(tab, focus = false) {
    const tabs = [...tab.closest('[role="tablist"]').querySelectorAll('[role="tab"]')];
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      const panel = $(t.getAttribute('aria-controls'));
      if (panel) panel.hidden = !on;
    }
    if (focus) tab.focus();
  }

  function initTabs(root) {
    for (const list of root.querySelectorAll('[role="tablist"]')) {
      const tabs = [...list.querySelectorAll('[role="tab"]')];
      selectTab(tabs.find((t) => t.dataset.os === myOs) || tabs[0]);
      list.addEventListener('click', (e) => {
        const tab = e.target.closest('[role="tab"]');
        if (tab) selectTab(tab, true);
      });
      // Pijltjes wisselen van tabje, zoals in elke tabbalk
      list.addEventListener('keydown', (e) => {
        const i = tabs.indexOf(document.activeElement);
        const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
        if (i < 0 || next === undefined) return;
        e.preventDefault();
        selectTab(tabs[(next + tabs.length) % tabs.length], true);
      });
    }
  }

  // returnTo: waar de focus heen gaat na sluiten. Zelf bijhouden, want Safari
  // geeft een aangeklikte knop geen focus en de browser weet het dan niet.
  function openGuide(id, returnTo) {
    const dialog = $(id);
    if (!dialog || typeof dialog.showModal !== 'function') return;
    dialog._returnTo = returnTo;
    if (!dialog.open) dialog.showModal();
    const tab = dialog.querySelector('[role="tab"][aria-selected="true"]');
    if (tab) tab.focus();
  }

  // Knopfeedback op de plek van de klik: even "✓ ..." en dan terug
  function flash(button, text, ms = 2200) {
    const label = button.querySelector('[data-label]') || button;
    if (!button.dataset.idle) button.dataset.idle = label.textContent;
    label.textContent = text;
    button.classList.add('is-done');
    clearTimeout(button._flash);
    button._flash = setTimeout(() => {
      label.textContent = button.dataset.idle;
      button.classList.remove('is-done');
    }, ms);
  }

  function initGuides() {
    for (const dialog of document.querySelectorAll('dialog.guide')) {
      initTabs(dialog);
      // Downloadknoppen in de uitleg: dezelfde link en bestandsinfo als op de kaart (één bron: tools.js)
      for (const link of dialog.querySelectorAll('[data-download]')) {
        const tool = tools.find((t) => t.id === link.dataset.download);
        if (tool) link.href = tool.href;
        link.addEventListener('click', () => {
          if (tool) markSeen(tool.id);
          flash(link, 'download gestart');
        });
      }
      for (const info of dialog.querySelectorAll('[data-file]')) {
        const tool = tools.find((t) => t.id === info.dataset.file);
        if (tool && tool.file) info.textContent = tool.file;
      }
      // Sluiten met het kruisje of met een klik naast het paneel (Esc doet de browser)
      dialog.addEventListener('click', (e) => {
        if (e.target === dialog || e.target.closest('[data-close]')) dialog.close();
      });
      dialog.addEventListener('close', () => {
        if (dialog._returnTo && dialog._returnTo.isConnected) dialog._returnTo.focus();
      });
    }

    // Opdrachten kopiëren; lukt dat niet, dan staat de tekst geselecteerd
    document.addEventListener('click', async (e) => {
      const button = e.target.closest('[data-copy]');
      if (!button) return;
      const done = button.parentElement.nextElementSibling;
      try {
        await navigator.clipboard.writeText(button.dataset.copy);
        button.classList.add('is-copied');
        if (done && done.matches('.cmd__done')) done.textContent = 'gekopieerd';
      } catch (err) {
        const range = document.createRange();
        range.selectNodeContents(button.previousElementSibling);
        getSelection().removeAllRanges();
        getSelection().addRange(range);
        if (done && done.matches('.cmd__done')) done.textContent = 'geselecteerd: kopieer met Ctrl + C';
      }
      clearTimeout(button._copied);
      button._copied = setTimeout(() => {
        button.classList.remove('is-copied');
        if (done && done.matches('.cmd__done')) done.textContent = '';
      }, 2200);
    });
  }

  // Op het dashboard: uitleg openen, direct downloaden (met een melding die naar
  // de uitleg wijst), en een web-app openen telt als geopend
  $('zones').addEventListener('click', (e) => {
    const help = e.target.closest('[data-guide]');
    if (help) {
      openGuide(help.dataset.guide, help);
      return;
    }
    const download = e.target.closest('[data-download]');
    const tool = download && tools.find((t) => t.id === download.dataset.download);
    if (tool) {
      markSeen(tool.id);
      if (tool.guide) {
        const button = document.querySelector(`#zones [data-guide="${tool.guide}"]`);
        toast('Download gestart. Eerste keer? Lees hoe je hem start.', false, { label: 'hoe start je hem?', run: () => openGuide(tool.guide, button) });
      }
      return;
    }
    const web = e.target.closest('a[data-tool]');
    if (web) markSeen(web.dataset.tool);
  });

  /* ---------------------------------------------------------------------------
     Deeplinks: index.html#techniek (of #design) springt naar die zone en licht
     hem even op. Handig als bladwijzer of om door te sturen.
     ------------------------------------------------------------------------- */

  function showHash() {
    const id = decodeURIComponent(location.hash.slice(1));
    const zone = groups.some((g) => g.id === id) && $(id);
    if (!zone) return;
    zone.scrollIntoView({ block: 'start' });
    zone.classList.remove('is-flash');
    void zone.offsetWidth;   // opnieuw afspelen bij een tweede klik
    zone.classList.add('is-flash');
  }
  window.addEventListener('hashchange', showHash);

  render();
  initGuides();
  showHash();
  if (DES) {
    window.addEventListener('pm-designs', syncBieb);
    syncBieb();
    DES.refresh().catch(() => {});
  }
})();
