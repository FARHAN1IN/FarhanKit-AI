import AppError from '../utils/AppError.js';

/** Generic CRUD service for a collection repository. */
export function createCollectionService(repo, { name = 'Item', sort, defaults = {} } = {}) {
  return {
    async list() {
      const items = await repo.findAll();
      return sort ? items.sort(sort) : items;
    },

    async get(id) {
      const item = await repo.findById(id);
      if (!item) throw AppError.notFound(`${name} not found`);
      return item;
    },

    create: (data) => repo.create({ ...defaults, ...data }),

    async update(id, data) {
      const item = await repo.update(id, data);
      if (!item) throw AppError.notFound(`${name} not found`);
      return item;
    },

    async remove(id) {
      if (!(await repo.remove(id))) throw AppError.notFound(`${name} not found`);
    },
  };
}

/** Service for a single JSON document (profile, settings) with fallback defaults. */
export function createDocumentService(repo, defaults = {}) {
  return {
    async get() {
      const doc = await repo.getDocument();
      return { ...defaults, ...doc };
    },
    async replace(data) {
      return repo.saveDocument({ ...data, updatedAt: new Date().toISOString() });
    },
  };
}

/** Sort helper: by numeric `order` (missing last), then newest first. */
export const byOrder = (a, b) =>
  (a.order ?? Infinity) - (b.order ?? Infinity) || (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
