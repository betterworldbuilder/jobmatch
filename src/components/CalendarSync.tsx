// "Sync with Google Calendar + phone reminders" on the Meetings page. The member gets a
// private calendar link (an .ics feed of all their meetings). Google Calendar, Apple
// Calendar and Outlook subscribe to it, new meetings appear on their phone by
// themselves, and each one rings 1 hour and 15 minutes before. No Google sign-in needed.
import { useState } from 'react';
import { BellRing, CalendarCheck as SyncIcon, Check, Copy, ExternalLink, Loader2, RefreshCw, Smartphone } from 'lucide-react';
import { api } from '../api';

export function CalendarSync({ userId }: { userId: string }) {
  const [feed, setFeed] = useState<{ url: string; webcal: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const load = async (reset = false) => {
    setBusy(true); setError('');
    try { setFeed(await api.calendarFeed(userId, reset)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not create your calendar link'); }
    finally { setBusy(false); }
  };
  const copy = async () => { if (!feed) return; try { await navigator.clipboard.writeText(feed.url); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* select manually */ } };
  const googleAdd = feed ? `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(feed.webcal)}` : '';

  return <section className="td-section cal-sync" aria-label="Sync with your calendar">
    <div className="cal-sync-head">
      <span className="cal-sync-icon"><SyncIcon size={20} /></span>
      <div><h2>Sync with Google Calendar and get phone reminders</h2>
        <p>Every meeting from your matches lands in your own calendar and rings on your phone <b>1 hour</b> and <b>15 minutes</b> before. New meetings are added by themselves.</p></div>
      {!feed && <button type="button" className="primary-button" onClick={() => void load()} disabled={busy}>{busy ? <Loader2 size={15} className="spin" /> : <><BellRing size={15} /> Turn on sync</>}</button>}
    </div>
    {error && <p className="cb-err">{error}</p>}
    {feed && <div className="cal-sync-body">
      <div className="cal-sync-actions">
        <a className="primary-button" href={googleAdd} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Add to Google Calendar</a>
        <a className="secondary-button" href={feed.webcal}><Smartphone size={15} /> iPhone / Apple Calendar</a>
      </div>
      <label className="cal-sync-url"><span>Your private calendar link</span>
        <span className="cal-sync-row"><input readOnly value={feed.url} onFocus={(e) => e.currentTarget.select()} aria-label="Private calendar link" />
          <button type="button" className="secondary-button small" onClick={() => void copy()}>{copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}</button></span>
      </label>
      <details className="cb-howto" open>
        <summary>How to set it up</summary>
        <ol>
          <li><b>Google Calendar (Android, iPhone, computer):</b> tap <b>Add to Google Calendar</b> and confirm <b>Add</b>. Or open Google Calendar on a computer → <b>Other calendars +</b> → <b>From URL</b> → paste your link → <b>Add calendar</b>. It then shows in the Google Calendar app on your phone.</li>
          <li><b>Phone reminders:</b> in the Google Calendar app open <b>Settings → JobsMatchNow meetings</b> and turn on notifications. Apple Calendar and Outlook use the reminders built into each meeting.</li>
          <li><b>iPhone / Mac:</b> tap <b>iPhone / Apple Calendar</b> → <b>Subscribe</b>.</li>
          <li><b>Outlook:</b> Calendar → <b>Add calendar</b> → <b>Subscribe from web</b> → paste your link.</li>
        </ol>
        <p className="cb-note">Google checks subscribed calendars every few hours, so a brand-new meeting can take a while to appear there. For one meeting right now, use <b>Phone alarm</b> on the meeting below. Keep this link private: anyone with it can see your meeting times. <button type="button" className="text-button" onClick={() => void load(true)} disabled={busy}><RefreshCw size={12} /> Make a new link</button> (the old one stops working).</p>
      </details>
    </div>}
  </section>;
}
