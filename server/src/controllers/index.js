import { createCrudController, createDocumentController } from './factory.js';
import { profileService, settingsService, cvDataService, skillService, experienceService } from '../services/index.js';

export const profileController = createDocumentController(profileService);
export const settingsController = createDocumentController(settingsService);
export const cvDataController = createDocumentController(cvDataService);
export const skillController = createCrudController(skillService);
export const experienceController = createCrudController(experienceService);
