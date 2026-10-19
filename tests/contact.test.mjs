import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import handler, { validate } from '../api/contact.js';

const originalFetch = globalThis.fetch;
const originalKey = process.env.RESEND_API_KEY;
const originalTo = process.env.CONTACT_EMAIL_TO;
after(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = originalKey;
  if (originalTo === undefined) delete process.env.CONTACT_EMAIL_TO; else process.env.CONTACT_EMAIL_TO = originalTo;
});
let counter = 0;
const base = (overrides = {}) => ({ form: 'home', category: 'companies', name: 'Testovací uživatel', email: 'customer@example.com', consent: true, requestId: '12345678-1234-4123-8123-123456789012', ...overrides });
async function request(body, headers = {}, method = 'POST', activeHandler = handler) {
  let status, data;
  const response = {
    headers: {}, setHeader(key, value) { this.headers[key] = value; },
    status(value) { status = value; return this; }, json(value) { data = value; return this; }
  };
  await activeHandler({ method, headers: { 'content-type': 'application/json', host: 'resilium.cz', origin: 'https://resilium.cz', 'x-vercel-forwarded-for': `192.0.2.${++counter}`, ...headers }, body }, response);
  return { status, data, headers: response.headers };
}

test('all three homepage categories preserve category-specific fields', () => {
  for (const category of ['companies', 'leaders', 'individuals']) {
    assert.equal(validate(base({ category })).category, category);
  }
  assert.equal(validate(base({ participants: 'Do 8', company: 'Firma' })).data.participants, 'Do 8');
  assert.throws(() => validate(base({ category: 'individuals', company: 'hidden stale value' })));
  assert.throws(() => validate(base({ category: 'leaders', participants: 'Do 8' })));
});

test('all standalone forms and required registration fields', () => {
  validate(base({ form: 'company' }));
  validate(base({ form: 'leader', category: 'leaders' }));
  for (const form of ['individual', 'event']) {
    const input = base({ form, category: 'individuals', lastName: 'Příjmení', phone: '+420 123 456 789', billing: 'Soukromou osobu', address: 'Testovací 1' });
    validate(input);
    for (const key of ['name', 'lastName', 'email', 'phone', 'billing', 'address']) assert.throws(() => validate({ ...input, [key]: '' }));
  }
});

test('validation rejects forged fields, category, missing consent, long inputs and header injection', () => {
  for (const overrides of [
    { category: 'admin' }, { form: '__proto__' }, { form: { toString: null } }, { consent: false }, { name: '' },
    { name: 'x'.repeat(151) }, { situation: 'x'.repeat(4001) },
    { email: 'broken' }, { email: 'a,b@example.com' }, { email: 'a@-example.com' }, { email: 'a@example.com\r\nBcc: b@example.com' },
    { name: 'name\nBcc: b@example.com' }, { requestId: 'bad' },
    { participants: '999' }, { to: 'attacker@example.com' }
  ]) assert.throws(() => validate(base(overrides)));
});

test('server errors: configuration, JSON, origin, method, honeypot and size', async () => {
  process.env.RESEND_API_KEY = 'test-placeholder';
  delete process.env.CONTACT_EMAIL_TO;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('must not send'); };
  const missing = await request(base());
  assert.equal(missing.status, 503);
  assert.match(missing.data.message, /CONTACT_EMAIL_TO/);
  assert.equal((await request('{')).status, 400);
  assert.equal((await request(base(), { origin: 'https://attacker.example' })).status, 403);
  assert.equal((await request(base(), {}, 'GET')).status, 405);
  assert.equal((await request(base({ website: 'spam.example' }))).status, 400);
  assert.equal((await request(base(), { 'content-length': '25000' })).status, 413);
  assert.equal((await request(base(), { 'content-type': 'text/plain' })).status, 415);
  assert.equal(calls, 0);
});

test('emails for all categories have correct sender, reply-to, fields and escaped HTML', async () => {
  process.env.CONTACT_EMAIL_TO = 'admin@example.com';
  process.env.RESEND_API_KEY = 'test-placeholder';
  for (const [category, label] of [['companies', 'Firma'], ['leaders', 'Lídr'], ['individuals', 'Jednotlivec']]) {
    const calls = [];
    globalThis.fetch = async (url, options) => {
      calls.push({ url, options, email: JSON.parse(options.body) });
      return { ok: true, json: async () => ({ id: 'mock-email-id' }) };
    };
    const result = await request(base({ category, situation: '<img src=x onerror=alert(1)>\nDruhý řádek' }));
    assert.equal(result.status, 200);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].email.subject, `RESILIUM | Nová poptávka – ${label}`);
    assert.equal(calls[0].email.from, 'poptavky@resilium.cz');
    assert.equal(calls[0].email.reply_to, 'customer@example.com');
    assert.deepEqual(calls[0].email.to, ['admin@example.com']);
    assert.match(calls[0].email.html, /&lt;img/);
    assert.doesNotMatch(calls[0].email.html, /<img/);
    assert.equal(calls[1].email.subject, 'Resilium – potvrzení přijetí poptávky');
    assert.match(calls[1].email.text, /Vaši poptávku jsme přijali/);
    assert.equal(calls[1].email.from, 'poptavky@resilium.cz');
    assert.deepEqual(calls[1].email.to, ['customer@example.com']);
    assert.notEqual(calls[0].options.headers['Idempotency-Key'], calls[1].options.headers['Idempotency-Key']);
    assert.equal((await request(base({ category, situation: '<img src=x onerror=alert(1)>\nDruhý řádek' }))).status, 200);
    assert.equal(calls.length, 2, 'duplicate request sends no more emails');
  }
});

test('confirmation failure still succeeds; retry does not send admin again', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    if (calls === 2) return { ok: false, status: 500 };
    return { ok: true, json: async () => ({ id: 'mock' }) };
  };
  const payload = base({ situation: 'Confirmation failure' });
  assert.equal((await request(payload)).status, 200);
  assert.equal((await request(payload)).status, 200);
  assert.equal(calls, 2);
});

test('provider failure never displays success and retries use same idempotency key', async () => {
  const keys = [];
  globalThis.fetch = async (_url, options) => {
    keys.push(options.headers['Idempotency-Key']);
    return { ok: false, status: 500 };
  };
  const payload = base({ situation: 'Admin failure' });
  assert.equal((await request(payload)).status, 502);
  assert.equal((await request(payload)).data.ok, false);
  assert.equal(keys[0], keys[1]);
});

test('rate limit returns 429 and retry-after', async () => {
  const headers = { 'x-vercel-forwarded-for': '192.0.2.rate-test' };
  for (let i = 0; i < 10; i++) await request(base({ consent: false }), headers);
  const blocked = await request(base(), headers);
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers['Retry-After']) > 0);
});

test('all categories use the configured production recipient, never a fallback', async () => {
  const calls = [];
  process.env.CONTACT_EMAIL_TO = 'robert@resilium.cz';
  globalThis.fetch = async (_url, options) => {
    calls.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ id: 'mock' }) };
  };
  for (const category of ['companies', 'leaders', 'individuals']) {
    assert.equal((await request(base({category, email: `recipient-${category}@example.com`}))).status, 200);
  }
  assert.equal(calls.length, 6);
  for (const email of calls.filter(email => email.subject.startsWith('RESILIUM |'))) assert.deepEqual(email.to, ['robert@resilium.cz']);
});

test('simultaneous double submissions coalesce both outgoing emails', async () => {
  const keys = [];
  globalThis.fetch = async (_url, options) => {
    keys.push(options.headers['Idempotency-Key']);
    await new Promise(resolve => setTimeout(resolve, 10));
    return {ok: true, json: async () => ({id: 'mock'})};
  };
  const payload = base({email: 'parallel@example.com'});
  const results = await Promise.all([request(payload), request(payload)]);
  assert.ok(results.every(result => result.status === 200));
  assert.equal(keys.length, 2, 'one admin email and one confirmation');
});

test('cold-start retries keep identical Resend keys and email content', async () => {
  const {default: freshHandler} = await import('../api/contact.js?cold-start-test');
  const calls = [];
  globalThis.fetch = async (_url, options) => {
    calls.push({key: options.headers['Idempotency-Key'], content: options.body});
    return {ok: true, json: async () => ({id: 'mock'})};
  };
  const payload = base({email: 'coldstart@example.com'});
  assert.equal((await request(payload)).status, 200);
  assert.equal((await request(payload, {}, 'POST', freshHandler)).status, 200);
  assert.equal(calls.length, 4);
  assert.deepEqual(calls[0], calls[2]);
  assert.deepEqual(calls[1], calls[3]);
});

test('per-email spam limit applies across IPs but permits identical retries', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return {ok: false, status: 500}; };
  for (let i = 0; i < 5; i++) {
    assert.equal((await request(base({email: 'spam-limit@example.com', situation: `Attempt ${i}`}))).status, 502);
  }
  const blocked = await request(base({email: 'spam-limit@example.com', situation: 'Sixth attempt'}));
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers['Retry-After']) > 0);
  assert.equal(calls, 5);
  assert.equal((await request(base({email: 'spam-limit@example.com', situation: 'Attempt 0'}))).status, 502);
});
