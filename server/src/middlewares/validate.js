import { validate } from '../validators/schema.js';
import AppError from '../utils/AppError.js';

/** Validates req.body against a schema and replaces it with the sanitized value. */
const validateBody = (schema, options) => (req, _res, next) => {
  const { value, errors } = validate(schema, req.body, options);
  if (errors) return next(AppError.badRequest('Validation failed', errors));
  req.body = value;
  next();
};

export default validateBody;
