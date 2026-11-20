import { Router } from 'express';
import { projectSchema } from '../validators/index.js';
import { projectController } from '../controllers/project.controller.js';
import { crudRouter } from './factory.js';

const router = Router();

// Must be registered before "/:id"
router.get('/categories', projectController.categories);

export default crudRouter(projectController, projectSchema, { router });
