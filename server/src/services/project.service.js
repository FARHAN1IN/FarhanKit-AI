import { projectRepository } from '../repositories/index.js';
import { createCollectionService, byOrder } from './factory.js';

const base = createCollectionService(projectRepository, {
  name: 'Project',
  sort: byOrder,
  defaults: { tags: [], featured: false },
});

export const projectService = {
  ...base,

  /** @param {{ category?: string, tag?: string, featured?: boolean }} filters */
  async list({ category, tag, featured } = {}) {
    let projects = await base.list();
    if (category) projects = projects.filter((p) => p.category?.toLowerCase() === category.toLowerCase());
    if (tag) projects = projects.filter((p) => p.tags?.some((t) => t.toLowerCase() === tag.toLowerCase()));
    if (featured !== undefined) projects = projects.filter((p) => Boolean(p.featured) === featured);
    return projects;
  },

  async categories() {
    const projects = await projectRepository.findAll();
    return [...new Set(projects.map((p) => p.category).filter(Boolean))].sort();
  },
};
