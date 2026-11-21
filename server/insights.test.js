import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, unlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildReport, parsePayload, readEvents, recordEvents } from './web-analytics.js';
import { forwardEvent, maskedConfig, sendTo, setIntegrationConfig } from './integrations.js';

test('tracker payload: valid batches pass, junk is dropped', () => {
  assert.equal(parsePayload(null), null);
  assert.equal(parsePayload({ sid: 'BAD!', w: 1000, events: [{ t: 'view', path: '/' }] }), null);
  const p = parsePayload({ sid: 'abcdefgh12', w: 1440, src: 'linkedin.com', events: [{ t: 'view', path: '/' }, { t: 'click', path: '/', x: 10, y: 20, sel: 'body>main', ox: 2, oy: -1 }, { t: 'stat', path: '/', dur: 30, depth: 80 }, { t: 'view', path: 'no-slash' }] });
  assert.equal(p.events.length, 3);
  assert.deepEqual([p.events[1].ox, p.events[1].oy], [1, 0], 'offsets clamped to 0..1');
});

test('record → read → report: visitors, pages, devices, clicks; no IP stored', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'jm-web-'));
  try {
    const now = Date.now();
    await recordEvents(dir, parsePayload({ sid: 'session0001', w: 1440, events: [{ t: 'view', path: '/' }, { t: 'click', path: '/', x: 5, y: 5, sel: '#cta', ox: 0.5, oy: 0.5 }] }), { ip: '1.2.3.4', ua: 'Mozilla', now });
    await recordEvents(dir, parsePayload({ sid: 'session0002', w: 390, events: [{ t: 'view', path: '/app/home' }] }), { ip: '5.6.7.8', ua: 'Mozilla', now });
    const events = await readEvents(dir, now - 1000, now);
    assert.ok(!JSON.stringify(events).includes('1.2.3.4'), 'no raw IP on disk');
    const r = buildReport(events, 7, now);
    assert.equal(r.totals.visitors, 2);
    assert.equal(r.totals.visits, 2);
    assert.deepEqual(r.devices.map((d) => d.key).sort(), ['desktop', 'mobile']);
    assert.equal(r.clicks.length, 1);
    assert.equal(r.daily.length, 7);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('integrations: keys are masked, payloads are anonymous, demo events never leave', async () => {
  const masked = maskedConfig({ mixpanel: { token: 'abcd1234wxyz', enabled: true } });
  assert.equal(masked.mixpanel.keyHint, '…wxyz');
  assert.ok(!JSON.stringify(masked).includes('abcd1234'), 'full key never returned');
  assert.equal(masked.amplitude.enabled, false);
  const calls = [];
  const fakeFetch = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return { ok: true, status: 200 }; };
  for (const vendor of ['mixpanel', 'amplitude', 'heap']) assert.equal((await sendTo(vendor, 'key123', { name: 'match_created', dim: 'team', side: 'team' }, { fetchImpl: fakeFetch })).ok, true);
  assert.match(calls[0].url, /mixpanel/); assert.match(calls[1].url, /amplitude/); assert.match(calls[2].url, /heap/);
  assert.equal(calls[0].body[0].event, 'match_created');
  assert.ok(!JSON.stringify(calls).match(/email|name":"[A-Z]/), 'no personal data');
  const failing = await sendTo('heap', 'k', { name: 'x' }, { fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal(failing.ok, false);
  setIntegrationConfig({ mixpanel: { token: 'k', enabled: true } });
  let sent = 0;
  forwardEvent('swipe', { demo: true }, () => { sent += 1; });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(sent, 0, 'demo activity is never forwarded');
  setIntegrationConfig({});
});

// --- routes ---
const DB_PATH = `/tmp/jobmatch-insights-test-${process.pid}.json`;
const ANALYTICS_DIR = mkdtempSync(path.join(os.tmpdir(), 'jm-an-'));
let server; let base;
async function call(method, p, body, headers = {}) {
  if (!base) {
    process.env.NODE_ENV = 'test'; process.env.DB_PATH = DB_PATH; process.env.ANALYTICS_DIR = ANALYTICS_DIR;
    const { app } = await import('./index.js');
    server = app.listen(0); await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${server.address().port}`;
  }
  const res = await fetch(`${base}${p}`, { method, headers: { 'Content-Type': 'text/plain', 'User-Agent': 'Mozilla/5.0', ...headers }, body });
  return { status: res.status };
}
after(() => { server?.close(); try { unlinkSync(DB_PATH); } catch { /* gone */ } rmSync(ANALYTICS_DIR, { recursive: true, force: true }); });

test('POST /api/track accepts a beacon, ignores bots, rejects junk; admin routes need an admin', async () => {
  assert.equal((await call('POST', '/api/track', JSON.stringify({ sid: 'abcdefgh12', w: 1200, events: [{ t: 'view', path: '/' }] }))).status, 204);
  assert.equal((await call('POST', '/api/track', 'not json')).status, 400);
  assert.equal((await call('POST', '/api/track', 'x', { 'User-Agent': 'Googlebot' })).status, 204);
  for (const p of ['/api/admin/kpis', '/api/admin/web-analytics', '/api/admin/integrations']) {
    const r = await call('GET', p);
    assert.ok(r.status === 401 || r.status === 403, `${p} is admin-only (${r.status})`);
  }
  const put = await call('PUT', '/api/admin/integrations/mixpanel', JSON.stringify({ key: 'x' }), { 'Content-Type': 'application/json' });
  assert.ok(put.status === 401 || put.status === 403);
});
