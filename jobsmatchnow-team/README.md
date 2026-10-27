# JobsMatchNow team

The operating system for JobsMatchNow (https://jobsmatchnow.com/app/): one founder and five Claude Code agents
working backwards from one goal. **Be acquired by LinkedIn within 36 months.** That's the imagined signing on
2029-10-26; day 1 was the US pivot on 2026-10-25.

Install: see `SETUP.md`. Rules every agent follows: `CLAUDE.md`.

## The plan: a reverse timeline
`data/timeline.csv` holds the plan as one table, and the dashboard shows it at the top. Each row is a stage
(Day 1, M1, M3, M6, M9, M12, M18, M24, M30, M33, M36). Each row gives every member's milestone and the
**compound effect**, meaning what that layer adds to the ones below it. Read it bottom-up.

Key points (full story, per-member strategy and lessons: `docs/vision-backcast.md`):
- **M6 is the hinge.** Vetted supply meets paying demand and the flywheel starts.
- **M30 sets the price.** A second bidder (Recruit/Indeed) is worth more than any single metric.
- **A missing layer costs more than a slow one.**

Everything after today is **imagined**. It is never quoted as fact in outbound copy (CLAUDE.md rule 3). A
stage moves to `DONE` only when the founder confirms the evidence.

## The team
| Name | Agent | Owns |
|---|---|---|
| Founder | human | CEO and VN/SEA engineer community lead; approves and sends everything |
| Bui | `builder` | App code, tests, staging |
| Rev | `reviewer` | Read-only check of code and every claim |
| Mark | `marketer` | Positioning, posts, candidate growth and vetting pipeline |
| Selly | `seller` | US leads, pilots, outreach drafts, pricing proposals |
| Rizer | `fundraiser` | Investors, YC, deck, acquirer research |
| Avi | `advisor` | Board advisor (YC-partner level): weekly mentorship memo in `plans/advisor/`; advises, never decides |
| Desi | `designer` | Game-grade UX/UI; command center first (specs + mockups in `design/`), the app later |

## How the team talks to each other
1. **Work.** Each agent reads the rows addressed to it on the team board (`data/team_board.csv`), does its
   stage task, and returns `BOARD ROWS`: one `result` row, `feedback` to the teammates its work affects, any
   `blocker`, and `proposal`s for the founder. The main session appends the rows. Agents never call each other
   directly, so ownership stays clear.
2. **Meet.** `/team-meeting` has each agent answer the feedback addressed to it: what it will change, and
   AGREE or DISAGREE on each proposal. The minutes go to `plans/meetings/DATE_STAGE.md` with three lists:
   agreed proposals, disagreements and the gate to the next stage.
3. **Decide.** The founder decides through `/ceo`, and decisions go into `docs/decisions.md`, which every agent
   must follow. Agents propose; only the founder decides.

## Daily and weekly rhythm
| When | Command | What happens |
|---|---|---|
| Every morning | `/daily-run` | News, leads, fixes, review; brief opens with the **Vision line** (next milestone) |
| After a round of work | `/team-meeting` | Agents adapt to each other's feedback and agree proposals |
| Something can't wait | `/urgent-meeting <subject> \| <problem> \| <desired output>` | Every member gives an opinion in order; you decide with `/urgent-meeting decide <file> <option>` |
| When decisions pile up | `/ceo` | Max 5 founder decisions with a recommendation |
| Monday / Friday | `/weekly-plan` / `/weekly-review` | One task per agent; what moved the numbers |
| Weekly | `/log-metrics` | The only source of real numbers |
| Any time | `./dash.sh` | Open the site: **Company** (business, mission, team, products) and **Command center** (global timeline, meeting calendar, stage loop, actions) |

## Where things live
- `docs/`: facts (brand, ICP, metrics, competitors, investors, objections, decisions, vision backcast)
- `data/`: timeline, team board, leads, activity, metrics history, daily runs
- `outbox/`: drafts awaiting approval (`Status: DRAFT` → founder sets `APPROVED` and sends by hand)
- `plans/`: weekly plans, reviews and `meetings/`
- `scripts/build_dashboard.py` → `dashboard.html`
