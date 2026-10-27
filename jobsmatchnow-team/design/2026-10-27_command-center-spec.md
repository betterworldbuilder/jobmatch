# Command center redesign: game-grade HUD (spec)

Desi (designer), 2026-10-27. Status: DRAFT proposal, the founder picks an option.
Mockup: `design/2026-10-27_command-center-mockup.html` (dropdown "UI option" switches A/B/C/D live; theme switch Auto/Light/Dark).
Inputs read: `dashboard.html` (build 2026-10-27 22:18), `scripts/build_dashboard.py`, `data/timeline.csv`,
`data/team_board.csv`, `data/activity.csv`, `docs/decisions.md`, `docs/vision-backcast.md`, `docs/brand.md`.

**Team board adaptation.** No board rows are addressed to `designer` yet. I used the 3 M1 `result` rows and 3
`proposal` rows to `Founder`: the YC answer due Wed 10/28 (Rizer) becomes the single "Do this now", and Bui's
"branch NOT live" and Mark's vetting proposal become the next items. Every number in the mockup is copied from
these files; nothing is estimated.

## 1. Top 5 UX problems on the current page

1. **No single "do this now".** The CTA bar has 6 buttons, all styled `primary`; the Founder card lists 23 actions.
   Nothing is ranked by deadline, so the YC answer due tomorrow (Wed 2026-10-28) is not visible at the top.
2. **State colors are broken.** `ACTIVE` and `BLOCKED` render as the same grey `badge na`, because `BADGE` in
   `build_dashboard.py` has no entry for them. Mark is BLOCKED and that does not show.
3. **The hero timeline is a 10-column table you read bottom-up.** The current stage is row 10 of 11. At 360 px the
   table needs sideways scrolling, and imagined future stages look almost the same as real ones (only a grey badge differs).
4. **Two roadmaps compete.** "Path to LinkedIn" (11 stages, "M1") is at the top, while "Path to acquisition" (5
   milestones, "1 of 5") plus the "Status at a glance" tile sit lower down and count in different units. The player
   cannot tell which map is the real one.
5. **The best pixels show [NEEDS DATA].** Two of the three header tiles (north star, days since start) are empty, and
   the KPIs and Graphs sections are empty too. Meanwhile the real loot (32 drafts, 26 already passed by Rev) shows
   only as a pie chart. The page is about 160 KB, and the Team section alone is about 39 KB of text.

## 2. Four options (all in the mockup, same data)

| Option | Best for | Density | Effort to build |
|---|---|---|---|
| **A. Strategy-game HUD** | Morning 10-second scan on a laptop: sticky HUD, main quest, timers, level map, party, quest log, loot on one scroll | High | Medium (4 new render functions, about 250 lines of Python + CSS) |
| **B. RPG quest log** | Calm focus: one quest at a time; everything else is folded into `<details>` | Low | Low to medium (mostly reorders existing data into details blocks) |
| **C. Mobile-game home** | Checking from a phone: thumb CTA, 2x2 big tiles, swipe stage rail, bottom tab bar | Medium | Medium (fixed tab bar, scroll-snap rail, extra mobile QA) |
| **D. Clean pro + light game touches** | Showing the page to investors/advisors; closest to today's page | Medium | Low (restyle + stepper + team table) |

**Recommendation: A, with C's phone behaviour below 600 px.** A answers the four HUD questions (main quest, where
on the map, what the party does, what to press) without scrolling on a laptop. Below 600 px it adopts C's bottom tab
bar and full-width thumb CTA, which is cheap to add because both use the same components. B is the fallback if the
founder finds A too busy. D is a good "investor view" later (a `?view=pro` toggle), not the daily driver.

## 3. Layout, top to bottom (option A)

1. **HUD bar** (sticky, one row on desktop, wraps into 2–3 rows of chips at 360 px): Stage `M1 · Nov 2026` (gradient,
   links to the main quest) · Stages cleared `1 / 11` · Day `3` · Readiness `12%` · Loot `32 drafts` · Decide `8 open` ·
   nearest hard deadline `YC 6 days`. Replaces the 3 header hero tiles and absorbs the CTA bar.
2. **Main quest** (left, 3/5): kicker `Main quest · M1 (Nov 2026)`; title = the `compound` of the current stage;
   an objective bar plus checklist from `docs/vision-backcast.md` (`0 of 5 ticked`); per-member M1 goals; then the
   **Do this now** box with exactly one primary button.
   **Side column** (2/5): Timers (dated deadlines), Founder decisions (open + latest decided), Team meeting.
3. **Level map**: 11 nodes ordered forward, Day 1 → M36, in a wrapping grid (no table, no sideways scroll). Done =
   green border with a check; current = pink border, glow and "You are here"; future = dashed border, lock icon and the
   word "imagined". Boss gates on M6 and M30 get a crown icon.
4. **Party roster**: 7 tiles (Founder, Bui, Rev, Mark, Selly, Rizer, Desi). Each tile has an avatar ring, a state
   badge (icon + word, never color alone), the M1 goal, the latest line, 7-day results and the open count.
5. **Quest log**: team-board rows for the current stage with filter chips (All 13 · proposal 3 · result 3 · feedback 7 · blocker 0).
6. **Loot to claim**: 4 cards: ready to approve (26, Rev PASS) · not reviewed (5) · blocked (1) · leads to open (3).
   One button, "Review drafts".
7. **Rest, unchanged for now**: KPIs, graphs, feedback, collaboration, today, readiness gaps, next actions. Fold
   empty KPI/graph sections into one "Numbers needed" card (checklist step 9).

## 4. Components: data file and states

| Component | Reads | Normal | Empty | Blocked / warning |
|---|---|---|---|---|
| HUD bar | `data/timeline.csv`, `docs/exit-readiness.md`, `outbox/`, `docs/decisions.md`, deadlines (see step 4) | chips with values | a chip shows `[NEEDS DATA]` in muted text and keeps its place | the deadline chip turns `--bad` when 2 days or fewer remain |
| Main quest | `data/timeline.csv` (row `IN PROGRESS`), `docs/vision-backcast.md` "The path" line for that stage | title, objective bar, checklist, Do-now | no IN PROGRESS row: "No current stage. Set one in data/timeline.csv" | a blocker on the board for this stage replaces Do-now with the blocker text |
| Do this now | `data/team_board.csv` proposals `to=Founder` (nearest date), then `docs/decisions.md` open items, then Rev-PASS drafts | 1 item, 1 primary button | "Nothing waiting. Run /daily-run" | — |
| Timers | dates found in board messages and open decisions (`YYYY-MM-DD` or `by Wed 10/28`) | list sorted by days left | hidden | 2 days or fewer = `--bad` |
| Level map | `data/timeline.csv` | done / current / locked nodes | "No data/timeline.csv yet" | unknown status shows a `[NEEDS DATA]` node and a footer warning |
| Party roster | `MEMBERS`, `last7()`, `member_actions()`, M1 goal from `data/timeline.csv` | tile per member | no activity: state `Idle`, "no activity in 7 days" | `Blocked` (Rev BLOCK on a DRAFT) gets a red ring and the reason |
| Quest log | `data/team_board.csv` for the current stage | rows + filter chips | "Nothing on the team board for this stage yet" | blocker rows pinned to the top |
| Team meeting | `plans/meetings/*.md` (latest) | agreed proposals, disagreements, gate | "No team meeting yet. Run /team-meeting" (today's state) | — |
| Loot | `outbox/*.md` status + Rev verdicts, `data/leads.csv` | 4 cards | "Inbox zero" | BLOCKed count in `--bad` with the file name |

Desi has no column in `data/timeline.csv`, so her M1 goal shows `[NEEDS DATA]`. Adding a `designer` column is a
founder decision. The current `dashboard.html` also has no Desi card, because it was built before `designer` was added
to `MEMBERS`; the next rebuild will show it.

## 5. Design tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#f6f7fb` | `#0c1020` | page |
| `--surface` | `#ffffff` | `#151a2e` | cards |
| `--surface-2` | `#eef0f7` | `#1f2542` | chips, locked nodes |
| `--text` | `#1b2340` (navy) | `#eceef7` | body |
| `--muted` | `#56617f` | `#a5adca` | secondary (AA on surface) |
| `--line` | `#dfe3ee` | `#2c3354` | borders |
| `--brand-1 → --brand-2` | `#fd267a → #ff7a3d` | same | decorative only: bars, rings, top stripe |
| `--accent` | `#c8135c` | `#ff6aa3` | links, "You are here" (AA text) |
| `--cta-1 → --cta-2` | `#d4145a → #c2410c` | same | white-text buttons (AA, about 5:1) |
| `--ok / --warn / --bad / --info` | `#17794a / #935600 / #c0233d / #3b4a8c` | `#4cc38a / #f0b453 / #ff7a8d / #9fb0ff` | states, board types |
| `--lock` | `#9aa1b8` | `#5d6585` | locked stage dots |
| `--glow` | `rgba(253,38,122,.35)` | `rgba(255,106,163,.4)` | current node, pulse |

Spacing scale 4/8/12/16/24/32 px. Type scale 12/13/15/18/24/32 px (body 15). Radius 8/12/18. Touch targets ≥ 44 px
for primary actions, ≥ 32 px for chips. Dark mode: `prefers-color-scheme` guarded by `:root:not([data-theme="light"])`,
plus a `[data-theme="dark"]` override. Note: the current `--accent #fd267a` used as link text on white is about 3.6:1,
which fails AA. Use `--accent` for text and keep `#fd267a` for decoration only.

## 6. Motion rules

- One pulse on the single Do-now button (2 cycles on load, then still). Nothing else animates on load.
- The current level-map node gets a static glow ring (no loop).
- Progress bars animate width over 240 ms only when the value changed since the last build (optional: compare with
  `data/daily/` of yesterday).
- Hover/press feedback: 150 ms brightness, `scale(.98)` on press.
- `prefers-reduced-motion: reduce` turns all animation and transitions off.
- No confetti or celebration unless a real DONE happened (a stage flipped to DONE, or a draft moved to APPROVED/SENT).

## 7. Implementation checklist for `scripts/build_dashboard.py` (by impact ÷ effort)

1. **Fix state colors** (5 min): add `"ACTIVE": "ok", "BLOCKED": "bad", "NEW": "mid"` to `BADGE` (keep NEW for
   leads) and render team state with an icon + word.
2. **Swap tokens** (15 min): replace the `:root` and dark block with section 5, add the `[data-theme]` override, and
   use `--cta-1/2` for `.act.primary` and `--accent` (`#c8135c`) for link text.
3. **One primary button** (20 min): in the CTA bar, only Do-now is `primary`; the rest use the secondary style.
   Move the bar into the HUD (item 5).
4. **Do-now + timers** (45 min): new `next_founder_move(board, decisions, drafts)`: board `proposal` rows with
   `to=Founder` for the current stage, sorted by the first date found (`\d{4}-\d{2}-\d{2}` or `by (Mon|Tue|…) \d+/\d+`),
   then open decisions, then PASS drafts. Same parser feeds Timers. If the founder wants exact deadlines, a
   `data/deadlines.csv` is a better source later (founder decision).
5. **HUD bar** (45 min): new `render_hud()` replacing the `<header>` hero tiles; sticky; chips from data already
   loaded in `render()` (`timeline`, `overall`, `n_drafts`, `decisions`, timers). Days = today minus Day 1 from
   `docs/vision-backcast.md` ("day 1 = 2026-10-25"), or `[NEEDS DATA]` if not found.
6. **Level map** (1 h): in `render_timeline()`, replace the 10-column `table.tl` with an `<ol class="map">` of nodes
   in forward order (`reversed(timeline)`). Put per-member cells in a `<details>` under each node. Lock icon plus
   "imagined" on every non-DONE future node; boss crown on M6 and M30 (a constant `BOSS = {"M6", "M30"}`).
7. **Main quest card** (1 h): parse `docs/vision-backcast.md` "## The path" lines `N. [ ] M1 (...): a, b, c | owner`
   into objectives; ticked = `[x]`. Show the bar, checklist, per-member goals from the current row and Do-now.
8. **Party roster** (1 h): shrink the Team section cards into tiles (avatar ring, state, M1 goal, latest, results,
   open count). Move the long activity log and the 23 actions into `<details>` / the existing modal. Add
   `("designer", "Desi")` to `TL_MEMBERS` once `data/timeline.csv` has the column.
9. **Fold empty sections** (30 min): when `history` is empty, replace the KPIs + Graphs sections with one card,
   "Numbers needed: run /log-metrics", plus the Log metrics button.
10. **Loot cards** (30 min): split drafts by Rev verdict (PASS / not reviewed / BLOCK) from `load_outbox()`; show
    these above the charts; keep the pie further down.
11. **Quest-log filter chips** (20 min): add `data-type` to each `board_line` `<li>`, plus about 10 lines of JS (copy
    from the mockup).
12. **Retire the duplicate roadmap** (20 min): rename "Path to acquisition" to "Readiness milestones" and move it
    under Readiness gaps; drop the "Path to acquisition 1 of 5" tile from Status at a glance.
13. **Phone mode** (1–2 h, if A is chosen): below 600 px, add a fixed bottom tab bar (Quest · Map · Party · Loot)
    linking to the section ids, plus a full-width Do-now button; add `padding-bottom: 72px` to `main`.
14. **Motion** (15 min): copy section 6 CSS (`.pulse` 2 cycles, reduced-motion block).

Steps 1–5 give most of the gain in about 2 hours. Steps 6–8 make the page feel like a game.
