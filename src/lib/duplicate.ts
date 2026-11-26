// Duplicate guardrail (founder, 2026-11-26): the server refuses a role that is already on offer (same link, or same
// title + company + location) with "Duplicate role: …". The recruiter can still confirm a genuine second opening.
export const isDuplicateError = (e: unknown) => e instanceof Error && /^Duplicate role/.test(e.message);

/** Run `save(false)`; if the server says duplicate, ask, then `save(true)`. Returns null when the recruiter cancels. */
export async function withDuplicateConfirm<T>(save: (allowDuplicate: boolean) => Promise<T>): Promise<T | null> {
  try { return await save(false); }
  catch (e) {
    if (!isDuplicateError(e)) throw e;
    const ok = window.confirm(`${(e as Error).message}.\n\nCreate it anyway? Only do this for a genuine second opening; otherwise cancel and edit the existing role.`);
    return ok ? save(true) : null;
  }
}
