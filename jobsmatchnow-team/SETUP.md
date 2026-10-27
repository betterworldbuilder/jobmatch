# How to install your JobsMatchNow agent team

1. Unzip this folder. Either use it as a new workspace, or copy `CLAUDE.md`, `.claude/`, `docs/`,
   `outbox/`, `plans/` into the root of your app's repo (put your code under `app/` or update the folder map).
2. Open a terminal there and run `claude`.
3. Type `/agents` to confirm you see: builder, reviewer, marketer, seller, fundraiser.
4. Fill in `docs/metrics.md` and `docs/icp.md` (10 minutes — the agents are only as good as these).
5. Run `/weekly-plan` every Monday and `/weekly-review` every Friday.

Daily use:
- `/ship add salary filter to recruiter search`
- `/outreach tech startups hiring engineers in Ho Chi Minh City, 10 companies`
- "Use the marketer to draft next week's 4 LinkedIn posts"
- "Use the fundraiser to draft the pre-seed deck copy"

Approving: open the file in `outbox/`, edit, change `Status: DRAFT` to `Status: APPROVED`, then send it yourself.

## Paste-in alternative
If you'd rather have Claude Code build this itself, paste this prompt into Claude Code in your repo:

> Set up a lean agent team for JobsMatchNow (https://jobsmatchnow.com/app/). Create CLAUDE.md as the company
> brain, and subagents in .claude/agents/: builder (code, tests, staging only), reviewer (read-only check of
> code and every claim in outbound text), marketer (LinkedIn posts, landing copy, candidate growth), seller
> (B2B prospect research, outreach drafts, demo scripts) and fundraiser (pitch narrative, investor list,
> investor updates). Rules: one owner per task; agents draft into outbox/, the founder sends everything by hand;
> numbers only from docs/metrics.md, otherwise [NEEDS DATA]; no LinkedIn scraping or automation. Add slash
> commands /weekly-plan, /weekly-review, /ship and /outreach, and starter docs (metrics, icp, brand,
> competitors, investors, objections). Show me the files before finishing.
