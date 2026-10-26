import test from 'node:test';
import assert from 'node:assert/strict';
import { diffState, kindOf, MemoryStore, RECORDS, VALUE } from './store-memory.js';

/* The in-memory store core. PostgreSQL behaviour (row-level persistence,
   migration, the single-owner lock) is covered by store-pg.test.js, which
   runs when TEST_DATABASE_URL points at a disposable database. */

class RecordingStore extends MemoryStore {
  constructor(seed) { super(() => structuredClone(seed)); this.writes = []; }
  async persist(changes) { this.writes.push(changes); }
}

const seed = {
  users: [{ id: 'u1', name: 'Ana' }, { id: 'u2', name: 'Bao' }],
  swipes: [],
  siteSettings: { banner: 'hello' },
};

const byKey = (changes, key) => changes.find((change) => change.key === key);

test('kindOf: arrays of uniquely-identified objects are records, everything else a value', () => {
  assert.equal(kindOf([{ id: 'a' }, { id: 1 }]), RECORDS);
  assert.equal(kindOf([]), RECORDS);
  assert.equal(kindOf([{ id: 'a' }, { id: 'a' }]), VALUE, 'duplicate ids');
  assert.equal(kindOf([{ name: 'no id' }]), VALUE);
  assert.equal(kindOf({ banner: 'x' }), VALUE);
});

test('a write persists only the records it changed', async () => {
  const store = new RecordingStore(seed);
  await store.init();
  store.writes.length = 0;
  await store.transaction((db) => { db.users.find((u) => u.id === 'u2').name = 'Bao N.'; });
  assert.equal(store.writes.length, 1);
  const [change] = store.writes[0];
  assert.equal(store.writes[0].length, 1, 'untouched collections are not written');
  assert.equal(change.key, 'users');
  assert.deepEqual(change.upserts.map((u) => u.id), ['u2']);
  assert.deepEqual(change.deletes, []);
  assert.equal(change.reorder, false);
});

test('appends, deletes and reorders are detected', () => {
  const before = { swipes: [{ id: 's1' }, { id: 's2' }, { id: 's3' }] };
  const appended = diffState(before, { swipes: [...before.swipes, { id: 's4' }] });
  assert.deepEqual(byKey(appended, 'swipes').upserts.map((u) => u.id), ['s4']);
  assert.equal(byKey(appended, 'swipes').reorder, false);

  const removed = diffState(before, { swipes: before.swipes.filter((s) => s.id !== 's2') });
  assert.deepEqual(byKey(removed, 'swipes').deletes, ['s2']);
  assert.equal(byKey(removed, 'swipes').reorder, false, 'removing keeps the remaining order');

  const prepended = diffState(before, { swipes: [{ id: 's0' }, ...before.swipes] });
  assert.equal(byKey(prepended, 'swipes').reorder, true);

  const reversed = diffState(before, { swipes: [...before.swipes].reverse() });
  assert.equal(byKey(reversed, 'swipes').reorder, true);
});

test('non-record values are written whole', () => {
  const changes = diffState(seed, { ...seed, siteSettings: { banner: 'new' } });
  assert.deepEqual(byKey(changes, 'siteSettings'), { key: 'siteSettings', kind: VALUE, value: { banner: 'new' }, upserts: [], deletes: [], reorder: false });
});

test('a failed transaction changes nothing and writes nothing', async () => {
  const store = new RecordingStore(seed);
  await store.init();
  store.writes.length = 0;
  await assert.rejects(store.transaction((db) => { db.users.push({ id: 'u3' }); throw new Error('boom'); }), /boom/);
  assert.equal((await store.read()).users.length, 2);
  assert.equal(store.writes.length, 0);
});

test('a transaction that changes nothing writes nothing', async () => {
  const store = new RecordingStore(seed);
  await store.init();
  store.writes.length = 0;
  const name = await store.transaction((db) => db.users[0].name);
  assert.equal(name, 'Ana');
  assert.equal(store.writes.length, 0);
});

test('read state is frozen; transaction results come back plain and mutable', async () => {
  const store = new RecordingStore(seed);
  await store.init();
  const db = await store.read();
  assert.throws(() => { db.users[0].name = 'changed outside a transaction'; }, TypeError);
  const result = await store.transaction((draft) => {
    const user = draft.users.find((u) => u.id === 'u1');
    user.name = 'Ana T.';
    return { user, all: draft.users };
  });
  result.user.extra = true; // callers may decorate what they get back
  const untouched = await store.transaction((draft) => draft.users.find((u) => u.id === 'u2'));
  untouched.extra = true; // even a record the transaction only read
  assert.equal(result.user.name, 'Ana T.');
  assert.equal(result.all.length, 2);
  assert.equal((await store.read()).users[0].extra, undefined, 'decorating a result never leaks into the state');
});

test('searches inside a transaction see drafts already handed out', async () => {
  const store = new RecordingStore({ bookmarks: [{ id: 'b1', userId: 'u1' }, { id: 'b2', userId: 'u2' }] });
  await store.init();
  await store.transaction((db) => {
    const existing = db.bookmarks.find((b) => b.userId === 'u1');
    existing.note = 'seen';
    assert.equal(db.bookmarks.find((b) => b.note === 'seen'), existing, 'search sees the in-transaction change');
    db.bookmarks = db.bookmarks.filter((b) => b !== existing); // identity comparison against a handed-out draft
  });
  assert.deepEqual((await store.read()).bookmarks.map((b) => b.id), ['b2']);
});

test('appends and edits take the fast path; deletes still persist correctly', async () => {
  const store = new RecordingStore({ swipes: Array.from({ length: 5 }, (_, i) => ({ id: `s${i}` })) });
  await store.init();
  store.writes.length = 0;
  await store.transaction((db) => { db.swipes.push({ id: 's5' }); db.swipes.find((s) => s.id === 's1').seen = true; });
  assert.deepEqual(store.writes[0][0].upserts.map((u) => u.id), ['s1', 's5']);
  await store.transaction((db) => { db.swipes = db.swipes.filter((s) => s.id !== 's2'); });
  assert.deepEqual(store.writes[1][0].deletes, ['s2']);
  await store.transaction((db) => { db.swipes.push({ id: 's0' }); }); // duplicate id → no longer a record collection
  assert.equal(store.writes[2][0].kind, VALUE);
});

test('transactions run one at a time, each seeing the previous result', async () => {
  const store = new RecordingStore({ counters: [{ id: 'c', n: 0 }] });
  await store.init();
  await Promise.all(Array.from({ length: 20 }, () => store.transaction(async (db) => {
    const counter = db.counters[0];
    const seen = counter.n;
    await new Promise((resolve) => setImmediate(resolve));
    counter.n = seen + 1;
  })));
  assert.equal((await store.read()).counters[0].n, 20);
});
