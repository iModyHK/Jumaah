import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { getLanguage, type ProviderType, type TranslationStatus } from '@jumaah/shared';
import { Button, Spinner } from '@jumaah/ui';
import { api } from '../../api';
import { Modal } from '../../components/Modal';
import { TranslationStatusBadge } from '../../components/StatusBadge';
import { fmtDateTime } from '../../lib/format';

interface HistoryRow {
  id: string;
  version: number;
  text: string;
  status: TranslationStatus;
  providerType: ProviderType | null;
  changedById: string | null;
  createdAt: string;
}

export function HistoryModal({ translationId, lang, open, onClose }: { translationId: string; lang: string; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const info = getLanguage(lang);
  const history = useQuery({ queryKey: ['translation', translationId, 'history'], queryFn: () => api.get<HistoryRow[]>(`/translations/${translationId}/history`), enabled: open });
  return (
    <Modal open={open} onClose={onClose} title={t('khutbah.history')} footer={<Button onClick={onClose}>{t('common.close')}</Button>}>
      {history.isLoading && <Spinner />}
      {history.data && history.data.length === 0 && <div className="j-muted text-sm">{t('common.none')}</div>}
      <div className="flex flex-col gap-2">
        {history.data?.map((h) => (
          <div key={h.id} className="j-card p-3">
            <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold">v{h.version}</span>
              <TranslationStatusBadge status={h.status} />
              {h.providerType && <span className="j-muted">{t(`providers.types.${h.providerType}`)}</span>}
              <span className="j-muted ms-auto">{fmtDateTime(h.createdAt)}</span>
            </div>
            <div lang={lang} dir={info.dir} style={{ fontFamily: info.fontFamily, lineHeight: info.lineHeight }} className="text-sm">
              {h.text}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
