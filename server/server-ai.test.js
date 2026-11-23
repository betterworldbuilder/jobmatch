import test from 'node:test';
import assert from 'node:assert/strict';
import { serverAiEnabled, serverAnthropicKey, serverOpenaiKey } from './server-ai.js';
import { providerConfig } from './ai-chat.js';

// Founder, 2026-11-24: no default feature uses the founder's own Claude/OpenAI key.
test('the server AI key is OFF by default, even when the key is present', () => {
  const env = { ANTHROPIC_API_KEY: 'sk-founder', OPENAI_API_KEY: 'sk-founder-oai', AI_CHAT_PROVIDER: 'anthropic' };
  assert.equal(serverAiEnabled(env), false);
  assert.equal(serverAnthropicKey(env), '');
  assert.equal(serverOpenaiKey(env), '');
  assert.equal(providerConfig(env).enabled, false, 'server-paid Ask AI stays off');
});

test('only an explicit USE_SERVER_AI_KEY=true turns it on', () => {
  const env = { USE_SERVER_AI_KEY: 'true', ANTHROPIC_API_KEY: 'sk-founder', AI_CHAT_PROVIDER: 'anthropic' };
  assert.equal(serverAnthropicKey(env), 'sk-founder');
  assert.equal(providerConfig(env).enabled, true);
  assert.equal(serverAnthropicKey({ USE_SERVER_AI_KEY: '1', ANTHROPIC_API_KEY: 'sk' }), '', 'only the exact value "true"');
});
