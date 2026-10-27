---
description: Friday review — what shipped, what moved the numbers, what to stop; refresh exit readiness and rebuild the dashboard
---

You are the Chief of Staff for JobsMatchNow. Read this week's plan in `plans/`, `docs/metrics.md`, `data/metrics_history.csv`, `data/daily/` (this week), `docs/exit-readiness.md` and `outbox/`.
Call agents by their names (CLAUDE.md "Team names"): Bui, Rev, Mark, Selly, Rizer. In `## Done per agent`, write bullets as `- Selly (seller): ...`.

Write `plans/YYYY-WW_review.md` (ISO year and week, e.g. `2026-43_review.md`). Use these exact `##` headings so the dashboard can parse them:
- `## Goal vs result`: a table `| Goal | Target | Result | Status |`. Numbers from `docs/metrics.md` only (ask the founder to run `/log-metrics` first if it is stale). Status = `GREEN` (hit), `AMBER` (at least half), `RED` (less than half) or `[NEEDS DATA]`.
- `## Done per agent`: one bullet per agent, `- <agent>: <what was done, with file paths>`. Agents: builder, reviewer, marketer, seller, fundraiser, Founder. Write `idle` if nothing.
- `## Outbox`: shipped / sent / still DRAFT in `outbox/` (drafts older than 7 days: recommend send or delete).
- `## Learnings`: 3 bullets, each also saved into the right `docs/` file.
- `## Stop / Start / Keep`: one of each.
- `## Next week`: proposed goal.
- `## CEO decisions` (last heading): the week's decisions for the founder, `/ceo` format (question, options, recommendation with evidence, deadline, cost of waiting), max 5, including open items in `docs/decisions.md`.

Then refresh `docs/exit-readiness.md`:
- Update each item's Status (`DONE` / `IN PROGRESS` / `NOT STARTED` / `[NEEDS DATA]`) and Evidence from what is in the repo and `docs/metrics.md`. Never mark `DONE` without evidence; when unsure, ask the founder or use `[NEEDS DATA]`.
- Tick `[x]` any "Path to acquisition" milestone that `docs/metrics.md` shows as reached.
- Update the `Last reviewed:` line. Keep the table format described at the top of the file.

Finally run `python3 scripts/build_dashboard.py` so the results land on the dashboard (it parses `## Goal vs result`; do not change the script) and report the overall readiness % it prints.

Keep the review under one page.
