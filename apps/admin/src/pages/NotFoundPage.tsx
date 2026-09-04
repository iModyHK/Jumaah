import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@jumaah/ui';

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <EmptyState
      title={t('errors.NOT_FOUND')}
      action={
        <Link to="/" className="j-btn">
          {t('nav.dashboard')}
        </Link>
      }
    />
  );
}
