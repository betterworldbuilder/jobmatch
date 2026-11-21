/**
 * "Add to calendar" links — no OAuth, no API keys. Google/Outlook quick-add URLs
 * open the event pre-filled in the user's own browser session; the .ics file
 * covers Apple Calendar and everything else. This is the standard no-auth pattern;
 * true two-way sync would need a registered Google/Calendly OAuth app.
 */
export type CalendarEvent = { title: string; description?: string; startAt: number; durationMinutes: number };

function toUtcStamp(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

export function googleCalendarUrl(event: CalendarEvent): string {
  const end = event.startAt + event.durationMinutes * 60000;
  const params = new URLSearchParams({
    action: 'TEMPLATE', text: event.title,
    dates: `${toUtcStamp(event.startAt)}/${toUtcStamp(end)}`,
    details: event.description || '',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function outlookCalendarUrl(event: CalendarEvent): string {
  const end = event.startAt + event.durationMinutes * 60000;
  const params = new URLSearchParams({
    path: '/calendar/action/compose', rru: 'addevent', subject: event.title,
    startdt: new Date(event.startAt).toISOString(), enddt: new Date(end).toISOString(),
    body: event.description || '',
  });
  return `https://outlook.office.com/calendar/0/deeplink/compose?${params.toString()}`;
}

/** Phone reminders added to every .ics: 1 hour and 15 minutes before. */
export const REMINDER_MINUTES = [60, 15];

/** "Email to": a ready-to-send email with the meeting details. */
export function meetingMailto(to: string, event: CalendarEvent): string {
  const when = new Date(event.startAt).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  const body = `Hi,\n\nConfirming our meeting: ${event.title}\nWhen: ${when} (${event.durationMinutes} min)\n${event.description ? `\n${event.description}\n` : ''}\nAdd it to your calendar: ${googleCalendarUrl(event)}\n\nSee you then!`;
  return `mailto:${to}?subject=${encodeURIComponent(`Meeting: ${event.title}`)}&body=${encodeURIComponent(body)}`;
}

/** A downloadable .ics — works with Apple Calendar, Outlook desktop, and any other calendar app.
 *  Carries phone alarms (VALARM), so opening it on a phone sets the reminders too. */
export function icsDataUrl(event: CalendarEvent): string {
  const end = event.startAt + event.durationMinutes * 60000;
  const escape = (s: string) => s.replace(/[\\,;]/g, (m) => `\\${m}`).replace(/\n/g, '\\n');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//jobmatch3//EN', 'BEGIN:VEVENT',
    `UID:${crypto.randomUUID()}`, `DTSTAMP:${toUtcStamp(Date.now())}`,
    `DTSTART:${toUtcStamp(event.startAt)}`, `DTEND:${toUtcStamp(end)}`,
    `SUMMARY:${escape(event.title)}`,
    ...(event.description ? [`DESCRIPTION:${escape(event.description)}`] : []),
    ...REMINDER_MINUTES.flatMap((m) => ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escape(event.title)}`, `TRIGGER:-PT${m}M`, 'END:VALARM']),
    'END:VEVENT', 'END:VCALENDAR',
  ];
  return `data:text/calendar;charset=utf8,${encodeURIComponent(lines.join('\r\n'))}`;
}
