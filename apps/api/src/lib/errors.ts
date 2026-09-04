export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (message = 'Bad request', details?: unknown) => new HttpError(400, 'VALIDATION', message, details);
export const unauthorized = (message = 'Unauthorized') => new HttpError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'Forbidden') => new HttpError(403, 'FORBIDDEN', message);
export const notFound = (what = 'Resource') => new HttpError(404, 'NOT_FOUND', `${what} not found`);
export const conflict = (message = 'Conflict', details?: unknown) => new HttpError(409, 'CONFLICT', message, details);
export const tooMany = (message = 'Too many requests') => new HttpError(429, 'RATE_LIMITED', message);
export const serverError = (message = 'Internal error') => new HttpError(500, 'INTERNAL', message);
