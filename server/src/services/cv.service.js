import path from 'node:path';
import { fileStore } from '../storage/index.js';
import { profileService } from './index.js';

/** "Ada Lovelace" → "Ada-Lovelace-CV.pdf" */
const fileNameFor = (name = '') =>
  `${name.normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-') || 'CV'}-CV.pdf`;

export const cvService = {
  /**
   * Works out how to deliver the CV from profile.resumeUrl:
   *   { type: 'file', data, fileName }      – a PDF uploaded through the admin panel
   *   { type: 'redirect', url }             – an external link or other site path
   *   null                                  – nothing set (frontend uses the generated CV page)
   */
  async resolve() {
    const profile = await profileService.get();
    const url = profile.resumeUrl?.trim();
    if (!url) return null;

    if (url.startsWith('/uploads/')) {
      // basename() prevents path traversal outside the uploads folder
      const file = await fileStore.get(path.basename(url));
      return file ? { type: 'file', data: file.data, fileName: fileNameFor(profile.name) } : null; // null: file was deleted
    }
    return { type: 'redirect', url };
  },
};
