// Interviews calendar (founder, 2026-11-26): every booked interview in a Google Calendar-style view (month / week),
// on the Interviews page. Booked calls in blue, dated hiring rounds in pink. Click one: details + add to calendar.
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Clock, MessageCircle, X } from 'lucide-react';
import type { Bootstrap } from '../../types';
import { allInterviews, type NextInterview } from '../../lib/today';
import { googleCalendarUrl, icsDataUrl, outlookCalendarUrl } from '../../lib/calendar';

const DAY = 86400000;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 13 }, (_, i) => 8 + i); // 08:00 – 20:00
const startOfDay = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const sameDay = (a: number, b: number) => startOfDay(a) === startOfDay(b);
const time = (t: number) => new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

export function InterviewCalendar({ data, onOpenMessages }: { data: Bootstrap; onOpenMessages?: (matchId: string) => void }) {
  const events = useMemo(() => allInterviews(data), [data]);
  const [mode, setMode] = useState<'month' | 'week'>('month');
  const [cursor, setCursor] = useState(() => startOfDay(Date.now()));
  const [open, setOpen] = useState<NextInterview | null>(null);
  const today = startOfDay(Date.now());
  const cur = new Date(cursor);

  // Month: 6 weeks from the Sunday on/before the 1st. Week: Sunday → Saturday around the cursor.
  const monthStart = new Date(cur.getFullYear(), cur.getMonth(), 1);
  const gridStart = startOfDay(monthStart.getTime() - monthStart.getDay() * DAY);
  const weekStart = startOfDay(cursor - cur.getDay() * DAY);
  const days = mode === 'month' ? Array.from({ length: 42 }, (_, i) => startOfDay(gridStart + i * DAY + 3600000)) : Array.from({ length: 7 }, (_, i) => startOfDay(weekStart + i * DAY + 3600000));
  const on = (day: number) => events.filter((e) => sameDay(e.at, day));
  const move = (dir: number) => { if (mode === 'month') setCursor(new Date(cur.getFullYear(), cur.getMonth() + dir, 1).getTime()); else setCursor(cursor + dir * 7 * DAY); };
  const title = mode === 'month' ? cur.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : `${new Date(weekStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(weekStart + 6 * DAY).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  const upcoming = events.filter((e) => e.at >= today).length;

  const chip = (e: NextInterview) => <button type="button" key={`${e.matchId}-${e.at}-${e.title}`} className={`ic-chip ${e.source}`} onClick={() => setOpen(e)} title={`${e.title} · with ${e.who}`}>
    <i />{e.source === 'call' && <b>{time(e.at)}</b>}<span>{e.title}</span>
  </button>;

  return <section className="td-section ic-wrap" id="interview-calendar" aria-label="Interview calendar">
    <header className="ic-head">
      <button type="button" className="ic-today" onClick={() => setCursor(today)}>Today</button>
      <button type="button" className="ic-nav" onClick={() => move(-1)} aria-label={mode === 'month' ? 'Previous month' : 'Previous week'}><ChevronLeft size={18} /></button>
      <button type="button" className="ic-nav" onClick={() => move(1)} aria-label={mode === 'month' ? 'Next month' : 'Next week'}><ChevronRight size={18} /></button>
      <h2>{title}</h2>
      <span className="ic-count">{upcoming} upcoming · {events.length} booked</span>
      <span className="ic-mode" role="group" aria-label="Calendar view">
        <button type="button" className={mode === 'month' ? 'on' : ''} onClick={() => setMode('month')} aria-pressed={mode === 'month'}>Month</button>
        <button type="button" className={mode === 'week' ? 'on' : ''} onClick={() => setMode('week')} aria-pressed={mode === 'week'}>Week</button>
      </span>
    </header>

    {mode === 'month' ? <div className="ic-month">
      {WEEKDAYS.map((w) => <div key={w} className="ic-dow">{w}</div>)}
      {days.map((day) => { const list = on(day); const d = new Date(day); return <div key={day} className={`ic-day${d.getMonth() !== cur.getMonth() ? ' out' : ''}`}>
        <span className={day === today ? 'ic-num today' : 'ic-num'}>{d.getDate() === 1 ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : d.getDate()}</span>
        {list.slice(0, 3).map(chip)}
        {list.length > 3 && <button type="button" className="ic-more" onClick={() => { setCursor(day); setMode('week'); }}>{list.length - 3} more</button>}
      </div>; })}
    </div> : <div className="ic-week">
      <div className="ic-week-head"><span />{days.map((day) => { const d = new Date(day); return <div key={day} className="ic-wd"><small>{WEEKDAYS[d.getDay()]}</small><span className={day === today ? 'ic-num today' : 'ic-num'}>{d.getDate()}</span></div>; })}</div>
      {/* Rounds have a day, not a time: they sit in the all-day row, like Google's all-day events. */}
      <div className="ic-allday"><span>All day</span>{days.map((day) => <div key={day}>{on(day).filter((e) => e.source === 'round').map(chip)}</div>)}</div>
      <div className="ic-grid">
        <div className="ic-hours">{HOURS.map((h) => <span key={h}>{new Date(2026, 0, 1, h).toLocaleTimeString('en-US', { hour: 'numeric' })}</span>)}</div>
        {days.map((day) => <div key={day} className="ic-col">
          {HOURS.map((h) => <i key={h} />)}
          {on(day).filter((e) => e.source === 'call').map((e) => { const d = new Date(e.at); const top = Math.max(0, (d.getHours() + d.getMinutes() / 60 - HOURS[0]) * 48);
            return <button type="button" key={`${e.matchId}-${e.at}`} className="ic-block" style={{ top, height: Math.max(22, (e.durationMinutes / 60) * 48 - 2) }} onClick={() => setOpen(e)}><b>{time(e.at)}</b><span>{e.title}</span></button>; })}
        </div>)}
      </div>
    </div>}

    {events.length === 0 && <p className="ic-empty">No interviews booked yet. They appear here as soon as one is scheduled.</p>}

    {open && <div className="ic-pop-scrim" onClick={() => setOpen(null)}>
      <div className="ic-pop" role="dialog" aria-label={open.title} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="ic-pop-x" aria-label="Close" onClick={() => setOpen(null)}><X size={16} /></button>
        <h3><i className={`ic-dot ${open.source}`} /> {open.title}</h3>
        <p><Clock size={13} /> {new Date(open.at).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}{open.source === 'call' ? ` · ${time(open.at)} · ${open.durationMinutes} min` : ' · time to be confirmed'}</p>
        <p>With {open.who}</p>
        {(() => { const ev = { title: open.title, description: `JobsMatchNow — with ${open.who}`, startAt: open.at, durationMinutes: open.durationMinutes }; return <div className="ic-pop-actions">
          <a href={googleCalendarUrl(ev)} target="_blank" rel="noopener noreferrer">Google</a>
          <a href={outlookCalendarUrl(ev)} target="_blank" rel="noopener noreferrer">Outlook</a>
          <a href={icsDataUrl(ev)} download="jobsmatchnow-interview.ics">Phone alarm</a>
          {onOpenMessages && <button type="button" onClick={() => { setOpen(null); onOpenMessages(open.matchId); }}><MessageCircle size={13} /> Open chat</button>}
        </div>; })()}
      </div>
    </div>}
  </section>;
}
