/* =============================================================================
   login.js — de inlogpagina (login.html)
   -----------------------------------------------------------------------------
   Vier standen in één kaart:
     in        inloggen met e-mailadres en wachtwoord
     account   zelf een account maken; alleen adressen op de teamlijst
               (supabase/teambieb.sql), daarna een mail om te bevestigen
     vergeten  een mail met een link om een nieuw wachtwoord te kiezen
     nieuw     na die link (of een uitnodiging): het nieuwe wachtwoord kiezen

   Een link uit een mail komt hier terug met de sessie in het adres
   (#access_token=…&type=recovery); supabase-js leest hem en haalt hem weg.
   Na het inloggen: terug naar de pagina waar je vandaan kwam (?terug=), anders
   naar het dashboard. ?uit=1: net uitgelogd. ?modus=account: meteen account
   maken.
   ============================================================================= */
(function (global) {
  'use strict';

  const MIN_PASSWORD = 10;   // ook in Supabase (scripts/setup-supabase.mjs)

  /* ---------------------------------------------------------------------------
     Rekenwerk, zonder browser (getest in tests/account.test.js)
     ------------------------------------------------------------------------- */

  // Wat er in het adres staat na een link uit een mail
  function hashInfo(hash) {
    const p = new URLSearchParams(String(hash || '').replace(/^#/, ''));
    return { type: p.get('type') || '', error: p.get('error_code') || p.get('error') || '', token: p.has('access_token') };
  }

  // Een fout van Supabase in gewone taal
  function authError(err, mode) {
    if (!err) return '';
    const code = String(err.code || err.error_code || '');
    const msg = String(err.message || err.error_description || '');
    const status = Number(err.status) || 0;
    const has = (re) => re.test(code) || re.test(msg);
    if (has(/invalid_credentials|Invalid login credentials/i)) return 'Dit e-mailadres en wachtwoord passen niet bij elkaar. Typfout? Of klik op wachtwoord vergeten.';
    if (has(/email_not_confirmed|Email not confirmed/i)) return 'Je e-mailadres is nog niet bevestigd. Klik op de link in de mail van de Tool Hub (kijk ook in je spam).';
    if (has(/email_address_not_authorized|not authorized/i)) return 'De mail kon niet weg: de mailserver van de Tool Hub is nog niet ingesteld. Vraag het aan je collega die de Tool Hub beheert.';
    if (has(/weak_password|Password should/i)) return `Kies een wachtwoord van minstens ${MIN_PASSWORD} tekens.`;
    if (has(/same_password|different from the old/i)) return 'Dit is al je wachtwoord. Kies een ander.';
    if (has(/user_already_exists|already registered|already been registered/i)) return 'Er is al een account met dit e-mailadres. Log in, of klik op wachtwoord vergeten.';
    if (has(/rate_limit|rate limit|security purposes/i) || status === 429) return 'Even te veel pogingen achter elkaar. Wacht een paar minuten en probeer het opnieuw.';
    if (has(/not on team|Database error saving new user/i) || (mode === 'account' && status >= 500)) {
      return 'Dit e-mailadres staat niet op de teamlijst van de Tool Hub. Gebruik je adres van Pure Minds, of vraag je collega die de Tool Hub beheert om je toe te voegen.';
    }
    if (has(/email_address_invalid|validation_failed|invalid format|Unable to validate email/i)) return 'Dit is geen geldig e-mailadres.';
    if (has(/otp_expired|expired|invalid.*link/i)) return 'Deze link is verlopen of al gebruikt. Vraag hieronder een nieuwe aan.';
    if (has(/session_not_found|session_missing|Auth session missing/i)) return 'Je sessie is verlopen. Vraag hieronder een nieuwe link aan.';
    if (has(/signup_disabled|Signups not allowed/i)) return 'Zelf een account maken staat uit. Vraag je collega die de Tool Hub beheert om je uit te nodigen.';
    // supabase-js noemt ook een fout van de server "retryable": pas als niets anders past, is het de verbinding
    if (err.name === 'AuthRetryableFetchError' || has(/Failed to fetch|NetworkError|Load failed|verbinding/i)) {
      return 'Geen verbinding met de server. Controleer je internet en probeer het opnieuw.';
    }
    return `Er ging iets mis. Probeer het opnieuw.${msg ? ` (${msg})` : ''}`;
  }

  const api = { MIN_PASSWORD, hashInfo, authError };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  const doc = global.document;
  if (!doc) return;

  /* ---------------------------------------------------------------------------
     De pagina
     ------------------------------------------------------------------------- */

  const A = global.PM_ACCOUNT;
  const loc = global.location;
  const params = new URLSearchParams(loc.search);
  const home = A.safeBack(params.get('terug') || '') || 'index.html';
  const link = hashInfo(loc.hash);   // vóór supabase-js het adres opruimt
  const redirectTo = new URL('login.html', loc.href).href;   // waar de links in de mails heen gaan

  const $ = (sel) => doc.querySelector(sel);
  const el = {
    title: $('[data-title]'), lead: $('[data-lead]'), msg: $('[data-msg]'),
    form: $('#loginForm'), email: $('#email'), password: $('#password'), hint: $('[data-hint]'),
    emailField: $('[data-field="email"]'), passwordField: $('[data-field="password"]'),
    submit: $('[data-submit]'), eye: $('[data-eye]'), sent: $('[data-sent]'), resend: $('[data-resend]'), alt: $('[data-alt]'),
  };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const MODES = {
    in: {
      title: 'Inloggen', lead: 'De Generator Hub is van het team van Pure Minds. Log in met je eigen e-mailadres.',
      email: true, password: 'current-password', submit: 'inloggen',
      alt: [['vergeten', 'wachtwoord vergeten?'], ['account', 'nog geen account? maak er een']],
    },
    account: {
      title: 'Account maken', lead: 'Voor het team van Pure Minds: gebruik je e-mailadres van het werk. Je krijgt een mail om het te bevestigen.',
      email: true, password: 'new-password', hint: `minstens ${MIN_PASSWORD} tekens`, submit: 'account maken',
      alt: [['in', 'heb je al een account? log in']],
    },
    vergeten: {
      title: 'Wachtwoord vergeten', lead: 'Vul je e-mailadres in. Je krijgt een mail met een link om een nieuw wachtwoord te kiezen.',
      email: true, password: null, submit: 'stuur de link',
      alt: [['in', 'weet je het weer? log in']],
    },
    nieuw: {
      title: 'Kies een nieuw wachtwoord', lead: `Minstens ${MIN_PASSWORD} tekens. Daarna ben je meteen binnen.`,
      email: false, password: 'new-password', hint: `minstens ${MIN_PASSWORD} tekens`, submit: 'opslaan en verder', alt: [],
    },
    welkom: {
      title: 'Kies je wachtwoord', lead: `Welkom bij de Generator Hub. Kies een wachtwoord van minstens ${MIN_PASSWORD} tekens; daarna ben je meteen binnen.`,
      email: false, password: 'new-password', hint: `minstens ${MIN_PASSWORD} tekens`, submit: 'opslaan en verder', alt: [],
    },
  };

  let mode = 'in';
  let busy = false;

  function say(text, ok = false) {
    el.msg.hidden = !text;
    el.msg.textContent = text || '';
    el.msg.classList.toggle('is-ok', !!ok);
    el.msg.setAttribute('role', ok ? 'status' : 'alert');
  }

  function heading(text) {
    el.title.innerHTML = `${esc(text)}<span class="dot">.</span>`;
  }

  function altLinks(list) {
    el.alt.innerHTML = list.map(([to, label]) => `<button type="button" class="linkbtn" data-to="${to}">${esc(label)}</button>`).join('');
  }

  function show(next, { keepMsg = false } = {}) {
    mode = next;
    const m = MODES[next];
    heading(m.title);
    el.lead.textContent = m.lead;
    if (!keepMsg) say('');
    el.form.hidden = false;
    el.sent.hidden = true;
    el.emailField.hidden = !m.email;
    el.email.required = !!m.email;
    el.passwordField.hidden = !m.password;
    el.password.required = !!m.password;
    if (m.password) el.password.autocomplete = m.password;
    el.password.value = '';
    el.hint.textContent = m.hint || '';
    el.submit.textContent = m.submit;
    altLinks(m.alt);
    const first = m.email && !el.email.value ? el.email : m.password ? el.password : el.email;
    if (first && doc.activeElement !== first) first.focus({ preventScroll: true });
  }

  // Na account maken of wachtwoord vergeten: kijk in je mail
  function sent(email, { resend = false, text }) {
    heading('Kijk in je mail');
    el.lead.innerHTML = text(`<b>${esc(email)}</b>`);
    el.form.hidden = true;
    el.sent.hidden = !resend;
    el.resend.hidden = !resend;
    el.resend.dataset.email = email;
    altLinks([['in', 'terug naar inloggen']]);
  }

  const go = (url) => loc.replace(url);

  /* --- Versturen --- */

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    const m = MODES[mode];
    const email = el.email.value.trim().toLowerCase();
    const password = el.password.value;
    if (m.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      say('Vul je e-mailadres in, zoals naam@pureminds.nl.');
      el.email.focus();
      return;
    }
    if (m.password && mode !== 'in' && password.length < MIN_PASSWORD) {
      say(`Kies een wachtwoord van minstens ${MIN_PASSWORD} tekens.`);
      el.password.focus();
      return;
    }
    if (m.password && !password) {
      say('Vul je wachtwoord in.');
      el.password.focus();
      return;
    }

    busy = true;
    el.submit.disabled = true;
    el.submit.textContent = 'even geduld…';
    say('');
    try {
      const c = await A.client();
      if (mode === 'in') {
        const { error } = await c.auth.signInWithPassword({ email, password });
        if (error) throw error;
        go(home);
        return;
      }
      if (mode === 'account') {
        const { data, error } = await c.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } });
        if (error) throw error;
        if (data.session) {
          go(home);
          return;
        }
        // Bestaat het account al, dan zegt Supabase dat niet (geen identiteiten): wel hier
        if (data.user && Array.isArray(data.user.identities) && !data.user.identities.length) {
          throw Object.assign(new Error('already registered'), { code: 'user_already_exists' });
        }
        sent(email, { resend: true, text: (who) => `We stuurden een mail naar ${who}. Klik op de link erin om je account te bevestigen; daarna ben je meteen binnen. Geen mail? Kijk in je spam, of stuur hem opnieuw.` });
        return;
      }
      if (mode === 'vergeten') {
        const { error } = await c.auth.resetPasswordForEmail(email, { redirectTo });
        if (error) throw error;
        sent(email, { text: (who) => `Heeft ${who} een account, dan is er nu een mail onderweg met een link om een nieuw wachtwoord te kiezen. De link werkt een uur.` });
        return;
      }
      // nieuw of welkom: het nieuwe wachtwoord
      const { error } = await c.auth.updateUser({ password });
      if (error) throw error;
      go(home);
    } catch (err) {
      say(authError(err, mode));
      if (/email_not_confirmed|Email not confirmed/i.test(`${err && err.code} ${err && err.message}`)) {
        el.sent.hidden = false;
        el.resend.hidden = false;
        el.resend.dataset.email = email;
      }
    } finally {
      busy = false;
      el.submit.disabled = false;
      if (MODES[mode]) el.submit.textContent = MODES[mode].submit;
    }
  }

  async function resend() {
    const email = el.resend.dataset.email;
    if (!email || busy) return;
    busy = true;
    el.resend.disabled = true;
    try {
      const c = await A.client();
      const { error } = await c.auth.resend({ type: 'signup', email, options: { emailRedirectTo: redirectTo } });
      if (error) throw error;
      say(`De mail is opnieuw verstuurd naar ${email}.`, true);
    } catch (err) {
      say(authError(err, 'account'));
    } finally {
      busy = false;
      el.resend.disabled = false;
    }
  }

  el.form.addEventListener('submit', submit);
  el.resend.addEventListener('click', resend);
  el.alt.addEventListener('click', (e) => {
    const b = e.target.closest('[data-to]');
    if (b) show(b.dataset.to);
  });
  el.eye.addEventListener('click', () => {
    const showing = el.password.type === 'text';
    el.password.type = showing ? 'password' : 'text';
    el.eye.setAttribute('aria-pressed', String(!showing));
    el.eye.setAttribute('aria-label', showing ? 'Wachtwoord tonen' : 'Wachtwoord verbergen');
    el.eye.querySelector('[data-eye-show]').hidden = !showing;
    el.eye.querySelector('[data-eye-hide]').hidden = showing;
    el.password.focus();
  });

  /* --- Opstarten: een link uit een mail, al ingelogd, of gewoon inloggen --- */

  async function start() {
    const asked = params.get('modus');
    show(MODES[asked] && !/nieuw|welkom/.test(asked) ? asked : 'in');
    if (params.get('uit')) say('Je bent uitgelogd.', true);
    if (link.error) {
      show('vergeten');
      say(authError({ code: link.error }));
      global.history.replaceState(null, '', loc.pathname + loc.search);
      return;
    }
    if (link.token) {
      el.form.hidden = true;
      el.lead.textContent = 'Even geduld…';
    }
    let session = null;
    try {
      const c = await A.client();
      const { data } = await c.auth.getSession();
      session = data && data.session;
    } catch (err) {
      show('in', { keepMsg: true });
      say(authError(err));
      return;
    }
    if (session && (link.type === 'recovery' || link.type === 'invite')) {
      show(link.type === 'invite' ? 'welkom' : 'nieuw');
      return;
    }
    if (session) {
      go(home);
      return;
    }
    if (link.token) {
      show('vergeten');
      say('Deze link werkt niet (meer). Vraag hieronder een nieuwe aan.');
    }
  }

  start();
})(typeof window !== 'undefined' ? window : globalThis);
