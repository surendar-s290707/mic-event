import { ZodError, type ZodSchema } from 'zod';
import { ApiError } from './errors.js';

/**
 * Parses a request body with a Zod schema and turns a failure into a 400 whose
 * `details` maps field -> message, which is what the forms render.
 */
export function parseBody<T>(schema: ZodSchema<T>, body: unknown): T {
  try {
    return schema.parse(body);
  } catch (error) {
    if (error instanceof ZodError) {
      const details: Record<string, string> = {};
      for (const issue of error.issues) {
        const field = issue.path.join('.') || 'body';
        if (!details[field]) details[field] = issue.message;
      }
      throw ApiError.badRequest('Some fields need fixing.', details);
    }
    throw error;
  }
}
