Status: DRAFT
Owner: marketer | Created: 2026-10-25 | Reviewer: pending | Founder approval: pending
Strategy: `docs/outreach-strategy-yc.md` | Tracker: `data/outreach.csv`

# First-email variants (2 per segment) and LinkedIn connection notes

## GLOBAL SEND BLOCKERS (apply to every variant below)
1. SENDING IS BLOCKED FOR ALL VARIANTS until `{{postal address}}` is filled with the founder's real postal address. None has been provided; do not invent one. The founder should confirm cold-email address and opt-out requirements with counsel (no legal claim is made here).
2. The `{{demo link}}` must be live and the demo must really run in about 60 seconds (builder/founder to confirm). Mutual match, salary up front, explainable fit and demo matching are on a branch ("live soon"); the copy therefore describes what "the demo" shows.
3. Every personalised placeholder must be filled from a public source with URL + date checked, recorded in `data/outreach.csv`. No guessed emails, no invented warm intros.
4. Candidate geography is intentionally NEUTRAL here (see Conflict 1 in the strategy doc).

## Standard footer (append to every email; not counted in the body word count)
```
{{YourName}}
Founder, JobsMatchNow
{{postal address}}
Not relevant? Reply "no thanks" and I won't email you again.
```

Word counts are for the body between greeting and signature, with placeholders counted at a realistic length (Company = 2 words, Role title = 3, trigger = 5, URL = 1). Re-count after filling in.

---

## SEGMENT A: customers (US YC startups with verified engineering vacancies)

### A1 (company-level hiring trigger + free pilot)
**Subject:** {{Company}}'s {{N}} open engineering roles

```
Hi {{FirstName}},

I saw {{Company}} is hiring {{N}} engineers {{trigger, e.g. since your Series A / for the {{team}} team}}.

I'm building JobsMatchNow. In the demo, candidates and hiring teams both opt in before a conversation starts, with the salary range and a short "why this fit" on each match. We're offering a free 3-month pilot in return for honest feedback.

Worth a 15-minute look? The 60-second demo: {{demo link}}

{{standard footer}}
```
- Body word count: 67 (greeting 2, para 1 = 13, para 2 = 44, para 3 = 8).
- Personalization placeholders: {{FirstName}}, {{Company}}, {{N}}, {{trigger}}, {{team}}, {{demo link}}, {{YourName}}, {{postal address}}.
- Evidence required: (a) careers page or YC Work at a Startup listing showing the {{N}} open engineering roles (company job page, URL + date); (b) the trigger: funding news or company post (press release or company blog, URL + date) or the team named on the job page; (c) YC company page (ycombinator.com/companies/..., URL + date) confirming YC and US base; (d) buyer role (founder / CTO / Head of Eng) from company site or YC page.
- Offer check: free 3-month pilot is approved (`docs/decisions.md` 2026-10-25). No fee amount quoted. No "founding partner" claim.
- **Readiness: READY FOR FOUNDER REVIEW** (still subject to the global send blockers).

### A2 (role-specific, ask for a conversation about one role)
**Subject:** Your {{Role title}} opening

```
Hi {{FirstName}},

Your {{Role title}} post caught my eye, especially {{specific detail from the post, e.g. "fully remote"}}.

I'm building JobsMatchNow. In the demo, a conversation opens only after the hiring team and the candidate both say yes, with the salary range visible first. Before I suggest anything, I'd like to understand how you source for roles like this today.

Could we talk for 15 minutes? If it's useful, I can show the demo and discuss a free 3-month pilot on this role.

{{standard footer}}
```
- Body word count: 78 (greeting 2, para 1 = 13, para 2 = 40, para 3 = 23).
- Personalization placeholders: {{FirstName}}, {{Role title}}, {{specific detail}}, {{YourName}}, {{postal address}}.
- Evidence required: the specific job post (company careers page or YC Work at a Startup, URL + date, with the quoted detail); YC company page confirming YC + US base (URL + date); buyer role from public company page.
- Offer check: free 3-month pilot only (approved).
- Wording check: "visible first" describes the intended product behaviour. Founder: if you prefer, change to "the salary range shown in the demo".
- **Readiness: READY FOR FOUNDER REVIEW** (subject to global send blockers).

Note on the existing Segment A drafts: `outbox/2026-10-25_seller_railway-email-1.md`, `..._calcom-email-1.md`, `..._gogograndparent-email-1.md` are counted as Segment A volume in the experiment. They are not rewritten here. They lack the footer and `{{postal address}}`, and mention Vietnam and Southeast Asia (Conflict 1); Railway and Cal.com YC status and US base are [NEEDS DATA] (Conflict 7). Reviewer to re-check them against the strategy doc.

---

## SEGMENT B: founder feedback (US YC founders: recruiting, HR tech, remote work, marketplaces)

Rules: ask for advice, do not pitch; no referral or introduction ask; share nothing confidential; do not mention YC admission or imply any YC relationship.

### B1 (non-competitor; one specific question)
**Subject:** Feedback request from a hiring-app founder

```
Hi {{FirstName}},

I'm a founder building JobsMatchNow, a hiring app where candidates and teams both opt in before a conversation starts. I found {{Company}} through the YC directory ({{one specific reason, e.g. your work on remote hiring}}).

I'm still early and would value your honest take on one question: {{specific question, e.g. does showing salary up front help or hurt in your marketplace}}? Even a two-line reply would help. If a 15-minute call is easier, I'm happy to work around your schedule.

Thank you,
{{standard footer}}
```
- Body word count: 82 (greeting 2, para 1 = 35, para 2 = 43, closing 2).
- Personalization placeholders: {{FirstName}}, {{Company}}, {{reason}}, {{specific question}}, {{YourName}}, {{postal address}}.
- Evidence required: YC directory page (URL + date) showing a US-based founder/company; company site or public post that motivates the reason and the question (URL + date); competitor check (if the company matches candidates to jobs, use B2).
- Offer check: no offer. No referral ask.
- **Readiness: READY FOR FOUNDER REVIEW** (subject to global send blockers; footer applies because it is a commercial-sender email).

### B2 (possible direct competitor; advice only)
**Subject:** A question from a founder in your space

```
Hi {{FirstName}},

I'm building JobsMatchNow, an early hiring app, and I know it overlaps with what {{Company}} does. I won't ask for anything confidential or pitch you.

I'd value one piece of advice: {{question about something public, e.g. what you would test first when starting a two-sided hiring marketplace}}? A short reply is plenty; if you'd rather not, no problem.

Thank you,
{{standard footer}}
```
- Body word count: 64 (greeting 2, para 1 = 28, para 2 = 32, closing 2).
- Personalization placeholders: {{FirstName}}, {{Company}}, {{question}}, {{YourName}}, {{postal address}}.
- Evidence required: YC directory page (URL + date) showing a US-based founder; company site (URL + date) showing why it overlaps; the question must be answerable from public/general experience. Mark `competitor` in `data/outreach.csv` notes.
- Offer check: no offer. Share nothing confidential; never name customers or leads.
- **Readiness: READY FOR FOUNDER REVIEW** (subject to global send blockers).

---

## SEGMENT C: strategic (LinkedIn Talent Solutions, Indeed, ZipRecruiter, Greenhouse, Lever, Workday; US-based contacts)

**BOTH VARIANTS ARE BLOCKED. Blocker: evidence gate. `docs/metrics.md` has no relevant verified insight (every row is [NEEDS DATA]). Do not send, and do not fill the placeholders with estimates. Never pitch an acquisition.**

### C1 (compare notes on a verified insight)
**Subject:** A question about mutual-interest signals in hiring

```
Hi {{FirstName}},

I'm a founder building JobsMatchNow, an early hiring app where candidates and hiring teams both opt in before a conversation starts. From {{verified insight source, date and denominator from docs/metrics.md}}, I've seen {{one-sentence finding}}.

I'd like to compare notes: does that match what you see in {{their public context, e.g. a published hiring report}}? A 15-minute call or a short email reply would help, and I'll share the aggregate details I'm able to.

Thank you,
{{standard footer}}
```
- Body word count: 87 (greeting 2, para 1 = 47, para 2 = 36, closing 2).
- Personalization placeholders: {{FirstName}}, {{verified insight}}, {{finding}}, {{their public context}}, {{YourName}}, {{postal address}}.
- Evidence required: (1) verified insight in `docs/metrics.md` with value, source, date, denominator, founder-confirmed and reviewer PASS; (2) the contact's public work (report, post or talk, URL + date).
- Offer check: no offer; no partnership or acquisition language.
- **Readiness: BLOCKED. Blocker: strategic evidence gate closed (no verified insight in `docs/metrics.md`).**

### C2 (public-item question + verified insight)
**Subject:** Comparing notes on mutual-interest hiring

```
Hi {{FirstName}},

I'm a founder working on mutual-interest matching between candidates and hiring teams. I read {{public source: title and date}} and had a question about {{specific topic}}.

In my own early data, {{verified insight, with date and denominator}}. Does that line up with what you've seen, or is there a pitfall I should watch for?

I'm not selling anything. A short reply or a 15-minute call would be very helpful.

Thank you,
{{standard footer}}
```
- Body word count: 87 (greeting 2, para 1 = 31, para 2 = 37, para 3 = 15, closing 2).
- Personalization placeholders: {{FirstName}}, {{public source}}, {{specific topic}}, {{verified insight}}, {{YourName}}, {{postal address}}.
- Evidence required: as C1, plus the cited public item (URL + date).
- Offer check: no offer.
- **Readiness: BLOCKED. Blocker: strategic evidence gate closed; also do not send "In my own early data" unless the insight truly exists.**

---

## LinkedIn connection notes (one per segment)

LinkedIn limit verified from public LinkedIn Help pages, checked 2026-10-25:
- https://www.linkedin.com/help/linkedin/answer/a563153 (Personalize invitations to connect): each personalized note up to 200 characters; this page says free accounts can personalize up to 3 requests per month.
- https://www.linkedin.com/help/linkedin/answer/a6239760 (Differences between InMail Messages and personalized invitations): Free (Basic) members "a character limit of 200" (this page says up to 5 personalized invitations); Premium members 300 characters with no cap.
- The two pages disagree on the free monthly allowance (3 vs 5), and the 300-character limit applies only to Premium. All notes below are under 200 characters so they fit any account type. The monthly allowance may be [NEEDS DATA]; check inside the founder's own account before relying on notes.
- Character counts below are for the text as written, including placeholders as typed (`{{FirstName}}` = 13 characters). Re-count after filling in; leave at least 15 characters of headroom.

**A (customers), 148 characters as written:**
`Hi {{FirstName}}, I saw {{Company}} is hiring engineers. I'm building a hiring app where both sides opt in first. Could I send you a 60-second demo?`
- Evidence required: same as A1 (job page URL + date). Readiness: READY FOR FOUNDER REVIEW. Use only if the founder has a way to connect; do not send the same day as the email.

**B (founder feedback), 164 characters as written:**
`Hi {{FirstName}}, I'm a founder building an early hiring app and found {{Company}} in the YC directory. I'd value your honest advice on one question. OK to connect?`
- Evidence required: YC directory URL + date. Readiness: READY FOR FOUNDER REVIEW. For possible competitors, send the email variant B2 instead; do not use the note.

**C (strategic), 159 characters as written:**
`Hi {{FirstName}}, I'm a founder building a mutual-interest hiring app. I read {{public post/report}} and would value comparing notes on {{topic}}. Not a pitch.`
- Evidence required: the cited public item (URL + date) and the evidence gate. Readiness: BLOCKED. Blocker: strategic evidence gate closed.

---

## Self-check (marketer, 2026-10-25)
- Word counts: all bodies are under 100 (A1 67, A2 78, B1 82, B2 64, C1 87, C2 87). Re-count after filling in placeholders.
- Forbidden claims absent: no "no ghosting", "no applicant flood", "pre-vetted", hours/timezone-overlap claim, traction number, guarantee, founding-partner number, or Vietnam/SEA candidate location.
- Offers: only the approved free 3-month pilot; no fee amount; no unapproved offer (so none of the variants needs [FOUNDER DECISION]).
- Every variant has footer, `{{postal address}}` and opt-out line. Sending is blocked for all until the address is filled.
- Not verified and needing founder or builder input: demo link live and about 60 seconds; YC status and US base of Railway and Cal.com; founder's local time zone.
