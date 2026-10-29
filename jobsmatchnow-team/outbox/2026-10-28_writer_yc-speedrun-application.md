Status: DRAFT
Revised 2026-10-28 after Rev review (`outbox/2026-10-28_reviewer_yc-speedrun-application.md`): all 6 blocking issues and 9 nits addressed; Rev to re-check.

# JobsMatchNow: one shared answer set for a16z speedrun SR008 and YC W27

Author: Writer (drafting for Rizer/fundraiser). Date: 2026-10-28.
Nothing has been submitted, signed up for or sent. The founder rewrites every answer in their own voice, Rev checks claims, and the founder submits.
Rules applied: no number unless it is in `docs/metrics.md` (all values there are [NEEDS DATA]), product features are "in development, not live", no "vetted", no illustrative stats from the site (46% / 94% / 89% / 92% / 13–36 days / 3–8 days / 3.2× / 48h / 42%), no invented customers, quotes, activity or numbers.

---

## 1. Checklist and deadlines (speedrun first)

| # | Item | Deadline (PT) | Deadline (Bangkok / Vietnam, UTC+7) | Source |
|---|---|---|---|---|
| 1 | **a16z speedrun SR008: submit** | **Sun 2026-11-01 23:59 PST** | **Mon 2026-11-02 14:59** | [a16z post](https://a16z.com/applications-for-a16z-speedrun-sr008-are-now-open/), [speedrun.a16z.com/apply](https://speedrun.a16z.com/apply) (both fetched 2026-10-28 BKK) |
| 2 | **YC W27: submit on time** | **Mon 2026-11-02 20:00 PST** | **Tue 2026-11-03 11:00** | [ycombinator.com/apply](https://www.ycombinator.com/apply) (fetched 2026-10-28 BKK) |

Note on dates: 2026-11-01 is a **Sunday**, not a Saturday (checked with `date`). US daylight saving time ends 2026-11-01 02:00, so both deadlines are in PST (UTC-8). Aim to finish speedrun by **Sun 2026-11-01 evening Bangkok time** (a full day of buffer).

Founder to-do, in order:
- [ ] **Today (Wed 10/28):** open both forms, copy the exact questions and character limits into a private note. Replace the "unverified" question wording below with the real wording. *(Founder only; agents do not log in.)*
- [ ] **Wed 10/28:** fill every [FOUNDER] placeholder in section 4.
- [ ] **Thu 10/29:** rewrite section 2 in your own voice; cut every word you don't need.
- [ ] **Thu 10/29:** Rev checks every claim against `docs/` (especially section 3 and section 6).
- [ ] **Fri 10/30:** record the 1-minute founder video (section 5 bullets, 3-5 takes). All founders on camera.
- [ ] **Fri 10/30:** decide whether to include a demo link. Only a staging build Bui confirms is stable, labelled "staging build". Otherwise leave it out.
- [ ] **Before Sat 10/31:** open https://jobsmatchnow.com/app/ yourself and confirm no illustrative stats remain (46% match-to-hire; 94% / 89% / 92% satisfaction and would-recommend; 13–36 days; 3–8 days; 3.2× / 48h / 42% if present), and ask Rev to re-check production after Bui's deploy. If any remain, submit **without** the site URL (see A1).
- [ ] **Sat 10/31 – Sun 11/1 (BKK):** final read and **submit speedrun**.
- [ ] **Mon 11/2 (BKK):** reuse the same answers, adjust to YC's limits, **submit YC** (by Tue 11/3 11:00 BKK at the latest; aim for Mon evening BKK).
- [ ] Afterwards: founder appends both submissions to `docs/investors.md` status (founder edits; this draft does not).

Two founder decisions this draft cannot make:
- **Speedrun residency runs into April.** SR008 is Feb 1 – Apr 16 or 18, 2027 (the a16z post says Apr 18; the apply page says Apr 16), with a founder retreat Feb 2–4 and Demo Day Apr 13. The founder confirmed SF **Jan–Mar** only (`docs/decisions.md` 2026-10-28). **[FOUNDER] confirm you can also be in SF through mid-April 2027** before submitting speedrun.
- **The two programs overlap** (YC Jan–Mar, speedrun Feb–Apr, both in person in SF). If both say yes, you would have to choose. No need to decide now; just don't promise either form exclusivity.

---

## 2. Question-by-question draft answers

How to read this: each question shows **Form(s)**: SR (speedrun), YC, or both, and **Verified?** Only YC questions quoted in Paul Graham's public essay [How to Apply to Y Combinator](https://www.ycombinator.com/howtoapply) are marked "verified (public essay)", and even those may be worded differently on the current form. Everything else is **unverified**: it comes from the general shape of past accelerator forms, not from a page I could read. Both forms show their questions only after you sign in. Fit each answer to the real question and limit.

### A. Company

**A1. Company name and URL.** Form(s): both. Verified? unverified.
> JobsMatchNow[, https://jobsmatchnow.com/app/]

**[FOUNDER] gate:** include the URL only after Bui's deploy removes **all** illustrative stats from production (currently 46% match-to-hire; 94% / 89% / 92% satisfaction and would-recommend; 13–36 days; 3–8 days; plus 3.2× / 48h / 42% if present) **and** Rev has re-checked the live site. Until both are done, give the company name only, or add "product not yet live".

**A2. Describe what your company does in one line (about 50 characters).** Form(s): both. Verified? unverified.
> Mutual-match hiring for US startups, remote devs

(48 characters, counted with `len()`. Geography-neutral, matching the open decision on candidate geography in `docs/decisions.md`. If Vietnam/SEA should be in the line: "Mutual-match hiring: US startups x SEA engineers" (48). If the real limit allows 57, the fuller "Mutual-match hiring for US startups and remote engineers." works (57). Founder picks after checking the form's limit.)

**A3. What is your company going to make?** Form(s): both. Verified? **verified (public essay)**; current wording may differ.
> A hiring app where US startups and remote software engineers swipe on each other, and a conversation opens only when both say yes. Every match will show why it fits (matched skills, a 0–100 fit score with the evidence) and the salary range before the first message. Our first users will be US seed to Series B startups that hire engineers from Vietnam and Southeast Asia.
>
> Status: the mutual-match flow, fit explanations and demo matching without signup are built and code-reviewed on a branch, not yet deployed to production.

**A4. Where is the company based / where do the founders live?** Form(s): both. Verified? unverified.
> [FOUNDER] where you live now. If accepted we will be in San Francisco for the program (Jan–Mar 2027 for YC; Feb–Apr 2027 for speedrun: [FOUNDER] confirm April).

### B. Progress

**B1. How far along are you?** Form(s): both. Verified? unverified.
> Pre-launch and pre-traction. On 2026-10-25, about a week before this application, we changed our market from local Vietnam hiring to US startups hiring remote engineers from Vietnam/SEA. The core product (mutual match, explainable fit, salary up front, demo matching without signup) is built and code-reviewed on a branch, not yet deployed. Server-side funnel tracking (sign-up, role posted, swipe, match, first message) is written so we can report real numbers from day one. We will offer US hiring teams a free 3-month pilot; we have shortlisted 4 target companies from public job listings and have not contacted them yet. We have no users, customers or revenue yet.

**B2. How long have you been working on this? Full-time?** Form(s): both. Verified? unverified.
> [FOUNDER] start date, full-time or part-time, and for how long.

**B3. Are people using your product? How many users?** Form(s): both. Verified? unverified.
> Not yet. Users: [NEEDS DATA] (`docs/metrics.md` has no values). Answer "No, not yet" unless the founder updates `docs/metrics.md` before submitting.

**B4. Do you have revenue?** Form(s): both. Verified? unverified.
> No. MRR: [NEEDS DATA] (none recorded in `docs/metrics.md`).

**B5. What is your traction / key metrics?** Form(s): SR (most likely), YC. Verified? unverified.
> Pre-traction. No candidate sign-ups, hiring teams, matches or hires to report yet. What we have: a build that is code-reviewed on a branch but not yet deployed, instrumentation ready, and 4 target companies identified from public listings, not yet contacted. The next 30 days are about first discovery calls with US engineering leaders who hire abroad, and offering the first free pilots.

(Do not name the 4 targets or call them pilots or customers; they have not been contacted.)

**B6. If you have applied before, what changed?** Form(s): YC (and SR if asked). Verified? unverified.
> [FOUNDER] have you applied to YC or speedrun before? If yes: the main change is the market pivot to US buyers on 2026-10-25.

**B7. Demo link / product video.** Form(s): both. Verified? unverified ("separate place in the application" for a demo is stated on [ycombinator.com/video](https://www.ycombinator.com/video/); its exact field is unverified).
> Leave blank unless Bui confirms a stable staging build. If included, label it "staging build, not live". The public site currently shows illustrative stats (46% / 94% / 89% / 92% / 13–36 days / 3–8 days, plus 3.2× / 48h / 42% if present) labelled only as "Illustrative product targets for the demo experience" (Rev, production bundle fetched 2026-10-28). Avi recommends removing them before any reviewer sees the site (`plans/advisor/2026-10-27.md`). Same gate as A1: no site link until they are gone and Rev has re-checked.

### C. Idea and insight

**C1. Why did you pick this idea? What do you understand that others don't?** Form(s): both. Verified? unverified.
> [FOUNDER] your personal reason (one or two sentences: what you saw, did or lived).
>
> What we understand: US startups that hire remote engineers abroad don't lack applicants. They lack the right few who already want the job at the posted salary. Public job posts create a pile of one-way applications. When we looked at 33 recent remote engineering listings on YC's Work at a Startup (2026-10-25), very few allowed non-US candidates. The startups that really hire "anywhere" are a small, findable group; we start with remote-first dev-tools and infrastructure startups. Engineers in Vietnam and SEA, on the other side, apply into the void and rarely see the salary. We think making both sides opt in, with the salary shown first, cuts wasted screening on both sides; the free pilot is how we will test it.

(The 33-listings point is desk research by our team, not customer evidence. Keep it described that way. Dev-tools/infra is our chosen niche, not a finding from that sample.)

**C2. Who are your competitors? What do you understand that they don't?** Form(s): both. Verified? unverified.
> Toptal and Turing manage the screening and hiring for you. Upwork is an open freelance marketplace. LinkedIn, Wellfound and YC's Work at a Startup are where people apply. Deel and other employers of record handle contracts and payroll after a hire, so they are partners, not rivals. Recruiter tools are well funded too: Juicebox (LLM people-search for recruiters) raised a $30M Series A in Sep 2025 ([TechCrunch](https://techcrunch.com/2025/09/25/juicebox-raises-30m-from-sequoia-to-revolutionize-hiring-with-llm-powered-search/)), and Paraform (a startup-to-recruiter marketplace) raised a $3.6M seed in Apr 2024 ([TechCrunch](https://techcrunch.com/2024/04/15/paraform-a-recruiting-platform-that-connects-recruiters-and-startups-raises-funding/)). Closest to us is Dex (London): an AI "talent agent" talks with each engineer, matches them to employers, and passes a candidate to the hiring manager when both sides are interested. It raised a $5.3M seed in April 2026 ([Fortune](https://www.fortune.com/2026/04/28/exclusive-dex-ai-powered-recruiting-startup-raises-seed-round-notion-capital/)).
>
> Our difference, based on our understanding of their public products: (1) the salary range is visible to both sides before the first message; (2) the reasons for the fit are shown to both sides, not only to the employer; (3) we focus on one lane, US startups and Vietnam/SEA engineers; (4) it is a self-serve, two-sided swipe channel the hiring team uses directly, rather than an agent-curated shortlist, priced per hire (fee [NEEDS DATA]). Mutual interest itself is not unique; Dex has it too. Each piece exists somewhere; the combination for this lane is our bet. LinkedIn could copy the features. Our edge today is focus and speed, not traction.

(Before submitting, check each competitor's live product; `docs/competitors.md` has no verified rows yet. If there is no time, cut the list to Dex + "job boards and LinkedIn". Juicebox and Paraform figures come from `coordinator/research/2026-10-28_exit-comparables.md` section 5.)

**C3. How do or will you make money? How much could you make?** Form(s): both. Verified? unverified.
> Candidates use it free. US hiring teams will start with a free 3-month pilot, then pay a fee per hire, so they pay only when they hire. The fee amount is not set yet ([FOUNDER]: set it via /ceo before submitting if you can; for reference, Dex charges employers 20–30% of a hired candidate's salary ([Fortune](https://www.fortune.com/2026/04/28/exclusive-dex-ai-powered-recruiting-startup-raises-seed-round-notion-capital/)), which is not our price).
>
> Size: the US has about 1.9M software developer, QA and tester jobs and about 106,100 openings a year, at a $134,040 median wage ([BLS](https://www.bls.gov/ooh/computer-and-information-technology/software-developers.htm)). We start with the small slice of US startups that hire those roles abroad. Our reachable market (startups hiring globally × roles × fee) is [NEEDS DATA] until the fee is set.

**C4. Which category best fits your company?** Form(s): both. Verified? unverified.
> Hiring / HR tech, B2B marketplace. [FOUNDER] pick from the form's list.

**C5. What other ideas did you consider?** Form(s): YC. Verified? **verified (public essay)**; current wording may differ.
> [FOUNDER] list 1–3 real alternatives. One honest one from our own history: the same mutual-match app for local hiring in Vietnam (our original market) or for US startups hiring in one US city (our planned Phase A).

**C6. Why now?** Form(s): SR (likely), YC if asked. Verified? unverified.
> Remote-first startups already hire across borders, and a growing number of US states now require salary ranges in job posts, so salary-first hiring is becoming normal.

([FOUNDER/Rev: do not put a state count in the final text unless it has been checked against the statutes. Secondary trackers say 16–17 states plus D.C. as of Aug 2026; delete this note before submitting.])

### D. Founders

**D1. Founders: name, role, background, LinkedIn.** Form(s): both. Verified? unverified.
> [FOUNDER] name, role (CEO; also Vietnam/SEA engineer community lead), education, prior roles, LinkedIn URL. Repeat for each cofounder.
> Do not list the AI agents as team members.

**D2. Tell us about something impressive each founder has built or achieved.** Form(s): both. Verified? **verified (public essay)**; current wording may differ.
> [FOUNDER] one or two specific sentences per founder. Not this startup. The hardest thing you've done is a good choice. A concrete example beats an adjective.

**D3. Why are you the right founder(s) for this? / Founder-market fit.** Form(s): both. Verified? unverified.
> [FOUNDER] your link to Vietnam/SEA engineers and to US startups: where you have worked, who you know.
>
> [FOUNDER] community: state only what has already happened: meetups attended or run (name, date, size), technical interviews conducted, groups you are a member or admin of. If none yet, say "I will lead the engineer side myself" (future tense). This answer carries the application, so make it specific and true.

**D4. Tell us about a time you most successfully hacked a non-computer system to your advantage.** Form(s): YC. Verified? **verified (public essay)**; may have been removed or reworded on the current form.
> [FOUNDER] one true story. Short and specific.

**D5. How long have the founders known each other and how did you meet?** Form(s): both. Verified? unverified.
> [FOUNDER] or "Solo founder" if that is the case.

**D6. Are you looking for a cofounder?** Form(s): both. Verified? unverified.
> [FOUNDER]. If solo: say so plainly. Today the product, research and drafting run through an AI agent workflow the founder supervises, and the founder sends everything by hand. (Say this only if it helps; do not present agents as people.)

**D7. Who writes code / who built the product?** Form(s): both. Verified? unverified.
> [FOUNDER] who wrote the code (founder, contractor, AI-assisted). Be exact.

**D8. Will all founders commit full-time and be in SF for the program?** Form(s): both. Verified? unverified.
> YC: Yes, [FOUNDER name(s)] can be in San Francisco January–March 2027 (confirmed by the founder 2026-10-28). Speedrun: [FOUNDER] confirm February 1 through mid-April 2027.

### E. Equity, legal, funding

**E1. Have you incorporated? Where? Legal entity.** Form(s): both. Verified? unverified (YC FAQ notes on entity rules are summarised in `outbox/2026-10-27_fundraiser_yc-decision.md`).
> Not yet incorporated; we plan to form a Delaware C-corp (lawyer call by 2026-11-08). [FOUNDER] confirm, and replace "by 2026-11-08" with the booked date if there is one (`docs/decisions.md` 2026-10-25).

**E2. Equity split between founders.** Form(s): both. Verified? unverified (stock allocation question mentioned in the [public essay](https://www.ycombinator.com/howtoapply)).
> [FOUNDER] split, and whether vesting is planned. If solo and not incorporated: "100% founder; no stock issued yet; will set up when we form the Delaware C-corp."

**E3. Have you raised money? From whom, how much, what terms?** Form(s): both. Verified? unverified.
> [FOUNDER] If none: "No outside funding."

**E4. Are you currently fundraising?** Form(s): both. Verified? unverified (YC FAQ says to tell them on the application if you are actively fundraising: [ycombinator.com/faq](https://www.ycombinator.com/faq)).
> [FOUNDER] We are preparing a pre-seed for US investors; amount and terms are not set ([FOUNDER DECISION]). Also say you applied to both programs if the form asks about other accelerators.

**E5. Is anyone else (employer, school, contractor) owed equity or IP?** Form(s): both. Verified? unverified.
> [FOUNDER] answer truthfully. Mention any contractor-written code and whether IP has been assigned.

### F. Other

**F1. How did you hear about us / what convinced you to apply?** Form(s): both. Verified? unverified.
> [FOUNDER] For speedrun, a true, specific reason exists: a16z speedrun invested in Dex's pre-seed ([TechCrunch](https://techcrunch.com/2025/04/29/a16z-backs-uk-startup-dex-to-scale-ai-talent-agent-and-recruitment-matchmaker/)) and took part in its seed ([Fortune](https://www.fortune.com/2026/04/28/exclusive-dex-ai-powered-recruiting-startup-raises-seed-round-notion-capital/)), and Dex is the closest model we found. Do not imply speedrun led the seed. Use this only if it is your real reason.

**F2. Anything else?** Form(s): both. Verified? unverified.
> We are applying before traction on purpose. In the next 30 days we will run discovery calls with US engineering leaders who hire abroad, set our per-hire fee and offer the first free pilots. We will share real numbers from our funnel tracking as soon as they exist.

---

## 3. Honest traction (copy this framing everywhere)

| Metric | Value | Source |
|---|---|---|
| Stage | Pre-launch / pre-traction | `docs/company.md`, `docs/metrics.md` |
| Candidate sign-ups | [NEEDS DATA] | `docs/metrics.md` |
| Hiring teams signed up | [NEEDS DATA] | `docs/metrics.md` |
| Paying hiring teams | [NEEDS DATA] | `docs/metrics.md` |
| Mutual matches | [NEEDS DATA] | `docs/metrics.md` |
| Match → first message rate | [NEEDS DATA] | `docs/metrics.md` |
| Hires through the app | [NEEDS DATA] | `docs/metrics.md` |
| MRR | [NEEDS DATA] | `docs/metrics.md` |
| Customer conversations | None logged ([NEEDS DATA]) | `docs/feedback.md` empty per Rizer memo |
| Pipeline | 4 target companies identified, not yet contacted (not pilots, not customers) | `docs/investors.md`, `docs/company.md`, deck v1 slide 7 |
| Community activity | None logged; the founder holds the community-lead role from 2026-10-27 | `docs/decisions.md` 2026-10-27, `docs/feedback.md` |
| Product | Mutual match, explainable fit, salary up front, demo matching without signup: **built and code-reviewed on a branch, not yet deployed** (branch `feat/funnel-pwa-post-role`, not in master) | Deck v1 slide 3, `docs/metrics.md`, `data/team_board.csv` reviewer 2026-10-27 |
| Instrumentation | Server-side funnel events written, on the same branch | `docs/metrics.md` |

Words and numbers **not** to use: "vetted"; "Tinder-style"; any illustrative stat from the site (46%, 94%, 89%, 92%, 13–36 days, 3–8 days, 3.2×, 48h, 42%); "removes wasted screening" or any time-saved claim stated as fact; "we run meetups / interviews" unless logged; any candidate count; any customer or company name; any quote; anything from `docs/vision-backcast.md`; "LinkedIn will acquire us".

---

## 4. [FOUNDER] placeholders (only you can supply these)

1. Founder name(s), role(s), LinkedIn URL(s) (D1)
2. Background: education, prior roles (D1)
3. Something impressive each founder built or achieved (D2)
4. Why you: your link to Vietnam/SEA engineers and to US startups (D3)
5. Community: only what has actually happened (meetups attended or run, interviews conducted, groups), or future tense if none (D3, section 6 Q1/Q4)
6. Personal reason for picking this idea (C1)
7. "Hacked a non-computer system" story (D4)
8. Cofounders: any? how long you've known each other; looking for one? (D5, D6)
9. Who wrote the code (D7)
10. How long working on it; full-time or part-time (B2)
11. Where you live now (A4)
12. SF availability: Jan–Mar confirmed; **April 2027 for speedrun not confirmed** (A4, D8)
13. Entity status: "Not yet incorporated; we plan to form a Delaware C-corp (lawyer call by 2026-11-08)" + booked date if any (E1)
14. Equity split and vesting (E2)
15. Money raised so far, if any (E3)
16. Fundraising status and amount (E4; [FOUNDER DECISION])
17. Anyone else owed equity or IP (E5)
18. Applied before? (B6)
19. Other ideas considered (C5)
20. Category from the form's list (C4)
21. How you heard / why apply (F1)
22. Per-hire fee amount, if set before submitting (C3)
23. One-liner choice: neutral or with "SEA", after checking the real character limit (A2)
24. Demo link: include or not (B7)
25. Site link: only after all illustrative stats are removed from production and Rev re-checks (A1, B7)

---

## 5. 1-minute founder video: bullet outline (not a script)

Rules from [ycombinator.com/video](https://www.ycombinator.com/video/): 1 minute, only the founders talking, all founders on camera (screen-record a call if apart), no demo, bullets not a script. Speedrun's video requirement: unverified (check the form). Record once, reuse for both if allowed.

- **Who I am** (10 s): name, [FOUNDER] the one true fact that makes you credible for Vietnam/SEA engineers + US startups.
- **What it is** (15 s): US startups and remote engineers swipe on each other; a chat opens only when both say yes; fit reasons and salary shown first.
- **Why** (15 s): US startups hiring abroad drown in cold applications; engineers in Vietnam/SEA apply into the void without seeing the salary. Your own moment of seeing this: [FOUNDER].
- **Where we are, honestly** (10 s): pivoted to US buyers about a week ago, product built on a branch but not live, no users yet, 4 target companies picked, first pilots to be offered.
- **What's next** (10 s): discovery calls with US engineering leaders, first pilots, then real numbers. Can be in SF for the program.

Tips: look at the camera, talk as you would to a friend, 3–5 takes, keep the best one under 60 s.

---

## 6. Strongest honest answers to the hard questions

Source: Avi's memo `plans/advisor/2026-10-27.md`. Use these in "anything else", in competitor answers or in an interview.

**Q1. Why does mutual swiping beat Dex (AI talent agent, then matching; funded)?**
> Dex also works on mutual interest: its AI agent talks with each engineer, matches them to employers and passes a candidate to the hiring manager when both sides are interested ([Fortune](https://www.fortune.com/2026/04/28/exclusive-dex-ai-powered-recruiting-startup-raises-seed-round-notion-capital/)). Based on our understanding of their public product, we differ in four ways: the salary range is visible to both sides before the first message; the fit reasons are shown to both sides; we focus on a single lane, US startups and Vietnam/SEA engineers; and the hiring team uses a self-serve, two-sided channel directly instead of receiving an agent-curated shortlist. We don't know yet that this wins. Dex's traction (about $1.8M annualized run rate and 50+ employer customers, per Fortune) shows employers will pay for screened engineers. Our bet is a lighter, cheaper direct channel for one lane. [FOUNDER] add your real link to the engineer side here (only what has happened; otherwise "I will lead the engineer side myself"). Pilots will tell us whether teams prefer it.

**Q2. A startup that already posts "anywhere in the world" gets global inbound. What do we fix that their ATS inbox doesn't?**
> Inbound gives them volume, not fit: a pile of one-way applications to sort, many from people who would reject the salary. We send them only engineers who have already chosen the role at the posted salary, with the reasons for the fit, so they spend interviews on people who want the job. We should not overclaim: we think this saves screening time, and the pilot is how we test that on one of their roles at no cost. If their inbox already works well for them, they are not our customer.

**Q3. What is the fee, and who pays when the hire is a contractor through Deel or another EOR?**
> The hiring company will pay us a per-hire fee after a free 3-month pilot. The EOR question doesn't change that: the company engages the engineer through its own contractor setup or EOR (Deel or similar) and pays that vendor separately. We are not a payroll provider, EOR or legal adviser; we find the match, they handle employment. The fee amount is not set yet: [FOUNDER] set it before submitting if possible. Dex's 20–30% of a hired candidate's salary is a public reference point, not our price. Open question to settle: how we invoice and collect when the hire is a contractor (for example, on signed offer or after the first paid month) [FOUNDER DECISION].

**Q4. You have no customer. Why should we fund you now?**
> Correct: no customers, no users, no revenue. We changed market on 2026-10-25, about a week before applying, and chose to apply now rather than wait. What we have: a product built and code-reviewed on a branch (not yet live), funnel tracking ready, a narrow first niche we can find from public data, and 4 target companies identified but not yet contacted. [FOUNDER] your link to the engineer community: only what has already happened, or "I will lead the engineer side myself". What we will do in the next 30 days: discovery calls with US engineering leaders who hire abroad, set the fee and offer the first free pilots. [FOUNDER] add anything real that happened between now and submitting (a call, a reply, a "yes, I'd try it"), logged in `docs/feedback.md` first.

**Q5. (Bonus) The site shows stats like "46% match-to-hire" and "94% candidate satisfaction". Can you defend them?**
> No; they are illustrative targets for the demo, not results, and we have no users. All of them (46% / 94% / 89% / 92% / 13–36 days / 3–8 days, plus 3.2× / 48h / 42% if present) should be removed before anyone reviewing the application visits the site (Avi, `plans/advisor/2026-10-27.md`; Bui's P1 deploy; Rev's production check 2026-10-28). Do not cite them. If they are still live at submission, leave the URL out (A1).

---

## Sources
- https://a16z.com/applications-for-a16z-speedrun-sr008-are-now-open/ (deadline, deal, residency Feb 1 – Apr 18 2027, Demo Day Apr 13)
- https://speedrun.a16z.com/apply (deadline; residency "February 1 to April 16, 2027")
- https://www.ycombinator.com/apply (W27 deadline Nov 2 8pm PT, decisions by Dec 11, batch Jan–Mar in SF)
- https://www.ycombinator.com/video/ (video instructions)
- https://www.ycombinator.com/howtoapply (Paul Graham essay quoting past application questions)
- https://www.ycombinator.com/faq (fundraising note; solo founders accepted)
- https://www.bls.gov/ooh/computer-and-information-technology/software-developers.htm (via `docs/company.md`)
- https://www.fortune.com/2026/04/28/exclusive-dex-ai-powered-recruiting-startup-raises-seed-round-notion-capital/ (via `docs/investors.md`; Dex mutual interest, 20–30% of salary, ~$1.8M run rate, 50+ customers, a16z speedrun participation, per Rev's review)
- https://techcrunch.com/2025/04/29/a16z-backs-uk-startup-dex-to-scale-ai-talent-agent-and-recruitment-matchmaker/ (Dex pre-seed with a16z speedrun; via research brief)
- https://techcrunch.com/2025/09/25/juicebox-raises-30m-from-sequoia-to-revolutionize-hiring-with-llm-powered-search/ (Juicebox; via research brief)
- https://techcrunch.com/2024/04/15/paraform-a-recruiting-platform-that-connects-recruiters-and-startups-raises-funding/ (Paraform; via research brief)
- Repo: `CLAUDE.md`, `docs/brand.md`, `docs/company.md`, `docs/icp.md`, `docs/competitors.md`, `docs/metrics.md`, `docs/decisions.md`, `docs/investors.md`, `docs/objections.md`, `docs/feedback.md`, `outbox/2026-10-27_fundraiser_yc-decision.md`, `outbox/2026-10-27_fundraiser_preseed-deck-v1.md`, `outbox/2026-10-28_reviewer_yc-speedrun-application.md`, `plans/advisor/2026-10-27.md`
- Research brief: `/home/dzoan/.openclaw/workspace/coordinator/research/2026-10-28_exit-comparables.md` (section 5, competitor funding)
