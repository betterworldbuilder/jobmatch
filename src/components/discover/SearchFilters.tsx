// "Search & Filters" (founder, 2026-11-24): opened by the Filter button in the phone bar (full-screen sheet) and
// shown inside the desktop Discover filter panel. One shared set of filters (filterStore) drives every deck.
// Candidates filter roles; recruiters filter candidates. No nationality filter for recruiters (discrimination
// law): they filter by right to work instead. Distance: candidates from home to the role, recruiters from the role.
import { useMemo, useState } from 'react';
import { Check, MapPin, Plus, RotateCcw, Search, SlidersHorizontal, X } from 'lucide-react';
import type { Bootstrap, Job, Person, Role } from '../../types';
import { ANY_DISTANCE_KM, DEFAULT_FILTERS, activeFilterCount, buildDeck, type DeckFilters } from './deckLogic';
import { useSharedFilters } from './filterStore';

const DISTANCES = [5, 10, 25, 50, ANY_DISTANCE_KM];
const MODES = ['Remote', 'Hybrid', 'On-site', 'Flexible'];
const TYPES = ['Full-time', 'Part-time', 'Contract', 'Freelance'];
const SCORES = [0, 50, 70, 85];
const LEVELS = [['', 'Any level'], ['intermediate', 'Intermediate+'], ['fluent', 'Fluent+'], ['native', 'Native']] as const;
const EXPERIENCE = [['', 'Any'], ['junior', 'Junior'], ['mid', 'Mid'], ['senior', 'Senior'], ['lead', 'Lead'], ['exec', 'Executive']] as const;

const uniq = (list: (string | undefined)[]) => [...new Set(list.map((s) => String(s || '').trim()).filter(Boolean))];
/** Most frequent values first. */
function topValues(list: (string | undefined)[], max: number) {
  const n = new Map<string, number>();
  for (const v of list) { const s = String(v || '').trim(); if (s) n.set(s, (n.get(s) || 0) + 1); }
  return [...n.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([s]) => s);
}

function Chips<T extends string | number>({ options, value, onPick, label }: { options: readonly (readonly [T, string])[]; value: T; onPick: (v: T) => void; label: string }) {
  return <div className="sf-chips" role="radiogroup" aria-label={label}>
    {options.map(([v, text]) => <button key={String(v)} type="button" role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onPick(v)}>{text}</button>)}
  </div>;
}

function MultiChips({ options, value, onChange, label, addPlaceholder }: { options: string[]; value: string[]; onChange: (v: string[]) => void; label: string; addPlaceholder?: string }) {
  const [draft, setDraft] = useState('');
  const has = (s: string) => value.some((v) => v.toLowerCase() === s.toLowerCase());
  const toggle = (s: string) => onChange(has(s) ? value.filter((v) => v.toLowerCase() !== s.toLowerCase()) : [...value, s]);
  const all = uniq([...value, ...options]);
  return <div>
    <div className="sf-chips" role="group" aria-label={label}>
      {all.map((s) => <button key={s} type="button" aria-pressed={has(s)} className={has(s) ? 'on' : ''} onClick={() => toggle(s)}>{has(s) && <Check size={13} />}{s}</button>)}
    </div>
    {addPlaceholder && <form className="sf-add" onSubmit={(e) => { e.preventDefault(); const s = draft.trim(); if (s && !has(s)) onChange([...value, s]); setDraft(''); }}>
      <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={addPlaceholder} aria-label={addPlaceholder} maxLength={40} />
      <button type="submit" aria-label="Add" disabled={!draft.trim()}><Plus size={15} /></button>
    </form>}
  </div>;
}

function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return <section className="sf-group"><h3>{title}</h3>{hint && <p className="sf-hint">{hint}</p>}{children}</section>;
}

type FieldsProps = { role: Role; data: Bootstrap; hideDistance?: boolean; hideSearch?: boolean };

/** The filter groups themselves (phone sheet and desktop panel). */
export function FilterFields({ role, data, hideDistance, hideSearch }: FieldsProps) {
  const [f, setF] = useSharedFilters(data.viewer.id, role);
  const set = (p: Partial<DeckFilters>) => setF((prev) => ({ ...prev, ...p }));
  const viewer = data.viewer;
  const candidate = role === 'candidate';
  const jobs = data.jobs as Job[]; const people = data.candidates as Person[];
  const places = useMemo(() => topValues(candidate ? jobs.flatMap((j) => [j.country, j.location?.split(',')[0]]) : people.flatMap((p) => [p.country, p.city || p.location?.split(',')[0]]), 8), [candidate, jobs, people]);
  const skills = useMemo(() => uniq([...(candidate ? viewer.skills || [] : []), ...topValues(candidate ? jobs.flatMap((j) => j.requiredSkills || []) : people.flatMap((p) => p.skills || []), 12)]).slice(0, 16), [candidate, viewer, jobs, people]);
  const languages = useMemo(() => uniq([...(candidate ? [...(viewer.languages || []), ...(viewer.languageDetail || []).map((l) => l.name)] : []), ...topValues(candidate ? jobs.flatMap((j) => j.requiredLanguages || []) : people.flatMap((p) => p.languages || []), 8)]).slice(0, 10), [candidate, viewer, jobs, people]);
  const noLocation = !viewer.geo && !viewer.city && !viewer.location;

  return <div className="sf-fields">
    {!hideSearch && <label className="sf-search"><Search size={17} /><input value={f.query} onChange={(e) => set({ query: e.target.value })} placeholder={candidate ? 'Search roles, companies, skills…' : 'Search talent by title, skills…'} aria-label="Search" />{f.query && <button type="button" onClick={() => set({ query: '' })} aria-label="Clear search"><X size={14} /></button>}</label>}

    {!hideDistance && <Group title={candidate ? 'Distance from the job' : 'Distance from your role'} hint={noLocation ? 'Add your city or allow location in your profile to filter by distance.' : candidate ? 'From your home area. Exact locations stay private.' : 'From your role’s location. Exact locations stay private.'}>
      <Chips label="Maximum distance" options={DISTANCES.map((d) => [d, d >= ANY_DISTANCE_KM ? 'Any' : `${d} km`] as const)} value={DISTANCES.includes(f.radius) ? f.radius : -1} onPick={(radius) => set({ radius })} />
      <input className="sf-range" type="range" min={5} max={ANY_DISTANCE_KM} step={5} value={f.radius} onChange={(e) => set({ radius: Number(e.target.value) })} aria-label="Maximum distance in kilometres" />
      <p className="sf-value"><MapPin size={13} /> {f.radius >= ANY_DISTANCE_KM ? 'Any distance' : `Within ${f.radius} km`}</p>
      {candidate && <label className="sf-switch"><input type="checkbox" checked={f.includeRemote !== false} onChange={(e) => set({ includeRemote: e.target.checked })} /> Include remote roles (any distance)</label>}
    </Group>}

    <Group title="Country or city">
      <div className="sf-chips">{places.map((p) => <button key={p} type="button" className={f.place?.toLowerCase() === p.toLowerCase() ? 'on' : ''} onClick={() => set({ place: f.place?.toLowerCase() === p.toLowerCase() ? '' : p })}>{p}</button>)}</div>
      <input className="sf-text" value={f.place || ''} onChange={(e) => set({ place: e.target.value })} placeholder="Type a country or city" aria-label="Country or city" maxLength={60} />
    </Group>

    <Group title={candidate ? 'Skills' : 'Must-have skills'} hint={candidate ? 'Roles that need any of these skills.' : 'Candidates who have all of these.'}>
      <MultiChips label="Skills" options={skills} value={f.skills || []} onChange={(v) => set({ skills: v })} addPlaceholder="Add a skill" />
    </Group>

    <Group title="Languages" hint={candidate ? 'Roles that only need languages you pick.' : 'Candidates who speak all of these.'}>
      <MultiChips label="Languages" options={languages} value={f.languages || []} onChange={(v) => set({ languages: v })} addPlaceholder="Add a language" />
      {!candidate && <Chips label="Minimum level" options={LEVELS} value={(f.minLanguageLevel || '') as typeof LEVELS[number][0]} onPick={(minLanguageLevel) => set({ minLanguageLevel })} />}
    </Group>

    {candidate
      ? <Group title="Visa and nationality" hint="Uses the role’s rule and the nationality in your profile.">
          <Chips label="Visa" options={[['', 'Any'], ['sponsorship', 'Offers visa sponsorship'], ['open', 'Open to my nationality']] as const} value={(f.visa || '') as '' | 'sponsorship' | 'open'} onPick={(visa) => set({ visa })} />
        </Group>
      : <Group title="Right to work" hint="Filter by the right to work, never by nationality.">
          <input className="sf-text" value={f.rightToWork || ''} onChange={(e) => set({ rightToWork: e.target.value })} placeholder="Allowed to work in… (e.g. Vietnam)" aria-label="Allowed to work in country" maxLength={60} />
          <label className="sf-switch"><input type="checkbox" checked={Boolean(f.needsSponsorship)} onChange={(e) => set({ needsSponsorship: e.target.checked })} /> Only candidates who need visa sponsorship</label>
        </Group>}

    {candidate && <Group title="Salary">
      <label className="sf-switch"><input type="checkbox" checked={Boolean(f.salaryFit)} onChange={(e) => set({ salaryFit: e.target.checked })} /> Only roles within or above my expected salary</label>
    </Group>}

    {!candidate && <Group title="Experience">
      <Chips label="Experience" options={EXPERIENCE} value={(f.experience || '') as typeof EXPERIENCE[number][0]} onPick={(experience) => set({ experience })} />
    </Group>}

    {!candidate && <Group title="Availability and status">
      <Chips label="Availability" options={[['', 'Any time'], ['now', 'Available now'], ['month', 'Within a month']] as const} value={(f.availability || '') as '' | 'now' | 'month'} onPick={(availability) => set({ availability })} />
      <label className="sf-switch"><input type="checkbox" checked={Boolean(f.openToWork)} onChange={(e) => set({ openToWork: e.target.checked })} /> Only “Open to work”</label>
    </Group>}

    <Group title="Work mode">
      <Chips label="Work mode" options={[['', 'Any'], ...MODES.map((m) => [m, m] as const)]} value={f.filterMode} onPick={(filterMode) => set({ filterMode })} />
    </Group>
    <Group title="Job type">
      <Chips label="Job type" options={[['', 'Any'], ...TYPES.map((t) => [t, t] as const)]} value={f.filterType} onPick={(filterType) => set({ filterType })} />
    </Group>
    <Group title="Minimum fit">
      <Chips label="Minimum fit" options={SCORES.map((s) => [s, s ? `${s}%+` : 'Any'] as const)} value={f.minScore} onPick={(minScore) => set({ minScore })} />
    </Group>
  </div>;
}

/** What "Widen filters" would do next, when nothing matches. */
export function widenStep(f: DeckFilters): { label: string; next: DeckFilters } {
  if (f.radius < ANY_DISTANCE_KM) { const r = DISTANCES.find((d) => d > f.radius) ?? ANY_DISTANCE_KM; return { label: r >= ANY_DISTANCE_KM ? 'Any distance' : `Try ${r} km`, next: { ...f, radius: r } }; }
  if (f.minScore > 0) return { label: 'Any fit', next: { ...f, minScore: 0 } };
  return { label: 'Keep only the search', next: { ...DEFAULT_FILTERS, query: f.query } };
}

/** Full-screen phone sheet (Filter button). */
export function SearchFiltersSheet({ role, data, onClose, onShow }: { role: Role; data: Bootstrap; onClose: () => void; onShow: () => void }) {
  const [f, setF] = useSharedFilters(data.viewer.id, role);
  const items = (role === 'candidate' ? data.jobs : data.candidates) as (Job | Person)[];
  const count = buildDeck(role, items, f, data.viewer).filtered.length;
  const noun = role === 'candidate' ? (count === 1 ? 'role' : 'roles') : (count === 1 ? 'candidate' : 'candidates');
  const active = activeFilterCount(f);
  const widen = count === 0 ? widenStep(f) : null;
  return <section className="sf-sheet" role="dialog" aria-modal="true" aria-label="Search and filters">
    <header className="sf-head">
      <h2><SlidersHorizontal size={18} /> Search &amp; Filters</h2>
      <button type="button" className="sf-close" onClick={onClose} aria-label="Close filters"><X size={20} /></button>
    </header>
    <div className="sf-body"><FilterFields role={role} data={data} /></div>
    <footer className="sf-foot">
      {widen && <p className="sf-empty">No {role === 'candidate' ? 'roles' : 'candidates'} match these filters. <button type="button" onClick={() => setF(widen.next)}>{widen.label}</button></p>}
      <div className="sf-actions">
        <button type="button" className="sf-clear" disabled={!active} onClick={() => setF({ ...DEFAULT_FILTERS })}><RotateCcw size={15} /> Clear all</button>
        <button type="button" className="sf-show" onClick={onShow}>Show {count} {noun}</button>
      </div>
    </footer>
  </section>;
}
