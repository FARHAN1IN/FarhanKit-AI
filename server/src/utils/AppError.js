/** Operational error with an HTTP status, safe to expose to clients. */
export default class AppError extends Error {
  constructor(message, statusCode = 500, details = undefined) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.details = details;
  }

  static badRequest(msg, details) { return new AppError(msg, 400, details); }
  static unauthorized(msg = 'Unauthorized') { return new AppError(msg, 401); }
  static notFound(msg = 'Resource not found') { return new AppError(msg, 404); }
}
