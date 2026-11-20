import config from '../config/index.js';
import AppError from '../utils/AppError.js';

export function notFound(req, _res, next) {
  next(AppError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  // Malformed JSON body from express.json()
  if (err.type === 'entity.parse.failed') err = AppError.badRequest('Malformed JSON body');
  if (err.name === 'MulterError') {
    err = AppError.badRequest(err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 5 MB)' : err.message);
  }

  const status = err.statusCode ?? 500;
  if (status >= 500 && config.env !== 'test') console.error(err);

  res.status(status).json({
    success: false,
    error: {
      message: status >= 500 && config.env === 'production' ? 'Internal server error' : err.message,
      ...(err.details && { details: err.details }),
    },
  });
}
