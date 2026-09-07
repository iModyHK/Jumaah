import { useTranslation } from 'react-i18next';
import type { TenantPublicInfo } from '@jumaah/core';
import { archiveUrl } from './routes';

/** Link to the mosque's public archive in the header of the phone page, when the mosque switched it on. */
export function MobileArchiveLink({ tenant, slug }: { tenant: TenantPublicInfo; slug: string }) {
  const { t } = useTranslation();
  if (!tenant.ext?.archiveEnabled) return null;
  return (
    <a className="j-mobile-archive" href={archiveUrl(slug)}>
      {t('display.archive.title')}
    </a>
  );
}
