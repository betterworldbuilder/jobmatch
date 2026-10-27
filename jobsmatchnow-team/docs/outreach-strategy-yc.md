# Outreach strategy: customers, YC feedback, strategic learning (marketer, 2026-10-25)

Status: DRAFT for founder review. Nothing here has been sent. Agents draft; the founder sends by hand.
Companion files: `outbox/2026-10-25_marketer_yc-first-emails.md` (message drafts), `data/outreach.csv` (message tracker).

## 0. Mission, rules and what is verified

Mission (founder brief): an outreach engine for (1) paying US customers, (2) founder feedback and relationships that support the YC application, (3) early relationships with US strategic platforms once traction supports it.

Rules in force for everything below:
- Customers, leads, strategic contacts: US-based only. US English. Candidate talent-location claims stay NEUTRAL (no "from Vietnam/SEA" or any other place) in all new copy. See Conflict 1.
- Working positioning line: "JobsMatchNow helps hiring teams and candidates connect through mutual interest, salary transparency and explainable matching."
- Feature status (repo docs: `docs/brand.md`, `docs/exit-readiness.md`): mutual match, salary up front, explainable fit and demo matching without signup are on a branch, "live soon" (IN PROGRESS). Say "in the demo" or "shipping soon", never "live" until the founder confirms. Timezone-overlap matching is NOT STARTED: never claim it.
- Never claim: "no ghosting", guaranteed hires or matches, pre-vetted candidates, any traction, customer count, conversion or outcome (all `docs/metrics.md` rows are [NEEDS DATA]), "ten founding-partner places" ([FOUNDER DECISION]).
- Allowed offer: free 3-month pilot, then per-hire fee (`docs/decisions.md`, 2026-10-25). Do not quote a fee amount (not set).
- Every first email: truthful subject, one specific reason for contacting, concise relevance, one clear ask, body under 100 words, `{{postal address}}` and an opt-out line. The founder has NOT provided a postal address. Never fabricate one. The founder should confirm cold-email address and opt-out requirements with counsel (this file gives no legal advice).
- Research: public sources only, keep URL + date checked per personalised claim. No scraping, bulk lists, guessed emails, invented warm intros, or auto-DM tools.
- Gap: `docs/templates/` does not exist (no shared message/footer templates). The footer and tracker format below are defined here; the Chief of Staff can move them into `docs/templates/` if wanted.

## 1. Segment A: customers (US YC startups, seed to Series B, with verified engineering vacancies)

- **Why they'd care (hypothesis, validate in calls):** inbound engineering applications are noisy; they want to talk only to people who already chose the role; salary mismatch discovered late wastes interviews (`docs/icp.md` B1/B2). A free 3-month pilot lowers the cost of testing us.
- **Qualify (all from public sources):** US-based company (HQ or stated US base); YC company (YC directory page); seed to Series B, 10-200 people; at least one open software-engineering role on the company's own careers page or YC Work at a Startup, posted within about 30 days; role is remote or remote-friendly; buyer role identifiable (founder, CTO, Head of Eng, Head of Talent). Prioritise remote-first dev-tools/infra (`docs/decisions.md` niche decision).
- **Exclude:** non-US companies; no verified engineering vacancy; hiring freeze or layoffs announced; role not software engineering; company states US-only on-site; anyone who opted out; competitors (move to Segment B).
- **Primary ask:** a 15-minute demo, or a pilot discussion for one specific role. Never ask for a referral or introduction in touch 1.
- **Channel:** email first (the founder finds a work email through the company's own public pages or contact form; never guess). LinkedIn connection note is optional and only after or alongside email, not both on the same day.
- **Evidence to collect per lead:** careers/job URL + date; YC directory URL + date (batch, size, location); funding or hiring-trigger URL + date; buyer title; remote/overlap wording from the post. Record in `data/leads.csv` (company) and `data/outreach.csv` (message).
- **Sequence (3 touches, each with new value):**

| Touch | Spacing | New value | Length |
|---|---|---|---|
| 1 | Day 0 | Specific role/trigger, what we are, the 15-min ask, demo link, pilot offer | under 100 words |
| 2 | +3 business days | One new, role-specific thing: e.g. what the "why this fit" and salary-range view would look like for THEIR role (demo or screenshot), plus one question about how they source today | under 80 words |
| 3 | +5 business days after touch 2 | Soft close: "closing the loop", offer to come back when they next open a role, one-line opt-out reminder | under 60 words |

Stop immediately after any reply, opt-out or clear rejection (see section 7). The seller already drafted email-2 and email-3 for the 3 existing leads in `outbox/2026-10-25_seller_*`; reuse those after the reviewer checks them against this file.

- **Sending windows (recipient local morning, Tue-Thu best; Monday ok; avoid Friday afternoon and weekends):**

| Dates | US DST | Eastern 08:30-10:30 | Pacific 08:30-10:30 | In Asia/Ho_Chi_Minh (UTC+7, no DST) |
|---|---|---|---|---|
| Mon 2026-10-26 to Sat 2026-10-31 | EDT UTC-4 / PDT UTC-7 | 08:30-10:30 | 08:30-10:30 | ET window = 19:30-21:30 same day; PT window = 22:30-00:30 (next calendar day) |
| Mon 2026-11-02 onward (DST ended Sun 2026-11-01) | EST UTC-5 / PST UTC-8 | 08:30-10:30 | 08:30-10:30 | ET window = 20:30-22:30 same day; PT window = 23:30-01:30 (next calendar day) |

  The founder's own time zone is assumed to be Vietnam because the seller drafts use Vietnam time ([NEEDS DATA] if different). Practical rule: send Eastern-window emails live; for Pacific-based companies use the founder's own email scheduled-send (still sent by the founder) so the founder is not up at midnight.
- **Success metrics (all counted from confirmed-sent only):** replies / confirmed sent (always show the denominator); positive replies; 15-min calls booked; pilot discussions; opt-outs; bounces. Leading indicator: quality of replies (specific objection vs polite no).
- **Mistakes to avoid:** bulk sends; the same sentence in all emails; praising generically; pitching the swipe mechanic before the specific role; claiming candidate numbers or vetting; sending follow-ups after a reply; mentioning a candidate geography in new copy; sending without footer/address.

## 2. Segment B: founder feedback (US-based YC founders in recruiting, HR tech, remote work, marketplaces)

- **Why they'd care:** founders are generally willing to give a two-line honest reaction to a peer's question when it is specific, short and easy to answer. We offer nothing but a thank-you; we are honest that we are early.
- **Qualify:** US-based founder or cofounder of a YC company (YC directory); company is in recruiting/HR tech, remote work, or a two-sided marketplace; public evidence of what they build (their site or YC page); one specific question we can ask that they can answer from experience.
- **Exclude:** non-US; anyone we would otherwise treat as a customer in A (do not mix asks); YC partners (reach YC only via https://www.ycombinator.com/apply, no cold email); people whose only link is a social post we cannot cite.
- **Flag direct competitors:** if the company does hiring marketplaces, candidate matching or sourcing, mark `competitor` in `notes`, use the B2 variant (ask advice on a public-information question, never pitch, share nothing confidential). Example names surfaced by a web search on 2026-10-25 (search snippets only, not yet verified on their own pages, so verify before use): Ashby (YC 2019, recruiting software), Contrario (YC W25, AI hiring platform), via https://www.ycombinator.com/jobs/role/software-engineer. Treat as candidates for research, not as a list.
- **Primary ask:** one honest answer to one specific question (or, if easier for them, a 15-minute call). **No referral or introduction ask in the first message.** Also do not mention YC outcomes or imply any YC relationship: YC says all applications are considered equally and it does not rely on introductions (https://www.ycombinator.com/faq, checked 2026-10-25), so this segment is for product feedback, not for gaining admission advantage.
- **Channel:** email (publicly listed contact) or LinkedIn connection note then message. The founder sends.
- **Evidence to collect:** YC directory URL + date; company site URL + date; one public post, product page or launch note that motivates the question; competitor flag.
- **Sequence:**

| Touch | Spacing | New value | Length |
|---|---|---|---|
| 1 | Day 0 | One specific question, honest "we are early", reply-in-two-lines option | under 100 words |
| 2 | +4 business days | A sharper, narrower version of the question (one yes/no or A/B choice), shows we read their reply-cost | under 60 words |
| 3 | +5 business days after touch 2 | Thank-you and close; no further asks | under 40 words |

- **Sending windows:** same table as Segment A; Tue-Thu 09:00-11:00 recipient local time. Founder feedback is best sent when the founder can reply quickly the same day.
- **Success metrics:** substantive replies / confirmed sent (denominator shown); number of distinct, usable product or positioning insights; calls held. A reply that disagrees is a success.
- **Mistakes to avoid:** hiding the pitch inside a "feedback request"; asking for intros or investment; sending the same question to everyone; writing as if we have traction; pasting confidential information; contacting YC partners directly.

## 3. Segment C: strategic (LinkedIn Talent Solutions, Indeed, ZipRecruiter, Greenhouse, Lever, Workday)

- **Status: BLOCKED (evidence gate).** Do not send anything until `docs/metrics.md` contains at least one relevant VERIFIED insight (value + source + date + denominator) about mutual-intent matching or hiring behaviour. Today every metric row is [NEEDS DATA], so the gate is closed.
- **Why they'd care:** a short, evidence-backed observation about mutual-intent matching they can compare with their own public research. Without evidence there is nothing to exchange.
- **Qualify:** US-based person in product, research, talent or partnerships whose public work (post, report, talk) relates to hiring or matching; one specific public item we can cite with URL + date.
- **Exclude:** anyone who would read the message as a sales or acquisition pitch; any person with no public link to the topic; non-US.
- **Primary ask:** a learning exchange: a short reply or 15-minute conversation comparing notes. **Never pitch an acquisition, partnership terms or investment.** No claim of traction beyond verified rows.
- **Channel:** LinkedIn connection note then message, or email. Founder sends.
- **Evidence gate checklist:** (1) a verified insight in `docs/metrics.md` with date and denominator; (2) founder confirms it may be shared; (3) reviewer PASS on the claim; (4) specific public item cited. All four required.
- **Sequence (only after gate opens):** touch 1 day 0 (insight + question); touch 2 at +5 business days (one further datapoint or a public article of theirs we found useful, no new ask); touch 3 at +7 business days (close). Max 3 touches.
- **Sending windows:** Tue-Thu 10:00-12:00 Eastern; convert with the table in section 1.
- **Success metrics:** replies / sent with denominator; calls held; what they told us (logged as learning, not as endorsement).
- **Mistakes to avoid:** sending to "see if they're interested in buying us"; name-dropping; quoting any number we cannot source; treating a friendly reply as a partnership.

### Acquirer contacts (researched 2026-10-25)

Drafts: `outbox/2026-10-25_marketer_acq-*.md` (7 files, all Blocked by the evidence gate). Names only where an official page shows the person in the role; everything else is a ROLE. Founder finds addresses by hand; no guessed emails. Web access failed partway through, so rows marked "not verified" need a second pass.

| Company | Role to reach | Name (verified?) | Source URL (checked 2026-10-25) | Best first channel |
|---|---|---|---|---|
| LinkedIn | Chief Executive Officer | Dan Shapero (verified: listed as CEO, Ryan Roslansky as "Former CEO") | https://news.linkedin.com/about-us ; also reported by https://www.mediapost.com/publications/article/414511/microsoft-names-daniel-shapero-linkedin-ceo.html (search result, April 2026) | Warm intro or a public reason, not cold email (one-shot). Non-email: none verified. |
| LinkedIn | Head of Product, Talent Solutions (or corporate development) | Role only. Newsroom lists Mark Lobosco (Chief Business Officer) and Hari Srinivasan (CPO, LinkedIn Ecosystem), but neither is shown as Talent Solutions product head; trade-press titles conflict. Corporate development is not listed. | https://news.linkedin.com/about-us ; https://business.linkedin.com/hire/product-update/hire-release (Hiring Assistant 2; page has no date) | A LinkedIn Talent Solutions partner program page was NOT verified. Fallback: founder's own LinkedIn connection note to the role once found via public posts. |
| Indeed (Glassdoor not separately researched) | Head of Product for employer tools (Talent Scout) or partnerships | Role only. The release quotes Maggie Hulce, Chief Revenue Officer, but that is not the right role. | https://www.indeed.com/news/releases/indeed-introduces-new-suite-of-hiring-products-career-scout-talent-scout-premium-sponsored-jobs-and-indeed-connect?co=US (10 Sep 2025) | No official partner or marketplace application page verified. Indeed Connect (same release) is a lead to check. |
| ZipRecruiter | Head of Product or Marketplace/Matching | Role only. CEO Ian Siegel per search summary of earnings coverage, not read on an official page; not the target role. | https://stockanalysis.com/stocks/zip/transcripts/568908-q1-2026/ and https://app.edgar.tools/filing/1617553/0001617553-26-000030/q12026earningsrelease-final.htm (search results, not fully read) | No partner program verified. Investor relations page (not checked) is the public contact. Founder must verify the Q1 2026 call wording first. |
| Greenhouse | Partnerships team (Director of Partnerships role exists per a Greenhouse blog title; name not verified) | Role only | https://www.greenhouse.com/integration-partner | Official application form at /integration-partner#apply-now. Reviewed first Monday of each month; needs at least one mutual customer and a privacy policy, so we are not eligible yet. partneronboarding@greenhouse.io is for urgent mutual-customer requests only; do not use. |
| Lever by Employ | Partnerships team | Role only | https://lever.co/partnershipinterest | Partnership Interest Form (describe product and recruiting-workflow fit; then review, sandbox, marketplace listing). |
| Workday | Partner Program / Built on Workday team | Role only (no head of partnerships named on page) | https://www.workday.com/en-us/company/partners/overview.html | Partner prospect portal https://workday.my.site.com/prospectportal/become-a-partner ; also https://www.workday.com/en-us/company/partners/built-on-workday.html and https://marketplace.workday.com/en-US/home (links from the official page; program pages themselves not read). |

Notes: (1) The ATS programs (Greenhouse, Lever, Workday) are the more natural first step than a cold email; the product has no ATS integration (`docs/exit-readiness.md`: NOT STARTED). (2) No claim in the drafts goes beyond the demo and "we're still building"; timezone-overlap matching is not mentioned. (3) Every draft carries `[NEEDS DATA]` for the proof that must exist before the gate opens.

## 4. Two-week manual experiment (Mon 2026-10-26 to Fri 2026-11-06)

Constraints: the founder sells 1 hour per day (`docs/decisions.md`, 2026-10-25). `docs/operating-rhythm.md` mentions 10-20 outreach sends per day; this plan deliberately sends far fewer, because the seller found only 3 verified leads from 30 asked and personalised, evidence-backed messages matter more than volume. Flag for the founder: Conflict 5.

Provisional targets (hypotheses to test, NOT forecasts and NOT results):
- A: 6-8 first emails sent over the two weeks (3 existing + up to 5 new verified leads); target at least 1 reply and at least 1 demo or pilot conversation by 2026-11-06.
- B: 4-8 first messages sent; target at least 2 substantive replies with usable feedback.
- C: 0 sent; target = gate status reported.
- Actuals: sent [NEEDS DATA]; replies [NEEDS DATA]; meetings [NEEDS DATA]; opt-outs [NEEDS DATA].

Preconditions before ANY send (founder): (1) fill `{{postal address}}` and confirm requirements with counsel; (2) confirm the demo link works and the demo is about 60 seconds (or change "60-second"); (3) mark drafts APPROVED; (4) existing seller drafts need the footer + address added, and contain Vietnam/SEA wording (Conflict 1).

| Date | Segment | Marketer/seller drafts (volume) | Founder sends | Founder time (of 60 min) | Notes |
|---|---|---|---|---|---|
| Mon 10/26 | A | 0 new (3 drafted) | Railway, Cal.com, GoGoGrandparent email 1, window ET 08:30-10:30 = VN 19:30-21:30 | 60 min total: review + footer 15 min; 3 sends at about 7 min each incl. final personalisation check (21 min); log in outreach.csv 5 min; address/demo-link setup 15 min; 4 min spare | Slips a day if address or demo link is not ready; recompute follow-ups from actual send date |
| Tue 10/27 | A | seller: up to 2 new verified leads | up to 2 | 25 min | Leads must meet the qualify list; no padding |
| Wed 10/28 | A | up to 2 | up to 2 | 25 min | Cohort check: any reply stops that sequence |
| Thu 10/29 | A + B start | marketer: up to 2 B drafts; A follow-up 1 for Monday cohort | 3 A follow-ups + up to 2 B first messages | 40 min | B only if checkpoint conditions (section below) are met; B replies are unlikely before the YC on-time deadline (Mon 2026-11-02 20:00 PT) |
| Fri 10/30 | review | up to 2 B drafts; A follow-up 1 for Tuesday cohort | up to 2 A follow-ups + up to 2 B | 30 min + checkpoint 20 min | Checkpoint 1 (below) |
| Mon 11/02 | A, B | follow-up 1 for Wednesday cohort | up to 3 | 30 min | Eastern window now 20:30-22:30 VN (DST ended) |
| Tue 11/03 | A, B | up to 3 new A or B drafts | up to 3 | 30 min | |
| Wed 11/04 | A, B | up to 2 | up to 2 | 25 min | |
| Thu 11/05 | A, B | follow-up 2 for Monday A cohort (touch 3) | 3 touch-3 emails + up to 2 | 35 min | |
| Fri 11/06 | review | follow-up 2 for Tuesday A cohort | up to 2 + review | 20 min + checkpoint 2 | Checkpoint 2 (below) |

Follow-up dates by first-send date (business days; adjust to actual send date): Mon 10/26 sends -> touch 2 Thu 10/29, touch 3 Thu 11/05. Tue 10/27 -> Fri 10/30 and Fri 11/06. Wed 10/28 -> Mon 11/02 and Mon 11/09 (outside the experiment). Hard cap: at most 4 sends on any day, and no more than 60 minutes of founder time.

Segment C: gated, not scheduled. The only C activity is a status line in the Friday checkpoints: "gate closed / open, because ...".

Review checkpoints:
- **Fri 2026-10-30 (checkpoint 1):** confirm counts (sent, bounced, replied, opted out, meetings) from `data/outreach.csv`; read every reply in full; decide whether B continues, whether copy changes are needed, whether the founder time budget held. Decision rule: if any opt-out or complaint relates to the footer or targeting, pause and fix before the next send.
- **Fri 2026-11-06 (checkpoint 2):** replies by segment with denominators; log objections and learnings (section 6); decide keep, change or stop for each variant. Do not extrapolate from fewer than about 10 sends per variant; report as anecdotes.

Stop rules (apply to every sequence):
1. Any reply (positive or negative): stop follow-ups at once; handle by hand.
2. Any opt-out request ("no thanks", "unsubscribe", "remove me"): mark `OPTED_OUT`, stop all contact on all channels, never re-add.
3. Any clear rejection or "not hiring": mark `PASS`, stop.
4. Bounce: mark in notes, do not guess alternative addresses.
5. Stop the whole experiment and review if two or more people complain about the same issue.

## 5. Conflicts for the founder

These are flagged, not resolved. `docs/decisions.md` rows and `CLAUDE.md` are unchanged.

1. **Candidate geography.** The brief says candidate location is undecided/neutral. `CLAUDE.md` (Phase B) and `docs/decisions.md` (2026-10-25 "B first: ... remote engineers from Vietnam/SEA") say Vietnam/SEA. The 20 waiting drafts (`outbox/2026-10-25_seller_*` and `outbox/2026-10-25_marketer_*`) mention Vietnam/SEA in 19 files (about 45 occurrences by keyword search, which also counts "vetted" and "ghost"). All new copy in this pack is neutral. Founder: choose "Vietnam/SEA" or "neutral", then the reviewer re-checks the waiting drafts. Also `docs/icp.md`, `docs/objections.md` and `docs/brand.md` currently assume Vietnam/SEA.
2. **Investor geography.** Brief: US, Europe, Middle East, Asia, excluding Vietnam-based investors. `docs/decisions.md` (2026-10-25) and `docs/investors.md`: "US investors and accelerators only; no Vietnam-based investors." Founder: confirm which rule applies to the fundraiser. See section 9.
3. **Tracker.** Brief: one canonical tracker `data/outreach.csv`. Existing `data/leads.csv` is a company list (seller). Proposal: `leads.csv` stays the company list (one row per company, seller maintains); `outreach.csv` tracks individual messages and replies (one row per contact per message). Founder: confirm.
4. **Template claims removed from the founder's Segment A template.** (a) "No applicant flood, no ghosting": "no ghosting" is a never-claim; "no applicant flood" is an outcome claim we cannot back. (b) "We're picking 10 US startups as founding partners": offer not approved, shown as [FOUNDER DECISION] (no variant uses it; the approved free 3-month pilot is offered instead). (c) "Every candidate is pre-vetted": no documented vetting process. (d) "works hours that overlap your team's": timezone-overlap matching is NOT STARTED. (e) Features stated as live ("salary shown up front", "clear why this fit on every match") are reworded as what the demo shows, because they are on a branch. (f) "60-second demo" kept but flagged: confirm the demo length. (g) The opt-out wording "won't follow up" is changed to "won't email you again" to match the 3-touch sequence.
5. **Volume vs operating rhythm.** `docs/operating-rhythm.md` says the founder sends 10-20 outreach messages per day. With 3 verified leads and a 1-hour budget, this plan caps sends at 4 per day. Founder: confirm lower volume is fine.
6. **YC deadline vs selling hour.** The YC Winter 2027 on-time deadline is Mon 2026-11-02, 20:00 PT (= Tue 2026-11-03 11:00 Vietnam). The YC application is a separate workstream (section 8) and its time is NOT included in the 1-hour selling budget. Founder: decide how to split the week.
7. **Existing leads vs segment rules.** Only GoGoGrandparent is verified as a YC company in the repo (https://www.ycombinator.com/companies/gogograndparent: YC Summer 2016, San Francisco, team 50, checked 2026-10-25). Railway and Cal.com YC status and US-base are [NEEDS DATA]: Cal.com's own About page says it has no HQ. A quick web search on 2026-10-25 returned third-party listings placing Railway in San Francisco (not verified on Railway's own site). Founder or seller: verify before sending.

## 6. Learning loop

Only actual replies and calls feed these files. Assumptions stay labelled as hypotheses.

| Source | Goes to | Rule |
|---|---|---|
| A reply that states an objection or reason | `docs/objections.md` (a row with the person's wording, role, date; "Worked?" filled only after the answer is used) | Actual objections only. Do not add imagined ones. |
| A fact about the buyer (trigger, process, tool, budget owner) | `docs/icp.md` Learnings, tagged `(heard on call, date, role)` vs `(hypothesis)` | Separate heard facts from desk research. |
| Counts: sent, replied, meetings, opt-outs with dates and denominators | `docs/metrics.md` (new "Outreach results (verified)" table, founder-confirmed) and `data/outreach.csv` | Reply rate is always replies / confirmed sent over a stated date range. No rate from fewer than about 10 sends presented as a finding. |
| Feedback from B (segment) on positioning or product | `docs/feedback.md` (via `/log`) and `docs/brand.md` Learnings | Quote the wording; note who and when. |
| Pain evidence for the YC application | "YC application notes" section (add to `docs/feedback.md` or a founder-owned note) | Each line must cite a reply, call or dated public source. Nothing aspirational. |
| What worked/did not, copy-level | `docs/brand.md` Learnings | After each checkpoint. |

Weekly: marketer reads `data/outreach.csv` on Fridays and proposes edits; the reviewer checks any claim that uses an outreach result.

## 7. Success metrics vs actual results

Definitions: **sent** = founder-confirmed `SENT` with `sent_at`; **reply rate** = replies / sent in the stated window (state the denominator); **meeting** = a call actually held or scheduled and confirmed by the founder.

Actuals (founder-entered only):
| Metric | A | B | C |
|---|---|---|---|
| Sent | [NEEDS DATA] | [NEEDS DATA] | [NEEDS DATA] |
| Replies | [NEEDS DATA] | [NEEDS DATA] | [NEEDS DATA] |
| Meetings | [NEEDS DATA] | [NEEDS DATA] | [NEEDS DATA] |
| Opt-outs | [NEEDS DATA] | [NEEDS DATA] | [NEEDS DATA] |

Provisional targets are listed in section 4 and are hypotheses, not results.

## 8. YC application workstream note (separate from the outreach experiment)

Verified from public YC pages (fetched 2026-10-25; the tool returned summaries, so the founder should re-read the pages before relying on them):
- https://www.ycombinator.com/apply (checked 2026-10-25): Winter 2027 on-time deadline "November 2 at 8pm PT"; on-time applicants get a decision by December 11; interviews mostly by video in November and December; batch runs January to March in San Francisco; later applications are still considered; Spring/Summer/Fall can be applied for via Early Decision. The page links the online application and gives apply@ycombinator.com for questions. It does not list the application questions publicly.
- https://www.ycombinator.com/faq (checked 2026-10-25): YC invests $500,000 per company (page wording; terms not detailed on the page); anyone worldwide may apply; incorporation is not required to apply; one application per batch; solo founders accepted but a technical cofounder is advised; no video requirement stated on the page. If a company is incorporated outside the US, Canada, Singapore or the Cayman Islands, a parent company in one of those jurisdictions is needed to participate. YC also states it does not rely on introductions and considers all applications equally.
- Time conversion: Mon 2026-11-02 20:00 PT (PST, UTC-8, after DST ended 2026-11-01) = 04:00 UTC Tue 2026-11-03 = 11:00 Tue 2026-11-03 Asia/Ho_Chi_Minh.
- Rules: contact YC only through ycombinator.com/apply. No cold emails to partners. Every number in the application must come from `docs/metrics.md` (currently all [NEEDS DATA]); say so plainly if there is no traction yet.
- Implications: (1) outreach B replies are unlikely to arrive before 2026-11-02, so the application should not depend on them; (2) the Delaware C-corp lawyer call (by 2026-11-08, `docs/decisions.md`) is after the deadline, and incorporation is not required to apply per the FAQ, but US entity status is still [NEEDS DATA] and the founder should answer the application's entity questions truthfully; (3) any application claim about customers or users must be [NEEDS DATA] unless it comes from `docs/metrics.md`.
- Not verified: the application form's actual questions and any founder-video requirement (need login/portal).

## 9. Investor handoff (for the fundraiser; the marketer does not build the list)

Founder's investor criteria, to apply when the fundraiser builds the list:
- At least 3 verified investments in the last 12 months.
- Pre-seed or seed stage, with a check size suitable for us.
- A relevant thesis (hiring, HR tech, marketplaces, future of work).
- Evidence of backing US-market businesses with internationally based founders.
- A verifiable track record.
- Exclude Vietnam-based investors and fee-charging pitch schemes ("pay to pitch" services).
- Up to 40 qualified investors, about half US. No padding to reach 40.
- Keep unverified candidates in a separate list, labelled unverified.
- Verify each accelerator's deadline individually from its own page, with URL + date.

**Conflict #2 applies:** this contradicts "US investors and accelerators only" in `docs/decisions.md` and `docs/investors.md`. The fundraiser should wait for the founder's answer (or work to the brief while recording the conflict). `CLAUDE.md` also says US/SEA-fit investors in priority 3.

## 10. Outreach Center: dashboard requirements (for the builder; NOT built yet)

Do not describe this as built. Source data: `data/outreach.csv`, `data/leads.csv`, `outbox/*.md` (Status line), `docs/metrics.md`.

1. **Tabs:** Customers (A), YC Feedback (B), Strategic (C). Each tab shows rows filtered by `segment`.
2. **Drafts awaiting review:** count and list of outbox drafts with `Status: DRAFT` for that segment (file, subject, readiness).
3. **Blocked list:** drafts marked `BLOCKED` with the blocker text (e.g. `{{postal address}}` missing, evidence gate closed, [FOUNDER DECISION]).
4. **Confirmed counts:** sent, replied, meetings, opted out, per segment and total. Count only rows where the founder set `SENT` with `sent_at`. Never infer from drafts.
5. **Reply rate:** replies / sent, displayed as "N of M" (for example "[NEEDS DATA] of [NEEDS DATA]"); show "[NEEDS DATA]" when M is 0 and flag when M is below 10 ("too few to read").
6. **Follow-ups due today:** rows where `next_date` is today or earlier and `status` is SENT, excluding REPLIED/PASS/OPTED_OUT/MEETING; show the touch number and the recipient's local send window converted to Asia/Ho_Chi_Minh for today.
7. **Strategic evidence gate (Strategic tab):** a single status "Closed / Open", with the four checklist items of section 3, each with a pass/fail and link. Open only if `docs/metrics.md` has a verified insight (value, source, date, denominator) and the founder has confirmed.
8. **Preconditions banner:** show "Sending blocked" while the postal address placeholder is unresolved (founder-set flag) and while the demo link is unconfirmed.
9. **Opt-out guard:** rows with `opt_out` = yes are shown as "never contact"; no follow-up appears for them.
10. **Read-only for agents:** the founder updates status; the page does not send anything.

## 11. Mistakes to avoid across the engine

- Treating the 3 existing leads as proof that the segment works.
- Sending anything before the address, opt-out line and demo link are confirmed.
- Mixing asks (feedback and sales) in one message.
- Logging a metric that is not founder-confirmed.
- Following up after a reply, opt-out or rejection.
- Naming a person from memory, a guessed email, or a "mutual connection" we cannot verify.
