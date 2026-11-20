import AppError from '../utils/AppError.js';

export function uploadFile(req, res, next) {
  if (!req.file) return next(AppError.badRequest('No file uploaded (field name must be "file")'));
  res.status(201).json({
    success: true,
    data: { url: `/uploads/${req.file.filename}`, size: req.file.size, type: req.file.mimetype },
  });
}
