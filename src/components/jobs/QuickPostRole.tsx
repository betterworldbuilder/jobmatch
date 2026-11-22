import { useMemo, useState } from 'react';
import { ArrowLeft, Check, Loader2 } from 'lucide-react';
import { api } from '../../api';
import { Field, Segmented, TagInput, TextInput } from '../profile/fields';
import type { Person } from '../../types';

/**
 * "Post a real role" — one screen, the fields a hiring team needs to go live
 * in the candidate deck. Publishes straight to `active` via the same
 * POST /api/jobs (strict server-side validation) as the full JobEditor; every
 * optional card field can be added later from "Edit role".
 */
const WORK_MODES = ['Remote', 'Hybrid', 'On-site'] as const;
const CURRENCIES = ['USD', 'EUR', 'GBP', 'VND', 'SGD', 'AUD'] as const;
const DESCRIPTION_MAX = 600;
const DEFAULT_RADIUS_KM = 40;

type QuickForm = {
  title: string; salaryMin: string; salaryMax: string; currency: string;
  location: string; workMode?: typeof WORK_MODES[number]; skills: string[]; description: string;
  niceToHaves: string[]; languages: string[]; fullDescription: string;
};

export function quickPostErrors(form: QuickForm): string[] {
  const errors: string[] = [];
  if (!form.title.trim()) errors.push('Job title is required');
  const min = Number(form.salaryMin); const max = Number(form.salaryMax);
  if (form.salaryMin === '' || form.salaryMax === '') errors.push('Salary range is required — salary up front is how JobsMatchNow works');
  else if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max <= 0) errors.push('Enter a real salary range');
  else if (min > max) errors.push('Salary min cannot exceed max');
  if (!form.location.trim()) errors.push('City / location is required');
  if (!form.workMode) errors.push('Choose remote, hybrid, or on-site');
  if (form.skills.length < 1) errors.push('Add at least 1 must-have skill');
  if (form.niceToHaves.length < 1) errors.push('Add at least 1 nice-to-have skill');
  if (form.languages.length < 1) errors.push('Add at least 1 language');
  if (!form.description.trim() && !form.fullDescription.trim()) errors.push('Paste the job description or add a short summary');
  else if (form.description.length > DESCRIPTION_MAX) errors.push(`Keep the description under ${DESCRIPTION_MAX} characters`);
  return errors;
}

export function QuickPostRole({ viewer, onPosted, onCancel }: { viewer: Person; onPosted: () => void; onCancel: () => void }) {
  const [form, setForm] = useState<QuickForm>({ title: '', salaryMin: '', salaryMax: '', currency: 'USD', location: '', workMode: undefined, skills: [], description: '', niceToHaves: [], languages: ['English'], fullDescription: '' });
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const patch = (changes: Partial<QuickForm>) => setForm((current) => ({ ...current, ...changes }));
  const errors = useMemo(() => quickPostErrors(form), [form]);

  const submit = async () => {
    setAttempted(true);
    if (errors.length) return;
    setSaving(true); setError('');
    try {
      await api.createJob({
        employerId: viewer.id, postSource: 'quick_post', status: 'active', type: 'Full-time',
        title: form.title.trim(), location: form.location.trim(), workMode: form.workMode,
        ...(form.workMode === 'Remote' ? { remoteScope: 'worldwide' as const } : { hiringRadiusKm: DEFAULT_RADIUS_KM }),
        salaryRange: { min: Number(form.salaryMin), max: Number(form.salaryMax), currency: form.currency },
        requiredSkillsDetail: form.skills.map((name) => ({ name, weight: 2 })),
        niceToHaves: form.niceToHaves, requiredLanguages: form.languages,
        ...(form.description.trim() ? { description: form.description.trim() } : {}),
        ...(form.fullDescription.trim() ? { fullDescription: form.fullDescription.trim() } : {}),
      });
      onPosted();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not post this role'); }
    finally { setSaving(false); }
  };

  return <div className="wizard-page">
    <div className="wizard-card job-editor">
      <header className="wz-head">
        <div><span className="overline">Post a real role</span><h1>Go live in the candidate deck</h1></div>
        <button className="secondary-button" onClick={onCancel}><ArrowLeft size={15} /> Back to jobs</button>
      </header>
      <div className="wz-body">
        <Field label="Job title" required><TextInput value={form.title} maxLength={140} onChange={(e) => patch({ title: e.target.value })} placeholder="e.g. Senior React Engineer" /></Field>
        <Field label="Salary range" required hint="Salary up front. Candidates see a fit badge pre-match; the exact range is revealed after a mutual match.">
          <div className="wz-salary">
            <TextInput type="number" min={0} placeholder="Min" value={form.salaryMin} onChange={(e) => patch({ salaryMin: e.target.value })} aria-label="Salary minimum" />
            <span>–</span>
            <TextInput type="number" min={0} placeholder="Max" value={form.salaryMax} onChange={(e) => patch({ salaryMax: e.target.value })} aria-label="Salary maximum" />
            <select className="wz-input wz-select" value={form.currency} onChange={(e) => patch({ currency: e.target.value })} aria-label="Currency">{CURRENCIES.map((currency) => <option key={currency}>{currency}</option>)}</select>
          </div>
        </Field>
        <div className="wz-row">
          <Field label="City / location" required hint="Shown as a city. Candidates only ever see a distance range, never an address."><TextInput value={form.location} maxLength={120} onChange={(e) => patch({ location: e.target.value })} placeholder="e.g. Ho Chi Minh City" /></Field>
          <Field label="Work mode" required><Segmented options={WORK_MODES} value={form.workMode} onChange={(workMode) => patch({ workMode })} /></Field>
        </div>
        <Field label="Must have" required hint="Press Enter after each. These drive the fit score."><TagInput value={form.skills} onChange={(skills) => patch({ skills: skills.slice(0, 15) })} placeholder="e.g. React — press Enter" /></Field>
        <div className="wz-row">
          <Field label="Nice to have" required><TagInput value={form.niceToHaves} onChange={(niceToHaves) => patch({ niceToHaves: niceToHaves.slice(0, 15) })} placeholder="e.g. GraphQL — press Enter" /></Field>
          <Field label="Languages" required><TagInput value={form.languages} onChange={(languages) => patch({ languages: languages.slice(0, 8) })} placeholder="e.g. English — press Enter" /></Field>
        </div>
        <Field label="Role details — paste the full job description" hint="Shown as-is in the Role details card. Optional here if you write a short summary below.">
          <textarea className="wz-input wz-textarea jd-paste" rows={10} maxLength={20000} value={form.fullDescription} onChange={(e) => patch({ fullDescription: e.target.value })} placeholder="Paste the whole job description…" aria-label="Full job description" />
        </Field>
        <Field label={`Short summary (${form.description.length}/${DESCRIPTION_MAX})`} hint="For the swipe card. Leave empty to use the first paragraph of the job description.">
          <textarea className="wz-input wz-textarea" rows={3} maxLength={DESCRIPTION_MAX} value={form.description} onChange={(e) => patch({ description: e.target.value })} placeholder="What the role is and why it matters, in 2–3 sentences." />
        </Field>
      </div>
      {(attempted && errors.length > 0) && <ul className="wz-errors">{errors.map((message) => <li key={message}>{message}</li>)}</ul>}
      {error && <p className="auth-error">{error}</p>}
      <footer className="wz-foot">
        <button className="secondary-button" onClick={onCancel}>Cancel</button>
        <div className="wz-foot-actions">
          <button className="primary-button" onClick={submit} disabled={saving}>{saving ? <Loader2 size={16} className="spin" /> : <><Check size={16} /> Post role</>}</button>
        </div>
      </footer>
    </div>
  </div>;
}
