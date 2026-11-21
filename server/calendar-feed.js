// Private calendar feed: every meeting a member has (across their matches) as an
// .ics subscription URL. Google Calendar ("Other calendars → From URL"), Apple
// Calendar and Outlook can subscribe to it, so new meetings show up on their
// phone by themselves, each with a reminder (VALARM) that rings before it starts.
// No Google sign-in or OAuth app needed. The URL holds a random secret token the
// member can reset at any time; it is never shown to other members.
import crypto from 'node:crypto';

export const REMINDER_MINUTES = [15, 60]; // phone alerts: 15 minutes and 1 hour before

export const newFeedToken = () => crypto.randomBytes(24).toString('base64url');
export const validFeedToken = (t) => /^[A-Za-z0-9_-]{32}$/.test(String(t || ''));

const stamp = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
const esc = (s = '') => String(s).replace(/[\\,;]/g, (m) => `\\${m}`).replace(/\r?\n/g, '\\n');
// RFC 5545: lines longer than 75 octets are folded with CRLF + space.
const fold = (line) => { const out = []; let rest = line; while (Buffer.byteLength(rest) > 74) { let cut = 74; while (Buffer.byteLength(rest.slice(0, cut)) > 74) cut -= 1; out.push(rest.slice(0, cut)); rest = ` ${rest.slice(cut)}`; } out.push(rest); return out.join('\r\n'); };

/** The member's meetings: calls on matches they are part of, upcoming and the last 30 days. */
export function meetingsFor(db, userId, now = Date.now()) {
  const mine = new Map((db.matches || []).filter((m) => m.candidateId === userId || m.employerId === userId).map((m) => [m.id, m]));
  return (db.calls || [])
    .filter((c) => mine.has(c.matchId) && Number.isFinite(c.startAt) && c.startAt > now - 30 * 86400000)
    .sort((a, b) => a.startAt - b.startAt)
    .map((c) => {
      const m = mine.get(c.matchId);
      const job = (db.jobs || []).find((j) => j.id === m.jobId);
      const otherId = m.candidateId === userId ? m.employerId : m.candidateId;
      const other = (db.users || []).find((u) => u.id === otherId);
      return { call: c, job, other };
    });
}

/** iCalendar text for the member's meetings, each with phone reminders. */
export function buildIcs(items, { appUrl = 'https://jobsmatchnow.com/app/', calName = 'JobsMatchNow meetings' } = {}) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//JobsMatchNow//Meetings//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(calName)}`, 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H'];
  for (const { call, job, other } of items) {
    const end = call.startAt + (Number(call.durationMinutes) || 30) * 60000;
    const who = other?.name ? `With ${other.name}${other.company ? `, ${other.company}` : ''}` : '';
    const desc = [who, job ? `Role: ${job.title}${job.company ? ` at ${job.company}` : ''}` : '', call.notes || '', `Open the conversation: ${appUrl}`].filter(Boolean).join('\n');
    lines.push('BEGIN:VEVENT', `UID:${call.id}@jobsmatchnow.com`, `DTSTAMP:${stamp(call.createdAt || Date.now())}`,
      `DTSTART:${stamp(call.startAt)}`, `DTEND:${stamp(end)}`, `SUMMARY:${esc(call.title || 'JobsMatchNow meeting')}`,
      `DESCRIPTION:${esc(desc)}`, `URL:${appUrl}`, 'STATUS:CONFIRMED');
    for (const min of REMINDER_MINUTES) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(call.title || 'Meeting')} in ${min >= 60 ? `${min / 60} hour` : `${min} minutes`}`, `TRIGGER:-PT${min}M`, 'END:VALARM');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
