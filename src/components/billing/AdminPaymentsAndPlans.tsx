// Admin → Billing (founder, 2026-11-24):
// - "Payment methods": status, keys (stored encrypted, only the last 4 shown), Test connection, on/off, and the
//   region/country grid deciding which recruiters see each method.
// - Pricing editor: edit, add, stop selling and delete plans. Existing paying customers keep their price (the server
//   locks it); "Move to new price" is per customer, after telling them.
import { useEffect, useState } from 'react';
import { Check, Copy, Loader2, Plus, Trash2, X } from 'lucide-react';
import { api } from '../../api';
import type { AdminCatalog, AdminCatalogPlan, AdminPaymentMethods, AdminPlanInput } from '../../types';

const errText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

// ---------------------------------------------------------------------------------------------------------------
export function AdminPaymentMethodsPanel() {
  const [data, setData] = useState<AdminPaymentMethods | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});
  const [busy, setBusy] = useState('');
  const [tests, setTests] = useState<Record<string, { ok: boolean; message: string }>>({});
  const [error, setError] = useState('');
  useEffect(() => { api.adminPaymentMethods().then(setData).catch((e) => setError(errText(e, 'Could not load'))); }, []);
  if (!data) return error ? <p className="auth-error">{error}</p> : <Loader2 className="spin" size={18} />;

  const run = async (id: string, fn: () => Promise<AdminPaymentMethods>) => {
    setBusy(id); setError('');
    try { setData(await fn()); } catch (e) { setError(errText(e, 'Could not save')); } finally { setBusy(''); }
  };
  const zones = [...data.zones.regions, ...data.zones.countries];
  const providerOf = (p: string) => data.providers[p] || [];

  return <div className="apm">
    <p className="muted">Each method shows to a recruiter only when it is <b>switched on</b>, <b>set up</b> (keys or bank details), and <b>ticked</b> for their company's country or region. A country column beats its region. USDT can never be shown in Vietnam.</p>
    {error && <p className="auth-error">{error}</p>}

    <h4>Where each method is shown</h4>
    <div className="apm-grid-wrap"><table className="admin-table apm-grid">
      <thead><tr><th>Method</th><th>Status</th>{zones.map((z) => <th key={z} className={data.zones.countries.includes(z) ? 'apm-country' : ''}>{data.zones.labels[z]}</th>)}</tr></thead>
      <tbody>{data.methods.map((m) => <tr key={m.id}>
        <td><b>{m.label}</b><br /><small className="muted">{m.currency}{m.automatic ? ' · confirmed automatically' : ' · you confirm in Pending payments'}</small></td>
        <td>
          <span className={`apm-pill ${m.configured ? (m.enabled ? 'ok' : 'off') : 'no'}`}>{m.configured ? (m.enabled ? 'Ready' : 'Switched off') : 'Not set up'}</span>
          <label className="apm-switch"><input type="checkbox" checked={m.enabled} disabled={busy === m.id} onChange={(e) => run(m.id, () => api.adminSavePaymentMethod(m.id, { enabled: e.target.checked }))} /> On</label>
        </td>
        {zones.map((z) => {
          const locked = m.id === 'usdt' && z === 'VN';
          return <td key={z} className="apm-cell">
            <input type="checkbox" aria-label={`${m.label} in ${data.zones.labels[z]}`} checked={Boolean(m.grid[z])} disabled={locked || busy === m.id}
              title={locked ? 'Crypto is not a lawful means of payment in Vietnam' : ''}
              onChange={(e) => run(m.id, () => api.adminSavePaymentMethod(m.id, { grid: { [z]: e.target.checked } }))} />
          </td>;
        })}
      </tr>)}</tbody>
    </table></div>
    {!data.eurPricesSet.length && <p className="muted">SEPA Direct Debit, Bancontact and iDEAL need a <b>EUR price</b> on your plans (Pricing &amp; plans → Edit).</p>}

    <h4>Provider keys</h4>
    {(['payos', 'stripe', 'paypal'] as const).map((p) => {
      const method = data.methods.find((m) => m.provider === p);
      const draft = drafts[p] || {};
      return <section key={p} className="apm-provider">
        <header><b>{p === 'payos' ? 'payOS (VietQR, ZaloPay, MoMo)' : p === 'stripe' ? 'Stripe (card, Apple Pay, Google Pay, SEPA)' : 'PayPal'}</b>
          {method?.webhook && <span className="apm-webhook">Webhook: <code>{data.webhookBase}{method.webhook}</code>
            <button type="button" className="text-button" onClick={() => navigator.clipboard.writeText(`${data.webhookBase}${method.webhook}`).catch(() => undefined)}><Copy size={12} /> Copy</button></span>}
        </header>
        {providerOf(p).map((f) => <label key={f.field} className="apm-key">
          <span>{f.label} {f.set && <small className="muted">(saved, ends …{f.last4}{f.source === 'server file' ? ', from the server file' : ''})</small>}</span>
          <input type="password" autoComplete="off" value={draft[f.field] || ''} placeholder={f.set ? 'Leave empty to keep' : 'Paste here'}
            onChange={(e) => setDrafts({ ...drafts, [p]: { ...draft, [f.field]: e.target.value } })} />
        </label>)}
        <div className="apm-actions">
          <button type="button" className="primary-button small" disabled={busy === p || !Object.values(draft).some((v) => v.trim())}
            onClick={() => run(p, async () => { const r = await api.adminSaveProviderKeys(p, draft); setDrafts({ ...drafts, [p]: {} }); return r; })}>{busy === p ? <Loader2 size={14} className="spin" /> : 'Save keys'}</button>
          <button type="button" className="secondary-button small" disabled={busy === `test-${p}`}
            onClick={async () => { setBusy(`test-${p}`); try { setTests({ ...tests, [p]: await api.adminTestProvider(p) }); } catch (e) { setTests({ ...tests, [p]: { ok: false, message: errText(e, 'Test failed') } }); } finally { setBusy(''); } }}>Test connection</button>
          {tests[p] && <span className={tests[p].ok ? 'apm-ok' : 'apm-bad'}>{tests[p].ok ? <Check size={13} /> : <X size={13} />} {tests[p].message}</span>}
        </div>
        {p === 'paypal' && <p className="muted">Each plan's PayPal plan ID is set in Pricing &amp; plans → Edit. Set <code>PAYPAL_ENV=live</code> on the server for real payments.</p>}
      </section>;
    })}
    <p className="muted">Bank details (HSBC Vietnam, the SARL's IBAN for SEPA and wires) and the USDT wallet are in <b>Bank transfer instructions</b>.</p>
  </div>;
}

// ---------------------------------------------------------------------------------------------------------------
const toInput = (p?: AdminCatalogPlan): AdminPlanInput => ({
  display: p?.display || '', usd: p?.usd ?? '', vnd: p?.vnd ?? '', eur: p?.eur ?? '', seats: p?.seats ?? 1, liveJobSlots: p?.liveJobSlots ?? 5,
  monthlyMatchCap: p?.monthlyMatchCap ?? '', sellable: p ? p.sellable : true, order: p?.order ?? 50, tagline: p?.tagline || '', perks: p?.perks || [],
  paypalPlanId: p?.paypalPlanId || '', analytics: p?.analytics ?? true, atsExport: p?.atsExport ?? false, aiAssistant: p?.aiAssistant ?? true,
  outboundMessaging: p?.outboundMessaging ?? true, priorityPlacement: p?.priorityPlacement ?? false,
});

export function AdminPlanEditor() {
  const [catalog, setCatalog] = useState<AdminCatalog | null>(null);
  const [editing, setEditing] = useState<string | null>(null); // plan key, or 'new'
  const [form, setForm] = useState<AdminPlanInput>(toInput());
  const [newKey, setNewKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { api.adminCatalog().then(setCatalog).catch((e) => setError(errText(e, 'Could not load'))); }, []);
  if (!catalog) return error ? <p className="auth-error">{error}</p> : <Loader2 className="spin" size={18} />;

  const open = (p?: AdminCatalogPlan) => { setEditing(p ? p.key : 'new'); setForm(toInput(p)); setNewKey(''); setError(''); setNotice(''); };
  const set = (patch: Partial<AdminPlanInput>) => setForm({ ...form, ...patch });
  const current = catalog.plans.find((p) => p.key === editing);
  const priceChanged = current && (String(current.usd) !== String(form.usd) || String(current.vnd ?? '') !== String(form.vnd ?? '') || String(current.eur ?? '') !== String(form.eur ?? ''));

  const save = async () => {
    const key = editing === 'new' ? newKey.trim().toLowerCase() : editing!;
    if (priceChanged && current?.lockedCustomers !== undefined && !window.confirm(`Change the price of ${current.display}?\n\nNew customers pay the new price. The ${current.subscriptions} existing customer(s) on this plan keep the price they pay today; you can move each one later, after telling them.`)) return;
    setBusy(true); setError('');
    try {
      const r = await api.adminSavePlan(key, { ...form, vnd: form.vnd === '' ? null : form.vnd, eur: form.eur === '' ? null : form.eur, monthlyMatchCap: form.monthlyMatchCap === '' ? null : form.monthlyMatchCap });
      setCatalog(r); setEditing(null);
      setNotice(`Saved ${form.display}.${r.customersKeptTheirPrice ? ` ${r.customersKeptTheirPrice} existing customer(s) keep their current price.` : ''}`);
    } catch (e) { setError(errText(e, 'Could not save')); } finally { setBusy(false); }
  };
  const remove = async (p: AdminCatalogPlan) => {
    if (!window.confirm(`Delete ${p.display}? This cannot be undone.`)) return;
    setBusy(true); setError('');
    try { setCatalog(await api.adminDeletePlan(p.key)); setNotice(`Deleted ${p.display}.`); } catch (e) { setError(errText(e, 'Could not delete')); } finally { setBusy(false); }
  };
  const toggleSelling = async (p: AdminCatalogPlan) => {
    setBusy(true); setError('');
    try { setCatalog(await api.adminSavePlan(p.key, { sellable: !p.sellable })); setNotice(p.sellable ? `${p.display} is no longer sold. Existing customers keep it.` : `${p.display} is on sale again.`); }
    catch (e) { setError(errText(e, 'Could not save')); } finally { setBusy(false); }
  };

  return <div className="ape">
    {notice && <p className="ape-notice"><Check size={14} /> {notice}</p>}
    {error && <p className="auth-error">{error}</p>}
    {catalog.warnings.map((w) => <p key={w} className="ape-warning">⚠ {w}</p>)}
    <div className="apm-grid-wrap"><table className="admin-table">
      <thead><tr><th>Plan</th><th>USD / mo</th><th>VND / mo</th><th>EUR / mo</th><th>Seats</th><th>Live jobs</th><th>Customers</th><th>On sale</th><th /></tr></thead>
      <tbody>{catalog.plans.map((p) => <tr key={p.key} className={p.sellable ? '' : 'ape-off'}>
        <td><b>{p.display}</b><br /><small className="muted">{p.key}{p.custom ? ' · added' : ''}{p.builtIn ? ' · built in' : ''}</small></td>
        <td>{p.usd === 0 ? 'Free' : p.usd}</td><td>{p.vnd?.toLocaleString('en-US') ?? '—'}</td><td>{p.eur ?? '—'}</td>
        <td>{p.seats}</td><td>{p.liveJobSlots}</td>
        <td>{p.subscriptions}{p.lockedCustomers ? <small className="muted"> ({p.lockedCustomers} on an older price)</small> : null}</td>
        <td><button type="button" className="text-button" disabled={busy || p.builtIn && p.key === 'starter'} onClick={() => toggleSelling(p)}>{p.sellable ? 'Stop selling' : 'Sell again'}</button></td>
        <td className="ape-row-actions">
          <button type="button" className="secondary-button small" onClick={() => open(p)}>Edit</button>
          {!p.builtIn && !p.inUse && <button type="button" className="text-button" aria-label={`Delete ${p.display}`} onClick={() => remove(p)}><Trash2 size={14} /></button>}
        </td>
      </tr>)}</tbody>
    </table></div>
    <button type="button" className="secondary-button small" onClick={() => open()}><Plus size={14} /> Add a plan</button>

    {catalog.plans.some((p) => p.lockedList?.length) && <section className="ape-locked">
      <h4>Customers on an older price</h4>
      <p className="muted">They keep the price they bought. Tell a customer before moving them: EU rules require notice before a price change.</p>
      {catalog.plans.filter((p) => p.lockedList?.length).map((p) => <div key={p.key}>
        <b>{p.display}</b> (now USD {p.usd})
        <ul>{p.lockedList.map((c) => <li key={c.subscriptionId}>{c.name}: pays {Object.entries(c.prices).map(([cur, v]) => `${cur} ${v.toLocaleString('en-US')}`).join(' / ')}{' '}
          <RepriceButton subscriptionId={c.subscriptionId} onDone={() => api.adminCatalog().then(setCatalog).catch(() => undefined)} /></li>)}</ul>
      </div>)}
    </section>}

    {editing && <section className="ape-form" aria-label={editing === 'new' ? 'Add a plan' : `Edit ${current?.display}`}>
      <h4>{editing === 'new' ? 'Add a plan' : `Edit ${current?.display}`}</h4>
      {editing === 'new' && <label>Plan id (lowercase, e.g. agency)<input value={newKey} onChange={(e) => setNewKey(e.target.value)} maxLength={24} /></label>}
      <label>Name<input value={form.display} onChange={(e) => set({ display: e.target.value })} maxLength={40} /></label>
      <div className="ape-row">
        <label>USD / month<input inputMode="decimal" value={form.usd} onChange={(e) => set({ usd: e.target.value })} /></label>
        <label>VND / month (VietQR)<input inputMode="numeric" value={form.vnd ?? ''} onChange={(e) => set({ vnd: e.target.value })} placeholder="empty = none" /></label>
        <label>EUR / month (SEPA)<input inputMode="decimal" value={form.eur ?? ''} onChange={(e) => set({ eur: e.target.value })} placeholder="empty = none" /></label>
      </div>
      <div className="ape-row">
        <label>Recruiter seats<input inputMode="numeric" value={form.seats} onChange={(e) => set({ seats: e.target.value })} /></label>
        <label>Live jobs included<input inputMode="numeric" value={form.liveJobSlots} onChange={(e) => set({ liveJobSlots: e.target.value })} /></label>
        <label>Matches / month<input inputMode="numeric" value={form.monthlyMatchCap ?? ''} onChange={(e) => set({ monthlyMatchCap: e.target.value })} placeholder="empty = unlimited" /></label>
      </div>
      <label>Short line under the price<input value={form.tagline} onChange={(e) => set({ tagline: e.target.value })} maxLength={80} /></label>
      <label>What's included (one per line, up to 8)<textarea rows={4} value={form.perks.join('\n')} onChange={(e) => set({ perks: e.target.value.split('\n') })} /></label>
      <div className="ape-flags">
        {(['analytics', 'aiAssistant', 'outboundMessaging', 'atsExport', 'priorityPlacement'] as const).map((f) => <label key={f}><input type="checkbox" checked={Boolean(form[f])} onChange={(e) => set({ [f]: e.target.checked })} />
          {{ analytics: 'Analytics', aiAssistant: 'AI Hiring Assistant', outboundMessaging: 'Message first', atsExport: 'ATS export', priorityPlacement: 'Promoted placement' }[f]}</label>)}
        <label><input type="checkbox" checked={form.sellable} onChange={(e) => set({ sellable: e.target.checked })} /> On sale</label>
      </div>
      <div className="ape-row">
        <label>Display order<input inputMode="numeric" value={form.order} onChange={(e) => set({ order: e.target.value })} /></label>
        <label>PayPal plan ID<input value={form.paypalPlanId} onChange={(e) => set({ paypalPlanId: e.target.value.trim() })} placeholder="P-…" /></label>
      </div>
      {priceChanged && <p className="ape-warning">New customers will pay the new price. The {current?.subscriptions} existing customer(s) keep their current price. If you use PayPal, create a new PayPal plan at the new price and paste its ID above. Apple / Google store prices are changed in their consoles.</p>}
      <div className="apm-actions">
        <button type="button" className="primary-button small" disabled={busy} onClick={save}>{busy ? <Loader2 size={14} className="spin" /> : 'Save'}</button>
        <button type="button" className="secondary-button small" onClick={() => setEditing(null)}>Cancel</button>
      </div>
    </section>}
  </div>;
}

/** "Move to the new price" for one customer (shown in Plans & usage). */
export function RepriceButton({ subscriptionId, onDone }: { subscriptionId: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  return <button type="button" className="text-button" disabled={busy} onClick={async () => {
    if (!window.confirm('Move this customer to the current price? Tell them first: EU rules require notice before a price change.')) return;
    setBusy(true); try { await api.adminReprice(subscriptionId); onDone(); } catch (e) { alert(errText(e, 'Could not move')); } finally { setBusy(false); }
  }}>{busy ? <Loader2 size={13} className="spin" /> : 'Move to new price'}</button>;
}
