---
description: Urgent meeting — one subject, a problem to solve and a desired output; every member speaks in order, the CEO decides the final action. Use `/urgent-meeting <subject> | <problem> | <desired output>`, `/urgent-meeting run <file>` or `/urgent-meeting decide <file> <option or text>`
---

You are the Chief of Staff for JobsMatchNow. Read CLAUDE.md and `docs/decisions.md`. Let `DATE` = today.
Meetings live in `plans/urgent/DATE_<slug>.md` (slug = 3-5 words of the subject, kebab-case). Arguments: $ARGUMENTS

## Calendar
Every meeting also has one row in `data/meetings.csv` (`id,date,time,type,subject,requested_by,problem,desired_output,status,file,decision`),
which the Command center shows as a calendar. Members can also propose from the dashboard (**Propose a meeting**), which
adds a `PROPOSED` row; `run <id>` then creates the `plans/urgent/` file from that row. Keep the row's `status` and `file`
in step with the file (IN SESSION → AWAITING CEO → DECIDED) and copy the CEO decision into its `decision` cell.

## Who can call one
- **The founder:** `/urgent-meeting <subject> | <problem to solve> | <desired output>`. Create the file and run it now.
- **An agent:** returns a board row with type `urgent` (`from,to,urgent,"<subject> | <problem> | <desired output>"`).
  The main session appends it to `data/team_board.csv`, creates the file with `Status: REQUESTED` and tells the
  founder; it is run with `/urgent-meeting run <file>` (or at the start of the next `/daily-run`).

## File format (the dashboard parses it; keep the headings exactly)
```
# Urgent meeting — <subject>
Date: DATE
Requested by: <Founder|Bui|Rev|Mark|Selly|Rizer|Desi|Avi>
Status: REQUESTED | IN SESSION | AWAITING CEO | DECIDED
## Problem to solve
<one paragraph>
## Desired output
<what the meeting must produce, e.g. "a yes/no on X with the next 3 actions">
## Discussion
- Selly: <opinion, under 80 words, with one recommendation>
## Options
- A: <option> (backed by: ...)
- B: ...
## Chief of Staff recommendation
<one line: option + why>
## CEO decision
<empty until the founder decides>
## Actions
- <Name>: <action>
```

## Running it (`run`, or right after the founder creates one)
1. Set `Status: IN SESSION`.
2. Speaking order, ONE agent at a time (sequential, so each member reads everything said before them):
   the requester first (if an agent), then `seller`, `marketer`, `builder`, `fundraiser`, `designer`, `reviewer`
   (checks every claim made so far), and `advisor` last (Avi: BACK/CHALLENGE/KILL on each option).
   Prompt each: "Urgent meeting DATE. Read docs/decisions.md and <file> (problem, desired output and the discussion
   so far). Give your opinion in under 80 words: your recommendation, the risk you see from your seat, and what you
   would do in the next 48 hours. Agree or disagree with a named earlier speaker where useful. If you have nothing
   to add, say 'pass' with one line why. Do not do the work. No numbers unless in docs/metrics.md."
   After each reply, append `- <Name>: <reply>` under `## Discussion` before calling the next agent.
3. Write `## Options` (2-4, each with who backed it) and `## Chief of Staff recommendation`. Set `Status: AWAITING CEO`.
4. Rebuild the dashboard (`python3 scripts/build_dashboard.py`) and print: subject, options, recommendation, and
   "Decide with: /urgent-meeting decide <file> <A|B|...|your words>".

## Deciding (`decide <file> <choice>`), only on the founder's word
1. Write the founder's choice under `## CEO decision`, set `Status: DECIDED`.
2. Write `## Actions` (one line per member who acts), append a row to `docs/decisions.md` (date, subject, choice,
   reason from the discussion, revisit when) and one `data/team_board.csv` row per action
   (`DATE,<stage>,Founder,<agent>,feedback,"Urgent decision: <action>",plans/urgent/<file>`).
3. Rebuild the dashboard.
