import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import MongoRepository from '../src/repositories/MongoRepository.js';

/** Minimal in-memory stand-in for a MongoDB collection (only the calls the repository uses). */
function fakeCollection() {
  const docs = new Map();
  const clone = (v) => structuredClone(v);
  return {
    docs,
    async findOne({ _id }) {
      return docs.has(_id) ? clone({ _id, ...docs.get(_id) }) : null;
    },
    async updateOne({ _id }, { $setOnInsert }, { upsert }) {
      if (!docs.has(_id) && upsert) docs.set(_id, clone($setOnInsert));
    },
    async replaceOne({ _id }, doc, { upsert }) {
      if (docs.has(_id) || upsert) docs.set(_id, clone(doc));
    },
  };
}

test('mongo repository: seeds from committed JSON once, then persists changes', async () => {
  const seedDir = await fs.mkdtemp(path.join(os.tmpdir(), 'seed-'));
  await fs.writeFile(path.join(seedDir, 'profile.json'), JSON.stringify({ name: 'Seed Name' }));
  await fs.writeFile(path.join(seedDir, 'projects.json'), JSON.stringify([{ id: 'p1', title: 'Seeded' }]));
  const col = fakeCollection();

  const profile = new MongoRepository(col, 'profile.json', seedDir);
  assert.equal((await profile.getDocument()).name, 'Seed Name');
  await profile.saveDocument({ name: 'Edited' });
  // a new instance (= server restart) reads the stored value, not the seed
  assert.equal((await new MongoRepository(col, 'profile.json', seedDir).getDocument()).name, 'Edited');

  const projects = new MongoRepository(col, 'projects.json', seedDir);
  assert.equal((await projects.findAll()).length, 1);
  const created = await projects.create({ title: 'New' });
  assert.ok(created.id && created.createdAt);
  assert.equal((await projects.update(created.id, { title: 'Renamed' })).title, 'Renamed');
  assert.equal((await projects.findById('p1')).title, 'Seeded');
  assert.equal(await projects.remove('p1'), true);
  assert.deepEqual((await projects.findAll()).map((p) => p.title), ['Renamed']);

  // no seed file → empty defaults
  const messages = new MongoRepository(col, 'messages.json', seedDir);
  assert.deepEqual(await messages.findAll(), []);
  assert.deepEqual(await new MongoRepository(col, 'settings.json', seedDir).getDocument(), {});
});
