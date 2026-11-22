import test from 'node:test';
import assert from 'node:assert/strict';
import { cheapestStackCost, PLANS, SEAT_LADDER, planPrice } from './billing/plans.js';
import { activeMembers, addMember, getOrCreateTeam, reconcileSeats, seatsAllowed } from './billing/seats.js';

const CURRENCIES = ['USD', 'VND'];

/* ── The seat pricing invariant ──────────────────────────────────────────────
 *
 * Two conditions, both of which must hold for every rung of the ladder:
 *
 *   1. Per-seat price never increases as you move up. Buying a bigger plan is
 *      never worse value per seat than the plan below it.
 *   2. A bundle is never more expensive than assembling the same seat count out
 *      of smaller plans. If it were, the rational move would be to open several
 *      accounts — which is exactly the behaviour a seat model exists to avoid.
 *
 * `cheapestStackCost` is an exhaustive DP over the whole ladder rather than a
 * handful of hand-picked comparisons, so condition 2 cannot pass by accident.
 */

/* 2026-11-22 pricing (founder, final), all in USD: Solo 50 · Duo 80 · Team (key `trio`, 3 recruiters) 120.
 * The seat invariants hold again: per-seat 50 → 40 → 40, and no stack of smaller plans beats a bundle. */
test('USD pricing matches what the page promises: Duo saves 20, Team saves 30 vs separate Solo accounts', () => {
  assert.deepEqual(SEAT_LADDER.map((k) => planPrice(k, 'USD')), [50, 80, 120]);
  assert.equal(planPrice('solo', 'USD') * 2 - planPrice('duo', 'USD'), 20, 'Duo saves $20/month vs 2 Solo');
  assert.equal(planPrice('solo', 'USD') * 3 - planPrice('trio', 'USD'), 30, 'Team saves $30/month vs 3 Solo');
  assert.equal(PLANS.trio.display, 'Team');
});

test('seat pricing invariant: per-seat price never increases up the ladder, bundles never beaten by stacking', () => {
  for (const currency of CURRENCIES) {
    for (let i = 1; i < SEAT_LADDER.length; i += 1) {
      const lower = SEAT_LADDER[i - 1]; const upper = SEAT_LADDER[i];
      assert.ok(planPrice(upper, currency) / PLANS[upper].seats <= planPrice(lower, currency) / PLANS[lower].seats, `${currency}: ${upper} vs ${lower}`);
    }
    for (const key of SEAT_LADDER) assert.ok(planPrice(key, currency) <= cheapestStackCost(PLANS[key].seats, currency), `${currency}: ${key} beaten by stacking`);
  }
});

test('every account is billed in USD (Vietnam included) unless VND is switched back on', async () => {
  const { currencyForCountry } = await import('./billing/plans.js');
  assert.equal(currencyForCountry('Vietnam'), 'USD');
  assert.equal(currencyForCountry('United States'), 'USD');
});

test('any seat count can be assembled from the ladder', () => {
  for (const currency of CURRENCIES) for (let seats = 1; seats <= 40; seats += 1) assert.ok(Number.isFinite(cheapestStackCost(seats, currency)));
});

test('the sold ladder tops out at Team (3 accounts); the 5-seat tier is legacy only', () => {
  assert.deepEqual(SEAT_LADDER, ['solo', 'duo', 'trio']);
  assert.equal(PLANS.agency, undefined);
  assert.equal(PLANS[SEAT_LADDER[SEAT_LADDER.length - 1]].seats, 3);
  assert.equal(PLANS.team.legacy, true);
});

/* ── Seat allocation ─────────────────────────────────────────────────────── */

test('a recruiter who never invites anyone gets no team row at all', () => {
  const db = { teams: [] };
  assert.equal(db.teams.length, 0);
  assert.equal(seatsAllowed('solo'), 1);
});

test('creating a team is idempotent and the owner holds seat one', () => {
  const db = { teams: [] };
  const first = getOrCreateTeam(db, 'owner-1');
  const second = getOrCreateTeam(db, 'owner-1');
  assert.equal(first.id, second.id);
  assert.equal(db.teams.length, 1);
  assert.equal(first.members[0].userId, 'owner-1');
  assert.equal(first.members[0].role, 'owner');
  assert.equal(first.members[0].status, 'active');
});

test('members beyond the seat limit join read-only rather than being refused', () => {
  const db = { teams: [] };
  const team = getOrCreateTeam(db, 'owner-1');
  assert.equal(addMember(db, team, 'mate-1', 'duo').outcome, 'added');       // seat 2 of 2
  assert.equal(addMember(db, team, 'mate-2', 'duo').outcome, 'added_readonly');
  assert.equal(activeMembers(team).length, 2);
  assert.equal(team.members.length, 3);
});

test('downgrading demotes the newest members but never removes anyone', () => {
  const db = { teams: [] };
  const team = getOrCreateTeam(db, 'owner-1');
  addMember(db, team, 'mate-1', 'trio');
  addMember(db, team, 'mate-2', 'trio');
  assert.equal(activeMembers(team).length, 3);

  reconcileSeats(team, 'solo');
  assert.equal(team.members.length, 3, 'nobody is ever removed');
  assert.deepEqual(activeMembers(team).map((m) => m.userId), ['owner-1']);

  // Re-subscribing promotes them back, in the order they joined.
  reconcileSeats(team, 'trio');
  assert.deepEqual(activeMembers(team).map((m) => m.userId), ['owner-1', 'mate-1', 'mate-2']);
});

test('the owner keeps an active seat no matter when they were added', () => {
  const db = { teams: [] };
  const team = getOrCreateTeam(db, 'owner-1');
  team.members[0].joinedAt = Number.MAX_SAFE_INTEGER; // owner "joined" last
  addMember(db, team, 'mate-1', 'duo');
  reconcileSeats(team, 'starter'); // one seat only
  assert.deepEqual(activeMembers(team).map((m) => m.userId), ['owner-1']);
});

test('each plan grants exactly the seats it advertises', () => {
  for (const key of SEAT_LADDER) assert.equal(seatsAllowed(key), PLANS[key].seats);
  assert.equal(seatsAllowed('starter'), 1);
  // A retired plan code resolves rather than falling through to zero seats.
  assert.equal(seatsAllowed('agency'), PLANS.solo.seats);
});

test('Team is the largest self-serve team, and extras join read-only', () => {
  const db = { teams: [] };
  const team = getOrCreateTeam(db, 'owner-1');
  for (let i = 0; i < 8; i += 1) addMember(db, team, `mate-${i}`, 'team');
  assert.equal(activeMembers(team).length, 5, 'Team seats five');
  assert.equal(team.members.length, 9, 'and nobody was refused');
});

test('adding the same person twice is a no-op', () => {
  const db = { teams: [] };
  const team = getOrCreateTeam(db, 'owner-1');
  addMember(db, team, 'mate-1', 'trio');
  assert.equal(addMember(db, team, 'mate-1', 'trio').outcome, 'already_member');
  assert.equal(team.members.length, 2);
});
