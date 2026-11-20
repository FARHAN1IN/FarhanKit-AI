import path from 'node:path';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { fileStore } from '../storage/index.js';
import { uploadName, uploadHeaders, typeOf } from '../middlewares/upload.js';

export const uploadFile = asyncHandler(async (req, res) => {
  if (!req.file) throw AppError.badRequest('No file uploaded (field name must be "file")');
  const name = uploadName(req.file.mimetype);
  await fileStore.save(name, req.file.buffer, req.file.mimetype);
  res.status(201).json({
    success: true,
    data: { url: `/uploads/${name}`, size: req.file.size, type: req.file.mimetype },
  });
});

/** GET /uploads/:name — serves an uploaded file from disk or MongoDB. */
export const serveUpload = asyncHandler(async (req, res, next) => {
  const name = path.basename(req.params.name);
  const file = await fileStore.get(name);
  if (!file) return next(); // falls through to the 404 handler
  uploadHeaders(res, name);
  res.setHeader('Cache-Control', 'public, max-age=604800, immutable'); // names are random → safe to cache
  res.type(file.contentType ?? typeOf(name)).send(file.data);
});
