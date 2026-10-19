/* =============================================================================
   core.js — gedeelde hulpfuncties voor de hub en alle tools
   -----------------------------------------------------------------------------
   Alles hangt onder window.PM:

     PM.url(path)          pad vanaf de root, ook vanuit tools/ (<html data-root>)
     PM.renderToolNav()    vult <nav data-toolnav="<id>"> vanuit PM_TOOLS
     PM.recentTools()      { toolId: tijdstip } van de tools die hier open zijn geweest (hub)
     PM.startParams()      eenmalige instellingen uit de link van het dashboard (?format=story)
     PM.toast(msg, err, action)  korte melding onderin, eventueel met knop ("ongedaan maken")
     PM.run(knop, tekst, taak)   export met feedback op de knop: bezig, voortgang, ✓ klaar
     PM.textTools(root)    knoppen "cyaan"/"vet" en "+ klant" bij tekstvelden
     PM.toggleEmphasis(veld), PM.insertAtCaret(veld, tekst)
                           dezelfde acties los, voor de werkbalk (js/shared/toolbar.js)
     PM.miniPreview(stage, canvas)  zwevende live preview op mobiel
     PM.previewScale(canvas, w)  canvaspixels per ontwerppixel voor een scherpe preview (schermschaal)
     PM.watchPreview(canvas, fn)  opnieuw tekenen bij een andere maat of pixeldichtheid
     PM.store              localStorage met JSON en try/catch
     PM.idb                IndexedDB voor afbeeldingen (te groot voor localStorage)
     PM.readImage(file)    bestand -> { img, url } of een nette foutmelding
     PM.bindDrop(...)      slepen van een bestand op een zone
     PM.saveBlob(...)      bestand downloaden
     PM.libs               jsPDF, svg2pdf, JSZip, docx en pdf-lib, pas geladen bij de eerste export
     PM.pdfFonts(pdf)      Pure Minds Sans insluiten in een PDF (echte, bewerkbare tekst)
     PM.pdfDocument(opts)  een nieuwe PDF zoals alle makers hem maken; PM.pdfFinish(pdf, meta) -> Blob
     PM.fontFiles()        Pure Minds Sans als bytes per snede (voor Word)
     PM.brandImage(key)    logo als Image, met ingebedde kopie bij file://
     PM.brandSvg(key)      logo als SVG-tekst (vector in PDF's)
     PM.fontsReady         belofte die klaar is als Pure Minds Sans geladen is
   ============================================================================= */
(function (global) {
  'use strict';

  const root = document.documentElement.dataset.root || '';
  const url = (path) => root + path;

  /* ---------------------------------------------------------------------------
     Kop: toolwisselaar
     ------------------------------------------------------------------------- */

  function renderToolNav() {
    const nav = document.querySelector('[data-toolnav]');
    if (!nav || !Array.isArray(global.PM_TOOLS)) return;
    const current = nav.dataset.toolnav;
    const links = [`<a class="toolnav__home" href="${url('index.html')}">alle tools</a>`];
    for (const tool of global.PM_TOOLS) {
      if (tool.status === 'binnenkort' || tool.kind) continue;   // web-apps en downloads staan alleen op het dashboard
      const here = tool.id === current ? ' aria-current="page"' : '';
      links.push(`<a href="${url(tool.href)}"${here}>${esc(tool.short || tool.name)}</a>`);
    }
    nav.innerHTML = links.join('');
  }

  /* ---------------------------------------------------------------------------
     Recente tools en snelle starts: de hub toont "Verder werken" en "Begin direct"
     ------------------------------------------------------------------------- */

  const RECENT_KEY = 'pm-hub-recent-v1';

  // { toolId: tijdstip }; de oude vorm { id, at } (alleen de laatste tool) wordt omgezet
  function recentTools() {
    const saved = store.get(RECENT_KEY, {});
    if (saved && typeof saved.id === 'string') return { [saved.id]: saved.at };
    return saved && typeof saved === 'object' ? saved : {};
  }

  function rememberTool() {
    const nav = document.querySelector('[data-toolnav]');
    const id = nav && nav.dataset.toolnav;
    if (!id || id === 'hub') return;
    const save = () => store.set(RECENT_KEY, { ...recentTools(), [id]: Date.now() });
    // Door de hub voorgeladen (speculation rules)? Dan pas tellen als hij echt opengaat
    if (document.prerendering) document.addEventListener('prerenderingchange', save, { once: true });
    else save();
  }

  /**
   * Instellingen uit een snelle start op het dashboard (?type=offerte). Eenmalig:
   * daarna verdwijnen ze uit de adresbalk, zodat verversen of een bladwijzer je
   * eigen keuzes in de tool niet overschrijft.
   */
  function startParams() {
    const params = new URLSearchParams(location.search);
    if (!params.toString()) return {};
    history.replaceState(null, '', location.pathname + location.hash);
    return Object.fromEntries(params);
  }

  function esc(text) {
    return String(text == null ? '' : text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* ---------------------------------------------------------------------------
     Melding
     ------------------------------------------------------------------------- */

  let toastEl = null;
  let toastTimer = 0;
  /**
   * Korte melding onderin. action = { label, run } geeft een knop in de melding,
   * bijvoorbeeld "ongedaan maken"; zo'n melding blijft langer staan.
   */
  function toast(message, isError = false, action = null) {
    if (!toastEl) {
      toastEl = document.getElementById('toast');
      if (!toastEl) {
        toastEl = document.createElement('div');
        toastEl.className = 'toast';
        toastEl.setAttribute('role', 'status');
        toastEl.setAttribute('aria-live', 'polite');
        document.body.appendChild(toastEl);
      }
    }
    toastEl.textContent = '';
    const text = document.createElement('span');
    text.textContent = message;
    toastEl.appendChild(text);
    if (action) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'toast__action';
      btn.textContent = action.label;
      btn.addEventListener('click', () => {
        toastEl.classList.remove('is-visible');
        action.run();
      }, { once: true });
      toastEl.appendChild(btn);
    }
    toastEl.classList.toggle('is-error', isError);
    toastEl.classList.toggle('has-action', !!action);
    toastEl.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-visible'), action ? 8000 : isError ? 6500 : 3200);
  }

  /* ---------------------------------------------------------------------------
     Opslag
     ------------------------------------------------------------------------- */

  const store = {
    get(key, fallback = null) {
      try {
        const raw = localStorage.getItem(key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch (err) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (err) {
        return false;  // privévenster of opslag vol: dan alleen niet onthouden
      }
    },
    remove(key) {
      try {
        localStorage.removeItem(key);
      } catch (err) {
        /* niets */
      }
    },
  };

  // Afbeeldingen als Blob in IndexedDB. Faalt stil: dan worden ze niet onthouden.
  const idb = (() => {
    let dbPromise = null;
    function open() {
      if (!dbPromise) {
        dbPromise = new Promise((resolve, reject) => {
          if (!global.indexedDB) {
            reject(new Error('Geen IndexedDB'));
            return;
          }
          const req = indexedDB.open('pure-minds-hub', 1);
          req.onupgradeneeded = () => req.result.createObjectStore('files');
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        }).catch((err) => {
          dbPromise = null;
          throw err;
        });
      }
      return dbPromise;
    }
    function run(mode, fn) {
      return open().then((db) => new Promise((resolve, reject) => {
        const tx = db.transaction('files', mode);
        const req = fn(tx.objectStore('files'));
        tx.oncomplete = () => resolve(req && req.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }));
    }
    return {
      get: (key) => run('readonly', (s) => s.get(key)).catch(() => null),
      set: (key, value) => run('readwrite', (s) => s.put(value, key)).catch(() => null),
      del: (key) => run('readwrite', (s) => s.delete(key)).catch(() => null),
    };
  })();

  /* ---------------------------------------------------------------------------
     Afbeeldingen
     ------------------------------------------------------------------------- */

  function readImage(file) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\//.test(file.type)) {
        reject(new Error('Kies een afbeelding: JPG, PNG, WebP of SVG.'));
        return;
      }
      const src = URL.createObjectURL(file);
      const img = new Image();
      // Een SVG is op elke maat scherp: de PDF-export tekent hem dan niet op zijn eigen (kleine) maat
      if (/svg/i.test(file.type)) img.dataset.pdfType = 'SVG';
      img.onload = () => resolve({ img, url: src });
      img.onerror = () => {
        URL.revokeObjectURL(src);
        reject(new Error('Deze afbeelding kan de browser niet lezen. Probeer een JPG of PNG (HEIC van een iPhone werkt niet).'));
      };
      img.src = src;
    });
  }

  // Slepen op een zone; `target` krijgt de klasse is-over zolang er iets boven hangt
  function bindDrop(zone, onFile, target = zone) {
    let depth = 0;
    const hasFiles = (e) => Array.from(e.dataTransfer ? e.dataTransfer.types : []).includes('Files');
    zone.addEventListener('dragenter', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth++;
      target.classList.add('is-over');
    });
    zone.addEventListener('dragover', (e) => {
      if (hasFiles(e)) e.preventDefault();
    });
    zone.addEventListener('dragleave', () => {
      depth = Math.max(0, depth - 1);
      if (!depth) target.classList.remove('is-over');
    });
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      depth = 0;
      target.classList.remove('is-over');
      const file = e.dataTransfer.files[0];
      if (file) onFile(file);
    });
  }

  // Een bestand dat naast een zone valt niet in een nieuw tabblad openen
  function preventStrayDrops() {
    global.addEventListener('dragover', (e) => e.preventDefault());
    global.addEventListener('drop', (e) => e.preventDefault());
  }

  /**
   * Logo als Image. Via http(s) het bestand zelf; bij file:// de ingebedde
   * kopie uit brand-data.js, anders blokkeert de browser elke export.
   */
  const brandFiles = {
    logoWhite: 'assets/brand/logo/PureMinds-zeshoek-logo.png',
    logoBlack: 'assets/brand/logo/PureMinds-zeshoek-logo-zwart.svg',
    // Emerce 100-badge 2026 (liggend): wit voor donkere posts, zwart voor het briefpapier
    badgeWhite: 'assets/brand/emerce/e100-2026-liggend-wit.svg',
    badgeBlack: 'assets/brand/emerce/e100-2026-liggend-zwart.svg',
  };
  function brandSrc(key) {
    const embedded = global.PM_BRAND && global.PM_BRAND[key];
    return location.protocol === 'file:' && embedded ? embedded : url(brandFiles[key]);
  }
  // SVG-tekst van een ingebed logo (voor de vector-PDF's)
  function brandSvg(key) {
    const src = global.PM_BRAND && global.PM_BRAND[key];
    if (!src) return null;
    const bytes = Uint8Array.from(atob(src.slice(src.indexOf(',') + 1)), (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function brandImage(key, onload) {
    const img = new Image();
    img.onload = () => onload && onload(img);
    img.onerror = () => {
      const embedded = global.PM_BRAND && global.PM_BRAND[key];
      if (embedded && img.src !== embedded) img.src = embedded;
    };
    img.src = brandSrc(key);
    return img;
  }

  /* ---------------------------------------------------------------------------
     Downloaden
     ------------------------------------------------------------------------- */

  function saveBlob(blob, name) {
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 5000);
  }

  function canvasToBlob(canvas, type = 'image/png', quality = 0.92) {
    return new Promise((resolve, reject) => {
      try {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Het bestand kon niet worden gemaakt.'))), type, quality);
      } catch (err) {
        reject(err.name === 'SecurityError' ? fileProtocolError() : err);
      }
    });
  }

  function fileProtocolError() {
    return new Error('De browser blokkeert de export. Open de tool via GitHub Pages of start hem met npm start in plaats van het HTML-bestand direct te openen.');
  }

  function slug(text, max = 40) {
    return String(text || '')
      .replace(/\*\*/g, '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
      .slice(0, max).replace(/-+$/, '');
  }

  const formatSize = (bytes) => (bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

  // Knop uitzetten zolang een taak loopt; fouten worden een melding
  async function busy(button, task) {
    if (button.disabled) return;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    try {
      await task();
    } catch (err) {
      console.error(err);
      toast(err && err.message ? err.message : 'Er ging iets mis bij het exporteren.', true);
    } finally {
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }
  }

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  /**
   * Een export met feedback op de knop zelf, waar je net klikte: "bezig…" met
   * voortgang, daarna kort "✓ klaar". Dubbelklikken kan niet; een fout wordt
   * een melding. task(progress) geeft de tekst voor de klaar-stand terug.
   * De tekst staat in een [data-label] binnen de knop (anders de knop zelf).
   */
  async function run(button, busyText, task) {
    if (button.disabled) return;
    const label = button.querySelector('[data-label]') || button;
    const original = label.textContent;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.classList.add('is-busy');
    label.textContent = busyText;
    try {
      const done = await task((text) => { label.textContent = text; });
      button.classList.remove('is-busy');
      button.classList.add('is-done');
      label.textContent = done || 'klaar';
      await wait(1800);
    } catch (err) {
      console.error(err);
      toast(err && err.message ? err.message : 'Er ging iets mis bij het exporteren.', true);
    } finally {
      button.classList.remove('is-busy', 'is-done');
      button.removeAttribute('aria-busy');
      button.disabled = false;
      label.textContent = original;
      button.dispatchEvent(new CustomEvent('pm:run-end', { bubbles: true }));
    }
  }

  /* ---------------------------------------------------------------------------
     Tekstknoppen: nadruk ("cyaan", "vet") en invulplekken ("+ klant") zonder
     dat je **...** of {…} hoeft te typen. Knoppen met data-emph-for="<veld-id>"
     of data-insert-for="<veld-id>" data-insert="{klant}".
     ------------------------------------------------------------------------- */

  function toggleEmphasis(field) {
    const v = field.value;
    let a = field.selectionStart;
    let b = field.selectionEnd;
    if (a === b) {
      // Geen selectie: het woord onder de cursor
      const before = v.slice(0, a).match(/[^\s*]+$/);
      const after = v.slice(b).match(/^[^\s*]+/);
      if (before) a -= before[0].length;
      if (after) b += after[0].length;
    }
    // Spaties aan de randen horen niet bij de nadruk, en altijd hele woorden:
    // een half geselecteerd woord ("audi" van "audit") wordt het hele woord
    while (a < b && /\s/.test(v[a])) a++;
    while (b > a && /\s/.test(v[b - 1])) b--;
    if (a < b) {
      while (a > 0 && /[^\s*]/.test(v[a - 1])) a--;
      while (b < v.length && /[^\s*]/.test(v[b])) b++;
    }
    if (a === b) {
      toast('Selecteer eerst de woorden die je wilt laten opvallen.');
      field.focus();
      return;
    }
    const sel = v.slice(a, b);
    let next;
    let na;
    let nb;
    if (v.slice(a - 2, a) === '**' && v.slice(b, b + 2) === '**') {
      next = v.slice(0, a - 2) + sel + v.slice(b + 2);   // al nadruk: weghalen
      na = a - 2;
      nb = b - 2;
    } else if (/^\*\*[\s\S]+\*\*$/.test(sel)) {
      next = v.slice(0, a) + sel.slice(2, -2) + v.slice(b);
      na = a;
      nb = b - 4;
    } else {
      const clean = sel.replace(/\*\*/g, '');
      next = `${v.slice(0, a)}**${clean}**${v.slice(b)}`;
      na = a + 2;
      nb = na + clean.length;
    }
    field.value = next;
    field.focus();
    field.setSelectionRange(na, nb);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function insertAtCaret(field, text) {
    const a = field.selectionStart;
    const b = field.selectionEnd;
    const v = field.value;
    const pad = a > 0 && !/\s$/.test(v.slice(0, a)) ? ' ' : '';
    field.value = v.slice(0, a) + pad + text + v.slice(b);
    const pos = a + pad.length + text.length;
    field.focus();
    field.setSelectionRange(pos, pos);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function textTools(root) {
    // De knop houdt de selectie in het veld vast (mousedown), daarna de actie
    root.addEventListener('mousedown', (e) => {
      if (e.target.closest('[data-emph-for], [data-insert-for]')) e.preventDefault();
    });
    root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-emph-for], [data-insert-for]');
      if (!btn) return;
      const field = document.getElementById(btn.dataset.emphFor || btn.dataset.insertFor);
      if (!field) return;
      if (btn.dataset.emphFor) toggleEmphasis(field);
      else insertAtCaret(field, btn.dataset.insert);
    });
  }

  /* ---------------------------------------------------------------------------
     Mobiel: staat de preview uit beeld, dan zweeft er rechtsboven een kleine
     live versie van het canvas. Tikken brengt je terug naar de preview.
     Geeft { update } terug: aanroepen na elke nieuwe tekening.
     ------------------------------------------------------------------------- */

  /**
   * Een canvas-preview scherp op elk scherm: zoveel canvaspixels per ontwerppixel als het
   * scherm laat zien, dus de breedte op het scherm keer de pixeldichtheid (Windows-schaal
   * 125-200%, retina) gedeeld door de ontwerpbreedte. Hoogstens 3: anders wordt tekenen traag.
   * Het ontwerp zelf blijft in ontwerppixels (zie canvas.dataset.designW in de shell).
   */
  function previewScale(canvas, designW, max = 3) {
    const cssW = canvas.getBoundingClientRect().width;
    if (!cssW || !designW) return 1;
    return Math.min(max, Math.max(0.25, (cssW * (global.devicePixelRatio || 1)) / designW));
  }

  /**
   * Roept onChange zodra een preview een andere breedte of pixeldichtheid krijgt: venster,
   * paneel open of dicht, zoomen in de browser, of het venster naar een ander scherm slepen.
   */
  function watchPreview(canvas, onChange) {
    let last = '';
    const check = () => {
      const key = `${Math.round(canvas.getBoundingClientRect().width)}@${global.devicePixelRatio || 1}`;
      if (key === last) return;
      last = key;
      onChange();
    };
    if (global.ResizeObserver) new ResizeObserver(check).observe(canvas);
    const watchDpr = () => {
      const mq = global.matchMedia && global.matchMedia(`(resolution: ${global.devicePixelRatio || 1}dppx)`);
      if (mq && mq.addEventListener) mq.addEventListener('change', () => { check(); watchDpr(); }, { once: true });
    };
    watchDpr();
  }

  function miniPreview(stage, source) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pip';
    btn.hidden = true;
    btn.setAttribute('aria-label', 'Terug naar de preview en de downloadknop');
    btn.innerHTML = '<canvas aria-hidden="true"></canvas><span class="pip__label">preview</span>';
    document.body.appendChild(btn);
    const out = btn.firstChild;
    const narrow = global.matchMedia('(max-width: 1023px)');
    let stageVisible = true;

    function update() {
      btn.hidden = !(narrow.matches && !stageVisible);
      if (btn.hidden || !source.width || !source.height) return;
      const w = 176;
      out.width = w;
      out.height = Math.round((w * source.height) / source.width);
      out.getContext('2d').drawImage(source, 0, 0, out.width, out.height);
      const ratio = source.width / source.height;
      btn.style.setProperty('--pip-w', ratio < 0.7 ? '4.25rem' : ratio > 1.3 ? '8rem' : '5.75rem');
    }

    if ('IntersectionObserver' in global) {
      new IntersectionObserver((entries) => {
        stageVisible = entries[0].isIntersecting;
        update();
      }, { threshold: 0.15 }).observe(stage);
    }
    narrow.addEventListener('change', update);
    btn.addEventListener('click', () => {
      const smooth = !global.matchMedia('(prefers-reduced-motion: reduce)').matches;
      stage.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
    });
    return { update };
  }

  /* ---------------------------------------------------------------------------
     Bibliotheken: pas laden bij de eerste export (vaste versie + SRI-hash)
     ------------------------------------------------------------------------- */

  const LIBS = {
    jspdf: {
      src: 'https://cdn.jsdelivr.net/npm/jspdf@4.2.1/dist/jspdf.umd.min.js',
      integrity: 'sha384-qovJwSBbRDPP5cEjCp8S0UP66wrvnjaa60XMOGzTNanrThcrGfXfnZkvgY8N1KT3',
      ready: () => global.jspdf && global.jspdf.jsPDF,
    },
    // Zet SVG om naar vectoren in jsPDF (pdf.svg); moet na jsPDF laden
    svg2pdf: {
      src: 'https://cdn.jsdelivr.net/npm/svg2pdf.js@2.8.1/dist/svg2pdf.umd.min.js',
      integrity: 'sha384-7hc/mtl4lyRUMzYFqHxwNbYZwh27MESE5AWa2nEuVChLn8bCQcrn18OgGv9uHgzz',
      ready: () => global.jspdf && global.jspdf.jsPDF && global.jspdf.jsPDF.API.svg && global.jspdf.jsPDF,
    },
    // Pure Minds Sans voor in PDF, Word en PowerPoint (gegenereerd door scripts/build-brand-data.js)
    fonts: {
      src: () => url('js/shared/pdf-fonts.js'),
      ready: () => global.PM_PDF_FONTS,
    },
    // Zip-bestanden schrijven: de PowerPoint-export (js/shared/pptx-writer.js)
    jszip: {
      src: 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
      integrity: 'sha384-+mbV2IY1Zk/X1p/nWllGySJSUN8uMs+gUAN10Or95UBH0fpj6GfKgPmgC5EXieXG',
      ready: () => global.JSZip,
    },
    // Word-documenten schrijven: de Document Maker (js/document/docx.js)
    docx: {
      src: 'https://cdn.jsdelivr.net/npm/docx@9.7.1/dist/index.iife.js',
      integrity: 'sha384-9OH56uLhIvkZkwF0jWNlfpcK3gPuSy5DfEMNqKe156wCpkND+MDdtaRyd05kwpG0',
      ready: () => global.docx && global.docx.Document && global.docx,
    },
    // PDF's nabewerken: lagen (OCG) en metadata in het brandbook (js/styleguide/export.js)
    pdflib: {
      src: 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js',
      integrity: 'sha384-weMABwrltA6jWR8DDe9Jp5blk+tZQh7ugpCsF3JwSA53WZM9/14PjS5LAJNHNjAI',
      ready: () => global.PDFLib && global.PDFLib.PDFDocument && global.PDFLib,
    },
  };
  const loading = {};

  function loadLib(name) {
    const lib = LIBS[name];
    if (lib.ready()) return Promise.resolve(lib.ready());
    if (!loading[name]) {
      loading[name] = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = typeof lib.src === 'function' ? lib.src() : lib.src;
        if (lib.integrity) {
          s.integrity = lib.integrity;
          s.crossOrigin = 'anonymous';
        }
        s.onload = () => (lib.ready() ? resolve(lib.ready()) : reject(new Error(`${name} is niet goed geladen.`)));
        s.onerror = () => {
          delete loading[name];
          s.remove();
          reject(new Error('De exportbibliotheek kon niet worden geladen. Controleer je internetverbinding en probeer het opnieuw.'));
        };
        document.head.appendChild(s);
      });
    }
    return loading[name];
  }

  const libs = {
    jsPDF: () => loadLib('jspdf'),
    svg2pdf: () => loadLib('jspdf').then(() => loadLib('svg2pdf')),
    jszip: () => loadLib('jszip'),
    docx: () => loadLib('docx'),
    pdflib: () => loadLib('pdflib'),
  };

  // Pure Minds Sans als bytes per snede, om in te sluiten in Word en PowerPoint
  const fontBytes = {};
  async function fontFiles() {
    const fonts = await loadLib('fonts');
    for (const [style, font] of Object.entries(fonts)) {
      if (!fontBytes[style]) fontBytes[style] = { file: font.file, data: Uint8Array.from(atob(font.data), (c) => c.charCodeAt(0)) };
    }
    return fontBytes;
  }

  // Welke Pure Minds Sans-snede jsPDF gebruikt; volgt de keuze die de browser maakt
  function pdfFontStyle(weight, italic) {
    const w = parseInt(weight, 10) || 400;
    if (italic) return w >= 600 ? 'bolditalic' : 'italic';
    if (w >= 800) return 'extrabold';
    if (w >= 600) return 'bold';   // zonder 600-snede kiest de browser ook Bold
    return 'normal';
  }

  /**
   * Pure Minds Sans in een jsPDF-document insluiten, alleen de snedes die nodig zijn,
   * zo dat elk programma (ook Canva) het gewicht van de tekst herkent:
   *   - jsPDF schrijft de familienaam als fontnaam, voor elke snede dezelfde
   *     ("PureMindsSans"). Canva maakte daardoor alle tekst even dik en liet koppen
   *     weg. Tijdens het wegschrijven krijgt elke snede zijn PostScript-naam
   *     ("PureMindsSans-ExtraBold"); daarna weer de familienaam, zodat setFont blijft werken.
   *   - jsPDF schrijft /StemV 0, en PDFium (waar veel importers op bouwen) leidt
   *     het gewicht alleen daaruit af: StemV = gewicht/5 (onder 700) of
   *     (gewicht-140)/4 geeft daar precies 400/700/800. De CapHeight staat
   *     in font-eenheden in plaats van per 1000. Geen van beide verandert de weergave.
   */
  async function pdfFonts(pdf, styles) {
    const fonts = await loadLib('fonts');
    const names = [];
    for (const style of styles || Object.keys(fonts)) {
      const font = fonts[style];
      if (!font) continue;
      pdf.addFileToVFS(font.file, font.data);
      pdf.addFont(font.file, 'PureMindsSans', style);
      names.push([style, font.file.replace(/\.ttf$/i, '')]);
      const md = pdf.internal.getFont('PureMindsSans', style).metadata;
      if (md && md.os2 && md.os2.exists) {
        const w = md.os2.weightClass || 400;
        md.stemV = w < 700 ? Math.round(w / 5) : Math.round((w - 140) / 4);
        if (md.os2.capHeight) md.capHeight = Math.round(md.os2.capHeight * md.scaleFactor);
      }
    }
    const rename = (toPostScript) => names.forEach(([style, ps]) => {
      const entry = pdf.internal.getFont('PureMindsSans', style);
      if (entry) entry.fontName = toPostScript ? ps : 'PureMindsSans';
    });
    pdf.internal.events.subscribe('buildDocument', () => rename(true));
    pdf.internal.events.subscribe('postPutResources', () => rename(false));
    return 'PureMindsSans';
  }

  /**
   * Een nieuwe PDF zoals alle makers hem maken: in pt, gecomprimeerd, met
   * Pure Minds Sans, en als PDF 1.4 (doorzichtigheid bestaat pas sinds 1.4; jsPDF
   * schrijft 1.3). Afronden met pdfFinish.
   */
  async function pdfDocument({ format, orientation = 'portrait' }) {
    const JsPDF = await libs.svg2pdf();
    await fontsReady;
    const pdf = new JsPDF({ unit: 'pt', format, orientation, compress: true, putOnlyUsedFonts: true });
    if (pdf.__private__ && pdf.__private__.setPdfVersion) pdf.__private__.setPdfVersion('1.4');
    await pdfFonts(pdf);
    return pdf;
  }

  // Eigenschappen en taal erin, en de PDF als Blob
  function pdfFinish(pdf, { title, subject = '', author = 'Pure Minds' } = {}) {
    pdf.setProperties({ title: title || 'Pure Minds', subject, author, creator: 'Pure Minds Generator Hub' });
    if (pdf.setLanguage) pdf.setLanguage('nl');   // 'nl-NL' staat niet in de lijst van jsPDF en wordt stil genegeerd
    return pdf.output('blob');
  }

  // Kleur voor jsPDF als tekst met 4 decimalen. Getallen rondt jsPDF af op 2
  // (vlakken) of 3 (tekst): merkcyaan #1ab9e2 werd dan #1abae3 in Canva.
  // Een kwart stap erbij, zodat afronden (Canva) en afkappen (MuPDF) allebei
  // precies de oorspronkelijke waarde 0-255 teruggeven
  function pdfColor({ r, g, b }) {
    return [r, g, b].map((v) => Math.min(1, (Math.round(v) + 0.25) / 255).toFixed(4));
  }

  /* ---------------------------------------------------------------------------
     Fonts: canvas en de PDF-export kennen alleen fonts die al geladen zijn
     ------------------------------------------------------------------------- */

  // Alleen de drie gewichten van de huisstijl (meer snedes staan niet in css/global.css)
  const fontsReady = document.fonts
    ? Promise.all([400, 700, 800].map((w) => document.fonts.load(`${w} 40px "Pure Minds Sans"`))).then(() => document.fonts.ready).catch(() => null)
    : Promise.resolve();

  const debounce = (fn, ms, { flushOnHide = false } = {}) => {
    let t = 0;
    let pending = null;
    const flush = () => {
      clearTimeout(t);
      t = 0;
      if (!pending) return;
      const args = pending;
      pending = null;
      return fn(...args);
    };
    const delayed = (...args) => {
      clearTimeout(t);
      pending = args;
      t = setTimeout(flush, ms);
    };
    delayed.flush = flush;
    // Alleen opslaan: render- en zoekfuncties hoeven bij verlaten niet meer te draaien.
    // pagehide dekt herladen/navigeren; hidden bewaart ook vóór een mobiel tabblad stopt.
    if (flushOnHide) {
      global.addEventListener('pagehide', flush);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flush();
      });
    }
    return delayed;
  };

  const uid = () => Math.random().toString(36).slice(2, 10);

  global.PM = {
    url, esc, renderToolNav, recentTools, startParams, toast, run, textTools, toggleEmphasis, insertAtCaret, miniPreview, previewScale, watchPreview, wait, store, idb, readImage, bindDrop, preventStrayDrops,
    brandImage, brandSrc, brandSvg, saveBlob, canvasToBlob, fileProtocolError, slug, formatSize, busy,
    libs, pdfFonts, pdfFontStyle, pdfDocument, pdfFinish, pdfColor, fontFiles, fontsReady, debounce, uid,
  };

  function init() {
    renderToolNav();
    rememberTool();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
