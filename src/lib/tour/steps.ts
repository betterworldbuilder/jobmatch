// The two full tours as data: one entry per step, each with its caption and the actions the player performs
// on the real app screens (fake finger, typing, taps). Change captions or order here; no UI code needed.
import type { View } from '../../types';
import type { TourRole } from './runtime';

/** Where to act. `target` is a CSS selector; `text` narrows it to the element whose text matches (exact first,
 *  then contains); `within` limits the search to the container whose text contains that string. */
export type Where = { target: string; text?: string; within?: { target: string; text: string } };

export type TourAction =
  | ({ do: 'tap' } & Where & { optional?: boolean })
  | ({ do: 'point' } & Where & { optional?: boolean; ms?: number })
  | ({ do: 'type' } & Where & { value: string; enter?: boolean })
  | ({ do: 'paste' } & Where & { value: string })
  | ({ do: 'select' } & Where & { value: string })
  | ({ do: 'set' } & Where & { value: string })
  | { do: 'view'; view: View; match?: 'latest' | string }
  | { do: 'event'; name: string }
  | { do: 'matchNextLike' }
  | { do: 'wait'; ms: number };

export type TourStep = {
  id: string;
  title: string;
  caption: string;
  /** Register happens in the sign-up window; every other step runs inside the app. */
  phase: 'register' | 'app';
  actions: TourAction[];
  /** How long the caption stays after the actions (ms). */
  hold?: number;
};

const inDate = (days: number) => { const d = new Date(Date.now() + days * 86400000); return d.toISOString().slice(0, 10); };

const SWIPE = { like: '.nm-actions button[aria-label="Like"]', pass: '.nm-actions button[aria-label="Pass"]' };

const candidate: TourStep[] = [
  { id: 'register', phase: 'register', title: 'Sign up in a minute', caption: 'Pick “Candidate”, your citizenship, accept the rules and create your account.', actions: [
    { do: 'tap', target: '.role-option', text: 'Candidate' },
    { do: 'select', target: 'select[aria-label="Your citizenship"]', value: 'Nigeria' },
    { do: 'tap', target: '.conduct-checkbox input' },
    { do: 'type', target: 'input[aria-label="Full name"]', value: 'Sofia Okafor' },
    { do: 'type', target: '.auth-modal input[aria-label="Email address"]', value: 'sofia@example.com' },
    { do: 'type', target: '.auth-modal input[type="password"]', value: 'tour-pass-2026' },
    { do: 'tap', target: '.auth-modal button[type="submit"]' },
  ] },
  { id: 'profile', phase: 'app', title: 'Your profile', caption: 'Photo, skills and salary: recruiters see what matters, nothing more.', hold: 1400, actions: [
    { do: 'view', view: 'profile' },
    { do: 'point', target: '.tcard-hero-title, .tcard-hero-overlay, .profile-hero', optional: true },
    { do: 'point', target: '.tcard-skillsplit, .skill-list', optional: true },
    { do: 'point', target: 'h3, h4, strong, label, span', text: 'Salary', optional: true },
  ] },
  { id: 'target-role', phase: 'app', title: 'Choose your target role', caption: 'Swipe for one target role at a time, or all of them.', actions: [
    { do: 'view', view: 'match' },
    { do: 'select', target: '.fmm-role-select select', value: 'Cloud Solutions Architect' },
    { do: 'wait', ms: 1300 },
    { do: 'select', target: '.fmm-role-select select', value: 'all' },
  ] },
  { id: 'swipe', phase: 'app', title: 'Swipe on roles', caption: 'Pass or like. Salary, work mode and fit are on the card.', actions: [
    { do: 'point', target: '.nm-card:not(.nm-peek)', optional: true, ms: 900 },
    { do: 'tap', target: SWIPE.pass },
    { do: 'wait', ms: 700 },
    { do: 'tap', target: SWIPE.like },
  ] },
  { id: 'filter', phase: 'app', title: 'Filter', caption: 'Only remote roles with a top fit. Filters also cover country, visa, skills and languages.', actions: [
    { do: 'event', name: 'jmn:open-filters' },
    { do: 'tap', target: '.sf-sheet .sf-chips button', text: 'Remote', within: { target: '.sf-group', text: 'Work mode' } },
    { do: 'tap', target: '.sf-sheet .sf-chips button', text: '70%+' },
    { do: 'tap', target: '.sf-show' },
  ] },
  { id: 'match', phase: 'app', title: '“It’s a Match”', caption: 'They liked you too: only now can you talk. No cold applications.', hold: 2400, actions: [
    { do: 'matchNextLike' },
    { do: 'tap', target: SWIPE.like },
    { do: 'point', target: '.nm-match-faces, .nm-match', optional: true },
  ] },
  { id: 'chat', phase: 'app', title: 'Chat', caption: 'The conversation opens with the recruiter who chose you.', actions: [
    { do: 'tap', target: '.nm-talk' },
    { do: 'type', target: '.composer input', value: 'Hi! Thanks for the match. When could we talk about the role?' },
    { do: 'tap', target: '.composer button[type="submit"]' },
  ] },
  { id: 'book', phase: 'app', title: 'Book an interview', caption: 'Propose a time; it goes to both calendars.', actions: [
    { do: 'tap', target: 'button[title="Schedule a call"]' },
    { do: 'set', target: '.coach-modal input[type="date"]', value: inDate(2) },
    { do: 'set', target: '.coach-modal input[type="time"]', value: '10:00' },
    { do: 'tap', target: '.coach-modal .primary-button' },
    { do: 'point', target: '.schedule-card', optional: true },
  ] },
  { id: 'stages', phase: 'app', title: 'Every hiring stage, in the open', caption: 'Both sides see the same rounds: who you meet, and when.', hold: 1600, actions: [
    { do: 'view', view: 'stages' },
    { do: 'point', target: '.hs-card', optional: true },
  ] },
  { id: 'stopped', phase: 'app', title: 'Stopped at the technical round', caption: 'When a process stops, the recruiter must say why, with honest feedback.', hold: 2600, actions: [
    { do: 'point', target: '.hs-closed:not(.hired)' },
    { do: 'view', view: 'messages', match: 'm-sofia-j-sarah-cloud' },
    { do: 'point', target: '.bubble-row', text: 'technical round' },
  ] },
  { id: 'hired', phase: 'app', title: 'Hired', caption: 'Another process went all the way: offer signed.', hold: 2600, actions: [
    { do: 'view', view: 'stages' },
    { do: 'point', target: '.hs-closed.hired' },
  ] },
];

const recruiter: TourStep[] = [
  { id: 'register', phase: 'register', title: 'Sign up in a minute', caption: 'Pick “Company HR or Recruiter”, your company country and citizenship, then create the account.', actions: [
    { do: 'tap', target: '.role-option.role-rec' },
    { do: 'select', target: 'select[aria-label="Company country"]', value: 'United States' },
    { do: 'select', target: 'select[aria-label="Your citizenship"]', value: 'United States' },
    { do: 'tap', target: '.conduct-checkbox input' },
    { do: 'type', target: 'input[aria-label="Full name"]', value: 'Sarah Thompson' },
    { do: 'type', target: '.auth-modal input[aria-label="Email address"]', value: 'sarah@example.com' },
    { do: 'type', target: '.auth-modal input[type="password"]', value: 'tour-pass-2026' },
    { do: 'tap', target: '.auth-modal button[type="submit"]' },
  ] },
  { id: 'company', phase: 'app', title: 'Company profile', caption: 'Who you are, what you build, and the perks candidates care about.', hold: 1400, actions: [
    { do: 'view', view: 'profile' },
    { do: 'point', target: '.profile-hero', optional: true },
    { do: 'point', target: '.pf-about', optional: true },
  ] },
  { id: 'post-role', phase: 'app', title: 'Post a role', caption: 'Paste the job ad and list the must-have skills: they drive the fit score.', actions: [
    { do: 'view', view: 'jobs' },
    { do: 'tap', target: 'button', text: 'Post a real role' },
    { do: 'type', target: 'input[placeholder="e.g. Senior React Engineer"]', value: 'Senior Cloud Engineer' },
    { do: 'type', target: 'input[aria-label="Salary minimum"]', value: '140000' },
    { do: 'type', target: 'input[aria-label="Salary maximum"]', value: '180000' },
    { do: 'type', target: 'input[placeholder="e.g. Ho Chi Minh City"]', value: 'Seattle' },
    { do: 'tap', target: '.wizard-card button', text: 'Remote' },
    { do: 'type', target: 'input[placeholder="e.g. React — press Enter"]', value: 'AWS', enter: true },
    { do: 'type', target: 'input[placeholder="e.g. React — press Enter"]', value: 'Terraform', enter: true },
    { do: 'type', target: 'input[placeholder="e.g. GraphQL — press Enter"]', value: 'Kubernetes', enter: true },
    { do: 'paste', target: 'textarea[aria-label="Full job description"]', value: 'Senior Cloud Engineer (remote, US time zones)\n\nYou will design and run our multi-region AWS platform with Terraform, own reliability for customer-facing services, and coach two engineers.\n\nMust have: AWS (5+ years), Terraform, production on-call.\nNice to have: Kubernetes, Go.\n\nSalary: $140k–$180k + equity. Fully remote.' },
    { do: 'tap', target: '.wz-foot-actions .primary-button' },
  ] },
  { id: 'swipe', phase: 'app', title: 'Swipe candidates', caption: 'Fit score, skills and salary on every card. Like or pass.', actions: [
    { do: 'view', view: 'match' },
    { do: 'point', target: '.nm-card:not(.nm-peek)', optional: true, ms: 900 },
    { do: 'tap', target: SWIPE.pass },
    { do: 'wait', ms: 700 },
    { do: 'tap', target: SWIPE.like },
  ] },
  { id: 'filter', phase: 'app', title: 'Filter', caption: 'Narrow by fit, skills, languages, visa or availability.', actions: [
    { do: 'event', name: 'jmn:open-filters' },
    { do: 'tap', target: '.sf-sheet .sf-chips button', text: '50%+' },
    { do: 'point', target: '.sf-sheet .sf-group', text: 'Visa', optional: true },
    { do: 'tap', target: '.sf-show' },
  ] },
  { id: 'likes', phase: 'app', title: 'See who already likes your roles', caption: 'Candidates who liked your roles wait here: one tap to say yes.', hold: 1800, actions: [
    { do: 'tap', target: '.fmm-likes' },
    { do: 'wait', ms: 900 },
    { do: 'view', view: 'match' },
  ] },
  { id: 'match', phase: 'app', title: '“It’s a Match”', caption: 'Both sides said yes: the chat opens.', hold: 2400, actions: [
    { do: 'matchNextLike' },
    { do: 'tap', target: SWIPE.like },
    { do: 'point', target: '.nm-match-faces, .nm-match', optional: true },
  ] },
  { id: 'chat', phase: 'app', title: 'Chat', caption: 'Talk to a candidate who already wants your role.', actions: [
    { do: 'tap', target: '.nm-talk' },
    { do: 'type', target: '.composer input', value: 'Great to match! Are you free for a 30-minute intro call this week?' },
    { do: 'tap', target: '.composer button[type="submit"]' },
  ] },
  { id: 'stages', phase: 'app', title: 'Hiring stages', caption: 'Every role, every candidate, every round: one view.', hold: 1400, actions: [
    { do: 'view', view: 'stages' },
    { do: 'point', target: '.hs-job', optional: true },
  ] },
  { id: 'stop', phase: 'app', title: 'Stop at the technical round', caption: 'Stopping needs a reason and honest feedback; the candidate gets it in the chat.', actions: [
    { do: 'tap', target: '.hs-stop-btn', within: { target: '.hs-card', text: 'David Nguyen' } },
    { do: 'select', target: '.hs-stop select', value: 'Skills gap' },
    { do: 'type', target: '.hs-stop textarea', value: 'Thank you David. Strong system design, but the role needs daily Terraform at scale. Happy to talk again next year.' },
    { do: 'tap', target: '.hs-stop .danger-button' },
    { do: 'point', target: '.hs-notice', optional: true },
  ] },
  { id: 'hire', phase: 'app', title: 'Hired', caption: 'Maria passed every round. Mark her hired: the others get an automatic thank-you.', hold: 2600, actions: [
    { do: 'tap', target: '.hs-hire', within: { target: '.hs-card', text: 'Maria Garcia' } },
    { do: 'tap', target: '.hs-confirm .primary-button' },
    { do: 'point', target: '.hs-closed.hired', optional: true },
  ] },
];

export const TOURS: Record<TourRole, { name: string; steps: TourStep[] }> = {
  candidate: { name: 'Candidate full tour', steps: candidate },
  employer: { name: 'Recruiter full tour', steps: recruiter },
};
