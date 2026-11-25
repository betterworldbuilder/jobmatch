import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ClipboardPaste, Download, Image as ImageIcon, Loader2, Sparkles, Upload } from 'lucide-react';
import { api, apiBase } from '../../api';
import { Chips, Field, LevelTagInput, Segmented, TagInput, TextInput, Toggle } from '../profile/fields';
import { demoAdapter, pasteAdapter } from '../../lib/jobSources';
import { samplePasteText } from '../../content/jobSamples';
import type { Job, JobDraft, Person, Seniority } from '../../types';
import { JobGroupsField, LinkedInTools } from '../groups/Groups';

const SENIORITY_LABELS = { junior: 'Junior', mid: 'Mid', senior: 'Senior', lead: 'Lead', exec: 'Exec' };
const EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Contract', 'Freelance', 'Internship'] as const;
const WORK_MODES = ['Remote', 'Hybrid', 'On-site', 'Flexible'] as const;
const CURRENCIES = ['USD', 'EUR', 'GBP', 'VND', 'SGD', 'AUD'] as const;
const STATUSES = ['draft', 'active', 'paused', 'filled'] as const;
const NATIONALITY_MODES = ['any', 'us', 'europe', 'custom'] as const;
export const NATIONALITY_LABEL = { any: 'Any nationality', us: 'US', europe: 'Europe', custom: 'Selected countries' } as const;
const MANAGEMENT_STYLE_SUGGESTIONS = ['Hands-off', 'Coaching', 'Directive', 'Data-driven', 'Servant leadership', 'Async-first'];
const TEAM_STYLE_SUGGESTIONS = ['Autonomous', 'Collaborative', 'Fast-paced', 'Structured', 'Async-first', 'Mentorship'];
const VALUES_SUGGESTIONS = ['Ownership', 'Transparency', 'Customer obsession', 'Craftsmanship', 'Diversity & inclusion', 'Sustainability', 'Speed', 'Quality'];

// The five wizard steps mirror the five job-profile cards candidates swipe through.
// The first three carry every must-have field; the last two are optional and skippable.
export const JOB_STEPS = ['Snapshot', 'Role details & skills', 'Compensation', 'Team & culture', 'Hiring process'] as const;
const JOB_REQUIRED_STEPS = 3;

type Form = {
  title: string; department: string; seniority?: Seniority; openings: string; urgency: string; deadline: string;
  requiredSkills: { name: string; level: number }[]; // level doubles as weight 1-3
  niceToHaves: string[]; requiredLanguages: string[]; successMeasures: string[];
  type?: string; workMode?: string; remoteScope: 'country' | 'worldwide'; country: string; location: string; hiringRadiusKm: number;
  salaryMin: string; salaryMax: string; currency: string; salaryNegotiable: boolean; bonus: string; equity: string;
  benefits: string[]; workingHours: string; flexibleHours: string; probation: string; hybridDays: number;
  visaSponsorship: boolean; relocationSupport: boolean; travel: string; onCall: string;
  workVisaRequired: '' | 'yes' | 'no'; natMode: typeof NATIONALITY_MODES[number]; natCustom: string[]; contractDuration: string;
  description: string; fullDescription: string; responsibilities: string[]; interviewProcess: string[]; startDate: string; externalUrl: string;
  status: typeof STATUSES[number]; screeningQuestions: string[];
  mission: string; culture: string[]; values: string[]; teamSize: string; teamComposition: string[]; teamLocations: string;
  managerName: string; managerTitle: string; managerStyle: string; managementStyleTags: string[]; teamStyle: string[]; teamSong: string;
  hiringTimeline: string; backgroundCheck: boolean; referenceCheck: boolean;
  jobGroups: string[];
};

const emptyForm = (): Form => ({
  title: '', department: '', seniority: undefined, openings: '', urgency: '', deadline: '',
  requiredSkills: [], niceToHaves: [], requiredLanguages: [], successMeasures: [], type: undefined,
  workMode: undefined, remoteScope: 'worldwide', country: '', location: '', hiringRadiusKm: 40,
  salaryMin: '', salaryMax: '', currency: 'USD', salaryNegotiable: false, bonus: '', equity: '',
  benefits: [], workingHours: '', flexibleHours: '', probation: '', hybridDays: 2,
  visaSponsorship: false, relocationSupport: false, travel: '', onCall: '',
  workVisaRequired: '', natMode: 'any', natCustom: [], contractDuration: '',
  description: '', fullDescription: '', responsibilities: [], interviewProcess: [], startDate: '', externalUrl: '', status: 'draft', screeningQuestions: [],
  mission: '', culture: [], values: [], teamSize: '', teamComposition: [], teamLocations: '',
  managerName: '', managerTitle: '', managerStyle: '', managementStyleTags: [], teamStyle: [], teamSong: '',
  hiringTimeline: '', backgroundCheck: false, referenceCheck: false,
  jobGroups: [],
});

function fromJob(job: Job): Form {
  return {
    ...emptyForm(),
    title: job.title, department: job.department || '', seniority: job.seniority || (job.experienceLevel as Seniority),
    openings: job.openings !== undefined ? String(job.openings) : '', urgency: job.urgency || '', deadline: job.deadline || '',
    requiredSkills: (job.requiredSkillsDetail || job.requiredSkills.map((name) => ({ name, weight: 2 }))).map((skill) => ({ name: skill.name, level: skill.weight })),
    niceToHaves: job.niceToHaves || [], requiredLanguages: job.requiredLanguages || [], successMeasures: job.successMeasures || [],
    type: job.type, workMode: job.workMode,
    remoteScope: job.remoteScope || 'worldwide', country: job.country || '', location: job.location,
    hiringRadiusKm: job.hiringRadiusKm ?? 40,
    salaryMin: job.salaryRange ? String(job.salaryRange.min) : '', salaryMax: job.salaryRange?.max != null ? String(job.salaryRange.max) : '',
    currency: job.salaryRange?.currency || 'USD', salaryNegotiable: job.salaryNegotiable ?? false, bonus: job.bonus || '', equity: job.equity || '',
    benefits: job.benefits || [], workingHours: job.workingHours || '', flexibleHours: job.flexibleHours || '', probation: job.probation || '',
    hybridDays: job.hybridDays ?? 2, visaSponsorship: job.visaSponsorship ?? false, relocationSupport: job.relocationSupport ?? false,
    workVisaRequired: job.workVisaRequired === undefined ? '' : job.workVisaRequired ? 'yes' : 'no',
    natMode: job.authorizedNationalities?.mode || 'any', natCustom: job.authorizedNationalities?.custom || [], contractDuration: job.contractDuration || '',
    travel: job.travel || '', onCall: job.onCall || '',
    description: job.description, fullDescription: job.fullDescription || '',
    responsibilities: job.responsibilities || [], interviewProcess: job.interviewProcess || [],
    startDate: job.startDate || '', externalUrl: job.externalUrl || '', status: (job.status as Form['status']) || 'draft',
    screeningQuestions: job.screeningQuestions || [],
    mission: job.mission || '', culture: job.culture || [], values: job.values || [], teamSize: job.teamSize || '',
    teamComposition: job.teamComposition || [], teamLocations: job.teamLocations || '',
    managerName: job.managerName || '', managerTitle: job.managerTitle || '', managerStyle: job.managerStyle || '',
    managementStyleTags: job.managementStyleTags || [], teamStyle: job.teamStyle || [], teamSong: job.teamSong || '',
    hiringTimeline: job.hiringTimeline || '', backgroundCheck: job.backgroundCheck ?? false, referenceCheck: job.referenceCheck ?? false,
    jobGroups: job.jobGroups || [],
  };
}

function applyDraft(form: Form, draft: JobDraft): Form {
  return {
    ...form,
    title: draft.title ?? form.title,
    department: draft.department ?? form.department,
    seniority: (draft.seniority as Seniority) ?? form.seniority,
    requiredSkills: draft.requiredSkillsDetail ? draft.requiredSkillsDetail.map((skill) => ({ name: skill.name, level: skill.weight })) : form.requiredSkills,
    niceToHaves: draft.niceToHaves ?? form.niceToHaves,
    requiredLanguages: draft.requiredLanguages?.length ? draft.requiredLanguages : form.requiredLanguages,
    fullDescription: draft.fullDescription ?? form.fullDescription,
    type: draft.type ?? form.type, workMode: draft.workMode ?? form.workMode,
    remoteScope: (draft.remoteScope as 'country' | 'worldwide') ?? form.remoteScope, country: draft.country ?? form.country,
    location: draft.location ?? form.location, hiringRadiusKm: draft.hiringRadiusKm ?? form.hiringRadiusKm,
    salaryMin: draft.salaryRange ? String(draft.salaryRange.min) : form.salaryMin,
    salaryMax: draft.salaryRange ? (draft.salaryRange.max != null ? String(draft.salaryRange.max) : '') : form.salaryMax,
    currency: draft.salaryRange?.currency ?? form.currency,
    description: draft.description ?? form.description,
    responsibilities: draft.responsibilities ?? form.responsibilities,
    interviewProcess: draft.interviewProcess ?? form.interviewProcess,
    startDate: draft.startDate ?? form.startDate, externalUrl: draft.externalUrl ?? form.externalUrl,
  };
}

function stepErrors(step: number, form: Form): string[] {
  const errors: string[] = [];
  if (step === 0) {
    if (!form.title.trim()) errors.push('Job title is required');
    if (!form.type) errors.push('Employment type is required');
    if (!form.workMode) errors.push('Work mode is required');
    if (!form.location.trim()) errors.push('Location is required');
    if (form.workMode === 'Remote' && form.remoteScope === 'country' && !form.country.trim()) errors.push('Enter the country for a country-restricted remote role');
  }
  if (step === 1) {
    if (!form.fullDescription.trim() && !form.description.trim()) errors.push('Paste the full job description in Role details');
    if (form.requiredSkills.length < 1) errors.push('Add at least 1 must-have skill');
    if (form.niceToHaves.length < 1) errors.push('Add at least 1 nice-to-have skill');
    if (form.requiredLanguages.length < 1) errors.push('Add at least 1 language');
  }
  if (step === 2) {
    // Salary is optional (founder, 2026-11-25); a minimum is advised. What is given must make sense.
    if (form.salaryMin === '' && form.salaryMax !== '') errors.push('Add a minimum salary (the maximum is optional)');
    else if (form.salaryMin !== '' && !(Number(form.salaryMin) > 0)) errors.push('Enter a minimum salary above 0');
    else if (form.salaryMin !== '' && form.salaryMax !== '' && Number(form.salaryMin) > Number(form.salaryMax)) errors.push('Salary min cannot exceed max');
  }
  return errors;
}

export function JobEditor({ viewer, job, onSaved, onCancel }: { viewer: Person; job?: Job; onSaved: () => void; onCancel: () => void }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>(() => (job ? fromJob(job) : emptyForm()));
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteUrl, setPasteUrl] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [importNote, setImportNote] = useState('');
  const [importing, setImporting] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string>(job?.coverImage ? `${apiBase}${job.coverImage}` : '');
  const [error, setError] = useState('');
  const patch = (changes: Partial<Form>) => setForm((current) => ({ ...current, ...changes }));
  const errors = useMemo(() => stepErrors(step, form), [step, form]);
  const finishing = step === JOB_STEPS.length - 1;

  const runImport = async (adapter: typeof pasteAdapter, input?: { url?: string; text?: string }) => {
    setImporting(true); setError('');
    try {
      const { draft, source } = await adapter.importDraft(input);
      // The pasted posting is kept whole as "Role details"; the parser only pre-fills the other fields.
      setForm((current) => applyDraft(current, { ...draft, ...(input?.text?.trim() ? { fullDescription: input.text.trim() } : {}) }));
      setImportNote(`${source} — review the fields below, then save.`);
      setPasteOpen(false);
    } catch (e) { setError(e instanceof Error ? e.message : 'Import failed'); }
    finally { setImporting(false); }
  };

  const importFromFile = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) { setError('File must be 10MB or smaller'); return; }
    setImporting(true); setError('');
    try {
      const { parser, parsed } = await api.parseJobFile(file);
      setForm((current) => applyDraft(current, parsed));
      setImportNote(`${parser === 'claude' ? 'AI-generated suggestions (Claude), please review' : 'Parsed from the uploaded file'} — review the fields below, then save.`);
      setPasteOpen(false);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not read that file'); }
    finally { setImporting(false); }
  };

  const save = async () => {
    setSaving(true); setError('');
    const payload: JobDraft = {
      title: form.title, department: form.department || undefined, seniority: form.seniority,
      openings: form.openings !== '' ? Number(form.openings) : undefined, urgency: form.urgency || undefined, deadline: form.deadline || undefined,
      requiredSkillsDetail: form.requiredSkills.map((skill) => ({ name: skill.name, weight: Math.min(skill.level, 3) })),
      niceToHaves: form.niceToHaves, requiredLanguages: form.requiredLanguages, successMeasures: form.successMeasures,
      type: form.type, workMode: form.workMode, location: form.location, contractDuration: form.contractDuration.trim() || undefined,
      ...(form.workMode === 'Remote'
        ? { remoteScope: form.remoteScope, country: form.remoteScope === 'country' ? form.country : undefined }
        : { hiringRadiusKm: form.hiringRadiusKm }),
      salaryRange: form.salaryMin === '' ? null : { min: Number(form.salaryMin), ...(form.salaryMax !== '' ? { max: Number(form.salaryMax) } : {}), currency: form.currency },
      salaryNegotiable: form.salaryNegotiable, bonus: form.bonus || undefined, equity: form.equity || undefined,
      benefits: form.benefits, workingHours: form.workingHours || undefined, flexibleHours: form.flexibleHours || undefined,
      probation: form.probation || undefined, hybridDays: form.workMode === 'Hybrid' ? form.hybridDays : undefined,
      visaSponsorship: form.visaSponsorship, relocationSupport: form.relocationSupport,
      ...(form.workVisaRequired ? { workVisaRequired: form.workVisaRequired === 'yes' } : {}),
      ...(form.workVisaRequired === 'no' ? { authorizedNationalities: { mode: form.natMode, ...(form.natMode === 'custom' ? { custom: form.natCustom } : {}) } } : {}),
      travel: form.travel || undefined, onCall: form.onCall || undefined,
      description: form.description.trim() || undefined, fullDescription: form.fullDescription, responsibilities: form.responsibilities, interviewProcess: form.interviewProcess,
      startDate: form.startDate || undefined, externalUrl: form.externalUrl || undefined, status: form.status,
      screeningQuestions: form.screeningQuestions,
      mission: form.mission || undefined, culture: form.culture, values: form.values, teamSize: form.teamSize || undefined,
      teamComposition: form.teamComposition, teamLocations: form.teamLocations || undefined,
      managerName: form.managerName || undefined, managerTitle: form.managerTitle || undefined, managerStyle: form.managerStyle || undefined,
      managementStyleTags: form.managementStyleTags, teamStyle: form.teamStyle, teamSong: form.teamSong || undefined,
      hiringTimeline: form.hiringTimeline || undefined, backgroundCheck: form.backgroundCheck, referenceCheck: form.referenceCheck,
      jobGroups: form.jobGroups,
    };
    try {
      let jobId = job?.id;
      if (job) await api.updateJob(job.id, payload);
      else { const { job: created } = await api.createJob({ ...payload, employerId: viewer.id }); jobId = created.id; }
      if (coverFile && jobId) await api.uploadJobCover(jobId, coverFile);
      onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed'); }
    finally { setSaving(false); }
  };

  const goNext = () => {
    setAttempted(true);
    if (errors.length) return;
    if (finishing) { save(); return; }
    setStep(step + 1); setAttempted(false);
  };

  return <div className="wizard-page">
    <div className="wizard-card job-editor">
      <header className="wz-head">
        <div><span className="overline">{step < JOB_REQUIRED_STEPS ? (job ? 'Edit job posting' : 'Create job posting') : 'Optional — add now or skip and edit later'}</span><h1>{JOB_STEPS[step]}</h1></div>
        <button className="secondary-button" onClick={onCancel}><ArrowLeft size={15} /> Back to jobs</button>
      </header>
      <div className="wz-progress" role="progressbar" aria-valuenow={step + 1} aria-valuemin={1} aria-valuemax={JOB_STEPS.length}><i style={{ width: `${((step + 1) / JOB_STEPS.length) * 100}%` }} /></div>
      <span className="wz-step-count">{step < JOB_REQUIRED_STEPS ? `Step ${step + 1} of ${JOB_REQUIRED_STEPS}` : `Optional ${step - JOB_REQUIRED_STEPS + 1} of ${JOB_STEPS.length - JOB_REQUIRED_STEPS}`}</span>

      {step === 0 && <div className="job-import-bar">
        <button className="secondary-button job-import-btn" onClick={() => setPasteOpen((value) => !value)} disabled={importing}><ClipboardPaste size={15} /> {pasteAdapter.label}</button>
        <label className="secondary-button job-import-btn"><input type="file" accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" onChange={(e) => e.target.files?.[0] && importFromFile(e.target.files[0])} />{importing ? <Loader2 size={15} className="spin" /> : <Upload size={15} />} Upload description</label>
        <button className="secondary-button job-import-btn" onClick={() => runImport(demoAdapter)} disabled={importing}>{importing ? <Loader2 size={15} className="spin" /> : <Download size={15} />} {demoAdapter.label}</button>
        {importNote && <span className="job-import-note"><Sparkles size={13} /> {importNote}</span>}
      </div>}

      {pasteOpen && <div className="job-paste-panel">
        <Field label="Job posting URL" hint="Reference only — nothing is scraped."><TextInput value={pasteUrl} onChange={(e) => setPasteUrl(e.target.value)} placeholder="https://www.linkedin.com/jobs/view/…" /></Field>
        <Field label="Full job text" hint="Copy the entire posting and paste it here.">
          <textarea className="wz-input wz-textarea" rows={7} value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder="Paste the complete job description…" />
        </Field>
        <div className="job-paste-actions">
          <button className="text-button" onClick={() => setPasteText(samplePasteText)}>Use example text</button>
          <button className="primary-button small" onClick={() => runImport(pasteAdapter, { url: pasteUrl, text: pasteText })} disabled={importing}>{importing ? <Loader2 size={15} className="spin" /> : 'Parse into form'}</button>
        </div>
      </div>}

      {step === 0 && <div className="wz-body">
        <Field label="Cover image (optional)" hint="Shown as the card background. Falls back to your brand color + logo.">
          <label className="job-cover">
            <div className="job-cover-preview" style={coverPreview ? { backgroundImage: `url(${coverPreview})` } : { background: 'linear-gradient(150deg,#3d5afe,#ff6036)' }}>
              {!coverPreview && <><ImageIcon size={22} /><span>Add a cover</span></>}
              <em className="job-cover-edit">{coverPreview ? 'Change cover' : 'Upload'}</em>
            </div>
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setCoverFile(f); setCoverPreview(URL.createObjectURL(f)); } }} />
          </label>
        </Field>
        <div className="wz-row">
          <Field label="Job title" required><TextInput value={form.title} onChange={(e) => patch({ title: e.target.value })} /></Field>
          <Field label="Department (optional)"><TextInput value={form.department} onChange={(e) => patch({ department: e.target.value })} placeholder="e.g. Engineering" /></Field>
        </div>
        <div className="wz-row">
          <Field label="Openings (optional)"><TextInput type="number" min={1} value={form.openings} onChange={(e) => patch({ openings: e.target.value })} placeholder="1" /></Field>
          <Field label="Urgency (optional)"><TextInput value={form.urgency} onChange={(e) => patch({ urgency: e.target.value })} placeholder="e.g. Hiring ASAP" /></Field>
          <Field label="Application deadline (optional)"><TextInput value={form.deadline} onChange={(e) => patch({ deadline: e.target.value })} placeholder="e.g. Aug 15" /></Field>
        </div>
        <div className="wz-row">
          <Field label="Employment type" required><Segmented options={EMPLOYMENT_TYPES} value={form.type as typeof EMPLOYMENT_TYPES[number] | undefined} onChange={(type) => patch({ type })} /></Field>
          <Field label="Work mode" required><Segmented options={WORK_MODES} value={form.workMode as typeof WORK_MODES[number] | undefined} onChange={(workMode) => patch({ workMode })} /></Field>
        </div>
        <div className="wz-row">
          <Field label="Contract duration (optional)" hint="Shown on the role's first page, e.g. “6 months”, “12 months, renewable” or “Permanent”."><TextInput value={form.contractDuration} onChange={(e) => patch({ contractDuration: e.target.value })} placeholder="e.g. 6 months" maxLength={40} /></Field>
          <Field label="Start date (optional)" hint="Shown on the role's first page, e.g. “As soon as possible”, “1 Feb 2027”."><TextInput value={form.startDate} onChange={(e) => patch({ startDate: e.target.value })} placeholder="e.g. As soon as possible" maxLength={40} /></Field>
        </div>
        {form.workMode === 'Remote' ? <>
          <Field label="Remote scope" required hint="Worldwide matches everyone; within-country limits to candidates in one country.">
            <Segmented options={['worldwide', 'country'] as const} value={form.remoteScope} onChange={(remoteScope) => patch({ remoteScope })} labels={{ worldwide: 'Worldwide', country: 'Within a country' }} />
          </Field>
          <div className="wz-row">
            <Field label="Location" required><TextInput value={form.location} onChange={(e) => patch({ location: e.target.value })} placeholder="e.g. Remote · Asia" /></Field>
            {form.remoteScope === 'country' && <Field label="Country" required><TextInput value={form.country} onChange={(e) => patch({ country: e.target.value })} placeholder="e.g. Vietnam" /></Field>}
          </div>
        </> : <div className="wz-row">
          <Field label="Location" required><TextInput value={form.location} onChange={(e) => patch({ location: e.target.value })} placeholder="City, country" /></Field>
          <Field label={`Max distance: ${form.hiringRadiusKm} km`} hint="How far you'll consider on-site/hybrid candidates."><input className="wz-slider" type="range" min={5} max={500} step={5} value={form.hiringRadiusKm} onChange={(e) => patch({ hiringRadiusKm: Number(e.target.value) })} /></Field>
        </div>}
        {/* "Required valid work visa and nationality" (founder, 2026-11-22). When No: which nationalities may apply. */}
        <div className="wz-row">
          <Field label="Required valid work visa and nationality" hint="Yes: candidates must already have the right to work where this role is based.">
            <Segmented options={['yes', 'no'] as const} value={form.workVisaRequired || undefined} onChange={(workVisaRequired) => patch({ workVisaRequired })} labels={{ yes: 'Yes', no: 'No' }} />
          </Field>
          {form.workVisaRequired === 'no' && <Field label="Authorized nationalities">
            <Segmented options={NATIONALITY_MODES} value={form.natMode} onChange={(natMode) => patch({ natMode })} labels={{ any: 'Any', us: 'US', europe: 'Europe', custom: 'Custom' }} />
          </Field>}
        </div>
        {form.workVisaRequired === 'no' && form.natMode === 'custom' && <Field label="Custom nationality list" hint="Countries whose citizens may apply — press Enter after each."><TagInput value={form.natCustom} onChange={(natCustom) => patch({ natCustom: natCustom.slice(0, 30) })} placeholder="e.g. Vietnam" /></Field>}
        <Field label="Status"><Segmented options={STATUSES} value={form.status} onChange={(status) => patch({ status })} labels={{ draft: 'Draft', active: 'Active', paused: 'Paused', filled: 'Filled' }} /></Field>
        <JobGroupsField value={form.jobGroups} onChange={(jobGroups) => patch({ jobGroups })} title={form.title} />
        {job && String(job.status).toLowerCase() === 'active' && !job.demo && <LinkedInTools jobId={job.id} />}
      </div>}

      {step === 1 && <div className="wz-body">
        <Field label="Seniority (optional)"><Segmented options={['junior', 'mid', 'senior', 'lead', 'exec'] as const} value={form.seniority} onChange={(seniority) => patch({ seniority })} labels={SENIORITY_LABELS} /></Field>
        <Field label="Role details — the full job description" required hint="Paste the whole job description as it is (about the company, the role, who it is for, what you look for, how to apply). Candidates read it as-is in the Role details card.">
          <textarea className="wz-input wz-textarea jd-paste" rows={14} maxLength={20000} value={form.fullDescription} onChange={(e) => patch({ fullDescription: e.target.value })} placeholder={'About the job\nWho we are…\n\nThe role\nWhat you will build…\n\nWhat we are looking for\n…\n\nHow to apply\n…'} aria-label="Full job description" />
        </Field>
        <Field label="Short summary (optional)" hint="1–2 sentences for the swipe card. Leave empty and we use the first paragraph of the job description.">
          <textarea className="wz-input wz-textarea" rows={2} maxLength={400} value={form.description} onChange={(e) => patch({ description: e.target.value })} aria-label="Short summary" />
        </Field>
        <Field label="Must have" required hint="Skills a candidate needs. Min 1. Dots set the weight (1–3) that feeds the fit score.">
          <LevelTagInput value={form.requiredSkills} onChange={(requiredSkills) => patch({ requiredSkills: requiredSkills.map((skill) => ({ ...skill, level: Math.min(skill.level, 3) })) })} maxLevel={3} placeholder="Add a must-have skill, press Enter" />
        </Field>
        <Field label="Nice to have" required hint="Bonus skills. Min 1."><TagInput value={form.niceToHaves} onChange={(niceToHaves) => patch({ niceToHaves })} placeholder="Add a nice-to-have skill, press Enter" /></Field>
        <Field label="Languages" required hint="Min 1, e.g. English."><TagInput value={form.requiredLanguages} onChange={(requiredLanguages) => patch({ requiredLanguages })} placeholder="Add a language, press Enter" suggestions={['English', 'Vietnamese', 'Japanese', 'Korean']} /></Field>
        <Field label="Responsibilities (optional)" hint="One bullet per line — press Enter to add.">
          <TagInput value={form.responsibilities} onChange={(responsibilities) => patch({ responsibilities })} placeholder="e.g. Own the matching API roadmap" />
        </Field>
        <Field label="What success looks like (optional)"><TagInput value={form.successMeasures} onChange={(successMeasures) => patch({ successMeasures })} placeholder="e.g. Ship the v2 API in 90 days — press Enter" /></Field>
      </div>}

      {step === 2 && <div className="wz-body">
        <Field label="Salary range (optional)" hint="Optional, but a minimum salary is advised: candidates see a compatibility badge pre-match, and roles with a salary get more applications. Exact ranges reveal after a mutual match.">
          <div className="wz-salary">
            <TextInput type="number" min={0} placeholder="Min (advised)" value={form.salaryMin} onChange={(e) => patch({ salaryMin: e.target.value })} aria-label="Salary minimum" />
            <span>–</span>
            <TextInput type="number" min={0} placeholder="Max" value={form.salaryMax} onChange={(e) => patch({ salaryMax: e.target.value })} aria-label="Salary maximum" />
            <select className="wz-input wz-select" value={form.currency} onChange={(e) => patch({ currency: e.target.value })} aria-label="Currency">{CURRENCIES.map((currency) => <option key={currency}>{currency}</option>)}</select>
          </div>
          <div className="wz-inline"><Toggle checked={form.salaryNegotiable} onChange={(salaryNegotiable) => patch({ salaryNegotiable })} label="Negotiable" /></div>
        </Field>
        <div className="wz-row">
          <Field label="Bonus (optional)"><TextInput value={form.bonus} onChange={(e) => patch({ bonus: e.target.value })} placeholder="e.g. Up to 15% annual" /></Field>
          <Field label="Equity (optional)"><TextInput value={form.equity} onChange={(e) => patch({ equity: e.target.value })} placeholder="e.g. 0.1–0.3%" /></Field>
        </div>
        <Field label="Benefits (optional)"><TagInput value={form.benefits} onChange={(benefits) => patch({ benefits })} placeholder="e.g. Health insurance — press Enter" /></Field>
        <div className="wz-row">
          <Field label="Working hours (optional)"><TextInput value={form.workingHours} onChange={(e) => patch({ workingHours: e.target.value })} placeholder="e.g. 9–6, core hours 10–4" /></Field>
          <Field label="Flexibility (optional)"><TextInput value={form.flexibleHours} onChange={(e) => patch({ flexibleHours: e.target.value })} placeholder="e.g. Fully flexible" /></Field>
        </div>
        <div className="wz-row">
          <Field label="Probation (optional)"><TextInput value={form.probation} onChange={(e) => patch({ probation: e.target.value })} placeholder="e.g. 60 days" /></Field>
          <Field label="Travel (optional)"><TextInput value={form.travel} onChange={(e) => patch({ travel: e.target.value })} placeholder="e.g. Up to 10%" /></Field>
        </div>
        {form.workMode === 'Hybrid' && <Field label={`Office days: ${form.hybridDays}/wk`}><input className="wz-slider" type="range" min={0} max={5} value={form.hybridDays} onChange={(e) => patch({ hybridDays: Number(e.target.value) })} /></Field>}
        <div className="wz-row">
          <Field label="Visa sponsorship"><Toggle checked={form.visaSponsorship} onChange={(visaSponsorship) => patch({ visaSponsorship })} label={form.visaSponsorship ? 'Sponsorship available' : 'No sponsorship'} /></Field>
          <Field label="Relocation support"><Toggle checked={form.relocationSupport} onChange={(relocationSupport) => patch({ relocationSupport })} label={form.relocationSupport ? 'Support available' : 'Not offered'} /></Field>
        </div>
        <Field label="On-call (optional)"><TextInput value={form.onCall} onChange={(e) => patch({ onCall: e.target.value })} placeholder="e.g. 1 week in 6" /></Field>
        <div className="wz-row">
          <Field label="Start date (optional)"><TextInput value={form.startDate} onChange={(e) => patch({ startDate: e.target.value })} placeholder="e.g. ASAP, Q4 2026" /></Field>
          <Field label="External posting URL (optional)"><TextInput value={form.externalUrl} onChange={(e) => patch({ externalUrl: e.target.value })} placeholder="https://…" /></Field>
        </div>
      </div>}

      {step === 3 && <div className="wz-body">
        <Field label="Mission (optional)" hint="Why this role matters."><textarea className="wz-input wz-textarea" rows={3} value={form.mission} onChange={(e) => patch({ mission: e.target.value })} /></Field>
        <Field label="Culture (optional)"><TagInput value={form.culture} onChange={(culture) => patch({ culture })} placeholder="e.g. Ship fast, own outcomes — press Enter" /></Field>
        <Field label="Values (optional)"><Chips options={VALUES_SUGGESTIONS} value={form.values} onToggle={(option) => patch({ values: form.values.includes(option) ? form.values.filter((item) => item !== option) : [...form.values, option] })} /></Field>
        <div className="wz-row">
          <Field label="Team size (optional)"><TextInput value={form.teamSize} onChange={(e) => patch({ teamSize: e.target.value })} placeholder="e.g. 8 engineers" /></Field>
          <Field label="Team locations (optional)"><TextInput value={form.teamLocations} onChange={(e) => patch({ teamLocations: e.target.value })} placeholder="e.g. Singapore + remote EU" /></Field>
        </div>
        <Field label="Team composition (optional)"><TagInput value={form.teamComposition} onChange={(teamComposition) => patch({ teamComposition })} placeholder="e.g. 3 backend, 2 frontend — press Enter" /></Field>
        <div className="wz-row">
          <Field label="Manager name (optional)"><TextInput value={form.managerName} onChange={(e) => patch({ managerName: e.target.value })} /></Field>
          <Field label="Manager title (optional)"><TextInput value={form.managerTitle} onChange={(e) => patch({ managerTitle: e.target.value })} /></Field>
        </div>
        <Field label="Management style (optional)" hint="A sentence on how this manager leads."><textarea className="wz-input wz-textarea" rows={2} value={form.managerStyle} onChange={(e) => patch({ managerStyle: e.target.value })} /></Field>
        <Field label="Management style tags (optional)"><Chips options={MANAGEMENT_STYLE_SUGGESTIONS} value={form.managementStyleTags} onToggle={(option) => patch({ managementStyleTags: form.managementStyleTags.includes(option) ? form.managementStyleTags.filter((item) => item !== option) : [...form.managementStyleTags, option] })} /></Field>
        <Field label="Team style (optional)"><Chips options={TEAM_STYLE_SUGGESTIONS} value={form.teamStyle} onToggle={(option) => patch({ teamStyle: form.teamStyle.includes(option) ? form.teamStyle.filter((item) => item !== option) : [...form.teamStyle, option] })} /></Field>
        <Field label="Team soundtrack (optional)" hint="Spotify or YouTube link."><TextInput value={form.teamSong} onChange={(e) => patch({ teamSong: e.target.value })} placeholder="https://…" /></Field>
      </div>}

      {step === 4 && <div className="wz-body">
        <Field label="Hiring timeline (optional)"><TextInput value={form.hiringTimeline} onChange={(e) => patch({ hiringTimeline: e.target.value })} placeholder="e.g. 3 rounds over 2 weeks" /></Field>
        <Field label="Interview process (optional)" hint="Ordered steps, e.g. screen → tech → offer.">
          <TagInput value={form.interviewProcess} onChange={(interviewProcess) => patch({ interviewProcess })} placeholder="Add a stage, press Enter" />
        </Field>
        <div className="wz-row">
          <Field label="Background check"><Toggle checked={form.backgroundCheck} onChange={(backgroundCheck) => patch({ backgroundCheck })} label={form.backgroundCheck ? 'Required' : 'Not required'} /></Field>
          <Field label="Reference check"><Toggle checked={form.referenceCheck} onChange={(referenceCheck) => patch({ referenceCheck })} label={form.referenceCheck ? 'Required' : 'Not required'} /></Field>
        </div>
        <Field label="Screening questions (optional)" hint="Up to 3 — candidates answer these in a 30-second form when they swipe right.">
          <TagInput value={form.screeningQuestions} onChange={(screeningQuestions) => patch({ screeningQuestions: screeningQuestions.slice(0, 3) })} placeholder="Add a question, press Enter" />
          <button type="button" className="wz-repeat-add" disabled={form.requiredSkills.length < 1 || suggesting}
            onClick={async () => { setSuggesting(true); try { const { questions } = await api.suggestScreening(form.requiredSkills.map((skill) => ({ name: skill.name, weight: skill.level }))); patch({ screeningQuestions: questions }); } finally { setSuggesting(false); } }}>
            {suggesting ? <Loader2 size={13} className="spin" /> : <Sparkles size={13} />} Suggest from required skills
          </button>
        </Field>
      </div>}

      {(attempted && errors.length > 0) && <ul className="wz-errors">{errors.map((message) => <li key={message}>{message}</li>)}</ul>}
      {error && <p className="auth-error">{error}</p>}

      <footer className="wz-foot">
        {step > 0 ? <button className="secondary-button" onClick={() => { setStep(step - 1); setAttempted(false); }}><ArrowLeft size={16} /> Back</button> : <button className="secondary-button" onClick={onCancel}>Cancel</button>}
        <div className="wz-foot-actions">
          {step === JOB_REQUIRED_STEPS && <button className="secondary-button" onClick={save} disabled={saving}>Skip &amp; {job ? 'save changes' : 'publish'}</button>}
          <button className="primary-button" onClick={goNext} disabled={saving}>
            {saving ? <Loader2 size={16} className="spin" /> : finishing ? <><Check size={16} /> {job ? 'Save changes' : 'Create posting'}</> : <>Continue <ArrowRight size={16} /></>}
          </button>
        </div>
      </footer>
    </div>
  </div>;
}
