/* =============================================================================
   service.js — de server van de Tool Hub (Vercel): foto's uploaden en de AI
   -----------------------------------------------------------------------------
   De hub zelf staat op GitHub Pages en heeft geen server. Wat wel een server
   nodig heeft (foto's online zetten voor een mail, de AI van Claude, foto's
   zoeken), draait in één Vercel-project: de map uploads/ in deze repo (zie
   uploads/README.md). Elk verzoek gaat met het inlogbewijs van de collega die
   ingelogd is (js/shared/account.js); de server laat alleen het team toe.

     PM.service.ready                  staat er een adres? (anders: niet ingesteld)
     PM.service.url(pad)               volledig adres, zoals url('/api/upload')
     PM.service.request(pad, opties)   fetch met het inlogbewijs. Geeft de JSON terug, of
                                       gooit een Error met een zin voor de gebruiker
     PM.service.status(pad)            GET zonder inloggen: { ok, ... } of null

   Om te testen kan een ander adres in localStorage (pm-service-url-v1).
   ============================================================================= */
(function (global) {
  'use strict';

  // Het Vercel-project van de Tool Hub (Root Directory: uploads)
  const DEFAULT_SERVICE_URL = 'https://pure-minds-tool-hub.vercel.app';
  const URL_KEY = 'pm-service-url-v1';
  const PM = global.PM;

  const base = () => String((PM && PM.store.get(URL_KEY, '')) || DEFAULT_SERVICE_URL).replace(/\/+$/, '');
  const url = (path) => base() + (path.startsWith('/') ? path : `/${path}`);

  async function request(path, { method = 'POST', body = null, headers = {}, signal } = {}) {
    if (!base()) throw new Error('De server van de Tool Hub is nog niet ingesteld.');
    const token = PM.account ? await PM.account.token() : '';
    if (!token) {
      if (PM.account) PM.account.toLogin();
      throw new Error('Je bent niet (meer) ingelogd. Log opnieuw in en probeer het nog eens.');
    }
    let res;
    try {
      res = await fetch(url(path), { method, body, signal, headers: { ...headers, Authorization: `Bearer ${token}` } });
    } catch (err) {
      if (err && err.name === 'AbortError') throw err;
      throw new Error('De server van de Tool Hub is niet bereikbaar. Controleer je internet en probeer het opnieuw.');
    }
    let data = {};
    try { data = await res.json(); } catch (err) { data = {}; }
    if (res.status === 404) throw new Error('De server van de Tool Hub kent dit adres niet. Staat de Root Directory in Vercel op uploads?');
    if (!res.ok) throw Object.assign(new Error(data.error || `Er ging iets mis (fout ${res.status}).`), { status: res.status });
    return data;
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
      url, request, status,
      DEFAULT_SERVICE_URL,
    };
  }
})(window);
