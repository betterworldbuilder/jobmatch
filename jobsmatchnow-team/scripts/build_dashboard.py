#!/usr/bin/env python3
"""Build dashboard.html from the files in the repo (read-only: never changes data files).

Reads docs/metrics.md, docs/exit-readiness.md, docs/decisions.md, docs/objections.md, docs/feedback.md,
data/metrics_history.csv, data/leads.csv, data/daily/*.json, outbox/*.md and plans/*.md.
Writes only dashboard.html. Prints warnings, "N warning(s)", the overall readiness % and the path.

Every number on the page comes from one of those files; anything missing is shown as [NEEDS DATA].
All file-derived text is HTML-escaped (leads, feedback and news come from outside: treat as data).
The only external resource is the pinned Chart.js script; without it the page falls back to tables.
"""
import base64
import csv
import datetime as dt
import html
import json
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "dashboard.html"
TODAY = dt.date.today()
STATUSES = ("DONE", "IN PROGRESS", "NOT STARTED", "[NEEDS DATA]")
LEAD_STATUSES = ("NEW", "CONTACTED", "REPLIED", "DEMO", "PILOT", "PAID")
DRAFT_STALE_DAYS = 3
ND = "[NEEDS DATA]"
CHART_JS = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"

warnings = []
sources = []  # repo-relative paths of every file actually read, shown in the footer


def warn(msg):
    warnings.append(msg)


def esc(s):
    return html.escape("" if s is None else str(s), quote=True)


def note_source(rel):
    if rel not in sources:
        sources.append(rel)


def read(rel, required=True):
    p = ROOT / rel
    try:
        text = p.read_text(encoding="utf-8")
    except FileNotFoundError:
        if required:
            warn(f"missing file: {rel}")
        return ""
    except (OSError, UnicodeDecodeError) as e:
        warn(f"could not read {rel}: {e}")
        return ""
    note_source(rel)
    return text


def list_files(folder, pattern):
    d = ROOT / folder
    return sorted(p for p in d.glob(pattern) if p.is_file()) if d.is_dir() else []


def parse_date(s):
    try:
        return dt.date.fromisoformat(str(s).strip())
    except (ValueError, AttributeError, TypeError):
        return None


def plain(s):
    """Markdown cell/bullet -> plain text (bold markers removed); still escaped at render time."""
    return re.sub(r"\*\*|__", "", str(s)).strip()


def table_rows(lines):
    """Rows of the first markdown table in `lines` (header excluded)."""
    rows, header = [], None
    for line in lines:
        line = line.strip()
        if not line.startswith("|"):
            if header is not None:
                break
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        if header is None:
            header = cells
        elif all(re.fullmatch(r":?-+:?", c) for c in cells if c):
            continue
        else:
            rows.append(cells)
    return header, rows


def md_sections(text):
    """{lowercased '## heading': body}."""
    parts = re.split(r"^## +(.+?)\s*$", text, flags=re.M)
    return {n.strip().lower(): b for n, b in zip(parts[1::2], parts[2::2])}


def bullets(body):
    out = []
    for line in (body or "").splitlines():
        m = re.match(r"\s*[-*]\s+(.+)$", line)
        if m:
            out.append(plain(m.group(1)))
    return out


# ---------- links: only http(s) URLs or repo paths ----------
URL_RE = re.compile(r"^(?:https?://[^\s<>\"'`]+|mailto:[^\s<>\"'`]*)$", re.I)
REPO_RE = re.compile(r"^(?:(?:docs|data|outbox|plans|scripts)/[\w./-]*|\.claude/(?:agents|commands)/[\w.-]+\.md|CLAUDE\.md)"
                     r"(?:#L\d+)?$")


def safe_href(u):
    u = u.strip() if isinstance(u, str) else ""
    if URL_RE.match(u):
        return u
    if REPO_RE.match(u) and ".." not in u:
        return u
    return None


def link(text, href):
    h = safe_href(href)
    if not h:
        return esc(text)
    ext = ' target="_blank"' if h.startswith("http") else ""
    return f'<a href="{esc(h)}" rel="noopener noreferrer"{ext}>{esc(text)}</a>'


_lines = {}


def line_of(rel, needle):
    """1-based line in a repo file that contains `needle` (case-insensitive), for #L deep links."""
    if rel not in _lines:
        try:
            _lines[rel] = (ROOT / rel).read_text(encoding="utf-8").splitlines()
        except (OSError, UnicodeDecodeError):
            _lines[rel] = []
    n = (needle or "").strip().lower()
    for i, line in enumerate(_lines[rel], 1):
        if n and n in plain(line).lower():
            return i
    return None


def at(rel, needle):
    i = line_of(rel, needle)
    return f"{rel}#L{i}" if i else rel


def btn(label, act, primary=True, **data):
    """A dashboard action button plus a direct link that reopens the same form (#act=...)."""
    attrs = " ".join(f'data-{k}="{esc(v)}"' for k, v in data.items())
    cls = "act primary" if primary else "act"
    b = f'<button type="button" class="{cls}" data-act="{esc(act)}" {attrs}>{esc(label)}</button>'
    if act == "copy":
        return b
    q = "&".join([f"act={quote(act)}"] + [f"{quote(k)}={quote(str(v))}" for k, v in data.items()])
    return b + f'<a class="deep" href="#{esc(q)}" title="Direct link to this action">link</a>'


def linkify(text):
    """Escape text and turn safe repo paths / http(s) links in it into links."""
    text = "" if text is None else str(text)
    out, last = [], 0
    for m in re.finditer(r"https?://[^\s<>\"'`)]+|\b(?:docs|data|outbox|plans|scripts)/[\w./-]*(?:#L\d+)?", text):
        tok = m.group(0).rstrip(".,;:")
        if not tok:
            continue
        out.append(esc(text[last:m.start()]))
        out.append(link(tok, tok))
        last = m.start() + len(tok)
    out.append(esc(text[last:]))
    return "".join(out)


# ---------- numbers ----------
def num(v):
    if v is None:
        return None
    s = str(v).strip()
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def fmt(v, money=False, pct=False):
    if v is None:
        return ND
    if pct:
        s = f"{v:.1f}"
        return (s[:-2] if s.endswith(".0") else s) + "%"
    s = f"{v:,.0f}" if float(v).is_integer() else f"{v:,.2f}"
    return ("$" + s) if money else s


def fmt_signed(v, pct=False):
    if v is None:
        return ND
    if pct:
        s = f"{v:+.1f}"
        return (s[:-2] if s.endswith(".0") else s) + " pts"
    return f"{v:+,.0f}" if float(v).is_integer() else f"{v:+,.2f}"


def sparkline(values):
    pts = [v for v in values if v is not None]
    if len(pts) < 2:
        return ""
    lo, hi = min(pts), max(pts)
    span = (hi - lo) or 1
    w, h = 90, 24
    step = w / (len(pts) - 1)
    coords = " ".join(f"{i * step:.1f},{h - 2 - (v - lo) / span * (h - 4):.1f}" for i, v in enumerate(pts))
    return (f'<svg class="spark" viewBox="0 0 {w} {h}" width="{w}" height="{h}" aria-hidden="true">'
            f'<polyline points="{coords}" fill="none" stroke="var(--accent)" stroke-width="2" '
            f'stroke-linejoin="round" stroke-linecap="round"/></svg>')


# ---------- metrics ----------
def load_metrics():
    text = read("docs/metrics.md")
    m = re.search(r"^Last updated:\s*(.+)$", text, re.M)
    updated = m.group(1).strip() if m else ""
    if not parse_date(updated):
        warn(f"docs/metrics.md 'Last updated' is not a date ({updated or 'missing'}) - run /log-metrics")
    return updated


def load_history():
    text = read("data/metrics_history.csv")
    if not text:
        return []
    try:
        rows = list(csv.DictReader(text.splitlines()))
    except csv.Error as e:
        warn(f"data/metrics_history.csv could not be parsed: {e}")
        return []
    if not rows:
        warn("data/metrics_history.csv has no rows yet - run /log-metrics")
    good = []
    for r in rows:
        if not parse_date(r.get("date", "")):
            warn(f"data/metrics_history.csv: bad date {r.get('date')!r}")
            continue
        for k, v in r.items():
            if k and k != "date" and v not in (None, "") and num(v) is None:
                warn(f"data/metrics_history.csv {r['date']}: '{k}' is not a plain number ({v!r})")
        good.append(r)
    good.sort(key=lambda r: parse_date(r["date"]))
    return good


def row_week_before(history, idx):
    """Index of the latest row dated at least 7 days before history[idx] (None if there is none)."""
    d0 = parse_date(history[idx]["date"])
    best = None
    for i in range(idx):
        if (d0 - parse_date(history[i]["date"])).days >= 7:
            best = i
    return best


def weekly_delta(history, field, idx):
    """(value[idx] - value[row >= 7 days older], that row's index)."""
    j = row_week_before(history, idx)
    if j is None:
        return None, None
    a, b = num(history[idx].get(field)), num(history[j].get(field))
    return (None if a is None or b is None else a - b), j


def north_star(history):
    """Weekly mutual matches that became conversations, from the `conversations` running total."""
    res = {"value": None, "prev": None, "change": None, "src": None}
    if not history:
        return res
    last = len(history) - 1
    cur, j = weekly_delta(history, "conversations", last)
    res["value"] = cur
    if j is not None:
        if cur is not None:
            res["src"] = (f"conversations {fmt(num(history[last].get('conversations')))} on {history[last]['date']} "
                          f"minus {fmt(num(history[j].get('conversations')))} on {history[j]['date']}")
        prev, _ = weekly_delta(history, "conversations", j)
        res["prev"] = prev
        if cur is not None and prev is not None:
            res["change"] = cur - prev
    return res


def reply_rate(r):
    sent, rep = num(r.get("outreach_sent")), num(r.get("replies"))
    return None if sent is None or rep is None or sent <= 0 else 100 * rep / sent


# ---------- exit readiness ----------
def pct(items):
    if not items:
        return 0
    score = sum(1 if i["status"] == "DONE" else 0.5 if i["status"] == "IN PROGRESS" else 0 for i in items)
    return round(100 * score / len(items))


def load_readiness():
    text = read("docs/exit-readiness.md")
    m = re.search(r"^Start date:\s*(.+)$", text, re.M)
    start = parse_date(m.group(1)) if m else None
    if not start:
        warn("docs/exit-readiness.md 'Start date' is not set (YYYY-MM-DD)")
    m = re.search(r"^Last reviewed:\s*(.+)$", text, re.M)
    reviewed = m.group(1).strip() if m else ND

    sections, path = [], []
    parts = re.split(r"^## +(.+)$", text, flags=re.M)
    for name, body in zip(parts[1::2], parts[2::2]):
        name = name.strip()
        if name.lower() == "path to acquisition":
            for line in body.splitlines():
                pm = re.match(r"\s*\d+\.\s*\[( |x|X)\]\s*(.+)$", line)
                if pm:
                    cells = [c.strip() for c in pm.group(2).split("|")]
                    meta = {k.strip(): v.strip() for k, _, v in (c.partition(":") for c in cells[1:])}
                    path.append({"done": pm.group(1).lower() == "x", "milestone": cells[0],
                                 "evidence": meta.get("evidence", "-"), "owner": meta.get("owner", "")})
            continue
        header, rows = table_rows(body.splitlines())
        if not header or [h.lower() for h in header[:4]] != ["item", "status", "evidence", "owner"]:
            continue
        items = []
        for n, r in enumerate(rows):
            r += [""] * (4 - len(r))
            status = r[1].upper() if r[1].upper() in STATUSES else ND
            if status != r[1].upper():
                warn(f"exit-readiness '{name}': unknown status {r[1]!r} for '{r[0]}' (read as [NEEDS DATA])")
            if status == "DONE" and r[2] in ("", "-"):
                warn(f"exit-readiness '{name}': '{r[0]}' is DONE without evidence")
            items.append({"item": r[0], "status": status, "evidence": r[2], "owner": r[3],
                          "section": name, "order": n})
        sections.append({"name": name, "items": items, "pct": pct(items)})
    all_items = [i for s in sections for i in s["items"]]
    return start, reviewed, sections, path, pct(all_items), len(all_items)


# ---------- outbox ----------
VERDICT_RE = re.compile(r"\s*`?(.+?)\s+[—-]+\s+(PASS|BLOCK)\s+[—-]+\s+(.*?)`?\s*$")


def load_outbox():
    drafts, verdicts, review_log = [], {}, []
    for p in list_files("outbox", "*.md"):
        rel = f"outbox/{p.name}"
        text = read(rel)
        d = parse_date(p.name[:10])
        if "_reviewer_daily" in p.stem:
            for line in text.splitlines():
                vm = VERDICT_RE.match(line)
                if vm:
                    item = vm.group(1).strip()
                    verdicts[item] = (vm.group(2), vm.group(3).strip(), p.name)
                    review_log.append({"file": p.name, "date": d, "item": item,
                                       "verdict": vm.group(2), "note": vm.group(3).strip()})
            continue
        sm = re.search(r"^Status:\s*(\S+)", text, re.M)
        status = sm.group(1).upper() if sm else "?"
        if not sm:
            warn(f"outbox/{p.name} has no 'Status:' line")
        tm = re.search(r"^#\s+(.+)$", text, re.M)
        sup = re.search(r"^\W*(Superseded\b.*)$", "\n".join(text.splitlines()[:10]), re.M | re.I)
        # Message drafts start with a header block (Status/To/Channel/Send on/Subject) before the first blank line.
        hdr = {}
        for line in text.split("\n\n", 1)[0].splitlines():
            km = re.match(r"(To|Channel|Send on|Subject|Blocked):\s*(.+)$", line)
            if km:
                hdr[km.group(1).lower()] = km.group(2).strip()
        parts = p.stem.split("_")
        if hdr.get("to"):
            title = f"{hdr.get('channel', 'Message')} to {hdr['to']}" + (f": {hdr['subject']}" if hdr.get("subject") else "")
        else:
            title = tm.group(1).strip() if tm else p.stem
        drafts.append({"file": p.name, "stem": p.stem, "status": status, "date": d,
                       "age": (TODAY - d).days if d else None,
                       "agent": parts[1] if len(parts) > 2 else "?",
                       "title": title, "to": hdr.get("to", ""), "channel": hdr.get("channel", ""),
                       "send_on": hdr.get("send on", ""), "subject": hdr.get("subject", ""), "blocked": hdr.get("blocked", ""),
                       "superseded": plain(sup.group(1)) if sup else None})
    for dr in drafts:
        dr["verdict"] = verdicts.get(dr["stem"])
        if (dr["status"] == "DRAFT" and not dr["superseded"] and dr["age"] is not None
                and dr["age"] > DRAFT_STALE_DAYS):
            warn(f"outbox/{dr['file']} is DRAFT for {dr['age']} days - approve or delete")
        if dr["verdict"] and dr["verdict"][0] == "BLOCK":
            warn(f"outbox/{dr['file']} was BLOCKed by the reviewer: {dr['verdict'][1]}")
    review_log.sort(key=lambda v: (v["file"]), reverse=True)
    return drafts, review_log


# ---------- leads ----------
def load_leads():
    text = read("data/leads.csv")
    try:
        rows = list(csv.DictReader(text.splitlines())) if text else []
    except csv.Error as e:
        warn(f"data/leads.csv could not be parsed: {e}")
        rows = []
    for i, r in enumerate(rows, start=2):
        if None in r:
            warn(f"data/leads.csv line {i}: too many fields (quote fields that contain commas)")
        st = (r.get("status") or "").strip().upper()
        if st not in LEAD_STATUSES:
            warn(f"data/leads.csv line {i}: unknown status {r.get('status')!r} (use NEW/CONTACTED/REPLIED/DEMO/PILOT/PAID)")
    return rows


# ---------- daily runs ----------
def as_list(v):
    if isinstance(v, list):
        return [str(x) for x in v if isinstance(x, (str, int, float)) and str(x).strip()]
    if isinstance(v, str) and v.strip():
        return [v]
    return []


def as_dicts(v):
    return [x for x in v if isinstance(x, dict)] if isinstance(v, list) else []


def load_daily():
    files = list_files("data/daily", "*.json")
    for p in reversed(files):
        rel = f"data/daily/{p.name}"
        try:
            data = json.loads(read(rel) or "null")
        except json.JSONDecodeError as e:
            warn(f"{rel} is not valid JSON ({e.msg}, line {e.lineno})")
            continue
        if not isinstance(data, dict):
            warn(f"{rel} is not a JSON object")
            continue
        return p.name, data, len(files)
    return None, None, len(files)


# ---------- plans / weekly review ----------
def load_review():
    files = list_files("plans", "*.md")
    review = next((p for p in reversed(files) if p.stem.endswith("_review")), None)
    out = {"file": None, "goals": [], "done": [], "learnings": []}
    if not review:
        return out
    secs = md_sections(read(f"plans/{review.name}"))
    out["file"] = review.name
    _, out["goals"] = table_rows(secs.get("goal vs result", "").splitlines())
    for b in bullets(secs.get("done per agent", "")):
        who, sep, what = b.partition(":")
        out["done"].append((who.strip(), what.strip()) if sep else ("", b))
    out["learnings"] = bullets(secs.get("learnings", ""))
    return out


# ---------- objections / feedback / decisions ----------
def load_objections():
    out = []
    for name, body in md_sections(read("docs/objections.md")).items():
        header, rows = table_rows(body.splitlines())
        if not header or header[0].lower() != "objection":
            continue
        wi = next((i for i, c in enumerate(header) if "worked" in c.lower()), None)
        for r in rows:
            r += [""] * (len(header) - len(r) if len(header) > len(r) else 0) + [""] * 2
            kind = r[1] or ("investor" if "investor" in name else "sales")
            worked = plain(r[wi]) if wi is not None else ""
            out.append({"objection": plain(r[0]).strip('"'), "type": kind, "worked": worked})
    return out


def load_feedback():
    _, rows = table_rows(read("docs/feedback.md").splitlines())
    return [r + [""] * (6 - len(r)) for r in rows]


def load_open_decisions():
    return bullets(md_sections(read("docs/decisions.md")).get("open decisions", ""))


def load_decision_rows():
    _, rows = table_rows(read("docs/decisions.md").splitlines())
    return [r + [""] * (5 - len(r)) for r in rows]


# ---------- team: members, 7-day activity, plan tasks, priorities ----------
MEMBERS = ["Founder", "builder", "reviewer", "marketer", "seller", "fundraiser", "designer", "advisor", "chief-of-staff"]
MEMBER_LABEL = {"Founder": "Founder (CEO)", "chief-of-staff": "Chief of Staff (main session)",
                "builder": "Bui (builder)", "reviewer": "Rev (reviewer)", "marketer": "Mark (marketer)",
                "seller": "Selly (seller)", "fundraiser": "Rizer (fundraiser)", "designer": "Desi (designer)",
                "advisor": "Avi (board advisor)"}
# Human names from CLAUDE.md "Team names"; plans and logs may use either the name or the agent id.
NAME_TO_AGENT = {"bui": "builder", "rev": "reviewer", "mark": "marketer", "selly": "seller", "rizer": "fundraiser",
                 "desi": "designer", "avi": "advisor"}
AGENT_RE = ("builder|reviewer|marketer|seller|fundraiser|designer|advisor|founder|ceo|chief-of-staff"
            "|bui|rev|mark|selly|rizer|desi|avi")
WINDOW = 7  # days, including today
SINCE = TODAY - dt.timedelta(days=WINDOW - 1)


def member_key(s):
    s = plain(s or "").strip().lower()
    s = re.sub(r"\s*\(.*\)$", "", s) if not s.startswith("founder") else s  # "Selly (seller)" -> "selly"
    s = NAME_TO_AGENT.get(s, s)
    if s in ("founder", "ceo", "founder (ceo)"):
        return "Founder"
    if s in ("chief of staff", "chief-of-staff", "main", "main session"):
        return "chief-of-staff"
    return s if s in MEMBERS else None


def in_window(d):
    return d is not None and SINCE <= d <= TODAY


def load_activity():
    """data/activity.csv: one row per agent task, appended by the main session (date,agent,task,output,handoff_to)."""
    text = read("data/activity.csv", required=False)
    if not text:
        return []
    try:
        rows = list(csv.DictReader(text.splitlines()))
    except csv.Error as e:
        warn(f"data/activity.csv could not be parsed: {e}")
        return []
    return [r for r in rows if parse_date(r.get("date"))]


# ---------- vision timeline, team board, team meetings ----------
TL_MEMBERS = [("founder", "Founder"), ("builder", "Bui"), ("reviewer", "Rev"), ("marketer", "Mark"),
              ("seller", "Selly"), ("fundraiser", "Rizer")]
TL_NAME = dict(TL_MEMBERS) | {"designer": "Desi", "advisor": "Avi", "Founder": "Founder", "team": "Team"}
BOARD_TYPES = ("result", "feedback", "blocker", "proposal", "urgent")
URGENT_STATUS = {"REQUESTED": "mid", "IN SESSION": "mid", "AWAITING CEO": "bad", "DECIDED": "ok"}
SPEAKERS = {"founder": "F", "bui": "B", "rev": "R", "mark": "M", "selly": "S", "rizer": "R", "desi": "D", "avi": "A",
            "chief of staff": "C"}


def load_urgent():
    """plans/urgent/*.md, newest first: header fields + sections of each urgent meeting."""
    out = []
    for p in reversed(list_files("plans/urgent", "*.md")):
        text = read(f"plans/urgent/{p.name}")
        head = {k.lower(): v.strip() for k, v in re.findall(r"^(Date|Requested by|Status):\s*(.+)$", text, flags=re.M)}
        title = re.search(r"^# +Urgent meeting\s*[—-]\s*(.+)$", text, flags=re.M)
        st = head.get("status", "").upper()
        if st not in URGENT_STATUS:
            warn(f"plans/urgent/{p.name}: unknown Status {head.get('status')!r}")
        out.append({"file": p.name, "subject": title.group(1).strip() if title else p.stem, "status": st,
                    "date": head.get("date", ""), "by": head.get("requested by", ""), "secs": md_sections(text)})
    return out


def render_urgent(meetings):
    req = ("/urgent-meeting <subject> | <problem to solve> | <desired output>")
    intro = ("<p class='muted'>Anyone can call one: an agent posts an <code>urgent</code> row on the team board, you type "
             f"<code>{esc(req)}</code>. Every member speaks in order; you decide the final action.</p>")
    if not meetings:
        return ""
    cards = []
    for m in meetings:
        s = m["secs"]
        turns = []
        for b in bullets(s.get("discussion", "")):
            who, sep, said = b.partition(":")
            key = who.strip().lower()
            if sep and key in SPEAKERS:
                turns.append(f"<li class='turn'><span class='av' aria-hidden='true'>{SPEAKERS[key]}</span>"
                             f"<div><b>{esc(who.strip())}</b><p>{esc(said.strip())}</p></div></li>")
            else:
                turns.append(f"<li class='turn'><div><p>{esc(b)}</p></div></li>")
        chat = f"<ol class='chat'>{''.join(turns)}</ol>" if turns else empty("Nobody has spoken yet.")
        decision = md_block(s.get("ceo decision", ""))
        rec = md_block(s.get("chief of staff recommendation", ""))
        if m["status"] == "DECIDED":
            ceo = f"<div class='ceo done'><h4>CEO decision</h4>{decision or empty('missing')}</div>" \
                  + (f"<h4>Actions</h4>{list_html(bullets(s.get('actions', '')))}" if s.get("actions") else "")
        elif m["status"] == "AWAITING CEO":
            ceo = (f"<div class='ceo'><h4>Your call</h4>{rec}<p>Decide with "
                   f"<code>/urgent-meeting decide plans/urgent/{esc(m['file'])} &lt;A|B|your words&gt;</code></p></div>")
        else:
            ceo = (f"<p>Start it with <code>/urgent-meeting run plans/urgent/{esc(m['file'])}</code></p>"
                   if m["status"] == "REQUESTED" else "")
        body = (f"<p><span class='badge {URGENT_STATUS.get(m['status'], 'na')}'>{esc(m['status'] or ND)}</span> "
                f"<span class='muted'>{esc(m['date'])} · requested by {esc(m['by'] or ND)}</span></p>"
                f"<div class='cols'><div><h4>Problem to solve</h4>{md_block(s.get('problem to solve', '')) or empty('missing')}</div>"
                f"<div><h4>Desired output</h4>{md_block(s.get('desired output', '')) or empty('missing')}</div></div>"
                f"<h4>Discussion, in speaking order</h4>{chat}"
                + (f"<h4>Options</h4>{list_html(bullets(s.get('options', '')))}" if s.get("options") else "")
                + ceo)
        open_ = m["status"] != "DECIDED"
        cards.append(f"<details class='card wide urgent'{' open' if open_ else ''}><summary><b>{esc(m['subject'])}</b> "
                     f"<small>{link(m['file'], 'plans/urgent/' + m['file'])}</small></summary>{body}</details>")
    n_open = sum(1 for m in meetings if m["status"] != "DECIDED")
    return (f'<section id="urgent"><h2>Urgent meetings <small>{n_open} open · plans/urgent/</small></h2>'
            f'<div class="grid"><div class="card wide">{intro}</div>{"".join(cards)}</div></section>')


def load_csv(rel):
    text = read(rel, required=False)
    if not text:
        return []
    try:
        rows = list(csv.DictReader(text.splitlines()))
    except csv.Error as e:
        warn(f"{rel} could not be parsed: {e}")
        return []
    for i, r in enumerate(rows, start=2):
        if None in r:
            warn(f"{rel} line {i}: too many fields (quote fields that contain commas)")
    return rows


def load_timeline():
    """data/timeline.csv: the 36-month reverse timeline, newest stage first."""
    rows = load_csv("data/timeline.csv")
    for r in rows:
        st = (r.get("status") or "").strip().upper()
        if st not in STATUSES:
            warn(f"data/timeline.csv stage {r.get('stage')!r}: unknown status {r.get('status')!r}")
            st = ND
        r["status"] = st
    return rows


def load_board():
    """data/team_board.csv: results, feedback, blockers and proposals between agents, newest first."""
    rows = [r for r in load_csv("data/team_board.csv") if parse_date(r.get("date"))]
    for r in rows:
        if (r.get("type") or "").strip().lower() not in BOARD_TYPES:
            warn(f"data/team_board.csv: unknown type {r.get('type')!r} (use {'/'.join(BOARD_TYPES)})")
    return list(reversed(rows))


def load_meeting():
    files = list_files("plans/meetings", "*.md")
    if not files:
        return None, {}
    p = files[-1]
    secs = md_sections(read(f"plans/meetings/{p.name}"))
    return p.name, {k: bullets(v) for k, v in secs.items()}


def board_line(r):
    who = lambda k: TL_NAME.get((k or "").strip(), (k or "").strip())
    typ = (r.get("type") or "").strip().lower()
    cls = {"blocker": "bad", "urgent": "bad", "proposal": "mid", "result": "ok"}.get(typ, "na")
    msg = esc(r.get("message"))
    lk = r.get("link") or ""
    if safe_href(lk):
        msg += " " + link("→ file", lk)
    return (f"<span class='muted'>{esc(r.get('date'))}</span> <b>{esc(who(r.get('from')))} → {esc(who(r.get('to')))}</b> "
            f"<span class='badge {cls}'>{esc(typ)}</span> {msg}")


def load_team():
    """data/team.csv: who is on the team and how each member describes their role, in their own words."""
    return [r for r in load_csv("data/team.csv") if (r.get("id") or "").strip()]


def stage_cell(r, cur):
    if r["status"] == "DONE":
        tag = "<span class='badge ok'>✓ Done</span>"
    elif r is cur:
        tag = "<span class='badge bad'>⚑ You are here</span>"
    else:
        tag = "<span class='badge no'>🔒 Imagined</span>"
    return f"<b>{esc(r.get('stage'))}</b> <span class='muted'>{esc(r.get('when'))}</span><br>{tag}"


def render_full_timeline(timeline, board, cur):
    """Every stage left to right (Day 1 → M36), one lane per member, then the compound effect and live progress."""
    stages = list(reversed(timeline))  # data/timeline.csv is newest first; the map reads forward
    lanes = TL_MEMBERS + [("designer", "Desi")]

    def cls(r):
        return "cur" if r is cur else "done" if r["status"] == "DONE" else "future"

    def row(label, cells, extra=""):
        return (f"<tr class='{extra}'><th scope='row'>{label}</th>"
                + "".join(f"<td class='{cls(r)}'>{c}</td>" for r, c in zip(stages, cells)) + "</tr>")

    head = "<tr><th scope='col'>Stage</th>" + "".join(f"<th scope='col' class='{cls(r)}'>{stage_cell(r, cur)}</th>"
                                                       for r in stages) + "</tr>"
    body = []
    for k, name in lanes:
        body.append(row(esc(name), [esc(r.get(k)) if (r.get(k) or "").strip() else f"<span class='nd'>{ND}</span>"
                                    for r in stages]))
    body.append(row("Compound effect", [f"<i>{esc(r.get('compound'))}</i>" for r in stages], "comp"))
    prog = []
    for r in stages:
        items = [p.strip() for p in (r.get("progress") or "").split("|") if p.strip()]
        sb = [b for b in board if b.get("stage") == r.get("stage")]
        n = {t: sum(1 for b in sb if (b.get("type") or "").lower() == t) for t in BOARD_TYPES}
        counts = " · ".join(f"{v} {t}" for t, v in n.items() if v)
        prog.append(("<ul class='list'>" + "".join(f"<li>{esc(p)}</li>" for p in items) + "</ul>" if items else "")
                    + (f"<span class='muted'>board: {esc(counts)}</span>" if counts else "")
                    or "<span class='muted'>-</span>")
    body.append(row("Progress now", prog, "prog"))
    if not stages:
        return empty("No data/timeline.csv yet.")
    return f'<div class="tw tlmap"><table class="tl"><thead>{head}</thead><tbody>{"".join(body)}</tbody></table></div>'


def render_team_intro(team, timeline, board, cur, steps=()):
    if not team:
        return empty("No data/team.csv yet.")
    out = []
    for m in team:
        k = m["id"].strip()
        mine = [f"{s.get('step')}. {s.get('title')}" for s in steps if any(a == m.get("name", "").strip() for a, _ in s["actors"])]
        goal = (cur or {}).get(k, "") if cur else ""
        last = next((b for b in board if (b.get("from") or "").strip() in (k, m.get("name", "").strip())
                     and (b.get("type") or "").lower() == "result"), None)
        out.append(
            f"<div class='card intro'><div class='who'><span class='av' aria-hidden='true'>{esc(m.get('name', '?')[:1])}</span>"
            f"<div><h3>{esc(m.get('name'))}</h3><span class='muted'>{esc(m.get('title'))}</span></div></div>"
            f"<p class='quote'>“{esc(m.get('intro'))}”</p>"
            + (f"<p><span class='muted'>Steps in at:</span> {esc(' · '.join(mine))}</p>" if mine else "")
            + (f"<p><span class='muted'>Now ({esc((cur or {}).get('stage', ND))}):</span> {esc(goal)}</p>"
               if goal.strip() else "")
            + (f"<p class='muted small'>Latest: {esc(last.get('message'))}</p>" if last else "")
            + "</div>")
    return "".join(out)


MD_LINK = re.compile(r"\[([^\]]+)\]\(([^)\s]+)\)|(https?://[^\s<>\"')]+)")


def inline_md(s):
    """Escape a markdown line, keeping **bold**, `code`, [text](url) and bare URLs (safe hrefs only)."""
    out, pos = [], 0
    for m in MD_LINK.finditer(s):
        out.append(esc(s[pos:m.start()]))
        out.append(link(m.group(1), m.group(2)) if m.group(1) else link(m.group(3), m.group(3)))
        pos = m.end()
    out.append(esc(s[pos:]))
    h = "".join(out)
    h = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", h)
    return re.sub(r"`([^`]+)`", r"<code>\1</code>", h)


def md_block(body):
    """Paragraphs, '- ' bullets and '1. ' steps from a docs/company.md section."""
    html_, lst = [], None
    for line in (body or "").strip().splitlines():
        m = re.match(r"\s*(?:([-*])|(\d+)\.)\s+(.*)$", line)
        kind = ("ul" if m.group(1) else "ol") if m else None
        if kind != lst:
            if lst:
                html_.append(f"</{lst}>")
            if kind:
                html_.append(f"<{kind} class='list'>")
            lst = kind
        if m:
            html_.append(f"<li>{inline_md(m.group(3))}</li>")
        elif line.strip():
            html_.append(f"<p>{inline_md(line.strip())}</p>")
    if lst:
        html_.append(f"</{lst}>")
    return "".join(html_)


def render_company():
    """docs/company.md: the company page at the top (business, problem, for who, how, market, mission, product)."""
    secs = md_sections(read("docs/company.md", required=False))
    if not secs:
        return ""
    get = lambda k: md_block(secs.get(k, "")) or f"<p class='nd'>{ND}</p>"
    grid = "".join(f"<div class='card'><h3>{esc(t)}</h3>{get(k)}</div>" for t, k in [
        ("The problem we solve", "the problem we solve"), ("For who", "for who"),
        ("How it works", "how it works"), ("Market potential", "market potential")])
    return ('<section id="company"><h2>JobsMatchNow <small>company page · docs/company.md</small></h2>'
            f'<div class="grid"><div class="card wide biz"><h3>The business we build</h3>{get("the business")}</div>{grid}'
            f'<div class="card wide mission"><h3>Our mission</h3>{get("our mission")}</div>'
            f'<div class="card wide"><h3>Our products</h3>{get("our product")}</div></div></section>')


MEETING_TYPE_CLS = {"urgent": "bad", "team": "ok", "weekly": "na", "deadline": "mid", "advisor": "na"}
MEETING_STATUS_CLS = {"PROPOSED": "mid", "SCHEDULED": "na", "AWAITING CEO": "bad", "DECIDED": "ok", "DONE": "ok"}


def load_meetings():
    """data/meetings.csv: every meeting and deadline on the team calendar."""
    rows = [r for r in load_csv("data/meetings.csv") if parse_date(r.get("date"))]
    for r in rows:
        r["_d"] = parse_date(r["date"])
        r["status"] = (r.get("status") or "").strip().upper()
    return sorted(rows, key=lambda r: (r["_d"], r.get("time") or ""))


def month_grid(year, month, meetings):
    first = dt.date(year, month, 1)
    start = first - dt.timedelta(days=first.weekday())
    nxt = (first.replace(day=28) + dt.timedelta(days=4)).replace(day=1)
    cells, d = [], start
    while d < nxt or d.weekday() != 0:
        chips = "".join(
            f"<a class='chip {MEETING_TYPE_CLS.get(m.get('type'), 'na')}' href='#mt-{esc(m['id'])}' title='{esc(m.get('subject'))}'>"
            f"{esc((m.get('time') or '') + ' ' + (m.get('subject') or ''))}</a>" for m in meetings if m["_d"] == d)
        cls = " ".join(c for c in ["out" if d.month != month else "", "today" if d == TODAY else ""] if c)
        cells.append(f"<div class='day {cls}'><span class='dn'>{d.day}</span>{chips}</div>")
        d += dt.timedelta(days=1)
    head = "".join(f"<div class='dh'>{x}</div>" for x in ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"])
    return f"<div class='cal'><h4>{first.strftime('%B %Y')}</h4><div class='calg'>{head}{''.join(cells)}</div></div>"


def meeting_card(m):
    typ, st = m.get("type") or "", m["status"]
    run = {"urgent": f"/urgent-meeting run {m.get('file') or m['id']}", "team": "/team-meeting",
           "weekly": (m.get("subject") or "").strip()}.get(typ, "")
    if typ == "urgent" and not m.get("file"):
        run = f"/urgent-meeting {m.get('subject')} | {m.get('problem')} | {m.get('desired_output')}"
    acts = []
    if st in ("PROPOSED", "SCHEDULED", "AWAITING CEO") and run:
        acts.append(copy_btn(run))
    if st in ("PROPOSED", "AWAITING CEO") and typ != "deadline":
        acts.append(btn("Decide final action", "meeting-decide", id=m["id"]))
    body = (f"<p><span class='badge {MEETING_TYPE_CLS.get(typ, 'na')}'>{esc(typ)}</span> "
            f"<span class='badge {MEETING_STATUS_CLS.get(st, 'na')}'>{esc(st or ND)}</span> "
            f"<b>{esc(m['date'])} {esc(m.get('time') or '')}</b> · requested by {esc(m.get('requested_by') or ND)}"
            + (f" · {link('file', m['file'])}" if safe_href(m.get("file") or "") else "") + "</p>")
    if (m.get("problem") or "").strip():
        body += f"<p><span class='muted'>Problem to solve:</span> {esc(m.get('problem'))}</p>"
    if (m.get("desired_output") or "").strip():
        body += f"<p><span class='muted'>Desired output:</span> {esc(m.get('desired_output'))}</p>"
    if (m.get("decision") or "").strip():
        body += f"<div class='ceo done'><h4>CEO decision (final next action)</h4><p>{esc(m.get('decision'))}</p></div>"
    if acts:
        body += f"<p class='mtacts'>{''.join(acts)}</p>"
    return f"<div class='card mt' id='mt-{esc(m['id'])}'><h3>{esc(m.get('subject'))}</h3>{body}</div>"


def render_meetings(meetings, urgent_html):
    nxt_m = (TODAY.replace(day=28) + dt.timedelta(days=4)).replace(day=1)
    cal = month_grid(TODAY.year, TODAY.month, meetings) + month_grid(nxt_m.year, nxt_m.month, meetings)
    legend = " ".join(f"<span class='chip {c}'>{t}</span>" for t, c in MEETING_TYPE_CLS.items())
    open_ = [m for m in meetings if m["status"] in ("PROPOSED", "AWAITING CEO")]
    upcoming = [m for m in meetings if m["_d"] >= TODAY and m not in open_ and m["status"] not in ("DECIDED", "DONE")]
    past = [m for m in meetings if m not in open_ and m not in upcoming]
    intro = (f"<p>{btn('Propose a meeting', 'meeting-propose')} <span class='muted'>Any member can propose one with a "
             "subject, the problem to solve and the desired output. Agents propose with an <code>urgent</code> row on the team "
             "board. Every member speaks in order (<code>/urgent-meeting</code> or <code>/team-meeting</code>); the CEO decides "
             "the final next action.</span></p>")
    return ('<section id="meetings"><h2>Meetings <small>calendar, proposals and CEO decisions · data/meetings.csv</small></h2>'
            f'<div class="grid"><div class="card wide">{intro}<div class="cals">{cal}</div><p class="muted">{legend}</p></div>'
            f'<div class="card wide"><h3>Needs your decision ({len(open_)})</h3>'
            + (f"<div class='grid'>{''.join(meeting_card(m) for m in open_)}</div>" if open_ else empty("Nothing waiting."))
            + f'</div><div class="card wide"><h3>Coming up ({len(upcoming)})</h3>'
            + (f"<div class='grid'>{''.join(meeting_card(m) for m in upcoming)}</div>" if upcoming else empty("Nothing scheduled."))
            + "</div>"
            + (f"<details class='card wide'><summary><b>Past and decided ({len(past)})</b></summary><div class='grid'>"
               f"{''.join(meeting_card(m) for m in reversed(past))}</div></details>" if past else "")
            + f"</div></section>{urgent_html}")


MEMBER_NAMES = ["Founder", "Bui", "Rev", "Mark", "Selly", "Rizer", "Desi", "Avi"]
DECISION_LOOP = [("Agents draft", "outbox/, Status: DRAFT"), ("Rev checks", "PASS or BLOCK"),
                 ("Team board", "results, feedback, blockers"), ("Meeting", "every member speaks in order"),
                 ("Avi advises", "back, challenge or kill"), ("Founder decides", "/ceo · docs/decisions.md"),
                 ("Founder sends", "by hand; nothing is automated")]


def load_workflow():
    """data/workflow.csv: the business workflow, one row per step, actors in the order they act."""
    steps = []
    for r in load_csv("data/workflow.csv"):
        actors = []
        for part in (r.get("actors") or "").split("|"):
            who, sep, what = part.partition(":")
            if sep and who.strip() in MEMBER_NAMES:
                actors.append((who.strip(), what.strip()))
            elif part.strip():
                warn(f"data/workflow.csv step {r.get('step')}: '{part.strip()[:30]}' is not 'Member: action'")
        steps.append({**r, "actors": actors})
    return steps


def render_workflow(steps):
    if not steps:
        return empty("No data/workflow.csv yet.")
    cards = []
    for i, s in enumerate(steps):
        who = "".join(f"<li><span class='av sm' aria-hidden='true'>{esc(n[:1])}</span><div><b>{esc(n)}</b> "
                      f"<span>{esc(a)}</span></div></li>" for n, a in s["actors"])
        cards.append(f"<div class='wf-step'><div class='wf-n'>{esc(s.get('step'))}</div><h3>{esc(s.get('title'))}</h3>"
                     f"<p class='muted'>{esc(s.get('goal'))}</p><ol class='wf-who'>{who}</ol>"
                     f"<p class='wf-out'><span class='muted'>Output →</span> {esc(s.get('output'))}</p></div>"
                     + ("<div class='wf-arrow' aria-hidden='true'>→</div>" if i < len(steps) - 1 else ""))
    # who steps in where: one row per member, a dot per step
    head = "<tr><th scope='col'>Member</th>" + "".join(f"<th scope='col'>{esc(s.get('step'))}. {esc(s.get('title'))}</th>"
                                                      for s in steps) + "</tr>"
    rows = ""
    for n in MEMBER_NAMES:
        cells = "".join(f"<td>{'●' if any(a == n for a, _ in s['actors']) else ''}</td>" for s in steps)
        rows += f"<tr><th scope='row'>{esc(n)}</th>{cells}</tr>"
    matrix = f"<div class='tw'><table class='wf-mx'><thead>{head}</thead><tbody>{rows}</tbody></table></div>"
    loop = "".join(f"<li><b>{esc(t)}</b><span class='muted'>{esc(d)}</span></li>" for t, d in DECISION_LOOP)
    return (f"<div class='card wide'><h3>The business, end to end <small>read left to right · each member in the order "
            f"they act · data/workflow.csv</small></h3><div class='wf'>{''.join(cards)}</div></div>"
            f"<div class='card wide'><h3>Who steps in where</h3>{matrix}</div>"
            f"<div class='card wide'><h3>How every step is decided <small>the same loop for every output</small></h3>"
            f"<ol class='loopstrip'>{loop}</ol><p class='muted'>↻ then back to the first box. Agents never send, post or "
            f"spend; the Founder does, by hand.</p></div>")


CREW_ALT = ("The JobsMatchNow crew on one sailing ship: the Founder as captain at the wheel, Avi the advisor beside with a map, "
            "Mark the signal officer raising flags, Rev the lookout in the crow's nest, Rizer the navigator and purser with a "
            "chest, Selly the bosun throwing a line to a 'US startups' boat, Bui the ship's engineer in the engine room, and Desi "
            "the shipwright painting the hull.")


def render_crew():
    """The crew picture on the Our team page: the latest design/*crew-boat.jpg (embedded), else Desi's SVG (sanitised)."""
    jpgs = list_files("design", "*crew-boat.jpg")
    if jpgs:
        data = base64.b64encode((ROOT / "design" / jpgs[-1].name).read_bytes()).decode()
        note_source(f"design/{jpgs[-1].name}")
        return (f'<section id="crew"><div class="card wide crew"><img src="data:image/jpeg;base64,{data}" alt="{esc(CREW_ALT)}">'
                '</div></section>')
    files = list_files("design", "*crew-boat.svg")
    if not files:
        return ""
    svg = read(f"design/{files[-1].name}")
    svg = re.sub(r"<\?xml[^>]*\?>|<!DOCTYPE[^>]*>", "", svg)
    svg = re.sub(r"<script\b.*?</script\s*>|<foreignObject\b.*?</foreignObject\s*>", "", svg, flags=re.S | re.I)
    svg = re.sub(r"\son\w+\s*=\s*(\"[^\"]*\"|'[^']*')", "", svg, flags=re.I)
    svg = re.sub(r"(href\s*=\s*)(\"(?!#)[^\"]*\"|'(?!#)[^']*')", r'\1"#"', svg, flags=re.I)
    if "<svg" not in svg:
        warn(f"design/{files[-1].name} is not an SVG")
        return ""
    return (f'<section id="crew"><div class="card wide crew" role="img" aria-label="The JobsMatchNow crew as the crew of one boat">'
            f'{svg.strip()}<p class="muted">Illustration by Desi · design/{esc(files[-1].name)}</p></div></section>')


def render_timeline(timeline, board, mt_name, mt, dec_rows):
    cur = next((r for r in timeline if r["status"] == "IN PROGRESS"), None)
    stage = cur["stage"] if cur else None
    """Returns (company page, team page, top of the command center)."""
    company = render_company() + ('<section><div class="card wide"><p><b>Who builds this?</b> '
                                  '<a href="?p=team">Meet the team and see how we work →</a></p></div></section>')
    steps = load_workflow()
    team = (render_crew()
            + '<section id="meet-team"><h2>Our team <small>each member in their own words · data/team.csv</small></h2>'
            f'<div class="grid">{render_team_intro(load_team(), timeline, board, cur, steps)}</div></section>'
            '<section id="workflow"><h2>How we work <small>the full business workflow and where each member steps in</small></h2>'
            f'<div class="grid">{render_workflow(steps)}</div></section>')
    command = ('<section id="vision"><h2>Global timeline to the LinkedIn sale <small>Day 1 → M36 · one lane per member '
               '(ownership) · stages after the current one are imagined until DONE · data/timeline.csv</small></h2>'
               f'<div class="card wide">{render_full_timeline(timeline, board, cur)}</div></section>'
               + render_meetings(load_meetings(), render_urgent(load_urgent()))
               + render_loop(cur, board, mt_name, mt, dec_rows))
    return company, team, command


GOAL_BADGE = {"ACHIEVED": "ok", "NOT YET": "bad", "PENDING FOUNDER": "mid"}
CEO_BADGE = {"YES": ("ok", "✓ Yes"), "NO": ("bad", "✗ No, reiterate"), "DELAY": ("mid", "⏸ Delay")}


def load_ceo_reviews():
    """data/ceo_reviews.csv: the founder's YES/NO/DELAY on each member's stage task; the latest row wins."""
    out = {}
    for r in load_csv("data/ceo_reviews.csv"):
        out[((r.get("stage") or "").strip(), (r.get("member") or "").strip())] = r
    return out


def ceo_cell(stage, name, rv):
    btns = "".join(btn(lbl, "ceo-review", primary=(d == "YES"), stage=stage, member=name, decision=d)
                   for d, lbl in [("YES", "Yes"), ("NO", "No"), ("DELAY", "Delay")])
    if rv:
        cls, txt = CEO_BADGE.get((rv.get("decision") or "").upper(), ("na", rv.get("decision")))
        head = (f"<span class='badge {cls}'>{esc(txt)}</span> <span class='muted'>{esc(rv.get('date'))}</span>"
                + (f"<br><span class='muted'>{esc(rv.get('note'))}</span>" if (rv.get("note") or "").strip() else ""))
        return f"{head}<details><summary class='muted'>change</summary><div class='ceobtns'>{btns}</div></details>"
    return f"<div class='ceobtns'>{btns}</div>"


def by_member(lines):
    """Meeting bullets 'Name: text' -> {agent id: text}."""
    ids = {n.lower(): k for k, n in TL_MEMBERS + [("designer", "Desi")]}
    out = {}
    for b in lines:
        name, sep, text = b.partition(":")
        if sep and name.strip().lower() in ids:
            out[ids[name.strip().lower()]] = text.strip()
    return out


def list_html(items):
    return "<ul class='list'>" + "".join(f"<li>{esc(x)}</li>" for x in items) + "</ul>" if items else empty("none")


def render_loop(cur, board, mt_name, mt, dec_rows):
    """The stage loop: stage → each member's task + result → team meeting → next tasks → goal achieved? → reiterate."""
    if not cur:
        return empty("No stage is IN PROGRESS in data/timeline.csv.")
    stage = cur["stage"]
    lanes = TL_MEMBERS + [("designer", "Desi")]
    sb = [b for b in board if b.get("stage") == stage]
    goals = {k: [p.strip() for p in v.split("—")] for k, v in by_member(mt.get("goal check", [])).items()}
    nexts = by_member(mt.get("next tasks", []))
    verdict = (mt.get("stage verdict") or [""])[0]
    reached = verdict.upper().startswith(f"{stage.upper()} ACHIEVED")
    msrc = link(mt_name, f"plans/meetings/{mt_name}") if mt_name else "no meeting yet: run <code>/team-meeting</code>"

    def step(n, title, body, sub=""):
        sub = f" <small>{sub}</small>" if sub else ""
        return f'<div class="card wide step"><h3><span class="stepn">{n}</span> {esc(title)}{sub}</h3>{body}</div>'

    def gstatus(k):
        g = goals.get(k)
        if not g or len(g) < 2:
            return f"<span class='nd'>{ND}</span>"
        st = g[1].upper()
        return f"<span class='badge {GOAL_BADGE.get(st, 'na')}'>{esc(st)}</span>" + (f" <span class='muted'>{esc(g[2])}</span>" if len(g) > 2 else "")

    # ② stage we are at
    vb = (f"<span class='badge ok'>✓ Goal achieved: advance</span>" if reached else
          f"<span class='badge bad'>↻ Not achieved yet: reiterate</span>") if verdict else f"<span class='nd'>{ND}</span>"
    s2 = (f"<p class='stagehead'><b>{esc(stage)}</b> · {esc(cur.get('when'))} · {badge(cur['status'])} · {vb}</p>"
          f"<p class='muted'><i>{esc(cur.get('compound'))}</i></p>")

    # ③ each member's task + results
    reviews = load_ceo_reviews()
    rows = []
    for k, name in lanes:
        res = [b for b in sb if (b.get("from") or "").strip() == k and (b.get("type") or "").lower() == "result"]
        rs = "<ul class='list'>" + "".join(f"<li>{esc(b.get('message'))}</li>" for b in res[:2]) + "</ul>" if res \
            else "<span class='muted'>no result posted</span>"
        task = cur.get(k) or ""
        rows.append([f"<b>{esc(name)}</b>", esc(task) if task.strip() else f"<span class='nd'>{ND}</span>", rs, gstatus(k),
                     ceo_cell(stage, name, reviews.get((stage, name)))])
    s3 = "<div class='tasktbl'>" + table(["Member", f"{stage} task", "Results (team board)", "Goal status", "CEO decision"], rows) + "</div>"
    fb = [b for b in sb if (b.get("type") or "").lower() in ("feedback", "blocker", "proposal")]
    if fb:
        s3 += ("<details><summary class='muted'>Feedback between members (" + str(len(fb)) + ")</summary><ul class='list'>"
               + "".join(f"<li>{board_line(b)}</li>" for b in fb) + "</ul></details>")

    # ④ team meeting
    s4 = ("<div class='cols'><div><h4>Agreed proposals for the Founder</h4>" + list_html(mt.get("agreed proposals for the founder", []))
          + "</div><div><h4>Disagreements</h4>" + list_html(mt.get("disagreements", [])) + "</div></div>") if mt_name \
        else empty("No team meeting yet: run <code>/team-meeting</code>.")

    # ⑤ common decision: next task per member, plus the founder's latest decisions
    nrows = [[f"<b>{esc(n)}</b>", esc(nexts[k]) if k in nexts else f"<span class='nd'>{ND}</span>"] for k, n in lanes]
    recent = dec_rows[-5:][::-1]
    s5 = (table(["Member", "Next task (agreed)"], nrows)
          + "<h4>Founder decisions (latest 5, docs/decisions.md)</h4>"
          + ("<ul class='list'>" + "".join(f"<li><span class='muted'>{esc(r[0])}</span> <b>{esc(plain(r[1]))}</b>: {esc(plain(r[2]))}</li>"
                                          for r in recent) + "</ul>" if recent else empty("No decisions yet.")))

    # ⑥ goal achieved? if not, reiterate
    n_ok = sum(1 for k, n in lanes
               if (goals.get(k) and len(goals[k]) > 1 and goals[k][1].upper() == "ACHIEVED")
               or (reviews.get((stage, n)) or {}).get("decision", "").upper() == "YES")
    gate_key = next((k for k in mt if k.startswith("gate to")), None)
    s6 = (f"<p class='stagehead'>{vb} <b>{n_ok} of {len(lanes)}</b> member goals achieved</p>"
          f"<p>{esc(verdict) if verdict else empty('No stage verdict yet.')}</p>"
          "<p class='muted'>A member goal counts as achieved when the meeting's goal check says ACHIEVED or you said Yes in ③.</p>"
          + (f"<p class='muted'>↻ Loop: next tasks (⑤) → results (③) → team meeting (④) → goal check (⑥), until every goal is ACHIEVED "
             f"and the Founder confirms. Then {esc(stage)} is DONE and the next stage opens.</p>")
          + (f"<details><summary class='muted'>{esc(gate_key.capitalize())}</summary>{list_html(mt[gate_key])}</details>" if gate_key else ""))

    body = (step("②", f"Stage we are at: {stage}", s2, "data/timeline.csv")
            + step("③", "Each member's task and result", s3, "data/team_board.csv · goal status from " + msrc)
            + step("④", "Team meeting", s4, msrc)
            + step("⑤", "Common decision: each member's next task", s5, msrc)
            + step("⑥", "Goal achieved?", s6, msrc))
    return ('<section id="current-step"><h2>The stage loop <small>① timeline above → ② stage → ③ tasks + results → '
            '④ meeting → ⑤ next tasks → ⑥ goal check → reiterate</small></h2>'
            f'<div class="grid">{body}</div></section>')


def load_daily_window():
    out = []
    for p in list_files("data/daily", "*.json"):
        d = parse_date(p.stem)
        if not in_window(d):
            continue
        try:
            data = json.loads(read(f"data/daily/{p.name}") or "null")
        except json.JSONDecodeError:
            continue  # load_daily() warns about the latest broken file
        if isinstance(data, dict):
            out.append((d, p.name, data))
    return out


def git_log():
    """Commits in the product repo (../) in the window. Read-only; empty if git is unavailable."""
    repo = ROOT.parent
    if not (repo / ".git").exists():
        return []
    try:
        r = subprocess.run(["git", "-C", str(repo), "log", f"--since={SINCE.isoformat()}", "--date=short",
                            "--pretty=format:%h|%ad|%s"], capture_output=True, text=True, timeout=10)
    except (OSError, subprocess.SubprocessError):
        return []
    if r.returncode != 0:
        return []
    note_source("../ (git log)")
    base = None
    try:
        o = subprocess.run(["git", "-C", str(repo), "remote", "get-url", "origin"], capture_output=True, text=True,
                           timeout=5).stdout.strip()
        m = re.search(r"github[\w.-]*[:/]([\w.-]+)/([\w.-]+?)(?:\.git)?$", o)
        if m:
            base = f"https://github.com/{m.group(1)}/{m.group(2)}/commit/"
    except (OSError, subprocess.SubprocessError):
        pass
    out = []
    for line in r.stdout.splitlines():
        h_, _, rest = line.partition("|")
        d, _, subj = rest.partition("|")
        out.append({"hash": h_, "date": parse_date(d), "subject": subj, "url": (base + h_) if base else None})
    return out


NOTE_RE = re.compile(rf"(\d{{4}}-\d{{2}}-\d{{2}})\s*\(({AGENT_RE})\b[^)]*\)\s*:?\s*(.*)", re.I)


def load_doc_notes():
    """Dated notes agents leave in docs/, e.g. '- 2026-10-25 (seller): insight'."""
    out = []
    for p in list_files("docs", "*.md"):
        rel = f"docs/{p.name}"
        for line in read(rel).splitlines():
            m = NOTE_RE.search(line)
            if m and in_window(parse_date(m.group(1))) and member_key(m.group(2)):
                out.append({"date": parse_date(m.group(1)), "member": member_key(m.group(2)), "file": rel,
                            "text": (plain(m.group(3)) or plain(line))[:180]})
    return out


def load_plan():
    """Tasks per member from the latest plans/*_plan.md ('- seller: task', '### seller' + bullets, or table rows)."""
    files = [p for p in list_files("plans", "*.md") if p.stem.endswith("_plan")]
    if not files:
        return None, {}
    p = files[-1]
    tasks, cur = {}, None
    for line in read(f"plans/{p.name}").splitlines():
        hm = re.match(r"\s*#{2,4}\s+(.+)$", line)
        if hm:
            first = re.findall(r"[\w-]+", plain(hm.group(1)).lower())
            cur = member_key(first[0]) if first else None
            continue
        if line.strip().startswith("|"):
            cells = [plain(c) for c in line.strip().strip("|").split("|")]
            if len(cells) > 1 and member_key(cells[0]):
                tasks.setdefault(member_key(cells[0]), []).append({"text": cells[1], "done": False})
            continue
        m = re.match(r"\s*(?:[-*]|\d+\.)\s+(?:\[( |x|X)\]\s*)?(.+)$", line)
        if not m:
            continue
        text, done = plain(m.group(2)), (m.group(1) or "").lower() == "x"
        pm = re.match(rf"({AGENT_RE})\s*[:—–-]\s*(.+)$", text, re.I)
        who = member_key(pm.group(1)) if pm else cur
        if pm:
            text = pm.group(2)
        if who:
            tasks.setdefault(who, []).append({"text": text, "done": done})
    return p.name, tasks


def load_priorities():
    body = next((b for k, b in md_sections(read("CLAUDE.md")).items() if k.startswith("current priorities")), "")
    items = []
    for line in body.splitlines():
        m = re.match(r"\s*\d+\.\s+(.+)$", line)
        if m:
            items.append(plain(m.group(1)))
        elif items and line.startswith("   ") and line.strip():
            items[-1] += " " + plain(line)
    return items


PRIORITY_METRICS = [(("paying",), "paying_teams"), (("candidate",), "candidates"),
                    (("mrr", "revenue"), "mrr"), (("hire",), "hires")]


def priority_status(text, latest, as_of, sections):
    """(now, target, progress %, source) for a CLAUDE.md priority, matched to a metric by keyword."""
    t = text.lower()
    tm = re.search(r"\b(\d{1,3}(?:,\d{3})+|\d+)\b", text)
    target = num(tm.group(1).replace(",", "")) if tm else None
    for keys, field in PRIORITY_METRICS:
        if any(k in t for k in keys):
            v = num(latest.get(field)) if latest else None
            p = min(100, round(100 * v / target)) if v is not None and target else None
            return fmt(v), fmt(target), p, f"{field}, data/metrics_history.csv" + (f" ({as_of})" if as_of else "")
    if "deck" in t or "invest" in t:
        fund = next((s for s in sections if s["name"].lower() == "fundraising"), None)
        if fund:
            items = [i for i in fund["items"] if "deck" in i["item"].lower()] or fund["items"]
            return items[0]["status"] if items else ND, "ready", fund["pct"], "Fundraising, docs/exit-readiness.md"
    return ND, ND, None, ""


def last7(drafts, review_log, leads, activity, daily_win, commits, notes, dec_rows, feedback):
    """Per member: list of (date, html) items and result counters, all from files dated in the window."""
    by = {m: [] for m in MEMBERS}
    res = {m: {} for m in MEMBERS}

    def add(m, d, item, counter):
        if m not in by:
            return
        by[m].append((d, item))
        res[m][counter] = res[m].get(counter, 0) + 1

    for d in drafts:
        if in_window(d["date"]):
            add(member_key(d["agent"]), d["date"],
                f"Draft {link(d['title'], 'outbox/' + d['file'])} {badge('Superseded' if d['superseded'] else d['status'])}",
                "drafts")
    for v in review_log:
        if in_window(v["date"]):
            add("reviewer", v["date"], f"{badge(v['verdict'])} {esc(v['item'])} <span class='muted'>{esc(v['note'])}</span>",
                v["verdict"])
    for r in leads:
        d = parse_date(r.get("date_added"))
        if in_window(d):
            add("seller", d, f"Lead {link(r.get('company') or '?', r.get('url'))} {badge((r.get('status') or '?').strip())}",
                "leads added")
    for r in activity:
        d = parse_date(r.get("date"))
        if in_window(d):
            hand = r.get("handoff_to") or ""
            add(member_key(r.get("agent")), d, f"{esc(r.get('task'))} → {linkify(r.get('output'))}"
                + (f" <span class='muted'>→ handed to {esc(hand)}</span>" if hand.strip() else ""), "tasks")
    for d, name, data in daily_win:
        for a in as_dicts(data.get("agent_activity")):
            add(member_key(a.get("agent")), d, f"{esc(a.get('task'))} → {linkify(a.get('output'))} "
                f"<span class='muted'>({esc(name)})</span>", "tasks")
    for c in commits:
        hsh = link(c["hash"], c["url"]) if c.get("url") else esc(c["hash"])
        add("builder", c["date"], f"<code>{hsh}</code> {esc(c['subject'])} <span class='muted'>(app repo)</span>", "commits")
    for n in notes:
        add(n["member"], n["date"], f"{linkify(n['file'])}: {esc(n['text'])}", "doc notes")
    for r in dec_rows:
        d = parse_date(r[0])
        if in_window(d):
            add("Founder", d, f"Decided <b>{esc(plain(r[1]))}</b>: {esc(plain(r[2]))}", "decisions")
    for r in feedback:
        d = parse_date(r[0])
        if in_window(d):
            add("Founder", d, f"Logged {esc(r[1])} from {esc(r[2])}", "feedback logged")
    for m in by:
        by[m].sort(key=lambda x: x[0] or dt.date.min, reverse=True)
    return by, res


AGENT_CMD = {"builder": ".claude/commands/ship.md", "reviewer": ".claude/commands/daily-run.md",
             "marketer": ".claude/commands/daily-run.md", "seller": ".claude/commands/outreach.md",
             "fundraiser": ".claude/commands/weekly-plan.md", "Founder": ".claude/commands/ceo.md"}
RULES = " Read docs/decisions.md and docs/feedback.md first. Draft only; the founder sends."


AGENT_DEFS = {p.stem for p in (ROOT / ".claude" / "agents").glob("*.md")}


def send_key(d):
    """Sort drafts by their 'Send on' date (header), then filename; drafts without one go last."""
    m = re.search(r"\d{4}-\d{2}-\d{2}", d.get("send_on") or "")
    return (m.group(0) if m else "9999", d["file"])


def copy_btn(prompt):
    return btn("Copy prompt", "copy", primary=False, text=prompt)


def member_actions(drafts, leads, daily, decisions, gaps, plan_tasks, history, metrics_updated, start):
    """Open actions per member, most urgent first. Founder items carry a button that opens the form for it;
    agent items carry a 'Copy prompt' to paste into Claude Code. Every item links to the file it came from."""
    A = {m: [] for m in MEMBERS}
    for d in decisions:
        label = d.split(":")[0].strip()
        deadline = "1" if re.search(r"deadline|date", label, re.I) else ""
        A["Founder"].append(f"Decide: {link(label, at('docs/decisions.md', label))} "
                            f"<span class='muted'>{esc(d[len(label) + 1:].strip())}</span> "
                            + btn("Decide", "decision", decision=label, deadline=deadline))
    last = parse_date(history[-1]["date"]) if history else None
    if not last or (TODAY - last).days > 7 or not parse_date(metrics_updated):
        A["Founder"].append("Give this week's numbers " + link("data/metrics_history.csv", "data/metrics_history.csv")
                            + " " + btn("Log metrics", "metrics"))
    queue = sorted([d for d in drafts if d["status"] in ("DRAFT", "APPROVED")], key=send_key)
    approvals = []
    for d in queue:
        f = link(d["title"], f"outbox/{d['file']}")
        v = d["verdict"]
        ag = member_key(d["agent"])
        if d["superseded"]:
            A["Founder"].append(f"Archive superseded {f} " + btn("Archive", "archive", file=d["file"]))
            continue
        if d["status"] == "APPROVED":
            A["Founder"].append(f"Send it yourself, then mark sent: {f} " + btn("Send", "draft", file=d["file"]))
            continue
        if v and v[0] == "BLOCK" and ag:
            A[ag].append(f"Fix BLOCKed {f}: {esc(v[1])} " + copy_btn(
                f"Ask {MEMBER_LABEL[ag]} to fix outbox/{d['file']} per Rev's note: {v[1]}.{RULES}"))
        if not v:
            A["reviewer"].append(f"Review {f} " + copy_btn(
                f"Ask Rev (reviewer) to check outbox/{d['file']}: PASS/BLOCK against CLAUDE.md, docs/metrics.md numbers only "
                f"and docs/brand.md. One line: <file> — PASS|BLOCK — <note>."))
        if d["blocked"]:
            continue  # gated drafts (e.g. acquirer outreach) are not founder actions until the block is lifted
        when = f" · send {d['send_on']}" if d["send_on"] else (f" · {d['age']}d old" if d["age"] is not None else "")
        approvals.append(f"Approve: {f} <span class='muted'>{esc(d['agent'])}{esc(when)}"
                         + ("" if v else " · not reviewed yet") + "</span> " + btn("Review & approve", "draft", file=d["file"]))
    if len(approvals) > 3:
        n_rev = sum(1 for d in queue if d["verdict"] and not d["superseded"])
        A["Founder"].append(f"<b>Approve {len(approvals)} messages</b> <span class='muted'>({n_rev} reviewed), next by send date "
                            "below</span> " + btn("Review all", "drafts-list"))
    A["Founder"].extend(approvals[:3])
    for x in as_list(daily.get("ceo_do")) if daily else []:
        A["Founder"].append(esc(x) + " <span class='muted'>(today's brief)</span>")
    st = lambda r: (r.get("status") or "").strip().upper()
    for r in leads:
        c = r.get("company") or "?"
        if st(r) == "NEW":
            A["Founder"].append(f"Send opener to {link(c, r.get('url'))} <span class='muted'>{esc(r.get('buyer_title'))}</span> "
                                + btn("Send opener", "lead-send", company=c))
        elif st(r) == "CONTACTED":
            A["Founder"].append(f"Waiting on {esc(c)}: log any reply " + btn("Log reply", "feedback", primary=False, company=c))
        elif st(r) == "REPLIED":
            A["Founder"].append(f"Reply to {esc(c)} and log the outcome " + btn("Log outcome", "feedback", company=c))
            A["seller"].append(f"Draft follow-up for {esc(c)} (REPLIED) " + copy_btn(
                f"Ask Selly (seller) to draft a follow-up for {c} (status REPLIED) into outbox/{TODAY.isoformat()}_seller_followups.md "
                f"with Status: DRAFT, using its row in docs/feedback.md.{RULES}"))
        elif st(r) in ("DEMO", "PILOT"):
            A["seller"].append(f"Prepare next step for {esc(c)} ({esc(st(r))}) " + copy_btn(
                f"Ask Selly (seller) to prepare the next step for {c} ({st(r)}): demo script or pilot proposal (free 3-month pilot, "
                f"then per-hire, per docs/decisions.md).{RULES}"))
    if not start:
        A["Founder"].append("Set the start date in " + link("docs/exit-readiness.md", at("docs/exit-readiness.md", "Start date:"))
                            + " " + btn("Set start date", "start-date"))
    for m, ts in plan_tasks.items():
        for t in ts:
            if not t["done"] and m in A:
                extra = "" if m == "Founder" else " " + copy_btn(f"Ask {MEMBER_LABEL.get(m, m)} to do this week's task: {t['text']}.{RULES}")
                A[m].append(f"{esc(t['text'])} <span class='muted'>(this week's plan)</span>{extra}")
    per = {}
    for g in gaps:
        m = member_key(g["owner"]) or "Founder"
        if per.get(m, 0) >= 3:
            continue
        per[m] = per.get(m, 0) + 1
        row = link(g["item"], at("docs/exit-readiness.md", "| " + g["item"]))
        tail = (btn("Update", "readiness", primary=False, item=g["item"]) if m == "Founder" else copy_btn(
            f"Ask {MEMBER_LABEL.get(m, m)} to move '{g['item']}' ({g['section']}) in docs/exit-readiness.md forward. Do the work, then "
            f"report evidence (repo path or https link) so the founder can mark it.{RULES}"))
        A[m].append(f"Readiness gap: {row} {badge(g['status'])} <span class='muted'>({esc(g['section'])})</span> {tail}")
    return A


def theme_counts(objections, feedback):
    """Recurring themes: an objection counts once per feedback row whose 'what they said' shares at least
    2 significant words (3+ letters, not stop words) with the objection text. Simple matching, no summarising."""
    out = []
    for o in objections:
        ow = words(o["objection"])
        n = sum(1 for r in feedback if len(ow & words(r[3])) >= 2)
        if n:
            out.append((n, o))
    return sorted(out, key=lambda x: -x[0])


# ---------- gaps ranking ----------
# Which exit-readiness sections move a Path-to-acquisition milestone, matched by keywords in its text.
MILESTONE_SECTIONS = [
    (("paying", "mrr", "revenue", "customer", "pilot"), ("traction", "revenue", "market")),
    (("hire",), ("traction", "product")),
    (("ats", "integration", "greenhouse", "lever"), ("product", "strategic")),
    (("partner", "strategic", "acquir", "platform"), ("strategic", "company/legal")),
    (("deck", "invest", "seed", "fund"), ("fundraising",)),
]
STOP = {"with", "through", "the", "and", "app", "live", "first"}


def milestone_sections(text):
    t = (text or "").lower()
    return {s for keys, secs in MILESTONE_SECTIONS if any(k in t for k in keys) for s in secs}


def words(text):
    return {w for w in re.findall(r"[a-z0-9$]+", (text or "").lower()) if len(w) >= 3 and w not in STOP}


def rank_gaps(sections, path):
    """Rank readiness gaps by impact.

    Ranking rule:
    - Only NOT STARTED and [NEEDS DATA] items are gaps (IN PROGRESS is already moving).
    - The readiness formula weights every item equally, so each gap is worth exactly 100/N points of
      overall readiness when DONE. Raw impact therefore cannot separate items; we weight by what the
      Path to acquisition needs next:
        x3 if the item's section maps to the NEXT unchecked milestone (MILESTONE_SECTIONS keywords),
        x2 if it maps to the milestone after that, otherwise x1;
        +1 if the item's own text shares a keyword with the next milestone (it IS that milestone).
    - Status weight: NOT STARTED 1.0, [NEEDS DATA] 0.9 (both score 0 today; [NEEDS DATA] is often
      already true and only needs the founder to fill in evidence, so it ranks a hair lower).
    - Ties: weaker section (lower section %) first, then the order in docs/exit-readiness.md.
    """
    open_ms = [p for p in path if not p["done"]]
    nxt = open_ms[0]["milestone"] if open_ms else ""
    after = open_ms[1]["milestone"] if len(open_ms) > 1 else ""
    s_next, s_after, w_next = milestone_sections(nxt), milestone_sections(after), words(nxt)
    gaps = []
    for si, s in enumerate(sections):
        key = s["name"].lower()
        for it in s["items"]:
            if it["status"] not in ("NOT STARTED", ND):
                continue
            weight, why = 1, "general readiness"
            if key in s_next:
                weight, why = 3, f"section feeds next milestone: {nxt}"
            elif key in s_after:
                weight, why = 2, f"section feeds the milestone after: {after}"
            score = weight * (1.0 if it["status"] == "NOT STARTED" else 0.9)
            if w_next and words(it["item"]) & w_next:
                score += 1
                why = f"is the next milestone: {nxt}"
            gaps.append(dict(it, score=score, why=why, sec_pct=s["pct"], si=si))
    gaps.sort(key=lambda g: (-g["score"], g["sec_pct"], g["si"], g["order"]))
    return gaps


def owner_tag(owner):
    o = (owner or "").strip()
    return "Founder" if o.lower() == "founder" or not o else o


# ---------- next actions ----------
def next_actions(drafts, history, metrics_updated, start, gaps, decisions, total_items):
    """Top 5 actions by readiness impact.

    Scores use the same scale as rank_gaps(): gap items keep their gap score (max 4.0). Non-gap actions
    get fixed scores by how much readiness / traceability they unblock:
      3.5 stale metrics (/log-metrics feeds the north star, KPIs and 'Weekly metrics logged' item),
      3.2 each open decision in docs/decisions.md (blocks plans until the founder decides),
      2.5 a BLOCKed draft (outbound work stuck), 2.0 a DRAFT older than 3 days, 1.5 a superseded DRAFT,
      1.2 missing Start date (days since start shows [NEEDS DATA]).
    Up to 2 open decisions are always kept in the top 5 (founder rule: decisions first).
    """
    acts = []
    last = parse_date(history[-1]["date"]) if history else None
    if not last or (TODAY - last).days > 7 or not parse_date(metrics_updated):
        acts.append((3.5, "Founder", "Run <code>/log-metrics</code>: no metrics logged in the last 7 days "
                     "(north star, KPI tiles and graphs need it)", False))
    for d in decisions:
        acts.append((3.2, "Founder", f"Decide with <code>/ceo</code>: {esc(d)} "
                     "<span class='muted'>(docs/decisions.md, Open decisions)</span>", True))
    pts = 100 / total_items if total_items else 0
    for g in gaps[:8]:
        acts.append((g["score"], owner_tag(g["owner"]),
                     f"Move <b>{esc(g['item'])}</b> ({esc(g['section'])}, {esc(g['status'])}) forward "
                     f"<span class='muted'>+{pts:.1f} pts readiness when DONE; {esc(g['why'])}</span>", False))
    for d in drafts:
        if d["status"] != "DRAFT":
            continue
        f = link(d["file"], f"outbox/{d['file']}")
        if d["verdict"] and d["verdict"][0] == "BLOCK":
            acts.append((2.5, owner_tag(d["agent"]), f"Fix BLOCKed draft {f}: {esc(d['verdict'][1])}", False))
        elif d["superseded"]:
            acts.append((1.5, "Founder", f"Archive or delete superseded draft {f}", False))
        elif (d["age"] or 0) > DRAFT_STALE_DAYS:
            acts.append((2.0, "Founder", f"Approve and send, or delete, {f} ({d['age']} days old)", False))
    if not start:
        acts.append((1.2, "Founder", "Set <code>Start date:</code> in " +
                     link("docs/exit-readiness.md", "docs/exit-readiness.md"), False))
    ranked = sorted(acts, key=lambda a: -a[0])
    top = ranked[:5]
    missing = [a for a in ranked[5:] if a[3]][:max(0, 2 - sum(1 for a in top if a[3]))]
    for a in missing:
        idx = max((i for i, t in enumerate(top) if not t[3]), default=None)
        if idx is not None:
            top[idx] = a
    return sorted(top, key=lambda a: -a[0])


# ---------- render helpers ----------
BADGE = {"DONE": "ok", "IN PROGRESS": "mid", "NOT STARTED": "no", "PASS": "ok", "BLOCK": "bad",
         "APPROVED": "ok", "DRAFT": "mid", "SENT": "ok", "GREEN": "ok", "AMBER": "mid", "RED": "bad",
         "NEW": "mid", "CONTACTED": "mid", "REPLIED": "ok", "DEMO": "ok", "PILOT": "ok", "PAID": "ok",
         "STALE": "bad", "SUPERSEDED": "no", "OK": "ok", "GAP": "bad", "IDLE": "no", "WAITING": "mid",
         "ACTIVE": "ok", "BLOCKED": "bad"}


def badge(status):
    s = str(status or "?")
    return f'<span class="badge {BADGE.get(s.upper(), "na")}">{esc(s)}</span>'


def bar(p):
    return f'<div class="bar" role="img" aria-label="{p}%"><span style="width:{p}%"></span></div>'


def table(headers, rows):
    head = "".join(f"<th>{esc(h)}</th>" for h in headers)
    body = "".join("<tr>" + "".join(f"<td>{c}</td>" for c in r) + "</tr>" for r in rows)
    return f'<div class="tw"><table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table></div>'


def empty(msg):
    return f'<p class="empty">{msg}</p>'


def card(title, body, extra="", sub=""):
    sub = f" <small>{sub}</small>" if sub else ""
    return f'<div class="card {extra}"><h3>{esc(title)}{sub}</h3>{body}</div>'


def section(title, cards, sid):
    return f'<section id="{sid}"><h2>{esc(title)}</h2><div class="grid">{"".join(cards)}</div></section>'


def nd_cls(v):
    return ' class="nd"' if v == ND else ""


# ---------- render ----------
def render():
    metrics_updated = load_metrics()
    history = load_history()
    start, reviewed, sections, path, overall, total_items = load_readiness()
    drafts, review_log = load_outbox()
    leads = load_leads()
    daily_name, daily, daily_count = load_daily()
    rev = load_review()
    objections = load_objections()
    feedback = load_feedback()
    decisions = load_open_decisions()
    gaps = rank_gaps(sections, path)
    acts = next_actions(drafts, history, metrics_updated, start, gaps, decisions, total_items)
    days = (TODAY - start).days if start else ND
    latest = history[-1] if history else {}
    as_of = latest.get("date", "")
    activity = load_activity()
    daily_win = load_daily_window()
    commits = git_log()
    notes = load_doc_notes()
    dec_rows = load_decision_rows()
    plan_name, plan_tasks = load_plan()
    priorities = load_priorities()
    by, results = last7(drafts, review_log, leads, activity, daily_win, commits, notes, dec_rows, feedback)
    member_acts = member_actions(drafts, leads, daily, decisions, gaps, plan_tasks, history, metrics_updated, start)
    window_txt = f"{SINCE.isoformat()} to {TODAY.isoformat()}"
    h = []

    # 1. HEADER
    ns = north_star(history)
    if ns["value"] is None:
        ns_src = "needs 2 rows in data/metrics_history.csv at least 7 days apart: run <code>/log-metrics</code>"
    else:
        ns_src = esc(ns["src"]) + " (data/metrics_history.csv)"
    ns_change = (f"{esc(fmt_signed(ns['change']))} vs previous week ({esc(fmt(ns['prev']))})"
                 if ns["change"] is not None else f"vs previous week: {ND}")
    h.append(f"""<header>
<div class="brand"><span class="logo" aria-hidden="true"></span><div><h1>JobsMatchNow command center</h1>
<p class="muted">Built {esc(TODAY.isoformat())} from repo files only. Refresh to rebuild.</p></div></div>
<div class="hero">
<div class="stat-big ns"><span class="lbl">North star: weekly matches that became conversations</span>
<b data-k="north-star"{nd_cls(fmt(ns['value']))}>{esc(fmt(ns['value']))}</b>
<span class="delta" data-k="north-star-change">{ns_change}</span><span class="src">{ns_src}</span></div>
<div class="stat-big"><span class="lbl">Acquisition readiness</span><b data-k="readiness">{overall}%</b>
{bar(overall)}<span class="src">docs/exit-readiness.md, last reviewed {esc(reviewed)}</span></div>
<div class="stat-big"><span class="lbl">Days since start</span><b data-k="days"{nd_cls(days)}>{esc(days)}</b>
<span class="src">Start date in docs/exit-readiness.md</span></div>
</div></header>""")

    # VISION TIMELINE: the reverse timeline, current step, team board, meetings and decisions, at the top
    mt_name, mt = load_meeting()
    company_html, team_html, command_top = render_timeline(load_timeline(), load_board(), mt_name, mt, dec_rows)

    chart = {}
    st_ = lambda r: (r.get("status") or "").strip().upper()

    # CALL-TO-ACTION BAR
    n_drafts = sum(1 for d in drafts if d["status"] in ("DRAFT", "APPROVED") and not d["superseded"])
    n_new = sum(1 for r in leads if st_(r) == "NEW")
    ctas = [btn(f"Review drafts ({n_drafts})", "drafts-list") if n_drafts else
            '<button type="button" class="act" disabled>Review drafts (0): nothing waiting</button>',
            btn(f"Send openers ({n_new})", "leads-list") if n_new else
            '<button type="button" class="act" disabled>Send openers (0): nothing waiting</button>',
            btn(f"Decide ({len(decisions)})", "decisions-list") if decisions else
            '<button type="button" class="act" disabled>Decide (0): nothing open</button>',
            btn("Log metrics", "metrics"), btn("Log feedback", "feedback")]
    if not start:
        ctas.append(btn("Set start date", "start-date"))
    h.append(f'<nav class="ctabar" aria-label="Founder actions">{"".join(ctas)}'
             '<span class="offline-note muted">Start <code>./dash.sh</code> to use the action buttons.</span></nav>')
    charts_at = len(h)  # the Charts section is inserted here, right under the CTA bar

    # PROJECT STATUS
    cards = []
    if priorities:
        rows = []
        for p in priorities:
            now, target, prog, src = priority_status(p, latest, as_of, sections)
            flag = " <span class='badge bad'>deadline not set</span>" if "[DATE]" in p else ""
            rows.append([esc(p) + flag, f"<b{nd_cls(now)}>{esc(now)}</b>", esc(target),
                         (bar(prog) + f"<span class='muted'>{prog}%</span>") if prog is not None else f"<span class='nd'>{ND}</span>",
                         f"<span class='muted'>{esc(src)}</span>"])
        cards.append(card("Current priorities", table(["Priority", "Now", "Target", "Progress", "Source"], rows),
                          "wide", "CLAUDE.md"))
    cur_i = next((n for n, p in enumerate(path) if not p["done"]), None)
    queue_n = sum(1 for d in drafts if d["status"] == "DRAFT" and not d["superseded"])
    blocks7 = sum(1 for v in review_log if v["verdict"] == "BLOCK" and in_window(v["date"]))
    tiles_s = [
        ("Path to acquisition", f"{cur_i + 1} of {len(path)}" if cur_i is not None else ("done" if path else ND),
         esc(path[cur_i]["milestone"]) if cur_i is not None else "", "docs/exit-readiness.md"),
        ("Open CEO decisions", str(len(decisions)), "; ".join(esc(d.split(":")[0]) for d in decisions), "docs/decisions.md"),
        ("Waiting for your approval", str(queue_n), "DRAFT items in outbox/", "outbox/"),
        ("Reviewer BLOCKs (7 days)", str(blocks7), "see Feedback", "outbox/*_reviewer_daily.md"),
        ("Leads", str(len(leads)), f"{sum(1 for r in leads if st_(r) == 'NEW')} NEW, not contacted yet", "data/leads.csv"),
        ("Last metrics log", esc(as_of) or ND, "run /log-metrics weekly", "data/metrics_history.csv"),
        ("Last daily run", esc(daily_name[:10]) if daily_name else "none", "run /daily-run each morning", "data/daily/"),
        ("This week's plan", esc(plan_name) if plan_name else "none", "run /weekly-plan on Monday", "plans/"),
    ]
    tb = "".join(f'<div class="kpi"><span class="lbl">{l}</span><b{nd_cls(v) if v not in (ND, "none") else " class=nd"}>{v}</b>'
                 f'<span class="delta">{d}</span><span class="src">{esc(s)}</span></div>' for l, v, d, s in tiles_s)
    cards.append(card("Status at a glance", f'<div class="kpis">{tb}</div>', "wide"))
    h.append(section("Project status", cards, "status"))

    # TEAM: one card per member = status + results (7 days) + actions required
    cards = []
    blocked_by = {member_key(d["agent"]) for d in drafts
                  if d["status"] == "DRAFT" and d["verdict"] and d["verdict"][0] == "BLOCK"}
    for m in MEMBERS:
        items, res, acts_m = by.get(m, []), results.get(m, {}), member_acts.get(m, [])
        if m == "chief-of-staff" and not items and not acts_m:
            continue
        state = "BLOCKED" if m in blocked_by else "ACTIVE" if items else "IDLE"
        last_d = items[0][0].isoformat() if items and items[0][0] else ""
        head = (f'<div class="mstate">{badge(state)}'
                + (f"<span class='muted'>last activity {esc(last_d)}</span>" if last_d else "<span class='muted'>no activity in 7 days</span>")
                + "</div>")
        if items:
            head += f'<p class="working"><span class="muted">Latest:</span> {items[0][1]}</p>'
        links = []
        if m in AGENT_DEFS:
            links.append(link("agent definition", f".claude/agents/{m}.md"))
        if m in AGENT_CMD:
            links.append(link("command", AGENT_CMD[m]))
        rl = " · ".join(f"<b>{n}</b> {esc(k)}" for k, n in res.items()) or "<span class='muted'>no results this week</span>"
        hist = ""
        if items:
            hist = ('<details><summary class="muted">Activity log (' + str(len(items)) + ')</summary><ul class="list">'
                    + "".join(f"<li><span class='muted'>{esc(d.isoformat() if d else '')}</span> {x}</li>" for d, x in items[:15])
                    + "</ul></details>")
        acts_html = ('<ol class="list acts">' + "".join(f"<li>{x}</li>" for x in acts_m[:10]) + "</ol>"
                     + (f"<p class='muted'>+{len(acts_m) - 10} more</p>" if len(acts_m) > 10 else "")) if acts_m \
            else empty("Nothing open.")
        body = (head + f'<h4>Results, last 7 days</h4><p class="results">{rl}</p>{hist}'
                f'<h4>Action required ({len(acts_m)})</h4>{acts_html}'
                + (f'<p class="muted mlinks">{" · ".join(links)}</p>' if links else ""))
        cards.append(card(MEMBER_LABEL.get(m, m), body, "founder-card wide" if m == "Founder" else "", f"{len(acts_m)} open"))
    h.append(f'<section id="team"><h2>Team <small>status, results and actions per member · {esc(window_txt)} · '
             f'agents run in Claude Code: use <b>Copy prompt</b> and paste it there</small></h2>'
             f'<div class="grid">{"".join(cards)}</div></section>')

    # CHARTS: pies + per-member bars, each with a call to action
    lead_counts = {s: sum(1 for r in leads if st_(r) == s) for s in LEAD_STATUSES}
    rd_counts = {s: sum(1 for sec in sections for i in sec["items"] if i["status"] == s) for s in STATUSES}
    ob_counts = {"DRAFT": 0, "APPROVED": 0, "SENT": 0, "Superseded": 0}
    for d in drafts:
        k = "Superseded" if d["superseded"] else d["status"] if d["status"] in ob_counts else None
        if k:
            ob_counts[k] += 1
    obj_counts = {}
    for o in objections:
        obj_counts[o["type"].lower()] = obj_counts.get(o["type"].lower(), 0) + 1
    p7_ = sum(1 for v in review_log if v["verdict"] == "PASS" and in_window(v["date"]))
    rv_counts = {"PASS": p7_, "BLOCK": blocks7}
    pies = [("pie-leads", "Leads by status", lead_counts, "data/leads.csv", btn("Send openers", "leads-list")),
            ("pie-ready", "Readiness items by status", rd_counts, "docs/exit-readiness.md", btn("Update a gap", "readiness")),
            ("pie-outbox", "Outbox by status", ob_counts, "outbox/", btn("Review drafts", "drafts-list")),
            ("pie-obj", "Objections by type", obj_counts, "docs/objections.md", btn("Log feedback", "feedback")),
            ("pie-rev", "Reviewer verdicts (7 days)", rv_counts, "outbox/*_reviewer_daily.md", btn("Review drafts", "drafts-list"))]
    cards = []
    chart["pies"] = []
    for cid, title, counts, src, cta in pies:
        total = sum(counts.values())
        legend = "".join(f"<li><b>{n}</b> {esc(k)}</li>" for k, n in counts.items())
        if total:
            chart["pies"].append({"id": cid, "labels": list(counts.keys()), "values": list(counts.values())})
            body = (f'<div class="chartbox pie"><canvas id="{cid}" aria-label="{esc(title)}"></canvas></div>'
                    f'<ul class="legend">{legend}</ul>')
        else:
            body = empty("No data yet.")
        cards.append(card(title, body + f'<div class="cta">{cta}</div>', "", link(src, src.replace("*_reviewer_daily.md", ""))))
    names = [MEMBER_LABEL.get(m, m) for m in MEMBERS if m != "chief-of-staff" or by.get(m)]
    keys = [m for m in MEMBERS if m != "chief-of-staff" or by.get(m)]
    chart["memberActs"] = {"labels": names, "values": [len(member_acts.get(m, [])) for m in keys]}
    counters = sorted({k for m in keys for k in results.get(m, {})})
    chart["memberActivity"] = {"labels": names,
                               "series": [{"label": k, "data": [results.get(m, {}).get(k, 0) for m in keys]} for k in counters]}
    fb_rows = [[esc(n), str(len(member_acts.get(m, []))), esc(" · ".join(f"{v} {k}" for k, v in results.get(m, {}).items()))]
               for n, m in zip(names, keys)]
    cards.append(card("Open actions per member", '<div class="chartbox short"><canvas id="ch-acts"></canvas></div>'
                      f'<div class="fallback">{table(["Member", "Open", "7-day results"], fb_rows)}</div>'
                      f'<div class="cta">{btn("Do my next action", "next-founder")}</div>', "", "Team section"))
    cards.append(card("Activity per member (7 days)", (
        '<div class="chartbox short"><canvas id="ch-activity"></canvas></div>' if counters else empty("No activity logged this week."))
        + f'<div class="cta">{btn("Log feedback", "feedback")}</div>', "", "data/activity.csv and other 7-day sources"))
    h.insert(charts_at, section("Charts", cards, "charts"))

    # 2. KPI TILES
    tiles = []
    specs = [("Candidates", "candidates", False), ("Hiring teams", "hiring_teams", False),
             ("Paying teams", "paying_teams", False), ("MRR (USD)", "mrr", True), ("Matches", "matches", False)]
    series = [(lbl, key, [num(r.get(key)) for r in history], money, False) for lbl, key, money in specs]
    series.append(("Reply rate", "reply_rate", [reply_rate(r) for r in history], False, True))
    for lbl, key, vals, money, is_pct in series:
        cur = vals[-1] if vals else None
        prev = vals[-2] if len(vals) > 1 else None
        delta = (fmt_signed(cur - prev, pct=is_pct) + " vs previous log") if cur is not None and prev is not None else ""
        src = "replies / outreach_sent" if is_pct else key
        tiles.append(f'<div class="kpi"><span class="lbl">{esc(lbl)}</span>'
                     f'<b data-k="{key}"{nd_cls(fmt(cur))}>{esc(fmt(cur, money=money, pct=is_pct))}</b>'
                     f'<span class="delta">{esc(delta)}</span>{sparkline(vals)}'
                     f'<span class="src">{esc(src)}{(" · " + esc(as_of)) if as_of else ""}</span></div>')
    kpi_note = ("" if history else empty("No rows in data/metrics_history.csv yet. Run <code>/log-metrics</code>."))
    h.append(f'<section id="kpis"><h2>KPIs <small>latest row of data/metrics_history.csv'
             f'{(" (" + esc(as_of) + ")") if as_of else ""}; docs/metrics.md last updated '
             f'{esc(metrics_updated or ND)}</small></h2>{kpi_note}<div class="kpis">{"".join(tiles)}</div></section>')

    # 3. GRAPHS
    cards = []
    if history:
        g_keys = ["candidates", "hiring_teams", "matches"]
        chart["growth"] = {"labels": [r["date"] for r in history],
                           "series": [{"label": k, "data": [num(r.get(k)) for r in history]} for k in g_keys]}
        rows = [[esc(r["date"])] + [esc(fmt(num(r.get(k)))) for k in g_keys] for r in history[-8:]]
        body = (f'<div class="chartbox"><canvas id="ch-growth" aria-label="Growth over time"></canvas></div>'
                f'<div class="fallback">{table(["date"] + g_keys, rows)}</div>')
    else:
        body = empty("No history yet. Run <code>/log-metrics</code> each week.")
    cards.append(card("Growth over time", body, "wide", "data/metrics_history.csv"))

    def funnel(cid, title, steps, sub):
        if not latest:
            return card(title, empty("No data yet. Run <code>/log-metrics</code>."), "", sub)
        vals = [num(latest.get(k)) for _, k in steps]
        chart[cid] = {"labels": [l for l, _ in steps], "values": vals}
        rows, prev = [], None
        for (l, _), v in zip(steps, vals):
            conv = fmt(100 * v / prev, pct=True) if v is not None and prev not in (None, 0) else ""
            rows.append([esc(l), f"<span{nd_cls(fmt(v))}>{esc(fmt(v))}</span>", esc(conv)])
            prev = v
        b = (f'<div class="chartbox short"><canvas id="ch-{cid}" aria-label="{esc(title)}"></canvas></div>'
             f'<div class="fallback">{table(["step", "total", "from previous"], rows)}</div>')
        return card(title, b, "", sub)

    cards.append(funnel("funnel", "Product funnel", [("Signups (candidates)", "candidates"), ("Matches", "matches"),
                         ("Conversations", "conversations"), ("Hires", "hires")], f"row {esc(as_of)}" if as_of else ""))
    cards.append(funnel("sales", "Sales funnel", [("Outreach sent", "outreach_sent"), ("Replies", "replies"),
                         ("Demos", "demos"), ("Paying teams", "paying_teams")], f"row {esc(as_of)}" if as_of else ""))
    rb = [f'<div class="row"><b>Overall</b>{bar(overall)}<b>{overall}%</b></div>']
    for s in sections:
        rb.append(f'<details><summary class="row"><span>{esc(s["name"])}</span>{bar(s["pct"])}'
                  f'<b data-sec="{esc(s["name"])}">{s["pct"]}%</b></summary>')
        rb.append(table(["Item", "Status", "Evidence", "Owner"],
                        [[esc(i["item"]), badge(i["status"]), linkify(i["evidence"]), esc(i["owner"])]
                         for i in s["items"]]) + "</details>")
    if not sections:
        rb.append(empty("No scored sections found in docs/exit-readiness.md."))
    cards.append(card("Readiness by section", "".join(rb), "", "docs/exit-readiness.md, tap a row for items"))
    h.append('<section id="graphs"><h2>Graphs</h2><p class="chart-note muted">Charts need Chart.js from '
             'cdnjs (offline or blocked?): showing the numbers as tables instead.</p>'
             f'<div class="grid">{"".join(cards)}</div></section>')

    # 4. LAST WEEK
    cards = []
    if rev["file"]:
        sub = link(f"plans/{rev['file']}", f"plans/{rev['file']}")
        if rev["goals"]:
            rows = []
            for g in rev["goals"]:
                g = g + [""] * (4 - len(g))
                rows.append([esc(plain(g[0])), esc(plain(g[1])), esc(plain(g[2])), badge(plain(g[3]) or ND)])
            cards.append(card("Goal vs result", table(["Goal", "Target", "Result", "Status"], rows), "", sub))
        else:
            cards.append(card("Goal vs result", empty("No '## Goal vs result' table in the review."), "", sub))
        if rev["done"]:
            items = "".join(f"<li><b>{esc(w)}</b>{': ' if w else ''}{linkify(t)}</li>" for w, t in rev["done"])
            cards.append(card("Done per agent", f'<ul class="list">{items}</ul>', "", sub))
        else:
            cards.append(card("Done per agent", empty("No '## Done per agent' bullets in the review."), "", sub))
    else:
        cards.append(card("Last week", empty("No weekly review yet. Run <code>/weekly-review</code> on Friday."), "wide"))
    h.append(section("Last weekly review", cards, "last-week"))

    # 5. FEEDBACK
    cards = []
    if objections:
        top = [o for o in objections if o["type"].lower() != "investor"][:4] + \
              [o for o in objections if o["type"].lower() == "investor"][:3]
        body = table(["Objection", "Type"], [[esc(o["objection"]), badge(o["type"])] for o in top])
        cards.append(card("Top objections", body + f'<p class="muted">{len(top)} of {len(objections)}, full list in '
                          f'{link("docs/objections.md", "docs/objections.md")}</p>'))
    else:
        cards.append(card("Top objections", empty("None yet. <code>/log</code> files objections into docs/objections.md.")))
    if review_log:
        rows = [[link(v["item"], f"outbox/{v['item']}.md") if (ROOT / "outbox" / f"{v['item']}.md").is_file()
                 else esc(v["item"]), badge(v["verdict"]), esc(v["note"])] for v in review_log[:10]]
        cards.append(card("Reviewer verdicts", table(["Item", "Verdict", "Note"], rows), "",
                          esc(review_log[0]["file"])))
    else:
        cards.append(card("Reviewer verdicts", empty("No reviewer log yet. <code>/daily-run</code> writes "
                                                     "outbox/DATE_reviewer_daily.md.")))
    if rev["learnings"]:
        cards.append(card("Learnings", '<ul class="list">' + "".join(f"<li>{linkify(l)}</li>" for l in rev["learnings"])
                          + "</ul>", "", esc(rev["file"])))
    else:
        cards.append(card("Learnings", empty("No learnings yet. Run <code>/weekly-review</code>.")))
    if feedback:
        rows = [[esc(r[0]), esc(r[1]), esc(r[2]), esc(r[3]), esc(r[5])] for r in reversed(feedback[-5:])]
        cards.append(card("Latest feedback", table(["Date", "Source", "Who", "What they said", "Action"], rows),
                          "wide", "docs/feedback.md"))
    else:
        cards.append(card("Latest feedback", empty("No feedback logged yet. Run <code>/log</code> after each reply or call."),
                          "wide"))

    # Feedback analysis (counts only)
    by_src, by_filed = {}, {}
    for r in feedback:
        by_src[r[1] or "?"] = by_src.get(r[1] or "?", 0) + 1
        for tok in re.findall(r"(?:docs|data)/[\w./-]+", r[4]):
            by_filed[tok] = by_filed.get(tok, 0) + 1
    fa = ""
    if feedback:
        fa += "<h4>By source</h4>" + table(["Source", "Rows"], [[esc(k), str(v)] for k, v in sorted(by_src.items(), key=lambda x: -x[1])])
        fa += "<h4>Filed to</h4>" + (table(["Doc", "Rows"], [[linkify(k), str(v)] for k, v in sorted(by_filed.items(), key=lambda x: -x[1])])
                                     if by_filed else empty("No rows name a doc in 'filed to'."))
    else:
        fa += empty("0 feedback rows in docs/feedback.md. Run <code>/log [what they said]</code> after every reply or call.")
    cards.append(card("Feedback analysis", fa, "", "docs/feedback.md"))
    kinds = {}
    for o in objections:
        kinds[o["type"].lower()] = kinds.get(o["type"].lower(), 0) + 1
    worked = [o for o in objections if o["worked"] and o["worked"] not in ("-", "?")]
    ob = table(["Type", "Objections"], [[badge(k), str(v)] for k, v in kinds.items()]) if objections else ""
    ob += (f"<p><b>{len(worked)}</b> of {len(objections)} answers marked in <i>Worked?</i> by the founder "
           "(filled in after real calls).</p>")
    themes = theme_counts(objections, feedback)
    ob += "<h4>Recurring themes in feedback</h4>" + (
        table(["Objection", "Feedback rows"], [[esc(o["objection"]), str(n)] for n, o in themes[:5]]) if themes
        else empty("No repeats yet: needs logged feedback that matches an objection."))
    cards.append(card("Objections", ob, "", "docs/objections.md"))
    p7 = sum(1 for v in review_log if v["verdict"] == "PASS" and in_window(v["date"]))
    tot7 = p7 + blocks7
    rv = (f"<p><b>{p7}</b> PASS · <b>{blocks7}</b> BLOCK"
          + (f" · pass rate <b>{round(100 * p7 / tot7)}%</b>" if tot7 else "") + "</p>")
    cards.append(card("Reviewer quality (7 days)", rv if tot7 else empty("No verdicts in the last 7 days."), "",
                      "outbox/*_reviewer_daily.md"))
    h.append(section("Feedback", cards, "feedback"))

    # COLLABORATION / HANDOFFS
    news7 = [n for _, _, d in daily_win for n in as_dicts(d.get("news"))]
    kind = lambda n: (n.get("action_type") or "").lower()
    sales_news = [n for n in news7 if kind(n) == "sales"]
    inv_news = [n for n in news7 if kind(n) == "investor"]
    leads7 = [r for r in leads if in_window(parse_date(r.get("date_added")))]
    drafts7 = [d for d in drafts if in_window(d["date"]) and not d["superseded"]]
    reviewed7 = [d for d in drafts7 if d["verdict"]]
    fixes7 = [d.get("builder_fix") for _, _, d in daily_win if isinstance(d.get("builder_fix"), str) and d["builder_fix"].strip()]
    fix_rev = [v for v in review_log if in_window(v["date"]) and "builder" in v["item"].lower()]
    fb7 = [r for r in feedback if in_window(parse_date(r[0]))]
    filed7 = [r for r in fb7 if r[4].strip() not in ("", "-")]
    mk_d = [d for d in drafts7 if d["agent"] == "marketer"]
    sl_d = [d for d in drafts7 if d["agent"] == "seller"]
    pass_wait = [d for d in drafts if d["status"] == "DRAFT" and d["verdict"] and d["verdict"][0] == "PASS"]
    new_l = [r for r in leads if st_(r) == "NEW"]
    worked_l = [r for r in leads if st_(r) in LEAD_STATUSES[1:]]

    def link_status(produced, consumed, gap_note, ok_note):
        if produced == 0:
            return badge("IDLE"), "nothing produced"
        if consumed >= produced or (consumed > 0 and gap_note is None):
            return badge("OK"), ok_note
        return badge("GAP"), gap_note or ok_note

    links = [
        ("marketer", "seller", "News Radar sales angles → lead openers", len(sales_news), len(leads7) and len(sales_news),
         f"{len(sales_news)} sales angles but no new leads used them", f"{len(sales_news)} angles, {len(leads7)} leads added"),
        ("marketer", "fundraiser", "Investor talking points → docs/investors.md", len(inv_news),
         len(inv_news) if by["fundraiser"] else 0, f"{len(inv_news)} investor points, fundraiser idle",
         f"{len(inv_news)} points, fundraiser active"),
        ("Founder", "all agents", "/log replies and calls → docs/feedback.md", len(fb7), len(filed7),
         f"{len(fb7) - len(filed7)} feedback rows not filed to a doc", f"{len(fb7)} rows, all filed"),
        ("docs/objections.md", "marketer + seller", "Objections → posts and scripts", len(objections),
         len(objections) if (mk_d or sl_d) else 0, "no new posts or scripts this week",
         f"{len(mk_d)} marketer + {len(sl_d)} seller drafts this week"),
        ("builder", "reviewer", "Daily fix → code review", len(fixes7), len(fix_rev),
         f"{len(fixes7) - len(fix_rev)} fix(es) without a review line", f"{len(fixes7)} fix(es), all reviewed"),
        ("all agents", "reviewer", "Drafts → PASS/BLOCK", len(drafts7), len(reviewed7),
         f"{len(drafts7) - len(reviewed7)} draft(s) not reviewed", f"{len(drafts7)} draft(s), all reviewed"),
        ("reviewer", "Founder", "PASS drafts → approve and send by hand", len(pass_wait), 0,
         f"{len(pass_wait)} passed draft(s) waiting for you", ""),
        ("seller", "Founder", "NEW leads → outreach sent by hand", len(leads), len(worked_l),
         f"{len(new_l)} lead(s) still NEW (not contacted)", f"{len(worked_l)} lead(s) contacted or further"),
    ]
    rows = []
    for frm, to, what, prod, cons, gap, ok in links:
        if frm == "reviewer" and prod:
            b, n = badge("WAITING"), gap
        else:
            b, n = link_status(prod, cons, gap, ok)
        rows.append([esc(MEMBER_LABEL.get(frm, frm)), esc(MEMBER_LABEL.get(to, to)), esc(what), b, esc(n)])
    broken = sum(1 for r in rows if "GAP" in r[3])
    cb = table(["From", "To", "Handoff", "Status", "Last 7 days"], rows)
    cb += ("<p class='muted'>Chain from docs/operating-rhythm.md: news → openers / why-now; replies → feedback → "
           "objections → posts and scripts; every draft and fix → reviewer → founder sends. GAP = output produced but "
           "not picked up; IDLE = nothing produced this week.</p>")
    hand = [r for r in activity if in_window(parse_date(r.get("date"))) and (r.get("handoff_to") or "").strip()]
    if hand:
        cb += "<h4>Logged handoffs</h4>" + table(["Date", "From", "To", "Output"],
                                                [[esc(r["date"]), esc(r.get("agent")), esc(r.get("handoff_to")),
                                                  linkify(r.get("output"))] for r in hand[-10:]])
    h.append(section("Collaboration", [card("Handoffs between members", cb, "wide",
                                            f"{broken} broken link(s) · {esc(window_txt)}")], "collab"))

    # 6. TODAY
    cards = []
    if daily:
        dsub = link(f"data/daily/{daily_name}", f"data/daily/{daily_name}") + f" · {daily_count} run(s)"
        brief = as_list(daily.get("brief"))
        b = ('<ul class="list">' + "".join(f"<li>{esc(l)}</li>" for l in brief) + "</ul>") if brief else \
            empty("Empty brief in the latest daily JSON.")
        fix = daily.get("builder_fix")
        if isinstance(fix, str) and fix.strip():
            b += f"<p><b>Builder fix:</b> {esc(fix)}</p>"
        fu = as_list(daily.get("followups"))
        if fu:
            b += f"<p><b>Follow-ups drafted:</b> {esc(', '.join(fu))}</p>"
        cards.append(card("Morning brief", b, "", dsub))
        decide, do = as_list(daily.get("ceo_decide")), as_list(daily.get("ceo_do"))
        cb = ""
        cb += ("<h4>Decide today</h4><ul class='list'>" + "".join(f"<li>{esc(x)}</li>" for x in decide) + "</ul>") \
            if decide else "<h4>Decide today</h4>" + empty("Nothing in ceo_decide.")
        cb += ("<h4>Do today</h4><ul class='list'>" + "".join(f"<li>{esc(x)}</li>" for x in do) + "</ul>") \
            if do else "<h4>Do today</h4>" + empty("Nothing in ceo_do.")
        cards.append(card("CEO today", cb, "", dsub))
        news = as_dicts(daily.get("news"))
        if news:
            nc = []
            for n in news:
                nc.append(f'<article class="news"><a class="hl" href="{esc(safe_href(n.get("url")))}" rel="noopener noreferrer">'
                          f'{esc(n.get("headline", ""))}</a>' if safe_href(n.get("url")) else
                          f'<article class="news"><span class="hl">{esc(n.get("headline", ""))}</span>')
                nc[-1] += (f'<span class="muted">{esc(n.get("source", ""))}</span><p>{esc(n.get("why", ""))}</p>'
                           f'<p>{badge(n.get("action_type", "?"))} {esc(n.get("action", ""))}</p></article>')
            cards.append(card("News Radar", f'<div class="newsgrid">{"".join(nc)}</div>', "wide", dsub))
        else:
            cards.append(card("News Radar", empty("No news items in the latest run."), "wide"))
        aw = as_dicts(daily.get("acquirer_watch"))
        if aw:
            items = "".join(f"<li>{link(a.get('headline', ''), a.get('url'))}<br><span class='muted'>"
                            f"{esc(a.get('signal', ''))}</span></li>" for a in aw)
            cards.append(card("Acquirer watch", f'<ul class="list">{items}</ul>', "", dsub))
    else:
        cards.append(card("Morning brief", empty("No daily runs yet. Run <code>/daily-run</code>."), "wide"))

    counts = {s: 0 for s in LEAD_STATUSES}
    other = 0
    for r in leads:
        st = (r.get("status") or "").strip().upper()
        if st in counts:
            counts[st] += 1
        else:
            other += 1
    stats = "".join(f'<div class="stat" data-status="{s}"><b>{n}</b>{badge(s)}</div>' for s, n in counts.items())
    if other:
        stats += f'<div class="stat" data-status="OTHER"><b>{other}</b>{badge("other")}</div>'
    if leads:
        fresh = sorted(leads, key=lambda r: r.get("date_added") or "", reverse=True)[:10]
        def status_select(r):
            cur = (r.get("status") or "").strip().upper()
            opts = "".join(f'<option{" selected" if s == cur else ""}>{s}</option>' for s in LEAD_STATUSES)
            return (f'<select class="lead-status" data-company="{esc(r.get("company"))}" data-current="{esc(cur)}" '
                    f'aria-label="Status of {esc(r.get("company"))}">{opts}</select>')
        rows = [[link(r.get("company") or "?", r.get("url")) + f"<div class='muted'>{esc(r.get('date_added'))}</div>",
                 esc(r.get("why_now")), esc(r.get("buyer_title")), status_select(r),
                 btn("Send opener", "lead-send", primary=st_(r) == "NEW", company=r.get("company") or "")]
                for r in fresh]
        lb = f'<div class="stats">{stats}</div>' + table(["Company", "Why now", "Buyer", "Status", ""], rows)
    else:
        lb = f'<div class="stats">{stats}</div>' + empty("No leads yet. The seller adds 5 per <code>/daily-run</code>; "
                                                         "update statuses with <code>/log</code>.")
    cards.append(card("Fresh leads", lb, "wide", f"data/leads.csv · {len(leads)} total"))

    queue = sorted([d for d in drafts if d["status"] in ("DRAFT", "APPROVED")], key=send_key)
    if queue:
        rows = []
        for d in queue:
            flags = []
            if d["superseded"]:
                flags.append(badge("Superseded") + f"<div class='muted'>{esc(d['superseded'])}</div>")
            elif d["blocked"]:
                flags.append(badge("BLOCKED") + f"<div class='muted'>{esc(d['blocked'])}</div>")
            elif d["age"] is not None and d["age"] > DRAFT_STALE_DAYS:
                flags.append(badge("STALE") + f"<div class='muted'>older than {DRAFT_STALE_DAYS} days</div>")
            v = d["verdict"]
            rows.append([link(d["title"], f"outbox/{d['file']}") + f"<div class='muted'>"
                         + (f"send {esc(d['send_on'])} · " if d["send_on"] else "") + f"{esc(d['file'])}</div>",
                         esc(d["agent"]), esc("" if d["age"] is None else f"{d['age']}d"),
                         (badge(v[0]) + f" <span class='muted'>{esc(v[1])}</span>") if v else
                         "<span class='muted'>not reviewed</span>", "".join(flags),
                         btn("Archive", "archive", file=d["file"]) if d["superseded"] else
                         btn("Review & approve", "draft", file=d["file"])])
        qb = table(["Draft", "Agent", "Age", "Reviewer", "Flags", ""], rows)
    else:
        qb = empty("Nothing waiting. Agents draft into outbox/ during <code>/daily-run</code>.")
    qb += ("<p class='muted'>Oldest first. Approve: change <code>Status: DRAFT</code> to "
           "<code>Status: APPROVED</code>, then send it yourself.</p>")
    cards.append(card("Approval queue", qb, "wide", f"outbox/ · {len(queue)} DRAFT"))
    h.append(section("Today", cards, "today"))

    # 7. PATH TO ACQUISITION
    cards = []
    cur = next((n for n, p in enumerate(path) if not p["done"]), None)
    if path:
        steps = []
        for n, p in enumerate(path):
            cls = "done" if p["done"] else "cur" if n == cur else ""
            here = '<span class="here">You are here</span>' if n == cur else ""
            steps.append(f'<li class="{cls}"><span class="dot">{n + 1}</span><div><b>{esc(p["milestone"])}</b>'
                         f'{here}<div class="muted">owner: {esc(p["owner"])} · {linkify(p["evidence"])}</div></div></li>')
        tb = f'<ol class="timeline">{"".join(steps)}</ol>'
        if cur is None:
            tb += "<p>All milestones checked.</p>"
    else:
        tb = empty("No '## Path to acquisition' checklist in docs/exit-readiness.md.")
    cards.append(card("Timeline", tb, "wide", "docs/exit-readiness.md"))
    if gaps:
        pts = 100 / total_items if total_items else 0
        rows = [[str(n + 1), esc(g["item"]), esc(g["section"]), badge(g["status"]), esc(owner_tag(g["owner"])),
                 f"+{pts:.1f} pts", f"<span class='muted'>{esc(g['why'])}</span>"] for n, g in enumerate(gaps[:6])]
        gb = table(["#", "Gap", "Section", "Status", "Owner", "If DONE", "Why ranked here"], rows)
        gb += ("<p class='muted'>Ranked: sections feeding the next milestone first (x3), then the one after (x2); "
               "items that are the milestone itself on top. Each item is worth 100/N points of readiness.</p>")
    else:
        gb = empty("No NOT STARTED or [NEEDS DATA] items. Refresh scores with <code>/weekly-review</code>.")
    cards.append(card("Top gaps by impact", gb, "wide", f"{len(gaps)} open of {total_items} items"))
    h.append(section("Path to acquisition", cards, "path"))

    # 8. NEXT 5 ACTIONS
    if acts:
        ab = '<ol class="actions">' + "".join(
            f'<li><span class="tag{" founder" if o == "Founder" else ""}">{esc(o)}</span><span>{t}</span></li>'
            for _, o, t, _ in acts) + "</ol>"
    else:
        ab = empty("Nothing urgent.")
    h.append(section("Next 5 actions", [card("Ranked by readiness impact", ab, "wide")], "next"))

    # FOOTER
    ws = ""
    if warnings:
        ws = (f'<details><summary>{len(warnings)} warning(s)</summary><ul class="warn">' +
              "".join(f"<li>{esc(w)}</li>" for w in warnings) + "</ul></details>")
    else:
        ws = "<p>0 warning(s)</p>"
    h.append(f'<footer><p>Last updated: <b>{esc(dt.datetime.now().strftime("%Y-%m-%d %H:%M"))}</b> '
             f'by scripts/build_dashboard.py (read-only). Chart.js 4.4.1 from cdnjs is the only external resource.</p>'
             f'{ws}<p class="muted">Sources read: ' + ", ".join(f"<code>{esc(s)}</code>" for s in sources) +
             "</p></footer>")

    dash = {
        "today": TODAY.isoformat(),
        "drafts": [{"file": d["file"], "title": d["title"], "agent": d["agent"], "status": d["status"],
                    "verdict": d["verdict"][0] if d["verdict"] else "", "note": d["verdict"][1] if d["verdict"] else "",
                    "superseded": bool(d["superseded"]), "age": d["age"], "to": d["to"], "channel": d["channel"],
                    "sendOn": d["send_on"], "subject": d["subject"], "blocked": d["blocked"]} for d in drafts],
        "leads": [{"company": r.get("company") or "", "url": r.get("url") if safe_href(r.get("url") or "") else "",
                   "opener": r.get("opener") or "", "status": st_(r), "buyer": r.get("buyer_title") or ""} for r in leads],
        "decisions": [{"label": d.split(":")[0].strip(), "text": d,
                       "deadline": bool(re.search(r"deadline|date", d.split(":")[0], re.I))} for d in decisions],
        "readiness": [{"item": i["item"], "status": i["status"], "evidence": i["evidence"], "section": i["section"],
                       "owner": i["owner"]} for s in sections for i in s["items"]],
        "metricFields": ["candidates", "hiring_teams", "paying_teams", "matches", "conversations", "hires", "mrr",
                         "post_impressions", "outreach_sent", "replies", "demos"],
        "leadStatuses": list(LEAD_STATUSES), "readinessStatuses": list(STATUSES),
        "latestMetrics": {k: v for k, v in latest.items() if k != "date"},
    }

    def js_json(o):
        return json.dumps(o).replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")

    dash["meetings"] = [{"id": m["id"], "subject": m.get("subject") or "", "date": m["date"], "status": m["status"],
                         "problem": m.get("problem") or "", "desired": m.get("desired_output") or ""}
                        for m in load_meetings()]
    dash["members"] = ["Founder", "Bui", "Rev", "Mark", "Selly", "Rizer", "Desi", "Avi"]
    nav = ('<nav class="sitenav" aria-label="Site"><a class="brandlink" href="?p=company"><span class="logo" aria-hidden="true">'
           '</span><b>JobsMatchNow</b></a><a class="tab" data-page="company" href="?p=company">Company</a>'
           '<a class="tab" data-page="team" href="?p=team">Our team</a>'
           '<a class="tab" data-page="command" href="?p=command">Command center</a>'
           '<a class="tab ext" href="https://jobsmatchnow.com/app/" target="_blank" rel="noopener noreferrer">Open the app ↗</a></nav>')
    h = ([nav, '<div class="page" data-page="company">', company_html, '</div>',
          '<div class="page" data-page="team">', team_html, '</div>',
          '<div class="page" data-page="command">', command_top] + h + ['</div>'])
    page = (PAGE.replace("{{BODY}}", "\n".join(h)).replace("{{DATA}}", js_json(chart))
            .replace("{{DASH}}", js_json(dash)).replace("{{ACTION_JS}}", ACTION_JS).replace("{{CHART_JS}}", CHART_JS))
    return page, overall


# Client side of the founder actions: forms in a modal that POST to dash/server.mjs (which writes the files).
# Raw string so JS escapes like \n survive. Without the server (file:// or no token) only Copy/mail/links work.
ACTION_JS = r"""
(function(){
  /* Three pages in one file: ?p=company (default), ?p=team and ?p=command. Without JS all show. */
  var p='company'; try{ p=new URLSearchParams(location.search).get('p')||'company'; }catch(e){}
  if(location.hash.indexOf('#act=')===0||location.hash.indexOf('#mt-')===0) p='command';
  if(p!=='command'&&p!=='team') p='company';
  document.documentElement.setAttribute('data-p',p);
  var tabs=document.querySelectorAll('.sitenav .tab[data-page]');
  for(var i=0;i<tabs.length;i++) tabs[i].classList.toggle('on',tabs[i].getAttribute('data-page')===p);
})();
(function(){
  var D; try{ D=JSON.parse(document.getElementById('dash-data').textContent); }catch(e){ return; }
  var meta=document.querySelector('meta[name="dash-token"]'), TOKEN=meta?meta.content:'';
  var LIVE=location.protocol.indexOf('http')===0 && TOKEN && TOKEN.indexOf('__')!==0;
  document.documentElement.classList.toggle('live', !!LIVE);
  var modal=document.getElementById('modal'), mt=document.getElementById('m-title'), mb=document.getElementById('m-body'),
      me=document.getElementById('m-err'), lastFocus=null;

  function el(tag, attrs, kids){
    var e=document.createElement(tag);
    Object.keys(attrs||{}).forEach(function(k){
      var v=attrs[k];
      if(v===null||v===undefined) return;
      if(k==='text') e.textContent=v;
      else if(k.indexOf('on')===0) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    });
    (kids||[]).forEach(function(c){ if(c) e.appendChild(typeof c==='string'?document.createTextNode(c):c); });
    return e;
  }
  function toast(msg){ var t=document.getElementById('toast'); t.textContent=msg; t.hidden=false; clearTimeout(t._h); t._h=setTimeout(function(){t.hidden=true;},4000); }
  function openM(title, nodes){
    lastFocus=document.activeElement; mt.textContent=title; mb.innerHTML=''; me.textContent='';
    nodes.forEach(function(n){ if(n) mb.appendChild(n); });
    modal.hidden=false; document.body.classList.add('noscroll');
    var f=mb.querySelector('input,textarea,select,button:not([disabled]),a[href]'); if(f) f.focus();
  }
  function closeM(){
    modal.hidden=true; document.body.classList.remove('noscroll');
    if(location.hash.indexOf('#act=')===0) history.replaceState(null,'',location.pathname+location.search);
    if(lastFocus&&lastFocus.focus) lastFocus.focus();
  }
  document.getElementById('m-close').addEventListener('click', closeM);
  modal.addEventListener('click', function(e){ if(e.target===modal) closeM(); });
  document.addEventListener('keydown', function(e){
    if(modal.hidden) return;
    if(e.key==='Escape'){ closeM(); return; }
    if(e.key!=='Tab') return;
    var f=[].slice.call(modal.querySelectorAll('button,input,textarea,select,a[href]')).filter(function(x){return !x.disabled;});
    if(!f.length) return;
    var a=f[0], z=f[f.length-1];
    if(e.shiftKey&&document.activeElement===a){ z.focus(); e.preventDefault(); }
    else if(!e.shiftKey&&document.activeElement===z){ a.focus(); e.preventDefault(); }
  });

  var uid=0;
  function field(label, input, hint){
    var id='f'+(++uid); input.id=id;
    return el('div',{'class':'field'},[el('label',{'for':id,text:label}), input, hint?el('span',{'class':'muted',text:hint}):null]);
  }
  function inp(type, val, attrs){
    var i=type==='textarea'?el('textarea',attrs||{}):el('input',Object.assign({type:type},attrs||{}));
    if(val!==undefined&&val!==null) i.value=val; return i;
  }
  function sel(opts, val){
    var s=el('select');
    opts.forEach(function(o){ var op=el('option',{value:o[0],text:o[1]}); if(o[0]===val) op.selected=true; s.appendChild(op); });
    return s;
  }
  function check(label){ var c=el('input',{type:'checkbox'}); return {box:c, node:el('label',{'class':'check'},[c,' '+label])}; }
  function button(label, fn, cls, needsServer){
    var b=el('button',{type:'button','class':'act '+(cls||''),text:label,onclick:fn});
    if(needsServer!==false && !LIVE){ b.disabled=true; b.title='Start ./dash.sh to use this'; }
    return b;
  }
  function linkA(label, href){ return /^(https?:|mailto:)/i.test(href)?el('a',{href:href,target:'_blank',rel:'noopener noreferrer','class':'act'},[label]):null; }
  function row(){ return el('div',{'class':'mrow'},[].slice.call(arguments)); }
  function find(list,k,v){ for(var i=0;i<list.length;i++) if(list[i][k]===v) return list[i]; return null; }

  function post(action, body, b){
    me.textContent=''; if(b) b.disabled=true;
    return fetch('/api/'+action,{method:'POST',headers:{'Content-Type':'application/json','X-Dash-Token':TOKEN},body:JSON.stringify(body)})
      .then(function(r){ return r.json().catch(function(){ return {ok:false,message:'Unexpected response from the server.'}; }); })
      .then(function(j){
        if(j.ok){ try{ sessionStorage.setItem('dash-toast', j.message); }catch(e){}
          history.replaceState(null,'',location.pathname+location.search); location.reload(); }
        else { me.textContent=j.message||'Failed.'; if(b) b.disabled=false; }
      })
      .catch(function(){ me.textContent='Could not reach the dashboard server. Is ./dash.sh running?'; if(b) b.disabled=false; });
  }
  function copy(text){
    var done=function(){ toast('Copied. Paste it where you need it.'); };
    if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(text).then(done, fallback); } else fallback();
    function fallback(){ var t=el('textarea'); t.value=text; document.body.appendChild(t); t.select(); try{document.execCommand('copy');}catch(e){} t.remove(); done(); }
  }
  // What the contact receives: everything after the header block (Status/To/Channel/Send on/Subject/Founder notes).
  function messageBody(raw){
    var parts=String(raw||'').replace(/\r\n/g,'\n').split(/\n\s*\n/);
    if(parts.length>1 && /^Status:/m.test(parts[0])) parts.shift();
    return parts.join('\n\n').replace(/^Founder notes:.*\n?/gm,'').trim()+'\n';
  }
  function mail(subject, body){ location.href='mailto:?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body.slice(0,1800)); }

  var F={};
  F.draft=function(p){
    var d=find(D.drafts,'file',p.file); if(!d){ toast('Draft not found (archived?)'); return; }
    var ta=inp('textarea','Loading…',{rows:16,'class':'mono'});
    var note=inp('textarea','',{rows:2,placeholder:'What should the '+d.agent+' change?'});
    fetch('outbox/'+encodeURIComponent(d.file)+'?raw=1').then(function(r){ return r.ok?r.text():Promise.reject(); })
      .then(function(t){ ta.value=t; }).catch(function(){ ta.value='(Start ./dash.sh to load and edit the draft here.)'; });
    var text=function(){ return messageBody(ta.value); };
    var linkedin=/linkedin/i.test(d.channel||'')||d.agent==='marketer';
    var verdict=d.verdict ? el('p',{},[el('span',{'class':'badge '+(d.verdict==='PASS'?'ok':'bad'),text:d.verdict}),' Reviewer: '+d.note])
      : el('p',{'class':'warnbox',text:'Not reviewed yet. You can still approve it, or copy the reviewer prompt from the reviewer card.'});
    var co=(d.to||'').replace(/\s*\(.*$/,'');
    openM('Review: '+d.title,[
      d.to?el('p',{},[el('b',{text:'To: '}),d.to,el('br'),el('b',{text:'Channel: '}),d.channel||'?',
        d.sendOn?el('br'):null,d.sendOn?el('b',{text:'Send on: '}):null,d.sendOn||'',
        d.subject?el('br'):null,d.subject?el('b',{text:'Subject: '}):null,d.subject||'']):null,
      el('p',{'class':'muted',text:d.file+' · '+d.agent+' · '+d.status+(d.age!==null?' · '+d.age+'d old':'')}), verdict,
      d.blocked?el('p',{'class':'warnbox',text:'BLOCKED: '+d.blocked+'. Approve only if you decide to lift this block.'}):null,
      field('Message (the header lines above the first blank line are not sent; edit, then Save edits)', ta),
      row(d.status==='APPROVED'
            ? button('Mark sent',function(){ post('draft-status',{file:d.file,status:'SENT'},this); },'primary')
            : button('Approve',function(){ post('draft-status',{file:d.file,status:'APPROVED'},this); },'primary'),
          button('Save edits',function(){ post('draft-save',{file:d.file,text:ta.value},this); }),
          button('Copy message',function(){ copy(text()); },'',false),
          linkedin?null:button('Open email',function(){ mail(d.subject||d.title, text()); },'',false),
          linkedin?linkA(/note/i.test(d.channel||'')&&co?'Find on LinkedIn':'Open LinkedIn',
            /note/i.test(d.channel||'')&&co?'https://www.linkedin.com/search/results/companies/?keywords='+encodeURIComponent(co)
              :'https://www.linkedin.com/feed/'):null,
          button('Archive',function(){ if(confirm('Move this draft to outbox/archive/? Nothing is deleted.')) post('draft-archive',{file:d.file},this); },'danger')),
      el('p',{'class':'muted',text:'Approving does not send anything: copy or email it, send it yourself, then Mark sent.'}),
      field('Request changes (sends it back to the '+d.agent+' via docs/feedback.md)', note),
      row(button('Request changes',function(){ post('draft-changes',{file:d.file,note:note.value},this); }))
    ]);
  };
  F.archive=function(p){
    openM('Archive draft',[el('p',{text:'Move '+p.file+' to outbox/archive/? Nothing is deleted.'}),
      row(button('Archive',function(){ post('draft-archive',{file:p.file},this); },'primary'))]);
  };
  F['lead-send']=function(p){
    var l=find(D.leads,'company',p.company); if(!l){ toast('Lead not found'); return; }
    var msg='Hi,\n\n'+(l.opener||'').split(' / ').join('\n\n')+'\n\nBest,\n';
    var ta=inp('textarea',msg,{rows:12}), subject='Remote engineers from Vietnam/SEA for '+l.company;
    // Prefer the reviewed first email for this company from outbox/ over the short opener in leads.csv.
    var e1=D.drafts.filter(function(x){ return !x.superseded && (x.to||'').indexOf(l.company)===0 && /email-1/.test(x.file); })[0];
    if(e1){ subject=e1.subject||subject;
      fetch('outbox/'+encodeURIComponent(e1.file)+'?raw=1').then(function(r){ return r.ok?r.text():Promise.reject(); })
        .then(function(t){ ta.value=messageBody(t); }).catch(function(){}); }
    openM('Send opener: '+l.company,[
      e1?el('p',{},[el('b',{text:'Email 1: '}),e1.subject+' · '+e1.status+(e1.verdict?' · reviewer '+e1.verdict:' · not reviewed yet')]):null,
      el('p',{'class':'muted',text:'Buyer: '+(l.buyer||'?')+' · status '+l.status+'. We store no personal emails: add the address in your mail app, or message them on LinkedIn.'}),
      field('Message (edit before you copy or email it)', ta),
      row(button('Copy message',function(){ copy(ta.value); },'',false),
          button('Open email',function(){ mail(subject, ta.value); },'',false),
          linkA('Find on LinkedIn','https://www.linkedin.com/search/results/companies/?keywords='+encodeURIComponent(l.company)),
          l.url?linkA('Careers page',l.url):null),
      el('p',{'class':'muted',text:'Sent it yourself? Then:'}),
      row(button('Mark contacted',function(){ post('lead-status',{company:l.company,status:'CONTACTED'},this); },'primary'),
          button('Log a reply',function(){ F.feedback({company:l.company,source:'reply'}); }))
    ]);
  };
  F.metrics=function(){
    var date=inp('date',D.today), inputs={};
    var nodes=[el('p',{'class':'muted',text:'Running totals to date (MRR = USD per month now). Blank = unknown. Writes data/metrics_history.csv and docs/metrics.md, same as /log-metrics.'}), field('Date',date)];
    var grid=el('div',{'class':'fgrid'});
    D.metricFields.forEach(function(f){ inputs[f]=inp('number','',{min:'0',step:'any',inputmode:'decimal',placeholder:D.latestMetrics[f]?('last: '+D.latestMetrics[f]):''}); grid.appendChild(field(f,inputs[f])); });
    nodes.push(grid, el('p',{'class':'muted',text:'Tip: app counts come from GET /api/admin/analytics/events (demo excluded).'}));
    nodes.push(row(button('Save metrics',function(){ var v={}; Object.keys(inputs).forEach(function(k){ v[k]=inputs[k].value; }); post('metrics',{date:date.value,values:v},this); },'primary')));
    openM('Log metrics', nodes);
  };
  F.decision=function(p){
    var d=find(D.decisions,'label',p.decision||'');
    var name=inp('text',d?d.label:'',{placeholder:'e.g. Pricing to test'});
    var isDate=d?d.deadline:false;
    var choice=isDate?inp('date',''):inp('textarea','',{rows:2,placeholder:'Your choice'});
    var reason=inp('textarea','',{rows:2,placeholder:'Why (agents read this)'}), revisit=inp('text','',{placeholder:'e.g. after the first 3 pilots'});
    openM(d?('Decide: '+d.label):'New decision',[
      d?el('p',{'class':'muted',text:d.text}):field('Decision',name),
      field(isDate?'Date':'Choice',choice), field('Reason',reason), field('Revisit when',revisit),
      el('p',{'class':'muted',text:'Saved to docs/decisions.md (agents must follow it)'+(isDate?'; the deck date also replaces [DATE] in CLAUDE.md.':'.')}),
      row(button('Record decision',function(){ post('decision',{decision:d?d.label:name.value,choice:choice.value,reason:reason.value,revisit:revisit.value},this); },'primary'))
    ]);
  };
  F['start-date']=function(){
    var date=inp('date',D.today);
    openM('Set start date',[field('Start date (days since start counts from this)',date),
      row(button('Save',function(){ post('start-date',{date:date.value},this); },'primary'))]);
  };
  F.feedback=function(p){
    p=p||{};
    var source=sel([['reply','Prospect reply'],['call','Call'],['user comment','User comment'],['investor','Investor']],p.source||'reply');
    var opts=[['','(other / not a lead)']].concat(D.leads.map(function(l){ return [l.company,l.company+' ('+l.status+')']; }));
    var company=sel(opts,p.company||''), other=inp('text','',{placeholder:'Company name'});
    var role=inp('text','',{placeholder:'e.g. CTO (no names, emails or phones)'});
    var said=inp('textarea','',{rows:3,placeholder:'What they said, short and faithful'});
    var action=inp('text','',{placeholder:'Next step, e.g. follow-up draft'});
    var st=sel([['','(no change)']].concat(D.leadStatuses.map(function(s){return [s,s];})),'');
    var back=check('Yes, move the status backwards'), obj=check('Also add it to docs/objections.md');
    var otype=sel([['sales','sales'],['investor','investor']],'sales');
    openM('Log feedback',[
      el('p',{'class':'muted',text:'Same as /log: appends to docs/feedback.md, which every agent reads before working.'}),
      field('Source',source), field('Lead',company), field('Company (if not a lead)',other), field('Person role',role),
      field('What they said',said), field('Next action',action), field('Change lead status',st,'Forward only: NEW → CONTACTED → REPLIED → DEMO → PILOT → PAID'),
      back.node, obj.node, field('Objection type',otype),
      row(button('Save',function(){ post('feedback',{source:source.value,company:company.value||other.value,role:role.value,said:said.value,
        action:action.value,leadStatus:company.value?st.value:'',confirmBack:back.box.checked,asObjection:obj.box.checked,objectionType:otype.value},this); },'primary'))
    ]);
  };
  F.readiness=function(p){
    p=p||{};
    var item=sel(D.readiness.map(function(i){ return [i.item,i.section+': '+i.item]; }),p.item||'');
    var cur=function(){ return find(D.readiness,'item',item.value)||{}; };
    var status=sel(D.readinessStatuses.map(function(s){return [s,s];}),cur().status), ev=inp('text',cur().evidence||'',{placeholder:'docs/... or https://...'});
    item.addEventListener('change',function(){ status.value=cur().status; ev.value=cur().evidence||''; });
    openM('Update readiness item',[field('Item',item), field('Status',status), field('Evidence',ev,'DONE needs a repo path or https link'),
      row(button('Save',function(){ post('readiness',{item:item.value,status:status.value,evidence:ev.value},this); },'primary'))]);
  };
  F['meeting-propose']=function(){
    var by=sel(D.members.map(function(m){ return [m,m]; }),'Founder');
    var type=sel([['urgent','Urgent meeting'],['team','Team meeting'],['advisor','Advisor session'],['weekly','Weekly'],['deadline','Deadline']],'urgent');
    var date=inp('date',D.today), time=inp('time','');
    var subject=inp('text','',{placeholder:'e.g. YC + speedrun: apply or not?'});
    var problem=inp('textarea','',{rows:3,placeholder:'The problem to solve'});
    var out=inp('textarea','',{rows:2,placeholder:'What the meeting must produce, e.g. a yes/no and the next 3 actions'});
    openM('Propose a meeting',[
      el('p',{'class':'muted',text:'Saved to data/meetings.csv as PROPOSED. Run it in Claude Code: every member speaks in order, then you decide the final next action.'}),
      field('Requested by',by), field('Type',type), field('Date',date), field('Time (optional)',time),
      field('Subject',subject), field('Problem to solve',problem), field('Desired output',out),
      row(button('Propose',function(){ post('meeting-propose',{requestedBy:by.value,type:type.value,date:date.value,time:time.value,
        subject:subject.value,problem:problem.value,desiredOutput:out.value},this); },'primary'))
    ]);
  };
  F['ceo-review']=function(p){
    var labels={YES:'Yes: approve',NO:'No: reiterate',DELAY:'Delay: next cycle'};
    var note=inp('textarea','',{rows:3,placeholder:p.decision==='NO'?'What must change (required)':'Optional note to '+p.member});
    openM(p.member+' · '+p.stage+' task: '+labels[p.decision],[
      el('p',{'class':'muted',text:'Saved to data/ceo_reviews.csv and posted to '+p.member+' on the team board, so they adapt in the next cycle.'}),
      field('Note',note),
      row(button('Confirm '+p.decision,function(){ post('ceo-review',{stage:p.stage,member:p.member,decision:p.decision,note:note.value},this); },'primary'))
    ]);
  };
  F['meeting-decide']=function(p){
    var m=find(D.meetings,'id',p.id)||{};
    var dec=inp('textarea','',{rows:3,placeholder:'The final next action: what, who, by when'});
    var rev=inp('text','',{placeholder:'Revisit when (optional)'});
    openM('Decide: '+(m.subject||p.id),[
      el('p',{'class':'muted',text:(m.problem||'')+(m.desired?' Desired output: '+m.desired:'')}),
      field('Your decision',dec), field('Revisit when',rev),
      row(button('Record decision',function(){ post('meeting-decide',{id:p.id,decision:dec.value,revisit:rev.value},this); },'primary'))
    ]);
  };
  function list(title, items, empty){
    openM(title, items.length?[el('ul',{'class':'mlist'},items)]:[el('p',{'class':'empty',text:empty})]);
  }
  F['drafts-list']=function(){
    var sk=function(d){ var m=/\d{4}-\d{2}-\d{2}/.exec(d.sendOn||''); return (m?m[0]:'9999')+d.file; };
    list('Messages waiting for you (by send date)', D.drafts.filter(function(d){ return (d.status==='DRAFT'||d.status==='APPROVED'); })
      .sort(function(a,b){ return sk(a)<sk(b)?-1:1; }).map(function(d){
        return el('li',{},[el('span',{text:d.title+' · '+d.agent+' · '+(d.superseded?'superseded':d.status)+(d.verdict?' · '+d.verdict:' · not reviewed')}),
          d.superseded?button('Archive',function(){ F.archive({file:d.file}); },'',false):button('Open',function(){ F.draft({file:d.file}); },'primary',false)]);
      }), 'Nothing waiting.');
  };
  F['leads-list']=function(){
    list('NEW leads to contact', D.leads.filter(function(l){ return l.status==='NEW'; }).map(function(l){
      return el('li',{},[el('span',{text:l.company+' · '+l.buyer}), button('Send opener',function(){ F['lead-send']({company:l.company}); },'primary',false)]);
    }), 'No NEW leads. The seller adds 5 per /daily-run.');
  };
  F['decisions-list']=function(){
    list('Open decisions', D.decisions.map(function(d){
      return el('li',{},[el('span',{text:d.text}), button('Decide',function(){ F.decision({decision:d.label}); },'primary',false)]);
    }).concat([el('li',{},[el('span',{text:'Something else'}), button('New decision',function(){ F.decision({}); },'',false)])]), '');
  };
  F['next-founder']=function(){
    var b=document.querySelector('.founder-card button[data-act]'); if(b) b.click(); else toast('Nothing open for you.');
  };

  document.addEventListener('click', function(e){
    var b=e.target.closest?e.target.closest('button[data-act]'):null; if(!b||b.disabled) return;
    var p={}; Object.keys(b.dataset).forEach(function(k){ p[k]=b.dataset[k]; });
    var a=p.act; delete p.act;
    if(a==='copy'){ copy(p.text||''); return; }
    if(F[a]) F[a](p);
  });
  document.addEventListener('change', function(e){
    var s=e.target; if(!s.classList||!s.classList.contains('lead-status')) return;
    if(!LIVE){ toast('Start ./dash.sh to change statuses.'); s.value=s.dataset.current; return; }
    var back=D.leadStatuses.indexOf(s.value)<D.leadStatuses.indexOf(s.dataset.current);
    if(back&&!confirm('Move '+s.dataset.company+' back from '+s.dataset.current+' to '+s.value+'?')){ s.value=s.dataset.current; return; }
    fetch('/api/lead-status',{method:'POST',headers:{'Content-Type':'application/json','X-Dash-Token':TOKEN},
      body:JSON.stringify({company:s.dataset.company,status:s.value,confirmBack:back})})
      .then(function(r){ return r.json(); }).then(function(j){
        if(j.ok){ try{ sessionStorage.setItem('dash-toast', j.message); }catch(e){} location.reload(); }
        else { toast(j.message); s.value=s.dataset.current; }
      }).catch(function(){ toast('Could not reach the dashboard server.'); s.value=s.dataset.current; });
  });
  function fromHash(){
    if(location.hash.indexOf('#act=')!==0) return;
    var p={}; location.hash.slice(1).split('&').forEach(function(kv){ var i=kv.indexOf('='); if(i>0) p[decodeURIComponent(kv.slice(0,i))]=decodeURIComponent(kv.slice(i+1)); });
    var a=p.act; delete p.act; if(F[a]) F[a](p);
  }
  window.addEventListener('hashchange', fromHash);
  fromHash();
  try{ var t=sessionStorage.getItem('dash-toast'); if(t){ sessionStorage.removeItem('dash-toast'); toast(t); } }catch(e){}
})();
"""


PAGE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta name="dash-token" content="__DASH_TOKEN__">
<title>JobsMatchNow Command Center</title>
<style>
:root{--bg:#f5f6fb;--card:#fff;--text:#1b2340;--muted:#647090;--line:#e3e6f0;--accent:#fd267a;--accent2:#ff7a3d;
--navy2:#3b4a8c;--ok:#1f9d55;--mid:#b86e00;--bad:#d62d4a;--na:#8a90a6;--chip:#eff1f8;--shadow:0 1px 3px rgba(27,35,64,.06)}
@media (prefers-color-scheme: dark){:root{--bg:#0e1222;--card:#161b31;--text:#e8eaf4;--muted:#9ba3c0;--line:#2a3150;
--chip:#222846;--navy2:#8fa2ff;--ok:#4cc38a;--mid:#e3a63b;--bad:#ff6b81;--shadow:none}}
*{box-sizing:border-box}
html,body{max-width:100%;overflow-x:hidden}
body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
body::before{content:"";display:block;height:4px;background:linear-gradient(90deg,var(--accent),var(--accent2))}
main{max-width:1600px;margin:0 auto;padding:20px 16px 40px}
section{margin-top:28px}
h1{margin:0;font-size:20px}h2{margin:0 0 10px;font-size:17px}h3{margin:0 0 10px;font-size:14px}
h4{margin:10px 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}
h2 small,h3 small{font-weight:400;color:var(--muted);font-size:12px;margin-left:6px}
p{margin:6px 0}.muted{color:var(--muted);font-size:12px}
a{color:var(--accent);text-decoration:none;overflow-wrap:anywhere}a:hover{text-decoration:underline}
code{background:var(--chip);padding:1px 5px;border-radius:5px;font-size:12px}
.brand{display:flex;gap:12px;align-items:center}
.logo{width:40px;height:40px;border-radius:12px;background:linear-gradient(135deg,var(--accent),var(--accent2));flex:none}
.hero{display:grid;gap:12px;margin-top:16px;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr))}
.stat-big,.kpi,.card{background:var(--card);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow);min-width:0}
.stat-big{padding:14px 16px;display:flex;flex-direction:column;gap:4px}
.stat-big b{font-size:34px;line-height:1.1}
.stat-big.ns{border-color:var(--accent)}
.stat-big b,.kpi b{background:linear-gradient(90deg,var(--accent),var(--accent2));-webkit-background-clip:text;background-clip:text;color:transparent}
b.nd,.nd{background:none!important;color:var(--na)!important;-webkit-text-fill-color:var(--na);font-size:16px}
.lbl{font-size:12px;color:var(--muted);font-weight:600}.delta{font-size:12px}.src{font-size:11px;color:var(--muted);overflow-wrap:anywhere}
.kpis{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr))}
.kpi{padding:10px 12px;display:flex;flex-direction:column;gap:2px}.kpi b{font-size:22px}
.grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr))}
.card{padding:16px}.wide{grid-column:1/-1}
.tw{overflow-x:auto;max-width:100%}
table.tl{font-size:13px;border-collapse:separate;border-spacing:0}
table.tl td,table.tl th{min-width:150px;vertical-align:top}
table.tl th[scope=row]{position:sticky;left:0;z-index:1;background:var(--card,var(--bg));min-width:110px}
table.tl .cur{background:var(--chip);box-shadow:inset 2px 0 0 #fd267a,inset -2px 0 0 #fd267a}
table.tl thead .cur{box-shadow:inset 2px 0 0 #fd267a,inset -2px 0 0 #fd267a,inset 0 2px 0 #fd267a}
table.tl td.future{color:var(--muted)}table.tl tr.comp td{font-size:12px}
table.tl .done{box-shadow:inset 0 2px 0 var(--ok)}
.intro .who{display:flex;gap:10px;align-items:center}.intro h3{margin:0}
.intro .av{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;font-weight:700;color:#fff;
background:linear-gradient(135deg,#fd267a,#ff7a00);flex:none}
.intro .quote{font-style:italic;margin:10px 0}.small{font-size:12px}
.step h3{display:flex;gap:8px;align-items:center}.stepn{display:inline-grid;place-items:center;width:28px;height:28px;
border-radius:50%;color:#fff;background:linear-gradient(135deg,#fd267a,#ff7a00);font-size:15px;flex:none}
.stagehead{font-size:15px}
html[data-p] .page{display:none}
html[data-p="company"] .page[data-page="company"],html[data-p="team"] .page[data-page="team"],
html[data-p="command"] .page[data-page="command"]{display:block}
.crew svg,.crew img{display:block;width:100%;height:auto;border-radius:10px}.crew{padding:8px}
.wf{display:flex;gap:8px;overflow-x:auto;padding-bottom:6px;align-items:stretch}
.wf-step{flex:0 0 250px;background:var(--chip);border-radius:12px;padding:12px;position:relative}
.wf-step h3{margin:4px 0 2px}.wf-n{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;color:#fff;
font-weight:700;background:linear-gradient(135deg,#fd267a,#ff7a00)}
.wf-arrow{flex:none;align-self:center;font-size:22px;color:var(--accent)}
.wf-who{list-style:none;padding:0;margin:8px 0;display:grid;gap:8px}.wf-who li{display:flex;gap:8px;align-items:flex-start;font-size:13px}
.av.sm{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;font-size:11px;font-weight:700;color:#fff;
background:linear-gradient(135deg,#fd267a,#ff7a00);flex:none}
.wf-out{border-top:1px solid var(--line);padding-top:6px;font-size:13px}
table.wf-mx td{text-align:center;color:var(--accent);font-size:16px}table.wf-mx th{font-size:12px}
.loopstrip{list-style:none;padding:0;margin:0;display:flex;flex-wrap:wrap;gap:8px}
.loopstrip li{display:flex;flex-direction:column;background:var(--chip);border-radius:10px;padding:8px 12px;position:relative}
.loopstrip li:not(:last-child)::after{content:"→";position:absolute;right:-9px;top:50%;transform:translateY(-50%);color:var(--accent)}
.sitenav{position:sticky;top:0;z-index:20;display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;padding:10px 16px;
background:var(--card);border-bottom:1px solid var(--line);box-shadow:var(--shadow)}
.sitenav .brandlink{display:flex;gap:8px;align-items:center;color:var(--text);margin-right:auto}
.sitenav .logo{width:26px;height:26px;border-radius:8px}
.sitenav .tab{padding:6px 12px;border-radius:99px;color:var(--text);font-weight:600}
.sitenav .tab.on{background:linear-gradient(90deg,var(--accent),var(--accent2));color:#fff}
.sitenav .tab.ext{color:var(--accent)}
.cals{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr))}
.calg{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:3px}
.dh{font-size:11px;color:var(--muted);text-align:center}
.day{min-height:64px;background:var(--chip);border-radius:8px;padding:3px;display:flex;flex-direction:column;gap:2px;min-width:0}
.day.out{opacity:.4}.day.today{outline:2px solid var(--accent)}.dn{font-size:11px;color:var(--muted)}
.chip{display:block;font-size:10.5px;line-height:1.25;padding:2px 4px;border-radius:5px;background:var(--card);color:var(--text);
overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border-left:3px solid var(--na)}
span.chip{display:inline-block;margin-right:4px}
.chip.bad{border-left-color:var(--bad)}.chip.ok{border-left-color:var(--ok)}.chip.mid{border-left-color:var(--mid)}
.mt .mtacts{display:flex;gap:8px;flex-wrap:wrap}
.ceobtns{display:flex;gap:6px;flex-wrap:nowrap}.ceobtns button{padding:4px 12px;font-size:12px}.ceobtns .deep{display:none}
.tasktbl table{min-width:1100px}.tasktbl td:nth-child(1){min-width:80px;white-space:nowrap}
.tasktbl td:nth-child(2){min-width:150px}.tasktbl td:nth-child(3){min-width:380px}
.tasktbl td:nth-child(4){min-width:230px}.tasktbl td:nth-child(5){min-width:200px}
.urgent{border-left:4px solid var(--bad)}.urgent summary{cursor:pointer;font-size:16px;padding:2px 0}
.chat{list-style:none;padding:0;margin:8px 0;display:grid;gap:10px}
.turn{display:flex;gap:10px;align-items:flex-start}.turn p{margin:2px 0 0}
.turn div{background:var(--chip);border-radius:12px;padding:8px 12px;flex:1}
.turn .av{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;font-weight:700;color:#fff;
background:linear-gradient(135deg,#fd267a,#ff7a00);flex:none}
.ceo{border:2px solid var(--bad);border-radius:12px;padding:10px 14px;margin-top:12px}.ceo.done{border-color:var(--ok)}
.biz{border-top:4px solid #fd267a}.biz p:first-of-type b{font-size:20px;background:linear-gradient(90deg,#fd267a,#ff7a00);
-webkit-background-clip:text;background-clip:text;color:transparent}.mission p:first-of-type{font-size:17px;font-weight:600}.cols{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}
td{overflow-wrap:anywhere}th{font-size:12px;color:var(--muted);font-weight:600}
.badge{display:inline-block;font-size:11px;font-weight:600;padding:1px 8px;border-radius:99px;background:var(--chip);color:var(--na);white-space:nowrap}
.badge.ok{color:var(--ok)}.badge.mid{color:var(--mid)}.badge.bad{color:var(--bad)}.badge.no{color:var(--muted)}
.row{display:grid;grid-template-columns:minmax(90px,1fr) 2fr 44px;gap:10px;align-items:center;padding:4px 0}
summary{cursor:pointer}summary.row{list-style:none}summary.row::-webkit-details-marker{display:none}
details .tw{margin:4px 0 12px}
.bar{height:8px;background:var(--chip);border-radius:99px;overflow:hidden}
.bar span{display:block;height:100%;background:linear-gradient(90deg,var(--accent),var(--accent2))}
.empty{color:var(--muted);font-style:italic}
.list{margin:0;padding-left:18px}.list li{margin:3px 0}
.chartbox{display:none;position:relative;height:260px}.chartbox.short{height:240px}
.charts .chartbox{display:block}.charts .fallback,.charts .chart-note{display:none}
.newsgrid{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr))}
.news{border:1px solid var(--line);border-radius:12px;padding:10px 12px;min-width:0}.news .hl{display:block;font-weight:600}
.stats{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px}
.stat{display:flex;align-items:center;gap:6px;background:var(--chip);border-radius:10px;padding:4px 10px}
.timeline{list-style:none;padding:0;margin:0;display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr))}
.timeline li{display:flex;gap:10px;align-items:flex-start;color:var(--muted);min-width:0}
.timeline .dot{flex:none;width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font-size:12px;
font-weight:700;border:2px solid var(--line);background:var(--card)}
.timeline li.done .dot{background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;border-color:transparent}
.timeline li.done b{text-decoration:line-through}
.timeline li.cur{color:var(--text)}.timeline li.cur .dot{border-color:var(--accent);color:var(--accent)}
.here{display:inline-block;margin-left:6px;font-size:11px;color:#fff;background:linear-gradient(90deg,var(--accent),var(--accent2));
border-radius:99px;padding:0 8px}
.actions{margin:0;padding-left:20px}.actions li{margin:8px 0}.actions li span+span{margin-left:6px}
.tag{display:inline-block;font-size:11px;font-weight:700;padding:1px 8px;border-radius:6px;background:var(--chip);color:var(--navy2)}
.tag.founder{background:linear-gradient(90deg,var(--accent),var(--accent2));color:#fff}
.warn{color:var(--mid);font-size:13px}
footer{margin-top:32px;padding-top:12px;border-top:1px solid var(--line);font-size:12px;color:var(--muted);overflow-wrap:anywhere}
.spark{display:block;margin:2px 0}
.founder-card{border-color:var(--accent);border-width:2px}
.results{margin:0 0 8px;font-size:13px}
#status .kpi b{font-size:18px}
.act{font:inherit;font-size:12px;font-weight:600;padding:4px 10px;border-radius:8px;border:1px solid var(--line);
background:var(--card);color:var(--text);cursor:pointer;margin:2px 4px 2px 0;display:inline-block;text-decoration:none;white-space:nowrap}
.act:hover{border-color:var(--accent);text-decoration:none}
.act.primary{background:linear-gradient(90deg,var(--accent),var(--accent2));color:#fff;border-color:transparent}
.act.danger{color:var(--bad)}.act[disabled]{opacity:.45;cursor:not-allowed}
.act:focus-visible,a:focus-visible,select:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.deep{font-size:11px;color:var(--muted);margin-right:6px}
html:not(.live) button.act[data-act]:not([data-act="copy"]):not([data-act="lead-send"]):not([data-act$="-list"]):not([data-act="draft"]):not([data-act="next-founder"]){opacity:.45;pointer-events:none}
.ctabar{position:sticky;top:0;z-index:5;display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:14px 0 0;padding:10px 12px;
background:var(--card);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow)}
.ctabar .act{font-size:13px;padding:6px 12px}
.offline-note{display:none}html:not(.live) .offline-note{display:inline}
.mstate{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.working{margin:6px 0}
.acts li{margin:6px 0}.mlinks{margin-top:8px}
.cta{margin-top:10px;border-top:1px solid var(--line);padding-top:8px}
.chartbox.pie{height:210px}.legend{list-style:none;padding:0;margin:6px 0 0;display:flex;flex-wrap:wrap;gap:4px 12px;font-size:12px}
.charts .legend{display:none}
select{font:inherit;font-size:12px;padding:3px 6px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--text)}
.modal{position:fixed;inset:0;z-index:50;background:rgba(14,18,34,.55);display:flex;align-items:flex-start;justify-content:center;padding:5vh 14px;overflow:auto}
.modal[hidden]{display:none}
.sheet{background:var(--card);color:var(--text);border-radius:16px;width:min(720px,100%);padding:16px 18px;box-shadow:0 10px 40px rgba(0,0,0,.25)}
.sheet header{display:flex;justify-content:space-between;align-items:center;gap:10px;border-bottom:3px solid var(--accent);padding-bottom:8px;margin-bottom:10px}
.sheet h3{margin:0;font-size:16px}.x{font-size:22px;line-height:1;background:none;border:0;color:var(--muted);cursor:pointer}
.field{display:flex;flex-direction:column;gap:3px;margin:8px 0}.field label{font-size:12px;font-weight:600;color:var(--muted)}
.field input,.field textarea,.field select{font:inherit;font-size:14px;padding:7px 9px;border-radius:9px;border:1px solid var(--line);background:var(--bg);color:var(--text);width:100%}
.mono{font-family:ui-monospace,Consolas,monospace;font-size:12px}
.fgrid{display:grid;gap:0 10px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}
.mrow{display:flex;flex-wrap:wrap;gap:4px;margin:8px 0}.check{display:block;font-size:13px;margin:6px 0}
.mlist{list-style:none;padding:0;margin:0}.mlist li{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid var(--line)}
.err{color:var(--bad);font-weight:600;min-height:1em}.warnbox{background:var(--chip);border-left:3px solid var(--mid);padding:6px 10px;border-radius:6px}
.noscroll{overflow:hidden}
#toast{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);z-index:60;background:var(--text);color:var(--bg);padding:10px 16px;border-radius:12px;font-weight:600;max-width:90vw}
@media (max-width:600px){.modal{padding:0}.sheet{border-radius:0;min-height:100%}.ctabar{position:static}}
</style></head>
<body><main>
{{BODY}}
</main>
<div id="modal" class="modal" hidden role="dialog" aria-modal="true" aria-labelledby="m-title"><div class="sheet">
<header><h3 id="m-title"></h3><button type="button" class="x" id="m-close" aria-label="Close">×</button></header>
<div id="m-body"></div><p id="m-err" class="err" role="alert"></p></div></div>
<div id="toast" role="status" hidden></div>
<script type="application/json" id="dash-data">{{DASH}}</script>
<script>{{ACTION_JS}}</script>
<script type="application/json" id="chart-data">{{DATA}}</script>
<script src="{{CHART_JS}}" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
<script>
(function(){
  if(!window.Chart) return; /* offline: fallback tables stay visible */
  var d; try{d=JSON.parse(document.getElementById('chart-data').textContent);}catch(e){return;}
  document.documentElement.classList.add('charts');
  var cs=getComputedStyle(document.documentElement), c=function(n){return cs.getPropertyValue(n).trim();};
  Chart.defaults.color=c('--muted'); Chart.defaults.borderColor=c('--line');
  var pal=[c('--accent'),c('--accent2'),c('--navy2')];
  function mk(id,cfg){var el=document.getElementById(id); if(el){try{new Chart(el,cfg);}catch(e){document.documentElement.classList.remove('charts');}}}
  if(d.growth) mk('ch-growth',{type:'line',data:{labels:d.growth.labels,datasets:d.growth.series.map(function(s,i){
    return {label:s.label,data:s.data,borderColor:pal[i%3],backgroundColor:pal[i%3],tension:.3,spanGaps:true,pointRadius:2};})},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom'}},scales:{y:{beginAtZero:true}}}});
  ['funnel','sales'].forEach(function(k){ if(d[k]) mk('ch-'+k,{type:'bar',data:{labels:d[k].labels,
    datasets:[{data:d[k].values,backgroundColor:[pal[0],pal[1],pal[2],pal[0]],borderRadius:6}]},
    options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{beginAtZero:true}}}});});
  var pp=[c('--accent'),c('--accent2'),c('--navy2'),c('--ok'),c('--mid'),c('--na')];
  (d.pies||[]).forEach(function(p){ mk(p.id,{type:'doughnut',data:{labels:p.labels,datasets:[{data:p.values,
    backgroundColor:pp,borderColor:c('--card'),borderWidth:2}]},options:{responsive:true,maintainAspectRatio:false,cutout:'55%',
    plugins:{legend:{position:'bottom',labels:{boxWidth:10}}}}}); });
  if(d.memberActs) mk('ch-acts',{type:'bar',data:{labels:d.memberActs.labels,datasets:[{data:d.memberActs.values,
    backgroundColor:pal[0],borderRadius:6}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,
    plugins:{legend:{display:false}},scales:{x:{beginAtZero:true,ticks:{precision:0}},y:{ticks:{autoSkip:false}}}}});
  if(d.memberActivity&&d.memberActivity.series.length) mk('ch-activity',{type:'bar',data:{labels:d.memberActivity.labels,
    datasets:d.memberActivity.series.map(function(s,i){return {label:s.label,data:s.data,backgroundColor:pp[i%pp.length],borderRadius:4};})},
    options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{boxWidth:10}}},
    scales:{x:{stacked:true,beginAtZero:true,ticks:{precision:0}},y:{stacked:true,ticks:{autoSkip:false}}}}});
})();
</script>
</body></html>
"""


def main():
    page, overall = render()
    OUT.write_text(page, encoding="utf-8")
    for w in warnings:
        print(f"WARNING: {w}")
    print(f"{len(warnings)} warning(s)")
    print(f"Overall readiness: {overall}%")
    print(f"Dashboard: {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
