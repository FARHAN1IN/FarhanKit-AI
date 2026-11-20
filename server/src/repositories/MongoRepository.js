import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * Same interface as JsonRepository, but stored in MongoDB.
 * Each former JSON file is one MongoDB document: { _id: 'profile.json', value: <contents> }.
 * That keeps behaviour identical to the file version (order, ids, timestamps).
 *
 * Seeding: if the document doesn't exist yet and the repo ships a seed file
 * (server/data/<name>), its contents are copied in once — so a fresh database
 * starts with the content committed to git.
 */
export default class MongoRepository {
  #collection;
  #name;
  #seedFile;
  #queue = Promise.resolve();

  /** @param {import('mongodb').Collection} collection */
  constructor(collection, name, seedDir) {
    this.#collection = collection;
    this.#name = name;
    this.#seedFile = seedDir ? path.join(seedDir, name) : null;
  }

  async #seed() {
    if (!this.#seedFile) return null;
    try {
      const value = JSON.parse(await fs.readFile(this.#seedFile, 'utf8'));
      await this.#collection.updateOne({ _id: this.#name }, { $setOnInsert: { value } }, { upsert: true });
      return (await this.#collection.findOne({ _id: this.#name }))?.value ?? null;
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  }

  async #read() {
    await this.#queue; // read-your-writes
    const doc = await this.#collection.findOne({ _id: this.#name });
    return doc ? doc.value : this.#seed();
  }

  #write(value) {
    const task = this.#queue.then(() =>
      this.#collection.replaceOne({ _id: this.#name }, { value, updatedAt: new Date() }, { upsert: true }),
    );
    this.#queue = task.catch(() => {});
    return task;
  }

  /* ---- Single-document API ---- */
  async getDocument() {
    return (await this.#read()) ?? {};
  }

  async saveDocument(doc) {
    await this.#write(doc);
    return doc;
  }

  /* ---- Collection API ---- */
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
