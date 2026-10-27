Status: DRAFT

# Vetting pipeline v1: sign-up to "vetted" (internal, for the founder)

Owner: Mark drafts, Founder interviews. Stage: M1 (Nov 2026), feeds M3 "300 vetted engineers".
Internal doc. Vietnam/SEA-specific is fine here. Do NOT reuse the word "vetted" in public copy until the founder confirms the definition below (docs/icp.md rule). Public copy stays geography-neutral.
All counts below are [NEEDS DATA] until docs/metrics.md has them.

## The capacity problem (read first)
300 vetted by M3 with a 30-minute live interview each = 150 hours of interviews, before scheduling and notes. That is about 12 hours a week for 12 weeks, on top of the 1 hour/day selling budget (decisions 2026-10-25). The community-lead time budget is still an open decision.
So v1 uses a funnel where agents do the cheap steps and the founder only spends live time on people who already passed them. Two options for the founder to pick (see proposal at the bottom):
- Option 1 (recommended): "Vetted" = passed stages 1-4 including the live 30-minute interview. Interview only candidates who score well on the async screen, and batch interviews in 2 fixed blocks a week.
- Option 2: two badges. "Verified" (stages 1-3, no founder time) and "Interviewed" (stage 4). Buyers can filter on either. Honest, scales, but 300 "Interviewed" by M3 is then not required.

## Stages

| # | Stage | Who does it | Pass rule | Founder time |
|---|---|---|---|---|
| 0 | Sign-up | Candidate, in app | Profile has: role/stack, years of experience, time zone, salary expectation in USD, English level (self-rated), GitHub or portfolio link | 0 |
| 1 | Profile check | Builder's form validation + Mark's checklist | All required fields filled; link opens; no duplicate account | 0 |
| 2 | Async screen | Candidate sends a short written answer set (prepared by Mark) | Rubric score >= pass line (below) | 0 to 5 min review, only borderline |
| 3 | Work sample | Candidate links one real repo/PR/project and writes a 150-word "what I built and why" | Reviewer-checkable: code exists, candidate can explain it | 5 min skim for those who passed stage 2 |
| 4 | Live interview, 30 min | Founder | Scorecard total >= pass line and no red flag | 30 min + 5 min notes |
| 5 | Vetted | Founder marks in app/sheet | Profile gets the badge; candidate told what it means | 1 min |

Re-vet: badge is reviewed after 12 months or on a buyer complaint. [NEEDS DATA on whether that cadence is right.]

## Stage 2 async screen: 5 questions (candidate writes short answers, about 20 minutes)
1. Describe a bug you fixed that took more than a day. How did you find it?
2. A teammate in another time zone needs your review but you are asleep. How do you work so they are not blocked?
3. Explain a technical decision you made to a non-engineer in 3 sentences.
4. What US-overlap hours can you reliably offer (in your local time)? What have you done before with remote teams?
5. What is your expected pay in USD per month or year, and are you open to contracting rather than full-time employment?

## Rubric (score each 0-2; used for stages 2 and 3)
| Criterion | 0 | 1 | 2 |
|---|---|---|---|
| Technical depth | Vague, buzzwords | Correct but shallow | Specific, shows trade-offs |
| Written English | Hard to follow | Understandable, errors | Clear and concise |
| Async/remote habits | None shown | Some | Concrete habits (written updates, handoffs) |
| Ownership | "The team did it" | Mixed | Clear personal contribution |
| Reliability signals | Link broken / answers copied | Partial | Link works, answers read as own |

Pass line v1: 7 of 10 and no 0 in Technical depth or Reliability signals. Adjust after the first 20 candidates. Detecting AI-pasted answers: ask a follow-up in the live interview on any answer, rather than trusting a tool.

## Stage 4: 30-minute live interview scorecard (founder)

Timing: 3 min intro, 12 min technical, 8 min remote/English, 5 min logistics, 2 min close.

Before the call (Mark preps, 2 min read): the candidate's stage 2-3 answers and 2 follow-up questions drawn from their own work sample.

Scorecard (score each 1-5, write one evidence line each):
| Area | What to ask | 1 | 3 | 5 | Score | Evidence |
|---|---|---|---|---|---|---|
| Technical depth (x2 weight) | "Walk me through your work sample. What would you change?" plus one follow-up on a trade-off | Cannot explain own code | Explains what, not why | Explains why, trade-offs, failures | | |
| Problem solving | One live small problem (design a rate limiter at a high level, or debug a short snippet) | Stuck | Gets there with hints | Structured, asks clarifying questions | | |
| Spoken English | Natural conversation across the whole call | Cannot follow a US founder | Understandable, effortful | Comfortable in a team meeting | | |
| Async/remote habits | "Last time a deadline slipped on a remote team, what did you do?" | None | Generic | Specific and proactive | | |
| Overlap and availability | Hours, notice period, other commitments | Unclear or conflicts | Partial overlap | Clear overlap window offered | | |
| Pay and contract fit | Expected USD range; contractor vs employee; legal ability to contract | Unrealistic or unwilling | Negotiable | Clear and matched to roles buyers post | | |

Total out of 35 (technical counted twice). Pass line v1: 24 or more, and Technical depth 3+ and Spoken English 3+. [NEEDS DATA: calibrate after the first 10 interviews against what buyers say.]

Red flags (stop, do not badge): cannot explain own work sample; inconsistencies with the written screen; pressure to be paid outside agreed channels; hides current employer conflicts (moonlighting rules, non-competes).

Outcome after the call: Vetted / Not yet (give 2 lines of feedback and invite to re-apply in 90 days) / Not a fit. Send a short thank-you either way (Mark can draft the text).

Interview logistics to keep founder hours low: two fixed 3-hour blocks a week via a booking link [NEEDS DATA: tool the founder chooses, e.g. a calendar link]; record notes in a sheet (one row per candidate: date, scores, outcome); no recording without the candidate's consent.

## Candidate-facing wording (neutral, draft)
"Every engineer on JobsMatchNow can complete a short skills check and a live conversation. Teams see who has completed it." Do not claim a vetting percentage or number of vetted engineers. [NEEDS DATA]

## What each teammate needs (also sent as board rows)
- Builder: a `vetting_status` field on candidate profiles (none / screened / interviewed / vetted), a badge on the card and profile, a buyer-side filter, an admin view to flip status, and a funnel event per stage (names to be chosen by Bui).
- Seller: what buyers can be shown once real (see board row); nothing before data exists.
- Reviewer: check any "vetted" wording against this definition before it goes public.

## Metrics to track (all [NEEDS DATA] today, to be added by founder to metrics)
Sign-ups; % that finish stage 2; % that pass; interviews held; interview pass rate; days from sign-up to vetted; founder hours per vetted engineer. First 10 interviews decide whether the pass lines are right.

## Decision needed from founder
Pick Option 1 or Option 2 above and set a weekly hour budget for interviews. Without a budget, M3 "300 vetted" is not reachable by interviews alone.
