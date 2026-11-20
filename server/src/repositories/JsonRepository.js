import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * Persistence layer backed by a JSON file.
 * Writes are serialized through a promise chain and performed atomically
 * (write temp file, then rename) so concurrent requests can't corrupt data.
 *
 * Swap this class for a database-backed repository with the same interface
 * and nothing above the repository layer needs to change.
 */
export default class JsonRepository {
  #file;
  #queue = Promise.resolve();

  constructor(dataDir, fileName) {
    this.#file = path.join(dataDir, fileName);
  }

  async #read() {
    try {
      return JSON.parse(await fs.readFile(this.#file, 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  }

  #write(data) {
    const task = this.#queue.then(async () => {
      const tmp = `${this.#file}.${process.pid}.tmp`;
      await fs.mkdir(path.dirname(this.#file), { recursive: true });
      await fs.writeFile(tmp, JSON.stringify(data, null, 2));
      await fs.rename(tmp, this.#file);
    });
    this.#queue = task.catch(() => {}); // keep chain alive after a failure
    return task;
  }

  /* ---- Single-document API (e.g. profile.json) ---- */
  async getDocument() {
    return (await this.#read()) ?? {};
  }

  async saveDocument(doc) {
    await this.#write(doc);
    return doc;
  }

  /* ---- Collection API (e.g. projects.json) ---- */
  async findAll() {
    return (await this.#read()) ?? [];
  }

  async findById(id) {
    return (await this.findAll()).find((item) => item.id === id) ?? null;
  }

  async create(item) {
    const items = await this.findAll();
    const record = { id: randomUUID(), ...item, createdAt: new Date().toISOString() };
    items.push(record);
    await this.#write(items);
    return record;
  }

  async update(id, patch) {
    const items = await this.findAll();
    const idx = items.findIndex((item) => item.id === id);
    if (idx === -1) return null;
    items[idx] = { ...items[idx], ...patch, id, updatedAt: new Date().toISOString() };
    await this.#write(items);
    return items[idx];
  }

  async remove(id) {
    const items = await this.findAll();
    const next = items.filter((item) => item.id !== id);
    if (next.length === items.length) return false;
    await this.#write(next);
    return true;
  }
}
