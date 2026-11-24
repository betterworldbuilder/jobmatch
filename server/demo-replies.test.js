// Demo conversations answer back: every conversation starter in the app has its own answer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { demoAnswer } from './demo-replies.js';

const source = readFileSync(new URL('../src/content/conversationStarters.ts', import.meta.url), 'utf8');
const strings = [...source.matchAll(/^\s*(['"])(.{25,}?)\1,?$/gm)].map((m) => m[2].replace(/\\'/g, "'"))
  .concat([...source.matchAll(/coffee: (['"])(.+?)\1,?$/gm)].map((m) => m[2]));

test('every starter question gets its own answer (not the generic one)', () => {
  assert.ok(strings.length > 50, `found ${strings.length} starters`);
  const genericC = demoAnswer('zzz', 'candidate'); const genericE = demoAnswer('zzz', 'employer');
  const missing = strings.map((q) => q.replace('{name}', 'Sofia')).filter((q) => { const a = demoAnswer(q, 'candidate'); return a === genericC || a === genericE; });
  assert.deepEqual(missing, []);
});

test('other text gets a friendly generic answer', () => {
  assert.match(demoAnswer('Hello there', 'employer', 'Sofia'), /Sofia/);
  assert.match(demoAnswer('Hello there', 'candidate'), /call/);
});
