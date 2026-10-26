import fs from 'node:fs';
import path from 'node:path';
import { MemoryStore } from './store-memory.js';

/* Zero-dependency dev store: the state lives in memory (see store-memory.js)
   and each write rewrites the whole JSON file — fine for dev-sized data.
   DATABASE_URL selects the PostgreSQL store, which writes only changed rows. */
export class JsonStore extends MemoryStore {
  constructor(filePath, seedFactory) {
    super(seedFactory);
    this.filePath = filePath;
  }

  async load() {
    await fs.promises.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      return JSON.parse(await fs.promises.readFile(this.filePath, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }

  async persist(_changes, next) {
    const tempPath = `${this.filePath}.${process.pid}.tmp`;
    await fs.promises.writeFile(tempPath, JSON.stringify(next, null, 2));
    await fs.promises.rename(tempPath, this.filePath);
  }
}
