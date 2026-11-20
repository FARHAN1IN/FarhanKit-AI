import config from '../config/index.js';
import JsonRepository from './JsonRepository.js';

/** Repository instances — the single place that knows where data lives. */
export const profileRepository = new JsonRepository(config.paths.data, 'profile.json');
export const settingsRepository = new JsonRepository(config.paths.data, 'settings.json');
export const projectRepository = new JsonRepository(config.paths.data, 'projects.json');
export const skillRepository = new JsonRepository(config.paths.data, 'skills.json');
export const experienceRepository = new JsonRepository(config.paths.data, 'experience.json');
export const cvDataRepository = new JsonRepository(config.paths.data, 'cv.json');
export const adminRepository = new JsonRepository(config.paths.data, 'admin.json');
export const messageRepository = new JsonRepository(config.paths.data, 'messages.json');
export const aiWalletRepository = new JsonRepository(config.paths.data, 'ai-wallets.json');
export const aiPaymentRepository = new JsonRepository(config.paths.data, 'ai-payments.json');
export const aiIpUsageRepository = new JsonRepository(config.paths.data, 'ai-ip-usage.json');
