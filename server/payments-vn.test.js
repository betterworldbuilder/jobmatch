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
  Object.assign(process.env, { NODE_ENV: 'test', DB_PATH, PAYOS_CLIENT_ID: 'cid', PAYOS_API_KEY: 'key', PAYOS_CHECKSUM_KEY: CHECKSUM, PAYOS_API_URL: `http://127.0.0.1:${fake.address().port}`, WEB_APP_URL: 'https://jobsmatchnow.com' });
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
  assert.equal((await call('POST', '/api/billing/payments', { userId: fr.id, paymentMethod: 'usdt_trc20', txHash: 'nope' }, fr.cookie)).status, 400, 'TxID must be 64 hex');
  const ok = await call('POST', '/api/billing/payments', { userId: fr.id, paymentMethod: 'usdt_trc20', txHash: tx }, fr.cookie);
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.equal(ok.body.currency, 'USDT'); assert.equal(ok.body.network, 'TRC-20'); assert.equal(ok.body.status, 'submitted'); assert.equal(ok.body.txHash, tx);
  assert.equal((await call('POST', '/api/billing/payments', { userId: fr.id, paymentMethod: 'usdt_trc20', txHash: tx.toUpperCase() }, fr.cookie)).status, 409, 'the same transaction cannot be used twice');
  delete process.env.BILLING_USDT_TRC20_ADDRESS;
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
