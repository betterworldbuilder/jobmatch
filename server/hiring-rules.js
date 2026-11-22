// Recruitment process rules (founder rules, 2026-11-22). Pure functions on the db, run inside a transaction.
//
// 1. A candidate gets hired → their other open processes close, upcoming meetings are cancelled, and every
//    other recruiter gets an automatic thank-you message from the candidate.
// 2. A recruiter hires someone → the role is marked filled, every other candidate in that role's process gets
//    an automatic thank-you saying the role is filled (with the offer to recommend them), meetings cancelled.
// 3. A recruiter stops a process → a reason category and honest written feedback are required; the candidate
//    receives it in the conversation and as feedback on the match; meetings cancelled.
import crypto from 'node:crypto';

export const CLOSED_STAGES = ['Hired', 'Archived'];
export const STOP_REASONS = ['Skills gap', 'Experience level', 'Salary expectations', 'Time zone or availability', 'Role on hold or cancelled', 'Chose another candidate', 'Other'];
export const MIN_FEEDBACK = 30;

const first = (name = '') => String(name).trim().split(/\s+/)[0] || 'there';
const isOpen = (m) => !CLOSED_STAGES.includes(m.stage);

function autoMessage(db, match, senderId, text, now) {
  const msg = { id: crypto.randomUUID(), matchId: match.id, senderId, text, createdAt: now, auto: true };
  db.messages.push(msg);
  return msg;
}

/** Cancel the upcoming meetings of a match (kept for history; calendars get STATUS:CANCELLED). */
function cancelMeetings(db, match, reason, now) {
  let n = 0;
  for (const c of db.calls || []) {
    if (c.matchId === match.id && !c.cancelledAt && c.startAt > now) { c.cancelledAt = now; c.cancelReason = reason; n += 1; }
  }
  return n;
}

function close(db, match, { reason, by, now }) {
  match.stage = 'Archived';
  match.stageChangedAt = now;
  match.closedReason = reason; match.closedBy = by; match.closedAt = now;
  return cancelMeetings(db, match, reason, now);
}

/** Rule 1. Returns { closed, meetingsCancelled, messages }. */
export function onCandidateHired(db, candidate, keepMatchId, now = Date.now()) {
  const out = { closed: 0, meetingsCancelled: 0, messages: 0 };
  const job = (id) => (db.jobs || []).find((j) => j.id === id);
  const keep = keepMatchId && db.matches.find((m) => m.id === keepMatchId && m.candidateId === candidate.id);
  if (keep && keep.stage !== 'Hired') { keep.stage = 'Hired'; keep.stageChangedAt = now; keep.currentStepId = 'hire'; }
  for (const m of db.matches) {
    if (m.candidateId !== candidate.id || m === keep || !isOpen(m)) continue;
    const employer = db.users.find((u) => u.id === m.employerId);
    out.meetingsCancelled += close(db, m, { reason: 'candidate_hired', by: candidate.id, now });
    autoMessage(db, m, candidate.id, `Hi ${first(employer?.name)}, thank you for your time and for considering me for the ${job(m.jobId)?.title || ''} role. I have just accepted another offer, so I am closing this process and cancelling our upcoming meetings. I really appreciated our conversations and wish you the best with your search.`.replace(/  +/g, ' '), now);
    out.closed += 1; out.messages += 1;
  }
  return out;
}

/** Rule 2. The recruiter marks `hiredMatch` as Hired. Returns counts. */
export function onRoleFilled(db, hiredMatch, employerId, now = Date.now()) {
  const out = { closed: 0, meetingsCancelled: 0, messages: 0 };
  hiredMatch.stage = 'Hired'; hiredMatch.stageChangedAt = now; hiredMatch.currentStepId = 'hire';
  const job = (db.jobs || []).find((j) => j.id === hiredMatch.jobId);
  if (job) { job.status = 'filled'; job.filledAt = now; }
  const employer = db.users.find((u) => u.id === employerId);
  for (const m of db.matches) {
    if (m.jobId !== hiredMatch.jobId || m === hiredMatch || !isOpen(m)) continue;
    const cand = db.users.find((u) => u.id === m.candidateId);
    out.meetingsCancelled += close(db, m, { reason: 'role_filled', by: employerId, now });
    autoMessage(db, m, employerId, `Hi ${first(cand?.name)}, thank you for your time and interest in the ${job?.title || ''} role${employer?.company ? ` at ${employer.company}` : ''}. We have now filled this role, so we are closing this process and cancelling any upcoming meetings. We enjoyed getting to know you. If you are happy for us to, we would be glad to recommend your profile to other hiring teams. Just reply "yes" here.`.replace(/  +/g, ' '), now);
    out.closed += 1; out.messages += 1;
  }
  return out;
}

/** Rule 3. Throws a 400-style error when the reason is missing. */
export function stopProcess(db, match, employerId, { category, feedback }, now = Date.now()) {
  if (!STOP_REASONS.includes(category)) { const e = new Error(`Pick the main reason: ${STOP_REASONS.join(', ')}`); e.status = 400; e.field = 'closeCategory'; throw e; }
  const text = String(feedback || '').trim();
  if (text.length < MIN_FEEDBACK) { const e = new Error(`Write honest feedback for the candidate (at least ${MIN_FEEDBACK} characters)`); e.status = 400; e.field = 'closeFeedback'; throw e; }
  if (text.length > 2000) { const e = new Error('Feedback is too long (2000 characters max)'); e.status = 400; throw e; }
  const cand = db.users.find((u) => u.id === match.candidateId);
  const job = (db.jobs || []).find((j) => j.id === match.jobId);
  match.feedback = [...(match.feedback || []), { text: `${category}: ${text}`, at: now, from: employerId, kind: 'closing' }];
  match.closedCategory = category;
  const meetingsCancelled = close(db, match, { reason: 'stopped_by_recruiter', by: employerId, now });
  autoMessage(db, match, employerId, `Hi ${first(cand?.name)}, thank you for your time on the ${job?.title || ''} process. We have decided not to move forward. Main reason: ${category}. Our honest feedback: ${text}`.replace(/  +/g, ' '), now);
  return { closed: 1, meetingsCancelled, messages: 1 };
}
