import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import multer from 'multer';
import config from '../config/index.js';
import AppError from '../utils/AppError.js';

const ALLOWED = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
  'image/x-icon': '.ico',
  'image/vnd.microsoft.icon': '.ico',
  'application/pdf': '.pdf',
};

fs.mkdirSync(config.paths.uploads, { recursive: true });

/** Accepts one image/PDF (max 5 MB) and stores it under a random name. */
export const uploadSingle = multer({
  storage: multer.diskStorage({
    destination: config.paths.uploads,
    filename: (_req, file, cb) => cb(null, `${randomUUID()}${ALLOWED[file.mimetype]}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) =>
    ALLOWED[file.mimetype]
      ? cb(null, true)
      : cb(AppError.badRequest('Only PNG, JPG, WEBP, GIF, SVG, ICO or PDF files are allowed')),
}).single('file');

/** Headers for serving user uploads: no scripts can ever run from them. */
export function uploadHeaders(res, filePath) {
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  if (path.extname(filePath) === '.pdf') res.setHeader('Content-Disposition', 'inline');
}
