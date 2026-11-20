import asyncHandler from '../utils/asyncHandler.js';
import AppError from '../utils/AppError.js';
import { cvService } from '../services/cv.service.js';

/** GET /api/cv — downloads the uploaded CV as "<Name>-CV.pdf" (or redirects to an external link). */
export const downloadCv = asyncHandler(async (_req, res) => {
  const cv = await cvService.resolve();
  if (!cv) throw AppError.notFound('No CV file uploaded — use the generated CV page at /cv');
  if (cv.type === 'redirect') return res.redirect(302, cv.url);
  res.attachment(cv.fileName).set('Cache-Control', 'no-cache').type('application/pdf').send(cv.data);
});
