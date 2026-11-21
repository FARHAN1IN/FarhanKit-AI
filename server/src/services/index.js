import {
  profileRepository,
  settingsRepository,
  cvDataRepository,
  skillRepository,
  experienceRepository,
} from '../repositories/index.js';
import { createCollectionService, createDocumentService, byOrder } from './factory.js';
import { SECTION_IDS } from '../validators/index.js';
import config from '../config/index.js';

/** Defaults guarantee the frontend always receives a complete settings object. */
export const SETTINGS_DEFAULTS = {
  siteTitle: '',
  metaDescription: '',
  favicon: '',
  accentColor: '#7c5cff',
  accentColor2: '#22d3ee',
  footerText: '© {year} {name}. All rights reserved.',
  hero: { greeting: "Hi, I'm", primaryCtaLabel: 'View my work', secondaryCtaLabel: 'Get in touch' },
  cv: { enabled: true, label: 'Download CV', showInNav: true, makerEnabled: true, makerLabel: 'CV Maker', aiEnabled: true },
  // Login lengths (admin → Settings → Sessions)
  accounts: { sessionDays: 30, adminSessionHours: Math.round(config.session.ttlMs / 3600000) || 2 },
  aiPlan: {
    freeReviews: 3,
    currency: 'USD',
    packages: [
      { name: 'Starter', credits: 5, price: 2 },
      { name: 'Pro', credits: 20, price: 5 },
    ],
    methods: [],
    instructions: 'Send the payment using one of the methods below, then enter the transaction ID. Your reviews are added as soon as we confirm the payment.',
  },
  sections: SECTION_IDS.map((id) => ({ id, enabled: true, navLabel: id[0].toUpperCase() + id.slice(1), eyebrow: '', title: '', subtitle: '' })),
  contact: { buttonLabel: 'Send message', successMessage: 'Thanks! Your message has been received.' },
};

export const profileService = createDocumentService(profileRepository, { name: 'Your Name', title: '' });

/** The owner's CV. Empty until saved once in admin → My CV (the frontend then falls back to portfolio data). */
export const cvDataService = createDocumentService(cvDataRepository, {});

const baseSettings = createDocumentService(settingsRepository, SETTINGS_DEFAULTS);
export const settingsService = {
  ...baseSettings,
  async get() {
    const s = await baseSettings.get();
    // Make sure every known section exists exactly once (keeps stored order).
    const stored = (s.sections ?? []).filter((x, i, arr) => SECTION_IDS.includes(x.id) && arr.findIndex((y) => y.id === x.id) === i);
    const missing = SETTINGS_DEFAULTS.sections.filter((d) => !stored.some((x) => x.id === d.id));
    return {
      ...s,
      hero: { ...SETTINGS_DEFAULTS.hero, ...s.hero },
      cv: { ...SETTINGS_DEFAULTS.cv, ...s.cv },
      contact: { ...SETTINGS_DEFAULTS.contact, ...s.contact },
      aiPlan: { ...SETTINGS_DEFAULTS.aiPlan, ...s.aiPlan },
      accounts: { ...SETTINGS_DEFAULTS.accounts, ...s.accounts },
      sections: [...stored, ...missing],
    };
  },
};

export const skillService = createCollectionService(skillRepository, { name: 'Skill group', sort: byOrder, defaults: { items: [] } });

export const experienceService = createCollectionService(experienceRepository, {
  name: 'Experience',
  // Newest first; entries without an end date are "current" and sort to the top.
  sort: (a, b) => (b.end || '9999').localeCompare(a.end || '9999') || b.start.localeCompare(a.start),
  defaults: { highlights: [] },
});
