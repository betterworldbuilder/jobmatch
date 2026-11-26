// Demo/live wall (founder, 2026-11-23): demo accounts see only demo candidates and demo recruiters' roles;
// real accounts see only real accounts and real roles. Starter "sample" records (once auto-made for new real
// accounts, posted under the demo recruiter) cross the wall in neither direction any more: they are hidden
// from everyone (kept in the database, never shown), and no new ones are created.
import { hiddenFrom, isTester, isTestRoleFor } from './test-roles.js';
import { jobFinderIds } from './jobfinder.js';

/** Ids of everyone the user blocked or was blocked by. */
export function blockedBetween(db, userId) {
  const ids = new Set();
  for (const b of db.blocks || []) {
    if (b.blockerId === userId) ids.add(b.blockedId);
    else if (b.blockedId === userId) ids.add(b.blockerId);
  }
  return ids;
}

export function matchingPool(db, viewer) {
  const demo = viewer.demo === true;
  // Block user (founder, 2026-11-23; Apple guideline 1.2): people blocked by the viewer, or who blocked the
  // viewer, leave each other's pool — so their cards, likes, jobs and matches all disappear both ways.
  const hidden = blockedBetween(db, viewer.id);
  const users = db.users.filter((user) => {
    if (hidden.has(user.id)) return false;
    // Tester accounts are invisible to everyone but themselves and the JobFinder account (2026-11-26).
    if (isTester(user) && user.id !== viewer.id && !(viewer.jobFinder === true || jobFinderIds().includes(viewer.id))) return false;
    // Starter samples carry no demo flag, so without this they would fall into the real bucket.
    if (user.sample === true) return false;
    return (user.demo === true) === demo;
  });
  const userIds = new Set(users.map((user) => user.id));
  const jobs = db.jobs.filter((job) => {
    if (job.sample === true) return false;
    // Test roles: only their tester account(s) and their owner see them; a tester sees nothing else (2026-11-26).
    if (hiddenFrom(job, viewer.id)) return false;
    if (isTester(viewer) && !isTestRoleFor(job, viewer.id)) return false;
    const employer = db.users.find((user) => user.id === job.employerId);
    const jobIsDemo = job.demo === true || employer?.demo === true;
    return jobIsDemo === demo && userIds.has(job.employerId);
  });
  const jobIds = new Set(jobs.map((job) => job.id));
  const swipes = db.swipes.filter((swipe) => userIds.has(swipe.actorId)
    && (swipe.targetType === 'job' ? jobIds.has(swipe.targetId) : userIds.has(swipe.targetId)));
  const matches = db.matches.filter((match) => userIds.has(match.candidateId)
    && userIds.has(match.employerId)
    && jobIds.has(match.jobId));

  return { users, userIds, jobs, jobIds, swipes, matches };
}

export function targetIsInMatchingPool(db, actor, targetType, targetId) {
  const pool = matchingPool(db, actor);
  return targetType === 'job' ? pool.jobIds.has(targetId) : pool.userIds.has(targetId);
}
