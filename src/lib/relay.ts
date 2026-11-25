// Candidates write to a role's recruiter through this JobsMatchNow address (founder, 2026-11-25); the team forwards
// the message. The recruiter's own email is never shown to candidates.
export const RELAY_EMAIL = 'Greatcandidates@jobsmatchnow.com';

export function relayMailto(job: { id: string; title: string; company?: string }) {
  const subject = `Candidate for ${job.title}${job.company ? ` at ${job.company}` : ''} [role ${job.id}]`;
  const body = `Hello,\n\nI am interested in the role "${job.title}" (JobsMatchNow role ${job.id}).\n\n`;
  return `mailto:${RELAY_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
