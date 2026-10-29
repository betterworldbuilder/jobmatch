// File-writing actions behind the dashboard buttons. Each function is a pure text transform
// (old file text -> new file text) that writes exactly the formats the CLI commands use
// (/log, /log-metrics, /ceo), so the dashboard and Claude Code stay interchangeable.

export const LEAD_STATUSES = ["NEW", "CONTACTED", "REPLIED", "DEMO", "PILOT", "PAID"];
export const READINESS = ["DONE", "IN PROGRESS", "NOT STARTED", "[NEEDS DATA]"];
export const FEEDBACK_SOURCES = ["reply", "call", "user comment", "investor", "founder review"];
export const METRIC_FIELDS = ["candidates", "hiring_teams", "paying_teams", "matches", "conversations", "hires",
  "mrr", "post_impressions", "outreach_sent", "replies", "demos"];
export const METRICS_HEADER = ["date", ...METRIC_FIELDS];
export const ACTIVITY_HEADER = ["date", "agent", "task", "output", "handoff_to"];

export class ActionError extends Error {}
const fail = (msg) => { throw new ActionError(msg); };

export function isDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s))) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function today() {
  return new Date().toLocaleDateString("en-CA"); // local YYYY-MM-DD
}

// ---------- markdown cells / personal data ----------
export function cell(s) {
  return String(s ?? "").replace(/\r?\n+/g, " ").replace(/\|/g, "/").trim();
}

const EMAIL_RE = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;
const PHONE_RE = /\+?\d[\d\s().-]{8,}\d/g;

export function assertNoPersonal(...values) {
  for (const v of values) {
    const s = String(v ?? "");
    if (EMAIL_RE.test(s)) fail("Remove the email address: use the company name or the person's role only.");
    for (const m of s.match(PHONE_RE) || []) {
      if ((m.match(/\d/g) || []).length >= 9) fail("Remove the phone number: use the company name or the person's role only.");
    }
  }
}

function required(v, name) {
  const s = cell(v);
  if (!s) fail(`${name} is required.`);
  return s;
}

// ---------- CSV ----------
export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", q = false;
  const s = String(text ?? "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export function csvField(v) {
  const s = String(v ?? "");
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows) {
  return rows.map((r) => r.map(csvField).join(",")).join("\n") + "\n";
}

export function appendCsvRow(text, header, values) {
  const rows = String(text ?? "").trim() ? parseCsv(text) : [header];
  rows.push(values.map((v) => String(v ?? "").replace(/\r?\n+/g, " ")));
  return toCsv(rows);
}

export function appendActivity(text, { date, agent = "Founder", task, output = "", handoff = "" }) {
  return appendCsvRow(text, ACTIVITY_HEADER, [date, agent, task, output, handoff]);
}

// ---------- meetings calendar (data/meetings.csv) ----------
export const MEETING_HEADER = ["id", "date", "time", "type", "subject", "requested_by", "problem", "desired_output",
  "status", "file", "decision"];
export const MEETING_TYPES = ["urgent", "team", "weekly", "deadline", "advisor"];
export const MEETING_MEMBERS = ["Founder", "Bui", "Rev", "Mark", "Selly", "Rizer", "Desi", "Avi"];

export function addMeeting(text, { date, time, type, subject, requestedBy, problem, desiredOutput }) {
  if (!isDate(date)) fail("Pick a date.");
  if (time && !/^\d{2}:\d{2}$/.test(time)) fail("Time must be HH:MM.");
  if (!MEETING_TYPES.includes(type)) fail("Unknown meeting type.");
  if (!MEETING_MEMBERS.includes(requestedBy)) fail("Unknown member.");
  const s = required(subject, "Subject");
  const p = type === "deadline" ? cell(problem) : required(problem, "Problem to solve");
  const o = type === "deadline" ? cell(desiredOutput) : required(desiredOutput, "Desired output");
  assertNoPersonal(s, p, o);
  const rows = String(text ?? "").trim() ? parseCsv(text) : [MEETING_HEADER];
  const id = `${date}-${s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30)}`;
  if (rows.some((r) => r[0] === id)) fail("A meeting with this subject already exists on that date.");
  return appendCsvRow(text, MEETING_HEADER, [id, date, time || "", type, s, requestedBy, p, o,
    type === "deadline" ? "SCHEDULED" : "PROPOSED", "", ""]);
}

// ---------- CEO review of each member's stage result (data/ceo_reviews.csv) ----------
export const CEO_REVIEW_HEADER = ["date", "stage", "member", "decision", "note"];
export const CEO_DECISIONS = ["YES", "NO", "DELAY"];
export const BOARD_HEADER = ["date", "stage", "from", "to", "type", "message", "link"];
const AGENT_OF = { Bui: "builder", Rev: "reviewer", Mark: "marketer", Selly: "seller", Rizer: "fundraiser",
  Desi: "designer", Avi: "advisor" };

export function addCeoReview(reviews, board, { date, stage, member, decision, note }) {
  if (!/^(Day 1|M\d{1,2})$/.test(String(stage))) fail("Unknown stage.");
  if (!MEETING_MEMBERS.includes(member)) fail("Unknown member.");
  if (!CEO_DECISIONS.includes(decision)) fail("Decision must be YES, NO or DELAY.");
  const n = cell(note);
  if (decision === "NO" && !n) fail("Say what to change, so the member can reiterate.");
  assertNoPersonal(n);
  const out = { reviews: appendCsvRow(reviews, CEO_REVIEW_HEADER, [date, stage, member, decision, n]), board };
  if (AGENT_OF[member]) {
    const msg = { YES: "CEO: YES, approved", NO: "CEO: NO, reiterate", DELAY: "CEO: DELAY, move to the next cycle" }[decision];
    out.board = appendCsvRow(board, BOARD_HEADER, [date, stage, "Founder", AGENT_OF[member], decision === "YES" ? "result" : "feedback",
      `${msg} (${stage} task)${n ? `: ${n}` : ""}`, "data/ceo_reviews.csv"]);
  }
  return out;
}

// ---------- founder chat box (rows on data/team_board.csv; agents answer on their next run) ----------
export const CHAT_TO = ["Team", "Bui", "Rev", "Mark", "Selly", "Rizer", "Desi", "Avi"];

export function currentStage(timelineCsv) {
  const rows = parseCsv(timelineCsv);
  const h = rows[0] || [];
  const si = h.indexOf("stage"), st = h.indexOf("status");
  const row = rows.slice(1).find((r) => String(r[st] || "").trim().toUpperCase() === "IN PROGRESS");
  return row ? row[si] : "";
}

export function addChat(board, { date, stage, to, message }) {
  if (!CHAT_TO.includes(to)) fail("Pick who the message is for.");
  const m = required(message, "Message");
  assertNoPersonal(m);
  return appendCsvRow(board, BOARD_HEADER, [date, stage, "Founder", to === "Team" ? "team" : AGENT_OF[to], "message", m, ""]);
}

export function decideMeeting(text, id, decision) {
  const d = required(decision, "Decision");
  assertNoPersonal(d);
  const rows = parseCsv(text);
  const head = rows[0] || [];
  const i = rows.findIndex((r, n) => n > 0 && r[0] === id);
  if (i < 0) fail("Meeting not found.");
  const col = (name) => head.indexOf(name);
  rows[i][col("status")] = "DECIDED";
  rows[i][col("decision")] = d;
  return { csv: toCsv(rows), subject: rows[i][col("subject")] };
}

// ---------- markdown tables ----------
function findTable(lines, headerRe, from = 0) {
  for (let i = from; i < lines.length; i++) {
    if (headerRe.test(lines[i])) {
      let end = i + 1;
      while (end + 1 < lines.length && lines[end + 1].trim().startsWith("|")) end++;
      return { header: i, end };
    }
  }
  return null;
}

export function appendTableRow(text, headerRe, cells, from = 0) {
  const lines = String(text).split("\n");
  const t = findTable(lines, headerRe, from);
  if (!t) fail("Table not found in the file; its format may have changed.");
  lines.splice(t.end + 1, 0, `| ${cells.map(cell).join(" | ")} |`);
  return lines.join("\n");
}

const splitRow = (line) => line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
const joinRow = (cells) => `| ${cells.join(" | ")} |`;
const norm = (s) => cell(s).replace(/\*\*/g, "").replace(/:$/, "").toLowerCase();

// ---------- outbox drafts ----------
export function draftStatus(text) {
  const m = String(text).match(/^Status:\s*(\S+)/m);
  return m ? m[1].toUpperCase() : null;
}

export function setDraftStatus(text, status) {
  if (!["DRAFT", "APPROVED", "SENT"].includes(status)) fail("Unknown draft status.");
  const cur = draftStatus(text);
  if (status === "SENT" && cur !== "APPROVED" && cur !== "SENT") fail("Approve the draft before marking it sent.");
  if (cur) return String(text).replace(/^Status:\s*\S+/m, `Status: ${status}`);
  return `Status: ${status}\n\n${text}`;
}

export function saveDraftText(oldText, newText) {
  if (!cell(newText)) fail("The draft is empty.");
  const status = draftStatus(oldText) || "DRAFT";
  const body = String(newText).replace(/\r\n/g, "\n");
  return draftStatus(body) ? body.replace(/^Status:\s*\S+/m, `Status: ${status}`) : `Status: ${status}\n\n${body}`;
}

export function addFounderNote(text, date, note) {
  const n = required(note, "A note for the agent");
  const lines = String(text).split("\n");
  const i = lines.findIndex((l) => /^Status:/.test(l));
  lines.splice(i + 1, 0, `Founder notes: ${date}: ${n}`);
  return lines.join("\n");
}

// ---------- leads ----------
export function setLeadStatus(text, company, status, allowBack = false) {
  if (!LEAD_STATUSES.includes(status)) fail("Unknown lead status.");
  const rows = parseCsv(text);
  const h = rows[0] || [];
  const ci = h.indexOf("company"), si = h.indexOf("status");
  if (ci < 0 || si < 0) fail("data/leads.csv header is missing company or status.");
  const row = rows.slice(1).find((r) => norm(r[ci]) === norm(company));
  if (!row) fail(`${company} is not in data/leads.csv (leads are only added by the seller).`);
  const cur = LEAD_STATUSES.indexOf(String(row[si] || "").trim().toUpperCase());
  if (cur > LEAD_STATUSES.indexOf(status) && !allowBack) {
    fail(`Moving ${company} back from ${LEAD_STATUSES[cur]} to ${status} needs the confirm box.`);
  }
  row[si] = status;
  return toCsv(rows);
}

// ---------- metrics ----------
export function cleanMetrics(values) {
  const out = {};
  for (const f of METRIC_FIELDS) {
    const v = String(values?.[f] ?? "").trim();
    if (v === "" || v === "?") { out[f] = ""; continue; }
    if (!/^\d+(\.\d+)?$/.test(v)) fail(`${f}: plain numbers only (no $, commas or units).`);
    out[f] = v;
  }
  if (Object.values(out).every((v) => v === "")) fail("Enter at least one number.");
  return out;
}

export function upsertMetricsRow(text, date, values) {
  if (!isDate(date)) fail("Date must be YYYY-MM-DD.");
  const rows = String(text ?? "").trim() ? parseCsv(text) : [METRICS_HEADER];
  if (rows[0].join(",") !== METRICS_HEADER.join(",")) fail("data/metrics_history.csv header changed; not writing.");
  const row = [date, ...METRIC_FIELDS.map((f) => values[f] ?? "")];
  const i = rows.findIndex((r, n) => n > 0 && r[0] === date);
  if (i > 0) rows[i] = row; else rows.push(row);
  const body = rows.slice(1).sort((a, b) => a[0].localeCompare(b[0]));
  return toCsv([rows[0], ...body]);
}

function weekBeforeMatches(csvText, date) {
  const rows = parseCsv(csvText).slice(1);
  const mi = METRICS_HEADER.indexOf("matches");
  const t = Date.parse(`${date}T00:00:00Z`);
  let best = null;
  for (const r of rows) {
    const d = Date.parse(`${r[0]}T00:00:00Z`);
    if (t - d >= 7 * 864e5 && r[mi] !== "" && (!best || d > best.d)) best = { d, v: Number(r[mi]) };
  }
  return best ? best.v : null;
}

export function updateMetricsMd(md, date, values, csvBefore = "") {
  const set = {};
  if (values.candidates) set["Candidate signups (total)"] = values.candidates;
  if (values.hiring_teams) set["Hiring teams signed up"] = values.hiring_teams;
  if (values.paying_teams) set["Paying hiring teams"] = values.paying_teams;
  if (values.matches) {
    const prev = weekBeforeMatches(csvBefore, date);
    set["Mutual matches (total / this week)"] = `${values.matches} / ${prev === null ? "[NEEDS DATA]" : Number(values.matches) - prev}`;
  }
  if (values.conversations && values.matches && Number(values.matches) > 0) {
    set["Match → first message rate"] = `${Math.round((1000 * Number(values.conversations)) / Number(values.matches)) / 10}%`;
  }
  if (values.hires) set["Hires made through the app"] = values.hires;
  if (values.mrr) set["MRR"] = `$${values.mrr}`;
  const src = `founder via /log-metrics ${date}`;
  let out = String(md).split("\n").map((line) => {
    if (!line.trim().startsWith("|")) return line;
    const c = splitRow(line);
    return c[0] in set ? joinRow([c[0], set[c[0]], src]) : line;
  }).join("\n");
  out = /^Last updated:.*$/m.test(out) ? out.replace(/^Last updated:.*$/m, `Last updated: ${date}`) : out;
  return out;
}

// ---------- decisions ----------
export function addDecision(text, { date, decision, choice, reason, revisit }) {
  const row = [date, required(decision, "Decision"), required(choice, "Your choice"), required(reason, "Reason"),
    cell(revisit) || "-"];
  const lines = appendTableRow(text, /^\|\s*date\s*\|\s*decision\s*\|/i, row).split("\n");
  const os = lines.findIndex((l) => /^##\s+Open decisions/i.test(l));
  if (os >= 0) {
    for (let i = os + 1; i < lines.length && !/^##\s/.test(lines[i]); i++) {
      const m = lines[i].match(/^\s*-\s+\*\*(.+?)\*\*/);
      if (m && norm(m[1]) === norm(decision)) { lines.splice(i, 1); break; }
    }
  }
  return lines.join("\n");
}

export function setDeckDate(claudeMd, date) {
  if (!isDate(date)) fail("Deck deadline must be a date (YYYY-MM-DD).");
  const lines = String(claudeMd).split("\n");
  const s = lines.findIndex((l) => /^##\s+Current priorities/i.test(l));
  if (s < 0) fail("CLAUDE.md has no Current priorities section.");
  for (let i = s + 1; i < lines.length && !/^##\s/.test(lines[i]); i++) {
    if (lines[i].includes("[DATE]")) { lines[i] = lines[i].replace("[DATE]", date); return lines.join("\n"); }
  }
  fail("No [DATE] left in CLAUDE.md Current priorities.");
}

// ---------- exit readiness ----------
export function setStartDate(text, date) {
  if (!isDate(date)) fail("Start date must be YYYY-MM-DD.");
  if (!/^Start date:.*$/m.test(text)) fail("docs/exit-readiness.md has no 'Start date:' line.");
  return String(text).replace(/^Start date:.*$/m, `Start date: ${date}`);
}

export function setReadiness(text, item, status, evidence) {
  if (!READINESS.includes(status)) fail("Status must be DONE, IN PROGRESS, NOT STARTED or [NEEDS DATA].");
  const ev = cell(evidence);
  if (status === "DONE" && (!ev || ev === "-")) fail("DONE needs evidence: a repo path or an https link.");
  let found = false;
  const out = String(text).split("\n").map((line) => {
    if (found || !line.trim().startsWith("|")) return line;
    const c = splitRow(line);
    if (c.length >= 4 && norm(c[0]) === norm(item) && READINESS.includes(c[1].toUpperCase())) {
      found = true;
      return joinRow([c[0], status, ev || c[2], ...c.slice(3)]);
    }
    return line;
  }).join("\n");
  if (!found) fail(`'${item}' was not found in docs/exit-readiness.md.`);
  return out;
}

// ---------- feedback / objections ----------
export function addFeedback(text, { date, source, who, said, filedTo, action }) {
  if (!FEEDBACK_SOURCES.includes(source)) fail("Source must be reply, call, user comment or investor.");
  assertNoPersonal(who, said, action);
  return appendTableRow(text, /^\|\s*date\s*\|\s*source\s*\|/i,
    [date, source, required(who, "Company or person's role"), required(said, "What they said"), cell(filedTo) || "-",
      cell(action) || "none"]);
}

export function addObjection(text, { objection, type, answer }) {
  const kind = type === "investor" ? "investor" : "sales";
  assertNoPersonal(objection, answer);
  const lines = String(text).split("\n");
  const sec = lines.findIndex((l) => /^##\s/.test(l) && l.toLowerCase().includes(kind));
  return appendTableRow(text, /^\|\s*Objection\s*\|/i,
    [`"${required(objection, "Objection").replace(/^"|"$/g, "")}"`, kind,
      cell(answer) || "[NEEDS DATA]: answer to be drafted by the seller", ""], Math.max(0, sec));
}
