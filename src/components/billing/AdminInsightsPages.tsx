// Admin: KPI dashboard (3 numbers that matter), visitor traffic + click heatmap,
// and Mixpanel / Amplitude / Heap integrations (server-side event forwarding).
import { useEffect, useState } from 'react';
import { Briefcase, Check, HeartHandshake, Loader2, Send, UserPlus } from 'lucide-react';
import { api } from '../../api';
import type { AdminKpi, IntegrationStatus, WebAnalyticsReport } from '../../types';
import { Heatmap } from './Heatmap';

const KPI_ICON = { registrations: UserPlus, matches: HeartHandshake, hires: Briefcase } as const;

function Bars({ weeks }: { weeks: { week: string; n: number }[] }) {
  const max = Math.max(1, ...weeks.map((w) => w.n));
  return <div className="kpi-bars" role="img" aria-label={`Last 8 weeks: ${weeks.map((w) => w.n).join(', ')}`}>
    {weeks.map((w) => <span key={w.week} title={`Week of ${w.week}: ${w.n}`} style={{ height: `${Math.max(4, (w.n / max) * 100)}%` }} />)}
  </div>;
}

type CountBar = { key: string; title: string; n: number; current?: boolean; future?: boolean; label?: string };

/** Bar chart with the exact count printed above every non-zero bar. */
function CountBars({ bars, dense }: { bars: CountBar[]; dense: boolean }) {
  const max = Math.max(1, ...bars.map((b) => b.n));
  const axis = bars.some((b) => b.label !== undefined);
  return <>
    <div className={`an-daily${dense ? ' an-daily-dense' : ''}`} role="img" aria-label={bars.map((b) => `${b.title}`).join('; ')}>
      {bars.map((b) => <div key={b.key} className={`an-day${b.current ? ' is-current' : ''}${b.future ? ' is-future' : ''}`} title={b.title}>
        {b.n > 0 && <em className="an-day-n">{b.n}</em>}
        <span style={{ height: `${b.n ? Math.max(4, (b.n / max) * 100) : 2}%` }} />
      </div>)}
    </div>
    {axis && <div className="an-axis" aria-hidden="true">{bars.map((b) => <span key={b.key}>{b.label}</span>)}</div>}
  </>;
}

function delta(a: number, b: number) {
  if (!b) return a ? 'new this week' : 'no change';
  const pct = Math.round(((a - b) / b) * 100);
  return `${pct >= 0 ? '+' : ''}${pct}% vs last week`;
}

export function AdminKpisPage() {
  const [kpis, setKpis] = useState<Record<string, AdminKpi> | null>(null);
  useEffect(() => { api.adminKpis().then(setKpis).catch(() => undefined); }, []);
  if (!kpis) return <div className="page"><Loader2 className="spin" size={20} /></div>;
  return <div className="page admin-kpi-page">
    <div className="page-title"><div><span className="overline">Admin</span><h1>KPI dashboard</h1><p>The 3 numbers that show whether the marketplace works. Real accounts only — demo and sample data excluded.</p></div></div>
    <div className="kpi-grid">
      {(['registrations', 'matches', 'hires'] as const).map((id) => { const k = kpis[id]; const Icon = KPI_ICON[id]; return <article className={`kpi-card kpi-${id}`} key={id}>
        <header><Icon size={18} /><strong>{k.label}</strong></header>
        <div className="kpi-value">{k.thisWeek}<small>this week</small></div>
        <p className="kpi-delta">{delta(k.thisWeek, k.lastWeek)}</p>
        <Bars weeks={k.weeks} />
        <dl><div><dt>Last 30 days</dt><dd>{k.last30d}</dd></div><div><dt>All time</dt><dd>{k.total}</dd></div></dl>
        <p className="kpi-hint">{k.hint}</p>
      </article>; })}
    </div>
  </div>;
}

export function AdminTrafficPage() {
  const [days, setDays] = useState(30);
  const [report, setReport] = useState<WebAnalyticsReport | null>(null);
  useEffect(() => { setReport(null); api.adminWebAnalytics(days).then(setReport).catch(() => undefined); }, [days]);
  return <div className="page admin-traffic-page">
    <div className="page-title"><div><span className="overline">Admin</span><h1>Traffic &amp; heatmap</h1><p>Self-hosted and cookie-free: no IP stored, visitors counted with a hash that changes daily.</p></div>
      <div className="heatmap-layouts">{[1, 7, 30, 90].map((d) => <button key={d} type="button" className={d === days ? 'primary-button small' : 'secondary-button small'} onClick={() => setDays(d)}>{d === 1 ? 'Today' : `${d} days`}</button>)}</div></div>
    {!report ? <Loader2 className="spin" size={20} /> : <>
      <div className="admin-stat-row">
        <div className="admin-stat"><strong>{report.totals.visitors}</strong><span>Unique visitors (per day)</span></div>
        <div className="admin-stat"><strong>{report.totals.visits}</strong><span>Visits</span></div>
        <div className="admin-stat"><strong>{report.totals.pageviews}</strong><span>Page views</span></div>
        <div className="admin-stat"><strong>{Math.floor(report.totals.avgDur / 60)}m {report.totals.avgDur % 60}s</strong><span>Average active time per page</span></div>
      </div>
      {report.hourly ? <section className="admin-section">
        <h3>Visits today by hour <small className="muted">(Vietnam time)</small></h3>
        <p className="muted an-today-note">{report.totals.visits} visits so far today · peak {Math.max(0, ...report.hourly.map((h) => h.n))} / hour</p>
        <CountBars dense={false} bars={report.hourly.map((h) => ({ key: String(h.hour), title: `${String(h.hour).padStart(2, '0')}:00–${String(h.hour).padStart(2, '0')}:59: ${h.n} visits`, n: h.n, current: h.hour === report.currentHour, future: report.currentHour !== undefined && h.hour > report.currentHour, label: h.hour % 3 === 0 ? `${String(h.hour).padStart(2, '0')}h` : '' }))} />
      </section> : <section className="admin-section"><h3>Visits per day <small className="muted">(Vietnam time)</small></h3>
        <CountBars dense={days >= 90} bars={report.daily.map((d) => ({ key: d.day, title: `${d.day}: ${d.n} visits`, n: d.n }))} />
      </section>}
      <div className="traffic-tables">
        {([['Top pages', report.pages], ['Sources', report.sources], ['Devices', report.devices]] as const).map(([title, rows]) => <section className="admin-section" key={title}>
          <h3>{title}</h3>
          {rows.length ? <table className="admin-table"><tbody>{rows.map((r) => <tr key={r.key}><td>{r.key}</td><td>{r.n}</td></tr>)}</tbody></table> : <p className="muted">No data yet.</p>}
        </section>)}
      </div>
      <section className="admin-section"><h3>Click heatmap</h3><Heatmap clicks={report.clicks} /></section>
    </>}
  </div>;
}

export function AdminIntegrationsPage() {
  const [items, setItems] = useState<Record<string, IntegrationStatus> | null>(null);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  useEffect(() => { api.adminIntegrations().then((r) => setItems(r.integrations)).catch(() => undefined); }, []);
  const save = async (id: string, payload: { key?: string; enabled?: boolean }) => {
    setBusy(id);
    try { const r = await api.adminSaveIntegration(id, payload); setItems(r.integrations); setKeys((k) => ({ ...k, [id]: '' })); setMsg((m) => ({ ...m, [id]: 'Saved.' })); }
    catch (e) { setMsg((m) => ({ ...m, [id]: e instanceof Error ? e.message : 'Could not save' })); }
    finally { setBusy(''); }
  };
  const test = async (id: string) => {
    setBusy(id);
    try { const r = await api.adminTestIntegration(id); setMsg((m) => ({ ...m, [id]: r.ok ? 'Test event sent — check the live view in the tool.' : `Test failed: ${r.error}` })); }
    catch (e) { setMsg((m) => ({ ...m, [id]: e instanceof Error ? e.message : 'Test failed' })); }
    finally { setBusy(''); }
  };
  if (!items) return <div className="page"><Loader2 className="spin" size={20} /></div>;
  return <div className="page admin-integrations-page">
    <div className="page-title"><div><span className="overline">Admin</span><h1>Integrations</h1>
      <p>Send the funnel events (sign-up, role posted, swipe, match, first message) from our server to Mixpanel, Amplitude or Heap. No cookies, no script in visitors' browsers; only the event name, its category and side are sent, with a random id — no names, emails or messages. Demo activity is never sent.</p></div></div>
    <div className="integration-grid">
      {Object.entries(items).map(([id, it]) => <article className="integration-card" key={id}>
        <header><strong>{it.label}</strong><span className={it.enabled ? 'int-on' : 'int-off'}>{it.enabled ? 'On' : 'Off'}</span></header>
        <p className="muted">{it.hint}</p>
        <label className="int-field"><span>{it.hasKey ? `Key saved (${it.keyHint}) — paste a new one to replace` : 'Paste the key'}</span>
          <input type="password" autoComplete="off" value={keys[id] || ''} onChange={(e) => setKeys((k) => ({ ...k, [id]: e.target.value }))} placeholder={it.field} /></label>
        <div className="int-actions">
          <button type="button" className="primary-button small" disabled={busy === id || !(keys[id] || '').trim()} onClick={() => void save(id, { key: keys[id] })}><Check size={14} /> Save key</button>
          <button type="button" className="secondary-button small" disabled={busy === id || !it.hasKey} onClick={() => void save(id, { enabled: !it.enabled })}>{it.enabled ? 'Turn off' : 'Turn on'}</button>
          <button type="button" className="secondary-button small" disabled={busy === id || !it.hasKey} onClick={() => void test(id)}><Send size={14} /> Send test event</button>
        </div>
        {it.lastSentAt && <small className="muted">Last test OK: {new Date(it.lastSentAt).toLocaleString()}</small>}
        {it.lastError && <small className="auth-error">Last error: {it.lastError}</small>}
        {msg[id] && <small>{msg[id]}</small>}
      </article>)}
    </div>
  </div>;
}
