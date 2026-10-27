# Metrics — single source of truth (founder updates weekly)

Last updated: [DATE]

| Metric | Value | Source |
|---|---|---|
| Candidate signups (total) | [NEEDS DATA] | |
| Hiring teams signed up | [NEEDS DATA] | |
| Paying hiring teams | [NEEDS DATA] | |
| Mutual matches (total / this week) | [NEEDS DATA] | |
| Match → first message rate | [NEEDS DATA] | |
| Hires made through the app | [NEEDS DATA] | |
| MRR | [NEEDS DATA] | |
| Demo-matching sessions this week | [NEEDS DATA] | |

## Tracked events
Events are counted **server-side**, inside the same store transaction that saves the action, so a count exists only if the action committed. Client retries and duplicate swipes are not counted.

**Storage: weekly counters, not raw rows.** Production keeps all app state in one JSONB document that is rewritten on every write, so `server/analytics.js` keeps bounded counters in `db.eventCounts`. There is one row per `{ week, name, demo, dim, count }`. `week` is the Monday (UTC) of the ISO week. `dim` is one small category, listed below. Storage stays at a few dozen rows per week whatever the traffic.

**Demo flag:** `demo: true` if ANY party to the action is a seeded demo persona or an auto-generated starter "sample" account or job. That includes the actor, the other user, the job, and the job's owner. **Always report `demo = false` only.**

**Privacy:** the counters hold no user ids, coordinates, distances, salary amounts, names, emails, or message text.

| Event | Fires in (file) | `dim` | Feeds metric |
|---|---|---|---|
| `signup_completed` | `server/index.js`: `POST /api/auth/register` and the real Google/LinkedIn SSO callback (new accounts only) | `<side>/<method>`, e.g. `candidate/email`, `team/google` | Candidate signups; Hiring teams signed up |
| `role_posted` | `server/index.js`: `POST /api/jobs` when created `active`, and `PATCH /api/jobs/:id` when a job first goes live. Once per job. | `quick_post` / `editor` / `import` | Hiring-team activation (roles live in the deck) |
| `swipe` | `server/index.js`: `POST /api/swipes` (new swipes only) | `<direction>/<side>`, e.g. `like/candidate`, `pass/team` | Swipe volume and like rate per side |
| `match_created` | `server/index.js`: `POST /api/swipes` when it completes a mutual match (at most one per candidate × job) | side whose swipe closed it: `candidate` / `team` | Mutual matches (total / this week) |
| `first_message` | `server/index.js`: `POST /api/messages`, first message in a match only (once per match) | sender side: `candidate` / `team` | Match → first message rate |

**Rewind / undo:** `POST /api/swipes/undo` retracts exactly what the undone swipe produced: the swipe, any match it created, and that match's first message. Each is retracted in the week it was originally counted. So undo followed by a re-swipe nets to one of each, and counts match the live data.

**Known limitations (documented, not fixed):**
- `signup_completed` counts at account creation, before email verification. Unverified or abandoned sign-ups are included.
- Counters are historical. Deleting an account or a job does not decrement them.

### How to pull weekly counts
**Option A (no SQL):** sign in as admin and open `GET /api/admin/analytics/events`. It returns `{ weeks: { "<Monday YYYY-MM-DD>": { "<event>": count } } }` with demo excluded. Add `?includeDemo=true` to include demo.

**Option B (PostgreSQL / RDS):** `week` is already the ISO-week Monday in UTC. Which query depends on what is deployed.

*Current production (master): one JSONB document in `app_state`:*
```sql
SELECT r->>'week'             AS week_start_utc,
       r->>'name'             AS event,
       r->>'dim'              AS dim,
       sum((r->>'count')::int) AS n
FROM app_state, jsonb_array_elements(doc->'eventCounts') AS r
WHERE id = 1 AND (r->>'demo')::boolean = false
GROUP BY 1, 2, 3
ORDER BY 1 DESC, 2, 3;
```
*After `feat/funnel-pwa-post-role` (commit 47ab868) is deployed: one row per record in `app_records`.* `eventCounts`
rows carry no id, so the whole array is stored as one value row (`collection = '$value'`, `id = 'eventCounts'`).
`app_state` is then a frozen backup; do not query it for new weeks.
```sql
SELECT r->>'week'             AS week_start_utc,
       r->>'name'             AS event,
       r->>'dim'              AS dim,
       sum((r->>'count')::int) AS n
FROM app_records, jsonb_array_elements(doc) AS r
WHERE collection = '$value' AND id = 'eventCounts' AND (r->>'demo')::boolean = false
GROUP BY 1, 2, 3
ORDER BY 1 DESC, 2, 3;
```
Drop `dim` from the SELECT and GROUP BY for one total per event. Match → first message rate for a week = `first_message` / `match_created` (same week, as an approximation).
