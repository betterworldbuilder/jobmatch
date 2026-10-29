// Local dashboard server for the agent team (started by ./dash.sh). Binds 127.0.0.1 only.
// GET /           rebuilds dashboard.html via scripts/build_dashboard.py and serves it with this run's token.
// GET <file>      serves outbox/, docs/, data/, plans/ and .claude/{agents,commands}/*.md read-only:
//                 .md/.csv as a line-numbered page (deep links like /docs/x.md#L12), ?raw=1 for plain text.
// POST /api/<a>   founder actions from the dashboard buttons (see ACTIONS). Needs the token, a localhost
//                 Origin/Host and a JSON body. Writes are atomic and one at a time; each one is logged in
//                 data/activity.csv and followed by a rebuild. Nothing is ever sent from here.
import { createServer } from "node:http";
import { readFile, readdir, stat, writeFile, rename, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as A from "./actions.mjs";

const ROOT = path.resolve(process.env.DASH_ROOT || path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const PORT = Number(process.env.DASH_PORT || 4321);
const TOKEN = randomBytes(24).toString("hex");
const SERVED = ["outbox", "docs", "data", "plans"];
const TYPES = { ".html": "text/html", ".json": "application/json", ".md": "text/plain", ".csv": "text/plain" };
const MAX_BODY = 64 * 1024;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function rebuild() {
  return new Promise((resolve) => {
    execFile("python3", ["scripts/build_dashboard.py"], { cwd: ROOT }, (err, stdout, stderr) => {
      const out = `${stdout}${stderr}`.trim();
      if (err) console.error(`build_dashboard.py failed:\n${out}`);
      else console.log(out.split("\n").filter((l) => !l.startsWith("Dashboard:")).join("\n"));
      resolve(!err);
    });
  });
}

function send(res, code, body, type = "text/plain") {
  res.writeHead(code, { "Content-Type": `${type}; charset=utf-8`, "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" });
  res.end(body);
}
const json = (res, code, obj) => send(res, code, JSON.stringify(obj), "application/json");

// ---------- files ----------
const rel = (...p) => path.join(ROOT, ...p);
const readText = async (p) => { try { return await readFile(rel(p), "utf8"); } catch { return ""; } };

async function writeAtomic(p, text) {
  const abs = rel(p);
  await mkdir(path.dirname(abs), { recursive: true });
  const tmp = `${abs}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmp, text, "utf8");
  await rename(tmp, abs);
}

let queue = Promise.resolve();
function serialized(fn) {
  const p = queue.then(fn);
  queue = p.catch(() => {});
  return p;
}

function servedPath(relPath) {
  const abs = path.resolve(ROOT, relPath);
  if (!abs.startsWith(ROOT + path.sep)) return null;
  const parts = path.relative(ROOT, abs).split(path.sep);
  if (SERVED.includes(parts[0])) return abs;
  if (parts[0] === ".claude" && ["agents", "commands"].includes(parts[1]) && parts.length === 3 && abs.endsWith(".md")) return abs;
  return null;
}

function lineView(relPath, text) {
  const lines = text.split("\n").map((l, i) =>
    `<div class="l" id="L${i + 1}"><a href="#L${i + 1}">${i + 1}</a><span>${esc(l) || " "}</span></div>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(relPath)}</title><style>
:root{--bg:#f5f6fb;--text:#1b2340;--muted:#8a90a6;--hl:#ffe3ee;--accent:#fd267a}
@media (prefers-color-scheme: dark){:root{--bg:#0e1222;--text:#e8eaf4;--muted:#6b7390;--hl:#3a1d33}}
body{margin:0;background:var(--bg);color:var(--text);font:13px/1.55 ui-monospace,Consolas,monospace}
header{position:sticky;top:0;background:var(--bg);padding:10px 16px;border-bottom:3px solid var(--accent);font-family:system-ui,sans-serif}
header a{color:var(--accent)}main{padding:8px 0}.l{display:flex;gap:12px;padding:0 16px}
.l a{flex:none;width:3.5em;text-align:right;color:var(--muted);text-decoration:none;user-select:none}
.l span{white-space:pre-wrap;overflow-wrap:anywhere}.l:target{background:var(--hl)}
</style></head><body><header><a href="/">← Dashboard</a> · <b>${esc(relPath)}</b> · <a href="?raw=1">raw</a></header>
<main>${lines}</main><script>var t=document.querySelector(':target');if(t)t.scrollIntoView({block:'center'});</script></body></html>`;
}

async function listing(relPath, abs) {
  const names = (await readdir(abs)).filter((n) => !n.startsWith(".") && !n.includes(":Zone.Identifier")).sort();
  const items = names.map((n) => `<li><a href="/${relPath}/${encodeURIComponent(n)}">${esc(n)}</a></li>`);
  return `<!doctype html><meta charset="utf-8"><title>${esc(relPath)}</title><p><a href="/">← Dashboard</a></p><h1>${esc(relPath)}/</h1><ul>${items.join("")}</ul>`;
}

// ---------- request checks ----------
function sameOrigin(req) {
  const ok = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`]);
  if (!ok.has(req.headers.host || "")) return false;
  const origin = req.headers.origin;
  return !origin || ok.has(origin.replace(/^http:\/\//, ""));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new A.ActionError("Request too large.")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); }
      catch { reject(new A.ActionError("Body must be JSON.")); }
    });
    req.on("error", reject);
  });
}

async function draftFile(name) {
  if (typeof name !== "string" || !/^[\w.-]+\.md$/.test(name) || name.includes("_reviewer_daily")) {
    throw new A.ActionError("Unknown draft.");
  }
  const p = `outbox/${name}`;
  try { if (!(await stat(rel(p))).isFile()) throw new Error(); } catch { throw new A.ActionError("Draft not found."); }
  return p;
}

const str = (v, max = 4000) => (typeof v === "string" ? v.slice(0, max) : "");

// ---------- actions ----------
// Each returns { msg, task, output, handoff } after writing its files.
const ACTIONS = {
  async "draft-save"(b) {
    const p = await draftFile(b.file);
    await writeAtomic(p, A.saveDraftText(await readText(p), str(b.text, 60000)));
    return { msg: "Draft saved.", task: `Edited draft ${b.file}`, output: p, handoff: "reviewer" };
  },
  async "draft-status"(b) {
    const p = await draftFile(b.file);
    const status = str(b.status);
    if (!["APPROVED", "SENT"].includes(status)) throw new A.ActionError("Status must be APPROVED or SENT.");
    await writeAtomic(p, A.setDraftStatus(await readText(p), status));
    return { msg: status === "SENT" ? "Marked sent." : "Approved. Send it yourself, then mark it sent.",
      task: `${status === "SENT" ? "Sent by hand" : "Approved"} ${b.file}`, output: p, handoff: status === "SENT" ? "" : "Founder" };
  },
  async "draft-changes"(b) {
    const p = await draftFile(b.file);
    const date = A.today();
    const agent = (b.file.split("_")[1] || "").toLowerCase();
    await writeAtomic(p, A.addFounderNote(await readText(p), date, str(b.note)));
    const fb = A.addFeedback(await readText("docs/feedback.md"), { date, source: "founder review", who: `${agent} draft ${b.file}`,
      said: str(b.note), filedTo: p, action: `revise (owner: ${agent})` });
    await writeAtomic("docs/feedback.md", fb);
    return { msg: `Sent back to the ${agent} with your note.`, task: `Requested changes on ${b.file}`, output: p, handoff: agent };
  },
  async "draft-archive"(b) {
    const p = await draftFile(b.file);
    await mkdir(rel("outbox/archive"), { recursive: true });
    await rename(rel(p), rel(`outbox/archive/${b.file}`));
    return { msg: "Archived to outbox/archive/.", task: `Archived ${b.file}`, output: `outbox/archive/${b.file}` };
  },
  async "lead-status"(b) {
    const company = str(b.company, 200), status = str(b.status);
    await writeAtomic("data/leads.csv", A.setLeadStatus(await readText("data/leads.csv"), company, status, b.confirmBack === true));
    return { msg: `${company} → ${status}.`, task: `Lead ${company} set to ${status}`, output: "data/leads.csv",
      handoff: status === "REPLIED" ? "seller" : "" };
  },
  async metrics(b) {
    const date = str(b.date) || A.today();
    const values = A.cleanMetrics(b.values || {});
    const csv = await readText("data/metrics_history.csv");
    const md = A.updateMetricsMd(await readText("docs/metrics.md"), date, values, csv);
    await writeAtomic("data/metrics_history.csv", A.upsertMetricsRow(csv, date, values));
    await writeAtomic("docs/metrics.md", md);
    const unknown = A.METRIC_FIELDS.filter((f) => values[f] === "");
    return { msg: `Metrics logged for ${date}.${unknown.length ? ` Still unknown: ${unknown.join(", ")}.` : ""}`,
      task: `Logged metrics ${date}`, output: "data/metrics_history.csv docs/metrics.md", handoff: "all agents" };
  },
  async decision(b) {
    const date = A.today();
    const decision = str(b.decision, 200), choice = str(b.choice, 1000);
    if (/deck/i.test(decision) && /deadline|date/i.test(decision)) {
      if (!A.isDate(choice)) throw new A.ActionError("Pick a date for the deck deadline.");
      await writeAtomic("CLAUDE.md", A.setDeckDate(await readText("CLAUDE.md"), choice));
    }
    await writeAtomic("docs/decisions.md", A.addDecision(await readText("docs/decisions.md"),
      { date, decision, choice, reason: str(b.reason, 1000), revisit: str(b.revisit, 300) }));
    return { msg: `Decision recorded: ${decision}.`, task: `Decided ${decision}: ${choice}`, output: "docs/decisions.md", handoff: "all agents" };
  },
  async "start-date"(b) {
    const date = str(b.date);
    await writeAtomic("docs/exit-readiness.md", A.setStartDate(await readText("docs/exit-readiness.md"), date));
    return { msg: `Start date set to ${date}.`, task: `Set start date ${date}`, output: "docs/exit-readiness.md" };
  },
  async readiness(b) {
    const item = str(b.item, 300), status = str(b.status);
    await writeAtomic("docs/exit-readiness.md", A.setReadiness(await readText("docs/exit-readiness.md"), item, status, str(b.evidence, 300)));
    return { msg: `${item} → ${status}.`, task: `Readiness: ${item} → ${status}`, output: "docs/exit-readiness.md" };
  },
  async "meeting-propose"(b) {
    const m = { date: str(b.date), time: str(b.time, 5), type: str(b.type), subject: str(b.subject, 200),
      requestedBy: str(b.requestedBy, 20), problem: str(b.problem, 1500), desiredOutput: str(b.desiredOutput, 600) };
    await writeAtomic("data/meetings.csv", A.addMeeting(await readText("data/meetings.csv"), m));
    return { msg: `Meeting proposed for ${m.date}: ${m.subject}.`, task: `Proposed ${m.type} meeting: ${m.subject}`,
      output: "data/meetings.csv", handoff: "all agents" };
  },
  async "ceo-review"(b) {
    const r = { date: A.today(), stage: str(b.stage, 10), member: str(b.member, 20), decision: str(b.decision, 10),
      note: str(b.note, 1000) };
    const out = A.addCeoReview(await readText("data/ceo_reviews.csv"), await readText("data/team_board.csv"), r);
    await writeAtomic("data/ceo_reviews.csv", out.reviews);
    if (out.board !== (await readText("data/team_board.csv"))) await writeAtomic("data/team_board.csv", out.board);
    return { msg: `${r.member}: ${r.decision}.`, task: `CEO ${r.decision} on ${r.member}'s ${r.stage} task`,
      output: "data/ceo_reviews.csv data/team_board.csv", handoff: r.member };
  },
  async "meeting-decide"(b) {
    const date = A.today();
    const { csv, subject } = A.decideMeeting(await readText("data/meetings.csv"), str(b.id, 80), str(b.decision, 1500));
    const dec = A.addDecision(await readText("docs/decisions.md"),
      { date, decision: `Meeting: ${subject}`, choice: str(b.decision, 1500), reason: "CEO decision after the team meeting (data/meetings.csv)",
        revisit: str(b.revisit, 300) || "next team meeting" });
    await writeAtomic("data/meetings.csv", csv);
    await writeAtomic("docs/decisions.md", dec);
    return { msg: `Decided: ${subject}.`, task: `Decided meeting ${subject}`, output: "data/meetings.csv docs/decisions.md",
      handoff: "all agents" };
  },
  async chat(b) {
    const to = str(b.to, 20);
    const stage = A.currentStage(await readText("data/timeline.csv"));
    await writeAtomic("data/team_board.csv", A.addChat(await readText("data/team_board.csv"),
      { date: A.today(), stage, to, message: str(b.message, 1500) }));
    return { msg: `Sent to ${to === "Team" ? "the whole team" : to}. Replies come on their next run.`,
      task: `Message to ${to}`, output: "data/team_board.csv", handoff: to === "Team" ? "all agents" : to };
  },
  async feedback(b) {
    const date = A.today();
    const source = str(b.source), company = str(b.company, 200), role = str(b.role, 200);
    const who = [company, role].filter(Boolean).join(", ");
    const filed = [];
    const leadStatus = str(b.leadStatus);
    if (b.asObjection === true) filed.push("docs/objections.md");
    if (leadStatus) filed.push("data/leads.csv");
    // Validate everything before the first write.
    const fb = A.addFeedback(await readText("docs/feedback.md"),
      { date, source, who, said: str(b.said), filedTo: filed.join(", "), action: str(b.action, 500) });
    const obj = b.asObjection === true ? A.addObjection(await readText("docs/objections.md"),
      { objection: str(b.said, 500), type: source === "investor" ? "investor" : str(b.objectionType) }) : null;
    const leads = leadStatus ? A.setLeadStatus(await readText("data/leads.csv"), company, leadStatus, b.confirmBack === true) : null;
    await writeAtomic("docs/feedback.md", fb);
    if (obj) await writeAtomic("docs/objections.md", obj);
    if (leads) await writeAtomic("data/leads.csv", leads);
    return { msg: `Logged ${source} from ${who}.`, task: `Logged ${source}: ${who}`, output: ["docs/feedback.md", ...filed].join(" "),
      handoff: source === "reply" ? "seller" : "all agents" };
  },
};

async function handleAction(name, body) {
  const fn = ACTIONS[name];
  if (!fn) throw new A.ActionError("Unknown action.");
  return serialized(async () => {
    const r = await fn(body);
    const act = A.appendActivity(await readText("data/activity.csv"),
      { date: A.today(), agent: "Founder", task: r.task, output: r.output, handoff: r.handoff || "" });
    await writeAtomic("data/activity.csv", act);
    await rebuild();
    return r.msg;
  });
}

createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const relPath = decodeURIComponent(url.pathname).replace(/^\/+|\/+$/g, "");

  if (req.method === "POST") {
    if (!relPath.startsWith("api/")) return json(res, 404, { ok: false, message: "not found" });
    if (!sameOrigin(req) || req.headers["x-dash-token"] !== TOKEN) return json(res, 403, { ok: false, message: "Forbidden: reload the dashboard." });
    if (!(req.headers["content-type"] || "").startsWith("application/json")) return json(res, 415, { ok: false, message: "JSON only." });
    try {
      const msg = await handleAction(relPath.slice(4), await readBody(req));
      return json(res, 200, { ok: true, message: msg });
    } catch (e) {
      if (e instanceof A.ActionError) return json(res, 400, { ok: false, message: e.message });
      console.error(e);
      return json(res, 500, { ok: false, message: "Server error, see the terminal." });
    }
  }
  if (req.method !== "GET") return send(res, 405, "method not allowed");

  if (relPath === "" || relPath === "dashboard.html") {
    await rebuild();
    try {
      const page = (await readFile(rel("dashboard.html"), "utf8")).replace("__DASH_TOKEN__", TOKEN);
      return send(res, 200, page, "text/html");
    } catch {
      return send(res, 500, "dashboard.html could not be built - see the terminal");
    }
  }

  const abs = servedPath(relPath);
  if (!abs) return send(res, 404, "not found");
  try {
    const st = await stat(abs);
    if (st.isDirectory()) return send(res, 200, await listing(relPath, abs), "text/html");
    const ext = path.extname(abs);
    if ((ext === ".md" || ext === ".csv") && url.searchParams.get("raw") !== "1") {
      return send(res, 200, lineView(relPath, await readFile(abs, "utf8")), "text/html");
    }
    return send(res, 200, await readFile(abs), TYPES[ext] || "text/plain");
  } catch {
    return send(res, 404, "not found");
  }
}).listen(PORT, "127.0.0.1", () => console.log(`serving ${ROOT} on http://localhost:${PORT}`));
