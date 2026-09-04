import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { getLanguage, type ParagraphDto, type TranslationDto } from '@jumaah/shared';
import { Button, Spinner } from '@jumaah/ui';
import { api } from '../../api';
import { TranslationStatusBadge } from '../../components/StatusBadge';
import { useToast } from '../../components/Toast';
import { HistoryModal } from './HistoryModal';
import { useInvalidateKhutbah } from './hooks';

export function TranslationRow({ khutbahId, paragraph, lang, translation, canEdit }: { khutbahId: string; paragraph: ParagraphDto; lang: string; translation: TranslationDto | undefined; canEdit: boolean }) {
  const { t } = useTranslation();
  const toast = useToast();
  const invalidate = useInvalidateKhutbah(khutbahId);
  const info = getLanguage(lang);
  const [text, setText] = useState(translation?.text ?? '');
  const [historyOpen, setHistoryOpen] = useState(false);
  const dirty = text !== (translation?.text ?? '');

  useEffect(() => {
    setText(translation?.text ?? '');
  }, [translation?.text, translation?.version]);

  const save = useMutation({
    mutationFn: () => api.put<TranslationDto>(`/paragraphs/${paragraph.id}/translations`, { lang, text: text.trim(), status: 'REVIEWED' }),
    onSuccess: () => void invalidate(),
    onError: (e) => toast.error(e),
  });
  const review = useMutation({
    mutationFn: (action: 'approve' | 'reject' | 'reviewed') => api.post<TranslationDto>(`/translations/${translation!.id}/review`, { action, ...(dirty && text.trim() ? { text: text.trim() } : {}) }),
    onSuccess: () => void invalidate(),
    onError: (e) => toast.error(e),
  });

  const busy = save.isPending || review.isPending;

  return (
    <div className="flex flex-col gap-1 rounded-lg p-2" style={{ background: 'var(--j-bg)', border: '1px solid var(--j-border)' }}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold" lang={lang} dir={info.dir}>
          {info.nativeName}
        </span>
        <span className="j-muted uppercase">{lang}</span>
        {translation ? <TranslationStatusBadge status={translation.status} /> : <span className="j-muted">{t('khutbah.noTranslation')}</span>}
        {translation?.providerType && (
          <span className="j-muted">
            {t('khutbah.provider')}: {t(`providers.types.${translation.providerType}`)}
          </span>
        )}
        {translation && <span className="j-muted">v{translation.version}</span>}
        <span className="ms-auto flex gap-1">
          {translation && (
            <Button className="px-2 py-0.5 text-xs" onClick={() => setHistoryOpen(true)}>
              {t('khutbah.history')}
            </Button>
          )}
        </span>
      </div>
      <textarea
        className="j-input"
        lang={lang}
        dir={info.dir}
        style={{ fontFamily: info.fontFamily, lineHeight: info.lineHeight, minHeight: '4rem' }}
        rows={Math.max(2, Math.min(8, Math.ceil(text.length / 90)))}
        value={text}
        readOnly={!canEdit}
        onChange={(e) => setText(e.target.value)}
      />
      {canEdit && (
        <div className="flex flex-wrap items-center gap-1">
          <Button variant="primary" className="px-2 py-1 text-xs" disabled={!dirty || !text.trim() || busy} onClick={() => save.mutate()}>
            {save.isPending ? <Spinner /> : t('common.save')}
          </Button>
          {translation && (
            <>
              <Button className="px-2 py-1 text-xs" disabled={busy || translation.status === 'APPROVED'} onClick={() => review.mutate('approve')} style={{ color: 'var(--j-accent)' }}>
                {t('khutbah.approve')}
              </Button>
              <Button className="px-2 py-1 text-xs" disabled={busy || translation.status === 'REVIEWED'} onClick={() => review.mutate('reviewed')}>
                {t('khutbah.markReviewed')}
              </Button>
              <Button className="px-2 py-1 text-xs" disabled={busy || translation.status === 'REJECTED'} onClick={() => review.mutate('reject')} style={{ color: 'var(--j-danger)' }}>
                {t('khutbah.reject')}
              </Button>
            </>
          )}
        </div>
      )}
      {translation && <HistoryModal translationId={translation.id} lang={lang} open={historyOpen} onClose={() => setHistoryOpen(false)} />}
    </div>
  );
}
