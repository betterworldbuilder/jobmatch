import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { unlinkSync } from 'node:fs';
import { heuristicParse, parseSalaryText, parseStrength, summaryFromText } from './jobs.js';
import { importAiAllowed, toParsedFields } from './import-ai.js';

/* Job import parsing (founder, 2026-11-25): the built-in section-aware parser, the CSV columns, and the Claude
   fallback that runs only for allowlisted emails with their own saved key. A fake Anthropic API runs on localhost. */
const DB_PATH = `/tmp/jobmatch-import-ai-test-${process.pid}.json`;
const pid = process.pid;
const ALLOWED = `allowed-${pid}@example.com`;
let server; let base; let fake; const seen = [];

before(async () => {
  fake = http.createServer((req, res) => {
    let body = ''; req.on('data', (c) => { body += c; });
    req.on('end', () => {
      if (req.method === 'GET') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ data: [{ id: 'claude-opus-5-5' }] })); return; }
      const json = JSON.parse(body || '{}'); seen.push({ headers: req.headers, json });
      const out = { summary: 'Build retail AI agents end to end.', mustHave: [{ name: 'Python', weight: 3 }, { name: 'LangGraph', weight: 3 }], niceToHave: ['Kafka'],
        languages: ['English'], seniority: 'senior', company: 'Acme Retail', workMode: 'Hybrid', employmentType: 'Full-time', location: 'Ho Chi Minh City',
        salaryMin: 2500, salaryMax: 0, salaryCurrency: 'USD', responsibilities: ['Ship agents'], benefits: ['13th-month salary'] };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(out) }] }));
    });
  });
  await new Promise((r) => fake.listen(0, r));
  const url = `http://127.0.0.1:${fake.address().port}/v1/messages`;
  Object.assign(process.env, { NODE_ENV: 'test', DB_PATH, ANTHROPIC_API_URL: url, AI_CHAT_ANTHROPIC_MODELS_URL: url.replace('/messages', '/models'), IMPORT_AI_EMAILS: ` ${ALLOWED.toUpperCase()} , other@example.com` });
  const { app } = await import('./index.js');
  server = app.listen(0); await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server?.close(); fake?.close(); try { unlinkSync(DB_PATH); } catch { /* gone */ } });

async function call(method, path, body, cookie) {
  const res = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json, session: (res.headers.get('set-cookie') || '').match(/jm_auth=[^;]+/)?.[0] };
}
async function register(name, email) {
  const r = await call('POST', '/api/auth/register', { role: 'employer', kind: 'company', name, email, password: 'correct-horse-battery', conductAccepted: true });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return { id: r.body.user.id, cookie: r.session };
}
async function upload(user, csv) {
  const res = await fetch(`${base}/api/jobs/import-file?employerId=${encodeURIComponent(user.id)}&sourceSystem=ats_export`, {
    method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'x-filename': 'jobs.csv', Cookie: user.cookie }, body: csv,
  });
  return { status: res.status, body: await res.json() };
}

const JD = `Company: MTI Technology

ABOUT THE ROLE:
You will design, build and ship GenAI applications (LLM, RAG, AI agents) for our clients, from requirement to production.

KEY RESPONSIBILITIES:
- Build and deploy LLM-based applications: RAG pipelines, multi-agent workflows, tool calling.
- Design retrieval (hybrid search, vector databases, reranking).

REQUIREMENTS:
- 2+ years of hands-on AI/ML engineering experience.
- Strong Python; experience with LangChain/LangGraph or similar.
- Good spoken English for daily work with clients.

NICE TO HAVE:
- Cloud deployment (AWS/Azure/GCP), Docker/Kubernetes, CI/CD.

BENEFIT:
- 13th-month salary and performance bonus.
- Health, Social, and Unemployment Insurance according to Vietnamese Labor Code.`;

test('built-in parser reads the sections: must-have vs nice-to-have, languages, company, benefits, summary', () => {
  const p = heuristicParse(`AI Engineer\n${JD}`);
  const must = p.requiredSkillsDetail.map((s) => s.name);
  for (const s of ['Python', 'LangChain', 'LangGraph']) assert.ok(must.includes(s), `must-have ${s}: ${must}`);
  for (const s of ['AWS', 'Docker', 'Kubernetes']) { assert.ok(p.niceToHaves.includes(s), `nice ${s}: ${p.niceToHaves}`); assert.ok(!must.includes(s), `${s} is not a must-have`); }
  assert.deepEqual(p.requiredLanguages, ['English'], 'Vietnamese Labor Code is not a language requirement');
  assert.equal(p.company, 'MTI Technology');
  assert.ok(p.benefits.some((b) => /13th-month/.test(b)));
  assert.ok(p.responsibilities.length >= 2);
  assert.match(p.description, /^You will design/);
  assert.equal(parseStrength(p).weak, false);
});

test('salary text: ranges, a minimum alone, and "Nego"', () => {
  assert.deepEqual(parseSalaryText('$3,000–4,000 / month'), { min: 3000, max: 4000, currency: 'USD' });
  assert.deepEqual(parseSalaryText('30,000,000 - 45,000,000 VND'), { min: 30000000, max: 45000000, currency: 'VND' });
  assert.deepEqual(parseSalaryText('from $2,500'), { min: 2500, currency: 'USD' });
  assert.equal(parseSalaryText('Nego'), undefined);
});

test('summary falls back to the first bullets when the text has no paragraph', () => {
  assert.match(summaryFromText('Overview:\n- Design, develop and optimize AI/ML models for product use cases.\n- Build pipelines for training and deployment.'), /^Design, develop/);
});

test('Claude output is mapped to job fields; only allowlisted emails may use it', () => {
  const f = toParsedFields({ summary: 'x', mustHave: [{ name: 'Go', weight: 3 }], niceToHave: ['go', 'Kafka'], languages: [], seniority: 'lead', company: '', workMode: 'Remote', employmentType: 'Nope', location: '', salaryMin: 100, salaryMax: 50, salaryCurrency: 'usd', responsibilities: [], benefits: [] });
  assert.deepEqual(f.niceToHaves, ['Kafka'], 'a must-have is not repeated as nice-to-have');
  assert.equal(f.type, undefined, 'unknown employment type dropped');
  assert.deepEqual(f.salaryRange, { min: 100, currency: 'USD' }, 'max below min → minimum only');
  assert.equal(importAiAllowed(ALLOWED), true);
  assert.equal(importAiAllowed('someone@example.com'), false);
  assert.equal(importAiAllowed(''), false);
});

const WEAK = 'We are a friendly team doing interesting work for customers every day. Join us and grow with good people around you.';
const CSV = (rows) => `id,title,location,employment_type,work_mode,salary,url,description\n${rows.join('\n')}\n`;

test('CSV columns win; a hard row uses Claude only for the allowlisted account with its own key', async () => {
  const allowed = await register('Allowed Recruiter', ALLOWED);
  const other = await register('Other Recruiter', `other-${pid}@example.com`);
  const rows = [`r-1,Retail AI Engineer,,Contract,On-site,"from $2,000",,"${WEAK}"`, `r-2,AI Engineer,"Ho Chi Minh City",,,,,"${JD.replace(/"/g, '""')}"`];

  // Allowlisted but no key saved yet: built-in parser only, and the result says why.
  let r = await upload(allowed, CSV(rows));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(seen.length, 0, 'no key → Claude not called');
  assert.equal(r.body.ai.reason, 'no_key');
  const weak = r.body.jobs.find((j) => j.sourceJobId === 'r-1');
  assert.equal(weak.type, 'Contract'); assert.equal(weak.workMode, 'On-site'); assert.deepEqual(weak.salaryRange, { min: 2000, currency: 'USD' });
  assert.equal(weak.salary, 'From $2k');

  // Not allowlisted: never calls Claude, even with a key.
  assert.equal((await call('PUT', '/api/ai/key', { provider: 'anthropic', apiKey: `sk-ant-api03-other-${pid}-000000000000` }, other.cookie)).status, 200);
  r = await upload(other, CSV(rows));
  assert.equal(r.status, 201); assert.equal(seen.length, 0); assert.equal(r.body.ai, undefined);

  // Allowlisted with its own key: Claude completes only the weak row, the strong one stays built-in.
  const KEY = `sk-ant-api03-allowed-${pid}-00000000000`;
  assert.equal((await call('PUT', '/api/ai/key', { provider: 'anthropic', apiKey: KEY }, allowed.cookie)).status, 200);
  r = await upload(allowed, CSV([`r-3,Retail AI Engineer,,Contract,,,,"${WEAK}"`, `r-4,AI Engineer 2,"Ho Chi Minh City",,,,,"${JD.replace(/"/g, '""')}"`]));
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(seen.length, 1, 'one call, for the weak row only');
  assert.equal(seen[0].headers['x-api-key'], KEY, "the account's own key");
  assert.equal(seen[0].json.output_config.format.type, 'json_schema');
  assert.equal(r.body.ai.used, 1);
  const ai = r.body.jobs.find((j) => j.sourceJobId === 'r-3');
  assert.deepEqual(ai.requiredSkills, ['Python', 'LangGraph']);
  assert.equal(ai.company, 'Acme Retail'); assert.equal(ai.description, 'Build retail AI agents end to end.');
  assert.equal(ai.type, 'Contract', "the file's column still wins over Claude");
  assert.equal(ai.fullDescription, WEAK, 'Role details keep the text as written');
});

test('salary is optional to publish; a given salary must be real', async () => {
  const rec = await register('Salary Recruiter', `salary-${pid}@example.com`);
  const post = (over) => call('POST', '/api/jobs', { employerId: rec.id, postSource: 'quick_post', status: 'active', type: 'Full-time', title: 'Frontend Engineer', location: 'Remote', workMode: 'Remote', requiredSkillsDetail: [{ name: 'React', weight: 3 }], description: 'React role.', ...over }, rec.cookie);
  assert.equal((await post({})).status, 201, 'no salary');
  const min = await post({ salaryRange: { min: 40000, currency: 'USD' } });
  assert.equal(min.status, 201); assert.equal((min.body.job || min.body).salary, 'From $40k');
  assert.equal((await post({ salaryRange: { min: 0, max: 0, currency: 'USD' } })).status, 400);
  assert.equal((await post({ salaryRange: { min: 50000, max: 10000, currency: 'USD' } })).status, 400);
});
