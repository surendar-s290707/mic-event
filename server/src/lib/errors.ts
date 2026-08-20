import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Every failure the API returns on purpose is an ApiError. Anything else that
 * reaches the error handler is a bug and becomes a 500 with no internals
 * leaked to the client.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static badRequest(message: string, details?: unknown) {
    return new ApiError(400, 'bad_request', message, details);
  }
  static unauthorized(message = 'You need to be logged in.') {
    return new ApiError(401, 'unauthorized', message);
  }
  static forbidden(message = 'You do not have access to this.') {
    return new ApiError(403, 'forbidden', message);
  }
  static notFound(message = 'Not found.') {
    return new ApiError(404, 'not_found', message);
  }
  static conflict(code: string, message: string, details?: unknown) {
    return new ApiError(409, code, message, details);
  }
}

/**
 * Express 4 does not catch rejected promises from async handlers, so every
 * async route is wrapped in this.
 */
export function asyncHandler(handler: RequestHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}
