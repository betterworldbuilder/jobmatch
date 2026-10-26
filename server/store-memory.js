import { createDraft, current, enablePatches, finishDraft, freeze, isDraft } from 'immer';

/* Shared core for the stores: the whole app state lives once in memory, reads
   are free, and every transaction runs on a copy-on-write draft (Immer). A
   failed transaction leaves the state untouched; a successful one yields the
   exact records it changed, so a store persists only those — not the whole
   state on every swipe.

   One API process owns the state. Anything else that writes the database
   directly (e.g. server/jobs/migrate-existing-recruiters.js) must run while
   the API is stopped, or the API will not see — and may overwrite — its changes. */

enablePatches();

export const RECORDS = 'records'; // array of objects with unique ids → one row per item
export const VALUE = 'value'; // anything else → one row for the whole value

const recordId = (item) => (item && typeof item === 'object' && (typeof item.id === 'string' || typeof item.id === 'number') ? String(item.id) : null);

/** The ids of a record collection, or null when it isn't one (missing or duplicate ids). */
function idsOf(value) {
  if (!Array.isArray(value)) return null;
  const ids = new Set();
  for (const item of value) {
    const id = recordId(item);
    if (id === null || ids.has(id)) return null;
    ids.add(id);
  }
  return ids;
}

/** RECORDS when every item has a unique string/number id, else VALUE. */
export function kindOf(value) {
  return idsOf(value) ? RECORDS : VALUE;
}

/**
 * How one top-level key changed: { key, kind, upserts: [{ id, doc }],
 * deletes: [id], reorder, value?, replaced? }, or null if it didn't. Immer
 * keeps every untouched object's identity, so a reference check finds the
 * changed records. `reorder` means surviving records changed order or new
 * ones were not appended at the end, so positions must be rewritten.
 */
function diffKey(key, prev, next) {
  if (prev === next) return null;
  if (next === undefined) return { key, kind: null, upserts: [], deletes: [], reorder: false };
  const kind = kindOf(next);
  if (kind === VALUE) return { key, kind, value: next, upserts: [], deletes: [], reorder: false };
  if (kindOf(prev) !== RECORDS) {
    // New collection, or one that used to be a single value: write it all.
    return { key, kind, upserts: next.map((doc) => ({ id: recordId(doc), doc })), deletes: [], reorder: true, replaced: true };
  }
  const prevIndex = new Map(prev.map((doc, index) => [recordId(doc), index]));
  const nextIds = new Set();
  const upserts = [];
  let reorder = false;
  let lastSurvivor = -1;
  let sawNew = false;
  for (const doc of next) {
    const id = recordId(doc);
    nextIds.add(id);
    const index = prevIndex.get(id);
    if (index === undefined) { sawNew = true; upserts.push({ id, doc }); continue; }
    if (sawNew || index < lastSurvivor) reorder = true; // an existing record moved
    lastSurvivor = index;
    if (prev[index] !== doc) upserts.push({ id, doc });
  }
  const deletes = [];
  for (const id of prevIndex.keys()) if (!nextIds.has(id)) deletes.push(id);
  return { key, kind, upserts, deletes, reorder };
}

/** Every change between two whole states (used for first writes and as the fallback). */
export function diffState(before, after) {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  return [...keys].map((key) => diffKey(key, before?.[key], after?.[key])).filter(Boolean);
}

/**
 * The same changes, found from Immer's patches in O(changed records) instead
 * of O(all records). Only in-place edits and appends to a record collection
 * take the fast path; anything else (deletes, splices, a reassigned
 * collection, ids changing) falls back to diffKey for that key.
 * `ids` caches each record collection's id set across transactions.
 */
function diffFromPatches(before, after, patches, ids) {
  const touched = new Map(); // key → Set of indexes, or 'full'
  for (const { op, path } of patches) {
    const [key, index] = path;
    if (touched.get(key) === 'full') continue;
    const inPlace = path.length >= 3 || (path.length === 2 && op === 'replace');
    const append = path.length === 2 && op === 'add' && Array.isArray(before[key]) && index >= before[key].length;
    if (typeof index !== 'number' || !(inPlace || append)) { touched.set(key, 'full'); continue; }
    if (!touched.has(key)) touched.set(key, new Set());
    touched.get(key).add(index);
  }
  const changes = [];
  const idUpdates = new Map(); // key → Set of ids to add, or null to drop the cache
  for (const [key, indexes] of touched) {
    const fast = indexes !== 'full' && fastChange(key, before[key], after[key], indexes, ids);
    if (fast) { changes.push(fast.change); idUpdates.set(key, fast.added); continue; }
    const change = diffKey(key, before[key], after[key]);
    if (change) changes.push(change);
    idUpdates.set(key, null);
  }
  return { changes, idUpdates };
}

function fastChange(key, prev, next, indexes, ids) {
  if (!Array.isArray(next)) return null;
  if (!ids.has(key)) ids.set(key, idsOf(prev)); // first write to this collection: index it once
  const known = ids.get(key);
  if (!known) return null; // not a record collection
  const upserts = [];
  const added = new Set();
  for (const index of [...indexes].sort((a, b) => a - b)) {
    const doc = next[index];
    const id = recordId(doc);
    if (id === null) return null;
    if (index < prev.length) {
      if (recordId(prev[index]) !== id) return null; // a different record now sits here
      if (prev[index] !== doc) upserts.push({ id, doc });
    } else {
      if (known.has(id) || added.has(id)) return null; // duplicate id
      added.add(id);
      upserts.push({ id, doc });
    }
  }
  return { change: { key, kind: RECORDS, upserts, deletes: [], reorder: false }, added };
}

// Searches run without drafting the records they skip over; only records
// they return are drafted. Without this, find() over 200k swipes would wrap
// every one of them in a copy-on-write proxy. Callbacks see a record's draft
// if one was already handed out (so `b !== existing` works and values are
// current), otherwise the frozen original — so a callback must only read its
// item (mutate what find/filter return instead).
const DRAFT_STATE = Symbol.for('immer-state'); // Immer's own (registered) key for a draft's state
const SEARCHES = new Set(['find', 'findIndex', 'findLast', 'findLastIndex', 'some', 'every', 'filter']);

function searchable(draftArray) {
  return new Proxy(draftArray, {
    get(target, prop) {
      if (typeof prop !== 'string' || !SEARCHES.has(prop)) return Reflect.get(target, prop);
      return (callback, thisArg) => {
        const state = target[DRAFT_STATE];
        const items = state ? (state.copy_ || state.base_) : current(target);
        const test = (index) => callback.call(thisArg, items[index], index, items);
        switch (prop) {
          case 'find': for (let i = 0; i < items.length; i += 1) if (test(i)) return target[i]; return undefined;
          case 'findLast': for (let i = items.length - 1; i >= 0; i -= 1) if (test(i)) return target[i]; return undefined;
          case 'findIndex': for (let i = 0; i < items.length; i += 1) if (test(i)) return i; return -1;
          case 'findLastIndex': for (let i = items.length - 1; i >= 0; i -= 1) if (test(i)) return i; return -1;
          case 'some': for (let i = 0; i < items.length; i += 1) if (test(i)) return true; return false;
          case 'every': for (let i = 0; i < items.length; i += 1) if (!test(i)) return false; return true;
          default: { // filter
            const out = [];
            for (let i = 0; i < items.length; i += 1) if (test(i)) out.push(target[i]);
            return out;
          }
        }
      };
    },
  });
}

function transactionView(draft) {
  const arrays = new Map();
  return new Proxy(draft, {
    get(target, prop) {
      const value = Reflect.get(target, prop);
      if (!Array.isArray(value) || !isDraft(value)) return value;
      if (arrays.get(prop)?.draft !== value) arrays.set(prop, { draft: value, view: searchable(value) });
      return arrays.get(prop).view;
    },
  });
}

/** Hand transaction results back as plain, mutable copies — drafts die when the
    transaction ends, and state objects are frozen. Results are small, so copying is cheap. */
function detach(value) {
  if (isDraft(value)) return structuredClone(current(value));
  if (value === null || typeof value !== 'object') return value;
  if (Object.isFrozen(value)) return structuredClone(value);
  if (Array.isArray(value)) return value.map(detach);
  if (Object.getPrototypeOf(value) !== Object.prototype) return value;
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, detach(v)]));
}

export class MemoryStore {
  constructor(seedFactory) {
    this.seedFactory = seedFactory;
    this.state = null;
    this.ids = new Map();
    this.queue = Promise.resolve();
  }

  /** Subclasses: return the stored state, or null when nothing is stored yet.
      Set this.unsaved = true when the state came from elsewhere (a migration)
      and must be written in full before use. */
  async load() { return null; }

  /** Subclasses: make `changes` (from diffState) durable before the state is swapped in. */
  async persist(_changes, _next) {}

  async init() {
    let loaded = await this.load();
    if (!loaded) { loaded = this.seedFactory(); this.unsaved = true; }
    if (this.unsaved) {
      await this.persist(diffState({}, loaded), loaded);
      this.unsaved = false;
    }
    this.state = freeze(loaded, true);
  }

  /** The current state. It is frozen: change data only inside transaction(). */
  async read() {
    return this.state;
  }

  transaction(update) {
    const task = this.queue.then(async () => {
      const draft = createDraft(this.state);
      const result = detach(await update(transactionView(draft)));
      let patches = [];
      const next = finishDraft(draft, (list) => { patches = list; });
      if (next !== this.state) {
        const { changes, idUpdates } = diffFromPatches(this.state, next, patches, this.ids);
        await this.persist(changes, next);
        this.state = next;
        for (const [key, added] of idUpdates) {
          if (added === null) this.ids.delete(key);
          else for (const id of added) this.ids.get(key)?.add(id);
        }
      }
      return result;
    });
    this.queue = task.catch(() => undefined);
    return task;
  }
}
