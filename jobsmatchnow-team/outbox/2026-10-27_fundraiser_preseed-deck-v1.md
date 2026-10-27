Status: DRAFT
Revised: 2026-10-27 after Rev BLOCK

# JobsMatchNow pre-seed deck outline v1 (US investors)

**Revision log (2026-10-27, round 2 of M1):** slide 4 "30 seconds" removed (no measured time); slide 6 Vietnam 560k figure marked [NEEDS DATA] until checked in the TopDev PDF; slide 10 "vetted" removed until the founder defines it (P2); slide 7 now says "4 pilot targets identified" (Selly's shortlist); slides 3-4 differentiators described as "in development, not live" (Bui: branch not merged, `data/team_board.csv` 2026-10-27).

Author: Rizer (fundraiser). Date: 2026-10-27. Audience: US pre-seed investors and accelerators only (no Vietnam-based investors, `docs/decisions.md`).
This is the copy for each slide, not a design. Every traction number is **[NEEDS DATA]** because `docs/metrics.md` has no values yet. Nothing from `docs/vision-backcast.md` appears as fact. Rev must review before any rehearsal or send.

| # | Slide | One line of copy | Proof / source behind it |
|---|---|---|---|
| 1 | Title | **JobsMatchNow: stop chasing jobs and candidates. Let the perfect match chase you.** | Tagline from CLAUDE.md. Subline: "Mutual-match hiring for US startups and remote engineers in Vietnam/SEA." |
| 2 | Problem | US startups hiring remote engineers get piles of cold applicants, and engineers abroad apply into the void with no salary in sight. | Hypothesis from `docs/icp.md` (B1/B2, C1). **Customer quotes: [NEEDS DATA]** (`docs/feedback.md` is empty). Replace with 2-3 real quotes before any send. |
| 3 | Solution | Both sides swipe, and a conversation opens only when both say yes. Fit reasons and the salary range shown before the first message are **in development, not live**. | Product differentiators (CLAUDE.md). Status: in development on branch `feat/funnel-pwa-post-role`, not merged, not in production (Bui, M1). Do not say "live" until Bui confirms production and Rev passes it. |
| 4 | Demo | The demo shows a match without signup: pick a role, see who fits and why, and swipe. (In development, not live.) | Demo matching without signup is in development, not live. Use a staging screenshot or clip only after Bui confirms it is stable; label it "staging build". |
| 5 | Why now | Salary ranges in job posts are becoming law in many US states, and remote-first startups already hire "anywhere". The market is ready for salary-first, mutual-opt-in hiring across borders. | 16-17 states plus D.C. had pay-transparency posting laws by Aug 2026 per secondary trackers: https://www.paychex.com/articles/compliance/pay-transparency-laws-by-state , https://www.brightmine.com/us/resources/u-s-pay-transparency-laws-by-state-and-locality/ (check the statutes before stating an exact count). Global-hiring startups cluster in dev-tools/infra (`docs/icp.md` Learnings, desk research). |
| 6 | Market | The US has about 1.9M software developer/QA/tester jobs and about 106k openings a year at a $134k median wage. Vietnam IT talent pool: [NEEDS DATA]. We start with the slice of US startups that hire them remotely. | BLS OOH, Software Developers, QA Analysts and Testers (2025 jobs 1,905,400; median pay May 2025 $134,040; about 106,100 openings/yr 2025-35): https://www.bls.gov/ooh/computer-and-information-technology/software-developers.htm . Vietnam figure: **[NEEDS DATA]**. A secondary source quotes about 560k IT professionals from the TopDev Vietnam IT Market Report 2024-2025; do not put that number on the slide until it is confirmed in the PDF itself: https://topdev.vn/vietnam-tech-talents-report-topdev-2024 . Bottom-up SAM (number of startups hiring globally x roles x per-hire fee): **[NEEDS DATA]** (fee not set). |
| 7 | Traction | Candidate signups [NEEDS DATA], hiring teams [NEEDS DATA], mutual matches [NEEDS DATA], match to first message [NEEDS DATA], hires [NEEDS DATA], paying teams [NEEDS DATA], MRR [NEEDS DATA]. Pipeline: 4 pilot targets identified. | Metrics from `docs/metrics.md` only; report `demo = false` counts only. "4 pilot targets identified" = Selly's verified shortlist (`outbox/2026-10-27_seller_pilot-shortlist.md`); these are targets, not customers, so do not name them or call them pilots on the slide. Until numbers exist, say plainly: "Pre-traction. Pivoted to US buyers 2026-10-25; 4 pilot targets identified, first free pilots being offered." |
| 8 | Business model | Candidates are free. US hiring teams start with a free 3-month pilot, then pay a per-hire fee, so they pay only when we deliver a hire. | `docs/decisions.md` 2026-10-25 (pricing to test). **Fee amount: [NEEDS DATA]** (founder decision via /ceo). |
| 9 | Competition | Toptal and Turing manage the hiring for you; Upwork is an open freelance marketplace; Deel pays the people once they are hired; LinkedIn is where people apply. We are the direct, mutual opt-in layer where both sides have already said yes. | `docs/objections.md` (Toptal/Turing/Upwork/Deel/Arc answers). `docs/competitors.md` table is still empty, so verify each competitor's live product before showing a 2x2. Pair Deel/EOR with us as a complement, not a rival. |
| 10 | Go-to-market | We start narrow: remote-first US dev-tools and infra startups (seed to Series B, 10-200 people) that already hire "anywhere". The founder sells by hand, and we grow the engineer pool through Vietnam/SEA dev communities the founder leads. | `docs/decisions.md` (first niche; founder as community lead). Pipeline size: **[NEEDS DATA]** (`data/leads.csv`). Candidate screening: do not say "vetted" until the founder decides the definition (M1 proposal P2: Verified and Interviewed badges). Candidate count: **[NEEDS DATA]**. |
| 11 | Team | [Founder name], CEO and community lead: [background, why this founder for Vietnam/SEA to US hiring]. | **[NEEDS DATA]**: founder bio, prior roles and any cofounder. Founder fills this in. Do not list the AI agents as team members. |
| 12 | Ask and use of funds | Raising [NEEDS DATA] pre-seed on a SAFE to reach the next proof points: paying US teams, a screened engineer pool and the first hires through the app, over the next [NEEDS DATA] months. | Amount, instrument, cap and runway: **[FOUNDER DECISION]**. Use of funds split (product / candidate supply / sales): **[NEEDS DATA]**. Do not put the 36-month backcast targets on this slide. |

## Speaker notes (short)
- **Biggest honesty point:** say "pre-traction" out loud on slide 7. Investors forgive "early". They do not forgive inflated numbers.
- **Expect "Why you and not LinkedIn?"** Answer: focus on one cross-border segment, plus mutual opt-in and salary up front. Admit LinkedIn could copy the features (`docs/objections.md`). Do **not** pitch "LinkedIn will buy us". At most, slide 9 or the Q&A can say: "Complementary to the large platforms; integrations (ATS, LinkedIn sign-in) are on the roadmap." An acquisition is a long-term outcome that needs traction first.
- **Expect "chicken and egg":** one niche, candidate supply seeded through founder-led communities before charging employers. Supply density is what we are proving.

## Proof points investors will ask for by M6 (start collecting now)
| Proof point | Owner | Where it should live |
|---|---|---|
| Weekly `demo = false` counts: signups by side, roles posted, swipes, matches, first messages (8+ weeks of history) | Bui (events to production) + Founder (`/log-metrics`) | `docs/metrics.md`, `data/metrics_history.csv` |
| Pilots: started date, roles, days to first match, interviews, hires, pilot-to-paid, buyer quotes | Selly | `data/leads.csv`, `docs/feedback.md` |
| Candidate count per badge, once the founder defines "vetted" (P2: Verified / Interviewed) | Mark + Founder | `docs/metrics.md` (new row), `docs/icp.md` |
| Per-hire fee amount and first invoice | Founder | `docs/decisions.md`, `docs/metrics.md` (MRR) |
| Retention or repeat use (teams posting a 2nd role; candidates active after 30 days) | Bui | `docs/metrics.md` (new event needed) |
| Delaware C-corp + clean cap table | Founder | `docs/exit-readiness.md` |

## Open gaps before v2
1. Team slide: founder facts. **[NEEDS DATA]**
2. Any customer quote or pilot. Slide 2 and slide 7 are empty without them.
3. Raise amount and use of funds. **[FOUNDER DECISION]**
4. Vietnam talent-pool figure checked in the TopDev PDF (slide 6 stays [NEEDS DATA] until then), and a competitor table in `docs/competitors.md`.
6. Differentiators live in production (slides 3-4 say "in development, not live" until Bui confirms and Rev passes).
5. Pre-seed deck deadline is still "[DATE]" in CLAUDE.md (open decision).
