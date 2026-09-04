import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import type { KhutbahDto, ParagraphDto } from '@jumaah/shared';
import { Button, Spinner } from '@jumaah/ui';
import { api } from '../../api';
import { Modal } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { useInvalidateKhutbah } from './hooks';

/** Place the caret inside the text, then split at that character offset. */
export function SplitModal({ khutbahId, paragraph, onClose }: { khutbahId: string; paragraph: ParagraphDto | null; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const invalidate = useInvalidateKhutbah(khutbahId);
  const ref = useRef<HTMLTextAreaElement>(null);
  const [offset, setOffset] = useState(0);
  const text = paragraph?.textAr ?? '';

  const split = useMutation({
    mutationFn: () => api.post<KhutbahDto>(`/paragraphs/${paragraph!.id}/split`, { offset }),
    onSuccess: () => {
      toast.success(t('common.success'));
      void invalidate();
      onClose();
    },
    onError: (e) => toast.error(e),
  });

  const valid = offset > 0 && offset < text.length && text.slice(0, offset).trim().length > 0 && text.slice(offset).trim().length > 0;

  return (
    <Modal
      open={!!paragraph}
      onClose={onClose}
      title={t('khutbah.splitHere')}
      wide
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={!valid || split.isPending} onClick={() => split.mutate()}>
            {split.isPending ? <Spinner /> : t('khutbah.splitHere')}
          </Button>
        </>
      }
    >
      <div className="j-muted mb-2 text-sm">{t('khutbah.splitPosition')}</div>
      <textarea
        ref={ref}
        className="j-input j-textarea-ar"
        dir="rtl"
        lang="ar"
        readOnly
        rows={8}
        value={text}
        onSelect={(e) => setOffset((e.target as HTMLTextAreaElement).selectionStart)}
        onClick={(e) => setOffset((e.target as HTMLTextAreaElement).selectionStart)}
        onKeyUp={(e) => setOffset((e.target as HTMLTextAreaElement).selectionStart)}
      />
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <div className="j-card p-2 text-sm" dir="rtl" lang="ar" style={{ fontFamily: 'var(--j-font-ar)', lineHeight: 1.9 }}>
          <div className="j-muted mb-1 text-xs">1</div>
          {text.slice(0, offset) || '—'}
        </div>
        <div className="j-card p-2 text-sm" dir="rtl" lang="ar" style={{ fontFamily: 'var(--j-font-ar)', lineHeight: 1.9 }}>
          <div className="j-muted mb-1 text-xs">2</div>
          {text.slice(offset) || '—'}
        </div>
      </div>
      <div className="j-muted mt-2 text-xs" dir="ltr">
        offset: {offset} / {text.length}
      </div>
    </Modal>
  );
}
