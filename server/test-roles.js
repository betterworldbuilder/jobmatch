/**
 * Test roles (founder, 2026-11-26): a role with `visibleTo: [userId, …]` is seen ONLY by those accounts and by its
 * owner (the JobFinder account). Everyone else never sees it: not in decks, search, public job / group / role pages,
 * the landing showcase or link previews. Used to test the cold-email chain with a tester account.
 */
export const isRestricted = (job) => Array.isArray(job?.visibleTo) && job.visibleTo.length > 0;
/** True when `viewerId` may NOT see this job. */
export const hiddenFrom = (job, viewerId) => isRestricted(job) && viewerId !== job.employerId && !job.visibleTo.includes(viewerId);
