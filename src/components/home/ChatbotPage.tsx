// "Use your chatbot here": where the AI features are in JobsMatchNow, and how to plug the
// member's OWN assistant (Claude, ChatGPT, any MCP client) in, read-only, with a personal key.
import { useEffect, useState } from 'react';
import { BarChart3, Bot, Check, Copy, Crown, KeyRound, Lock, Plug, Sparkles, Trash2 } from 'lucide-react';
import { api, apiBase } from '../../api';
import type { Bootstrap, ConnectorKey, View } from '../../types';
import { featureOn } from '../../lib/flags';
import { AgentSettingsModal, openAskAi } from './AiAnalyst';

export const MCP_URL = `${apiBase || 'https://jobsmatchnow.com'}/api/mcp`;
const ASK = ['What are my matches?', 'Where am I in each hiring process?', 'Which skills should I learn next, and where?', 'When is my next interview?'];
const ASK_RECRUITER = ['Which candidates have I matched with?', 'Where is each candidate in my hiring stages?', 'When is my next interview?'];

// "Connect your AI agent" (founder, 2026-11-25, flag `agents`): ready-to-copy setup for each agent.
// OpenClaw: `openclaw mcp set` (docs: gateway/config-extensions, mcp.servers, streamable-http + headers).
// Muse (Meta): no settings screen; you ask Muse in chat to build a connector, and the key goes into Muse's own
// secure credentials prompt, never into the chat.
type AgentId = 'openclaw' | 'muse' | 'claude' | 'any';
const AGENT_TABS: { id: AgentId; label: string }[] = [
  { id: 'openclaw', label: 'OpenClaw' }, { id: 'muse', label: 'Muse (Meta)' }, { id: 'claude', label: 'Claude' }, { id: 'any', label: 'Any MCP agent' },
];
export const openclawCommand = (key: string) => `openclaw mcp set jobsmatchnow '${JSON.stringify({ url: MCP_URL, transport: 'streamable-http', headers: { Authorization: `Bearer ${key}` } })}'`;
export const musePrompt = () => `Build a custom connector to my JobsMatchNow account. It is an MCP server at ${MCP_URL} (streamable HTTP, JSON responses). Every request needs the header "Authorization: Bearer <key>". Ask me for the key in your secure credentials prompt, not in this chat. The connector is read-only: it lists my matches, hiring stages, skill gaps and next interview. Save it as a skill so I can ask about my job search later.`;

function AgentSetup({ keyShown, hasKey, desktopConfig }: { keyShown: string; hasKey: boolean; desktopConfig: string }) {
  const [tab, setTab] = useState<AgentId>('openclaw');
  return <div className="cb-agents" id="connect-agent">
    <div className="cb-tabs" role="tablist" aria-label="Your AI agent">
      {AGENT_TABS.map((t) => <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>{t.label}</button>)}
    </div>
    <div className="cb-tabpanel" role="tabpanel">
      {tab === 'openclaw' && <>
        <span>In a terminal where OpenClaw runs, paste:</span>
        <CopyBox text={openclawCommand(keyShown)} />
        <span>Then check the connection: <code className="cb-inline">openclaw mcp status --verbose</code>. Your OpenClaw agents can now use the JobsMatchNow tools.</span>
      </>}
      {tab === 'muse' && <>
        <span>1. Open Muse and paste this message in the chat:</span>
        <CopyBox text={musePrompt()} wrap />
        <span>2. When Muse asks for the key in its <b>secure credentials prompt</b>, paste your connector key there{hasKey ? '' : ' (create it in step 1 above)'}. Never paste the key in the chat itself.</span>
        <span className="cb-soon">Muse builds the connector itself; Meta does not review custom connectors. Revoke the key below anytime to cut access.</span>
      </>}
      {tab === 'claude' && <>
        <span><b>Claude Desktop</b> (Settings → Developer → Edit config), paste:</span>
        <CopyBox text={desktopConfig} />
        <span><b>Claude Code</b>: <code className="cb-inline">claude mcp add --transport http jobsmatchnow {MCP_URL} --header "Authorization: Bearer {keyShown}"</code></span>
      </>}
      {tab === 'any' && <>
        <span>Any agent that supports MCP over HTTP:</span>
        <span><b>Server address</b>: <code className="cb-inline">{MCP_URL}</code></span>
        <span><b>Transport</b>: streamable HTTP (plain JSON responses) · <b>Header</b>: <code className="cb-inline">Authorization: Bearer &lt;key&gt;</code></span>
        <span><b>Tools</b>: get_my_matches, get_hiring_stages, get_skill_gaps, get_next_interview. All read-only.</span>
      </>}
    </div>
  </div>;
}

function CopyBox({ text, wrap = false }: { text: string; wrap?: boolean }) {
  const [done, setDone] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* clipboard blocked */ } };
  return <div className={wrap ? 'cb-copy wrap' : 'cb-copy'}><code>{text}</code><button type="button" onClick={() => void copy()} aria-label="Copy">{done ? <Check size={14} /> : <Copy size={14} />}</button></div>;
}

export function ChatbotPage({ data, navigate }: { data: Bootstrap; navigate: (v: View) => void }) {
  const [keys, setKeys] = useState<ConnectorKey[]>([]);
  const [fresh, setFresh] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [agentOpen, setAgentOpen] = useState(false);
  const load = () => api.connectorKeys(data.viewer.id).then((r) => setKeys(r.keys)).catch(() => undefined);
  useEffect(() => { void load(); }, []);
  const create = async () => {
    setBusy(true); setError('');
    try { const r = await api.createConnectorKey(data.viewer.id, 'My assistant'); setFresh(r.key); void load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not create a key'); }
    finally { setBusy(false); }
  };
  const revoke = async (id: string) => { await api.revokeConnectorKey(data.viewer.id, id).catch(() => undefined); void load(); };
  const keyShown = fresh || '<your-connector-key>';
  const desktopConfig = JSON.stringify({ mcpServers: { jobsmatchnow: { command: 'npx', args: ['-y', 'mcp-remote', MCP_URL, '--header', `Authorization: Bearer ${keyShown}`] } } }, null, 2);
  const agentsOn = featureOn('agents');
  const ask = data.viewer.role === 'employer' && agentsOn ? ASK_RECRUITER : ASK;

  return <div className="page cb-page">
    <div className="page-title"><div><span className="overline">AI assistant</span><h1>Use your chatbot here</h1><p>Ask an AI about your own job search: matches, hiring stages, skill gaps and next interview. Use ours in the app, or connect your own ChatGPT or Claude.</p></div></div>

    <section className="cb-card">
      <h2><Sparkles size={18} /> Where the chatbot is in JobsMatchNow</h2>
      <div className="cb-where">
        <button type="button" onClick={() => setAgentOpen(true)}><KeyRound size={18} /><strong>1. Connect your Claude or ChatGPT</strong><small>Get an API key from Anthropic or OpenAI (links inside) and paste it. Stored encrypted, never shown again.</small></button>
        <button type="button" onClick={() => openAskAi()}><Bot size={18} /><strong>2. “Ask AI” button</strong><small>Bottom-right on every page: ask about your {data.viewer.role === 'employer' ? 'roles, candidates and hiring' : 'matches, skills and interviews'}.</small></button>
        <button type="button" onClick={() => navigate('analytics')}><BarChart3 size={18} /><strong>Reports → AI analyst</strong><small>Ready questions that open Ask AI.</small></button>
      </div>
      <p className="cb-note"><Crown size={12} /> Premium feature, with a free 7-day trial. You pay Anthropic or OpenAI directly for what you use.</p>
    </section>

    <section className="cb-card">
      <h2><Plug size={18} /> {agentsOn ? 'Connect your AI agent: OpenClaw, Muse, Claude or any MCP agent' : 'Connect your own ChatGPT or Claude'}</h2>
      <ol className="cb-steps">
        <li><b>1</b><div><strong>Create a connector key</strong><span>It lets your assistant <em>read</em> your matches, hiring stages, skill gaps and next interview. Nothing else, and it can't send anything.</span>
          {fresh ? <div className="cb-fresh"><span><KeyRound size={14} /> Copy it now — it's shown only once:</span><CopyBox text={fresh} /></div>
            : <button type="button" className="fm-black cb-btn" disabled={busy} onClick={() => void create()}><KeyRound size={16} /> {busy ? 'Creating…' : 'Create connector key'}</button>}
          {error && <p className="auth-error">{error}</p>}</div></li>
        {agentsOn
          ? <li><b>2</b><div><strong>Add JobsMatchNow to your agent</strong><AgentSetup keyShown={keyShown} hasKey={Boolean(fresh)} desktopConfig={desktopConfig} /></div></li>
          : <li><b>2</b><div><strong>Add JobsMatchNow to your assistant</strong>
          <span><b>Claude Desktop</b> (Settings → Developer → Edit config) or any MCP client — paste:</span>
          <CopyBox text={desktopConfig} />
          <span><b>Claude Code</b>: <code className="cb-inline">claude mcp add --transport http jobsmatchnow {MCP_URL} --header "Authorization: Bearer {keyShown}"</code></span>
          <span><b>Server address</b>: <code className="cb-inline">{MCP_URL}</code> · header <code className="cb-inline">Authorization: Bearer &lt;key&gt;</code></span>
          <span className="cb-soon"><b>ChatGPT and claude.ai (web)</b>: one-click “Add connector” with JobsMatchNow sign-in is coming next. Until then, use Claude Desktop, Claude Code or another MCP client with your key.</span></div></li>}
        <li><b>3</b><div><strong>Ask your {agentsOn ? 'agent' : 'assistant'}</strong><div className="cb-ask">{ask.map((q) => <span key={q}>“{q}”</span>)}</div></div></li>
      </ol>
    </section>

    <section className="cb-card">
      <h2><Lock size={18} /> Your keys</h2>
      {keys.length ? <ul className="cb-keys">{keys.map((k) => <li key={k.id}><KeyRound size={15} /><span><strong>{k.label}</strong><small>…{k.last4} · created {new Date(k.createdAt).toLocaleDateString()} · {k.lastUsedAt ? `last used ${new Date(k.lastUsedAt).toLocaleString()}` : 'not used yet'}</small></span>
        <button type="button" className="secondary-button small" onClick={() => void revoke(k.id)}><Trash2 size={13} /> Revoke</button></li>)}</ul>
        : <p className="tp-muted">No keys yet.</p>}
      <p className="cb-note">Read-only and only your own data — never other members. Revoke a key and your assistant loses access at once. Your AI account and its cost stay with you; we never see your ChatGPT or Claude password.</p>
      <button type="button" className="tp-link" onClick={() => setAgentOpen(true)}>My AI chatbot (Claude / ChatGPT key)</button>
    </section>
    {agentOpen && <AgentSettingsModal onClose={() => setAgentOpen(false)} />}
  </div>;
}
