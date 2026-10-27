# Ideal customer profiles (rewritten 2026-10-25 for the US market)

Market change 2026-10-25: from Vietnam-local to US buyers. US English, USD.
Legend: `(hypothesis, validate in calls)` = assumption, not yet confirmed with a real buyer or candidate.
No numbers in this file come from metrics; any metric must come from `docs/metrics.md` (currently all [NEEDS DATA]).
Product facts to respect: the swipe/mutual-match features are on a branch and go live soon. Do not describe them as shipped to customers until the founder confirms.

## Phase B (now): US startups hiring remote engineers from Vietnam / SEA

### One-line ICP
US startup, seed to Series B, 10-200 people, with 2+ open software engineering roles that can be done remotely, whose founder, CTO or Head of Talent is open to hiring engineers outside the US.

### B2B buyer (pays)
- Who: founder, CTO / VP Eng, or Head of Talent / TA lead at a 10-200 person US startup.
- Pain: US engineering salaries are high; inbound pipelines are noisy; remote/offshore sourcing is slow and trust is hard (quality, time zone, contracting). (hypothesis, validate in calls)
- Why us: mutual opt-in (no cold applications), explainable fit, salary up front (both sides see the range before a chat opens), candidates who chose to work for US teams remotely.
- Do not promise: candidate volume, vetting depth, hires, or any metric until the founder confirms in `docs/metrics.md`.

### B1. Founder / CTO hiring directly (10-60 people)
- Role: founder or CTO who personally screens engineers. (hypothesis, validate in calls)
- Pains: screening eats their own build time; US hiring is expensive against runway; unsure how to hire abroad safely.
- Current workarounds: network and referrals; job boards and YC Work at a Startup; Wellfound; freelance platforms; occasional agency. (hypothesis, validate in calls)
- Success in 30 days: a few interested, relevant engineers matched mutually and first interviews booked, with no time spent sifting CVs; zero cost to try.
- Budget authority: decides alone. Price sensitive; expect request for free pilot or per-hire.

### B2. Head of Talent / TA lead (50-200 people)
- Role: owns engineering hiring across teams; often reports to COO/CEO. (hypothesis, validate in calls)
- Pains: pressure to hit headcount plans within a fixed budget; hiring managers reject shortlists; wants a lower-cost-region channel but needs compliance answers (contractor vs EOR).
- Current tools: ATS (Greenhouse, Lever, Ashby), LinkedIn, job boards, agencies, EOR/payroll vendor already in place. (hypothesis, validate in calls)
- Success in 30 days: shortlist hiring managers accept; at least one interview from a mutual match; can show cost per qualified candidate vs other channels.
- Budget authority: needs sign-off from CEO/CFO/VP Eng; will want a pilot report.

### B3. Engineering Manager / tech lead (influencer, not buyer)
- Champion who feels the pain of wasted interviews and timezone gaps. Recruit as an internal advocate.

### B4. Agencies / recruiters (do not prioritise)
- Decide policy with founder before selling to them; risk of competing with direct-hire customers.

### Buying triggers (what makes "now" the time)
- Just raised a seed, Series A or B (funding news names headcount plans).
- 2+ open remote engineering roles that have been up for 30+ days.
- Job post already says "global", "anywhere", "APAC", "any timezone" or "US citizenship/visa not required".
- A job post that lists a non-US salary band or a "contractor / EOR" option.
- Runway pressure or a hiring freeze at US-salary levels; lays off or reorganises but still needs engineers.
- Founder or CTO posting publicly about hiring pain or about hiring internationally.
- A key engineer left and the team needs a backfill quickly.

### Where to find them (public sources only)
- Company careers pages and public ATS job boards (Ashby, Greenhouse, Lever) for specific companies, one at a time.
- YC Work at a Startup and YC jobs pages (remote filter). Note most listings are restricted to the US; filter by explicit global or non-US text.
- Hacker News monthly "Who is hiring?" thread (search comments for worldwide, global, anywhere).
- Wellfound and startup.jobs company profiles (size and stage).
- Funding news (press releases, TechCrunch, VentureBeat) for seed to Series B rounds.
- Company About/handbook pages that state remote-first or "pay not tied to location".
- Not allowed: LinkedIn scraping, bulk exports, guessing personal emails, auto-DM tools. Find the buyer's role, not a named person, in research; the founder identifies the person by hand.

### Disqualifiers (qualify out, do not push)
- Job post says US-only, "must be a US resident/citizen", or specific US states only.
- Hybrid or on-site requirement.
- Requires US-hours overlap beyond what Vietnam/SEA candidates can offer (full US business hours), unless the role is flexible (hypothesis, validate in calls).
- Company already outsources all engineering to a vendor, or has under 10 or over 200 people (confirm size from a public source).
- Security/compliance rules that bar contractors or offshore access (e.g. certain regulated or government work).
- Role is not software engineering (we only cover engineers at launch).
- No visible hiring intent in the last 30 days.

### Lead qualification checklist (all must be answered from public info before outreach)
1. Is at least one engineering role open and remote?
2. Does the post allow non-US candidates, or is silent about location (silent = ask)?
3. Size 10-200 and stage seed to Series B from a public source?
4. Likely buyer title identified (role only)?
5. Time zone / overlap requirement noted?

## Phase A (later): US startups hiring locally in one US city
Placeholder. Revisit after 10 design partners in Phase B. Likely approach: one city, startups 10-200 people, local on-site or hybrid roles, using the private distance range feature. Needs: city choice agreed with founder, local candidate supply plan, and a separate prospect list. Do not research or contact for Phase A yet.

## Candidate personas (free users): vetted Vietnam / SEA software engineers working remotely for US teams

All are hypotheses until validated in the first 10 calls. "Vetted" is a promise the product must be able to keep; confirm with founder what vetting means today before using the word in copy.

### C1. Mid-level backend or frontend developer (2-5 years), Vietnam/SEA
- Pains: applying into the void; salary hidden; ghosting; cannot tell if a US team is legitimate; unsure how contracting for a US startup works. (hypothesis, validate in calls)
- Motivations: USD pay, stronger stack, remote work, career growth.
- Channels: LinkedIn, GitHub, Facebook and Discord dev groups, local meetups. (hypothesis, validate in calls)
- What hooks them: salary shown up front in USD, mutual match (no cold applying), teams that already chose them.

### C2. Senior engineer open to US remote roles (5+ years)
- Pains: recruiter DMs with no salary; wants privacy from current employer; wants clarity on time-zone expectations.
- Motivations: right team, compensation transparency, long-term remote work.
- Channels: LinkedIn, referrals, private groups. Hardest to acquire; follows mid-level supply.

### C3. Fresh grad / bootcamp grad
- Lowest value to US buyers hiring mid/senior; use for volume only; do not oversell to employers.

### C4. Bilingual engineer with prior US-team or international experience
- Strongest fit for buyers who worry about communication and overlap. Explore as a priority segment.

### Candidate requirements US buyers are likely to ask about (hypothesis, validate in calls)
Spoken and written English, availability for a US-overlap window, async work habits, past remote-team experience, willingness to contract. Product should surface these on the profile before seller promises them.

### Vetting priorities (from Selly, 2026-10-27, `outbox/2026-10-27_seller_pilot-shortlist.md`; hypothesis, validate in calls)
Niche buyers (remote-first dev-tools/infra) hire, in this order of priority:
1. Senior backend engineers.
2. Infrastructure / platform engineers.
3. Full-stack engineers.
4. Front-end engineers with TypeScript.
Plus for every candidate: at least 4 hours of US-time-zone overlap (at least one pilot target needs it), willingness to work an evening shift in Vietnam/SEA time, and async work habits (written updates, PR-based collaboration). Vet and recruit for these first; fresh grads (C3) are lowest priority. No "vetted" in copy until the founder defines it.

## Learnings
- 2026-10-25 (seller): Public job listings from US startups on YC Work at a Startup are mostly US-only or US/Canada-only remote. Of 33 recent remote engineering listings seen that day, very few allowed non-US candidates. Genuinely global-hiring startups with 10-200 people are a small slice, so the lead list will be small and needs weekly refresh. See `outbox/2026-10-25_seller_us-prospects.md`.
- 2026-10-25 (seller): Many startups that hire globally are remote-first dev-tools and infra companies. They are the first segment to target; US-only listings are lower priority until a buyer says they would open a role.
- Persona labels above are desk research only. Validate in the first 10 discovery calls, then update.
