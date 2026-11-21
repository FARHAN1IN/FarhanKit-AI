import { Router } from 'express';
import { profileSchema, settingsSchema, cvDataSchema, skillGroupSchema, experienceSchema } from '../validators/index.js';
import {
  profileController,
  settingsController,
  cvDataController,
  skillController,
  experienceController,
} from '../controllers/index.js';
import { crudRouter, documentRouter } from './factory.js';
import projectRoutes from './project.routes.js';
import contactRoutes from './contact.routes.js';
import uploadRoutes from './upload.routes.js';
import authRoutes from './auth.routes.js';
import { downloadCv } from '../controllers/cv.controller.js';
import aiRoutes from './ai.routes.js';
import cvImportRoutes from './cv-import.routes.js';
import accountRoutes from './account.routes.js';

const router = Router();

router.get('/health', (_req, res) => res.json({ success: true, status: 'ok', uptime: process.uptime() }));

router.use('/auth', authRoutes);
router.use('/profile', documentRouter(profileController, profileSchema));
router.use('/settings', documentRouter(settingsController, settingsSchema));
router.use('/skills', crudRouter(skillController, skillGroupSchema));
router.use('/experience', crudRouter(experienceController, experienceSchema));
router.use('/projects', projectRoutes);
router.use('/contact', contactRoutes);
router.use('/uploads', uploadRoutes);
router.get('/cv', downloadCv); // uploaded PDF download
router.use('/cv/data', documentRouter(cvDataController, cvDataSchema)); // CV builder data
router.use('/cv/import', cvImportRoutes); // upload a CV file → detected fields (not stored)
router.use('/account', accountRoutes); // visitor accounts (AI reviews)
router.use('/ai', aiRoutes); // AI ATS review (admin-managed AI models)

export default router;
