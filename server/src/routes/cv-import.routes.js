import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import config from '../config/index.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { extractText, IMPORT_TYPES } from '../services/cv-import/extract.js';
import { parseCv } from '../services/cv-import/parse.js';

const router = Router();

// Read into memory only — the uploaded CV is never written to disk or the database.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) =>
    IMPORT_TYPES[file.mimetype] || /\.(pdf|docx|txt)$/i.test(file.originalname)
      ? cb(null, true)
      : cb(AppError.badRequest('Please upload a PDF, Word (.docx) or text file.')),
}).single('file');

const limiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: config.env === 'test' ? 1000 : 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, error: { message: 'Too many uploads — please try again later.' } },
});

/** POST /api/cv/import (multipart "file") → CV builder fields detected from the file. */
router.post('/', limiter, upload, asyncHandler(async (req, res) => {
  if (!req.file) throw AppError.badRequest('Please choose a CV file to upload.');
  const text = await extractText(req.file);
  const { cv, found } = parseCv(text);
  res.json({ success: true, data: { cv, found } });
}));

export default router;
