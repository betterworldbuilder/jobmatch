# JobsMatchNow team

The operating system for JobsMatchNow (https://jobsmatchnow.com/app/): one founder and seven Claude Code agents
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
| Any time | `./dash.sh` | Open the dashboard site (next section) |

## The dashboard site
```bash
./dash.sh                    # http://localhost:4321, opens the browser; Ctrl+C stops (DASH_PORT=5000 for another port)
python3 scripts/build_dashboard.py   # rebuild dashboard.html only (no server, buttons disabled)
node --test dash/actions.test.mjs    # tests for the server actions
```
One local page with three tabs (`?p=company`, `?p=team`, `?p=command`). It is rebuilt from the repo files on
every load: every number comes from a file, anything missing shows `[NEEDS DATA]`. The server binds 127.0.0.1
only, and nothing is ever sent from it.

| Tab | What it shows | Edit it in |
|---|---|---|
| **Company** | The business we build, the problem, for who, how it works, market potential (sourced), mission, a link to the live app | `docs/company.md` |
| **Our team** | The crew picture; one card per member in their own words, with the workflow steps they act in and their current task; the 8-step business workflow (who acts, in order, and the output); who steps in where; the decision loop | `data/team.csv`, `data/workflow.csv`, `design/*crew-boat.jpg` |
| **Command center** | 1. **Global timeline** Day 1 → M36, one row per member (ownership), current stage outlined, progress now. 2. **Meetings**: two-month calendar, **Propose a meeting**, meetings waiting for your decision, coming up, past. 3. **Stage loop**: stage → each member's task and result with your **Yes / No / Delay** → team meeting → agreed next tasks → goal achieved? → reiterate. 4. The rest: drafts to approve, leads, member actions, KPIs, charts, readiness | `data/timeline.csv`, `data/meetings.csv`, `data/team_board.csv`, `data/ceo_reviews.csv`, `plans/meetings/`, `plans/urgent/` |

**Founder buttons** (they work only through `./dash.sh`; opened as a plain file they are greyed out):
- **Propose a meeting:** requested by, type, date, subject, problem to solve, desired output → a `PROPOSED` row in
  `data/meetings.csv`. Run it with the **Copy** button's command; every member speaks in order.
- **Decide final action** on a meeting → saved on the meeting and in `docs/decisions.md`.
- **Yes / No / Delay** on each member's stage task → `data/ceo_reviews.csv`, and posted to that member on the team
  board. No needs a note (what to change). Yes counts the member's goal as achieved.
- Approve, edit or send drafts; change lead status; log metrics, feedback and decisions.

Every button write is atomic, logged in `data/activity.csv`, and followed by a rebuild.

## Where things live
- `docs/`: facts (company page, brand, ICP, metrics, competitors, investors, objections, decisions, vision backcast)
- `data/`: timeline, team, workflow, team board, meetings calendar, CEO reviews, leads, activity, metrics history, daily runs
- `outbox/`: drafts awaiting approval (`Status: DRAFT` → founder sets `APPROVED` and sends by hand)
- `plans/`: weekly plans and reviews, `meetings/` (team meetings), `urgent/` (urgent meetings), `advisor/` (Avi's memos)
- `design/`: Desi's specs, mockups and the crew picture
- `scripts/build_dashboard.py` → `dashboard.html` (generated, not committed); `dash/` holds the local server and its actions
