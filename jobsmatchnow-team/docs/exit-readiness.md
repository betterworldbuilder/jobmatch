# Exit readiness: acquisition-readiness scorecard

Start date: [NEEDS DATA]
Last reviewed: 2026-10-25 (builder, initial seed from what is in the repo)

Target acquirers: LinkedIn, Indeed/Glassdoor (Recruit), ZipRecruiter, Greenhouse / Lever / Workday.
Target market: US startups hiring remote engineers from Vietnam / SEA.

## How this file works (read before editing)
- `scripts/build_dashboard.py` parses this file. Keep the format below and the dashboard picks up changes.
- `Start date:` takes `YYYY-MM-DD` (the founder fills it in). Until then the dashboard shows `[NEEDS DATA]` for days since start.
- Each scored section is a `## <Section name>` heading followed by ONE table with the columns
  `| Item | Status | Evidence | Owner |`. A `##` heading without such a table (like this one) is not scored.
- **To add an item:** append a row to the right table. **To add a section:** add a new `## Name` heading and a table with the same four columns.
- Status must be exactly one of: `DONE`, `IN PROGRESS`, `NOT STARTED`, `[NEEDS DATA]`. Anything else is read as `[NEEDS DATA]`.
- Evidence: a repo path (e.g. `docs/metrics.md`) or an https link. Use `-` if there is none yet. Never mark `DONE` without evidence.
- Owner: `builder`, `reviewer`, `marketer`, `seller`, `fundraiser` or `Founder`.
- Do not put `|` inside a cell.
- Readiness % = (DONE + 0.5 x IN PROGRESS) / number of items, per section and overall. `NOT STARTED` and `[NEEDS DATA]` count as 0.
- "Path to acquisition" is a numbered checklist: `N. [ ] milestone | evidence: <path or link> | owner: <owner>`. Change `[ ]` to `[x]` when reached. The first unchecked line is the current position.

## Traction
| Item | Status | Evidence | Owner |
|---|---|---|---|
| 10 paying US hiring teams | [NEEDS DATA] | docs/metrics.md (Paying hiring teams) | seller |
| 1,000 candidate signups | [NEEDS DATA] | docs/metrics.md (Candidate signups) | marketer |
| 100 hires made through the app | [NEEDS DATA] | docs/metrics.md (Hires made through the app) | Founder |
| Weekly metrics logged for 8+ weeks | NOT STARTED | data/metrics_history.csv | Founder |
| Retention data (teams and candidates, monthly cohorts) | NOT STARTED | docs/metrics.md (no retention event tracked) | builder |
| Core funnel events tracked server-side (signup, swipe, match, first message) | IN PROGRESS | docs/metrics.md (Tracked events; code on a branch, not yet live) | builder |

## Revenue
| Item | Status | Evidence | Owner |
|---|---|---|---|
| $10k MRR | [NEEDS DATA] | docs/metrics.md (MRR) | Founder |
| Pricing model decided (per seat / per hire) | DONE | docs/decisions.md (2026-10-25: free 3-month pilot, then per-hire fee) | Founder |
| First design partner converted from free pilot to paid | [NEEDS DATA] | docs/metrics.md (Paying hiring teams) | seller |
| Recruiter upgrade event tracked | NOT STARTED | docs/metrics.md (not in Tracked events) | builder |

## Product
| Item | Status | Evidence | Owner |
|---|---|---|---|
| Mutual match, explainable fit and salary up front shipped to production | IN PROGRESS | docs/brand.md (on a branch, live soon) | builder |
| Demo matching without signup live | IN PROGRESS | docs/brand.md (on a branch, live soon) | builder |
| Private distance range (no exact coordinates exposed) | IN PROGRESS | docs/brand.md | builder |
| Remote / timezone-overlap matching for US teams hiring in Vietnam / SEA | NOT STARTED | - | builder |
| ATS integration (Greenhouse or Lever first) | NOT STARTED | - | builder |

## Market
| Item | Status | Evidence | Owner |
|---|---|---|---|
| US ICP defined (US startups hiring remote VN/SEA engineers) | NOT STARTED | docs/icp.md (still HCMC-local) | seller |
| Competitor map incl. Toptal, Turing, Arc, Deel, Upwork | NOT STARTED | docs/competitors.md | marketer |
| US lead pipeline started | NOT STARTED | data/leads.csv | seller |
| 3 US customer case studies | NOT STARTED | - | marketer |
| Salary-transparency law angle documented (US states) | NOT STARTED | - | marketer |

## Strategic
| Item | Status | Evidence | Owner |
|---|---|---|---|
| Acquirer map: LinkedIn, Indeed/Glassdoor, ZipRecruiter, Greenhouse/Lever/Workday | NOT STARTED | docs/investors.md (empty) | fundraiser |
| Acquirer Watch running weekly | NOT STARTED | data/daily/ | fundraiser |
| Strategic partner talks (job platform or ATS) | NOT STARTED | - | Founder |
| ATS marketplace / partner program application | NOT STARTED | - | builder |

## Company/Legal
| Item | Status | Evidence | Owner |
|---|---|---|---|
| US entity (Delaware C-corp) | [NEEDS DATA] | - | Founder |
| Privacy policy and terms published | [NEEDS DATA] | - | Founder |
| SOC2-lite security controls (access, backups, incident log) | [NEEDS DATA] | - | builder |
| Privacy-first analytics (no ids, coordinates or salary in event counters) | IN PROGRESS | docs/metrics.md (Privacy; code on a branch) | builder |
| IP assignment and clean cap table | [NEEDS DATA] | - | Founder |

## Fundraising
| Item | Status | Evidence | Owner |
|---|---|---|---|
| Pre-seed deck | NOT STARTED | - | fundraiser |
| 50 well-fit investors listed | NOT STARTED | docs/investors.md (empty) | fundraiser |
| Data room (metrics, legal, cap table, contracts) | NOT STARTED | - | fundraiser |
| Investor objections answered | IN PROGRESS | docs/objections.md (1 investor objection so far) | fundraiser |

## Path to acquisition
1. [ ] 10 paying US hiring teams | evidence: docs/metrics.md | owner: seller
2. [ ] $10k MRR | evidence: docs/metrics.md | owner: Founder
3. [ ] 100 hires through the app | evidence: docs/metrics.md | owner: Founder
4. [ ] ATS integration live (Greenhouse or Lever) | evidence: - | owner: builder
5. [ ] Strategic partner talks with a job platform or ATS | evidence: docs/investors.md | owner: Founder
