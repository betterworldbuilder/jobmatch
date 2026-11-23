// Phone action bar rules: defaults (invitations last, no Profile), Global Menu always kept, drag/tap edits, limits.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTsx } from '../../test-utils/loadTsx.mjs';

const known = new Set(['menu', 'profile', 'surf', 'likes', 'chat', 'nav:Recruiter Invitation', 'nav:Coffee Invitations', 'nav:Reports', 'nav:Hiring Stages', 'nav:Feedback']);

test('defaults: invitations at the end, Profile not in the bar, Global Menu present', async () => {
  const { mod } = await loadTsx(new URL('../../lib/tabBar.ts', import.meta.url));
  assert.deepEqual(mod.defaultTabs('candidate'), ['surf', 'menu', 'likes', 'chat', 'nav:Recruiter Invitation', 'nav:Coffee Invitations']);
  assert.deepEqual(mod.defaultTabs('employer'), ['surf', 'menu', 'likes', 'chat', 'nav:Coffee Invitations']);
  for (const r of ['candidate', 'employer']) assert.ok(!mod.defaultTabs(r).includes('profile'));
});

test('new bar (2026-11-24, preview): Surf · Filter · Likes · Chat · Interviews · Menu, same for both sides', async () => {
  const { mod } = await loadTsx(new URL('../../lib/tabBar.ts', import.meta.url));
  assert.deepEqual(mod.defaultTabsV2(), ['surf', 'filter', 'likes', 'chat', 'nav:Interviews', 'menu']);
  assert.ok(!mod.defaultTabsV2().some((k) => /coffee/i.test(k)), 'Coffee is in the menu, not the bar');
  const knownV2 = new Set(['menu', 'profile', 'surf', 'filter', 'likes', 'chat', 'nav:Interviews', 'nav:Coffee Invitations']);
  assert.deepEqual(mod.normalizeTabs(mod.defaultTabsV2(), knownV2, 'employer'), mod.defaultTabsV2(), 'kept as is, Menu stays last');
});

test('drag a menu item onto the bar: inserts, replaces when full, never removes the Global Menu', async () => {
  const { mod } = await loadTsx(new URL('../../lib/tabBar.ts', import.meta.url));
  const bar = ['surf', 'menu', 'likes', 'chat'];
  assert.deepEqual(mod.placeTab(bar, 'profile', 0), ['profile', 'surf', 'menu', 'likes', 'chat']);
  const full = mod.defaultTabs('candidate');
  assert.deepEqual(mod.placeTab(full, 'nav:Reports', 2), ['surf', 'menu', 'nav:Reports', 'chat', 'nav:Recruiter Invitation', 'nav:Coffee Invitations'], 'replaces the item it lands on');
  const onMenu = mod.placeTab(full, 'nav:Reports', 1);
  assert.ok(onMenu.includes('menu'), 'dropping on the Global Menu keeps it');
  assert.equal(onMenu.length, 6);
  assert.deepEqual(mod.placeTab(bar, 'chat', 0), ['chat', 'surf', 'menu', 'likes'], 'reorders an existing button');
});

test('remove / toggle respect the limits; normalize fixes bad saved data', async () => {
  const { mod } = await loadTsx(new URL('../../lib/tabBar.ts', import.meta.url));
  assert.deepEqual(mod.removeTab(['surf', 'menu', 'chat'], 'menu'), ['surf', 'menu', 'chat'], 'Global Menu cannot be removed');
  assert.deepEqual(mod.removeTab(['menu', 'chat'], 'chat'), ['menu', 'chat'], 'at least 2 buttons');
  assert.deepEqual(mod.toggleTab(['surf', 'menu'], 'nav:Feedback'), ['surf', 'menu', 'nav:Feedback']);
  assert.deepEqual(mod.toggleTab(['surf', 'menu', 'nav:Feedback'], 'nav:Feedback'), ['surf', 'menu']);
  assert.deepEqual(mod.normalizeTabs(['surf', 'surf', 'bogus', 'chat'], known, 'candidate'), ['surf', 'menu', 'chat']);
  assert.deepEqual(mod.normalizeTabs('junk', known, 'employer'), mod.defaultTabs('employer'));
});
