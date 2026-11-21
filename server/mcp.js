// Read-only MCP connector: lets a member's OWN AI assistant (Claude, ChatGPT or any MCP
// client) read that member's matches, hiring stages, skill gaps and next interview.
// Auth: a personal connector key (Bearer), stored hashed, revocable. JSON-RPC 2.0 over
// HTTP POST (MCP "streamable HTTP" transport, plain JSON responses, no streaming).
// Nothing here writes data or sends messages.
import crypto from 'node:crypto';

export const MCP_PROTOCOL = '2025-06-18';

export const newConnectorKey = () => `jmn_${crypto.randomBytes(24).toString('base64url')}`;
export const hashKey = (key) => crypto.createHash('sha256').update(String(key)).digest('hex');

const TOOLS = [
  { name: 'get_my_matches', description: 'List my mutual matches on JobsMatchNow: role, company or candidate, stage, fit score.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'get_hiring_stages', description: 'For each of my matches, the hiring rounds (who interviews, dates) and the current step.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'get_skill_gaps', description: 'Skills the roles I see ask for that my profile does not list yet, most requested first, with a Coursera search link.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'get_next_interview', description: 'My next scheduled interview or call: what, when and with whom.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
];

const DAY = 86400000;

/** Tool results computed from the member's own bootstrap (the same data the app shows them). */
export function runTool(name, boot, now = Date.now()) {
  const v = boot.viewer || {};
  const cand = v.role === 'candidate';
  const other = (m) => (cand ? (m.employer?.name || m.job?.company || 'Hiring team') : (m.candidate?.name || 'Candidate'));
  const score = (m) => (cand ? boot.jobs?.find((j) => j.id === m.jobId)?.match?.score : boot.candidates?.find((c) => c.id === m.candidateId)?.match?.score);
  const current = (m) => (m.pipeline || []).find((s) => s.id === m.currentStepId) || null;
  if (name === 'get_my_matches') {
    return (boot.matches || []).map((m) => ({ role: m.job?.title, company: m.job?.company, with: other(m), stage: current(m)?.name || m.stage, fit: score(m) ?? null, matchedOn: new Date(m.createdAt).toISOString().slice(0, 10) }));
  }
  if (name === 'get_hiring_stages') {
    return (boot.matches || []).map((m) => ({ role: m.job?.title, company: m.job?.company, with: other(m), current: current(m)?.name || m.stage,
      steps: (m.pipeline || []).filter((s) => !s.hidden).map((s) => ({ step: s.name, kind: s.kind || null, interviewer: s.owner || null, date: s.date || null, format: s.format || null, current: s.id === m.currentStepId })) }));
  }
  if (name === 'get_skill_gaps') {
    const have = new Set((v.skills || []).map((s) => String(s).toLowerCase()));
    const gaps = new Map();
    for (const j of boot.jobs || []) {
      const missing = j.match?.missingSkills?.length ? j.match.missingSkills : (j.requiredSkills || []).filter((s) => !have.has(String(s).toLowerCase()));
      for (const s of missing) if (!have.has(String(s).toLowerCase())) gaps.set(s, (gaps.get(s) || 0) + 1);
    }
    return [...gaps.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([skill, roles]) => ({ skill, askedInRoles: roles, learn: `https://www.coursera.org/search?query=${encodeURIComponent(skill)}` }));
  }
  if (name === 'get_next_interview') {
    const items = [];
    for (const c of boot.calls || []) if (c.startAt >= now) { const m = (boot.matches || []).find((x) => x.id === c.matchId); if (m) items.push({ what: c.title.split(' - ')[0], role: m.job?.title, with: other(m), when: new Date(c.startAt).toISOString(), minutes: c.durationMinutes || 30 }); }
    for (const m of boot.matches || []) { const s = current(m); if (s?.date && s.kind !== 'match' && new Date(`${s.date}T09:00:00`).getTime() + DAY >= now) items.push({ what: s.name, role: m.job?.title, with: s.owner || other(m), when: s.date, format: s.format || null }); }
    items.sort((a, b) => String(a.when).localeCompare(String(b.when)));
    return items[0] || { none: 'No interview has a date yet.' };
  }
  return null;
}

/** Handle one JSON-RPC message. `loadBoot` returns the member's bootstrap. Returns null for notifications. */
export async function handleRpc(msg, loadBoot) {
  const reply = (result) => ({ jsonrpc: '2.0', id: msg.id, result });
  const fail = (code, message) => ({ jsonrpc: '2.0', id: msg.id ?? null, error: { code, message } });
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return fail(-32600, 'Invalid request');
  if (msg.id === undefined) return null; // notification (e.g. notifications/initialized)
  switch (msg.method) {
    case 'initialize': return reply({ protocolVersion: msg.params?.protocolVersion || MCP_PROTOCOL, capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'jobsmatchnow', version: '0.1.0' }, instructions: 'Read-only access to the signed-in member\'s own JobsMatchNow data.' });
    case 'ping': return reply({});
    case 'tools/list': return reply({ tools: TOOLS });
    case 'tools/call': {
      const name = msg.params?.name;
      if (!TOOLS.some((t) => t.name === name)) return fail(-32602, `Unknown tool: ${name}`);
      const data = runTool(name, await loadBoot());
      return reply({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], structuredContent: { result: data } });
    }
    default: return fail(-32601, `Method not found: ${msg.method}`);
  }
}
