import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { PgStore } from './store-pg.js';

/* Row-level PostgreSQL persistence. Needs a DISPOSABLE database — every test
   drops app_records/app_state — so it only runs when TEST_DATABASE_URL is set:
     TEST_DATABASE_URL=postgresql://localhost:55432/storetest npm test */
const url = process.env.TEST_DATABASE_URL;
const skip = url ? false : 'set TEST_DATABASE_URL to a disposable database to run';

const admin = url ? new pg.Pool({ connectionString: url }) : null;
after(async () => {
  if (admin) await reset(); // leave the disposable database empty for whatever runs next
  await admin?.end();
});

async function reset() {
  await admin.query('DROP TABLE IF EXISTS app_records; DROP TABLE IF EXISTS app_state');
}

const seed = () => ({
  users: [{ id: 'u1', name: 'Ana' }, { id: 'u2', name: 'Bao' }],
  swipes: [{ id: 's1' }, { id: 's2' }],
  bookmarks: [],
  siteSettings: { banner: 'hello' },
});

async function open(seedFactory = seed) {
  const store = new PgStore(url, seedFactory);
  await store.init(1, 0);
  return store;
}

async function reopen(store) {
  await store.close();
  const again = await open(() => { throw new Error('must load, not re-seed'); });
  return again;
}

test('seeds an empty database, and a restart loads the same state', { skip }, async () => {
  await reset();
  const store = await open();
  const again = await reopen(store);
  assert.deepEqual(await again.read(), seed());
  await again.close();
});

test('a write updates only the rows it changed', { skip }, async () => {
  await reset();
  const store = await open();
  const { rows: [{ now }] } = await admin.query('SELECT clock_timestamp() AS now');
  await store.transaction((db) => { db.users[1].name = 'Bao N.'; });
  const { rows } = await admin.query('SELECT collection, id FROM app_records WHERE updated_at > $1', [now]);
  assert.deepEqual(rows, [{ collection: 'users', id: 'u2' }]);
  await store.close();
});

test('appends, deletes, reorders and values survive a restart', { skip }, async () => {
  await reset();
  let store = await open();
  await store.transaction((db) => {
    db.swipes.push({ id: 's3' });
    db.users = db.users.filter((u) => u.id !== 'u1');
    db.users.unshift({ id: 'u0', name: 'First' });
    db.siteSettings = { banner: 'changed' };
    db.cleared = null; // a top-level null must store, not break NOT NULL
    delete db.bookmarks;
    db.notes = [];
  });
  const expected = structuredClone(await store.read());
  store = await reopen(store);
  assert.deepEqual(await store.read(), expected);
  assert.deepEqual((await store.read()).users.map((u) => u.id), ['u0', 'u2'], 'order kept');
  assert.deepEqual((await store.read()).notes, [], 'an empty collection survives a restart');
  await store.close();
});

test('migrates the old single-row app_state and keeps it as a backup', { skip }, async () => {
  await reset();
  const legacy = { ...seed(), users: [{ id: 'old', name: 'Legacy user' }] };
  await admin.query('CREATE TABLE app_state (id integer PRIMARY KEY, doc jsonb NOT NULL)');
  await admin.query('INSERT INTO app_state (id, doc) VALUES (1, $1)', [JSON.stringify(legacy)]);
  let store = await open(() => { throw new Error('must migrate, not seed'); });
  assert.deepEqual(await store.read(), legacy);
  const { rows: [{ n: migrated }] } = await admin.query("SELECT count(*)::int AS n FROM app_records WHERE collection = 'users'");
  assert.equal(migrated, 1, 'the migration is written to app_records, not just loaded');
  store = await reopen(store);
  assert.deepEqual(await store.read(), legacy);
  const { rows } = await admin.query('SELECT count(*)::int AS n FROM app_state');
  assert.equal(rows[0].n, 1, 'app_state is left in place');
  await store.close();
});

test('only one process can own the database', { skip }, async () => {
  await reset();
  const owner = await open();
  await assert.rejects(open(), /already owns this database/);
  await owner.close();
});
