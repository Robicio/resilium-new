import { createHash } from 'node:crypto';

const categories = { companies: 'Firma', leaders: 'Lídr', individuals: 'Jednotlivec' };
const fields = {
  name: ['Jméno a příjmení', 150], lastName: ['Příjmení', 150],
  email: ['E-mail', 254], phone: ['Telefon', 60], company: ['Organizace / firma', 200],
  participants: ['Počet účastníků', 30], situation: ['Situace', 4000],
  billing: ['Fakturu vystavit na', 80], address: ['Fakturační adresa', 500],
  ico: ['IČO', 30], dic: ['DIČ', 30], billingEmail: ['Fakturační e-mail', 254],
  note: ['Poznámka', 4000]
};
const forms = {
  home: { categories: Object.keys(categories), required: ['name', 'email'], allowed: ['name', 'email', 'phone', 'company', 'participants', 'situation'] },
  company: { categories: ['companies'], required: ['name', 'email'], allowed: ['name', 'email', 'company', 'participants', 'situation'] },
  leader: { categories: ['leaders'], required: ['name', 'email'], allowed: ['name', 'email', 'situation'] },
  individual: { categories: ['individuals'], required: ['name', 'lastName', 'email', 'phone', 'billing', 'address'], allowed: ['name', 'lastName', 'email', 'phone', 'billing', 'address', 'company', 'ico', 'dic', 'billingEmail', 'situation', 'note'] },
  event: { categories: ['individuals'], required: ['name', 'lastName', 'email', 'phone', 'billing', 'address'], allowed: ['name', 'lastName', 'email', 'phone', 'billing', 'address', 'company', 'ico', 'dic', 'situation'] }
};
const limits = new Map();
const accepted = new Map();
const emailLimits = new Map();
const pendingEmails = new Map();
const hash = value => createHash('sha256').update(value).digest('hex');
const emailValid = value => {
  if (typeof value !== 'string' || value.length > 254) return false;
  const parts = value.split('@');
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  return local.length > 0 && local.length <= 64
    && /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)
    && !local.startsWith('.') && !local.endsWith('.') && !local.includes('..')
    && domain.includes('.') && domain.split('.').every(label => /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(label));
};
const escapeHtml = value => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const confirmation = 'Dobrý den,\n\nděkujeme za Váš zájem o programy Resilium.\n\nVaši poptávku jsme přijali a ozveme se Vám s návrhem dalšího postupu.\n\nTým Resilium';

function prune(map, now) {
  for (const [key, value] of map) if (value.expires <= now) map.delete(key);
  // Bound memory use; rate limiting is local to a warm function instance.
  if (map.size >= 10000) map.delete(map.keys().next().value);
}

export function validate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Neplatná data formuláře.');
  if (typeof body.form !== 'string' || typeof body.category !== 'string') throw new Error('Vyberte platnou kategorii poptávky.');
  const schema = Object.hasOwn(forms, body.form) ? forms[body.form] : null;
  if (!schema || !schema.categories.includes(body.category)) throw new Error('Vyberte platnou kategorii poptávky.');
  if (body.consent !== true) throw new Error('Pro odeslání je potřeba souhlas se zpracováním údajů.');
  if (typeof body.requestId !== 'string' || !/^[a-zA-Z0-9-]{20,80}$/.test(body.requestId)) throw new Error('Obnovte stránku a zkuste odeslání znovu.');
  const data = {};
  for (const key of Object.keys(body)) {
    if (!['form', 'category', 'consent', 'requestId', 'website', ...schema.allowed].includes(key)) throw new Error('Formulář obsahuje nepovolené pole.');
  }
  for (const key of schema.allowed) {
    if (body[key] === undefined) continue;
    if (typeof body[key] !== 'string' || body[key].length > fields[key][1] || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body[key])) throw new Error(`Zkontrolujte pole: ${fields[key][0]}.`);
    data[key] = body[key].trim();
    if (!['situation', 'note', 'address'].includes(key) && /[\r\n]/.test(data[key])) throw new Error(`Zkontrolujte pole: ${fields[key][0]}.`);
  }
  for (const key of schema.required) if (!data[key]) throw new Error(`Vyplňte pole: ${fields[key][0]}.`);
  if (!emailValid(data.email) || (data.billingEmail && !emailValid(data.billingEmail))) throw new Error('Zadejte platnou e-mailovou adresu.');
  if (data.participants && !['Zatím nevím', 'Do 8', '9–15', '16–30', 'Více než 30'].includes(data.participants)) throw new Error('Vyberte platný počet účastníků.');
  if (data.billing && !['Soukromou osobu', 'Firmu', 'Firmu – jedno místo pro účastníka'].includes(data.billing)) throw new Error('Vyberte platný způsob fakturace.');
  if (body.form === 'home' && body.category !== 'companies' && data.participants) throw new Error('Počet účastníků patří k firemní poptávce.');
  if (body.form === 'home' && body.category === 'individuals' && data.company) throw new Error('Organizace patří k firemní poptávce nebo poptávce lídra.');
  return { form: body.form, category: body.category, consent: true, data };
}

async function sendEmail(key, payload, apiKey) {
  if (pendingEmails.has(key)) return pendingEmails.get(key);
  const task = deliverEmail(key, payload, apiKey);
  pendingEmails.set(key, task);
  try { await task; } finally { pendingEmails.delete(key); }
}

async function deliverEmail(key, payload, apiKey) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) {
    // Never log request bodies, credentials or provider error bodies.
    console.error('contact: Resend rejected email', { status: response.status });
    throw new Error('provider');
  }
  const result = await response.json();
  if (!result.id) throw new Error('provider');
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const reply = (status, message, extra = {}) => res.status(status).json({ ok: status === 200, message, ...extra });
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return reply(405, 'Použijte odeslání formuláře.'); }
  if (!(req.headers['content-type'] || '').startsWith('application/json')) return reply(415, 'Formulář vyžaduje JSON.');
  // Browser requests must come from this deployment, including preview deployments.
  if (req.headers.origin) {
    try { if (new URL(req.headers.origin).host !== req.headers.host) return reply(403, 'Odešlete formulář přímo z webu Resilium.'); }
    catch { return reply(403, 'Neplatný původ požadavku.'); }
  }
  if (Number(req.headers['content-length']) > 20000) return reply(413, 'Formulář je příliš dlouhý.');
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (Buffer.byteLength(JSON.stringify(body) || '') > 20000) return reply(413, 'Formulář je příliš dlouhý.');
  } catch { return reply(400, 'Neplatná data formuláře.'); }
  const now = Date.now();
  prune(limits, now); prune(accepted, now); prune(emailLimits, now);
  const ip = hash(String(req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0]);
  const limit = limits.get(ip) || { count: 0, expires: now + 600000 };
  limit.count += 1; limits.set(ip, limit);
  if (limit.count > 10) { res.setHeader('Retry-After', String(Math.ceil((limit.expires - now) / 1000))); return reply(429, 'Příliš mnoho pokusů. Zkuste to prosím za několik minut.'); }
  if (body?.website) return reply(400, 'Formulář se nepodařilo ověřit.');
  let input;
  try { input = validate(body); } catch (error) { return reply(400, error.message); }
  const apiKey = process.env.RESEND_API_KEY;
  const recipient = process.env.CONTACT_EMAIL_TO?.trim();
  if (!recipient || !emailValid(recipient)) {
    console.error('contact: CONTACT_EMAIL_TO is missing or invalid');
    return reply(503, 'Odesílání není nakonfigurováno: chybí platná CONTACT_EMAIL_TO.');
  }
  if (!apiKey) { console.error('contact: RESEND_API_KEY is missing'); return reply(503, 'Odesílání e-mailů není nakonfigurováno. Kontaktujte nás prosím přímo.'); }
  // Canonical payload and client retry ID give stable provider keys across cold starts.
  // Resend retains these keys for 24 hours. Client retries keep the same ID and payload.
  const key = hash(JSON.stringify(input) + body.requestId);
  const previous = accepted.get(key);
  if (previous) return reply(200, 'Děkujeme. Vaši poptávku jsme přijali a ozveme se vám s návrhem dalšího postupu.');
  const emailHash = hash(input.data.email.toLowerCase());
  const emailLimit = emailLimits.get(emailHash) || { keys: new Set(), expires: now + 600000 };
  if (!emailLimit.keys.has(key) && emailLimit.keys.size >= 5) {
    res.setHeader('Retry-After', String(Math.ceil((emailLimit.expires - now) / 1000)));
    return reply(429, 'Pro tuto e-mailovou adresu jsme zaznamenali více pokusů. Zkuste to prosím za několik minut.');
  }
  emailLimit.keys.add(key); emailLimits.set(emailHash, emailLimit);
  const rows = [
    ['Typ poptávky', categories[input.category]],
    ['Formulář', { home: 'Hlavní stránka', company: 'Firmy a organizace', leader: 'Lídři a manažeři', individual: 'Přihláška jednotlivce', event: 'Veřejný trénink – Praha 21. 11. 2026' }[input.form]],
    ...Object.entries(input.data).filter(([, value]) => value).map(([field, value]) => [fields[field][0], value]),
    ['Souhlas se zpracováním údajů', 'Ano']
  ];
  const admin = {
    from: 'poptavky@resilium.cz', to: [recipient], reply_to: input.data.email,
    subject: `RESILIUM | Nová poptávka – ${categories[input.category]}`,
    text: rows.map(([label, value]) => `${label}: ${value}`).join('\n\n'),
    html: `<h1>Nová poptávka Resilium</h1><table>${rows.map(([label, value]) => `<tr><th style="text-align:left;vertical-align:top;padding:8px">${escapeHtml(label)}</th><td style="white-space:pre-wrap;padding:8px">${escapeHtml(value)}</td></tr>`).join('')}</table>`
  };
  try { await sendEmail(`contact-admin/${key}`, admin, apiKey); }
  catch { console.error('contact: admin delivery failed', { request: key }); return reply(502, 'Přijetí poptávky se nepodařilo potvrdit. Zkuste odeslání znovu.'); }
  accepted.set(key, { expires: now + 86400000 });
  try {
    await sendEmail(`contact-confirmation/${key}`, {
      from: 'poptavky@resilium.cz', to: [input.data.email], reply_to: recipient,
      subject: 'Resilium – potvrzení přijetí poptávky', text: confirmation
    }, apiKey);
  } catch { console.error('contact: confirmation delivery failed; admin already accepted', { request: key }); }
  return reply(200, 'Děkujeme. Vaši poptávku jsme přijali a ozveme se vám s návrhem dalšího postupu.');
}
