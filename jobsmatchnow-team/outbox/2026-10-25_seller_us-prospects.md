Status: DRAFT
Superseded 2026-10-25: internal research, not a message. Leads are in data/leads.csv; the messages are the 2026-10-25_seller_<company>-* drafts.

# US prospects: startups hiring remote engineers (research only, nothing sent)

Date checked: 2026-10-25. Public sources only: company careers pages, public ATS job boards, YC Work at a Startup, Hacker News "Who is hiring? (October 2026)", funding news. No LinkedIn, no scraping tools, no personal emails, no named individuals. Rows are also appended to `data/leads.csv` (status NEW).

## Result: 3 verified rows, not 30
I stopped at 3 rather than pad. What I checked and why the yield is low:
- YC remote engineering listings (33 shown 2026-10-25): nearly all say Remote (US) or US/CA only. Entangl needs US citizen/visa; Wasmer needs CET +/-2h; Moss has 5 people. All excluded.
- HN October 2026 thread: searches for worldwide/global/anywhere gave mostly companies with no size or HQ stated (Datamint, Matcha.fm), crypto or very large firms (Tether), nonprofits (Enveritas) or non-US firms (NetBird, eventfirst). Matcha.fm page returned HTTP 429 and could not be verified; not included.
- Other careers pages checked: PostHog, Resend, Infisical (US/Americas/Europe time only), Mintlify (San Francisco), Buffer (no open roles), Supabase (350+, too large).
- Takeaway: genuinely global-hiring US startups with 10-200 people are a small slice per snapshot. Next step: founder picks a narrower niche (e.g. dev-tools/infra) and I check 15-20 named remote-first companies' ATS boards each week.

## Verified prospects

| # | Company | Size | Why now | Likely buyer (role) | URL | Opener | Region fit |
|---|---|---|---|---|---|---|---|
| 1 | Railway | Small team per its own page; headcount not published (verify on call) | 6 engineering roles on its public Ashby board; 4 say "remote position available anywhere in the world"; $100M Series B announced 2026-01-22 to grow headcount | Head of Engineering / CTO | https://railway.com/careers | Your infra roles say "available anywhere in the world" after the Series B / Would a 15-min demo of matching with remote engineers in Vietnam/SEA be useful? | Strong: explicitly global |
| 2 | Cal.com | ~31-44 (third-party estimates, not company-confirmed) | 2 remote engineering roles (Senior Product Design Engineer; IC4 Senior Full-Stack Engineer); About page says pay is not tied to location | CTO / Head of Engineering | https://cal.com/jobs | Your About page says you do not care where the code is written / Open to a 15-min demo of mutual matching with engineers in Vietnam/SEA? | Good: remote-first, no stated region limit (confirm) |
| 3 | GoGoGrandparent | 50 (YC profile) | Open fully remote Front End JS/TS Engineer role; posting says US citizenship/visa not required, 4+ hours US overlap needed | CTO / Head of Engineering | https://www.ycombinator.com/companies/gogograndparent | Your front-end role needs only 4+ hrs US overlap and no US visa / Want a 15-min demo of matching with engineers in Vietnam/SEA? | Medium: overlap requirement may be hard from Vietnam (founder to judge) |

Caveats: Railway headcount is unverified (a job aggregator's 5,001-10,000 figure looks wrong; ignore it). Cal.com size is a third-party range. Job posts can close; recheck before sending.

## 3-touch sequence template (under 80 words each, DRAFT, founder sends by hand)
Personalised per company in `2026-10-25_seller_outreach-batch1.md`; send from that file, not from this template.

Touch 1 (day 0): "Hi, saw [company] is hiring remote [role] and that you are open to candidates outside the US. JobsMatchNow is a mutual-match hiring app: you see explainable fit and salary up front, and a chat opens only if both sides say yes. We are focused on engineers in Vietnam/SEA. Open to a 15-minute demo, or a free pilot on one role?"

Touch 2 (day 4): "Following up on [role]. One thing the demo shows: how the fit is explained so you can judge it. Happy to walk through it on your actual role in 15 minutes, no signup needed."

Touch 3 (day 10): "Last note from me. If remote engineers outside the US are not a priority now, no problem. If they are, I can set up a free pilot for [role]. Either way, thanks for reading."

Claims check: no metrics, candidate counts or live-feature claims; features described as demo content only (features are on a branch, live soon).

## Suggested next steps for founder
1. Pick one niche (suggest remote-first dev-tools/infra startups) and approve a weekly refresh.
2. Decide how to describe "vetted" before sending (see docs/objections.md).
3. Review the 3 rows and mark APPROVED to send by hand.
