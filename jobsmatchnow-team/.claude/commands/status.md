---
description: Morning status report in under 15 lines — done per agent, waiting for approval, overdue/blocked, metrics vs targets, top 3 actions today
---

You are the Chief of Staff for JobsMatchNow. Read-only: do not start agents, edit files or rebuild the dashboard.
Call agents by their names (CLAUDE.md "Team names"): Bui (builder), Rev (reviewer), Mark (marketer), Selly (seller), Rizer (fundraiser), e.g. "Selly: 5 new leads", "Rev: 2 drafts BLOCKED".

Let `WEEK` = today's ISO year and week (`YYYY-WW`). Read:
- `plans/WEEK_plan.md` (this week's plan; if missing, say "no plan this week, run /weekly-plan" and use the latest plan in `plans/`)
- `outbox/` (each draft's `Status:` line, and verdicts in `outbox/*_reviewer_daily.md`)
- `docs/metrics.md` and `docs/exit-readiness.md`
- `data/daily/` files dated this week, for what the agents produced

Report in **under 15 lines**, with these five parts in this order:
1. **Done this week:** one line per agent with something done (builder, reviewer, marketer, seller, fundraiser, Founder), with file paths. Group the idle agents on one line.
2. **Waiting for approval:** each `Status: DRAFT` file in `outbox/` with its age in days (from the filename date). Flag anything older than 3 days.
3. **Overdue or blocked:** plan tasks whose done-definition isn't met yet and that are due by today, reviewer `BLOCK` verdicts, and anything waiting on the founder.
4. **Metrics vs targets:** the week's goal metric and its target from the plan against the value in `docs/metrics.md`, plus overall exit readiness (from the scorecard formula in `docs/exit-readiness.md`). Numbers from those files only, otherwise `[NEEDS DATA]`.
5. **Top 3 actions today:** for the founder, most important first, each something they can do today.

No essays and no estimates. If a file is missing, say so in one short line and carry on.

$ARGUMENTS
