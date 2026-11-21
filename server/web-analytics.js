// Self-hosted, cookie-free visitor analytics + click heatmap (ported from the
// portfolio site). Events are appended as JSON lines to <dir>/YYYY-MM.jsonl, a
// folder outside git. No IP address is stored: unique visitors are a hash of
// IP + browser with a salt that changes every day, so it can't be traced back.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const MAX_FILE_BYTES = 100 * 1024 * 1024; // per month: a flood can't fill the disk
export const BOT_UA = /bot|crawl|spider|slurp|headless|preview|scrape|curl|wget|python|go-http|java\/|axios|node-fetch|lighthouse|monitor|uptime/i;

const str = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
const num = (v, min, max) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(max, Math.max(min, v))) : null);
const unit = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
const PATH = /^\/[^\s]{0,199}$/;

/** Validate a tracker batch; returns null when it isn't a valid payload. */
export function parsePayload(body) {
  if (!body || typeof body !== 'object') return null;
  if (!/^[a-z0-9]{8,32}$/.test(String(body.sid || ''))) return null;
  const w = num(body.w, 0, 20000);
  if (w === null || !Array.isArray(body.events) || !body.events.length || body.events.length > 100) return null;
  const events = [];
  for (const e of body.events) {
    if (!e || !PATH.test(String(e.path || ''))) continue;
    if (e.t === 'view') events.push({ t: 'view', path: e.path });
    else if (e.t === 'click') {
      const x = num(e.x, -1000, 200000); const y = num(e.y, -1000, 200000);
      if (x === null || y === null) continue;
      events.push({ t: 'click', path: e.path, x, y, sel: str(e.sel, 400), ox: unit(e.ox), oy: unit(e.oy), label: str(e.label, 80) });
    } else if (e.t === 'stat') {
      const dur = num(e.dur, 0, 86400); const depth = num(e.depth, 0, 100);
      if (dur === null || depth === null) continue;
      events.push({ t: 'stat', path: e.path, dur, depth });
    }
  }
  if (!events.length) return null;
  return { sid: body.sid, src: str(body.src, 100), w, events };
}

export function deviceFor(width) { return width && width < 768 ? 'mobile' : width && width < 1024 ? 'tablet' : 'desktop'; }

function visitorId(ip, ua, now, secret) {
  const day = new Date(now).toISOString().slice(0, 10);
  const salt = crypto.createHmac('sha256', secret || 'jobsmatchnow-analytics').update(day).digest();
  return crypto.createHash('sha256').update(salt).update(`${ip}|${ua}`).digest('base64url').slice(0, 16);
}

const monthKey = (ts) => new Date(ts).toISOString().slice(0, 7);

export async function recordEvents(dir, p, { ip, ua, secret, now = Date.now() }) {
  const dev = deviceFor(p.w);
  const lines = p.events.map((e) => (e.t === 'view'
    ? { ts: now, sid: p.sid, ...e, vid: visitorId(ip, ua, now, secret), src: p.src, dev }
    : { ts: now, sid: p.sid, ...e, dev, w: p.w }));
  await fs.promises.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${monthKey(now)}.jsonl`);
  const size = await fs.promises.stat(file).then((s) => s.size, () => 0);
  if (size > MAX_FILE_BYTES) return;
  await fs.promises.appendFile(file, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
}

export async function readEvents(dir, since, now = Date.now()) {
  const months = new Set();
  for (let d = new Date(since); d.getTime() <= now + 86400000; d.setUTCMonth(d.getUTCMonth() + 1, 1)) months.add(monthKey(d.getTime()));
  const out = [];
  for (const m of months) {
    const text = await fs.promises.readFile(path.join(dir, `${m}.jsonl`), 'utf8').catch(() => '');
    for (const line of text.split('\n')) {
      if (!line) continue;
      try { const e = JSON.parse(line); if (e.ts >= since) out.push(e); } catch { /* torn line */ }
    }
  }
  return out;
}

const top = (values, limit = 10) => [...values.reduce((m, v) => m.set(v, (m.get(v) || 0) + 1), new Map())]
  .map(([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n).slice(0, limit);

export function buildReport(events, days, now = Date.now()) {
  const sessions = new Map();
  const vids = new Set();
  const clicks = [];
  const pageViews = [];
  const dur = new Map();
  for (const e of events) {
    let s = sessions.get(e.sid);
    if (!s) { s = { start: e.ts, src: '', dev: 'desktop', pages: 0 }; sessions.set(e.sid, s); }
    s.start = Math.min(s.start, e.ts);
    if (e.t === 'view') { s.pages += 1; pageViews.push(e.path); vids.add(e.vid); if (e.src && !s.src) s.src = e.src; s.dev = e.dev; }
    else if (e.t === 'click') clicks.push({ path: e.path, dev: e.dev, w: e.w, x: e.x, y: e.y, sel: e.sel, ox: e.ox, oy: e.oy });
    else if (e.t === 'stat') { const k = `${e.sid} ${e.path}`; dur.set(k, Math.max(dur.get(k) || 0, e.dur)); }
  }
  const all = [...sessions.values()].filter((s) => s.pages);
  const dayMs = 86400000;
  const today = Math.floor(now / dayMs);
  const daily = Array.from({ length: days }, (_, i) => ({ day: new Date((today - (days - 1 - i)) * dayMs).toISOString().slice(0, 10), n: 0 }));
  for (const s of all) { const i = Math.floor(s.start / dayMs) - (today - (days - 1)); if (i >= 0 && i < days) daily[i].n += 1; }
  const durations = [...dur.values()].filter((d) => d > 0);
  return {
    days,
    totals: { visits: all.length, visitors: vids.size, pageviews: pageViews.length, avgDur: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0 },
    daily,
    sources: top(all.map((s) => s.src || 'Direct / unknown')),
    devices: top(all.map((s) => s.dev)),
    pages: top(pageViews),
    clicks: clicks.slice(-5000),
  };
}
