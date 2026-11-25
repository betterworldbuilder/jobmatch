import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Camera, Check, FileText, Loader2, MapPin, Sparkles, Upload } from 'lucide-react';
import { api } from '../../api';
import { CameraCaptureModal } from '../CameraCaptureModal';
import { Chips, Field, LevelTagInput, MultiSegmented, Repeat, Segmented, TagInput, TextInput, Toggle } from './fields';
import { RecommendationLetters } from './CandidateCards';
import { IdVerification } from './IdVerification';
import type { AgePrivacy, ContactChannel, ContactChannelType, Education, LanguageTag, Person, Recommendation, ResumeMeta, Seniority, SkillTag, WorkExperience } from '../../types';

const SENIORITY_LABELS = { junior: 'Junior', mid: 'Mid', senior: 'Senior', lead: 'Lead', exec: 'Exec' };
const EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Contract', 'Freelance', 'Internship'] as const;
const AVAILABILITIES = ['Now', '2 weeks', '1 month', '3 months'] as const;
const CURRENCIES = ['USD', 'EUR', 'GBP', 'VND', 'SGD', 'AUD'] as const;
const SALARY_PERIODS = ['year', 'month', 'day', 'hour'] as const;
const COMPANY_SIZES = ['1-10', '11-50', '51-200', '201-1000', '1000+'] as const;
const LANGUAGE_LEVELS = ['Basic', 'Intermediate/B1', 'Professional/B2', 'Advanced/C1', 'Fluent/C2', 'Native'] as const;
const SKILL_SUGGESTIONS = ['Figma', 'Design systems', 'Research', 'Product strategy', 'React', 'TypeScript', 'Prototyping', 'Analytics'] as const;
const WORK_STYLES = ['Autonomous', 'Collaborative', 'Fast-paced', 'Structured', 'Async-first', 'Mentorship'] as const;
const CONTACT_TYPES: readonly ContactChannelType[] = ['whatsapp', 'telegram', 'phone', 'signal', 'wechat', 'zalo', 'other'];
const AGE_PRIVACY_LABELS = { public: 'Show publicly', 'after-match': 'Only after matching', private: 'Keep private' } as const;
const WORK_AUTH_OPTIONS = ['Citizen', 'Permanent resident', 'Work visa held', 'Needs sponsorship', 'Working-holiday visa'] as const;
const MINDSET_SUGGESTIONS = ['Curious', 'Accountable', 'Resilient', 'Empathetic', 'Pragmatic', 'Driven', 'Calm under pressure', 'Growth-minded'] as const;
const INTEREST_SUGGESTIONS = ['Coffee', 'Cycling', 'Music', 'AI projects', 'Travel', 'Gaming', 'Reading', 'Cooking', 'Photography'] as const;

// Supporting traits offered on the About Me step (deterministic — no LLM involved yet).
const ABOUT_ME_TRAITS = ['Accountable', 'Adaptable', 'Analytical', 'Collaborative', 'Creative', 'Curious', 'Empathetic', 'Hands-on', 'Independent', 'Organized', 'Practical', 'Reliable', 'Resilient', 'Strategic', 'Supportive'] as const;

export type Archetype = { id: string; cardTitle: string; prefilled: string; defaultTraits: string[] };

// Prefilled "About Me" starting points — pick one, personalize, edit freely.
// Trimmed from 14 to 8: the most overlapping types are folded into a close neighbor
// (Reliable Operator -> Team Servant, Goal Achiever -> Doer, Strategist -> Problem Solver,
// Change Maker -> Leader, Explorer -> Innovator, Connector -> Customer Champion) so the
// picker is a quick scan instead of a wall of chips.
export const ARCHETYPES: Archetype[] = [
  { id: 'team-servant', cardTitle: 'I Help the Team Succeed', defaultTraits: ['Supportive', 'Reliable', 'Collaborative', 'Empathetic'],
    prefilled: 'I believe strong teams succeed when people support one another, communicate openly, and share responsibility. I am usually the person who helps remove blockers, listens carefully, and makes sure everyone has what they need to perform well. People can depend on me to follow through — I take pride in being careful and consistent with the work entrusted to me.\n\nI do not need to be the loudest person in the room. I prefer to contribute through reliability, practical support, and consistent follow-through, communicating early when risks appear rather than hiding problems. I value trust, respect, shared ownership, and celebrating team success rather than individual credit.' },
  { id: 'doer', cardTitle: 'I Turn Ideas Into Action', defaultTraits: ['Hands-on', 'Practical', 'Independent', 'Accountable'],
    prefilled: 'I am action-oriented and enjoy moving quickly from discussion to execution. When I see a problem, I prefer to understand it, define the next practical step, and start making progress toward a clear, measurable goal.\n\nI work well in environments where people take ownership and avoid unnecessary complexity. I am disciplined and persistent about seeing things through, comfortable learning while doing, and I believe achieving the right result matters more than simply completing a list of tasks.' },
  { id: 'problem-solver', cardTitle: 'I Enjoy Solving Difficult Problems', defaultTraits: ['Analytical', 'Curious', 'Strategic'],
    prefilled: 'I enjoy understanding complex problems, identifying their root causes, and finding solutions that are both effective and practical. I naturally ask questions, test assumptions, and connect daily decisions to the wider context and long-term goals behind them.\n\nI am comfortable working with uncertainty and I remain calm when the first solution does not work. I value evidence, clear thinking, and combining analysis with practical execution — strategy, to me, is a clear direction that helps people make better decisions, not a document.' },
  { id: 'builder', cardTitle: 'I Build Things That Last', defaultTraits: ['Creative', 'Hands-on'],
    prefilled: 'I enjoy creating products, systems, processes, and teams from the ground up. I like turning incomplete ideas into something useful, reliable, and scalable.\n\nI think beyond the first version and consider how the work will be maintained, improved, and used by others. I value strong foundations, simple design, clear documentation, and continuous improvement.' },
  { id: 'leader', cardTitle: 'I Create Direction and Enable Others', defaultTraits: ['Supportive', 'Strategic', 'Accountable', 'Adaptable'],
    prefilled: 'I see leadership as creating clarity, building trust, and helping people perform at their best. I enjoy aligning teams around a common objective, making difficult decisions, and helping organizations move from an existing way of working toward something better.\n\nI lead with accountability and transparency, focusing on building understanding and reducing resistance so progress happens without unnecessary disruption. I am comfortable taking responsibility when things go wrong and giving credit to the team when things go well.' },
  { id: 'mentor', cardTitle: 'I Help People Grow', defaultTraits: ['Supportive'],
    prefilled: 'I enjoy sharing knowledge, supporting colleagues, and helping people become more confident and capable. I believe mentoring is not about providing every answer, but helping others develop their own judgment and problem-solving skills.\n\nI am patient, approachable, and comfortable giving honest but constructive feedback. I value learning cultures where questions are welcomed and knowledge is shared openly.' },
  { id: 'innovator', cardTitle: 'I Look for Better Ways', defaultTraits: ['Curious', 'Creative', 'Adaptable'],
    prefilled: 'I am naturally curious and often look for better ways to solve problems, improve experiences, or create new opportunities. I enjoy entering unfamiliar situations and learning quickly — new technologies, industries, and challenges energize me.\n\nI am comfortable challenging assumptions, experimenting carefully, and adapting as I gain more information. I believe innovation should produce real value rather than novelty alone, and I work best in environments that encourage curiosity and continuous learning.' },
  { id: 'customer-champion', cardTitle: 'I Start With the Customer', defaultTraits: ['Empathetic', 'Reliable', 'Collaborative'],
    prefilled: 'I believe the best solutions begin with a clear understanding of people’s real needs. I enjoy listening, connecting people and ideas that can benefit from one another, and translating problems into practical solutions that create measurable value.\n\nI aim to build trust through honesty, reliability, and clear communication across technical, business, and leadership audiences. I am comfortable balancing expectations with technical, operational, and business realities.' },
];

type AboutMeAnswers = { bestWhen: string; relyOnMe: string; proudResult: string };

/** Deterministic template composition — no LLM involved. Archetype paragraph + the candidate's own sentence endings. */
// Several identities at once (founder, 2026-11-25): their template paragraphs are joined, answers added after.
function composeAboutMe(archetypes: Archetype | Archetype[], answers: AboutMeAnswers): string {
  const list = Array.isArray(archetypes) ? archetypes : [archetypes];
  const extra = [
    answers.bestWhen.trim() && `I am at my best when ${answers.bestWhen.trim()}.`,
    answers.relyOnMe.trim() && `People can rely on me to ${answers.relyOnMe.trim()}.`,
    answers.proudResult.trim() && `A result I am proud of is ${answers.proudResult.trim()}.`,
  ].filter(Boolean).join(' ');
  const base = list.map((a) => a.prefilled).join('\n\n');
  return extra ? `${base}\n\n${extra}` : base;
}
const MAX_IDENTITIES = 3;

// The six wizard steps mirror the profile cards recruiters swipe through, plus the About Me step.
// The first four carry every must-have field; the last two are optional and skippable.
export const CANDIDATE_STEPS = ['Snapshot', 'Technical stack', 'Preferences', 'About me', 'Human stack', 'Reviews & visibility', 'What I have built'] as const;
// One color per step, matching the same step's card in the profile deck
// (CandidateCards' NAV) — so the wizard and the deck share one color language.
const STEP_COLORS = ['#00C7BE', '#007AFF', '#AF52DE', '#FF9500', '#FF9500', '#FF2D55', '#5856D6'];
const CANDIDATE_REQUIRED_STEPS = 4;

type Form = {
  name: string; photo: string; headline: string; email: string; phone: string; city: string; country: string;
  nationality: string; birthdate: string; agePrivacy: AgePrivacy; workAuthorization: string; visaSponsorship: boolean;
  citizenship: string[]; visaCountries: string[];
  pronouns: string; contactChannels: ContactChannel[];
  distanceRangeKm: number; geo?: { lat: number; lng: number }; languageDetail: LanguageTag[];
  title: string; yearsExperience: string; seniority?: Seniority; skillsDetail: SkillTag[]; industries: string[];
  workExperience: WorkExperience[]; education: Education[]; certifications: string[];
  links: { github?: string; portfolio?: string; website?: string; linkedin?: string; appStore?: string; playStore?: string };
  publications: string[];
  desiredRoles: string[]; employmentTypes: string[]; workModeChoices: ('remote' | 'hybrid' | 'onsite')[]; hybridDays: number;
  salaryMin: string; salaryMax: string; currency: string; salaryPeriod: string; salaryNegotiable: boolean;
  availability?: string; travel: string;
  relocateOpen: boolean; relocateLocations: string[]; companySize: string; prefIndustries: string[]; workStyle: string[];
  presentation: string; aboutMeArchetype?: string; aboutMeArchetypes: string[]; mindset: string[]; humanSkills: string[]; workingPrefer: string[]; workingAvoid: string[];
  interests: string[]; motto: string; favoriteSong: string; recommendations: Recommendation[];
  resume?: ResumeMeta; coverLetter: string; visibility?: 'all' | 'after-swipe' | 'paused'; blockedCompanies: string[]; openToWork: boolean;
};

function fromPerson(p: Person): Form {
  return {
    name: p.name || '', photo: p.photo || '', headline: p.headline || '', email: p.email || '', phone: p.phone || '',
    city: p.city || (p.location ? p.location.split('·')[0].trim() : ''), country: p.country || '',
    nationality: p.nationality || '', birthdate: p.birthdate || '', agePrivacy: p.agePrivacy || (p.discloseAge ? 'public' : 'private'),
    workAuthorization: p.workAuthorization || '', visaSponsorship: p.visaSponsorship ?? false, pronouns: p.pronouns || '',
    citizenship: p.citizenship?.length ? p.citizenship : (p.nationality ? [p.nationality] : []), visaCountries: p.visaCountries || [],
    contactChannels: p.contactChannels || (p.phone ? [{ type: 'phone', value: p.phone }] : []),
    distanceRangeKm: p.distanceRangeKm ?? 25, geo: p.geo,
    languageDetail: p.languageDetail || (p.languages || []).map((name) => ({ name, level: 'Fluent/C2' })),
    title: p.title === 'New member' ? '' : p.title || '', yearsExperience: p.yearsExperience !== undefined ? String(p.yearsExperience) : '',
    seniority: p.seniority || (['junior', 'mid', 'senior', 'lead', 'exec'].includes(p.experienceLevel) ? p.experienceLevel as Seniority : undefined),
    skillsDetail: p.skillsDetail || (p.skills || []).map((name) => ({ name, level: 3 })),
    industries: p.industries || [], workExperience: p.workExperience || [], education: p.education || [], certifications: p.certifications || [],
    links: p.links || {}, publications: p.publications || [],
    desiredRoles: p.preferences?.desiredRoles || [], employmentTypes: p.preferences?.employmentTypes || [],
    workModeChoices: p.preferences?.workMode?.modes?.length ? p.preferences.workMode.modes : p.preferences?.workMode?.mode ? [p.preferences.workMode.mode] : [], hybridDays: p.preferences?.workMode?.hybridDays ?? 2,
    salaryMin: p.preferences?.salary?.min !== undefined ? String(p.preferences.salary.min) : '',
    salaryMax: p.preferences?.salary?.max !== undefined ? String(p.preferences.salary.max) : '',
    currency: p.preferences?.salary?.currency || 'USD', salaryPeriod: p.preferences?.salary?.period || 'year', salaryNegotiable: p.preferences?.salary?.negotiable ?? false,
    availability: p.preferences?.availability, travel: p.preferences?.travel || '',
    relocateOpen: p.preferences?.relocate?.open ?? false, relocateLocations: p.preferences?.relocate?.locations || [],
    companySize: p.preferences?.companySize || '', prefIndustries: p.preferences?.industries || [], workStyle: p.preferences?.workStyle || [],
    presentation: p.presentation || '', aboutMeArchetype: p.aboutMeArchetype, aboutMeArchetypes: p.aboutMeArchetypes?.length ? p.aboutMeArchetypes : p.aboutMeArchetype ? [p.aboutMeArchetype] : [], mindset: p.mindset || [], humanSkills: p.humanSkills || [],
    workingPrefer: p.workingPrefer || [], workingAvoid: p.workingAvoid || [], interests: p.interests || [],
    motto: p.motto || '', favoriteSong: p.favoriteSong || '', recommendations: p.recommendations || [],
    resume: p.documents?.resume, coverLetter: p.documents?.coverLetter || '',
    visibility: p.privacy?.visibility || 'all', blockedCompanies: p.privacy?.blockedCompanies || [],
    openToWork: p.privacy?.openToWork ?? true,
  };
}

function stepPayload(step: number, form: Form, finishing: boolean) {
  if (step === 0) return {
    name: form.name, photo: form.photo || undefined, headline: form.headline, email: form.email,
    phone: form.contactChannels.find((c) => c.type === 'phone' || c.type === 'whatsapp')?.value || form.phone || undefined,
    city: form.city, country: form.country, nationality: form.nationality || undefined,
    birthdate: form.birthdate || undefined, agePrivacy: form.agePrivacy,
    workAuthorization: form.workAuthorization || undefined, visaSponsorship: form.visaSponsorship, pronouns: form.pronouns || undefined,
    citizenship: form.citizenship, visaCountries: form.visaCountries,
    contactChannels: form.contactChannels.filter((c) => c.value.trim()),
    distanceRangeKm: form.distanceRangeKm, geo: form.geo, languageDetail: form.languageDetail,
  };
  if (step === 1) return {
    title: form.title, yearsExperience: Number(form.yearsExperience), seniority: form.seniority, skillsDetail: form.skillsDetail,
    industries: form.industries, workExperience: form.workExperience, education: form.education, certifications: form.certifications, links: form.links,
    coverLetter: form.coverLetter,
  };
  if (step === 2) return {
    availability: form.availability,
    preferences: {
      desiredRoles: form.desiredRoles, employmentTypes: form.employmentTypes,
      // Several work modes at once; `mode` = the first, for older readers (founder, 2026-11-25).
      workMode: form.workModeChoices.length ? { mode: form.workModeChoices[0], modes: form.workModeChoices, hybridDays: form.workModeChoices.includes('hybrid') ? form.hybridDays : undefined } : undefined,
      // Salary is optional (founder, 2026-11-25): sent only when at least one amount is filled in.
      // Minimum only (founder, 2026-11-25): any old maximum is dropped on save.
      salary: form.salaryMin !== '' ? { min: Number(form.salaryMin), currency: form.currency, period: form.salaryPeriod, negotiable: form.salaryNegotiable } : undefined,
      availability: form.availability, travel: form.travel || undefined,
      relocate: { open: form.relocateOpen, locations: form.relocateLocations },
      companySize: form.companySize || undefined, industries: form.prefIndustries, workStyle: form.workStyle,
    },
  };
  if (step === 3) return {
    presentation: form.presentation || undefined, aboutMeArchetype: form.aboutMeArchetypes[0] ?? form.aboutMeArchetype, aboutMeArchetypes: form.aboutMeArchetypes, motto: form.motto || undefined, humanSkills: form.humanSkills,
  };
  if (step === 4) return {
    mindset: form.mindset, workingPrefer: form.workingPrefer, workingAvoid: form.workingAvoid,
    interests: form.interests, favoriteSong: form.favoriteSong || undefined,
  };
  if (step === 5) return {
    recommendations: form.recommendations,
    privacy: { visibility: form.visibility, blockedCompanies: form.blockedCompanies, openToWork: form.openToWork },
  };
  return {
    links: form.links, publications: form.publications,
    ...(finishing ? { onboarding: false } : {}),
  };
}

function stepErrors(step: number, form: Form): string[] {
  const errors: string[] = [];
  if (step === 0) {
    if (!form.name.trim()) errors.push('Full name is required');
    if (!/.+@.+\..+/.test(form.email)) errors.push('A valid email is required');
    if (!form.city.trim() || !form.country.trim()) errors.push('City and country are required');
    if (!form.nationality.trim()) errors.push('Nationality is required');
    if (!form.workAuthorization) errors.push('Work authorization status is required');
  }
  if (step === 1) {
    if (!form.title.trim()) errors.push('Current or last title is required');
    if (form.yearsExperience === '' || Number.isNaN(Number(form.yearsExperience))) errors.push('Years of experience is required');
    if (!form.seniority) errors.push('Pick a seniority level');
    if (form.skillsDetail.length < 1) errors.push('Add at least 1 skill');
  }
  if (step === 2) {
    if (!form.desiredRoles.length) errors.push('Add at least one desired role');
    if (!form.employmentTypes.length) errors.push('Pick at least one employment type');
    if (!form.workModeChoices.length) errors.push('Pick at least one work mode');
    if (form.salaryMin !== '' && Number(form.salaryMin) < 0) errors.push('Minimum salary cannot be negative');
  }
  if (step === 3) {
    if (!form.presentation.trim()) errors.push('About Me is required — pick an identity to start from a template, or write your own');
  }
  return errors;
}

export function CandidateWizard({ viewer, initialStep = 0, onDone, onCancel }: { viewer: Person; initialStep?: number; onDone: (user: Person) => void; onCancel?: () => void }) {
  const [step, setStep] = useState(Math.min(initialStep, CANDIDATE_STEPS.length - 1));
  const [form, setForm] = useState<Form>(() => fromPerson(viewer));
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [autofilling, setAutofilling] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [autofillNote, setAutofillNote] = useState('');
  const [geoBusy, setGeoBusy] = useState(false);
  const [idv, setIdv] = useState(viewer.idVerification);
  const [error, setError] = useState('');
  const [aboutMeAnswers, setAboutMeAnswers] = useState<AboutMeAnswers>({ bestWhen: '', relyOnMe: '', proudResult: '' });
  // Toggle an identity on/off (up to 3); the first picked stays the main one (`aboutMeArchetype`).
  const pickArchetype = (archetype: Archetype) => {
    const ids = form.aboutMeArchetypes.includes(archetype.id)
      ? form.aboutMeArchetypes.filter((id) => id !== archetype.id)
      : form.aboutMeArchetypes.length < MAX_IDENTITIES ? [...form.aboutMeArchetypes, archetype.id] : form.aboutMeArchetypes;
    const chosen = ids.map((id) => ARCHETYPES.find((a) => a.id === id)!).filter(Boolean);
    patch({
      aboutMeArchetypes: ids,
      aboutMeArchetype: ids[0],
      motto: chosen.map((a) => a.cardTitle).join(' · ') || form.motto,
      presentation: chosen.length ? composeAboutMe(chosen, aboutMeAnswers) : form.presentation,
      humanSkills: form.humanSkills.length ? form.humanSkills : [...new Set(chosen.flatMap((a) => a.defaultTraits))].slice(0, 6),
    });
  };
  const chosenArchetypes = form.aboutMeArchetypes.map((id) => ARCHETYPES.find((a) => a.id === id)!).filter(Boolean);
  const captureLocation = async () => {
    setGeoBusy(true); setError('');
    try { const { getBrowserLocation } = await import('../../lib/geo'); patch({ geo: await getBrowserLocation() }); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not get your location'); }
    finally { setGeoBusy(false); }
  };
  const patch = (changes: Partial<Form>) => setForm((current) => ({ ...current, ...changes }));
  const errors = useMemo(() => stepErrors(step, form), [step, form]);
  const finishing = step === CANDIDATE_STEPS.length - 1;

  const next = async () => {
    setAttempted(true);
    if (errors.length) return;
    setSaving(true); setError('');
    try {
      const { user } = await api.updateProfile(viewer.id, stepPayload(step, form, finishing) as Partial<Person>);
      if (finishing) onDone(user);
      else { setStep(step + 1); setAttempted(false); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed'); }
    finally { setSaving(false); }
  };

  // Jumps straight to done from the first optional step, saving whatever's filled in
  // across the remaining (skippable) steps without forcing the user to click through them.
  const skipRest = async () => {
    setSaving(true); setError('');
    try {
      // Includes the last step's payload so `onboarding: false` is sent — without it the
      // wizard reopened at step 1 after "Skip & finish" (found by the sign-up browser test).
      const payload = { ...stepPayload(4, form, false), ...stepPayload(5, form, false), ...stepPayload(CANDIDATE_STEPS.length - 1, form, true) };
      const { user } = await api.updateProfile(viewer.id, payload as Partial<Person>);
      onDone(user);
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed'); }
    finally { setSaving(false); }
  };

  const uploadPhoto = async (file: File | Blob) => {
    if (file.size > 5 * 1024 * 1024) { setError('Photo must be 5MB or smaller'); return; }
    setUploadingPhoto(true); setError('');
    try { const { photo } = await api.uploadPhoto(viewer.id, file); patch({ photo }); }
    catch (e) { setError(e instanceof Error ? e.message : 'Photo upload failed'); }
    finally { setUploadingPhoto(false); }
  };

  const uploadResume = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) { setError('Resume must be 10MB or smaller'); return; }
    setUploading(true); setError('');
    try {
      const { resume } = await api.uploadResume(viewer.id, file);
      patch({ resume });
      // No pdftoppm on the server: render the page-1 thumbnail here with pdf.js.
      if (resume.needsClientThumbnail && file.type === 'application/pdf') {
        const { makePdfThumbnail } = await import('../../lib/pdf');
        const thumbnail = await makePdfThumbnail(file);
        if (thumbnail) await api.uploadResumeThumbnail(viewer.id, thumbnail);
      }
    }
    catch (e) { setError(e instanceof Error ? e.message : 'Upload failed'); }
    finally { setUploading(false); }
  };

  // "Parse resume" (founder, 2026-11-25): read the uploaded resume again. Skills are MERGED (the candidate's own
  // levels win, new ones are added) and sorted strongest first; other lists are filled only when still empty.
  const [parsing, setParsing] = useState(false);
  const [parseNote, setParseNote] = useState('');
  const parseResume = async () => {
    setParsing(true); setError('');
    try {
      const { fields, generator } = await api.resumeAutofill(viewer.id);
      const parsed = (fields.skills || []) as { name: string; level: number }[];
      let added = 0;
      setForm((current) => {
        const byName = new Map(current.skillsDetail.map((s) => [s.name.toLowerCase(), s]));
        for (const s of parsed) if (!byName.has(s.name.toLowerCase())) { byName.set(s.name.toLowerCase(), s); added += 1; }
        const order = new Map(parsed.map((s, i) => [s.name.toLowerCase(), i]));
        const skillsDetail = [...byName.values()].sort((a, b) => b.level - a.level || (order.get(a.name.toLowerCase()) ?? 99) - (order.get(b.name.toLowerCase()) ?? 99));
        const fill = <T,>(have: T[], got?: T[]) => (have.length ? have : got?.length ? got : have);
        return {
          ...current, skillsDetail,
          headline: current.headline || fields.headline || current.headline,
          title: current.title || fields.title || current.title,
          yearsExperience: current.yearsExperience || (fields.yearsExperience !== undefined ? String(fields.yearsExperience) : current.yearsExperience),
          languageDetail: fill(current.languageDetail, fields.languages),
          industries: fill(current.industries, fields.industries),
          workExperience: fill(current.workExperience, fields.workExperience),
          education: fill(current.education, fields.education),
          certifications: fill(current.certifications, fields.certifications),
          links: fields.links ? { ...fields.links, ...current.links } : current.links,
        };
      });
      setParseNote(`${generator === 'claude' ? 'AI-read your resume.' : 'Read your resume.'} ${parsed.length ? `${parsed.length} skills found${added ? `, ${added} new` : ''}; your skills are now sorted strongest first.` : 'No skills found in it.'} Review, then continue to save.`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not read your resume'); }
    finally { setParsing(false); }
  };

  // Upload a resume and pre-fill the whole wizard from it (review then continue).
  const autofillFromResume = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) { setError('Resume must be 10MB or smaller'); return; }
    setAutofilling(true); setError('');
    try {
      await uploadResume(file);
      const { fields, generator } = await api.resumeAutofill(viewer.id);
      setForm((current) => ({
        ...current,
        headline: fields.headline || current.headline,
        title: fields.title || current.title,
        yearsExperience: fields.yearsExperience !== undefined ? String(fields.yearsExperience) : current.yearsExperience,
        seniority: (fields.seniority as Seniority) || current.seniority,
        skillsDetail: fields.skills?.length ? fields.skills : current.skillsDetail,
        languageDetail: fields.languages?.length ? fields.languages : current.languageDetail,
        industries: fields.industries?.length ? fields.industries : current.industries,
        workExperience: fields.workExperience?.length ? fields.workExperience : current.workExperience,
        education: fields.education?.length ? fields.education : current.education,
        certifications: fields.certifications?.length ? fields.certifications : current.certifications,
        links: fields.links ? { ...current.links, ...fields.links } : current.links,
      }));
      // AI transparency (founder, 2026-11-23): say when AI read the CV; nothing is saved until the candidate continues.
      setAutofillNote(`${generator === 'claude' ? 'AI-generated suggestions from your resume, please review.' : 'Filled from your resume.'} Check each step and edit anything before continuing; nothing is saved until you do.`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Auto-fill failed'); }
    finally { setAutofilling(false); }
  };

  return <div className="wizard-page">
    <div className="wizard-card" style={{ ['--step-accent' as string]: STEP_COLORS[step] }}>
      <header className="wz-head">
        <div><span className="overline">{step < CANDIDATE_REQUIRED_STEPS ? 'Set up your candidate profile' : 'Optional — add now or skip and edit later'}</span><h1>{CANDIDATE_STEPS[step]}</h1></div>
        <span className="wz-step-count">{step < CANDIDATE_REQUIRED_STEPS ? `Step ${step + 1} of ${CANDIDATE_REQUIRED_STEPS}` : `Optional ${step - CANDIDATE_REQUIRED_STEPS + 1} of ${CANDIDATE_STEPS.length - CANDIDATE_REQUIRED_STEPS}`}</span>
      </header>
      <div className="wz-progress" role="progressbar" aria-valuenow={step + 1} aria-valuemin={1} aria-valuemax={CANDIDATE_STEPS.length}><i style={{ width: `${((step + 1) / CANDIDATE_STEPS.length) * 100}%` }} /></div>

      {step === 0 && <div className={autofillNote ? 'wz-autofill done' : 'wz-autofill'}>
        <Sparkles size={17} />
        <div className="wz-autofill-text"><strong>Have a resume? Skip the typing.</strong><span>{autofillNote || 'Upload it and we’ll fill in your skills, experience, and more — you review before saving.'}</span></div>
        <label className="secondary-button wz-autofill-btn">
          <input type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => e.target.files?.[0] && autofillFromResume(e.target.files[0])} />
          {autofilling ? <><Loader2 size={15} className="spin" /> Reading…</> : <><Upload size={15} /> Upload &amp; autofill</>}
        </label>
      </div>}

      {step === 0 && <div className="wz-body">
        <div className="wz-row">
          <Field label="Full name" required><TextInput value={form.name} onChange={(e) => patch({ name: e.target.value })} autoComplete="name" /></Field>
          <Field label="Email" required><TextInput type="email" value={form.email} onChange={(e) => patch({ email: e.target.value })} autoComplete="email" /></Field>
        </div>
        <div className="wz-row">
          <Field label="Profile photo" hint="Take a photo, upload one, or paste a URL.">
            <div className="wz-photo-row">
              {form.photo && <img src={form.photo} alt="" />}
              <div className="wz-photo-actions">
                <div className="wz-photo-btn-row">
                  <button type="button" className="ios-photo-tile camera" onClick={() => setShowCamera(true)} disabled={uploadingPhoto}>
                    <span className="ios-photo-tile-icon">{uploadingPhoto ? <Loader2 size={18} className="spin" /> : <Camera size={18} />}</span>
                    Take Photo
                  </button>
                  <label className="ios-photo-tile upload">
                    <span className="ios-photo-tile-icon"><Upload size={18} /></span>
                    Upload Photo
                    <input type="file" accept="image/*" hidden onChange={(event) => event.target.files?.[0] && uploadPhoto(event.target.files[0])} />
                  </label>
                </div>
                <TextInput value={form.photo} onChange={(e) => patch({ photo: e.target.value })} placeholder="or paste a photo URL" />
              </div>
            </div>
          </Field>
          <Field label="Pronouns (optional)"><TextInput value={form.pronouns} onChange={(e) => patch({ pronouns: e.target.value })} placeholder="e.g. she/her, they/them" /></Field>
        </div>
        <Field label="Headline (optional)" hint="One line that sells your craft."><TextInput value={form.headline} onChange={(e) => patch({ headline: e.target.value })} placeholder="e.g. Product designer who ships design systems" /></Field>
        <div className="wz-row">
          <Field label="City" required><TextInput value={form.city} onChange={(e) => patch({ city: e.target.value })} /></Field>
          <Field label="Country" required><TextInput value={form.country} onChange={(e) => patch({ country: e.target.value })} /></Field>
        </div>
        <div className="wz-row">
          <Field label="Nationality" required hint="Never affects your match score — recruiters need it to check work eligibility, like on LinkedIn."><TextInput value={form.nationality} onChange={(e) => patch({ nationality: e.target.value })} /></Field>
          <Field label="Date of birth (optional)"><TextInput type="date" value={form.birthdate} onChange={(e) => patch({ birthdate: e.target.value })} /></Field>
        </div>
        {form.birthdate && <Field label="Who can see your age" hint="Age never affects matching."><Segmented options={['public', 'after-match', 'private'] as const} value={form.agePrivacy} onChange={(agePrivacy) => patch({ agePrivacy })} labels={AGE_PRIVACY_LABELS} /></Field>}
        <div className="wz-row">
          <Field label="Work authorization" required hint="Your status relative to where you'll work — shown as a status, never a document."><select className="wz-input wz-select" value={form.workAuthorization} onChange={(e) => patch({ workAuthorization: e.target.value })}><option value="">Select one…</option>{WORK_AUTH_OPTIONS.map((o) => <option key={o}>{o}</option>)}</select></Field>
          <Field label="Visa sponsorship"><Toggle checked={form.visaSponsorship} onChange={(visaSponsorship) => patch({ visaSponsorship })} label={form.visaSponsorship ? 'I need sponsorship' : 'No sponsorship needed'} /></Field>
        </div>
        <div className="wz-row">
          <Field label="Citizenship (countries)" hint="Every country you are a citizen of. Never affects your match score."><TagInput value={form.citizenship} onChange={(citizenship) => patch({ citizenship: citizenship.slice(0, 5) })} placeholder="e.g. Vietnam — press Enter" /></Field>
          <Field label="Visa status (countries)" hint="Countries where you already hold a valid work visa or permit."><TagInput value={form.visaCountries} onChange={(visaCountries) => patch({ visaCountries: visaCountries.slice(0, 10) })} placeholder="e.g. Singapore — press Enter" /></Field>
        </div>
        {/* "Verified account" (optional): ID check preview — the document never leaves the device. */}
        <IdVerification viewer={{ ...viewer, idVerification: idv }} onSaved={(v) => setIdv(v.idVerification)} />
        <Field label="Location for distance matching" hint="Enables real distance to roles. Your exact coordinates are never shown to anyone.">
          <button type="button" className={form.geo ? 'wz-geo-btn set' : 'wz-geo-btn'} onClick={captureLocation} disabled={geoBusy}>
            {geoBusy ? <><Loader2 size={15} className="spin" /> Locating…</> : form.geo ? <><MapPin size={15} /> Location set ✓ — tap to update</> : <><MapPin size={15} /> Use my current location</>}
          </button>
        </Field>
        <Field label={`Distance range: ${form.distanceRangeKm} km`} required hint="How far you'll match for on-site/hybrid roles. Shown on your profile; exact location stays private.">
          <input className="wz-slider" type="range" min={5} max={100} step={5} value={form.distanceRangeKm} onChange={(e) => patch({ distanceRangeKm: Number(e.target.value) })} />
        </Field>
        <Field label="Languages">
          <div className="wz-langs">
            {form.languageDetail.map((language) => <span key={language.name} className="wz-leveltag">
              <b>{language.name}</b>
              <select value={language.level} onChange={(e) => patch({ languageDetail: form.languageDetail.map((item) => item.name === language.name ? { ...item, level: e.target.value } : item) })}>
                {LANGUAGE_LEVELS.map((level) => <option key={level}>{level}</option>)}
              </select>
              <button type="button" className="wz-tag-remove" aria-label={`Remove ${language.name}`} onClick={() => patch({ languageDetail: form.languageDetail.filter((item) => item.name !== language.name) })}>×</button>
            </span>)}
          </div>
          <TagInput value={[]} onChange={(tags) => tags[0] && !form.languageDetail.some((item) => item.name === tags[0]) && patch({ languageDetail: [...form.languageDetail, { name: tags[0], level: 'Fluent/C2' }] })} placeholder="Add a language, press Enter" />
        </Field>
        <Field label="Contact channels" hint="Email and these stay hidden until you and a company mutually match.">
          <Repeat items={form.contactChannels} onChange={(contactChannels) => patch({ contactChannels })} blank={() => ({ type: 'whatsapp' as ContactChannelType, value: '' })} addLabel="Add a contact channel"
            render={(item, update) => <div className="wz-contact-row">
              <select className="wz-input wz-select" value={item.type} onChange={(e) => update({ type: e.target.value as ContactChannelType })}>{CONTACT_TYPES.map((t) => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}</select>
              <TextInput placeholder="Number or username" value={item.value} onChange={(e) => update({ value: e.target.value })} />
            </div>} />
        </Field>
        {/* Website next to the contact channels (founder, 2026-11-25); same field as before (links.website). */}
        <Field label="Website (optional)" hint="Your personal site, blog or online CV. Shown on your profile as a link.">
          <TextInput inputMode="url" autoComplete="url" value={form.links.website || ''} onChange={(e) => patch({ links: { ...form.links, website: e.target.value } })} placeholder="yourname.com" />
        </Field>
      </div>}

      {step === 1 && <div className="wz-body">
        <div className="wz-row">
          <Field label="Current / last title" required><TextInput value={form.title} onChange={(e) => patch({ title: e.target.value })} /></Field>
          <Field label="Years of experience" required><TextInput type="number" min={0} max={60} value={form.yearsExperience} onChange={(e) => patch({ yearsExperience: e.target.value })} /></Field>
        </div>
        <Field label="Seniority" required><Segmented options={['junior', 'mid', 'senior', 'lead', 'exec'] as const} value={form.seniority} onChange={(seniority) => patch({ seniority })} labels={SENIORITY_LABELS} /></Field>
        <Field label="Skills" required hint="At least 1 — add more any time. Click the dots to set your level (1–5).">
          <LevelTagInput value={form.skillsDetail} onChange={(skillsDetail) => patch({ skillsDetail })} grouped />
          <div className="wz-suggestions">{SKILL_SUGGESTIONS.filter((skill) => !form.skillsDetail.some((item) => item.name === skill)).slice(0, 5).map((skill) => <button type="button" key={skill} onClick={() => patch({ skillsDetail: [...form.skillsDetail, { name: skill, level: 3 }] })}>+ {skill}</button>)}</div>
        </Field>
        <Field label="Industries"><TagInput value={form.industries} onChange={(industries) => patch({ industries })} suggestions={['SaaS', 'Fintech', 'Health', 'E-commerce', 'Education', 'Agency']} /></Field>
        <Field label="Work experience">
          <Repeat items={form.workExperience} onChange={(workExperience) => patch({ workExperience })} blank={() => ({ title: '', company: '', from: '', to: '', description: '' })} addLabel="Add experience"
            render={(item, update) => <div className="wz-repeat-grid">
              <TextInput placeholder="Title" value={item.title || ''} onChange={(e) => update({ title: e.target.value })} />
              <TextInput placeholder="Company" value={item.company || ''} onChange={(e) => update({ company: e.target.value })} />
              <TextInput placeholder="From (e.g. 2021)" value={item.from || ''} onChange={(e) => update({ from: e.target.value })} />
              <TextInput placeholder="To (or Present)" value={item.to || ''} onChange={(e) => update({ to: e.target.value })} />
              <textarea className="wz-input wz-textarea" placeholder="What did you build or own?" value={item.description || ''} onChange={(e) => update({ description: e.target.value })} />
            </div>} />
        </Field>
        <Field label="Education">
          <Repeat items={form.education} onChange={(education) => patch({ education })} blank={() => ({ school: '', degree: '', from: '', to: '' })} addLabel="Add education"
            render={(item, update) => <div className="wz-repeat-grid">
              <TextInput placeholder="School" value={item.school || ''} onChange={(e) => update({ school: e.target.value })} />
              <TextInput placeholder="Degree" value={item.degree || ''} onChange={(e) => update({ degree: e.target.value })} />
              <TextInput placeholder="From" value={item.from || ''} onChange={(e) => update({ from: e.target.value })} />
              <TextInput placeholder="To" value={item.to || ''} onChange={(e) => update({ to: e.target.value })} />
            </div>} />
        </Field>
        <Field label="Certifications"><TagInput value={form.certifications} onChange={(certifications) => patch({ certifications })} placeholder="e.g. AWS SA, NN/g UX — press Enter" /></Field>
        <Field label="LinkedIn"><TextInput value={form.links.linkedin || ''} onChange={(e) => patch({ links: { ...form.links, linkedin: e.target.value } })} placeholder="linkedin.com/in/…" /></Field>
        <Field label="Resume (optional)" hint="PDF or DOCX, up to 10MB. Speeds up recruiter review, but you can add it later.">
          <label className={form.resume ? 'wz-upload has-file' : 'wz-upload'}>
            {/* value reset after each pick, so choosing the same file again re-uploads it (founder, 2026-11-25) */}
            <input type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void uploadResume(f).then(() => setParseNote('New resume uploaded. Parse it to update your skills.')); }} />
            {uploading ? <><Loader2 size={17} className="spin" /> Uploading…</> : form.resume ? <><FileText size={17} /> {form.resume.originalName} <em>Upload a new version</em></> : <><Upload size={17} /> Upload resume</>}
          </label>
        </Field>
        {/* Parse resume (founder, 2026-11-25): skills merged and sorted strongest first; other lists filled only if empty. */}
        <div className="wz-parse">
          <button type="button" className="secondary-button wz-parse-btn" disabled={!form.resume || parsing || uploading} onClick={() => void parseResume()}>
            {parsing ? <><Loader2 size={15} className="spin" /> Reading your resume…</> : <><Sparkles size={15} /> Parse resume</>}
          </button>
          <span className="wz-parse-note">{parseNote || (form.resume ? 'Reads your resume and sorts your skills, strongest first, with a level for each. Your own levels are kept; nothing is saved until you continue.' : 'Upload a resume first, then parse it.')}</span>
        </div>
        <Field label="Cover letter (optional)"><textarea className="wz-input wz-textarea" rows={4} value={form.coverLetter} onChange={(e) => patch({ coverLetter: e.target.value })} placeholder="A short default note recruiters see with your profile." /></Field>
      </div>}

      {step === 2 && <div className="wz-body">
        <Field label="Desired roles" required><TagInput value={form.desiredRoles} onChange={(desiredRoles) => patch({ desiredRoles })} placeholder="e.g. Senior Product Designer — press Enter" /></Field>
        <Field label="Employment type" required><Chips options={EMPLOYMENT_TYPES} value={form.employmentTypes} onToggle={(option) => patch({ employmentTypes: form.employmentTypes.includes(option) ? form.employmentTypes.filter((item) => item !== option) : [...form.employmentTypes, option] })} /></Field>
        <Field label="Work mode" required hint="Pick every way of working you accept.">
          <MultiSegmented options={['remote', 'hybrid', 'onsite'] as const} value={form.workModeChoices} onChange={(workModeChoices) => patch({ workModeChoices })} labels={{ remote: 'Remote', hybrid: 'Hybrid', onsite: 'On-site' }} />
          {form.workModeChoices.includes('hybrid') && <div className="wz-hybrid"><span>{form.hybridDays} office day{form.hybridDays === 1 ? '' : 's'}/week</span><input className="wz-slider" type="range" min={0} max={5} value={form.hybridDays} onChange={(e) => patch({ hybridDays: Number(e.target.value) })} /></div>}
        </Field>
        {/* Candidates give a minimum only, no maximum (founder, 2026-11-25). */}
        <Field label="Minimum salary (optional)" hint="Shared only as a compatibility badge until you match.">
          <div className="wz-salary">
            <TextInput type="number" min={0} placeholder="Minimum" value={form.salaryMin} onChange={(e) => patch({ salaryMin: e.target.value })} aria-label="Salary minimum" />
            <select className="wz-input wz-select" value={form.currency} onChange={(e) => patch({ currency: e.target.value })} aria-label="Currency">{CURRENCIES.map((currency) => <option key={currency}>{currency}</option>)}</select>
            <span>/</span>
            <select className="wz-input wz-select" value={form.salaryPeriod} onChange={(e) => patch({ salaryPeriod: e.target.value })} aria-label="Pay period">{SALARY_PERIODS.map((period) => <option key={period}>{period}</option>)}</select>
          </div>
          <div className="wz-inline"><Toggle checked={form.salaryNegotiable} onChange={(salaryNegotiable) => patch({ salaryNegotiable })} label="Negotiable" /></div>
        </Field>
        <Field label="Availability (optional)"><Segmented options={AVAILABILITIES} value={form.availability as typeof AVAILABILITIES[number] | undefined} onChange={(availability) => patch({ availability })} /></Field>
        <div className="wz-row">
          <Field label="Preferred company size"><select className="wz-input wz-select" value={form.companySize} onChange={(e) => patch({ companySize: e.target.value })}><option value="">No preference</option>{COMPANY_SIZES.map((size) => <option key={size}>{size}</option>)}</select></Field>
          <Field label="Travel willingness"><TextInput value={form.travel} onChange={(e) => patch({ travel: e.target.value })} placeholder="e.g. Up to 25%" /></Field>
        </div>
        <Field label="Preferred industries"><TagInput value={form.prefIndustries} onChange={(prefIndustries) => patch({ prefIndustries })} suggestions={['SaaS', 'Fintech', 'Health', 'AI', 'E-commerce', 'Telecom']} /></Field>
        <Field label="Open to relocating">
          <Toggle checked={form.relocateOpen} onChange={(relocateOpen) => patch({ relocateOpen })} label={form.relocateOpen ? 'Yes — I would relocate for the right role' : 'No — match me near my city'} />
          {form.relocateOpen && <TagInput value={form.relocateLocations} onChange={(relocateLocations) => patch({ relocateLocations })} placeholder="Cities or countries you'd move to" />}
        </Field>
        <Field label="Work-style tags (optional)" hint="Pick up to 6 that describe how you work best."><Chips options={WORK_STYLES} value={form.workStyle} onToggle={(option) => patch({ workStyle: form.workStyle.includes(option) ? form.workStyle.filter((item) => item !== option) : form.workStyle.length < 6 ? [...form.workStyle, option] : form.workStyle })} /></Field>
      </div>}

      {step === 3 && <div className="wz-body">
        <p className="wz-hint" style={{ margin: '-6px 0 4px' }}>Pick a professional identity for a prefilled starting point, personalize it, and edit anything — or skip the picker and write your own.</p>
        <Field label="Choose your professional identity" hint={`Pick up to ${MAX_IDENTITIES}. Sets a prefilled About Me you can edit below.`}>
          <div className="wz-chips">
            {ARCHETYPES.map((a) => { const on = form.aboutMeArchetypes.includes(a.id); const full = !on && form.aboutMeArchetypes.length >= MAX_IDENTITIES; return <button type="button" key={a.id} className={on ? 'active' : ''} aria-pressed={on} disabled={full} onClick={() => pickArchetype(a)}>{a.cardTitle}</button>; })}
          </div>
        </Field>
        <Field label="Supporting traits (optional)" hint="Pick up to 6."><Chips options={ABOUT_ME_TRAITS} value={form.humanSkills} onToggle={(option) => patch({ humanSkills: form.humanSkills.includes(option) ? form.humanSkills.filter((item) => item !== option) : form.humanSkills.length < 6 ? [...form.humanSkills, option] : form.humanSkills })} /></Field>
        <div className="wz-row">
          <Field label="I am at my best when… (optional)"><TextInput value={aboutMeAnswers.bestWhen} onChange={(e) => setAboutMeAnswers({ ...aboutMeAnswers, bestWhen: e.target.value })} /></Field>
          <Field label="People can rely on me to… (optional)"><TextInput value={aboutMeAnswers.relyOnMe} onChange={(e) => setAboutMeAnswers({ ...aboutMeAnswers, relyOnMe: e.target.value })} /></Field>
        </div>
        <Field label="A result I am proud of is… (optional)"><TextInput value={aboutMeAnswers.proudResult} onChange={(e) => setAboutMeAnswers({ ...aboutMeAnswers, proudResult: e.target.value })} /></Field>
        {chosenArchetypes.length > 0 && <button type="button" className="secondary-button" onClick={() => patch({ presentation: composeAboutMe(chosenArchetypes, aboutMeAnswers) })}>Apply answers to About Me text</button>}
        <Field label="About Me" required hint="Recruiters read this first. Personalize the template above or write your own — either way, edit freely.">
          <textarea className="wz-input wz-textarea" rows={8} value={form.presentation} onChange={(e) => patch({ presentation: e.target.value })} placeholder="Choose an identity above to start from a template, or write your own." />
        </Field>
      </div>}

      {step === 4 && <div className="wz-body">
        <Field label="Mindset" hint="Pick a few traits that describe you."><Chips options={MINDSET_SUGGESTIONS} value={form.mindset} onToggle={(option) => patch({ mindset: form.mindset.includes(option) ? form.mindset.filter((item) => item !== option) : form.mindset.length < 5 ? [...form.mindset, option] : form.mindset })} /></Field>
        <div className="wz-row">
          <Field label="I thrive with"><TagInput value={form.workingPrefer} onChange={(workingPrefer) => patch({ workingPrefer })} placeholder="e.g. Clear objectives — press Enter" /></Field>
          <Field label="I avoid"><TagInput value={form.workingAvoid} onChange={(workingAvoid) => patch({ workingAvoid })} placeholder="e.g. Constant meetings — press Enter" /></Field>
        </div>
        <Field label="Interests" hint="Optional conversation starters."><TagInput value={form.interests} onChange={(interests) => patch({ interests })} suggestions={INTEREST_SUGGESTIONS} /></Field>
        <Field label="Favorite song (optional)" hint="Spotify or YouTube link — opens externally, never autoplays."><TextInput value={form.favoriteSong} onChange={(e) => patch({ favoriteSong: e.target.value })} placeholder="https://…" /></Field>
      </div>}

      {step === 5 && <div className="wz-body">
        <Field label="Recommendations (optional)" hint="Add recommendations former recruiters or managers have given you. Only ones you approve appear on your profile.">
          <Repeat items={form.recommendations} onChange={(recommendations) => patch({ recommendations })} blank={() => ({ recruiterName: '', recommenderEmail: '', role: '', company: '', relationship: '', text: '' })} addLabel="Add a recommendation"
            render={(item, update) => <div className="wz-repeat-grid">
              <TextInput placeholder="Their name" value={item.recruiterName || ''} onChange={(e) => update({ recruiterName: e.target.value })} />
              <TextInput placeholder="Their email (optional)" type="email" value={item.recommenderEmail || ''} onChange={(e) => update({ recommenderEmail: e.target.value })} />
              <TextInput placeholder="Their role" value={item.role || ''} onChange={(e) => update({ role: e.target.value })} />
              <TextInput placeholder="Company" value={item.company || ''} onChange={(e) => update({ company: e.target.value })} />
              <TextInput placeholder="Relationship (e.g. Former manager)" value={item.relationship || ''} onChange={(e) => update({ relationship: e.target.value })} />
              <textarea className="wz-input wz-textarea" placeholder="What they said about working with you" value={item.text || ''} onChange={(e) => update({ text: e.target.value })} />
            </div>} />
        </Field>
        {/* Recommendation letters as files (founder, 2026-11-25): same uploader as the Recommendations card. */}
        <Field label="Recommendation letters (optional)" hint="Upload letters as PDF, Word or image (up to 5, 10 MB each). Recruiters can open them after a mutual match.">
          <RecommendationLetters userId={viewer.id} initial={viewer.documents?.recommendationDocs || []} editable canOpen />
        </Field>
        <Field label="Who can see your profile" hint="Defaults to all recruiters — change anytime.">
          <Segmented options={['all', 'after-swipe', 'paused'] as const} value={form.visibility} onChange={(visibility) => patch({ visibility })} labels={{ all: 'All recruiters', 'after-swipe': 'Only after I swipe', paused: 'Paused' }} />
        </Field>
        <Field label="Blocked companies" hint="They will never see your profile."><TagInput value={form.blockedCompanies} onChange={(blockedCompanies) => patch({ blockedCompanies })} placeholder="Company name — press Enter" /></Field>
        <Field label="Open to work" required><Toggle checked={form.openToWork} onChange={(openToWork) => patch({ openToWork })} label={form.openToWork ? 'Actively looking' : 'Not looking right now'} /></Field>
      </div>}

      {step === 6 && <div className="wz-body">
        <div className="wz-row">
          <Field label="GitHub"><TextInput value={form.links.github || ''} onChange={(e) => patch({ links: { ...form.links, github: e.target.value } })} placeholder="github.com/…" /></Field>
          <Field label="Portfolio"><TextInput value={form.links.portfolio || ''} onChange={(e) => patch({ links: { ...form.links, portfolio: e.target.value } })} /></Field>
        </div>
        <div className="wz-row">
          <Field label="App Store link (optional)"><TextInput value={form.links.appStore || ''} onChange={(e) => patch({ links: { ...form.links, appStore: e.target.value } })} placeholder="apps.apple.com/…" /></Field>
          <Field label="Play Store link (optional)"><TextInput value={form.links.playStore || ''} onChange={(e) => patch({ links: { ...form.links, playStore: e.target.value } })} placeholder="play.google.com/…" /></Field>
        </div>
        <Field label="Publications (optional)" hint="Links to articles, papers, or talks you've published."><TagInput value={form.publications} onChange={(publications) => patch({ publications })} placeholder="Paste a URL — press Enter" /></Field>
      </div>}

      {(attempted && errors.length > 0) && <ul className="wz-errors">{errors.map((message) => <li key={message}>{message}</li>)}</ul>}
      {error && <p className="auth-error">{error}</p>}

      <footer className="wz-foot">
        {step > 0 ? <button className="secondary-button" onClick={() => { setStep(step - 1); setAttempted(false); }}><ArrowLeft size={16} /> Back</button> : onCancel ? <button className="secondary-button" onClick={onCancel}>Cancel</button> : <span />}
        <div className="wz-foot-actions">
          {step === CANDIDATE_REQUIRED_STEPS && <button className="secondary-button" onClick={skipRest} disabled={saving}>Skip &amp; finish</button>}
          <button className="primary-button" onClick={next} disabled={saving || uploading}>
            {saving ? <Loader2 size={16} className="spin" /> : finishing ? <><Check size={16} /> Finish profile</> : <>Continue <ArrowRight size={16} /></>}
          </button>
        </div>
      </footer>
    </div>
    {showCamera && <CameraCaptureModal onClose={() => setShowCamera(false)} onCapture={(blob) => { setShowCamera(false); void uploadPhoto(blob); }} />}
  </div>;
}
