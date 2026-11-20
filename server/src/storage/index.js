/**
 * Storage backend selection.
 *
 *   MONGODB_URI set   → data + uploaded files in MongoDB (for free hosts whose disk is wiped, e.g. Render)
 *   otherwise         → JSON files in server/data and files in server/uploads (local development)
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { MongoClient, Binary } from 'mongodb';
import config from '../config/index.js';
import JsonRepository from '../repositories/JsonRepository.js';
import MongoRepository from '../repositories/MongoRepository.js';

const SEED_DATA = config.paths.seedData; // content committed to git
const SEED_UPLOADS = config.paths.seedUploads;

const client = config.mongoUri ? new MongoClient(config.mongoUri, { serverSelectionTimeoutMS: 10_000 }) : null;
const db = client?.db(); // database name comes from the URI (defaults to "test")

export const storageKind = client ? 'mongodb' : 'files';

/** Called once at startup so a bad MONGODB_URI fails fast with a clear message. */
export async function connectStorage() {
  if (!client) return;
  await client.connect();
  await db.command({ ping: 1 });
}

export async function closeStorage() {
  await client?.close();
}

export function createRepository(fileName) {
  return client
    ? new MongoRepository(db.collection('documents'), fileName, SEED_DATA)
    : new JsonRepository(config.paths.data, fileName);
}

/* ---------------- Uploaded files ---------------- */

const safeName = (name) => path.basename(String(name)); // no path traversal

const diskStore = {
  async save(name, buffer) {
    await fs.mkdir(config.paths.uploads, { recursive: true });
    await fs.writeFile(path.join(config.paths.uploads, safeName(name)), buffer);
  },
  async get(name) {
    try {
      return { data: await fs.readFile(path.join(config.paths.uploads, safeName(name))) };
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  },
};

const mongoStore = {
  async save(name, buffer, contentType) {
    await db.collection('uploads').replaceOne(
      { _id: safeName(name) },
      { data: new Binary(buffer), contentType, size: buffer.length, createdAt: new Date() },
      { upsert: true },
    );
  },
  async get(name) {
    const doc = await db.collection('uploads').findOne({ _id: safeName(name) });
    if (doc) return { data: Buffer.from(doc.data.buffer), contentType: doc.contentType };
    // Files committed to git (e.g. your photo) are served from the repo until replaced.
    try {
      return { data: await fs.readFile(path.join(SEED_UPLOADS, safeName(name))) };
    } catch {
      return null;
    }
  },
};

export const fileStore = client ? mongoStore : diskStore;
