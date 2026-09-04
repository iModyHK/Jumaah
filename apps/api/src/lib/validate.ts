import type { ZodTypeAny, z } from 'zod';
import { badRequest } from './errors.js';

export function parse<T extends ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const res = schema.safeParse(input ?? {});
  if (!res.success) {
    throw badRequest(
      'Validation failed',
      res.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  return res.data;
}

export function idParam(params: unknown, key = 'id'): string {
  const v = (params as Record<string, unknown>)?.[key];
  if (typeof v !== 'string' || !v) throw badRequest(`Missing ${key}`);
  return v;
}
