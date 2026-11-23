// The server's own AI keys (founder, 2026-11-24): NO default feature uses the founder's Claude/OpenAI key.
// Reading a CV, reading a job description, interview practice and the server-paid "Ask AI" all fall back to their
// built-in, non-AI logic. The chatbot still works with a member's OWN key (ai-keys.js). The server key is used
// only if an admin sets USE_SERVER_AI_KEY=true on purpose.
export function serverAiEnabled(env = process.env) {
  return env.USE_SERVER_AI_KEY === 'true';
}
export function serverAnthropicKey(env = process.env) {
  return serverAiEnabled(env) ? env.ANTHROPIC_API_KEY || '' : '';
}
export function serverOpenaiKey(env = process.env) {
  return serverAiEnabled(env) ? env.OPENAI_API_KEY || '' : '';
}
