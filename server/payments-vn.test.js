// New payment methods (founder, 2026-11-24): payOS VietQR (automatic confirmation by signed webhook), PayPal
// renewals (each sale extends once), USDT for companies outside Vietnam only (manual confirmation).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import { readFileSync, unlinkSync } from 'node:fs';
import { isTrc20Address, isTronTxHash, isVietnam } from './billing/providers/manual.js';
import { isPayosPaid, payosDescription, signPaymentRequest, signWebhookData, verifyWebhook } from './billing/providers/payos.js';
import { isPaypalConfigured, planId } from './billing/providers/paypal.js';

const DB_PATH = `/tmp/jobmatch-payvn-test-${process.pid}.json`;
const CHECKSUM = 'test-checksum-key';
let server; let base; let fake; let lastPayosRequest = null;

async function listening() {
  if (base) return base;
  // A fake payOS API: records the request and answers like payOS does.
  fake = http.createServer((req, res) => {
    let raw = ''; req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      lastPayosRequest = { url: req.url, headers: req.headers, body: JSON.parse(raw || '{}') };
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ code: '00', desc: 'success', data: { checkoutUrl: `https://pay.payos.vn/web/${lastPayosRequest.body.orderCode}`, qrCode: '000201…', paymentLinkId: 'pl_1' } }));
    });
  });
  fake.listen(0); await new Promise((r) => fake.once('listening', r));
  Object.assign(process.env, { NODE_ENV: 'test', DB_PATH, PAYOS_CLIENT_ID: 'cid', PAYOS_API_KEY: 'key', PAYOS_CHECKSUM_KEY: CHECKSUM, PAYOS_API_URL: `http://127.0.0.1:${fake.address().port}`, WEB_APP_URL: 'https://jobsmatchnow.com', ADMIN_PROMOTE_SECRET: 'promote-secret-test' });
  const { app } = await import('./index.js');
  server = app.listen(0); await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  return base;
}
async function call(method, path, body, cookie) {
  const r = await fetch(`${await listening()}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => ({})), session: (r.headers.get('set-cookie') || '').match(/jm_auth=[^;]+/)?.[0] };
}
async function recruiter(tag, country) {
  const reg = await call('POST', '/api/auth/register', { role: 'employer', kind: 'company', name: `Rec ${tag}`, email: `${tag}-${process.pid}@example.com`, password: 'correct-horse-battery', conductAccepted: true });
  assert.equal(reg.status, 201, JSON.stringify(reg.body));
  if (country) assert.equal((await call('PATCH', `/api/users/${reg.body.user.id}`, { country, company: `${tag} Co` }, reg.session)).status, 200);
  return { id: reg.body.user.id, cookie: reg.session };
}
const db = () => JSON.parse(readFileSync(DB_PATH, 'utf8'));
// A real admin session (promote with the secret → one-time password link → password sign-in).
let adminCk = '';
async function admin() {
  if (adminCk) return adminCk;
  const email = `admin-pay-${process.pid}@example.com`;
  const h = { 'x-admin-promote-secret': 'promote-secret-test' };
  const raw = async (method, path, body, headers = {}) => { const r = await fetch(`${await listening()}${path}`, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => ({})), session: (r.headers.get('set-cookie') || '').match(/jm_auth=[^;]+/)?.[0] }; };
  assert.equal((await raw('POST', '/api/admin/bootstrap-admin', { email }, h)).status, 200);
  const link = await raw('POST', '/api/admin/password-link', { email }, h);
  const token = new URL(link.body.link).searchParams.get('admin-reset');
  assert.equal((await raw('POST', '/api/admin/password-reset', { token, password: 'a-strong-admin-pass' })).status, 200);
  adminCk = (await raw('POST', '/api/auth/login', { email, password: 'a-strong-admin-pass' })).session;
  return adminCk;
}
after(() => { server?.close(); fake?.close(); try { unlinkSync(DB_PATH); } catch { /* gone */ } });

test('helpers: TRON address/tx checks, Vietnam detection, payOS description ≤ 25 chars', () => {
  assert.equal(isTrc20Address('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'), true);
  assert.equal(isTrc20Address('0x1234'), false);
  assert.equal(isTrc20Address('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj60'), false, 'base58 has no 0');
  assert.equal(isTronTxHash('a'.repeat(64)), true);
  assert.equal(isTronTxHash('a'.repeat(63)), false);
  for (const c of ['Vietnam', 'viet nam', 'VN']) assert.equal(isVietnam(c), true);
  assert.equal(isVietnam('France'), false);
  assert.ok(payosDescription('INV-202611-ABCDEF12').length <= 25);
  assert.match(payosDescription('INV-202611-ABCDEF12'), /^JMN 202611ABCDEF12$/);
});

test('payOS signatures: request signs the 5 fields in order; webhook data signs sorted keys; tampering fails', async () => {
  await listening();
  const req = { amount: 490000, cancelUrl: 'c', description: 'd', orderCode: 1, returnUrl: 'r' };
  assert.equal(signPaymentRequest(req), crypto.createHmac('sha256', CHECKSUM).update('amount=490000&cancelUrl=c&description=d&orderCode=1&returnUrl=r').digest('hex'));
  const data = { orderCode: 1, amount: 490000, code: '00', desc: 'success', reference: null };
  const body = { code: '00', desc: 'success', success: true, data, signature: signWebhookData(data) };
  assert.equal(verifyWebhook(body), true);
  assert.equal(isPayosPaid(body), true);
  assert.equal(verifyWebhook({ ...body, data: { ...data, amount: 1 } }), false, 'changed amount breaks the signature');
  assert.equal(verifyWebhook({ ...body, signature: 'x' }), false);
});

test('payOS end to end: create link in VND → forged webhook refused → wrong amount refused → signed webhook confirms once', async () => {
  const rec = await recruiter('payos', 'Vietnam');
  const created = await call('POST', '/api/billing/payments/payos/create', { userId: rec.id }, rec.cookie);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.match(created.body.redirectUrl, /^https:\/\/pay\.payos\.vn\/web\//);
  const p = created.body.payment;
  assert.equal(p.currency, 'VND'); assert.ok(p.amount > 0); assert.equal(p.status, 'pending');
  assert.equal(lastPayosRequest.headers['x-client-id'], 'cid');
  assert.equal(lastPayosRequest.body.amount, p.amount);
  assert.equal(lastPayosRequest.body.signature, signPaymentRequest({ amount: p.amount, cancelUrl: lastPayosRequest.body.cancelUrl, description: lastPayosRequest.body.description, orderCode: Number(p.paymentReference), returnUrl: lastPayosRequest.body.returnUrl }));
  const hook = (data, signature) => call('POST', '/api/billing/payos/webhook', { code: '00', desc: 'success', success: true, data, signature: signature ?? signWebhookData(data) });
  const base = { orderCode: Number(p.paymentReference), amount: p.amount, code: '00', desc: 'success', counterAccountName: 'NGUYEN VAN A' };
  assert.equal((await hook(base, 'forged')).status, 400, 'unsigned webhook refused');
  assert.equal(db().payments.find((x) => x.id === p.id).status, 'pending');
  await hook({ ...base, amount: p.amount - 1000 });
  assert.equal(db().payments.find((x) => x.id === p.id).status, 'pending', 'wrong amount never confirms');
  assert.equal((await hook(base)).status, 200);
  const confirmed = db().payments.find((x) => x.id === p.id);
  assert.equal(confirmed.status, 'confirmed'); assert.equal(confirmed.payerName, 'NGUYEN VAN A');
  const end1 = db().subscriptions.find((s) => s.id === confirmed.subscriptionId).currentPeriodEndsAt;
  await hook(base); // payOS retries
  assert.equal(db().subscriptions.find((s) => s.id === confirmed.subscriptionId).currentPeriodEndsAt, end1, 'a resent webhook never extends twice');
  assert.equal((await hook({ ...base, orderCode: 123 })).status, 200, 'payOS registration test (unknown order) answers 200');
});

test('USDT: only for companies outside Vietnam, only when the SARL wallet is set, valid TxID, no reuse', async () => {
  const fr = await recruiter('usdt-fr', 'France');
  const vn = await recruiter('usdt-vn', 'Vietnam');
  const tx = 'b'.repeat(64);
  assert.equal((await call('POST', '/api/billing/payments', { userId: fr.id, paymentMethod: 'usdt_trc20', txHash: tx }, fr.cookie)).status, 503, 'off until the wallet is set');
  // The SARL wallet (env fallback; the admin form validates and stores it the same way).
  process.env.BILLING_USDT_TRC20_ADDRESS = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
  assert.equal((await call('POST', '/api/billing/payments', { userId: vn.id, paymentMethod: 'usdt_trc20', txHash: tx }, vn.cookie)).status, 403, 'never from Vietnam');
  assert.equal((await call('POST', '/api/billing/payments', { userId: fr.id, paymentMethod: 'usdt_trc20', txHash: tx }, fr.cookie)).status, 403, 'off in every country until ticked in the grid');
  // Admin ticks France (and tries Vietnam, which stays locked off).
  const grid = await call('PUT', '/api/admin/billing/payment-methods/usdt', { grid: { FR: true, VN: true } }, await admin());
  assert.equal(grid.status, 200, JSON.stringify(grid.body));
  const usdt = grid.body.methods.find((m) => m.id === 'usdt');
  assert.equal(usdt.grid.FR, true); assert.equal(usdt.grid.VN, false, 'Vietnam stays locked off');
  assert.equal((await call('POST', '/api/billing/payments', { userId: vn.id, paymentMethod: 'usdt_trc20', txHash: tx }, vn.cookie)).status, 403, 'still never from Vietnam');
  assert.equal((await call('POST', '/api/billing/payments', { userId: fr.id, paymentMethod: 'usdt_trc20', txHash: 'nope' }, fr.cookie)).status, 400, 'TxID must be 64 hex');
  const ok = await call('POST', '/api/billing/payments', { userId: fr.id, paymentMethod: 'usdt_trc20', txHash: tx }, fr.cookie);
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.equal(ok.body.currency, 'USDT'); assert.equal(ok.body.network, 'TRC-20'); assert.equal(ok.body.status, 'submitted'); assert.equal(ok.body.txHash, tx);
  assert.equal((await call('POST', '/api/billing/payments', { userId: fr.id, paymentMethod: 'usdt_trc20', txHash: tx.toUpperCase() }, fr.cookie)).status, 409, 'the same transaction cannot be used twice');
  delete process.env.BILLING_USDT_TRC20_ADDRESS;
});

test('grid: methods per region and country; a country box beats its region; place names are recognised', async () => {
  const { shownIn, zoneOf } = await import('./billing/payment-settings.js');
  assert.deepEqual(zoneOf('Paris, France'), { country: 'FR', region: 'EU' });
  assert.deepEqual(zoneOf('Germany'), { country: null, region: 'EU' });
  assert.deepEqual(zoneOf('USA'), { country: 'US', region: 'NA' });
  assert.deepEqual(zoneOf('Tokyo, Japan'), { country: null, region: 'ASIA' });
  assert.deepEqual(zoneOf(''), { country: null, region: 'ROW' });
  assert.equal(shownIn(undefined, 'payos', 'Vietnam'), true);
  assert.equal(shownIn(undefined, 'payos', 'France'), false);
  assert.equal(shownIn(undefined, 'stripe_card', 'Paris, France'), true);
  assert.equal(shownIn(undefined, 'sepa_transfer', 'Germany'), true);
  assert.equal(shownIn(undefined, 'sepa_transfer', 'USA'), false);
  assert.equal(shownIn(undefined, 'international_wire', 'Japan'), true);
  assert.equal(shownIn(undefined, 'usdt', 'France'), false, 'USDT starts off');
  const settings = { grid: { stripe_card: { FR: false }, usdt: { VN: true, EU: true } } };
  assert.equal(shownIn(settings, 'stripe_card', 'France'), false, 'France unticked');
  assert.equal(shownIn(settings, 'stripe_card', 'Germany'), true, 'rest of the EU unchanged');
  assert.equal(shownIn(settings, 'usdt', 'Vietnam'), false, 'USDT can never be shown in Vietnam');
  assert.equal(shownIn(settings, 'usdt', 'Germany'), true);
});

test('provider keys: saved encrypted, only the last 4 characters come back, a key makes the method configured', async () => {
  const ck = await admin();
  const secretKey = 'sk_test_SECRETabcdefgh1234';
  const saved = await call('PUT', '/api/admin/billing/payment-methods/keys/stripe', { secretKey, webhookSecret: 'whsec_test_9876' }, ck);
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.ok(!JSON.stringify(saved.body).includes(secretKey), 'the full key never comes back');
  const sk = saved.body.providers.stripe.find((f) => f.field === 'secretKey');
  assert.equal(sk.set, true); assert.equal(sk.last4, '1234'); assert.equal(sk.source, 'admin');
  assert.ok(!readFileSync(DB_PATH, 'utf8').includes(secretKey), 'not stored in clear text');
  assert.equal(saved.body.methods.find((m) => m.id === 'stripe_card').configured, true);
  assert.equal(saved.body.methods.find((m) => m.id === 'stripe_sepa').configured, false, 'SEPA needs EUR prices');
  const fr = await recruiter('keys-fr', 'France');
  const boot = await call('GET', `/api/bootstrap?userId=${fr.id}`, undefined, fr.cookie);
  assert.ok(boot.body.billing.methods.includes('stripe_card'), `card offered in France: ${boot.body.billing.methods}`);
  assert.ok(!boot.body.billing.methods.includes('payos'), 'VietQR not offered in France');
  const cleared = await call('PUT', '/api/admin/billing/payment-methods/keys/stripe', { secretKey: null, webhookSecret: null }, ck);
  assert.equal(cleared.body.providers.stripe.find((f) => f.field === 'secretKey').set, false);
  assert.equal((await call('GET', '/api/admin/billing/payment-methods', undefined, fr.cookie)).status, 403, 'admin only');
});

test('pricing editor: add, edit, stop selling, delete; existing customers keep their price; audit log', async () => {
  const ck = await admin();
  const plans = async () => (await call('GET', '/api/plans')).body;
  const list0 = await plans();
  assert.deepEqual(list0.headline, ['solo', 'duo', 'trio']);
  assert.ok(!list0.plans.some((p) => p.key === 'team'), 'legacy plan not sold');
  assert.equal((await call('PUT', '/api/admin/billing/catalog/solo', { usd: -5 }, ck)).status, 400, 'negative price refused');
  assert.equal((await call('PUT', '/api/admin/billing/catalog/Bad Key', { display: 'x', usd: 1 }, ck)).status, 400);
  // Add a plan.
  const added = await call('PUT', '/api/admin/billing/catalog/agency', { display: 'Agency', usd: 200, seats: 5, liveJobSlots: 30, perks: ['5 recruiter accounts'] }, ck);
  assert.equal(added.status, 200, JSON.stringify(added.body));
  assert.ok((await plans()).plans.some((p) => p.key === 'agency' && p.usd === 200));
  assert.ok(added.body.ladder.includes('agency'));
  // A paying Vietnamese customer on Solo (paid by VietQR).
  const payer = await recruiter('lock-vn', 'Vietnam');
  const created = await call('POST', '/api/billing/payments/payos/create', { userId: payer.id }, payer.cookie);
  const p = created.body.payment;
  const data = { orderCode: Number(p.paymentReference), amount: p.amount, code: '00', desc: 'success' };
  await call('POST', '/api/billing/payos/webhook', { code: '00', desc: 'success', success: true, data, signature: signWebhookData(data) });
  assert.equal(db().payments.find((x) => x.id === p.id).status, 'confirmed');
  const oldVnd = p.amount;
  // Price change: the existing customer keeps the old price, a new customer pays the new one.
  const edited = await call('PUT', '/api/admin/billing/catalog/solo', { usd: 99, vnd: 999000 }, ck);
  assert.equal(edited.status, 200, JSON.stringify(edited.body));
  assert.ok(edited.body.customersKeptTheirPrice >= 1, `customers kept their price: ${edited.body.customersKeptTheirPrice}`);
  assert.equal((await call('POST', '/api/billing/payments/payos/create', { userId: payer.id }, payer.cookie)).body.payment.amount, oldVnd, 'existing customer keeps the price they bought');
  const fresh = await recruiter('fresh-vn', 'Vietnam');
  assert.equal((await call('POST', '/api/billing/payments/payos/create', { userId: fresh.id }, fresh.cookie)).body.payment.amount, 999000, 'new customer pays the new price');
  // Move the existing customer to the new price.
  const subId = db().payments.find((x) => x.id === p.id).subscriptionId;
  assert.equal((await call('POST', `/api/admin/billing/subscriptions/${subId}/reprice`, {}, ck)).status, 200);
  assert.equal((await call('POST', '/api/billing/payments/payos/create', { userId: payer.id }, payer.cookie)).body.payment.amount, 999000);
  // Stop selling, then delete: only an unused plan can be deleted; built-in plans never.
  assert.equal((await call('PUT', '/api/admin/billing/catalog/agency', { sellable: false }, ck)).status, 200);
  assert.ok(!(await plans()).plans.some((p2) => p2.key === 'agency'), 'stopped plan is off the price list');
  assert.equal((await call('DELETE', '/api/admin/billing/catalog/solo', undefined, ck)).status, 409, 'Solo is in use: stop selling instead');
  assert.equal((await call('DELETE', '/api/admin/billing/catalog/starter', undefined, ck)).status, 409, 'built in');
  assert.equal((await call('DELETE', '/api/admin/billing/catalog/agency', undefined, ck)).status, 200, 'unused plan deleted');
  const events = db().billingEvents.filter((e) => ['plan_added', 'plan_updated', 'plan_deleted', 'subscription_repriced'].includes(e.eventType)).map((e) => e.eventType);
  for (const t of ['plan_added', 'plan_updated', 'plan_deleted', 'subscription_repriced']) assert.ok(events.includes(t), `audit has ${t}`);
  assert.equal((await call('PUT', '/api/admin/billing/catalog/solo', { usd: 50, vnd: 490000 }, payer.cookie)).status, 403, 'admin only');
  await call('PUT', '/api/admin/billing/catalog/solo', { usd: 50, vnd: 490000 }, ck); // restore
});

test('Google Play: base plans map to catalogue plans (team = trio), and Play is ticked in every region by default', async () => {
  const { basePlanIdFor, planKeyForBasePlan } = await import('./billing/providers/googleplay.js');
  const { PLANS } = await import('./billing/plans.js');
  const { shownIn } = await import('./billing/payment-settings.js');
  assert.equal(basePlanIdFor('trio'), 'team'); assert.equal(basePlanIdFor('solo'), 'solo'); assert.equal(basePlanIdFor('pay_per_hire'), 'pay-per-hire');
  assert.equal(planKeyForBasePlan('team', PLANS), 'trio'); assert.equal(planKeyForBasePlan('duo', PLANS), 'duo');
  assert.equal(planKeyForBasePlan('nope', PLANS), null, 'unknown base plan is not trusted');
  for (const place of ['Vietnam', 'France', 'Germany', 'USA', 'United Kingdom', 'Singapore', 'Australia', 'Japan', 'Brazil', '']) {
    assert.equal(shownIn(undefined, 'google_play', place), true, `Google Play shown for ${place || 'no country'}`);
  }
});

test('sign-up: citizenship for both roles, company country for recruiters; methods follow the company country, then citizenship', async () => {
  const reg = (body) => call('POST', '/api/auth/register', { password: 'correct-horse-battery', conductAccepted: true, ...body });
  const cand = await reg({ role: 'candidate', name: 'Cit Candidate', email: `cit-c-${process.pid}@example.com`, citizenship: 'France' });
  assert.equal(cand.status, 201, JSON.stringify(cand.body));
  const recNoCountry = await reg({ role: 'employer', kind: 'company', name: 'Cit Rec', email: `cit-r-${process.pid}@example.com`, citizenship: 'Vietnam' });
  const recFr = await reg({ role: 'employer', kind: 'company', name: 'Cit Rec FR', email: `cit-rf-${process.pid}@example.com`, citizenship: 'Vietnam', country: 'France' });
  const users = db().users;
  const c = users.find((u) => u.id === cand.body.user.id);
  assert.equal(c.nationality, 'France'); assert.deepEqual(c.citizenship, ['France']);
  // Premium starts without asking again: the citizenship is already on the profile.
  assert.equal((await call('POST', '/api/premium/trial', {}, cand.session)).status, 200);
  const r1 = users.find((u) => u.id === recNoCountry.body.user.id);
  assert.equal(r1.nationality, 'Vietnam');
  const m1 = (await call('GET', `/api/bootstrap?userId=${r1.id}`, undefined, recNoCountry.session)).body.billing.methods;
  assert.ok(m1.includes('payos'), `no company country: Vietnamese citizenship gives VietQR (${m1})`);
  const m2 = (await call('GET', `/api/bootstrap?userId=${recFr.body.user.id}`, undefined, recFr.session)).body.billing.methods;
  assert.ok(!m2.includes('payos'), `a French company is not offered VietQR, whatever the citizenship (${m2})`);
});

test('PayPal: one plan id per price, with the old single id as fallback', () => {
  const keep = { ...process.env };
  Object.assign(process.env, { PAYPAL_CLIENT_ID: 'c', PAYPAL_CLIENT_SECRET: 's', PAYPAL_PLAN_ID_SOLO: 'P-SOLO', PAYPAL_PLAN_ID: 'P-ANY' });
  assert.equal(planId('solo'), 'P-SOLO');
  assert.equal(planId('duo'), 'P-ANY');
  assert.equal(isPaypalConfigured('trio'), true);
  delete process.env.PAYPAL_PLAN_ID;
  assert.equal(isPaypalConfigured('duo'), false, 'no plan id for Duo, no fallback');
  assert.equal(isPaypalConfigured(), true, 'some plan is configured');
  for (const k of ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'PAYPAL_PLAN_ID_SOLO']) { if (keep[k] === undefined) delete process.env[k]; else process.env[k] = keep[k]; }
});
