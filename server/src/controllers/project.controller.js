import asyncHandler from '../utils/asyncHandler.js';
import { projectService } from '../services/project.service.js';
import { createCrudController } from './factory.js';

const parseBool = (v) => (v === 'true' ? true : v === 'false' ? false : undefined);

export const projectController = {
  ...createCrudController(projectService),

  // Overrides the generic list to support ?category=&tag=&featured=
  list: asyncHandler(async (req, res) => {
    const { category, tag, featured } = req.query;
    const data = await projectService.list({ category, tag, featured: parseBool(featured) });
    res.json({ success: true, count: data.length, data });
  }),

  categories: asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await projectService.categories() });
  }),
};
