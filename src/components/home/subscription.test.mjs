// Candidate subscription page: free forever + Premium ($10/month: 3 roles + 10 direct messages).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTsx } from '../../test-utils/loadTsx.mjs';

test('subscription page shows Free forever (current plan) and Premium at $10 with 3 roles + 10 messages, honest about payments', async () => {
  const { React, renderToStaticMarkup, mod } = await loadTsx(new URL('./CandidateSubscription.tsx', import.meta.url));
  const data = { viewer: { id: 'me', role: 'candidate', name: 'Lan' }, jobs: [], candidates: [], matches: [], messages: [], calls: [], notes: [], bookmarkedIds: [], likesRemaining: 5 };
  const html = renderToStaticMarkup(React.createElement(mod.CandidateSubscription, { data, navigate: () => undefined }));
  for (const text of ['Free forever', 'Your plan', 'Premium', '$10', '3 target roles', '10 direct messages', 'Coming soon', 'records your interest only'])
    assert.ok(html.includes(text), `shows ${text}`);
  assert.deepEqual(mod.PREMIUM, { price: 10, currency: 'USD', roles: 3, directMessages: 10 });
});
