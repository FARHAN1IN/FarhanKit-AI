import { patterns } from './schema.js';
import { AI_PROVIDER_TYPES } from '../config/ai-presets.js';

const str = (max, extra = {}) => ({ type: 'string', max, ...extra });
const link = (max = 500) => str(max, { pattern: patterns.LINK, message: 'must be a URL (https://…) or a path starting with /' });

export const SECTION_IDS = ['about', 'skills', 'projects', 'experience', 'contact'];
export const SOCIAL_ICONS = ['github', 'linkedin', 'x', 'instagram', 'facebook', 'youtube', 'dribbble', 'globe', 'mail'];

/* ---------- Auth ---------- */
const USERNAME = /^[a-zA-Z0-9._@-]+$/;

export const loginSchema = {
  username: str(40, { required: true }),
  password: { type: 'string', required: true, max: 200 },
};

export const accountSchema = {
  currentPassword: { type: 'string', required: true, max: 200 },
  username: str(40, { min: 3, pattern: USERNAME, message: 'username may only contain letters, numbers and . _ @ -' }),
  newPassword: { type: 'string', min: 8, max: 200 },
};

/* ---------- Contact ---------- */
export const contactSchema = {
  name: str(80, { required: true, min: 2 }),
  email: str(120, { required: true, pattern: patterns.EMAIL, message: 'email is invalid' }),
  subject: str(120),
  message: str(2000, { required: true, min: 10 }),
};

/* ---------- Projects ---------- */
export const projectSchema = {
  title: str(100, { required: true, min: 2 }),
  description: str(600, { required: true, min: 10 }),
  tags: { type: 'array', of: 'string', max: 12, itemMax: 30 },
  category: str(40),
  image: link(),
  repoUrl: link(),
  liveUrl: link(),
  featured: { type: 'boolean' },
  order: { type: 'number', min: 0 },
};

/* ---------- Experience ---------- */
export const experienceSchema = {
  role: str(100, { required: true }),
  company: str(100, { required: true }),
  location: str(60),
  start: str(7, { required: true, pattern: patterns.MONTH, message: 'start must be YYYY-MM' }),
  end: str(7, { pattern: patterns.MONTH, message: 'end must be YYYY-MM (leave empty if current)' }),
  summary: str(500),
  highlights: { type: 'array', of: 'string', max: 10, itemMax: 300 },
};

/* ---------- Skills (one document per group) ---------- */
export const skillGroupSchema = {
  category: str(60, { required: true }),
  order: { type: 'number', min: 0 },
  items: {
    type: 'array',
    max: 30,
    of: {
      name: str(60, { required: true }),
      level: { type: 'number', required: true, min: 0, max: 100 },
    },
  },
};

/* ---------- Profile (single document) ---------- */
export const profileSchema = {
  name: str(80, { required: true }),
  initials: str(6),
  logoImage: link(),
  avatar: link(),
  title: str(100, { required: true }),
  roles: { type: 'array', of: 'string', max: 8, itemMax: 60 },
  tagline: str(300),
  about: { type: 'array', of: 'string', max: 10, itemMax: 2000 },
  location: str(80),
  email: str(120, { pattern: patterns.EMAIL, message: 'email is invalid' }),
  availability: str(80),
  resumeUrl: link(),
  stats: {
    type: 'array',
    max: 6,
    of: {
      label: str(40, { required: true }),
      value: { type: 'number', required: true, min: 0 },
      suffix: str(4),
    },
  },
  socials: {
    type: 'array',
    max: 10,
    of: {
      name: str(30, { required: true }),
      url: link(),
      icon: str(20, { enum: SOCIAL_ICONS }),
    },
  },
};

/* ---------- Owner's CV (single document, built in admin → My CV) ---------- */
export const cvDataSchema = {
  name: str(80, { required: true }),
  title: str(100),
  email: str(120, { pattern: patterns.EMAIL, message: 'email is invalid' }),
  phone: str(40),
  location: str(80),
  links: { type: 'array', of: 'string', max: 5, itemMax: 200 },
  photo: link(),
  summary: str(1500),
  experience: {
    type: 'array',
    max: 15,
    of: { role: str(100), company: str(100), dates: str(60), details: str(2000) },
  },
  education: {
    type: 'array',
    max: 10,
    of: { degree: str(120), school: str(120), year: str(40) },
  },
  skills: { type: 'array', of: 'string', max: 60, itemMax: 60 },
  languages: { type: 'array', of: 'string', max: 15, itemMax: 40 },
  projects: {
    type: 'array',
    max: 12,
    of: { name: str(120), details: str(1000) },
  },
  certifications: { type: 'array', of: 'string', max: 30, itemMax: 160 },
  targetJob: str(8000), // job description for the ATS score (never shown on the CV)
};

/* ---------- AI ATS review (visitor's CV, never stored; photo isn't sent) ---------- */
export const aiReviewSchema = Object.fromEntries(
  // name optional and email unchecked: a half-finished CV can still be reviewed
  Object.entries(cvDataSchema).filter(([k]) => k !== 'photo').map(([k, v]) => [k, k === 'name' ? str(80) : k === 'email' ? str(120) : v]),
);

/* ---------- AI review payments ---------- */
export const aiPaymentSchema = {
  packageIndex: { type: 'number', required: true, min: 0, max: 20 },
  method: str(40),
  transactionId: str(80, { required: true, min: 3 }),
  sender: str(80),
};
export const aiDecisionSchema = { status: str(10, { required: true, enum: ['approved', 'rejected'] }) };
export const aiGrantSchema = {
  code: str(12, { required: true, min: 4 }),
  credits: { type: 'number', required: true, min: -1000, max: 1000 },
};

/* ---------- AI models (admin) ---------- */
export const aiProviderSchema = {
  type: str(20, { required: true, enum: AI_PROVIDER_TYPES }),
  label: str(60),
  apiKey: str(400), // empty on edit = keep the saved key
  model: str(150),
  baseUrl: str(300, { pattern: /^https?:\/\/\S+$/i, message: 'API URL must start with http:// or https://' }),
  enabled: { type: 'boolean' },
};

/* ---------- Site settings (single document) ---------- */
export const settingsSchema = {
  siteTitle: str(120),
  metaDescription: str(300),
  favicon: link(),
  accentColor: str(7, { pattern: patterns.HEX, message: 'accentColor must be a hex color like #7c5cff' }),
  accentColor2: str(7, { pattern: patterns.HEX, message: 'accentColor2 must be a hex color like #22d3ee' }),
  footerText: str(200),
  hero: {
    type: 'object',
    schema: {
      greeting: str(40),
      primaryCtaLabel: str(40),
      secondaryCtaLabel: str(40),
    },
  },
  cv: {
    type: 'object',
    schema: {
      enabled: { type: 'boolean' },
      label: str(40),
      showInNav: { type: 'boolean' },
      makerEnabled: { type: 'boolean' },
      makerLabel: str(40),
      aiEnabled: { type: 'boolean' },
    },
  },
  aiPlan: {
    type: 'object',
    schema: {
      freeReviews: { type: 'number', min: 0, max: 100 },
      currency: str(10),
      packages: {
        type: 'array',
        max: 6,
        of: {
          name: str(40, { required: true }),
          credits: { type: 'number', required: true, min: 1, max: 1000 },
          price: { type: 'number', required: true, min: 0 },
        },
      },
      methods: {
        type: 'array',
        max: 6,
        of: { name: str(40, { required: true }), details: str(200) },
      },
      instructions: str(600),
    },
  },
  sections: {
    type: 'array',
    max: SECTION_IDS.length,
    of: {
      id: str(20, { required: true, enum: SECTION_IDS }),
      enabled: { type: 'boolean' },
      navLabel: str(30),
      eyebrow: str(60),
      title: str(120),
      subtitle: str(400),
    },
  },
  contact: {
    type: 'object',
    schema: {
      buttonLabel: str(40),
      successMessage: str(200),
    },
  },
};
