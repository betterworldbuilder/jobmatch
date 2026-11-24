// "Candidate full tour" / "Recruiter full tour" (founder, 2026-11-24): the small part that is always in the
// main bundle. While a tour plays, every API request is answered by the tour's scripted data (mockApi.ts,
// loaded only when a tour starts), so a tour never reads or writes anything on the server.
export type TourRole = 'candidate' | 'employer';
type Handler = (url: string, init?: RequestInit) => Promise<unknown>;

let handler: Handler | null = null;

export const tourRuntime = {
  get active() { return handler !== null; },
  handle<T>(url: string, init?: RequestInit) { return handler!(url, init) as Promise<T>; },
};

export function setTourHandler(next: Handler | null) { handler = next; }

/** Fired by the "Watch … full tour" buttons; App starts the tour. */
export const START_TOUR_EVENT = 'jmn:start-tour';
/** Fired by the tour player; the workspace opens a page (and closes sheets/menus). */
export const TOUR_VIEW_EVENT = 'jmn:tour-view';

export function startTour(role: TourRole) {
  window.dispatchEvent(new CustomEvent(START_TOUR_EVENT, { detail: { role } }));
}

/** Remembered for the tab so a real sign-up after a tour is counted as "sign-up after tour". */
export const TOUR_SEEN_KEY = 'jm-tour-seen';
