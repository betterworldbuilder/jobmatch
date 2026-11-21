// Status under the sidebar profile: Open to work · Waiting for offer · Hired! · Under contract until <date>.
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api } from '../api';
import type { Bootstrap } from '../types';

type Kind = 'open' | 'waiting' | 'hired' | 'contract';
export const JOB_STATUS_LABEL: Record<Kind, string> = { open: 'Open to work', waiting: 'Waiting for offer', hired: 'Hired!', contract: 'Under contract' };
const COLOR: Record<Kind, string> = { open: '#22c55e', waiting: '#f59e0b', hired: '#3ea6ff', contract: '#a78bfa' };

/** "Under contract till Mar 31, 2027". */
export function jobStatusText(s?: { kind: Kind; until?: string }) {
  if (!s) return JOB_STATUS_LABEL.open;
  if (s.kind === 'contract' && s.until) {
    const [y, m, d] = s.until.split('-').map(Number);
    return `Under contract till ${new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }
  return JOB_STATUS_LABEL[s.kind];
}

export function JobStatusPicker({ data, setData }: { data: Bootstrap; setData: (d: Bootstrap) => void }) {
  const current = data.viewer.jobStatus || { kind: data.viewer.privacy?.openToWork === false ? 'waiting' as Kind : 'open' as Kind };
  const [kind, setKind] = useState<Kind>(current.kind);
  const [until, setUntil] = useState(current.until || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async (k: Kind, u: string) => {
    if (k === 'contract' && !u) return; // wait for the date
    setBusy(true); setError('');
    const jobStatus = { kind: k, ...(k === 'contract' ? { until: u } : {}) };
    try {
      await api.updateProfile(data.viewer.id, { jobStatus });
      setData({ ...data, viewer: { ...data.viewer, jobStatus, privacy: { ...(data.viewer.privacy || {}), openToWork: k === 'open' } } });
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save'); }
    finally { setBusy(false); }
  };
  return <div className="job-status" style={{ ['--st' as string]: COLOR[kind] }}>
    <label><span className="js-label">Status</span>
      <span className="js-row"><i className="js-dot" aria-hidden="true" />
        <select value={kind} disabled={busy} aria-label="My job status" onChange={(e) => { const k = e.target.value as Kind; setKind(k); void save(k, until); }}>
          {(Object.keys(JOB_STATUS_LABEL) as Kind[]).map((k) => <option key={k} value={k}>{JOB_STATUS_LABEL[k]}</option>)}
        </select>
        {busy && <Loader2 size={13} className="spin" />}
      </span>
    </label>
    {kind === 'contract' && <label className="js-until"><span>till</span>
      <input type="date" value={until} onChange={(e) => { setUntil(e.target.value); void save('contract', e.target.value); }} aria-label="Contract end date" /></label>}
    {error && <small className="js-err">{error}</small>}
  </div>;
}
