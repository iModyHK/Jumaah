import i18next from 'i18next';
import { ApiRequestError } from '@jumaah/ui';

/** Map an API error to a localized message (errors.* by code when possible). */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiRequestError) {
    const key = `errors.${err.code}`;
    if (i18next.exists(key)) return i18next.t(key);
    if (err.status === 401) return i18next.t('errors.UNAUTHORIZED');
    if (err.status === 403) return i18next.t('errors.FORBIDDEN');
    if (err.status === 404) return i18next.t('errors.NOT_FOUND');
    if (err.status === 429) return i18next.t('errors.RATE_LIMITED');
    return err.message || i18next.t('common.error');
  }
  if (err instanceof Error) return err.message || i18next.t('common.error');
  return i18next.t('common.error');
}
