/**
 * Test roles + tester accounts (founder, 2026-11-26).
 *  - A role with `visibleTo: [userId, …]` is seen ONLY by those accounts and by its owner (the JobFinder account):
 *    not in decks, search, public job / group / role pages, the landing showcase or link previews.
 *  - A tester account (`user.tester`) sees ONLY the test roles made for it, is hidden from real recruiters, never
 *    triggers a cold email to a real recruiter, and is left out of the Stage 1 / outreach numbers.
 */
export const isRestricted = (job) => Array.isArray(job?.visibleTo) && job.visibleTo.length > 0;
/** True when `viewerId` may NOT see this job. */
export const hiddenFrom = (job, viewerId) => isRestricted(job) && viewerId !== job.employerId && !job.visibleTo.includes(viewerId);
export const isTester = (user) => user?.tester === true;
/** A test role made for this tester. */
export const isTestRoleFor = (job, userId) => isRestricted(job) && job.visibleTo.includes(userId);
