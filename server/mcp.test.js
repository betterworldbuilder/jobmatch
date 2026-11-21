import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync } from 'node:fs';
import { runTool } from './mcp.js';

/* Read-only MCP connector: key lifecycle, auth, JSON-RPC methods, own data only. */

test('tools compute from the member\'s own bootstrap', () => {
  const boot = {
    viewer: { id: 'me', role: 'candidate', skills: ['React'] },
    jobs: [{ id: 'j', title: 'Backend Engineer', company: 'Stripe', requiredSkills: ['React', 'Go'], match: { score: 80, missingSkills: ['Go'] } }],
    matches: [{ id: 'm', jobId: 'j', job: { title: 'Backend Engineer', company: 'Stripe' }, employer: { name: 'Priya' }, stage: 'Interview', createdAt: 0, currentStepId: 'r1',
      pipeline: [{ id: 'match', name: 'Mutual match', kind: 'match' }, { id: 'r1', name: 'Tech interview', kind: 'technical', owner: 'Minh', date: '2099-01-02' }] }],
    calls: [],
  };
  assert.equal(runTool('get_my_matches', boot)[0].fit, 80);
  assert.equal(runTool('get_hiring_stages', boot)[0].current, 'Tech interview');
  assert.equal(runTool('get_skill_gaps', boot)[0].skill, 'Go');
  assert.equal(runTool('get_next_interview', boot).with, 'Minh');
});

const DB_PATH = `/tmp/jobmatch-mcp-test-${process.pid}.json`;
let server; let base;
async function call(method, path, body, headers = {}) {
  if (!base) {
    process.env.NODE_ENV = 'test'; process.env.DB_PATH = DB_PATH;
    const { app } = await import('./index.js');
    server = app.listen(0); await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${server.address().port}`;
  }
  const res = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
  const session = (res.headers.get('set-cookie') || '').match(/jm_auth=[^;]+/)?.[0];
  return { status: res.status, body: await res.json().catch(() => ({})), session };
}
after(() => { server?.close(); try { unlinkSync(DB_PATH); } catch { /* gone */ } });

test('connector key → MCP initialize, tools/list, tools/call; no key → 401; revoked key → 401', async () => {
  const reg = await call('POST', '/api/auth/register', { role: 'candidate', name: 'Real MCP', email: `mcp-${process.pid}@example.com`, password: 'correct-horse-battery', conductAccepted: true });
  assert.equal(reg.status, 201);
  const me = { id: reg.body.user.id, cookie: reg.session };
  assert.equal((await call('POST', '/api/mcp', { jsonrpc: '2.0', id: 1, method: 'initialize' })).status, 401);
  const created = await call('POST', '/api/me/connector-keys', { userId: me.id, label: 'Claude' }, { Cookie: me.cookie });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.match(created.body.key, /^jmn_/);
  assert.equal(created.body.record.hash, undefined, 'hash never returned');
  const auth = { Authorization: `Bearer ${created.body.key}` };
  const init = await call('POST', '/api/mcp', { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }, auth);
  assert.equal(init.body.result.serverInfo.name, 'jobsmatchnow');
  assert.equal((await call('POST', '/api/mcp', { jsonrpc: '2.0', method: 'notifications/initialized' }, auth)).status, 202);
  const list = await call('POST', '/api/mcp', { jsonrpc: '2.0', id: 2, method: 'tools/list' }, auth);
  assert.deepEqual(list.body.result.tools.map((t) => t.name), ['get_my_matches', 'get_hiring_stages', 'get_skill_gaps', 'get_next_interview']);
  const tool = await call('POST', '/api/mcp', { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_my_matches', arguments: {} } }, auth);
  assert.equal(tool.status, 200, JSON.stringify(tool.body));
  assert.ok(Array.isArray(tool.body.result.structuredContent.result));
  assert.equal((await call('POST', '/api/mcp', { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'send_message' } }, auth)).body.error.code, -32602, 'no write tools');
  const keys = await call('GET', `/api/me/connector-keys?userId=${me.id}`, undefined, { Cookie: me.cookie });
  assert.equal(keys.body.keys.length, 1);
  await call('DELETE', `/api/me/connector-keys/${keys.body.keys[0].id}?userId=${me.id}`, undefined, { Cookie: me.cookie });
  assert.equal((await call('POST', '/api/mcp', { jsonrpc: '2.0', id: 5, method: 'tools/list' }, auth)).status, 401, 'revoked');
});
