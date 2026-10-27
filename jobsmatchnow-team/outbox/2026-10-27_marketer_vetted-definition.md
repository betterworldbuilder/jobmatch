Status: DRAFT

# Decision aid for the founder (P2): what does "vetted" mean?

Decision needed via /ceo. Until you decide, no public copy uses "vetted" (rule in `docs/brand.md`). All counts are [NEEDS DATA]; nothing below is a result. Pass criteria build on `outbox/2026-10-27_marketer_vetting-pipeline.md`; I did not re-read its thresholds, so align exact cut-offs when you decide.

## Option A: two badges (team-agreed recommendation)

### Badge 1: Verified (async checks, no founder time)
Pass criteria, all required:
1. Profile complete: stack, seniority, years, USD pay expectation, overlap window, English level (self-declared).
2. Public work evidence: a GitHub, portfolio or write-up link that a reviewer opens and confirms is the person's own work.
3. Written English sample: a short written answer (for example, explain a past technical decision) rated at or above the rubric's written-English bar.
4. Async coding or design exercise (take-home, short) passed against the rubric.
5. Identity and contact confirmed (email/LinkedIn match); candidate agrees to the honest-profile terms.
Who reviews: an agent prepares the scorecard; a human check of the first batch is needed (see hours below).

Honest copy: "Verified: profile, work samples and a written exercise checked." Never "interviewed", never "vetted", never "top X%".

### Badge 2: Interviewed (live, about 3h/week founder cap)
Pass criteria, all required, on top of Verified:
1. Live 30-minute technical conversation scored on the scorecard (technical depth for the target stack).
2. Spoken English clear enough for a daily standup.
3. Async habits confirmed (examples of written updates, PR reviews, remote work).
4. Confirms at least 4 hours of US overlap and evening-shift willingness (if the role needs it).
5. Pay expectation in USD stated and consistent with the profile.
Who interviews: the founder (decision 2026-10-27, community lead).

Honest copy: "Interviewed live by the JobsMatchNow founder for [stack] and English." Never "guaranteed good", never a pass rate unless in `docs/metrics.md`.

## Option B: interview-only ("vetted" = passed the live interview)
Single badge, same criteria as Interviewed but without the async layer. Honest copy: "Vetted: interviewed live" only after the founder defines and approves the word.

## Comparison

| | A: two badges | B: interview-only |
|---|---|---|
| Founder hours/week | Verified: 0 steady-state, plus about 1h/week spot-checks of agent scoring (my estimate, [NEEDS DATA] until tried). Interviewed: about 3h/week cap = 6 interviews of 30 min. | Every candidate needs founder time; hours scale with the candidate target. |
| Can we say at launch | "Verified" can be said once checks run. "Interviewed" only for people actually interviewed. | Nothing until the first interview is done. |
| Candidate pool shown to buyers | Larger (Verified) with a premium tier (Interviewed). | Only interviewed people. |
| Risk | Two labels to explain; "Verified" must not be read as "interviewed". | Bottleneck on the founder; 1,000 candidates not reachable. |

At 3h/week and 30-minute interviews, 6 interviews a week is about 24 in 4 weeks; 300 would take about 50 weeks. That is why a 300-vetted goal at M3 (per the M1 gate) cannot rest on Option B, and only the Verified tier can scale. Arithmetic only, not a traction claim.

## What you need to decide
1. Option A or B.
2. The word: use "Verified" and "Interviewed" publicly, and keep "vetted" retired, or define "vetted" as one of them.
3. Weekly community hours: confirm 3h/week interviews, and add meetups time separately.
4. Whether the "300 vetted by M3" gate in the vision file is renamed to "300 Verified".

## What Bui needs once decided
`vetting_status` on profiles, badge on card and profile, buyer filter, admin view to set status, funnel event per stage (see board row to builder).
