import type { ZodTypeAny, z } from 'zod';

export type FieldErrors = Record<string, string>;

/** Run a zod schema and flatten the first error message per top-level field. */
export function validate<S extends ZodTypeAny>(schema: S, input: unknown): { ok: true; data: z.infer<S>; errors: FieldErrors } | { ok: false; data: null; errors: FieldErrors } {
  const res = schema.safeParse(input);
  if (res.success) return { ok: true, data: res.data as z.infer<S>, errors: {} };
  const errors: FieldErrors = {};
  for (const issue of res.error.issues) {
    const key = issue.path.length ? String(issue.path[0]) : '_';
    if (!errors[key]) errors[key] = issue.message;
  }
  return { ok: false, data: null, errors };
}

/** Empty strings become undefined so optional zod fields validate. */
export function clean<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) out[k] = typeof v === 'string' && v.trim() === '' ? undefined : v;
  return out as T;
}
