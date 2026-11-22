// Full contact bar under the candidate's profile: the member adds or edits their
// booking link (Google Calendar booking page, with a how-to), WhatsApp, Zalo,
// Telegram, phone and email, and sees the bar exactly as matched teams will.
// Everything here stays hidden from other members until a mutual match.
import { useState } from 'react';
import { CalendarDays, ChevronDown, Loader2, Lock, Pencil, X } from 'lucide-react';
import { api } from '../api';
import type { ContactChannel, ContactChannelType, Person } from '../types';
import { ContactBar } from './home/TodayPanel';

type Kind = 'whatsapp' | 'zalo' | 'telegram' | 'phone' | 'email';
const FIELDS: { kind: Kind; label: string; placeholder: string }[] = [
  { kind: 'whatsapp', label: 'WhatsApp', placeholder: '+84 908 618 075' },
  { kind: 'zalo', label: 'Zalo', placeholder: 'Phone number on Zalo' },
  { kind: 'telegram', label: 'Telegram', placeholder: '@username' },
  { kind: 'phone', label: 'Phone', placeholder: '+1 415 555 0100' },
  { kind: 'email', label: 'Email', placeholder: 'you@example.com' },
];

const valueOf = (p: Person, kind: Kind) => (p.contactChannels || []).find((c) => c.type === kind)?.value || '';

export function GoogleBookingHowTo({ viewerFirstName }: { viewerFirstName?: string }) {
  return <details className="cb-howto">
    <summary><CalendarDays size={14} /> How to make a Google Calendar booking page (5 minutes, free) <ChevronDown size={14} /></summary>
    <ol>
      <li>On a computer, open <a href="https://calendar.google.com" target="_blank" rel="noreferrer">calendar.google.com</a> and sign in.</li>
      <li>Click <b>Create</b> (top left), then <b>Appointment schedule</b>.</li>
      <li>Give it a name, for example <i>“Interview with {viewerFirstName || 'me'} (30 min)”</i>, pick a length (30 minutes is a good start) and the hours you are free each week.</li>
      <li>Optional: add <b>Google Meet</b> video, a buffer between meetings, and a limit per day so your week stays calm.</li>
      <li>Click <b>Save</b>. Then click <b>Share</b> (or <b>Open booking page</b>) and <b>copy the link</b>.</li>
      <li>Paste the link in “Booking link” here and save. People you match with see a <b>Book an interview</b> button and pick a free time; Google adds it to both calendars.</li>
    </ol>
    <p className="cb-note">Free Google accounts get one basic booking page. A Google Workspace plan adds extras such as several pages and reminders sent by Google. Want your JobsMatchNow meetings in Google Calendar too? Use <b>Meetings → Sync with Google Calendar</b>.</p>
  </details>;
}

export function ContactBarEditor({ viewer, onSaved }: { viewer: Person; onSaved: (viewer: Person) => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<Kind, string>>(() => Object.fromEntries(FIELDS.map((f) => [f.kind, valueOf(viewer, f.kind)])) as Record<Kind, string>);
  const [booking, setBooking] = useState(viewer.calendarLink || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    setBusy(true); setError('');
    const kept = (viewer.contactChannels || []).filter((c) => !FIELDS.some((f) => f.kind === c.type));
    const contactChannels: ContactChannel[] = [...FIELDS.filter((f) => form[f.kind].trim()).map((f) => ({ type: f.kind as ContactChannelType, value: form[f.kind].trim() })), ...kept].slice(0, 6);
    const calendarLink = booking.trim();
    if (calendarLink && !/^https:\/\//.test(calendarLink)) { setError('The booking link must start with https://'); setBusy(false); return; }
    try {
      const { user } = await api.updateProfile(viewer.id, { contactChannels, calendarLink } as Partial<Person>);
      onSaved({ ...viewer, ...user });
      setOpen(false);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save'); }
    finally { setBusy(false); }
  };
  return <div className="cb-editor">
    <ContactBar person={{ ...viewer, calendarLink: booking || viewer.calendarLink }} />
    {!open && <button type="button" className="secondary-button small cb-edit-btn" onClick={() => setOpen(true)}><Pencil size={14} /> Add or edit contacts</button>}
    {open && <div className="cb-form">
      <header><strong>My contact bar</strong><small><Lock size={11} /> Shown only after a mutual match</small><button type="button" className="text-button" aria-label="Close" onClick={() => setOpen(false)}><X size={15} /></button></header>
      <label className="cb-row cb-booking"><span><CalendarDays size={14} /> Booking link</span>
        <input value={booking} onChange={(e) => setBooking(e.target.value)} placeholder="https://calendar.app.google/… (your Google booking page)" aria-label="Booking link" /></label>
      <GoogleBookingHowTo viewerFirstName={viewer.name?.split(' ')[0]} />
      {FIELDS.map((f) => <label className="cb-row" key={f.kind}><span>{f.label}</span>
        <input value={form[f.kind]} onChange={(e) => setForm({ ...form, [f.kind]: e.target.value })} placeholder={f.placeholder} aria-label={f.label} maxLength={120} /></label>)}
      {error && <p className="cb-err">{error}</p>}
      <div className="cb-actions"><button type="button" className="secondary-button small" onClick={() => setOpen(false)}>Cancel</button>
        <button type="button" className="primary-button small" disabled={busy} onClick={() => void save()}>{busy ? <Loader2 size={14} className="spin" /> : 'Save contact bar'}</button></div>
    </div>}
  </div>;
}
