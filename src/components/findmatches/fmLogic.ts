// "Find your Matches" studio: pure rules (no React) so they can be tested with node --test.
// Cards show only real values from the job or profile; a missing value is left out, never invented.
import type { Bootstrap, Job, JobMatch, Message, Person, Role } from '../../types';

export type CardFact = { kind: 'remote' | 'place' | 'salary' | 'fit' | 'level' | 'company'; text: string };
export type CardSlide = { title: string; chips: string[]; highlight?: string[]; text?: string };
export type StudioCard = {
  id: string; kind: 'job' | 'person'; name: string; age?: number; subtitle: string; verified: boolean;
  photo: string; initials: string; signal?: 'superliked' | 'liked'; facts: CardFact[]; slides: CardSlide[];
};

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]?.toUpperCase()).join('') || '?';
}

function signalOf(item: { superLikedYou?: boolean; likedYou?: boolean }) {
  return item.superLikedYou ? 'superliked' as const : item.likedYou ? 'liked' as const : undefined;
}

function fitText(score?: number) { return typeof score === 'number' ? `${score}% fit` : ''; }

/** A role as a swipe card: cover image (else the hiring contact's photo), place, salary, fit; skills and perks as slides. */
export function jobCard(job: Job): StudioCard {
  const facts: CardFact[] = [{ kind: 'company', text: [job.company, job.experienceLevel].filter(Boolean).join(' · ') }];
  if (job.workMode === 'Remote') facts.push({ kind: 'remote', text: job.remoteScope === 'worldwide' ? 'Remote, worldwide' : 'Remote' });
  else if (job.location) facts.push({ kind: 'place', text: job.distanceKm !== undefined ? `${job.location} · ${job.distanceKm} km away` : `${job.location} · ${job.workMode}` });
  if (!job.salaryHidden && job.salary) facts.push({ kind: 'salary', text: job.salary });
  else facts.push({ kind: 'salary', text: 'Salary shown when you match' });
  const fit = fitText(job.match?.score);
  if (fit) facts.push({ kind: 'fit', text: fit });
  const slides: CardSlide[] = [];
  if (job.requiredSkills?.length) slides.push({ title: 'Skills', chips: job.requiredSkills.slice(0, 12), highlight: job.match?.matchedSkills || [] });
  const perks = [...(job.benefits || []), ...(job.culture || [])].filter(Boolean).slice(0, 10);
  if (perks.length) slides.push({ title: 'Perks & culture', chips: perks });
  if (job.mission || job.description) slides.push({ title: 'About the role', chips: [], text: (job.mission || job.description).slice(0, 220) });
  return {
    id: job.id, kind: 'job', name: job.title, subtitle: job.company, verified: Boolean(job.verified),
    photo: job.coverImage || job.recruiter?.photo || '', initials: initials(job.company), signal: signalOf(job), facts, slides,
  };
}

function ageOf(person: Person, now = Date.now()) {
  if (!person.birthdate || person.agePrivacy !== 'public' || person.discloseAge === false) return undefined;
  const born = new Date(person.birthdate).getTime();
  if (Number.isNaN(born)) return undefined;
  return Math.floor((now - born) / (365.25 * 86400000));
}

/** A candidate as a swipe card: photo, headline, place, level, fit; skills and interests as slides. */
export function personCard(person: Person, now = Date.now()): StudioCard {
  const facts: CardFact[] = [];
  const level = [person.experienceLevel, person.yearsExperience ? `${person.yearsExperience} yrs` : ''].filter(Boolean).join(' · ');
  if (level) facts.push({ kind: 'level', text: level });
  const place = person.city || person.location;
  if (place) facts.push({ kind: 'place', text: person.distanceKm !== undefined ? `${place} · ${person.distanceKm} km away` : place });
  const fit = fitText(person.match?.score);
  if (fit) facts.push({ kind: 'fit', text: fit });
  const slides: CardSlide[] = [];
  if (person.skills?.length) slides.push({ title: 'Skills', chips: person.skills.slice(0, 12), highlight: person.match?.matchedSkills || [] });
  if (person.interests?.length) slides.push({ title: 'Interests', chips: person.interests.slice(0, 12) });
  if (person.languages?.length) slides.push({ title: 'Languages', chips: person.languages.slice(0, 8) });
  return {
    id: person.id, kind: 'person', name: person.name, age: ageOf(person, now), subtitle: person.headline || person.title || '',
    verified: Boolean(person.verified), photo: person.photo || '', initials: initials(person.name), signal: signalOf(person), facts, slides,
  };
}

export function toCard(item: Job | Person): StudioCard {
  return 'employerId' in item ? jobCard(item as Job) : personCard(item as Person);
}

/** Slide 0 is the photo view; the rest are the card's info slides. */
export function slideCount(card: StudioCard) { return 1 + card.slides.length; }

export type StudioAction = 'pass' | 'like' | 'super' | 'undo' | 'open' | 'close' | 'next';
/** Keys while the card area has focus: ← Nope · → Like · ↑ Open profile · ↓ Close profile · Enter Super Like · Space next photo · Backspace rewind. */
export function studioKey(key: string): StudioAction | null {
  switch (key) {
    case 'ArrowLeft': return 'pass';
    case 'ArrowRight': return 'like';
    case 'ArrowUp': return 'open';
    case 'ArrowDown': return 'close';
    case 'Enter': return 'super';
    case ' ': case 'Spacebar': return 'next';
    case 'Backspace': return 'undo';
    default: return null;
  }
}

export type GoalTile = { id: string; label: string; hint: string; filter?: { filterMode?: string; filterType?: string; minScore?: number }; verify?: boolean };

/** "Find by goal" tiles. Each maps to a real deck filter, or to the verification flow. */
export function goalTiles(role: Role): GoalTile[] {
  if (role === 'candidate') return [
    { id: 'remote', label: 'Remote roles', hint: 'Work from anywhere', filter: { filterMode: 'Remote' } },
    { id: 'hybrid', label: 'Hybrid', hint: 'Some days at the office', filter: { filterMode: 'Hybrid' } },
    { id: 'onsite', label: 'On-site', hint: 'Near where you live', filter: { filterMode: 'On-site' } },
    { id: 'fulltime', label: 'Full-time', hint: 'A long-term team', filter: { filterType: 'Full-time' } },
    { id: 'contract', label: 'Contract', hint: 'Projects and short missions', filter: { filterType: 'Contract' } },
    { id: 'topfit', label: 'Top fit 90%+', hint: 'Only your strongest matches', filter: { minScore: 90 } },
    { id: 'verify', label: 'Get Verified', hint: 'Show teams it is really you', verify: true },
  ];
  return [
    { id: 'all', label: 'All candidates', hint: 'Everyone in your matching pool', filter: { minScore: 0 } },
    { id: 'fit80', label: 'Strong fit 80%+', hint: 'Worth a first call', filter: { minScore: 80 } },
    { id: 'fit90', label: 'Top fit 90%+', hint: 'Your strongest matches', filter: { minScore: 90 } },
    { id: 'verify', label: 'Get Verified', hint: 'Show candidates you are real', verify: true },
  ];
}

export function safetyTips(role: Role): string[] {
  if (role === 'candidate') return [
    'Never pay to apply, for training, or for equipment. Real employers do not ask candidates for money.',
    'Keep the chat on JobsMatchNow until you have checked the company: its website, its LinkedIn page, its people.',
    'Do not share ID numbers, bank details or passwords before you have a signed offer.',
    'Prefer a video call before you accept. Be careful with interviews done only by text chat.',
    'Look for the Verified badge, and report anyone who asks for money or pushes you to move off the app.',
  ];
  return [
    'Meet candidates on a video call before an offer, and check that the person matches the profile photo.',
    'Ask for references from past managers and contact them yourself.',
    'Never ask candidates to pay for anything: it breaks our Code of Conduct.',
    'Keep salary and offer details in writing inside the conversation.',
    'Report fake profiles, and anyone who asks you for money or personal data.',
  ];
}

/** Who the viewer is talking to in a match, from the viewer's side. */
export function otherParty(match: JobMatch, viewer: Person) {
  // `tag` tells apart several matches with the same person (one per role): the role title.
  if (viewer.role === 'candidate') {
    const name = match.employer?.name || match.job?.company || 'Hiring team';
    return { name, photo: match.employer?.photo || match.job?.coverImage || '', line: match.job?.title || '', tag: match.job?.title || '' };
  }
  return { name: match.candidate?.name || 'Candidate', photo: match.candidate?.photo || '', line: match.candidate?.title || match.job?.title || '', tag: match.job?.title || '' };
}

export type ThreadRow = { matchId: string; name: string; photo: string; line: string; tag: string; last?: Message; at: number };

/** Matches (newest first) and conversations (those with messages, newest message first). */
export function sidebarLists(data: Pick<Bootstrap, 'matches' | 'messages' | 'viewer'>) {
  const rows: ThreadRow[] = data.matches.map((match) => {
    const thread = data.messages.filter((m) => m.matchId === match.id).sort((a, b) => a.createdAt - b.createdAt);
    const last = thread[thread.length - 1];
    return { matchId: match.id, ...otherParty(match, data.viewer), last, at: last?.createdAt || match.createdAt };
  });
  const matches = [...rows].sort((a, b) => b.at - a.at);
  const conversations = rows.filter((row) => row.last).sort((a, b) => b.at - a.at);
  return { matches, conversations };
}

/** The viewer's own verification state for the safety panel. */
export function verificationState(viewer: Person): 'verified' | 'pending' | 'rejected' | 'none' {
  if (viewer.photoVerified || viewer.verification?.status === 'approved') return 'verified';
  if (viewer.verification?.status === 'pending') return 'pending';
  if (viewer.verification?.status === 'rejected') return 'rejected';
  return 'none';
}

export const NOTE_MAX = 280;
