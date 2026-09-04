import { useTranslation } from 'react-i18next';
import { LangText } from '@jumaah/ui';
import { phrase } from '../phrases';

export function EndedScreen({ languages }: { languages: string[] }) {
  const { t } = useTranslation();
  const others = languages.filter((l) => l !== 'ar');
  return (
    <div className="j-ended j-fade-in">
      <LangText lang="ar" className="j-ended-ar" style={{ textAlign: 'center' }}>
        {t('display.ended', { lng: 'ar' })}
      </LangText>
      {others.length > 0 && (
        <div className="j-ended-list">
          {others.map((l) => (
            <LangText key={l} lang={l} as="span">
              {phrase('ended', l)}
            </LangText>
          ))}
        </div>
      )}
    </div>
  );
}
