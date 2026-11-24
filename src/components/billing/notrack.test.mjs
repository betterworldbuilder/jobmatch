// "Don't count this device" (founder, 2026-11-24): saved on the device; ?notrack=1/0; nothing sent while on.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTsx } from '../../test-utils/loadTsx.mjs';

const store = new Map();
const sent = [];
globalThis.window = {
  localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
  sessionStorage: { getItem: () => null, setItem: () => undefined },
  location: { search: '', href: 'https://jobsmatchnow.com/', host: 'jobsmatchnow.com' },
  innerWidth: 390, innerHeight: 844, scrollY: 0,
  addEventListener: () => undefined, setInterval: () => 0, setTimeout: () => 0,
};
globalThis.window.self = globalThis.window; globalThis.window.top = globalThis.window;
Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'Mozilla/5.0 (Linux; Android 14) Mobile', sendBeacon: (_u, b) => { sent.push(b); return true; } }, configurable: true });
globalThis.document = { referrer: '', visibilityState: 'visible', addEventListener: () => undefined, documentElement: { scrollHeight: 2000 }, querySelector: () => null, createElement: () => ({ setAttribute() {}, remove() {} }), body: { appendChild() {} } };

const { mod } = await loadTsx(new URL('../../lib/tracker.ts', import.meta.url));

test('a device is counted by default; ?notrack=1 switches it off, ?notrack=0 back on', () => {
  assert.equal(mod.deviceNotCounted(), false);
  mod.applyNoTrackParam('?notrack=1');
  assert.equal(mod.deviceNotCounted(), true);
  assert.equal(store.get('jm-notrack'), '1', 'saved on the device');
  mod.applyNoTrackParam('?notrack=0');
  assert.equal(mod.deviceNotCounted(), false);
  mod.applyNoTrackParam('?other=1');
  assert.equal(mod.deviceNotCounted(), false, 'other params change nothing');
});

test('while switched off, page views send nothing; switched on again, they are sent', () => {
  mod.setDeviceNotCounted(true);
  mod.trackView('/app/match');
  assert.equal(sent.length, 0, 'nothing sent from a device that is not counted');
  mod.setDeviceNotCounted(false);
  mod.trackView('/app/home');
  assert.equal(sent.length, 1, 'counted again');
});
