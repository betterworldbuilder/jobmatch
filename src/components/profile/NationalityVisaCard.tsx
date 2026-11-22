// Profile side card: Nationality (one or more) and "Visa valid for" (countries), each picked by checkbox
// from the full country list, with search. Saved on the profile (citizenship / visaCountries). Never used
// in the match score; shown to recruiters on the "Who I am" card.
import { useMemo, useState } from 'react';
import { Check, ChevronDown, Flag, Loader2, Search, ShieldCheck } from 'lucide-react';
import { api } from '../../api';
import { COUNTRIES } from '../../lib/countries';
import type { Person } from '../../types';

function CountryChecklist({ label, icon, value, onChange, max }: { label: string; icon: React.ReactNode; value: string[]; onChange: (v: string[]) => void; max: number }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const list = useMemo(() => { const s = q.trim().toLowerCase(); return s ? COUNTRIES.filter((c) => c.toLowerCase().includes(s)) : COUNTRIES; }, [q]);
  const toggle = (c: string) => onChange(value.includes(c) ? value.filter((x) => x !== c) : value.length >= max ? value : [...value, c]);
  return <div className="nv-group">
    <button type="button" className="nv-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
      {icon}<span><strong>{label}</strong><small>{value.length ? value.join(', ') : 'None selected'}</small></span><ChevronDown size={16} className={open ? 'nv-chev open' : 'nv-chev'} />
    </button>
    {open && <div className="nv-panel">
      <label className="demo-search"><Search size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search countries" aria-label={`Search countries for ${label}`} /></label>
      <ul className="nv-list" role="group" aria-label={label}>{list.map((c) => <li key={c}><label className={value.includes(c) ? 'on' : ''}>
        <input type="checkbox" checked={value.includes(c)} onChange={() => toggle(c)} disabled={!value.includes(c) && value.length >= max} /> {c}</label></li>)}</ul>
      <small className="nv-max">Up to {max}.</small>
    </div>}
  </div>;
}

export function NationalityVisaCard({ viewer, onSaved }: { viewer: Person; onSaved: (v: Person) => void }) {
  const initialNat = viewer.citizenship?.length ? viewer.citizenship : (viewer.nationality ? [viewer.nationality] : []);
  const [nat, setNat] = useState<string[]>(initialNat);
  const [visa, setVisa] = useState<string[]>(viewer.visaCountries || []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const dirty = nat.join('|') !== initialNat.join('|') || visa.join('|') !== (viewer.visaCountries || []).join('|');
  const save = async () => {
    setBusy(true); setMsg('');
    try {
      const { user } = await api.updateProfile(viewer.id, { citizenship: nat, visaCountries: visa, ...(nat[0] ? { nationality: nat[0] } : {}) });
      onSaved(user); setMsg('Saved');
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not save'); }
    finally { setBusy(false); }
  };
  return <section className="nv-card">
    <header><strong>Nationality & visa</strong><small>Recruiters see this on your “Who I am” card. It never changes your match score.</small></header>
    <CountryChecklist label="Nationality (can be more than one)" icon={<Flag size={16} />} value={nat} onChange={setNat} max={5} />
    <CountryChecklist label="Visa valid for" icon={<ShieldCheck size={16} />} value={visa} onChange={setVisa} max={20} />
    <div className="nv-actions">
      <button type="button" className="primary-button small" onClick={() => void save()} disabled={!dirty || busy}>{busy ? <Loader2 size={14} className="spin" /> : <><Check size={14} /> Save</>}</button>
      {msg && <small role="status">{msg}</small>}
    </div>
  </section>;
}
