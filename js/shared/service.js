/* =============================================================================
   service.js — de server van de Tool Hub (Vercel): foto's uploaden en de AI
   -----------------------------------------------------------------------------
   De hub zelf staat op GitHub Pages en heeft geen server. Wat wel een server
   nodig heeft (foto's online zetten voor een mail, de AI van Claude), draait
   in één Vercel-project: de map uploads/ in deze repo (zie uploads/README.md).
   Eén wachtwoord voor alles (APP_PASSWORD in Vercel); elke collega vult het
   één keer in, deze browser onthoudt het.

     PM.service.ready                  staat er een adres? (anders: niet ingesteld)
     PM.service.url(pad)               volledig adres, zoals url('/api/upload')
     PM.service.request(pad, opties)   fetch met het wachtwoord; vraagt het bij de eerste
                                       keer en opnieuw als het niet klopt. Geeft de JSON
                                       terug, of gooit een Error met een zin voor de gebruiker
                                       (err.cancelled: de gebruiker gaf geen wachtwoord)
     PM.service.status(pad)            GET zonder wachtwoord: { ok, ... } of null
     PM.service.hasPassword()
     PM.service.askPassword(fout?)     het venster; geeft het wachtwoord of ''
     PM.service.forget()               wachtwoord vergeten (de volgende keer opnieuw vragen)

   Om te testen kan een ander adres in localStorage (pm-service-url-v1).
   ============================================================================= */
(function (global) {
  'use strict';

  // Het Vercel-project van de Tool Hub (Root Directory: uploads)
  const DEFAULT_SERVICE_URL = 'https://pure-minds-tool-hub.vercel.app';
  const URL_KEY = 'pm-service-url-v1';
  const PW_KEY = 'pm-newsletter-upload-v1';   // zo heette hij al bij de Nieuwsbrief Maker
  const PM = global.PM;
  const doc = global.document;

  const base = () => String((PM && PM.store.get(URL_KEY, '')) || DEFAULT_SERVICE_URL).replace(/\/+$/, '');
  const url = (path) => base() + (path.startsWith('/') ? path : `/${path}`);

  /* --- Het wachtwoord: één venster, door de hele hub gedeeld --- */

  let dialog = null;
  function ensureDialog() {
    if (dialog) return dialog;
    dialog = doc.createElement('dialog');
    dialog.className = 'svc-dialog';
    dialog.setAttribute('aria-labelledby', 'svcPwTitle');
    dialog.innerHTML = `<form method="dialog" class="svc-dialog__inner">
  <h2 class="popover__title" id="svcPwTitle">Wachtwoord van de Tool Hub<span class="dot">.</span></h2>
  <p class="svc-dialog__lead" data-lead></p>
  <label class="label" for="svcPw">Wachtwoord</label>
  <input class="input" id="svcPw" type="password" autocomplete="current-password" required>
  <div class="svc-dialog__foot">
    <button class="btn btn-quiet btn-sm" value="cancel" formnovalidate>annuleren</button>
    <button class="btn btn-primary btn-sm" value="ok">opslaan en verder</button>
  </div>
</form>`;
    doc.body.appendChild(dialog);
    return dialog;
  }

  function askPassword(wrong = false) {
    const d = ensureDialog();
    d.querySelector('[data-lead]').textContent = wrong
      ? 'Dat wachtwoord klopt niet (of het is gewijzigd). Probeer het nog eens, of vraag het aan je collega die de Tool Hub beheert.'
      : 'Foto’s online zetten en de AI lopen via de server van Pure Minds. Vul één keer het wachtwoord in; deze browser onthoudt het. Weet je het niet? Vraag het aan je collega die de Tool Hub beheert.';
    const input = d.querySelector('#svcPw');
    input.value = '';
    return new Promise((resolve) => {
      d.onclose = () => {
        d.onclose = null;
        const pw = d.returnValue === 'ok' ? input.value.trim() : '';
        if (pw) PM.store.set(PW_KEY, pw);
        resolve(pw);
      };
      d.returnValue = '';
      d.showModal();
      input.focus();
    });
  }

  const hasPassword = () => !!PM.store.get(PW_KEY, '');
  const forget = () => PM.store.set(PW_KEY, '');

  /* --- Verzoeken --- */

  async function request(path, { method = 'POST', body = null, headers = {}, signal } = {}) {
    if (!base()) throw new Error('De server van de Tool Hub is nog niet ingesteld.');
    let pw = PM.store.get(PW_KEY, '');
    for (let attempt = 0; attempt < 3; attempt++) {
      if (!pw) pw = await askPassword(attempt > 0);
      if (!pw) throw Object.assign(new Error('Zonder wachtwoord kan het niet.'), { cancelled: true });
      let res;
      try {
        res = await fetch(url(path), { method, body, signal, headers: { ...headers, 'x-app-password': pw } });
      } catch (err) {
        if (err && err.name === 'AbortError') throw err;
        throw new Error('De server van de Tool Hub is niet bereikbaar. Controleer je internet en probeer het opnieuw.');
      }
      let data = {};
      try { data = await res.json(); } catch (err) { data = {}; }
      if (res.status === 401) {
        forget();
        pw = '';
        continue;
      }
      if (res.status === 404) throw new Error('De server van de Tool Hub kent dit adres niet. Staat de Root Directory in Vercel op uploads?');
      if (!res.ok) throw Object.assign(new Error(data.error || `Er ging iets mis (fout ${res.status}).`), { status: res.status });
      return data;
    }
    throw new Error('Het wachtwoord klopt niet.');
  }

  async function status(path) {
    if (!base()) return null;
    try {
      const res = await fetch(url(path), { method: 'GET' });
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      return null;
    }
  }

  if (PM) {
    PM.service = {
      get ready() { return !!base(); },
      url, request, status, hasPassword, askPassword, forget,
      DEFAULT_SERVICE_URL,
    };
  }
})(window);
