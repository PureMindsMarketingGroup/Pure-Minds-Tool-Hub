/* =============================================================================
   bieb.js — alle ontwerpen van het team (bieb.html), zoals de projecten in Canva
   -----------------------------------------------------------------------------
   Uit js/shared/designs.js: zoeken, per tool, "van mij", en per ontwerp openen,
   naam wijzigen, kopie maken, eerdere versies en naar de prullenbak. De
   prullenbak toont wat de laatste 30 dagen is weggegooid, met terugzetten.
   Een versie terugzetten opent de maker (?bieb=<id>&versie=<versie>): die zet
   hem terug en slaat hem op (js/shared/library.js).

   ?tool=insta kiest de tool, ?prullenbak=1 opent de prullenbak.
   ============================================================================= */
(function () {
  'use strict';

  const PM = window.PM;
  const D = PM.designs;
  const { esc, url } = PM;
  const $ = (sel) => document.querySelector(sel);
  const el = {
    title: $('[data-title]'), lead: $('[data-lead]'), query: $('[data-query]'), tools: $('[data-tools]'),
    mine: $('[data-mine]'), trash: $('[data-trash]'), count: $('[data-count]'), grid: $('[data-grid]'), empty: $('[data-empty]'),
  };
  const TOOLS = (window.PM_TOOLS || []).filter((t) => t.draft);
  const LABEL = { insta: 'posts', document: 'documenten', presentation: 'presentaties', newsletter: 'nieuwsbrieven' };
  const MORE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3C11.175 3 10.5 3.675 10.5 4.5C10.5 5.325 11.175 6 12 6C12.825 6 13.5 5.325 13.5 4.5C13.5 3.675 12.825 3 12 3ZM12 18C11.175 18 10.5 18.675 10.5 19.5C10.5 20.325 11.175 21 12 21C12.825 21 13.5 20.325 13.5 19.5C13.5 18.675 12.825 18 12 18ZM12 10.5C11.175 10.5 10.5 11.175 10.5 12C10.5 12.825 11.175 13.5 12 13.5C12.825 13.5 13.5 12.825 13.5 12C13.5 11.175 12.825 10.5 12 10.5Z"/></svg>';

  const start = PM.startParams();
  let tool = TOOLS.some((t) => t.id === start.tool) ? start.tool : '';
  let mine = false;
  let trashView = start.prullenbak === '1';
  let trashList = null;
  let query = '';

  const toolOf = (id) => TOOLS.find((t) => t.id === id) || {};
  const openHref = (e, extra = '') => `${url(toolOf(e.tool).href || '')}?bieb=${encodeURIComponent(e.id)}${extra}`;

  /* --- Filters --- */

  el.tools.innerHTML = [['', 'alles'], ...TOOLS.map((t) => [t.id, LABEL[t.id] || t.short || t.name])]
    .map(([id, label]) => `<button type="button" data-tool="${esc(id)}" aria-pressed="${id === tool}">${esc(label)}</button>`).join('');

  function syncFilters() {
    el.tools.querySelectorAll('[data-tool]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === tool)));
    el.mine.setAttribute('aria-pressed', String(mine));
    el.trash.setAttribute('aria-pressed', String(trashView));
    el.title.innerHTML = trashView ? 'Prullenbak<span class="dot">.</span>' : 'De bieb<span class="dot">.</span>';
    el.lead.textContent = trashView
      ? `Wat de laatste ${D.TRASH_DAYS} dagen is weggegooid. Zet het terug, dan staat het weer gewoon in de bieb. Daarna is het weg.`
      : 'Alles wat het team maakt, vanzelf opgeslagen. Zoek een ontwerp en open het om verder te werken.';
    const params = new URLSearchParams();
    if (tool) params.set('tool', tool);
    if (trashView) params.set('prullenbak', '1');
    history.replaceState(null, '', `${location.pathname}${params.toString() ? `?${params}` : ''}`);
  }

  /* --- De lijst --- */

  function card(e, now, me) {
    const t = toolOf(e.tool);
    const [a, b] = String(e.ratio || '1 / 1').split('/').map(Number);
    const ar = a > 0 && b > 0 ? a / b : 1;
    const busy = D.openBy(e, me, now);
    const meta = trashView
      ? `weggegooid${e.deletedBy ? ` door ${e.deletedBy}` : ''} · nog ${D.trashLeft(e, now)} ${D.trashLeft(e, now) === 1 ? 'dag' : 'dagen'}`
      : D.editedText(e.savedAt, now, D.byWho(e, me));
    const art = `<span class="shelf__art${t.tone === 'light' ? ' is-light' : ''}"><span class="shelf__frame" style="aspect-ratio:${ar.toFixed(4)}"><img alt="" data-thumb="${esc(e.id)}" hidden></span></span>`;
    const body = `
      ${art}
      <span class="shelf__kind">${esc(e.noun)}</span>
      <b class="shelf__name">${esc(e.title)}</b>
      ${e.sub ? `<span class="shelf__sub">${esc(e.sub)}</span>` : ''}
      <span class="shelf__meta">${esc(meta)}${busy && !trashView ? ` · <span class="shelf__busy">nu open bij ${esc(busy)}</span>` : ''}</span>`;
    return trashView
      ? `<li class="shelf__card is-trash"><div class="shelf__open">${body}</div>
          <div class="shelf__acts"><button type="button" class="btn btn-outline btn-xs" data-restore="${esc(e.id)}">terugzetten<span class="sr-only"> ${esc(e.title)}</span></button></div></li>`
      : `<li class="shelf__card"><a class="shelf__open" href="${esc(openHref(e))}">${body}</a>
          <div class="shelf__acts menu"><button type="button" class="iconbtn" data-more="${esc(e.id)}" aria-haspopup="menu" aria-expanded="false" aria-label="${esc(`Meer voor ${e.title}`)}" title="naam wijzigen, kopie, versies, weggooien">${MORE}</button></div></li>`;
  }

  function render() {
    closeMenu();
    const now = Date.now();
    const me = D.meId();
    const source = trashView ? trashList || [] : D.list();
    const shown = source.filter((e) => (!tool || e.tool === tool) && (!mine || e.byId === me || e.createdById === me) && D.matches(e, query));
    el.grid.innerHTML = shown.map((e) => card(e, now, me)).join('');
    const loading = trashView ? trashList === null : D.status() === 'laden';
    el.count.textContent = loading ? '' : `${shown.length} ${shown.length === 1 ? 'ontwerp' : 'ontwerpen'}${query ? ` met "${query}"` : ''}`;
    el.empty.hidden = !!shown.length;
    el.empty.textContent = loading
      ? 'Even laden…'
      : D.status() === 'fout' && !trashView
        ? 'De bieb is nu niet bereikbaar. Controleer je internet en ververs de pagina.'
        : trashView
          ? 'De prullenbak is leeg.'
          : query || mine || tool ? 'Niets gevonden. Probeer een ander woord of een ander filter.' : 'Nog niets in de bieb. Wat je maakt, komt er vanzelf in.';
    D.thumbs(shown.slice(0, 120)).then((map) => {
      el.grid.querySelectorAll('img[data-thumb]').forEach((img) => {
        const src = map.get(img.dataset.thumb);
        if (src) {
          img.src = src;
          img.hidden = false;
        }
      });
    });
  }

  async function loadTrash() {
    trashList = null;
    render();
    try {
      trashList = await D.trashed();
    } catch (err) {
      trashList = [];
      PM.toast(`De prullenbak is nu niet te laden. ${D.reason(err)}`, true);
    }
    render();
  }

  /* --- Het menu bij een ontwerp --- */

  let menuEl = null;
  let stale = false;   // de lijst veranderde terwijl het menu openstond
  function closeMenu() {
    if (!menuEl) return;
    const owner = el.grid.querySelector('[data-more][aria-expanded="true"]');
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
    menuEl = document.createElement('div');
    menuEl.className = 'menu__list shelf__menu';
    menuEl.setAttribute('role', 'menu');
    menuEl.innerHTML = [['open', 'openen'], ['naam', 'naam wijzigen'], ['kopie', 'kopie maken'], ['versies', 'eerdere versies'], ['weg', 'naar de prullenbak']]
      .map(([act, label]) => `<button type="button" class="menu__item" role="menuitem" data-act="${act}" data-id="${esc(id)}">${esc(label)}</button>`).join('');
    btn.parentElement.appendChild(menuEl);
    menuEl.querySelector('button').focus();
  }

  async function act(action, id) {
    closeMenu();
    const e = D.list().find((x) => x.id === id);
    if (!e) return;
    try {
      if (action === 'open') {
        location.href = openHref(e);
      } else if (action === 'naam') {
        const name = await PM.library.askName(e);
        if (name == null) return;
        await D.rename(id, name);
        PM.toast(name ? `De naam is nu ${name}.` : `De naam komt weer uit het ontwerp: ${e.auto}.`);
      } else if (action === 'kopie') {
        const row = await D.copy(id);
        PM.toast(`Kopie gemaakt: ${D.fromRow(row).title}.`, false, { label: 'open de kopie', run: () => { location.href = openHref(D.fromRow(row)); } });
      } else if (action === 'versies') {
        const v = await PM.library.askVersion(e);
        if (v) location.href = openHref(e, `&versie=${encodeURIComponent(v.id)}`);
      } else if (action === 'weg') {
        await D.trash(id);
        PM.toast(`${e.title} ligt in de prullenbak, ook voor je collega’s. Na ${D.TRASH_DAYS} dagen is hij weg.`, false, {
          label: 'ongedaan maken',
          run: async () => {
            await D.restore(id);
            render();
          },
        });
      }
      render();
    } catch (err) {
      PM.toast(`Dat lukte niet. ${D.reason(err)}`, true);
    }
  }

  /* --- Bediening --- */

  el.tools.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tool]');
    if (!b) return;
    tool = b.dataset.tool;
    syncFilters();
    render();
  });
  el.mine.addEventListener('click', () => {
    mine = !mine;
    syncFilters();
    render();
  });
  el.trash.addEventListener('click', () => {
    trashView = !trashView;
    syncFilters();
    if (trashView) loadTrash();
    else render();
  });
  el.query.addEventListener('input', () => {
    query = el.query.value;
    render();
  });
  el.grid.addEventListener('click', async (e) => {
    const more = e.target.closest('[data-more]');
    if (more) {
      e.preventDefault();
      if (more.getAttribute('aria-expanded') === 'true') closeMenu();
      else showMenu(more, more.dataset.more);
      return;
    }
    const a = e.target.closest('[data-act]');
    if (a) {
      act(a.dataset.act, a.dataset.id);
      return;
    }
    const restore = e.target.closest('[data-restore]');
    if (restore) {
      const item = (trashList || []).find((x) => x.id === restore.dataset.restore);
      try {
        await D.restore(restore.dataset.restore);
        trashList = (trashList || []).filter((x) => x.id !== restore.dataset.restore);
        render();
        PM.toast(`Teruggezet: ${item ? item.title : 'het ontwerp'} staat weer in de bieb.`, false, item ? { label: 'open', run: () => { location.href = openHref(item); } } : null);
        D.refresh().catch(() => {});
      } catch (err) {
        PM.toast(`Terugzetten lukte niet. ${D.reason(err)}`, true);
      }
    }
  });
  document.addEventListener('pointerdown', (e) => {
    if (menuEl && !menuEl.contains(e.target) && !e.target.closest('[data-more]')) closeMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menuEl) closeMenu();
  });
  window.addEventListener('pm-designs', () => {
    if (trashView) return;
    if (menuEl) stale = true;
    else render();
  });

  syncFilters();
  if (trashView) loadTrash();
  else render();
  D.refresh().catch(() => render());
})();
