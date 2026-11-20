import asyncHandler from '../utils/asyncHandler.js';

/** HTTP handlers for any collection service (list/get/create/update/remove). */
export function createCrudController(service) {
  return {
    list: asyncHandler(async (_req, res) => {
      const data = await service.list();
      res.json({ success: true, count: data.length, data });
    }),
    get: asyncHandler(async (req, res) => {
      res.json({ success: true, data: await service.get(req.params.id) });
    }),
    create: asyncHandler(async (req, res) => {
      res.status(201).json({ success: true, data: await service.create(req.body) });
    }),
    update: asyncHandler(async (req, res) => {
      res.json({ success: true, data: await service.update(req.params.id, req.body) });
    }),
    remove: asyncHandler(async (req, res) => {
      await service.remove(req.params.id);
      res.status(204).end();
    }),
  };
}

/** HTTP handlers for a single-document service (get/replace). */
export function createDocumentController(service) {
  return {
    get: asyncHandler(async (_req, res) => {
      res.json({ success: true, data: await service.get() });
    }),
    replace: asyncHandler(async (req, res) => {
      await service.replace(req.body);
      res.json({ success: true, data: await service.get() });
    }),
  };
}
