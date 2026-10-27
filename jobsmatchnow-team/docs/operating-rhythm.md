# Operating rhythm

Rules that hold everywhere: agents draft, the founder sends. Numbers come only from `docs/metrics.md` or
`data/metrics_history.csv`; if a number isn't there, write `[NEEDS DATA]`. No LinkedIn scraping or automation.
One agent per step. Every agent reads `docs/decisions.md` and `docs/feedback.md` before working.

## Daily (`/daily-run`, unattended each morning)
| Step | Agent | Output |
|---|---|---|
| 1 | marketer | 5 US recruiting news items + 1 LinkedIn post draft reacting to the best one (`outbox/`, `Status: DRAFT`) |
| 2 | seller | 5 new US leads with openers in `data/leads.csv`; follow-up drafts for any reply logged yesterday (`docs/feedback.md` / leads.csv status `REPLIED`) |
| 3 | fundraiser | Nothing daily, except Acquirer Watch on Mondays |
| 4 | builder | 1 small fix from `docs/feedback.md`, staging only (skip if no feedback item) |
| 5 | reviewer | Checks the builder's fix and all of today's drafts |

## Weekly
| Day | What |
|---|---|
| Mon | `/weekly-plan` + fundraiser Acquirer Watch |
| Tue | seller and marketer turn last week's objections (`docs/objections.md`) into new scripts and posts |
| Wed | builder ships the week's main feature, chosen from `docs/feedback.md` (to staging, after reviewer PASS and founder approval) |
| Thu | fundraiser updates `docs/investors.md` and deck content with new proof (numbers from `docs/metrics.md` only) |
| Fri | `/log-metrics` + `/weekly-review` |

## Feedback loop
- Every reply, call or user comment is logged with `/log` into `docs/feedback.md`, and durable insights also into
  `docs/objections.md` or `docs/icp.md`. Lead status changes go to `data/leads.csv`.
- Founder-level choices go through `/ceo` and are recorded in `docs/decisions.md`.
- All agents read `docs/feedback.md` and `docs/decisions.md` before working.

## Founder's daily CEO routine (~45 min)
1. **Brief (5 min):** read the 10-line brief / `dashboard.html`.
2. **Approve and post (5 min):** mark good drafts in `outbox/` `APPROVED`, post the LinkedIn draft by hand.
3. **Send outreach (20 min):** send 10–20 outreach messages by hand from `data/leads.csv` openers.
4. **Log replies (5 min):** `/log` every reply, call or user comment.
5. **Decide (5 min):** answer the "CEO: decide today" items (`/ceo`).
