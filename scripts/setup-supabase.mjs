/* =============================================================================
   setup-supabase.mjs — Supabase klaarzetten voor inloggen en de teambieb
   -----------------------------------------------------------------------------
   npm run supabase

   Leest .env.local (nooit in de repo) en zet via de Management API van
   Supabase:
     1. de database: supabase/teambieb.sql (tabellen, beveiliging, opslag)
     2. het inloggen: de adressen van de hub, wachtwoorden van minstens 10
        tekens, en de mails in het Nederlands
     3. de mailserver (Brevo), als BREVO_SMTP_LOGIN en BREVO_SMTP_KEY er staan

   Opnieuw draaien kan altijd. De teamlijst staat in de database (tabel team),
   niet hier. Geheimen komen nooit in de uitvoer.

     SUPABASE_ACCESS_TOKEN   supabase.com/dashboard/account/tokens (sbp_...)
     BREVO_SMTP_LOGIN        Brevo: SMTP & API -> SMTP (...@smtp-brevo.com)
     BREVO_SMTP_KEY          idem, Generate a new SMTP key (xsmtpsib-...)
     MAIL_FROM               afzender, bevestigd in Brevo (info@pureminds.nl)
   ============================================================================= */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REF = 'ilijpnuajxzbzkffaipm';
const HUB = 'https://puremindsmarketinggroup.github.io/Pure-Minds-Tool-Hub/';
const LOGO = `${HUB}email/img/logo-inkt.png`;

function readEnv() {
  const file = path.join(ROOT, '.env.local');
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
}
const env = { ...readEnv(), ...process.env };

async function api(route, { method = 'GET', body } = {}) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}${route}`, {
    method,
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${route}: ${res.status} ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

/* --- De mails: kort, in de huisstijl, met één knop --- */

function mail({ title, lead, button, after }) {
  return `<!DOCTYPE html>
<html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#edf3f7;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#edf3f7;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-top:4px solid #1ab9e2;">
<tr><td style="padding:32px 32px 8px;"><img src="${LOGO}" width="48" height="55" alt="Pure Minds marketing group" style="display:block;width:48px;height:55px;border:0;"></td></tr>
<tr><td style="padding:16px 32px 0;font-family:Arial,sans-serif;color:#303030;">
<h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;font-weight:bold;">${title}<span style="color:#1ab9e2;">.</span></h1>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;">${lead}</p>
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#b61b50;">
<a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:12px 20px;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">${button}</a>
</td></tr></table>
<p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#5c6670;">${after}</p>
</td></tr>
<tr><td style="padding:24px 32px 32px;font-family:Arial,sans-serif;font-size:12px;line-height:1.5;color:#5c6670;">Tool Hub van Pure Minds · interne tools</td></tr>
</table></td></tr></table>
</body></html>`;
}

const MAILS = {
  confirmation: {
    subject: 'Bevestig je account voor de Tool Hub',
    title: 'Bevestig je account',
    lead: 'Je hebt een account gemaakt voor de Tool Hub van Pure Minds. Klik op de knop om je e-mailadres te bevestigen. Daarna log je in met het wachtwoord dat je net hebt gekozen.',
    button: 'bevestig je account',
    after: 'Heb je geen account gemaakt? Dan kun je deze mail negeren.',
  },
  recovery: {
    subject: 'Nieuw wachtwoord voor de Tool Hub',
    title: 'Kies een nieuw wachtwoord',
    lead: 'Je vroeg om een nieuw wachtwoord voor de Tool Hub. Klik op de knop en kies er een. De link werkt een uur.',
    button: 'kies een nieuw wachtwoord',
    after: 'Heb je dit niet gevraagd? Dan kun je deze mail negeren: je wachtwoord blijft hetzelfde.',
  },
  invite: {
    subject: 'Je account voor de Tool Hub van Pure Minds',
    title: 'Welkom bij de Tool Hub',
    lead: 'Je bent toegevoegd aan de Tool Hub van Pure Minds: posts, documenten, presentaties en nieuwsbrieven in de huisstijl, met een bieb die het hele team deelt. Klik op de knop en kies je wachtwoord.',
    button: 'kies je wachtwoord',
    after: 'De link werkt een uur. Verlopen? Ga naar de Tool Hub en klik op wachtwoord vergeten.',
  },
  magic_link: {
    subject: 'Inloggen bij de Tool Hub',
    title: 'Inloggen bij de Tool Hub',
    lead: 'Klik op de knop om in te loggen. De link werkt een uur en maar één keer.',
    button: 'log in',
    after: 'Heb je dit niet gevraagd? Dan kun je deze mail negeren.',
  },
  email_change: {
    subject: 'Bevestig je nieuwe e-mailadres voor de Tool Hub',
    title: 'Bevestig je nieuwe e-mailadres',
    lead: 'Je wilt voortaan met dit adres inloggen bij de Tool Hub. Klik op de knop om het te bevestigen.',
    button: 'bevestig dit adres',
    after: 'Heb je dit niet gevraagd? Dan kun je deze mail negeren.',
  },
};

async function main() {
  if (!/^sbp_/.test(env.SUPABASE_ACCESS_TOKEN || '')) {
    console.error('SUPABASE_ACCESS_TOKEN ontbreekt in .env.local (supabase.com/dashboard/account/tokens).');
    process.exit(1);
  }

  // 1. De database
  const sql = fs.readFileSync(path.join(ROOT, 'supabase', 'teambieb.sql'), 'utf8');
  await api('/database/query', { method: 'POST', body: { query: sql } });
  const [{ count }] = await api('/database/query', { method: 'POST', body: { query: 'select count(*)::int as count from public.team' } });
  console.log(`database: klaar (${count} collega's op de teamlijst)`);

  // 2. Het inloggen
  const auth = {
    site_url: HUB,
    uri_allow_list: [`${HUB}**`, 'http://localhost:3000/**', 'http://127.0.0.1:3000/**'].join(','),
    disable_signup: false,          // zelf een account maken, maar alleen wie op de teamlijst staat (trigger)
    mailer_autoconfirm: false,      // eerst het e-mailadres bevestigen
    external_email_enabled: true,
    password_min_length: 10,
    mailer_otp_exp: 3600,
  };

  // 3. De mailserver, en dan pas de eigen mails (Supabase staat die alleen toe met een eigen mailserver)
  const smtp = env.BREVO_SMTP_LOGIN && env.BREVO_SMTP_KEY;
  if (smtp) {
    for (const [kind, m] of Object.entries(MAILS)) {
      auth[`mailer_subjects_${kind}`] = m.subject;
      auth[`mailer_templates_${kind}_content`] = mail(m);
    }
    Object.assign(auth, {
      smtp_host: 'smtp-relay.brevo.com',
      smtp_port: '587',
      smtp_user: env.BREVO_SMTP_LOGIN,
      smtp_pass: env.BREVO_SMTP_KEY,
      smtp_admin_email: env.MAIL_FROM || 'info@pureminds.nl',
      smtp_sender_name: 'Pure Minds Tool Hub',
      smtp_max_frequency: 60,
      rate_limit_email_sent: 30,
    });
  }
  await api('/config/auth', { method: 'PATCH', body: auth });
  console.log(`inloggen: klaar (${HUB}, wachtwoord minstens 10 tekens)`);
  console.log(smtp
    ? `mailserver: Brevo, afzender ${auth.smtp_admin_email}, mails in het Nederlands`
    : 'mailserver: nog niet ingesteld. Zonder Brevo stuurt Supabase alleen (Engelse) mails naar leden van de organisatie in Supabase.');
}

main().catch((err) => {
  console.error(String(err.message || err).replace(/(sbp_|xsmtpsib-)[A-Za-z0-9_-]+/g, '$1…'));
  process.exit(1);
});
