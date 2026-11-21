import { createRepository } from '../storage/index.js';

/** Repository instances — the single place that knows where data lives. */
export const profileRepository = createRepository('profile.json');
export const settingsRepository = createRepository('settings.json');
export const projectRepository = createRepository('projects.json');
export const skillRepository = createRepository('skills.json');
export const experienceRepository = createRepository('experience.json');
export const cvDataRepository = createRepository('cv.json');
export const adminRepository = createRepository('admin.json');
export const messageRepository = createRepository('messages.json');
export const aiWalletRepository = createRepository('ai-wallets.json');
export const aiPaymentRepository = createRepository('ai-payments.json');
export const aiIpUsageRepository = createRepository('ai-ip-usage.json');
export const aiProviderRepository = createRepository('ai-providers.json'); // API keys (encrypted)
