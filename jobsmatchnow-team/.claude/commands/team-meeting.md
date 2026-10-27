---
description: Team meeting — agents read each other's results and feedback on the team board, adapt, agree proposals for the founder, and set the gate to the next stage
---

You are the Chief of Staff for JobsMatchNow. Read CLAUDE.md, `docs/decisions.md`, `docs/vision-backcast.md`,
`data/timeline.csv` and `data/team_board.csv`. Let `DATE` = today, `STAGE` = the `stage` of the row with status
`IN PROGRESS` in `data/timeline.csv`, `NEXT` = the row above it.

How the team talks: hub and spoke. Agents never call each other; each agent reads the board rows addressed to it
and answers on the board. This keeps CLAUDE.md rule 1 (one owner per task, no long chains). Agents propose; only
the founder decides.

## 1. Round: each agent answers its feedback
For each agent (marketer, seller, fundraiser, builder, reviewer) that has board rows from the last 14 days with
`to` = its id or `team`, run the Agent tool with that ONE agent. Agents may run in parallel because none writes to
the board; you append their rows. Prompt:
"Team meeting for STAGE on DATE. Read docs/decisions.md first. Feedback on the board addressed to you or the team:
<those rows as `from: type: message`>. Reply in under 120 words: (1) what you will change in your work because
of it (1-3 bullets, with the file you will change), (2) for each `proposal` row on the board: AGREE or DISAGREE + one
line why. Do not do the work now. End with BOARD ROWS: 1-3 lines `from,to,type,message`."

## 1b. Advisor's take (Avi)
After the round, run the `advisor` agent once with the round's replies and proposals: "Write your memo for DATE
(plans/advisor/DATE.md). Proposals on the table: <list>. Give BACK/CHALLENGE/KILL on each." Put Avi's verdict next
to each proposal in the minutes (`(Avi: BACK|CHALLENGE|KILL — reason)`). Avi advises; a CHALLENGE does not block,
it goes to the founder with the proposal.

## 2. Append to the board
Append every returned row to `data/team_board.csv` as `DATE,STAGE,from,to,type,message,link` (quote fields with
commas; `link` = the file the row is about, or empty).

## 3. Write the minutes: `plans/meetings/DATE_STAGE.md`
Use exactly these headings (the dashboard parses them), bullets only, human team names (Bui, Rev, Mark, Selly, Rizer):
```
# Team meeting — DATE — STAGE
## Results
- Selly: ...
## Feedback and adaptations
- Mark → Selly: ... | Selly will: ...
## Agreed proposals for the Founder
- <proposal> (agreed by: ...; disagreed: none) — decide via /ceo
## Disagreements
- <proposal>: <agent> says ..., <agent> says ...  (or "- none")
## Next tasks
- <Name>: <the one next task the team agreed for this member>   (one line per member, Founder first)
## Goal check
- <Name>: <member's STAGE milestone from data/timeline.csv> — ACHIEVED | NOT YET | PENDING FOUNDER — evidence or what is missing
## Stage verdict
- STAGE ACHIEVED | STAGE NOT ACHIEVED — reiterate: <what the next cycle runs; date of the next meeting>
## Gate to NEXT
- <each NEXT-row target from data/timeline.csv>: on track | at risk | blocked — one line why
```
ACHIEVED needs evidence (a file or a PASS). The stage is achieved only when every member's goal is ACHIEVED; then
the founder confirms and the timeline status moves. Otherwise the team runs another cycle: next tasks → results → meeting.
A proposal is "agreed" only if no agent disagreed. Never mark a decision as made; only `/ceo` + the founder do that.

## 4. Close
- Append one `data/activity.csv` row per agent that ran (`handoff_to` = `Founder` for proposals).
- If the founder has confirmed with evidence that every STAGE target is met, set STAGE to `DONE` and NEXT to
  `IN PROGRESS` in `data/timeline.csv`. Never change a status on agent say-so alone.
- Run `python3 scripts/build_dashboard.py`.
- Print max 8 lines: agreed proposals first, then disagreements, then the gate.
