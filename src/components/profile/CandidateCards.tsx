import { useEffect, useRef, useState } from 'react';
import { Award, Upload, Zap, BadgeCheck, Brain, Briefcase, CalendarClock, CheckCircle2, Code2, Coffee, Download, FileText, Github, Globe, Hammer, Heart, Home, Languages, Link2, Lock, MapPin, MessageCircle, Music2, Pencil, Phone, Plane, PlusCircle, Quote, Send, ShieldCheck, Smartphone, Sparkles, Star, Target, User, Wallet, X, XCircle } from 'lucide-react';
import { api, apiBase } from '../../api';
import { jobStatusText } from '../JobStatusPicker';
import type { ContactChannel, MatchEvidence, Person } from '../../types';

/** github.com/x -> https://github.com/x, otherwise pass real URLs through. */
function normalizeUrl(url: string): string {
  return /^https?:/.test(url) ? url : `https://${url}`;
}

/** Age from an ISO birthdate, or undefined. */
function ageFrom(birthdate?: string): number | undefined {
  if (!birthdate) return undefined;
  const born = new Date(birthdate);
  if (Number.isNaN(born.getTime())) return undefined;
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  if (now.getMonth() < born.getMonth() || (now.getMonth() === born.getMonth() && now.getDate() < born.getDate())) age -= 1;
  return age >= 14 && age <= 100 ? age : undefined;
}

const CONTACT_META: Record<ContactChannel['type'], { label: string; icon: typeof Phone }> = {
  whatsapp: { label: 'WhatsApp', icon: MessageCircle }, telegram: { label: 'Telegram', icon: Send },
  phone: { label: 'Phone', icon: Phone }, signal: { label: 'Signal', icon: MessageCircle },
  wechat: { label: 'WeChat', icon: MessageCircle }, zalo: { label: 'Zalo', icon: MessageCircle },
  email: { label: 'Email', icon: Send }, other: { label: 'Contact', icon: MessageCircle },
};

/** Spotify/YouTube link kept as an external link (no autoplay), per privacy guidance. */
function songLabel(url?: string): string | null {
  if (!url) return null;
  try { const u = new URL(url); if (u.hostname.includes('spotify')) return 'Open in Spotify'; if (u.hostname.includes('youtu')) return 'Open on YouTube'; return 'Open link'; }
  catch { return null; }
}

function Card({ label, icon: Icon, step, onEdit, children, tone }: { label: string; icon: typeof Star; step?: number; onEdit?: (step: number) => void; children: React.ReactNode; tone?: string }) {
  return <div className={tone ? `tcard tcard-${tone}` : 'tcard'}>
    <header className="tcard-head"><span className="tcard-label"><Icon size={15} /> {label}</span>
      {onEdit && step !== undefined && <button className="tcard-edit" onClick={() => onEdit(step)} aria-label={`Edit ${label}`}><Pencil size={13} /></button>}
    </header>
    <div className="tcard-scroll">{children}</div>
  </div>;
}

const NAV = [
  { icon: User, label: 'Who I am', color: '#00C7BE' },
  { icon: Brain, label: 'My Human Stack', color: '#FF9500' },
  { icon: Code2, label: 'My Skills', color: '#007AFF' },
  { icon: Hammer, label: 'What I Have Built', color: '#5856D6' },
  { icon: Target, label: 'My Dream Job', color: '#AF52DE' },
  { icon: Star, label: 'Recommendations', color: '#FF2D55' },
  { icon: Award, label: 'Certifications', color: '#34C759' },
  { icon: Zap, label: 'My Super Power', color: '#FFB800' },
];
const LAST_CARD = NAV.length - 1;

/**
 * The candidate as a horizontal deck of five Tinder-style cards with a 5-icon
 * navigator. Used for the candidate's own profile (onEdit set, unlocked) and for
 * a recruiter viewing a candidate (match set → skill split + %, unlocked only
 * after a mutual match, so name and contacts stay masked until then).
 */
// Card numbers: 0 Who I am, 1 Human Stack, 2 Skills, 3 Built, 4 Dream Job, 5 Recommendations, 6 Certifications, 7 Super Power.
const DEFAULT_ORDER = [0, 1, 2, 3, 4, 6, 5, 7];

/** `order` lists card numbers (NAV indexes) in display order; positions (initialCard, onActiveChange) follow that order. */
export function CandidateCards({ person: p, match, onEdit, unlocked = false, visibilityInspector = false, initialCard = 0, onActiveChange, order = DEFAULT_ORDER }: { person: Person; match?: MatchEvidence; onEdit?: (step: number) => void; unlocked?: boolean; visibilityInspector?: boolean; initialCard?: number; onActiveChange?: (card: number) => void; order?: number[] }) {
  const m = match || p.match;
  const deckRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(initialCard);

  // Target the slide's own offsetLeft rather than index * clientWidth — the
  // deck can still be mid-layout (modal/page transition) when this first runs,
  // and a stale clientWidth left cards permanently offset with slivers of the
  // neighbouring card bleeding in on both sides.
  const goTo = (i: number) => {
    const deck = deckRef.current; if (!deck) return;
    const target = deck.children[i] as HTMLElement | undefined;
    if (target) deck.scrollTo({ left: target.offsetLeft, behavior: 'auto' });
  };
  useEffect(() => {
    const deck = deckRef.current; if (!deck) return;
    const raf = requestAnimationFrame(() => {
      const target = deck.children[initialCard] as HTMLElement | undefined;
      deck.scrollLeft = target ? target.offsetLeft : 0;
    });
    const onScroll = () => {
      const next = Math.max(0, Math.min(LAST_CARD, Math.round(deck.scrollLeft / deck.clientWidth)));
      setActive(next);
      onActiveChange?.(next);
    };
    deck.addEventListener('scroll', onScroll, { passive: true });
    return () => { cancelAnimationFrame(raf); deck.removeEventListener('scroll', onScroll); };
  }, [initialCard, onActiveChange]);

  const onDeckKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') { event.preventDefault(); goTo(Math.max(0, active - 1)); }
    if (event.key === 'ArrowRight') { event.preventDefault(); goTo(Math.min(LAST_CARD, active + 1)); }
    if (event.key === 'Home') { event.preventDefault(); goTo(0); }
    if (event.key === 'End') { event.preventDefault(); goTo(LAST_CARD); }
  };

  const showAge = p.birthdate && (p.agePrivacy === 'public' || p.discloseAge || (p.agePrivacy === 'after-match' && unlocked));
  const age = showAge ? ageFrom(p.birthdate) : undefined;
  const verified = p.verified || (p.completeness ?? 0) >= 80 || p.provider === 'google' || p.provider === 'linkedin';
  const parts = (p.name || '').trim().split(/\s+/);
  const displayName = unlocked || parts.length < 2 ? p.name : `${parts[0]} ${parts[parts.length - 1][0]}.`;
  const languages = p.languageDetail?.length ? p.languageDetail : (p.languages || []).map((name) => ({ name, level: '' }));
  const availability = p.preferences?.availability || p.availability;
  const salary = p.preferences?.salary;
  const wm = p.preferences?.workMode;
  const skill = (name: string) => p.skillsDetail?.find((s) => s.name === name);
  const requiredCount = m ? m.matchedSkills.length + (m.missingSkills?.length ?? 0) : 0;

  // Recommendations-card aggregate rating across recommendations that carry category ratings.
  const rated = (p.recommendations || []).map((r) => r.ratings ? Object.values(r.ratings) : []).filter((v) => v.length);
  const avgRating = rated.length ? rated.flat().reduce((a, b) => a + b, 0) / rated.flat().length : undefined;
  const song = songLabel(p.favoriteSong);
  const hasBuiltLinks = Boolean(p.links?.github || p.links?.website || p.links?.portfolio || p.links?.appStore || p.links?.playStore);

  // Invite-a-recommender: only meaningful on your own profile (onEdit set).
  // Local state only — the request is already durable server-side; this just
  // reflects it in the UI immediately without threading a data-refresh
  // callback through every place CandidateCards is used.
  const [inviteContact, setInviteContact] = useState('');
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [pendingRequests, setPendingRequests] = useState(p.recommendationRequests || []);
  const sendInvite = async () => {
    if (!inviteContact.trim()) return;
    setInviteSending(true); setInviteError('');
    try {
      const { request } = await api.requestRecommendation({ userId: p.id, contact: inviteContact.trim() });
      setPendingRequests((prev) => [...prev, request]);
      setInviteContact('');
    } catch (e) { setInviteError(e instanceof Error ? e.message : 'Could not send that request'); }
    finally { setInviteSending(false); }
  };
  // Recommendation letters (owner uploads; matched recruiters open). Local list so uploads show at once.
  const [recDocs, setRecDocs] = useState(p.documents?.recommendationDocs || []);
  const [letterBusy, setLetterBusy] = useState(false);
  const [letterError, setLetterError] = useState('');
  const canOpenLetters = Boolean(onEdit) || unlocked;
  const uploadLetter = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) { setLetterError('Files must be 10 MB or smaller'); return; }
    setLetterBusy(true); setLetterError('');
    try { const { doc } = await api.uploadRecommendationDoc(p.id, file); setRecDocs((prev) => [...prev, doc]); }
    catch (e) { setLetterError(e instanceof Error ? e.message : 'Upload failed'); }
    finally { setLetterBusy(false); }
  };
  const removeLetter = async (docId: string) => {
    try { await api.deleteRecommendationDoc(p.id, docId); setRecDocs((prev) => prev.filter((d) => d.id !== docId)); }
    catch (e) { setLetterError(e instanceof Error ? e.message : 'Could not remove it'); }
  };
  // My Super Power (owner edits inline).
  const [power, setPower] = useState(p.superPower || '');
  const [powerBusy, setPowerBusy] = useState(false);
  const [powerSaved, setPowerSaved] = useState(false);
  const savePower = async () => {
    setPowerBusy(true);
    try { await api.updateProfile(p.id, { superPower: power.trim() }); setPowerSaved(true); }
    catch (e) { alert(e instanceof Error ? e.message : 'Could not save'); }
    finally { setPowerBusy(false); }
  };
  const cancelInvite = async (id: string) => {
    await api.cancelRecommendationRequest(id, p.id);
    setPendingRequests((prev) => prev.filter((r) => r.id !== id));
  };

  return <div className="tcards">
    {visibilityInspector && <div className="tcards-inspector" role="status"><span>Public</span><span>After mutual match</span><span>Private</span></div>}
    <div className="tcards-deck" ref={deckRef} tabIndex={0} onKeyDown={onDeckKeyDown} aria-label={`Candidate profile card ${active + 1} of ${NAV.length}`}>
      {order.map((i) => [
      /* ---------- Card 1 — Snapshot ---------- */
      <div className="tcard-slide" key="who">
        <div className="tcard tcard-hero" style={p.photo ? { backgroundImage: `url(${p.photo})` } : undefined}>
          {onEdit && <button className="tcard-edit on-photo" onClick={() => onEdit(0)} aria-label="Edit identity"><Pencil size={14} /></button>}
          {m && <span className="tcard-matchpct"><Sparkles size={13} /> {m.score}% match{requiredCount ? <b>{m.matchedSkills.length} of {requiredCount} skills</b> : null}</span>}
          <div className="tcard-hero-overlay">
            <h2>{displayName}{age !== undefined && <span className="tcard-age">{age}</span>}{verified && <BadgeCheck size={20} className="verified-mark" />}</h2>
            {p.pronouns && <span className="tcard-pronouns">{p.pronouns}</span>}
            <p className="tcard-hero-title"><Briefcase size={14} /> {p.title || p.headline}</p>
            {/* Job status, visible to recruiters (role and recruiter name stay private to the member). */}
            {p.role === 'candidate' && p.jobStatus?.kind && <span className={`tcard-status st-${p.jobStatus.kind}`}><i aria-hidden="true" />{jobStatusText(p.jobStatus)}</span>}
            <div className="tcard-hero-meta">
              {(p.city || p.country) && <span><MapPin size={13} /> {[p.city, p.country].filter(Boolean).join(', ')}</span>}
              {p.nationality && <span><Globe size={13} /> {p.nationality}</span>}
              {availability && <span className="avail"><i /> {availability === 'Now' ? 'Available now' : `Available ${availability}`}</span>}
            </div>
            {(p.workAuthorization || p.visaSponsorship !== undefined) && <div className="tcard-hero-meta">
              {p.workAuthorization && <span><ShieldCheck size={13} /> {p.workAuthorization}</span>}
              {p.visaSponsorship !== undefined && <span>{p.visaSponsorship ? 'Needs visa sponsorship' : 'No sponsorship needed'}</span>}
            </div>}
            {languages.length > 0 && <div className="tcard-langs"><Languages size={13} />{languages.map((l) => <span key={l.name}>{l.name}{l.level ? <i>{l.level}</i> : null}</span>)}</div>}
            <div className="tcard-contacts">
              {unlocked
                ? (p.contactChannels?.length || p.email)
                  ? <>{p.calendarLink && /^https:\/\//.test(p.calendarLink) && <a href={p.calendarLink} target="_blank" rel="noopener noreferrer" className="tcard-contact"><CalendarClock size={13} /> Book an interview</a>}
                    {p.email && <a href={`mailto:${p.email}`} className="tcard-contact"><Send size={13} /> {p.email}</a>}
                    {(p.contactChannels || []).map((c, i) => { const Meta = CONTACT_META[c.type] || CONTACT_META.other; return <span key={i} className="tcard-contact"><Meta.icon size={13} /> {Meta.label}: {c.value}</span>; })}</>
                  : <span className="tcard-contact muted"><Phone size={13} /> No contact details added</span>
                : <span className="tcard-contact locked"><Lock size={13} /> Contact details available after mutual match {visibilityInspector && <b className="visibility-tag">After mutual match</b>}</span>}
            </div>
          </div>
        </div>
      </div>,

      /* ---------- Card 2 — Human stack ---------- */
      <div className="tcard-slide" key="human"><Card label="My Human Stack" icon={Brain} step={3} onEdit={onEdit} tone="human">
        {p.presentation ? <p className="tcard-presentation">{p.presentation}</p> : onEdit ? <p className="tcard-empty">Add a short personal introduction — who you are beyond the CV.</p> : null}
        {p.motto ? <p className="tcard-motto"><Quote size={13} /> {p.motto}</p> : null}
        {p.mindset?.length ? <><span className="tcard-sub">Mindset</span><div className="skill-list soft">{p.mindset.map((s) => <span key={s}>{s}</span>)}</div></> : null}
        {p.humanSkills?.length ? <><span className="tcard-sub">Human capabilities</span><div className="skill-list soft">{p.humanSkills.map((s) => <span key={s}>{s}</span>)}</div></> : null}
        {(p.workingPrefer?.length || p.workingAvoid?.length) ? <div className="tcard-workprefs">
          {p.workingPrefer?.length ? <div><span className="tcard-sub ok">I thrive with</span><ul>{p.workingPrefer.map((s) => <li key={s}><CheckCircle2 size={12} /> {s}</li>)}</ul></div> : null}
          {p.workingAvoid?.length ? <div><span className="tcard-sub miss">I avoid</span><ul>{p.workingAvoid.map((s) => <li key={s}><XCircle size={12} /> {s}</li>)}</ul></div> : null}
        </div> : null}
        {p.interests?.length ? <><span className="tcard-sub">Interests</span><div className="skill-list soft">{p.interests.map((s) => <span key={s}>{s}</span>)}</div></> : null}
        {song ? <a className="tdoc-btn ghost tcard-song" href={p.favoriteSong} target="_blank" rel="noreferrer"><Music2 size={13} /> Soundtrack — {song}</a> : null}
      </Card></div>,

      /* ---------- Card 3 — Technical stack & documents ---------- */
      <div className="tcard-slide" key="skills"><Card label="My Skills" icon={Code2} step={1} onEdit={onEdit}>
        {m && <div className="tcard-counts"><span className="ok">{m.matchedSkills.length} matching</span><span className="miss">{m.missingSkills?.length ?? 0} missing</span><span className="extra">{m.extraSkills?.length ?? 0} extra</span></div>}
        {m ? <div className="tcard-skillsplit">
          <div className="tskill-group ok"><span className="tskill-h"><CheckCircle2 size={13} /> Matching</span><ul className="tskill-rows">{m.matchedSkills.length ? m.matchedSkills.map((s) => { const d = skill(s); return <li key={s}><b>{s}</b>{d?.years ? <em>{d.years}y</em> : null}{d?.level ? <i>{'●'.repeat(d.level)}{'○'.repeat(5 - d.level)}</i> : null}</li>; }) : <li><em>None yet</em></li>}</ul></div>
          {(m.missingSkills?.length ?? 0) > 0 && <div className="tskill-group miss"><span className="tskill-h"><XCircle size={13} /> Development gaps</span><div className="skill-list">{m.missingSkills!.map((s) => <span key={s} className="miss">{s}</span>)}</div></div>}
          {(m.extraSkills?.length ?? 0) > 0 && <div className="tskill-group extra"><span className="tskill-h"><PlusCircle size={13} /> Additional value</span><div className="skill-list">{m.extraSkills!.map((s) => <span key={s}>{s}</span>)}</div></div>}
        </div> : <div className="skill-list pf-skills">{(p.skillsDetail || (p.skills || []).map((name) => ({ name, level: 0, years: undefined }))).map((s) => <span key={s.name}>{s.name}{s.years ? <em className="pf-skill-years">{s.years}y</em> : null}{s.level ? <i className="pf-skill-level">{'●'.repeat(s.level)}{'○'.repeat(5 - s.level)}</i> : null}</span>)}</div>}
        {p.documents?.resume && <div className="tcard-docs">
          <a className="tdoc-btn" href={p.documents.resume.previewUrl || p.documents.resume.url} target="_blank" rel="noreferrer"><FileText size={14} /> Read resume</a>
          <a className="tdoc-btn ghost" href={p.documents.resume.url} download><Download size={14} /> PDF</a>
        </div>}
        {p.documents?.coverLetter && <p className="tcard-cover"><Quote size={13} /> {p.documents.coverLetter}</p>}
      </Card></div>,

      /* ---------- Card 4 — What I Have Built ---------- */
      <div className="tcard-slide" key="built"><Card label="What I Have Built" icon={Hammer} step={6} onEdit={onEdit}>
        {hasBuiltLinks ? <div className="tcard-docs">
          {p.links?.github && <a className="tdoc-btn ghost" href={normalizeUrl(p.links.github)} target="_blank" rel="noreferrer"><Github size={13} /> GitHub</a>}
          {p.links?.website && <a className="tdoc-btn ghost" href={normalizeUrl(p.links.website)} target="_blank" rel="noreferrer"><Globe size={13} /> Website</a>}
          {p.links?.portfolio && <a className="tdoc-btn ghost" href={normalizeUrl(p.links.portfolio)} target="_blank" rel="noreferrer"><Link2 size={13} /> Portfolio</a>}
          {p.links?.appStore && <a className="tdoc-btn ghost" href={normalizeUrl(p.links.appStore)} target="_blank" rel="noreferrer"><Smartphone size={13} /> App Store</a>}
          {p.links?.playStore && <a className="tdoc-btn ghost" href={normalizeUrl(p.links.playStore)} target="_blank" rel="noreferrer"><Smartphone size={13} /> Play Store</a>}
        </div> : <p className="tcard-empty">{onEdit ? 'Add links to things you\'ve shipped — GitHub, an app, a website, a publication.' : 'Nothing shared yet.'}</p>}
        {p.publications?.length ? <><span className="tcard-sub">Publications</span><div className="tcard-docs">{p.publications.map((url, i) => <a key={i} className="tdoc-btn ghost" href={normalizeUrl(url)} target="_blank" rel="noreferrer"><FileText size={13} /> {url.replace(/^https?:\/\//, '').slice(0, 40)}</a>)}</div></> : null}
      </Card></div>,

      /* ---------- Card 5 — My Dream Job (career & preferences) ---------- */
      <div className="tcard-slide" key="dream"><Card label="My Dream Job" icon={Target} step={2} onEdit={onEdit}>
        {p.preferences?.desiredRoles?.length ? <><span className="tcard-sub">Target roles</span><div className="skill-list soft">{p.preferences.desiredRoles.map((r) => <span key={r}>{r}</span>)}</div></> : null}
        <dl className="tcard-dl">
          {p.preferences?.employmentTypes?.length ? <div><dt><Briefcase size={12} /> Employment</dt><dd>{p.preferences.employmentTypes.join(' · ')}</dd></div> : null}
          {wm ? <div><dt><Home size={12} /> Work mode</dt><dd>{wm.mode === 'hybrid' ? `Hybrid · max ${wm.hybridDays ?? 2} office days/wk` : wm.mode === 'onsite' ? 'On-site' : 'Remote'}</dd></div> : null}
          {salary && salary.min !== undefined ? <div><dt><Wallet size={12} /> Salary</dt><dd>{salary.min?.toLocaleString()}–{salary.max?.toLocaleString()} {salary.currency}/{salary.period || 'year'}{salary.negotiable ? ' · negotiable' : ''}</dd></div> : null}
          {availability ? <div><dt><CalendarClock size={12} /> Available</dt><dd>{availability}{p.preferences?.noticePeriod ? ` · ${p.preferences.noticePeriod} notice` : ''}</dd></div> : null}
          {p.distanceRangeKm !== undefined ? <div><dt><MapPin size={12} /> Max commute</dt><dd>{p.distanceRangeKm} km</dd></div> : null}
          {p.preferences?.relocate?.open ? <div><dt><Plane size={12} /> Relocation</dt><dd>Open · {p.preferences.relocate.locations?.join(', ') || 'anywhere'}</dd></div> : null}
          {p.preferences?.travel ? <div><dt>Travel</dt><dd>{p.preferences.travel}</dd></div> : null}
          {p.preferences?.companySize ? <div><dt>Company size</dt><dd>{p.preferences.companySize}</dd></div> : null}
        </dl>
        {(p.preferences?.industries?.length || p.industries?.length) ? <><span className="tcard-sub">Industries</span><div className="skill-list soft">{(p.preferences?.industries || p.industries || []).map((s) => <span key={s}>{s}</span>)}</div></> : null}
        {p.preferences?.workStyle?.length ? <><span className="tcard-sub">Work style</span><div className="skill-list soft">{p.preferences.workStyle.map((s) => <span key={s}>{s}</span>)}</div></> : null}
      </Card></div>,

      /* ---------- Card 6 — Recommendations (written + uploaded letters) ---------- */
      <div className="tcard-slide" key="people"><Card label="Recommendations" icon={Star} step={5} onEdit={onEdit}>
        {avgRating !== undefined && <div className="tcard-rating"><strong>{avgRating.toFixed(1)}</strong><div className="tcard-stars">{[1, 2, 3, 4, 5].map((n) => <Star key={n} size={14} className={n <= Math.round(avgRating) ? 'on' : ''} />)}</div><small>{p.recommendations!.length} recommendation{p.recommendations!.length > 1 ? 's' : ''}</small></div>}
        {p.recommendations?.length ? <ul className="tcard-recs">{p.recommendations.map((r, i) => <li key={i}>
          <div className="trec-head">{r.photo && <img src={r.photo} alt="" />}<div><strong>{r.recruiterName}{r.verified && <BadgeCheck size={13} className="verified-mark" />}</strong>{(r.role || r.company) && <small>{[r.role, r.company].filter(Boolean).join(' · ')}</small>}{r.relationship && <em className="trec-rel">{r.relationship}</em>}</div></div>
          <p>“{r.text}”</p>
          {r.candidateResponse && <p className="trec-response"><Quote size={11} /> {r.candidateResponse}</p>}
          <div className="trec-foot">{r.wouldWorkAgain && <span className="trec-again"><Heart size={11} /> Would work with again</span>}{r.date && <time>{r.date}</time>}</div>
          {r.recommenderEmail && <p className="trec-email"><Send size={11} /> {r.recommenderEmail}</p>}
        </li>)}</ul> : <p className="tcard-empty"><Coffee size={14} /> {onEdit ? 'Invite former recruiters or managers to recommend you (optional).' : 'No public recommendations yet.'}</p>}
        {/* Recommendation letters (PDF, Word, image): owner + matched recruiters can open them. */}
        {(onEdit || recDocs.length > 0) && <div className="tcard-letters">
          <span className="tcard-sub">Recommendation letters</span>
          {recDocs.length > 0 ? <ul className="tcard-letter-list">{recDocs.map((d) => <li key={d.id}>
            <FileText size={14} />
            {canOpenLetters ? <a href={api.recommendationDocUrl(p.id, d.id)} target="_blank" rel="noreferrer">{d.originalName}</a> : <span>{d.originalName}</span>}
            <em>{d.ext.toUpperCase()} · {Math.max(1, Math.round(d.size / 1024))} KB</em>
            {onEdit && <button type="button" onClick={() => void removeLetter(d.id)} aria-label={`Remove ${d.originalName}`}><X size={12} /></button>}
          </li>)}</ul> : <p className="tcard-empty">Upload letters from former managers or clients. Recruiters can read them after a mutual match.</p>}
          {!canOpenLetters && recDocs.length > 0 && <p className="tcard-contact locked"><Lock size={13} /> Letters open after a mutual match</p>}
          {onEdit && recDocs.length < 5 && <label className="tcard-invite-btn tcard-upload">
            <input type="file" accept=".pdf,.doc,.docx,image/png,image/jpeg,image/webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadLetter(f); e.target.value = ''; }} />
            {letterBusy ? 'Uploading…' : <><Upload size={13} /> Upload a letter (PDF, Word or image)</>}
          </label>}
          {letterError && <p className="tcard-invite-error">{letterError}</p>}
        </div>}
        {onEdit && <div className="tcard-invite">
          <span className="tcard-sub">Invite a recommender</span>
          <div className="tcard-invite-row">
            <input className="tcard-invite-input" value={inviteContact} onChange={(event) => setInviteContact(event.target.value)} placeholder="LinkedIn profile URL or professional email" />
            <button type="button" className="tcard-invite-btn" onClick={() => void sendInvite()} disabled={inviteSending || !inviteContact.trim()}>{inviteSending ? 'Sending…' : 'Request'}</button>
          </div>
          {inviteError && <p className="tcard-invite-error">{inviteError}</p>}
          {pendingRequests.length > 0 && <ul className="tcard-invite-list">{pendingRequests.map((r) => <li key={r.id}><span>{r.contact}</span><button type="button" onClick={() => void cancelInvite(r.id)} aria-label={`Cancel request to ${r.contact}`}><X size={12} /></button></li>)}</ul>}
        </div>}
      </Card></div>,

      /* ---------- Card 7 — Certifications ---------- */
      <div className="tcard-slide" key="certs"><Card label="Certifications" icon={Award} step={1} onEdit={onEdit}>
        {p.certifications?.length ? <ul className="tcard-certs">{p.certifications.map((c) => <li key={c}><Award size={15} /><span>{c}</span></li>)}</ul>
          : <p className="tcard-empty">{onEdit ? 'Add certifications (AWS, Google, Scrum, language tests…) with the pencil.' : 'No certifications listed.'}</p>}
      </Card></div>,

      /* ---------- Card 8 — My Super Power ---------- */
      <div className="tcard-slide" key="power"><Card label="My Super Power" icon={Zap} tone="power">
        {onEdit ? <div className="tcard-power-edit">
          <p className="tcard-power-hint">The one thing you are exceptionally good at, in your own words. For example: “I’m very creative”, “I can code blindfolded”, “I calm down any angry customer in 5 minutes”.</p>
          <textarea value={power} maxLength={300} rows={4} onChange={(e) => { setPower(e.target.value); setPowerSaved(false); }} placeholder="My super power is…" aria-label="My super power" />
          <div className="tcard-power-row"><small>{power.length}/300</small>
            <button type="button" className="tcard-invite-btn" disabled={powerBusy || power.trim() === (p.superPower || '')} onClick={() => void savePower()}>{powerBusy ? 'Saving…' : powerSaved ? 'Saved' : 'Save'}</button></div>
        </div>
          : p.superPower ? <p className="tcard-power"><Zap size={20} /> {p.superPower}</p> : <p className="tcard-empty">No super power shared yet.</p>}
      </Card></div>,
      ][i])}
    </div>

    {/* ---------- Navigator (same order as the deck) ---------- */}
    <nav className="tcards-nav" aria-label="Profile cards">
      {order.map((card) => NAV[card]).map((item, i) => { const Icon = item.icon; return <button key={item.label} className={i === active ? 'on' : ''} style={{ ['--nav-c' as string]: item.color }} onClick={() => goTo(i)} aria-label={item.label} aria-current={i === active ? 'page' : undefined}><Icon size={16} /><span>{item.label}</span><i /></button>; })}
    </nav>
    {/* Download the candidate's resume: owner and matched recruiters (server checks the same rule). */}
    {p.documents?.resume && <div className="tcards-resume">
      {canOpenLetters
        ? <a className="primary-button small" href={`${apiBase}/api/users/${encodeURIComponent(p.id)}/resume/original`} download={p.documents.resume.originalName}><Download size={15} /> Download {onEdit ? 'my' : 'candidate'} resume</a>
        : <span className="tcard-contact locked"><Lock size={13} /> Resume download unlocks after a mutual match</span>}
    </div>}
  </div>;
}
