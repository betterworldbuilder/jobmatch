// "Use your chatbot here": where the AI features are in JobsMatchNow, and how to plug the
// member's OWN assistant (Claude, ChatGPT, any MCP client) in, read-only, with a personal key.
import { useEffect, useState } from 'react';
import { BarChart3, Bot, Check, Copy, Crown, KeyRound, Lock, Plug, Sparkles, Trash2 } from 'lucide-react';
import { api, apiBase } from '../../api';
import type { Bootstrap, ConnectorKey, View } from '../../types';
import { AgentSettingsModal, openAskAi } from './AiAnalyst';

export const MCP_URL = `${apiBase || 'https://jobsmatchnow.com'}/api/mcp`;
const ASK = ['What are my matches?', 'Where am I in each hiring process?', 'Which skills should I learn next, and where?', 'When is my next interview?'];

function CopyBox({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* clipboard blocked */ } };
  return <div className="cb-copy"><code>{text}</code><button type="button" onClick={() => void copy()} aria-label="Copy">{done ? <Check size={14} /> : <Copy size={14} />}</button></div>;
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
      <h2><Plug size={18} /> Connect your own ChatGPT or Claude</h2>
      <ol className="cb-steps">
        <li><b>1</b><div><strong>Create a connector key</strong><span>It lets your assistant <em>read</em> your matches, hiring stages, skill gaps and next interview. Nothing else, and it can't send anything.</span>
          {fresh ? <div className="cb-fresh"><span><KeyRound size={14} /> Copy it now — it's shown only once:</span><CopyBox text={fresh} /></div>
            : <button type="button" className="fm-black cb-btn" disabled={busy} onClick={() => void create()}><KeyRound size={16} /> {busy ? 'Creating…' : 'Create connector key'}</button>}
          {error && <p className="auth-error">{error}</p>}</div></li>
        <li><b>2</b><div><strong>Add JobsMatchNow to your assistant</strong>
          <span><b>Claude Desktop</b> (Settings → Developer → Edit config) or any MCP client — paste:</span>
          <CopyBox text={desktopConfig} />
          <span><b>Claude Code</b>: <code className="cb-inline">claude mcp add --transport http jobsmatchnow {MCP_URL} --header "Authorization: Bearer {keyShown}"</code></span>
          <span><b>Server address</b>: <code className="cb-inline">{MCP_URL}</code> · header <code className="cb-inline">Authorization: Bearer &lt;key&gt;</code></span>
          <span className="cb-soon"><b>ChatGPT and claude.ai (web)</b>: one-click “Add connector” with JobsMatchNow sign-in is coming next. Until then, use Claude Desktop, Claude Code or another MCP client with your key.</span></div></li>
        <li><b>3</b><div><strong>Ask your assistant</strong><div className="cb-ask">{ASK.map((q) => <span key={q}>“{q}”</span>)}</div></div></li>
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
