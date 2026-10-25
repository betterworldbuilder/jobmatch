import crypto from 'node:crypto';

/**
 * Funnel analytics. One append-only row per business event, written inside the
 * SAME store transaction that persists the action — so an event exists if and
 * only if the action committed (no double counting from client retries, no
 * orphan events on rollback). Lives in db.events, the same JSON-blob-array
 * pattern as billingEvents.
 *
 * Privacy: props carry categorical values only. Never put coordinates,
 * distances, salary amounts, emails, names, or message text in an event.
 */
export const TRACKED_EVENTS = ['signup_completed', 'role_posted', 'swipe', 'match_created', 'first_message'];

/** 'team' for any hiring-side account (company or headhunter), else 'candidate'. */
export function actorSide(user) {
  return user?.role === 'employer' ? 'team' : 'candidate';
}

export function track(db, name, { userId, demo = false, props = {} } = {}) {
  if (!TRACKED_EVENTS.includes(name)) throw new Error(`Unknown analytics event: ${name}`);
  if (!Array.isArray(db.events)) db.events = [];
  const event = {
    id: crypto.randomUUID(),
    name,
    userId: userId || null,
    // Demo/seeded accounts are flagged so weekly counts can exclude them.
    demo: demo === true,
    props,
    createdAt: Date.now(),
  };
  db.events.push(event);
  return event;
}

/** Weekly counts per event (ISO week starting Monday, UTC), excluding demo events by default. */
export function weeklyCounts(events, { includeDemo = false } = {}) {
  const counts = {};
  for (const event of events || []) {
    if (!includeDemo && event.demo) continue;
    const date = new Date(event.createdAt);
    const day = (date.getUTCDay() + 6) % 7; // Monday = 0
    const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - day));
    const week = monday.toISOString().slice(0, 10);
    counts[week] ??= {};
    counts[week][event.name] = (counts[week][event.name] || 0) + 1;
  }
  return counts;
}
