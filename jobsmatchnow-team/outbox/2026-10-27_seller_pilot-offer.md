Status: DRAFT
Revised: 2026-10-27 after Rev BLOCK

# Pilot offer (1 page) and 7-day onboarding plan

Approved terms only (docs/decisions.md 2026-10-25): free 3-month pilot, then a per-hire fee. Fee amount: [NEEDS DATA] (founder sets via /ceo). No "founding-partner places". No metrics, candidate counts or vetting claims ([NEEDS DATA]). Mutual-match features are described as "what you will see in the demo" until the founder confirms they are live.

## Part 1: the offer (founder can paste into an email or share on a call)

**Free 3-month pilot: meet remote engineers who say yes back**

For: US dev-tools and infra startups that already hire engineers outside the US.

What you get
- One engineering role (more by agreement) set up with its salary range up front.
- What the demo shows: engineers matched to your role with the reasons they fit, so you can judge them yourself.
- What the demo shows: a conversation opens only when both you and the engineer say yes.
- Personal onboarding from the founder. You do not need to change your ATS or tools.

What it costs
- Nothing for 3 months. No card, no contract.
- After the pilot, a fee per hire only if you hire someone through JobsMatchNow. Amount: [NEEDS DATA]; we agree it with you before the pilot ends and you can walk away at no cost.

What we ask of you
- A short setup call to define the role, and a quick review of matches twice a week.
- Honest feedback after each interview, including why not. This shapes the product.

What we do not do
- We are a matching app, not payroll, an EOR or legal advice. How you engage someone abroad is your decision with your own provider.
- You make every decision; nothing auto-hires or auto-rejects.

The rule we hold ourselves to
If you have no mutual match within 7 days of setup, we tell you plainly, and either fix it or end the pilot. We do not leave you waiting.

## Part 2: 7-day onboarding plan (goal: first mutual match by day 7, or the pilot dies)

Owner: Founder, by hand (about 1 hour/day budget, docs/decisions.md). Selly drafts; Bui supports product; Mark and Founder supply candidates.

| Day | Who | Action | Done when |
|---|---|---|---|
| Before day 0 | Selly, Founder | Confirm the role is open, remote, non-US OK, overlap needed (hours), salary range. Agree what the pilot success is | Role brief written (stack, seniority, overlap hours, salary range) |
| Before day 0 | Founder | Check supply: do enough candidates fit this role's stack and overlap? If not, say so and delay the start. Do not start a pilot we cannot serve | Supply check yes/no recorded ([NEEDS DATA] for counts) |
| 0 | Founder + buyer | Short call: live demo, then post the role together with salary range, must-haves, overlap | Role live in the app |
| 1 | Founder | Hand-pick engineers who fit the role and invite them to the app; confirm profile has salary expectation, stack, overlap | Candidate pool for the role exists |
| 2 | Buyer | Reviews first matches. Founder messages buyer with 3 to 5 names worth a look | Buyer has swiped on at least some candidates |
| 3 | Founder | Check dashboard: team swipes, candidate swipes, matches. Nudge candidates who were liked by the team | Candidate responses in |
| 4 | Founder | Mid-week check-in message (3 lines). Widen the role (salary band, overlap, stack) if no overlap in yes-swipes | Role tuned |
| 5 | Founder | Add a second batch of candidates if needed | Pool refreshed |
| 6 | Founder | Ask buyer for one-sentence feedback on matches seen. Log in docs/feedback.md | Feedback logged |
| 7 | Founder | Decision point. First mutual match? Yes: book the interview and a 30-day check-in. No: short call with the buyer, fix the cause (supply, role, overlap) once, then 3 more days. Still none: close the pilot, record why in docs/feedback.md | Match, or an honest close |

Pilot scorecard (weekly, from docs/metrics.md events, demo = false only; all values [NEEDS DATA] until pulled): role_posted, swipes per side, match_created, first_message. Month-3 review: interviews held, hires, buyer's answer on the per-hire fee.

## What pilots need from the product (for Bui)
1. Roles must carry salary range, stack, seniority and required overlap hours, visible to candidates before they swipe.
2. A way for the founder to see per-pilot funnel (team swipes, candidate swipes, matches, first message) without SQL, today through /api/admin/analytics/events but per account.
3. Candidate profile fields buyers ask about: English level, available overlap window, remote-team experience (docs/icp.md). Show only what exists.
4. A nudge or notification when a team has liked a candidate so candidates respond within a day.
5. Timezone-overlap matching is NOT STARTED (docs/exit-readiness.md); until it exists, the founder checks overlap by hand. Do not promise it.

## Claims check
No traction, candidate count, vetting or live-feature claims. "Vetted" not used. Geography neutral in the offer (open decision). No "applicant pile". No promised time commitments. Per-hire fee amount and timing left as [NEEDS DATA]. Reviewer (Rev) to check before any use.
