import { useTranslation } from 'react-i18next';
import { Spinner } from '@jumaah/ui';
import { phrase } from '../phrases';

export function ReconnectBanner() {
  const { t } = useTranslation();
  return (
    <div className="j-banner" role="status">
      <Spinner />
      <span>{t('display.reconnecting')}</span>
    </div>
  );
}

export function PausedPill({ languages }: { languages: string[] }) {
  const { t } = useTranslation();
  const other = languages.find((l) => l !== 'ar');
  return (
    <div className="j-pill" role="status">
      <span className="j-dot" />
      <span lang="ar" dir="rtl">
        {t('display.paused', { lng: 'ar' })}
      </span>
      {other && (
        <>
          <span style={{ opacity: 0.4 }}>·</span>
          <span lang={other}>{phrase('paused', other)}</span>
        </>
      )}
    </div>
  );
}

export function CenterMessage({ children, spinner = false }: { children: React.ReactNode; spinner?: boolean }) {
  return (
    <div className="j-center">
      {spinner && <Spinner />}
      <div>{children}</div>
    </div>
  );
}
