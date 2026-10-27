// Run: node --test dash/actions.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cp, mkdtemp, readFile, rm, access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as A from "./actions.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("draft status: approve, sent only after approve, status line added when missing", () => {
  const t = "Status: DRAFT\n\n# Post\nbody";
  assert.throws(() => A.setDraftStatus(t, "SENT"), /Approve the draft/);
  const ap = A.setDraftStatus(t, "APPROVED");
  assert.match(ap, /^Status: APPROVED$/m);
  assert.match(A.setDraftStatus(ap, "SENT"), /^Status: SENT$/m);
  assert.match(A.setDraftStatus("# no status", "APPROVED"), /^Status: APPROVED\n\n# no status/);
});

test("draft save keeps the current status; request changes adds a founder note", () => {
  const saved = A.saveDraftText("Status: APPROVED\n\nold", "Status: DRAFT\n\nnew text");
  assert.equal(saved, "Status: APPROVED\n\nnew text");
  assert.equal(A.saveDraftText("Status: DRAFT\nx", "plain"), "Status: DRAFT\n\nplain");
  const noted = A.addFounderNote("Status: DRAFT\n\n# T", "2026-10-25", "make it | shorter\nplease");
  assert.match(noted, /^Status: DRAFT\nFounder notes: 2026-10-25: make it \/ shorter please\n/);
  assert.throws(() => A.addFounderNote("Status: DRAFT", "2026-10-25", "  "), /required/);
});

test("lead status: forward only unless confirmed; unknown company refused; CSV quoting kept valid", () => {
  const csv = 'date_added,company,url,size,why_now,buyer_title,opener,source,status\n' +
    '2026-10-25,Railway,https://railway.com,"Small, team","a, b",CTO,"x / y",src,NEW\n';
  const c1 = A.setLeadStatus(csv, "railway", "CONTACTED");
  assert.match(c1, /,CONTACTED\n$/);
  assert.equal(A.parseCsv(c1)[1][3], "Small, team");
  assert.throws(() => A.setLeadStatus(c1, "Railway", "NEW"), /needs the confirm box/);
  assert.match(A.setLeadStatus(c1, "Railway", "NEW", true), /,NEW\n$/);
  assert.throws(() => A.setLeadStatus(csv, "Nope Inc", "CONTACTED"), /not in data\/leads.csv/);
  assert.throws(() => A.setLeadStatus(csv, "Railway", "WON"), /Unknown lead status/);
});

test("metrics: plain numbers only, one row per date (replaced), older rows untouched, sorted", () => {
  assert.throws(() => A.cleanMetrics({ mrr: "$500" }), /plain numbers/);
  assert.throws(() => A.cleanMetrics({}), /at least one/);
  const v = A.cleanMetrics({ candidates: "40", matches: "12", conversations: "6", mrr: "0", hires: "?" });
  assert.equal(v.hires, "");
  const header = A.METRICS_HEADER.join(",") + "\n";
  let csv = A.upsertMetricsRow(header + "2026-10-10,10,,,2,,,,,,,\n", "2026-10-25", v);
  csv = A.upsertMetricsRow(csv, "2026-10-25", { ...v, candidates: "41" });
  const rows = A.parseCsv(csv);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[1], ["2026-10-10", "10", "", "", "2", "", "", "", "", "", "", ""]);
  assert.equal(rows[2][1], "41");
  assert.throws(() => A.upsertMetricsRow("date,x\n", "2026-10-25", v), /header changed/);
});

test("metrics.md: rows, week delta, rate, MRR, source and Last updated", () => {
  const md = "Last updated: [DATE]\n\n| Metric | Value | Source |\n|---|---|---|\n" +
    "| Candidate signups (total) | [NEEDS DATA] | |\n| Mutual matches (total / this week) | [NEEDS DATA] | |\n" +
    "| Match → first message rate | [NEEDS DATA] | |\n| MRR | [NEEDS DATA] | |\n| Hires made through the app | [NEEDS DATA] | |\n";
  const before = A.METRICS_HEADER.join(",") + "\n2026-10-10,10,,,2,,,,,,,\n";
  const out = A.updateMetricsMd(md, "2026-10-25", A.cleanMetrics({ candidates: "40", matches: "12", conversations: "6", mrr: "500" }), before);
  assert.match(out, /^Last updated: 2026-10-25$/m);
  assert.match(out, /\| Candidate signups \(total\) \| 40 \| founder via \/log-metrics 2026-10-25 \|/);
  assert.match(out, /\| Mutual matches \(total \/ this week\) \| 12 \/ 10 \|/);
  assert.match(out, /\| Match → first message rate \| 50% \|/);
  assert.match(out, /\| MRR \| \$500 \|/);
  assert.match(out, /\| Hires made through the app \| \[NEEDS DATA\] \| \|/);
  const noPrev = A.updateMetricsMd(md, "2026-10-25", A.cleanMetrics({ matches: "3" }), "");
  assert.match(noPrev, /\| 3 \/ \[NEEDS DATA\] \|/);
});

test("decision: appended to the table and removed from Open decisions; deck date replaces [DATE]", () => {
  const md = "# Decisions\n\n| date | decision | choice | reason | revisit when |\n|---|---|---|---|---|\n" +
    "| 2026-10-25 | Market | B | x | y |\n\n## Open decisions\n- **Pre-seed deck deadline:** CLAUDE.md says [DATE].\n- **Other:** z\n";
  const out = A.addDecision(md, { date: "2026-10-26", decision: "Pre-seed deck deadline", choice: "2026-12-20",
    reason: "after | pilots", revisit: "" });
  assert.match(out, /\| 2026-10-25 \| Market \| B \| x \| y \|\n\| 2026-10-26 \| Pre-seed deck deadline \| 2026-12-20 \| after \/ pilots \| - \|/);
  assert.doesNotMatch(out, /\*\*Pre-seed deck deadline:\*\*/);
  assert.match(out, /\*\*Other:\*\*/);
  assert.throws(() => A.addDecision(md, { date: "2026-10-26", decision: "X", choice: "", reason: "r" }), /required/);
  const claude = "## Current priorities\n3. Deck ready by [DATE].\n\n## Other\n[DATE] stays";
  const c2 = A.setDeckDate(claude, "2026-12-20");
  assert.match(c2, /ready by 2026-12-20/);
  assert.match(c2, /\[DATE\] stays/);
  assert.throws(() => A.setDeckDate(c2, "2026-12-20"), /No \[DATE\]/);
  assert.throws(() => A.setDeckDate(claude, "soon"), /must be a date/);
});

test("start date and readiness rows (DONE needs evidence)", () => {
  const md = "Start date: [NEEDS DATA]\n\n## Market\n| Item | Status | Evidence | Owner |\n|---|---|---|---|\n" +
    "| US ICP defined (US startups) | NOT STARTED | docs/icp.md | seller |\n";
  assert.match(A.setStartDate(md, "2026-10-25"), /^Start date: 2026-10-25$/m);
  assert.throws(() => A.setStartDate(md, "2026-13-01"), /YYYY-MM-DD/);
  assert.throws(() => A.setReadiness(md, "US ICP defined (US startups)", "DONE", "-"), /needs evidence/);
  const r = A.setReadiness(md, "US ICP defined (US startups)", "DONE", "docs/icp.md");
  assert.match(r, /\| US ICP defined \(US startups\) \| DONE \| docs\/icp.md \| seller \|/);
  assert.match(A.setReadiness(md, "US ICP defined (US startups)", "IN PROGRESS", ""), /\| IN PROGRESS \| docs\/icp.md \|/);
  assert.throws(() => A.setReadiness(md, "Nope", "DONE", "x"), /not found/);
  assert.throws(() => A.setReadiness(md, "US ICP defined (US startups)", "MAYBE", "x"), /Status must be/);
});

test("feedback: appended, cells escaped, emails and phone numbers rejected, dates allowed", () => {
  const md = "# Feedback\n\n| date | source | company or person-role | what they said | filed to | action |\n|---|---|---|---|---|---|\n";
  const out = A.addFeedback(md, { date: "2026-10-25", source: "reply", who: "Railway, CTO",
    said: "Time zones | worry\nraised 2026-01-22", filedTo: "", action: "" });
  assert.match(out, /\| 2026-10-25 \| reply \| Railway, CTO \| Time zones \/ worry raised 2026-01-22 \| - \| none \|\n?$/);
  assert.throws(() => A.addFeedback(md, { date: "2026-10-25", source: "reply", who: "jane@acme.com", said: "x" }), /email/);
  assert.throws(() => A.addFeedback(md, { date: "2026-10-25", source: "call", who: "CTO", said: "call me +1 415 555 0134" }), /phone/);
  assert.throws(() => A.addFeedback(md, { date: "2026-10-25", source: "tweet", who: "CTO", said: "x" }), /Source must be/);
});

test("objection: appended to the right section's table", () => {
  const md = "## Sales objections\n\n| Objection | From | Best answer | Worked? |\n|---|---|---|---|\n| \"a\" | sales | b | |\n\n" +
    "## Investor objections\n\n| Objection | From | Best answer | Worked? |\n|---|---|---|---|\n| \"c\" | investor | d | |\n";
  const s = A.addObjection(md, { objection: "Too expensive", type: "sales" });
  assert.match(s, /\| "a" \| sales \| b \| \|\n\| "Too expensive" \| sales \| \[NEEDS DATA\]/);
  const i = A.addObjection(md, { objection: "Market too small", type: "investor" });
  assert.match(i, /\| "c" \| investor \| d \| \|\n\| "Market too small" \| investor \|/);
});

test("activity rows and CSV round trip", () => {
  const out = A.appendActivity("", { date: "2026-10-25", task: "Approved x, y", output: "outbox/a.md" });
  assert.equal(out, 'date,agent,task,output,handoff_to\n2026-10-25,Founder,"Approved x, y",outbox/a.md,\n');
  assert.deepEqual(A.parseCsv('a,"b ""q"", c"\n'), [["a", 'b "q", c']]);
  assert.equal(A.cell("a|b\nc"), "a/b c");
});

test("meetings: propose with subject, problem and desired output; CEO decides; bad input refused", () => {
  const m = { date: "2026-10-28", time: "09:00", type: "urgent", subject: "YC, speedrun?", requestedBy: "Avi",
    problem: "Two deadlines", desiredOutput: "Apply or not" };
  const csv = A.addMeeting("", m);
  const rows = A.parseCsv(csv);
  assert.deepEqual(rows[0], A.MEETING_HEADER);
  assert.equal(rows[1][0], "2026-10-28-yc-speedrun");
  assert.equal(rows[1][8], "PROPOSED");
  assert.throws(() => A.addMeeting(csv, m), /already exists/);
  assert.throws(() => A.addMeeting("", { ...m, problem: " " }), /Problem to solve is required/);
  assert.throws(() => A.addMeeting("", { ...m, requestedBy: "Bob" }), /Unknown member/);
  assert.throws(() => A.addMeeting("", { ...m, subject: "call a@b.com" }), /email/);
  assert.equal(A.parseCsv(A.addMeeting("", { ...m, type: "deadline", problem: "", desiredOutput: "" }))[1][8], "SCHEDULED");
  const { csv: out, subject } = A.decideMeeting(csv, "2026-10-28-yc-speedrun", "Apply to YC only");
  assert.equal(subject, "YC, speedrun?");
  assert.deepEqual(A.parseCsv(out)[1].slice(8), ["DECIDED", "", "Apply to YC only"]);
  assert.throws(() => A.decideMeeting(csv, "nope", "x"), /not found/);
});

test("CEO review: YES/NO/DELAY per member, NO needs a note, agents get a board row", () => {
  const base = { date: "2026-10-27", stage: "M1", member: "Rizer", decision: "YES", note: "" };
  const yes = A.addCeoReview("", "", base);
  assert.deepEqual(A.parseCsv(yes.reviews), [A.CEO_REVIEW_HEADER, ["2026-10-27", "M1", "Rizer", "YES", ""]]);
  assert.deepEqual(A.parseCsv(yes.board)[1].slice(2, 5), ["Founder", "fundraiser", "result"]);
  assert.throws(() => A.addCeoReview("", "", { ...base, decision: "NO" }), /what to change/);
  const no = A.addCeoReview(yes.reviews, yes.board, { ...base, member: "Bui", decision: "NO", note: "back up first, then merge" });
  assert.match(A.parseCsv(no.board)[2][5], /^CEO: NO, reiterate \(M1 task\): back up first/);
  const self = A.addCeoReview("", "x", { ...base, member: "Founder", decision: "DELAY" });
  assert.equal(self.board, "x");
  assert.throws(() => A.addCeoReview("", "", { ...base, decision: "MAYBE" }), /YES, NO or DELAY/);
  assert.throws(() => A.addCeoReview("", "", { ...base, stage: "M99x" }), /Unknown stage/);
});

// ---------- end to end: real server on a temp copy ----------
async function startServer(root, port) {
  const child = spawn(process.execPath, [path.join(ROOT, "dash", "server.mjs")],
    { env: { ...process.env, DASH_ROOT: root, DASH_PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"] });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("server did not start")), 8000);
    child.stdout.on("data", (b) => { if (String(b).includes("serving")) { clearTimeout(t); resolve(); } });
    child.on("exit", (c) => reject(new Error(`server exited ${c}`)));
  });
  return child;
}

test("server: token required, approve writes the file and logs activity, traversal blocked", async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "dash-e2e-"));
  const port = 4500 + Math.floor(Math.random() * 400);
  let child;
  try {
    for (const d of ["docs", "data", "outbox", "plans", "scripts", ".claude"]) {
      await cp(path.join(ROOT, d), path.join(tmp, d), { recursive: true });
    }
    await cp(path.join(ROOT, "CLAUDE.md"), path.join(tmp, "CLAUDE.md"));
    child = await startServer(tmp, port);
    const base = `http://127.0.0.1:${port}`;
    const page = await (await fetch(`${base}/`)).text();
    const token = page.match(/name="dash-token" content="([0-9a-f]{48})"/)[1];
    const draft = "2026-10-25_seller_us-prospects.md";
    const body = JSON.stringify({ file: draft, status: "APPROVED" });

    const noTok = await fetch(`${base}/api/draft-status`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
    assert.equal(noTok.status, 403);
    const badOrigin = await fetch(`${base}/api/draft-status`, { method: "POST", body,
      headers: { "Content-Type": "application/json", "X-Dash-Token": token, Origin: "http://evil.example" } });
    assert.equal(badOrigin.status, 403);

    const ok = await fetch(`${base}/api/draft-status`, { method: "POST", body,
      headers: { "Content-Type": "application/json", "X-Dash-Token": token, Origin: `http://127.0.0.1:${port}` } });
    assert.equal(ok.status, 200, await ok.clone().text());
    assert.match(await readFile(path.join(tmp, "outbox", draft), "utf8"), /^Status: APPROVED$/m);
    assert.match(await readFile(path.join(tmp, "data", "activity.csv"), "utf8"), /Founder,Approved 2026-10-25_seller_us-prospects\.md/);

    const trav = await fetch(`${base}/api/draft-status`, { method: "POST",
      headers: { "Content-Type": "application/json", "X-Dash-Token": token }, body: JSON.stringify({ file: "../CLAUDE.md", status: "APPROVED" }) });
    assert.equal(trav.status, 400);
    assert.equal((await fetch(`${base}/..%2FCLAUDE.md`)).status, 404);
    assert.equal((await fetch(`${base}/.claude/settings.json`)).status, 404);
    assert.equal((await fetch(`${base}/.claude/agents/seller.md`)).status, 200);

    const arch = await fetch(`${base}/api/draft-archive`, { method: "POST",
      headers: { "Content-Type": "application/json", "X-Dash-Token": token },
      body: JSON.stringify({ file: "2026-10-25_seller_hcmc-prospects.md" }) });
    assert.equal(arch.status, 200);
    await access(path.join(tmp, "outbox", "archive", "2026-10-25_seller_hcmc-prospects.md"));
  } finally {
    if (child) child.kill();
    await rm(tmp, { recursive: true, force: true });
  }
});
