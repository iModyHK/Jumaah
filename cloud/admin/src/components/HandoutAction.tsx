import { useTranslation } from 'react-i18next';

/** Opens the printable handout of a khutbah in a new tab. */
export function HandoutAction({ khutbahId }: { khutbahId: string }) {
  const { t } = useTranslation();
  return (
    <a href={`${import.meta.env.BASE_URL}khutbahs/${khutbahId}/handout`} target="_blank" rel="noreferrer" className="j-btn px-3 py-1 text-sm">
      {t('handout.open')}
    </a>
  );
}
