/* =============================================================================
   ai/app.js — Maken met AI: de startpagina
   -----------------------------------------------------------------------------
   Ruwe content plakken, een formaat kiezen, en door naar de maker: de AI vult
   daar de velden (js/shared/ai.js, paneel AI). De content gaat mee via
   PM.ai.handoff (localStorage, een half uur geldig); de maker opent met ?ai=1
   en begint meteen. Zo is er één plek waar de AI de velden vult: de maker.

   Een snelle start op het dashboard (?format=insta) kiest het formaat vooraf.
   ============================================================================= */
(function () {
  'use strict';

  const PM = window.PM;
  const $ = (sel) => document.querySelector(sel);
  const DRAFT_KEY = 'pm-ai-start-v1';
  const MAKERS = {
    presentatie: { href: 'tools/presentation.html', verb: 'maak de presentatie' },
    insta: { href: 'tools/insta.html', verb: 'maak de post' },
    email: { href: 'tools/nieuwsbrief.html', verb: 'maak de e-mail' },
  };

  const form = $('#aiForm');
  const content = $('#aiContent');
  const wish = $('#aiWish');
  const count = $('#aiCount');
  const goText = $('#aiGoText');
  const format = () => (form.querySelector('input[name="format"]:checked') || {}).value || 'presentatie';

  // Wat je typte, blijft staan als je even weg bent
  const saved = PM.store.get(DRAFT_KEY, null);
  if (saved && typeof saved === 'object') {
    content.value = saved.content || '';
    wish.value = saved.wish || '';
    if (MAKERS[saved.format]) form.querySelector(`input[value="${saved.format}"]`).checked = true;
  }
  const start = PM.startParams();
  if (MAKERS[start.format]) form.querySelector(`input[value="${start.format}"]`).checked = true;

  const keep = PM.debounce(() => PM.store.set(DRAFT_KEY, { content: content.value, wish: wish.value, format: format() }), 400);
  function sync() {
    const n = content.value.trim().length;
    count.textContent = n ? `${n.toLocaleString('nl-NL')} tekens` : 'Tot 60.000 tekens: van een paar zinnen tot een heel verslag.';
    goText.textContent = MAKERS[format()].verb;
  }
  form.addEventListener('input', () => { sync(); keep(); });
  form.addEventListener('change', () => { sync(); keep(); });
  sync();

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (content.value.trim().length < 20) {
      PM.toast('Plak eerst je ruwe content: een paar zinnen of notities.', true);
      content.focus();
      return;
    }
    PM.ai.handoff.put(format(), content.value.trim(), wish.value.trim());
    PM.store.set(DRAFT_KEY, null);
    location.href = PM.url(`${MAKERS[format()].href}?ai=1`);
  });

  // Staat de AI klaar? Zo niet: zeggen waarom (maar niets op slot)
  PM.ai.status().then((st) => {
    if (st && st.ok && st.ai) return;
    const off = $('#aiOff');
    off.hidden = false;
    off.innerHTML = st && st.ok
      ? '<b>De AI staat nog niet aan.</b> In Vercel ontbreekt de sleutel van Anthropic (ANTHROPIC_API_KEY); zie uploads/README.md.'
      : '<b>De AI is nu niet bereikbaar.</b> Is de server van de Tool Hub al ingesteld in Vercel (Root Directory uploads)?';
  });
})();
