// "Try the demo" on the empty deck (founder, 2026-11-23): shown only when the signed-in app provides the action
// (real account + tryDemo flag on), hidden otherwise.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTsx } from '../../test-utils/loadTsx.mjs';

async function render(value, props = {}) {
  const { React, renderToStaticMarkup, mod } = await loadTsx(new URL('./DeckParts.tsx', import.meta.url));
  const deck = React.createElement(mod.EmptyDeck, { role: 'candidate', onReset: () => undefined, ...props });
  return renderToStaticMarkup(value === undefined ? deck : React.createElement(mod.TryDemoContext.Provider, { value }, deck));
}

test('real account: every empty-deck variant offers "Try the demo"', async () => {
  const action = async () => undefined;
  for (const props of [{}, { role: 'employer' }, { title: "You've seen today's top picks", text: 'x' }]) {
    assert.match(await render(action, props), /class="secondary-button try-demo-button"[^>]*>.*Try the demo/, JSON.stringify(props));
  }
});

test('demo account or flag off (no action provided): no button', async () => {
  assert.doesNotMatch(await render(null), /Try the demo/);
  assert.doesNotMatch(await render(undefined), /Try the demo/);
});
