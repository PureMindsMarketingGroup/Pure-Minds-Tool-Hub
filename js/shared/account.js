/* =============================================================================
   account.js — inloggen bij de Tool Hub (Supabase), en de deur van elke pagina
   -----------------------------------------------------------------------------
   Staat in de <head> van elke pagina van de hub, vóór alles. Zonder sessie in
   deze browser gaat de pagina meteen naar login.html (?terug=<deze pagina>),
   nog voordat er iets te zien is. Met een sessie laadt de pagina gewoon, en
   controleert supabase-js daarna of de sessie nog geldt; zo niet, dan ook naar
   inloggen. In de kop komt vanzelf wie er ingelogd is, met uitloggen.

   Dit is de deur van de pagina's; de echte beveiliging zit in de database
   (supabase/teambieb.sql: alleen een ingelogde collega van de teamlijst leest
   of schrijft) en in de server van de hub (uploads/lib/team.js). De publieke
   sleutel hieronder mag dus openbaar zijn: zonder inloggen geeft hij nergens
   toegang toe. supabase-js komt van jsDelivr, met een vaste versie en SRI-hash.

   Losse pagina's die openbaar moeten blijven (de e-mailtemplate, de
   handtekeningen) laden dit script niet.

     PM.account.client()      belofte: de Supabase-client (laadt supabase-js één keer)
     PM.account.current()     wie er volgens deze browser ingelogd is: { id, email, name } of null
     PM.account.token()       belofte: het inlogbewijs voor de server van de hub, of ''
     PM.account.signOut()     uitloggen, en naar login.html
     PM.account.toLogin()     naar login.html, met terug naar deze pagina
   ============================================================================= */
(function (global) {
  'use strict';

  const SUPABASE_URL = 'https://ilijpnuajxzbzkffaipm.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_Qz4Oi1DvGlG0sBZI64vHYA_4Hinzd1l';   // publiek, zie boven
  const AUTH_KEY = 'sb-ilijpnuajxzbzkffaipm-auth-token';                  // hier bewaart supabase-js de sessie
  const NAME_KEY = 'pm-account-name-v1';                                  // { email, name } uit de teamlijst
  const LIB = {
    src: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/dist/umd/supabase.js',
    integrity: 'sha384-BWcjm9OdFth9TbhCxZPdm+gAOUMAzQy9nmTs12ioXdCcbVnJaPMn+fMUoQCLt60R',
  };

  /* ---------------------------------------------------------------------------
     Rekenwerk, zonder browser (getest in tests/account.test.js)
     ------------------------------------------------------------------------- */

  // De sessie zoals supabase-js hem bewaart; zonder vernieuwsleutel telt hij niet
  function readSession(raw) {
    try {
      const s = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return s && typeof s === 'object' && s.refresh_token && s.user && s.user.email ? s : null;
    } catch (err) {
      return null;
    }
  }

  // "ashley@pureminds.nl" -> "Ashley"; de teamlijst heeft het laatste woord
  function nameOf(email) {
    const local = String(email || '').split('@')[0].replace(/[._-]+/g, ' ').trim();
    return local ? local.replace(/\b\p{L}/gu, (c) => c.toUpperCase()) : '';
  }

  // Terug na het inloggen: alleen een pad op deze site, en niet naar het inloggen zelf
  function safeBack(back) {
    if (typeof back !== 'string' || !back.startsWith('/') || back.startsWith('//') || back.includes('\\')) return '';
    if (/\/login\.html(?:[?#]|$)/.test(back)) return '';
    return back;
  }

  const api = { readSession, nameOf, safeBack, SUPABASE_URL, SUPABASE_KEY, AUTH_KEY };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  const doc = global.document;
  if (!doc) return;

  /* ---------------------------------------------------------------------------
     De deur
     ------------------------------------------------------------------------- */

  const html = doc.documentElement;
  const root = html.dataset.root || '';
  const gated = html.dataset.page !== 'login';
  const loginUrl = (back) => `${root}login.html${back ? `?terug=${encodeURIComponent(back)}` : ''}`;
  const stored = () => {
    try {
      return readSession(global.localStorage.getItem(AUTH_KEY));
    } catch (err) {
      return null;
    }
  };

  let leaving = false;
  function toLogin() {
    if (leaving) return;
    leaving = true;
    html.style.visibility = 'hidden';
    const loc = global.location;
    loc.replace(loginUrl(loc.pathname + loc.search + loc.hash));
  }

  if (gated && !stored()) toLogin();

  /* ---------------------------------------------------------------------------
     De client: supabase-js pas laden als iets hem nodig heeft
     ------------------------------------------------------------------------- */

  let clientPromise = null;

  function loadLib() {
    if (global.supabase && global.supabase.createClient) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = doc.createElement('script');
      s.src = LIB.src;
      s.integrity = LIB.integrity;
      s.crossOrigin = 'anonymous';
      s.onload = () => (global.supabase && global.supabase.createClient ? resolve() : reject(new Error('supabase-js is niet goed geladen.')));
      s.onerror = () => {
        s.remove();
        reject(new Error('Geen verbinding met de server van de Tool Hub. Controleer je internet en probeer het opnieuw.'));
      };
      doc.head.appendChild(s);
    });
  }

  function client() {
    if (!clientPromise) {
      clientPromise = loadLib().then(() => {
        const c = global.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
          auth: { storageKey: AUTH_KEY, persistSession: true, autoRefreshToken: true, detectSessionInUrl: !gated, flowType: 'implicit' },
        });
        // Uitgelogd (ook in een ander tabblad) of de sessie geldt niet meer: naar inloggen
        if (gated) c.auth.onAuthStateChange((event) => { if (event === 'SIGNED_OUT') toLogin(); });
        return c;
      }).catch((err) => {
        clientPromise = null;
        throw err;
      });
    }
    return clientPromise;
  }

  // Het inlogbewijs, ververst als het bijna verlopen is
  async function token() {
    try {
      const c = await client();
      const { data } = await c.auth.getSession();
      return (data && data.session && data.session.access_token) || '';
    } catch (err) {
      return '';
    }
  }

  function savedName(email) {
    try {
      const saved = JSON.parse(global.localStorage.getItem(NAME_KEY) || 'null');
      return (saved && saved.email === email && saved.name) || '';
    } catch (err) {
      return '';
    }
  }

  function current() {
    const s = stored();
    if (!s) return null;
    const email = s.user.email;
    return { id: s.user.id, email, name: savedName(email) || nameOf(email) };
  }

  async function signOut() {
    leaving = true;
    try {
      const c = await client();
      await c.auth.signOut({ scope: 'local' });
    } catch (err) {
      /* zonder verbinding: dan alleen hier vergeten */
    }
    try {
      // Ook de lijst van de bieb (js/shared/designs.js): die is van het team, niet van deze browser
      for (const key of [AUTH_KEY, NAME_KEY, 'pm-designs-v1', 'pm-library-team-v1']) global.localStorage.removeItem(key);
    } catch (err) {
      /* niets */
    }
    global.location.replace(`${root}login.html?uit=1`);
  }

  /* ---------------------------------------------------------------------------
     In de kop: wie er ingelogd is, en uitloggen
     ------------------------------------------------------------------------- */

  // Uitloggen uit de iconenbibliotheek: cyaan zeshoek met wit lijnicoon
  // (assets/icons/Zeshoek/Cyaan zeshoek - wit icoon/System/logout-box-r-line.svg)
  const ICON_OUT = '<svg class="account__icon" viewBox="0 0 56.474 64" aria-hidden="true"><path class="account__hex" d="M30.193 0.524L54.518 14.568A3.913 3.913 0 0 1 56.474 17.956L56.474 46.044A3.913 3.913 0 0 1 54.518 49.432L30.193 63.476A3.913 3.913 0 0 1 26.281 63.476L1.956 49.432A3.913 3.913 0 0 1 0 46.044L0 17.956A3.913 3.913 0 0 1 1.956 14.568L26.281 0.524A3.913 3.913 0 0 1 30.193 0.524Z"/><path class="account__glyph" d="M17.563 47.248C16.721 47.248 16.039 46.565 16.039 45.723V18.277C16.039 17.435 16.721 16.752 17.563 16.752H38.911C39.753 16.752 40.435 17.435 40.435 18.277V22.851H37.386V19.802H19.088V44.198H37.386V41.149H40.435V45.723C40.435 46.565 39.753 47.248 38.911 47.248H17.563ZM37.386 38.099V33.525H26.712V30.475H37.386V25.901L45.01 32L37.386 38.099Z"/></svg>';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function renderAccount() {
    const me = current();
    const head = doc.querySelector('.site-header__inner');
    if (!me || !head) return;
    let box = head.querySelector('.account');
    if (!box) {
      box = doc.createElement('div');
      box.className = 'account';
      head.appendChild(box);
      box.addEventListener('click', (e) => {
        if (e.target.closest('[data-signout]')) signOut();
      });
    }
    const label = `Ingelogd als ${me.name} (${me.email})`;
    box.innerHTML = `<span class="account__name hide-sm" title="${esc(label)}">${esc(me.name)}</span>`
      + `<button type="button" class="account__out" data-signout title="Uitloggen" aria-label="${esc(`Uitloggen. ${label}`)}">${ICON_OUT}<span class="account__txt">uitloggen</span></button>`;
  }

  // De naam uit de teamlijst (één keer per browser, daarna uit het geheugen)
  async function loadName() {
    const me = current();
    if (!me || savedName(me.email)) return;
    try {
      const c = await client();
      const { data } = await c.from('team').select('name').eq('email', me.email).maybeSingle();
      if (data && data.name) {
        global.localStorage.setItem(NAME_KEY, JSON.stringify({ email: me.email, name: data.name }));
        renderAccount();
      }
    } catch (err) {
      /* dan de naam uit het e-mailadres */
    }
  }

  // Na het laden: geldt de sessie nog? (supabase-js ververst hem of ruimt hem op)
  async function check() {
    try {
      const c = await client();
      await c.auth.getSession();
    } catch (err) {
      return;   // geen verbinding: gewoon doorwerken
    }
    if (!stored()) toLogin();
    else loadName();
  }

  if (gated && !leaving) {
    const ready = () => {
      renderAccount();
      setTimeout(check, 0);
    };
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', ready, { once: true });
    else ready();
  }

  global.PM_ACCOUNT = { ...api, client, token, current, signOut, toLogin, loginUrl };
})(typeof window !== 'undefined' ? window : globalThis);
