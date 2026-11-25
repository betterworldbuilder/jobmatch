/**
 * Funnel analytics as BOUNDED weekly counters, not raw event rows.
 *
 * Production keeps all app state in one JSONB document that is rewritten on
 * every write (store-pg.js), so raw per-swipe rows would grow that document
 * forever. Instead db.eventCounts holds one row per
 *   (ISO week, event name, demo flag, dim)
 * where `dim` is a single low-cardinality category (e.g. "like/candidate").
 * That is a few dozen rows per week at most, regardless of traffic.
 *
 * Counters are bumped inside the SAME store transaction as the action, so a
 * count exists iff the action committed. track() returns a small "stamp" the
 * caller stores on the record (swipe / match); untrack(stamp) retracts exactly
 * that count later (Rewind/undo), in the week it was originally counted.
 *
 * Privacy: no user ids, coordinates, salary amounts, names, emails, or message
 * text are ever stored here — only counts per category.
 */
export const TRACKED_EVENTS = ['signup_completed', 'role_posted', 'swipe', 'match_created', 'first_message',
  // JobFinder pilot funnel (2026-11-25). Recruiter sign-up, recruiter interest and mutual matches reuse
  // signup_completed / swipe (like/team) / match_created.
  'jf_job_viewed', 'jf_job_liked', 'jf_consent_given', 'jf_autosend_on', 'jf_autosend_off', 'jf_message_submitted',
  'jf_message_sent', 'jf_message_failed', 'jf_apply_clicked', 'jf_claim_requested', 'jf_claim_approved', 'jf_job_reported_closed',
  // Public job groups (/app/{group}) and LinkedIn links (2026-11-25).
  'grp_viewed', 'grp_filter', 'grp_job_selected', 'grp_gate_shown', 'grp_register_started', 'grp_register_completed', 'grp_returned',
  'li_visit', 'li_signup', 'li_apply'];

/** 'team' for any hiring-side account (company or headhunter), else 'candidate'. */
export function actorSide(user) {
  return user?.role === 'employer' ? 'team' : 'candidate';
}

/** Seeded demo personas AND auto-generated starter "sample" records are not real activity. */
export function isTestRecord(record) {
  return record?.demo === true || record?.sample === true;
}

/** An interaction is demo if ANY party to it (users, the job, the job's owner) is demo/sample. */
export function involvesDemo(...records) {
  return records.some(isTestRecord);
}

/** Monday (UTC) of the ISO week containing `ts`, as YYYY-MM-DD. */
export function isoWeek(ts) {
  const date = new Date(ts);
  const day = (date.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - day)).toISOString().slice(0, 10);
}

function bump(db, name, { demo = false, dim = '', at = Date.now() }, delta) {
  if (!TRACKED_EVENTS.includes(name)) throw new Error(`Unknown analytics event: ${name}`);
  if (!Array.isArray(db.eventCounts)) db.eventCounts = [];
  const week = isoWeek(at);
  const flag = demo === true;
  let row = db.eventCounts.find((entry) => entry.week === week && entry.name === name && entry.demo === flag && entry.dim === dim);
  if (!row) {
    if (delta < 0) return null; // nothing to retract
    row = { week, name, demo: flag, dim, count: 0 };
    db.eventCounts.push(row);
  }
  row.count = Math.max(0, row.count + delta);
  return { name, demo: flag, dim, at };
}

// Optional listener (server/integrations.js forwards real events to Mixpanel/Amplitude/Heap).
let trackListener = null;
export function onTrack(fn) { trackListener = fn; }

/** Count one event. Returns a stamp to store on the record for later retraction. */
export function track(db, name, options = {}) {
  const stamp = bump(db, name, options, 1);
  try { trackListener?.(name, options); } catch { /* forwarding never breaks the action */ }
  return stamp;
}

/** Retract a previously counted event (no-op for records that were never counted). */
export function untrack(db, stamp) {
  if (stamp && stamp.name) bump(db, stamp.name, stamp, -1);
}

/** { "<Monday>": { "<event>": count } }, demo excluded by default. */
export function weeklyCounts(rows, { includeDemo = false } = {}) {
  const counts = {};
  for (const row of rows || []) {
    if (!includeDemo && row.demo) continue;
    if (!row.count) continue;
    counts[row.week] ??= {};
    counts[row.week][row.name] = (counts[row.week][row.name] || 0) + row.count;
  }
  return counts;
}
