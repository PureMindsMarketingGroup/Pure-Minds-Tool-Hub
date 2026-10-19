/* =============================================================================
   shell.js — de editor-indeling: appbalk, rail met één paneel tegelijk, podium
   -----------------------------------------------------------------------------
   Zoals Canva: links een rail met grote knoppen (icoon boven een kort woord),
   daarnaast één paneel, en de rest van het scherm is het ontwerp. Onder de
   1024 px staat het ontwerp bovenaan, is de rail een tabbalk onderin en opent
   een paneel als blad van onderen. Dezelfde HTML, alleen andere CSS.

   De markup is gewone HTML die ook zonder JavaScript leesbaar is
   (zie README, "Editor-bouwstenen"):

     <div class="app" data-app="insta">
       <header class="appbar">…</header>
       <nav class="rail" aria-label="Onderdelen">
         <button class="rail__item" data-section="tekst"><svg…/><span>Tekst</span></button>
       </nav>
       <div class="panels">
         <section class="panel" data-section="tekst">…</section>
       </div>
       <main class="stage">…</main>
     </div>

     const shell = PM.shell(root, { tool: 'insta' })
     shell.open('tekst', { focus })   paneel openen; focus: true (de kop), selector of element
     shell.close()                    paneel inklappen (mobiel: blad dicht)
     shell.toggle('tekst')
     shell.reveal('tekst', '#kop')    paneel open, veld in beeld, focus en kort oplichten
     shell.current                    id van het open paneel, of null
     shell.has('prijzen')             bestaat dit onderdeel nu (rail-knop niet verborgen of uit)?
     shell.disable('foto', 'reden')   rail-knop uit, met de reden erbij (tooltip, melding bij klikken)
     shell.enable('foto')
     shell.onChange(cb)               cb({ id, open, narrow })
     shell.onAction(naam, cb)         menu-items met data-action="<naam>"
     shell.setRegions(canvas, regio's, onPick)   klikbare delen van het ontwerp
     shell.showKeys()                 het overzicht met sneltoetsen
     shell.syncTour()                 de tool wisselde van rondleiding: stipje op hulp bijwerken

   Optie tourTool: () => naam van de rondleiding (PM_HELP.<naam>.tour) als een tool
   er meer heeft, zoals de Presentation Maker bij een voorstel; anders die van de tool.

   Ook voor de andere bouwstenen: PM.place (zwevend element naast een ander
   plaatsen), PM.announce (tekst voor schermlezers), PM.rovingIndex.
   Laden na core.js; teksten komen uit window.PM_HELP.<tool>.
   ============================================================================= */
(function (global) {
  'use strict';

  /* ---------------------------------------------------------------------------
     Rekenwerk zonder DOM (getest in tests/shell.test.js)
     ------------------------------------------------------------------------- */

  const OPPOSITE = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  /**
   * Plek voor een zwevend element (w × h) naast anchor (een DOMRect in
   * viewport-px). Voorkeurkant eerst, dan de overkant, dan de andere twee;
   * past niets, dan de kant met de meeste ruimte. Altijd binnen de marge.
   */
  function place(anchor, size, view, { side = 'bottom', align = 'start', gap = 8, margin = 12 } = {}) {
    const w = size.width;
    const h = size.height;
    const vw = view.width;
    const vh = view.height;
    const room = {
      bottom: vh - anchor.bottom - gap - margin,
      top: anchor.top - gap - margin,
      right: vw - anchor.right - gap - margin,
      left: anchor.left - gap - margin,
    };
    const need = (s) => (s === 'top' || s === 'bottom' ? h : w);
    const order = [side, OPPOSITE[side], ...(side === 'top' || side === 'bottom' ? ['right', 'left'] : ['bottom', 'top'])];
    let chosen = order.find((s) => room[s] >= need(s));
    if (!chosen) chosen = order.reduce((best, s) => (room[s] > room[best] ? s : best), order[0]);

    let top;
    let left;
    if (chosen === 'top' || chosen === 'bottom') {
      top = chosen === 'bottom' ? anchor.bottom + gap : anchor.top - gap - h;
      if (align === 'center') left = anchor.left + (anchor.width - w) / 2;
      else if (align === 'end') left = anchor.right - w;
      else left = anchor.left;
    } else {
      left = chosen === 'right' ? anchor.right + gap : anchor.left - gap - w;
      top = align === 'start' ? anchor.top : anchor.top + (anchor.height - h) / 2;
    }
    left = clamp(left, margin, Math.max(margin, vw - margin - w));
    top = clamp(top, margin, Math.max(margin, vh - margin - h));
    return { top: Math.round(top), left: Math.round(left), side: chosen };
  }

  // Muis- of vingerpositie in canvas-px (canvas.width × canvas.height)
  function toCanvasPoint(clientX, clientY, rect, canvasW, canvasH) {
    return {
      x: ((clientX - rect.left) * canvasW) / (rect.width || 1),
      y: ((clientY - rect.top) * canvasH) / (rect.height || 1),
    };
  }

  // Welke regio ligt onder het punt? De kleinste wint (een kop op een foto),
  // bij gelijke grootte de laatste in de lijst
  function hitRegion(regions, x, y) {
    let hit = null;
    let area = Infinity;
    for (const r of regions || []) {
      const b = r && r.rect;
      if (!b || x < b.x || y < b.y || x > b.x + b.w || y > b.y + b.h) continue;
      const a = b.w * b.h;
      if (a <= area) {
        hit = r;
        area = a;
      }
    }
    return hit;
  }

  // Pijltjes, Home en End in een rij knoppen (rail, werkbalk, menu); -1 = geen beweging
  function rovingIndex(current, count, key) {
    if (!count) return -1;
    if (key === 'ArrowDown' || key === 'ArrowRight') return (current + 1) % count;
    if (key === 'ArrowUp' || key === 'ArrowLeft') return (current - 1 + count) % count;
    if (key === 'Home') return 0;
    if (key === 'End') return count - 1;
    return -1;
  }

  /**
   * 'Ctrl + Shift + Z of Ctrl + Y' -> [['Ctrl', 'Shift', 'Z'], ['Ctrl', 'Y']].
   * Op een Mac Ctrl als ⌘, Alt als ⌥ en Shift als ⇧.
   */
  function formatKeys(combo, isMac = false) {
    const mac = { ctrl: '⌘', cmd: '⌘', alt: '⌥', option: '⌥', shift: '⇧' };
    return String(combo || '').split(/\s+of\s+/i).map((alt) => alt.split(/\s+\+\s+/).map((k) => {
      const key = k.trim();
      return isMac && mac[key.toLowerCase()] ? mac[key.toLowerCase()] : key;
    })).filter((keys) => keys.length && keys[0]);
  }

  // Opgeslagen staat van de indeling: alleen een paneel dat nog bestaat
  function readSaved(saved, ids) {
    const s = saved && typeof saved === 'object' ? saved : {};
    return { panel: ids.includes(s.panel) ? s.panel : ids[0] || null, collapsed: s.collapsed === true };
  }

  /* ---------------------------------------------------------------------------
     Schermlezers: één gedeelde live region
     ------------------------------------------------------------------------- */

  let liveEl = null;
  function announce(message) {
    const doc = global.document;
    if (!doc || !doc.body) return;
    if (!liveEl) {
      liveEl = doc.createElement('div');
      liveEl.className = 'sr-only';
      liveEl.setAttribute('aria-live', 'polite');
      liveEl.setAttribute('aria-atomic', 'true');
      doc.body.appendChild(liveEl);
    }
    liveEl.textContent = '';
    // Een frame later, zodat dezelfde tekst twee keer na elkaar ook voorgelezen wordt
    global.setTimeout(() => { liveEl.textContent = String(message || ''); }, 60);
  }

  /* ---------------------------------------------------------------------------
     De indeling
     ------------------------------------------------------------------------- */

  const SVG_CLOSE = '<svg class="ri" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 10.59 16.95 5.64l1.41 1.41L13.41 12l4.95 4.95-1.41 1.41L12 13.41l-4.95 4.95-1.41-1.41L10.59 12 5.64 7.05l1.41-1.41z"/></svg>';
  const SVG_FOLD = '<svg class="ri" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h8v14H5zm14 14h-4V5h4zM4 3a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1zm3 9 4-3.5v7z"/></svg>';

  function shell(rootArg, options = {}) {
    const doc = global.document;
    const PM = global.PM;
    const root = typeof rootArg === 'string' ? doc.querySelector(rootArg) : rootArg || doc.querySelector('[data-app]');
    if (!root) throw new Error('PM.shell: geen [data-app] gevonden.');
    const tool = options.tool || root.dataset.app || 'tool';
    const data = (global.PM_HELP && global.PM_HELP[tool]) || {};
    const sections = Array.isArray(data.sections) ? data.sections : [];
    const $$ = (sel, el = root) => Array.from(el.querySelectorAll(sel));
    // Welke rondleiding: die van de tool, tenzij de tool zelf kiest (options.tourTool)
    const tourTool = () => (typeof options.tourTool === 'function' && options.tourTool()) || tool;

    const rail = root.querySelector('.rail');
    const panelsBox = root.querySelector('.panels');
    const tabs = rail ? $$('.rail__item[data-section]', rail) : [];
    const panels = panelsBox ? $$('.panel[data-section]', panelsBox) : [];
    const ids = tabs.map((t) => t.dataset.section).filter((id) => panels.some((p) => p.dataset.section === id));
    const narrow = global.matchMedia('(max-width: 1023px)');
    const reduced = global.matchMedia('(prefers-reduced-motion: reduce)');
    const KEY = `pm-shell-${tool}-v1`;
    const store = PM && PM.store;
    const listeners = new Set();
    const actions = {};
    const regionCanvases = new WeakSet();   // canvassen met klikbare regio's
    const regionState = new WeakMap();

    doc.body.classList.add('has-app');

    const tabFor = (id) => tabs.find((t) => t.dataset.section === id);
    // Een onderdeel bestaat als zijn rail-knop zichtbaar is (de tool verbergt bijv. prijzen buiten een offerte)
    const has = (id) => !!panelFor(id) && !!tabFor(id) && !tabFor(id).hidden && tabFor(id).getAttribute('aria-disabled') !== 'true';
    const panelFor = (id) => panels.find((p) => p.dataset.section === id);
    const sectionInfo = (id) => sections.find((s) => s.id === id) || {};

    /* --- ARIA en koppen: de rail is een tablist, elk paneel een tabpanel --- */

    if (rail) {
      rail.setAttribute('role', 'tablist');
      if (!rail.hasAttribute('aria-label')) rail.setAttribute('aria-label', 'Onderdelen');
    }
    tabs.forEach((tab) => {
      const id = tab.dataset.section;
      const panel = panelFor(id);
      tab.type = 'button';
      tab.setAttribute('role', 'tab');
      if (!tab.id) tab.id = `${tool}-tab-${id}`;
      if (panel) {
        if (!panel.id) panel.id = `${tool}-panel-${id}`;
        tab.setAttribute('aria-controls', panel.id);
      }
    });
    panels.forEach((panel) => {
      const id = panel.dataset.section;
      const info = sectionInfo(id);
      panel.setAttribute('role', 'tabpanel');
      let head = panel.querySelector('.panel__head');
      if (!head) {
        head = doc.createElement('header');
        head.className = 'panel__head';
        const title = info.title || (tabFor(id) && tabFor(id).textContent.trim()) || id;
        head.innerHTML = `<h2 class="panel__title">${esc(title)}<span class="dot">.</span></h2>`;
        panel.prepend(head);
      }
      const heading = head.querySelector('h2, h3');
      if (heading) {
        heading.tabIndex = -1;
        if (!heading.id) heading.id = `${tool}-panel-${id}-kop`;
        if (!panel.hasAttribute('aria-labelledby')) panel.setAttribute('aria-labelledby', heading.id);
      }
      if (!head.querySelector('.panel__close')) {
        const btn = doc.createElement('button');
        btn.type = 'button';
        btn.className = 'panel__close';
        btn.setAttribute('aria-label', 'Paneel sluiten');
        btn.title = 'Paneel sluiten';
        btn.innerHTML = SVG_FOLD + SVG_CLOSE;
        head.appendChild(btn);
      }
    });

    /* --- Open en dicht --- */

    const saved = readSaved(store ? store.get(KEY, null) : null, ids);
    let openId = null;
    let lastId = saved.panel;
    let collapsed = saved.collapsed;

    function persist() {
      if (store) store.set(KEY, { panel: lastId, collapsed });
    }

    function syncTabs() {
      tabs.forEach((tab) => {
        const id = tab.dataset.section;
        tab.setAttribute('aria-selected', String(id === openId));
        tab.tabIndex = id === (openId || lastId) ? 0 : -1;
      });
      root.classList.toggle('is-collapsed', !openId);
      root.classList.toggle('is-sheet-open', !!openId && narrow.matches);
      if (panelsBox) panelsBox.hidden = !openId;
    }

    function emit() {
      const info = { id: openId, open: !!openId, narrow: narrow.matches };
      listeners.forEach((cb) => cb(info));
    }

    function resolve(target, scope) {
      if (!target) return null;
      if (target.nodeType === 1) return target;
      if (typeof target === 'string') return scope.querySelector(target) || doc.getElementById(target.replace(/^#/, ''));
      return null;
    }

    function open(id, { focus = false } = {}) {
      const panel = panelFor(id);
      if (!panel || !has(id)) return false;
      const changed = openId !== id;
      openId = id;
      lastId = id;
      if (!narrow.matches) collapsed = false;
      panels.forEach((p) => { p.hidden = p !== panel; });
      syncTabs();
      if (changed) {
        panel.scrollTop = 0;
        panel.classList.remove('is-entering');
        if (!reduced.matches) {
          void panel.offsetWidth;  // animatie opnieuw starten
          panel.classList.add('is-entering');
        }
      }
      persist();
      if (focus === true) {
        const heading = panel.querySelector('.panel__head h2, .panel__head h3');
        if (heading) heading.focus({ preventScroll: true });
      } else if (focus) {
        const el = resolve(focus, panel);
        if (el) el.focus({ preventScroll: true });
      }
      if (changed) emit();
      return true;
    }

    function close({ focusRail = null } = {}) {
      if (!openId) return;
      const hadFocus = panelsBox && panelsBox.contains(doc.activeElement);
      openId = null;
      if (!narrow.matches) collapsed = true;
      syncTabs();
      persist();
      if (focusRail === true || (focusRail === null && hadFocus)) {
        const tab = tabFor(lastId);
        if (tab) tab.focus();
      }
      emit();
    }

    function toggle(id, opts) {
      if (openId === id) close(opts);
      else open(id, opts);
    }

    // Paneel open, veld in beeld, focus en kort oplichten (klik in het ontwerp)
    function reveal(id, field) {
      open(id);
      const panel = panelFor(id);
      const el = panel && resolve(field, panel);
      if (!el) return null;
      const box = el.closest('.field, .rte-wrap, .switch, .badge-toggle, .seg, fieldset') || el;
      box.scrollIntoView({ block: 'center', behavior: reduced.matches ? 'auto' : 'smooth' });
      el.focus({ preventScroll: true });
      box.classList.remove('is-flash');
      void box.offsetWidth;
      box.classList.add('is-flash');
      return el;
    }

    /* --- Een onderdeel uitzetten, met de reden zichtbaar (geen stil verdwijnende knop) --- */

    function disable(id, reason) {
      const tab = tabFor(id);
      if (!tab) return;
      tab.setAttribute('aria-disabled', 'true');
      tab.dataset.reason = reason || '';
      tab.title = reason || '';
      let note = tab.querySelector('.rail__reason');
      if (!note) {
        note = doc.createElement('span');
        note.className = 'sr-only rail__reason';
        note.id = `${tab.id}-reden`;
        tab.appendChild(note);
        tab.setAttribute('aria-describedby', note.id);
      }
      note.textContent = reason ? `Niet beschikbaar: ${reason}` : 'Niet beschikbaar';
      if (openId === id) {
        const next = ids.find((x) => has(x));
        if (next && !narrow.matches) open(next);
        else close({ focusRail: false });
      }
      if (lastId === id && !openId) lastId = ids.find((x) => has(x)) || lastId;
      syncTabs();
    }

    function enable(id) {
      const tab = tabFor(id);
      if (!tab || tab.getAttribute('aria-disabled') !== 'true') return;
      tab.removeAttribute('aria-disabled');
      tab.removeAttribute('title');
      delete tab.dataset.reason;
      const note = tab.querySelector('.rail__reason');
      if (note) {
        note.remove();
        tab.removeAttribute('aria-describedby');
      }
    }

    /* --- Rail: klikken, pijltjes, Enter en spatie --- */

    tabs.forEach((tab) => {
      tab.addEventListener('click', (e) => {
        const id = tab.dataset.section;
        // Uit: niet openen, wel zeggen waarom (op een touchscreen is er geen tooltip)
        if (tab.getAttribute('aria-disabled') === 'true') {
          if (PM.toast) PM.toast(tab.dataset.reason || 'Dit onderdeel hoort niet bij deze keuze.');
          return;
        }
        const byKeyboard = e.detail === 0;
        if (openId === id) close({ focusRail: true });
        else open(id, { focus: byKeyboard });
      });
    });
    if (rail) {
      rail.addEventListener('keydown', (e) => {
        const shown = tabs.filter((t) => !t.hidden);
        const i = shown.indexOf(doc.activeElement);
        if (i < 0) return;
        const next = rovingIndex(i, shown.length, e.key);
        if (next < 0) return;
        e.preventDefault();
        tabs.forEach((t) => { t.tabIndex = t === shown[next] ? 0 : -1; });
        shown[next].focus();
      });
    }

    if (panelsBox) {
      panelsBox.addEventListener('click', (e) => {
        if (e.target.closest('.panel__close')) close({ focusRail: true });
      });
    }

    // Esc sluit het blad op mobiel. Op window, zodat hulp, rondleiding en
    // werkbalk (op document) eerst mogen: die zetten defaultPrevented.
    global.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented || !narrow.matches || !openId) return;
      if (e.target.closest && e.target.closest('dialog, .popover, .menu__list')) return;
      e.preventDefault();
      close({ focusRail: true });
    });

    // Tikken naast het blad sluit het (het ontwerp blijft zichtbaar)
    doc.addEventListener('pointerdown', (e) => {
      if (!narrow.matches || !openId) return;
      const t = e.target;
      if (!t.closest || regionCanvases.has(t)) return;   // het ontwerp zelf: de klik beslist
      if (panelsBox.contains(t) || (rail && rail.contains(t))) return;
      if (t.closest('[data-shell-keep], .tour, .tour-pane, .helptip, .popover, .menu__list, dialog, .toast, .tbar')) return;
      close({ focusRail: false });
    });

    // Breed <-> smal: rail en paneel wisselen van vorm; de inhoud blijft dezelfde
    function syncMode() {
      if (rail) rail.setAttribute('aria-orientation', narrow.matches ? 'horizontal' : 'vertical');
      openId = !narrow.matches && !collapsed && lastId ? lastId : null;
      panels.forEach((p) => { p.hidden = p.dataset.section !== lastId; });
      syncTabs();
      emit();
    }
    narrow.addEventListener('change', syncMode);

    /* --- Klikbare delen van het ontwerp --- */

    function bindRegions(canvas) {
      const host = canvas.parentElement;
      if (global.getComputedStyle(host).position === 'static') host.style.position = 'relative';
      const hover = doc.createElement('div');
      hover.className = 'region-hover';
      hover.hidden = true;
      hover.setAttribute('aria-hidden', 'true');
      hover.innerHTML = '<span class="region-hover__tag"></span>';
      host.appendChild(hover);
      const st = { regions: [], onPick: null, hit: null, down: null };

      // Regio's staan in ontwerppixels; een scherpe preview heeft meer canvaspixels (dataset.designW)
      const designW = () => Number(canvas.dataset.designW) || canvas.width;
      const designH = () => Number(canvas.dataset.designH) || canvas.height;
      const pointAt = (e) => toCanvasPoint(e.clientX, e.clientY, canvas.getBoundingClientRect(), designW(), designH());

      function show(hit) {
        st.hit = hit;
        canvas.classList.toggle('has-region', !!hit);
        if (!hit) {
          hover.hidden = true;
          return;
        }
        const k = canvas.clientWidth / designW();
        const b = hit.rect;
        hover.style.left = `${canvas.offsetLeft + canvas.clientLeft + b.x * k}px`;
        hover.style.top = `${canvas.offsetTop + canvas.clientTop + b.y * k}px`;
        hover.style.width = `${b.w * k}px`;
        hover.style.height = `${b.h * k}px`;
        hover.firstChild.textContent = hit.label || '';
        hover.firstChild.hidden = !hit.label;
        hover.hidden = false;
      }

      canvas.addEventListener('pointermove', (e) => {
        if (e.pointerType === 'touch' || st.down && st.down.dragging) return;
        if (st.down && Math.hypot(e.clientX - st.down.x, e.clientY - st.down.y) > 5) {
          st.down.dragging = true;
          show(null);
          return;
        }
        const p = pointAt(e);
        const hit = hitRegion(st.regions, p.x, p.y);
        if (hit !== st.hit) show(hit);
      });
      canvas.addEventListener('pointerleave', () => show(null));
      canvas.addEventListener('pointerdown', (e) => { st.down = { x: e.clientX, y: e.clientY, dragging: false }; });
      canvas.addEventListener('click', (e) => {
        const down = st.down;
        st.down = null;
        if (down && (down.dragging || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5)) return;   // dat was slepen
        const p = pointAt(e);
        const hit = hitRegion(st.regions, p.x, p.y);
        if (hit) {
          if (st.onPick) st.onPick(hit, e);
          if (e.pointerType !== 'mouse') show(null);
        } else if (narrow.matches && openId) {
          close({ focusRail: false });
        }
      });
      st.refresh = () => { if (st.hit) show(st.regions.find((r) => r.key === st.hit.key) || null); };
      return st;
    }

    /**
     * regions: [{ key, rect: { x, y, w, h }, label, section, field }] in canvas-px.
     * onPick(regio, event); zonder onPick opent de shell regio.section en
     * springt naar regio.field (selector, id of element).
     */
    function setRegions(canvas, regions, onPick) {
      if (!canvas) return;
      let st = regionState.get(canvas);
      if (!st) {
        st = bindRegions(canvas);
        regionState.set(canvas, st);
        regionCanvases.add(canvas);
      }
      st.regions = Array.isArray(regions) ? regions : [];
      st.onPick = onPick || ((r) => { if (r.section) reveal(r.section, r.field); });
      st.refresh();
    }

    /* --- Menu's en popovers in de appbalk (hulp, downloadopties) --- */

    let openPop = null;

    function closePop({ focusTrigger = false } = {}) {
      if (!openPop) return;
      const { trigger, target } = openPop;
      target.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      openPop = null;
      if (focusTrigger) trigger.focus();
    }

    function openPopFor(trigger, { byKeyboard = false } = {}) {
      const target = doc.getElementById(trigger.getAttribute('aria-controls'));
      if (!target) return;
      closePop();
      if (target.getAttribute('role') === 'menu') syncTourItem(target);
      target.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      openPop = { trigger, target };
      if (target.getAttribute('role') === 'menu') {
        const items = menuItems(target);
        if (items[0]) items[0].focus();
      } else {
        // Eerst de gekozen optie (radio), anders het eerste bedieningselement dat geen [?] is
        const first = target.querySelector('input:checked') || target.querySelector('input, select, button:not(.help), [tabindex="0"]');
        if (byKeyboard && first) first.focus();
        else target.focus({ preventScroll: true });
      }
    }

    const menuItems = (menu) => Array.from(menu.querySelectorAll('[role="menuitem"]')).filter((i) => !i.hidden && !i.disabled);

    const triggers = $$('[aria-haspopup][aria-controls]');
    triggers.forEach((trigger) => {
      trigger.setAttribute('aria-expanded', 'false');
      const target = doc.getElementById(trigger.getAttribute('aria-controls'));
      if (!target) return;
      target.hidden = true;
      if (!target.hasAttribute('tabindex')) target.tabIndex = -1;
      if (target.getAttribute('role') === 'menu') menuItems(target).forEach((item) => { item.tabIndex = -1; });
      trigger.addEventListener('click', (e) => {
        if (openPop && openPop.trigger === trigger) closePop();
        else openPopFor(trigger, { byKeyboard: e.detail === 0 });
      });
      trigger.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown' && target.getAttribute('role') === 'menu') {
          e.preventDefault();
          openPopFor(trigger, { byKeyboard: true });
        }
      });
      target.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          closePop({ focusTrigger: true });
          return;
        }
        if (target.getAttribute('role') !== 'menu') return;
        if (e.key === 'Tab') {
          closePop();
          return;
        }
        const items = menuItems(target);
        const next = rovingIndex(items.indexOf(doc.activeElement), items.length, e.key === 'ArrowRight' || e.key === 'ArrowLeft' ? '' : e.key);
        if (next >= 0) {
          e.preventDefault();
          items[next].focus();
        }
      });
      // Een popover (geen menu) sluit als de focus hem verlaat
      target.addEventListener('focusout', (e) => {
        if (target.getAttribute('role') === 'menu' || !openPop || openPop.target !== target) return;
        const to = e.relatedTarget;
        if (to && !target.contains(to) && to !== trigger) closePop();
      });
    });

    doc.addEventListener('pointerdown', (e) => {
      if (!openPop) return;
      if (openPop.target.contains(e.target) || openPop.trigger.contains(e.target)) return;
      closePop();
    });

    // Menu-items: data-action="tour" en "sneltoetsen" zijn ingebouwd, de rest via onAction
    root.addEventListener('click', (e) => {
      const item = e.target.closest('[data-action]');
      if (!item || !root.contains(item)) return;
      const name = item.dataset.action;
      const from = openPop ? openPop.trigger : item;
      if (item.getAttribute('role') === 'menuitem') closePop({ focusTrigger: name !== 'tour' });
      if (name === 'tour' && PM.tour) PM.tour.start(tourTool(), { from });
      else if (name === 'sneltoetsen') showKeys();
      if (actions[name]) actions[name].forEach((cb) => cb(item));
    });

    function syncTourItem(menu) {
      const item = menu.querySelector('[data-action="tour"]');
      if (!item || !PM.tour || !PM.tour.describe) return;
      const label = item.querySelector('[data-label]') || item;
      label.textContent = PM.tour.describe(tourTool());
    }

    /* --- Sneltoetsen: overzicht uit PM_HELP.<tool>.keys --- */

    let keysDialog = null;
    const isMac = /Mac|iPhone|iPad/.test((global.navigator && (global.navigator.platform || global.navigator.userAgent)) || '');

    function showKeys() {
      const keys = Array.isArray(data.keys) ? data.keys : [];
      if (!keysDialog) {
        keysDialog = doc.createElement('dialog');
        keysDialog.className = 'keys';
        keysDialog.setAttribute('aria-labelledby', `${tool}-keys-title`);
        keysDialog.innerHTML = `
          <div class="keys__head">
            <h2 class="keys__title" id="${tool}-keys-title">Sneltoetsen<span class="dot">.</span></h2>
            <button type="button" class="panel__close keys__close" aria-label="Sluiten">${SVG_CLOSE}</button>
          </div>
          <dl class="keys__list">${keys.map(([combo, what]) => `<div class="keys__row"><dt>${formatKeys(combo, isMac).map((alt) => `<span class="keys__combo">${alt.map((k) => `<kbd>${esc(k)}</kbd>`).join(' + ')}</span>`).join('<span class="muted">of</span>')}</dt><dd>${esc(what)}</dd></div>`).join('')}</dl>`;
        doc.body.appendChild(keysDialog);
        keysDialog.querySelector('.keys__close').addEventListener('click', () => keysDialog.close());
        // Klik op de achtergrond (buiten het vak) sluit ook
        keysDialog.addEventListener('click', (e) => { if (e.target === keysDialog) keysDialog.close(); });
      }
      if (typeof keysDialog.showModal === 'function') keysDialog.showModal();
      else keysDialog.setAttribute('open', '');
    }

    // "?" opent het overzicht, behalve in een tekstveld
    doc.addEventListener('keydown', (e) => {
      if (e.key !== '?' || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      const t = e.target;
      if (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || (keysDialog && keysDialog.open)) return;
      e.preventDefault();
      showKeys();
    });

    // Stipje op de hulpknop zolang de rondleiding nog niet gedaan is
    const helpTrigger = root.querySelector('[data-help-menu]');
    function syncHelpDot() {
      if (helpTrigger && PM.tour && PM.tour.pending) helpTrigger.classList.toggle('has-dot', PM.tour.pending(tourTool()));
    }
    doc.addEventListener('pm:tour', syncHelpDot);

    /* --- Start --- */

    if (options.open && ids.includes(options.open)) lastId = options.open;
    syncMode();
    if (PM.help && PM.help.init) PM.help.init(doc, tool);
    syncHelpDot();
    // Vanuit de hub (tools/<tool>.html#rondleiding): de rondleiding direct, vanaf het begin
    const viaHub = global.location && global.location.hash === '#rondleiding';
    if (viaHub) global.history.replaceState(null, '', global.location.pathname + global.location.search);
    if (PM.tour && viaHub && options.tour !== false) global.setTimeout(() => PM.tour.start(tourTool(), { at: 0 }), 500);
    else if (PM.tour && PM.tour.auto && options.tour !== false) PM.tour.auto(tourTool(), { quickStart: !!options.quickStart });

    const api = {
      root,
      tool,
      open,
      close,
      toggle,
      reveal,
      setRegions,
      showKeys,
      syncTour: syncHelpDot,
      closePopover: closePop,
      disable,
      enable,
      has,
      onChange(cb) {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
      onAction(name, cb) {
        (actions[name] = actions[name] || []).push(cb);
      },
      get current() { return openId; },
      get last() { return lastId; },
      get isNarrow() { return narrow.matches; },
    };
    shell.instance = api;
    return api;
  }

  function esc(text) {
    return String(text == null ? '' : text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  const pure = { place, toCanvasPoint, hitRegion, rovingIndex, formatKeys, readSaved };

  if (typeof module !== 'undefined' && module.exports) module.exports = pure;
  if (global && global.document) {
    const PM = global.PM = global.PM || {};
    PM.shell = Object.assign(shell, pure);
    PM.place = place;
    PM.announce = announce;
    PM.rovingIndex = rovingIndex;
  }
})(typeof window !== 'undefined' ? window : globalThis);
