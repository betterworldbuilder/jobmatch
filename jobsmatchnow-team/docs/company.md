# JobsMatchNow: company page

Shown at the top of the dashboard. Sources: the app's own copy (`../src/content/landingContent.ts`, live at
https://jobsmatchnow.com/app/), `CLAUDE.md`, `docs/decisions.md` and Rizer's deck v1 (Rev PASS 2026-10-27).
Numbers only with a source; everything else is `[NEEDS DATA]`. The site's "3.2× / 48h / 42%" are labeled
"illustrative product targets" in the code, so they are not used here.

## The business
**Stop chasing jobs and candidates. Let the perfect match chase you.**
JobsMatchNow is a mutual-match hiring app: candidates and hiring teams swipe on each other, and a conversation opens only when both sides choose. Candidates use it free; US hiring teams start with a free 3-month pilot, then pay a per-hire fee (amount [NEEDS DATA]), so they pay only when we deliver a hire.
Stage: pre-traction. Pivoted to US buyers on 2026-10-25; 4 pilot targets identified.

## The problem we solve
- Old hiring creates activity, not alignment: search boxes, job-board scrolling and generic alerts.
- Hiring teams get one-way applications and sort them with CV keyword filters and recruiter guesswork.
- Candidates fill in repeated forms and cover letters, apply into the void and rarely see the salary.
- Cold outreach and unsolicited recruiter messages waste both sides' time.

## For who
- **Hiring teams (pay):** US startups, seed to Series B, 10 to 200 people, hiring remote software engineers. First niche: remote-first dev-tools and infrastructure startups that already hire "anywhere in the world".
- **Candidates (free):** software engineers in Vietnam and Southeast Asia who want US remote roles with the salary clear up front.
- **Later (Phase A):** US startups hiring locally in one US city, matched within a private distance range.

## How it works
1. One complete profile or role, instead of repeated forms and resume uploads.
2. A personal card deck, ranked by skills, goals, location and work style.
3. Swipe: a conversation opens only after both sides choose each other. No cold outreach.
4. Every match explains its fit (a transparent 0–100 score with matched skills and evidence), and salary is shown up front.
5. Chat, interview scheduling and a visual hiring pipeline in one place; contact details stay hidden until a match.

## Market potential
- **US demand:** about 1.9M software developer, QA and tester jobs in the US (2025), about 106,100 openings a year (2025–35), median pay $134,040 (May 2025). Source: [BLS Occupational Outlook](https://www.bls.gov/ooh/computer-and-information-technology/software-developers.htm)
- **Why now:** a growing number of US states require salary ranges in job posts (secondary trackers: [Paychex](https://www.paychex.com/articles/compliance/pay-transparency-laws-by-state); check the statutes before quoting a count), and remote-first startups already hire across borders.
- **Supply:** Vietnam IT talent pool [NEEDS DATA] (TopDev report to confirm before use).
- **Price reference:** Dex, a funded engineer-matching startup, charges employers 20–30% of first-year salary (`docs/investors.md`). A reference only, not our price.
- **Our reachable market** (startups hiring globally × roles × per-hire fee): [NEEDS DATA] until the fee is set.

## Our mission
Make hiring mutual. Every recommendation carries its reason, every connection starts with consent, and every candidate controls what employers can see.
Draft from the product's own "Designed for trust" copy; the founder confirms the final wording.

## Our product
See it live: [JobsMatchNow app](https://jobsmatchnow.com/app/)
