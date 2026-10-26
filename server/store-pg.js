import pg from 'pg';
import { MemoryStore, RECORDS, VALUE } from './store-memory.js';

/* PostgreSQL store. The state lives in memory (see store-memory.js); the
   database holds one row per record — users, jobs, swipes, messages… — and a
   write saves only the rows it changed, not the whole state.

     app_records(collection, id, ord, doc)
       collection = top-level key (e.g. 'users'), id = record id, ord = position
       collection '$value' holds non-record values (id = key); '$meta' holds
       the list of record collections, so empty ones survive a restart.

   First start on a database that only has the old single-row app_state
   migrates it into app_records and leaves app_state untouched as a backup.
   An advisory lock lets exactly one process own the database at a time. */

const VALUE_COLLECTION = '$value';
const META_COLLECTION = '$meta';
const LOCK_KEY = 728_311_406; // arbitrary, fixed: "jobsmatchnow app_records owner"
const CHUNK = 2000;

export class PgStore extends MemoryStore {
  constructor(databaseUrl, seedFactory) {
    super(seedFactory);
    const local = /localhost|127\.0\.0\.1/.test(databaseUrl);
    this.pool = new pg.Pool({
      connectionString: databaseUrl,
      max: Number(process.env.PGPOOL_MAX || 5),
      ssl: local || process.env.PGSSL === 'disable' ? undefined : { rejectUnauthorized: false },
    });
    this.maxOrd = new Map(); // collection → highest ord in use
    this.recordKeys = new Set(); // collections stored as records
  }

  async init(retries = 30, delayMs = 2000) {
    let lastError;
    for (let attempt = 0; attempt < retries; attempt += 1) {
      try {
        await this.pool.query('SELECT 1');
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    if (lastError) throw new Error(`PostgreSQL never became ready: ${lastError.message}`);
    // Held for the life of the process: a second API (or a direct-DB script)
    // would otherwise work from a stale in-memory copy and overwrite changes.
    this.lockClient = await this.pool.connect();
    // Losing this connection loses the lock: stop rather than keep writing unowned.
    this.lockClient.on('error', (error) => this.fatal(`database lock connection lost: ${error.message}`));
    const { rows } = await this.lockClient.query('SELECT pg_try_advisory_lock($1) AS ok', [LOCK_KEY]);
    if (!rows[0].ok) {
      this.lockClient.release();
      throw new Error('Another JobsMatchNow process already owns this database — stop it first');
    }
    await super.init();
  }

  async close() {
    this.lockClient?.removeAllListeners('error');
    this.lockClient?.release();
    await this.pool.end();
  }

  /** Memory may no longer match the database: exit so the service manager restarts and reloads. */
  fatal(reason) {
    console.error(`JobMatch store: ${reason} — exiting so a restart reloads from the database`);
    process.exit(1);
  }

  async load() {
    await this.pool.query(`CREATE TABLE IF NOT EXISTS app_records (
      collection text NOT NULL, id text NOT NULL, ord bigint NOT NULL, doc jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (collection, id))`);
    await this.pool.query('CREATE INDEX IF NOT EXISTS app_records_order ON app_records (collection, ord)');

    const { rows: [{ n }] } = await this.pool.query('SELECT count(*)::int AS n FROM app_records');
    if (n === 0) {
      // Nothing migrated yet: start from the old single-row store if present.
      const { rows: [legacy] } = await this.pool.query("SELECT to_regclass('app_state') IS NOT NULL AS present");
      if (!legacy.present) return null;
      const { rows } = await this.pool.query('SELECT doc FROM app_state WHERE id = 1');
      if (!rows[0]) return null;
      console.log('JobMatch store: migrating app_state → app_records (app_state kept as backup)');
      this.unsaved = true;
      return rows[0].doc;
    }

    const state = {};
    const { rows: meta } = await this.pool.query('SELECT doc FROM app_records WHERE collection = $1 AND id = $2', [META_COLLECTION, 'collections']);
    for (const key of meta[0]?.doc || []) { state[key] = []; this.recordKeys.add(key); }
    const { rows } = await this.pool.query('SELECT collection, id, ord, doc FROM app_records WHERE collection <> $1 ORDER BY collection, ord', [META_COLLECTION]);
    for (const row of rows) {
      if (row.collection === VALUE_COLLECTION) { state[row.id] = row.doc; continue; }
      (state[row.collection] ||= []).push(row.doc);
      this.recordKeys.add(row.collection);
      this.maxOrd.set(row.collection, Math.max(this.maxOrd.get(row.collection) ?? -1, Number(row.ord)));
    }
    return state;
  }

  async persist(changes, next) {
    if (!changes.length) return;
    const client = await this.pool.connect();
    const maxOrd = new Map(this.maxOrd);
    try {
      await client.query('BEGIN');
      for (const change of changes) {
        const { key } = change;
        if (change.kind !== RECORDS || change.replaced) {
          await client.query('DELETE FROM app_records WHERE collection = $1', [key]);
          await client.query('DELETE FROM app_records WHERE collection = $1 AND id = $2', [VALUE_COLLECTION, key]);
          maxOrd.delete(key);
        }
        if (change.kind === null) continue;
        if (change.kind === VALUE) {
          await upsert(client, VALUE_COLLECTION, [{ id: key, ord: 0, doc: change.value }], false);
          continue;
        }
        if (change.deletes.length) {
          for (let i = 0; i < change.deletes.length; i += CHUNK) {
            await client.query('DELETE FROM app_records WHERE collection = $1 AND id = ANY($2::text[])', [key, change.deletes.slice(i, i + CHUNK)]);
          }
        }
        if (change.reorder || change.replaced) {
          // Positions changed: rewrite every record's ord to its array index.
          const all = next[key].map((doc, index) => ({ id: String(doc.id), ord: index, doc }));
          await upsert(client, key, all, true);
          maxOrd.set(key, all.length - 1);
        } else if (change.upserts.length) {
          let top = maxOrd.get(key) ?? -1;
          // New records go after everything else; existing ones keep their ord.
          await upsert(client, key, change.upserts.map(({ id, doc }) => ({ id, ord: ++top, doc })), false);
          maxOrd.set(key, top);
        }
      }
      const recordKeys = new Set(this.recordKeys);
      for (const change of changes) {
        if (change.kind === RECORDS) recordKeys.add(change.key);
        else recordKeys.delete(change.key);
      }
      if (!sameSet(recordKeys, this.recordKeys)) {
        await upsert(client, META_COLLECTION, [{ id: 'collections', ord: 0, doc: [...recordKeys].sort() }], false);
      }
      try {
        await client.query('COMMIT');
      } catch (error) {
        // A failed COMMIT may still have committed (e.g. the connection died
        // mid-way), so memory can't know the truth — reload it.
        this.fatal(`COMMIT failed, outcome unknown: ${error.message}`);
        throw error;
      }
      this.maxOrd = maxOrd;
      this.recordKeys = recordKeys;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

async function upsert(client, collection, rows, updateOrd) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    await client.query(
      `INSERT INTO app_records (collection, id, ord, doc)
       SELECT $1, r.id, r.ord, COALESCE(r.doc, 'null'::jsonb) FROM jsonb_to_recordset($2::jsonb) AS r(id text, ord bigint, doc jsonb)
       ON CONFLICT (collection, id) DO UPDATE SET doc = EXCLUDED.doc, updated_at = now()${updateOrd ? ', ord = EXCLUDED.ord' : ''}`,
      [collection, JSON.stringify(rows.slice(i, i + CHUNK))],
    );
  }
}

const sameSet = (a, b) => a.size === b.size && [...a].every((item) => b.has(item));
