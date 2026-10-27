Status: DRAFT
Revised: 2026-10-27 after Rev feedback (L90 wording; founder decision date moved to 2026-10-30 per M1 P3)

# YC Winter 2027: apply or not? (decision memo for the founder)

Author: Rizer (fundraiser). Date: 2026-10-27 (kickoff day, M1). Nothing has been submitted. Only the founder can submit, through https://www.ycombinator.com/apply.

## 1. Deadline (checked today)
- https://www.ycombinator.com/apply (fetched 2026-10-27): "The deadline to apply on-time is November 2 at 8pm PT." On-time applicants get a decision by **December 11**. The batch runs **January to March in San Francisco**. Late applications: "we will still consider the application but can't promise exactly when we'll get back to you."
- `docs/decisions.md` is correct: **Mon 2026-11-02 20:00 PT** (PST; US daylight saving time ends Sun 2026-11-01) = Tue 2026-11-03 04:00 UTC = **Tue 2026-11-03 11:00 Vietnam**.
- Time left: 6 days, counting today.

## 2. What the application needs
| Item | What it is | Source |
|---|---|---|
| Written application | Online form (company, product, progress, market, founders, equity). The questions themselves are only visible after login, so they are **not verified**. Founder: open the form today and paste the questions into a private note. | ycombinator.com/apply |
| **Founder video** | 1 minute, "nothing except the founders talking": introduce yourselves, say what you're doing and why. All founders must appear (screen-record a call if you are apart). Use bullet points, not a script. It is "not the place to submit a demo." Whether it is required and how to upload it are not stated on the page. Assume it is expected. | https://www.ycombinator.com/video/ (fetched 2026-10-27) |
| Product demo / link | Optional link, judging by past forms (not verified). Our differentiators are on a branch and not yet in production (`docs/exit-readiness.md`), so show a staging demo only if Bui confirms it is stable. | `docs/exit-readiness.md` |
| Entity | You can apply without incorporating. To take part, a company incorporated outside the US/Canada/Singapore/Cayman needs a parent company in one of those jurisdictions. Our Delaware lawyer call is due by 2026-11-08, after the deadline. Answer the entity questions truthfully, e.g. "not yet incorporated; Delaware C-corp in progress". | `docs/outreach-strategy-yc.md` section 8 (YC FAQ, checked 2026-10-25) |
| Deal (if accepted) | $500,000 total: $125k on a post-money SAFE for 7%, plus $375k on an uncapped MFN SAFE. No fees. | https://www.ycombinator.com/deal (fetched 2026-10-27) |

## 3. What we can honestly show today
- **Product:** mutual-match hiring app. A chat opens only when both sides say yes. It shows explainable fit and salary up front, and has demo matching without signup. **Status: in development, not live.** It is on a branch and not in production yet (`docs/exit-readiness.md`).
- **Market decision:** pivoted on 2026-10-25 to US startups (seed to Series B) hiring remote engineers from Vietnam/SEA. The first niche is remote-first dev-tools/infra startups (`docs/decisions.md`).
- **Insight we can cite:** the seller looked at 33 recent remote engineering listings on YC Work at a Startup (2026-10-25). Most were US-only, which makes global-hiring startups a small, findable niche (`docs/icp.md` Learnings). This is desk research, not customer evidence.
- **Instrumentation:** server-side, privacy-first funnel events (signup, swipe, match, first message) are written and on a branch (`docs/metrics.md`).
- **Traction:** candidate signups, hiring teams, paying teams, matches, hires and MRR are all **[NEEDS DATA]** in `docs/metrics.md`. The application must say plainly "pre-launch / pre-traction" unless the founder updates metrics.md first.
- **Customer conversations:** none logged (`docs/feedback.md` is empty). **[NEEDS DATA]**
- **Team:** founder background, cofounder(s) and whether the founder can be in SF Jan to Mar 2027 are **[NEEDS DATA]**. Only the founder can answer these, and they matter most.

## 4. Time cost vs the 1-hour/day selling budget
Rough estimate, not a metric:
| Task | Est. time |
|---|---|
| Read the form, list the questions | 0.5 h |
| Written answers (Rizer drafts from this memo + deck v1; founder rewrites in own voice) | 3-4 h |
| 1-minute founder video (bullets, 3-5 takes) | 1 h |
| Demo link check with Bui (optional) | 0.5 h |
| Final read and submit | 0.5 h |
| **Total** | **about 5.5-6.5 h over 6 days, about 1 h/day** |

- The selling hour (`docs/decisions.md` 2026-10-25) stays protected. The YC work comes **on top**, as a second hour each day until Nov 2. `docs/outreach-strategy-yc.md` item 6 also keeps YC out of the selling budget.
- If the founder cannot add that hour, the choice is **not** "skip selling". It is "apply late" or "apply to a later batch with traction".
- The community-lead role (interviews, meetups) has no time budget yet (open decision), so this week it competes with YC.

## 5. Pros and cons
**Apply on time (W27)**
- Pro: the cost is capped at about 6 h, and the answer comes by Dec 11. Even a no clears the question so we can focus on pilots.
- Pro: the written answers become the core of the pre-seed narrative (deck v1 in `outbox/2026-10-27_fundraiser_preseed-deck-v1.md`), so the work is reused.
- Pro: if accepted, we get $500k, the US network and SF presence. That fits the US-only investor rule and the LinkedIn/US-acquirer path.
- Con: we would apply with zero traction and no customer conversations. That makes it the weakest application we will ever send. YC states no acceptance rates on these pages, so I give no odds.
- Con: if accepted, the batch is Jan to Mar in SF. That needs the founder in SF and the US-parent entity question solved fast. Feasibility is **[NEEDS DATA]**.
- Con: it adds about 1 h/day in the same week the first outreach cohort and follow-ups start.

**Apply to a later batch (Spring/Summer 2027) with M3 proof**
- Pro: by M3 the plan targets live differentiators, pilots started and a first hire (`docs/vision-backcast.md`, imagined targets, not facts). A real paragraph on progress makes a much stronger application.
- Con: it delays any YC money and network by about 6 months, and the M9 pre-seed date then depends on other investors.

**Apply late to W27 (after Nov 2)**
- Pro: allowed, and we can add 1-2 weeks of pilot conversations first.
- Con: no promised response date. It probably gets the worst of both options.

## 6. Recommendation
**Apply on time to W27 with a lean application, capped at 6 hours outside the selling hour. But only if the founder answers "yes" to both gate questions below by Fri 2026-10-30** (date agreed by the team in M1, proposal P3; this leaves the weekend plus Monday for the application).
1. Can you (and any cofounder) be in San Francisco from January to March 2027 if accepted?
2. Can you add about 1 h/day until Nov 2 without cutting the selling hour?

If either answer is no, skip W27 and target the next batch once metrics.md shows pilots and matches. Rizer then keeps the drafted answers as the base of the deck.

Rules for the application, if we apply:
- No number unless it is in `docs/metrics.md`. Say "pre-traction" plainly.
- Describe the features as "in development, not live". Do not call them live until Bui confirms they are in production.
- Do not cite anything from `docs/vision-backcast.md` as fact.
- No cold emails to YC partners. Do not ask outreach contacts for intros (`docs/outreach-strategy-yc.md`).
- Rev reviews every claim before the founder submits.

## 7. Proposed 6-day plan (if the founder says yes)
| Day | Founder (on top of the selling hour) | Rizer drafts |
|---|---|---|
| Tue 10/27 | Open the form, paste the questions into a private note | This memo + deck v1 |
| Wed 10/28 | Give team/background facts (useful whatever you decide) | Answer drafts once the questions are pasted |
| Thu 10/29 | Rewrite the answers in your own voice | Rev checks the claims |
| Fri 10/30 | **Decide yes/no on the 2 gate questions (deadline).** If yes, record the 1-min video (bullets below) | - |
| Sat-Sun | Optional: Bui confirms the staging demo link | - |
| Mon 11/2 | Final read; **founder submits** before 20:00 PT (Tue 11:00 Vietnam). Aim to finish Monday morning Vietnam time | - |

Video bullets (founder speaks, no script):
- Who I am and why I know Vietnam/SEA engineers (founder fills in) [NEEDS DATA]
- What it is: US startups and Vietnam/SEA engineers swipe on each other; a chat opens only when both say yes, with salary and fit reasons up front.
- Why: US startups hiring globally drown in cold applicants, and engineers apply into the void.
- Where we are: honest status, pre-traction, first pilots being offered.

## Sources
- https://www.ycombinator.com/apply (fetched 2026-10-27)
- https://www.ycombinator.com/video/ (fetched 2026-10-27)
- https://www.ycombinator.com/deal (fetched 2026-10-27)
- YC FAQ notes in `docs/outreach-strategy-yc.md` section 8 (checked 2026-10-25)
- `docs/decisions.md`, `docs/metrics.md`, `docs/exit-readiness.md`, `docs/icp.md`, `docs/vision-backcast.md`
