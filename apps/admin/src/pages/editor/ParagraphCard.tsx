import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { PARAGRAPH_KINDS, type KhutbahDto, type ParagraphDto, type ParagraphKind } from '@jumaah/shared';
import { Button, LangText, Spinner, StatusPill } from '@jumaah/ui';
import { api } from '../../api';
import { useToast } from '../../components/Toast';
import { fmtDuration } from '../../lib/format';
import { TranslationRow } from './TranslationRow';
import { useInvalidateKhutbah } from './hooks';

export function ParagraphCard({
  khutbahId,
  paragraph,
  index,
  next,
  languages,
  canEdit,
  onSplit,
  onAddAfter,
  onDelete,
}: {
  khutbahId: string;
  paragraph: ParagraphDto;
  index: number;
  next: ParagraphDto | null;
  languages: string[];
  canEdit: boolean;
  onSplit: (p: ParagraphDto) => void;
  onAddAfter: (p: ParagraphDto) => void;
  onDelete: (p: ParagraphDto) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const invalidate = useInvalidateKhutbah(khutbahId);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(paragraph.textAr);
  const [reference, setReference] = useState(paragraph.reference ?? '');
  const [seconds, setSeconds] = useState(String(paragraph.estimatedSeconds));

  useEffect(() => {
    setText(paragraph.textAr);
    setReference(paragraph.reference ?? '');
    setSeconds(String(paragraph.estimatedSeconds));
  }, [paragraph.textAr, paragraph.reference, paragraph.estimatedSeconds]);

  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch<ParagraphDto>(`/paragraphs/${paragraph.id}`, body),
    onSuccess: () => {
      setEditing(false);
      void invalidate();
    },
    onError: (e) => toast.error(e),
  });
  const merge = useMutation({
    mutationFn: () => api.post<KhutbahDto>(`/paragraphs/${paragraph.id}/merge`, { withNextId: next!.id }),
    onSuccess: () => void invalidate(),
    onError: (e) => toast.error(e),
  });

  const special = paragraph.kind !== 'TEXT';
  const kindTone = paragraph.kind === 'QURAN' ? 'ok' : paragraph.kind === 'HADITH' ? 'warn' : 'muted';

  return (
    <div className="j-card flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="flex h-6 w-6 items-center justify-center rounded-full font-bold tabular-nums" style={{ background: 'var(--j-accent-soft)', color: 'var(--j-accent)' }}>
          {index + 1}
        </span>
        {canEdit ? (
          <select className="j-input w-auto py-0.5 text-xs" value={paragraph.kind} onChange={(e) => patch.mutate({ kind: e.target.value as ParagraphKind })} disabled={patch.isPending}>
            {PARAGRAPH_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`khutbah.kinds.${k}`)}
              </option>
            ))}
          </select>
        ) : (
          <StatusPill tone={kindTone}>{t(`khutbah.kinds.${paragraph.kind}`)}</StatusPill>
        )}
        <input
          className="j-input w-40 py-0.5 text-xs"
          placeholder={t('khutbah.reference')}
          value={reference}
          readOnly={!canEdit}
          onChange={(e) => setReference(e.target.value)}
          onBlur={() => {
            if (canEdit && reference.trim() !== (paragraph.reference ?? '')) patch.mutate({ reference: reference.trim() || null });
          }}
        />
        <label className="flex items-center gap-1">
          <span className="j-muted">{t('khutbah.estimatedSeconds')}</span>
          <input
            type="number"
            min={1}
            max={3600}
            className="j-input w-20 py-0.5 text-xs"
            dir="ltr"
            value={seconds}
            readOnly={!canEdit}
            onChange={(e) => setSeconds(e.target.value)}
            onBlur={() => {
              const n = Number(seconds);
              if (canEdit && Number.isInteger(n) && n > 0 && n !== paragraph.estimatedSeconds) patch.mutate({ estimatedSeconds: n });
            }}
          />
          <span className="j-muted">({fmtDuration(paragraph.estimatedSeconds)})</span>
        </label>
        {patch.isPending && <Spinner />}
        {canEdit && (
          <span className="ms-auto flex flex-wrap gap-1">
            <Button className="px-2 py-0.5 text-xs" onClick={() => setEditing((v) => !v)}>
              {editing ? t('common.cancel') : t('common.edit')}
            </Button>
            <Button className="px-2 py-0.5 text-xs" onClick={() => onSplit(paragraph)}>
              {t('khutbah.splitHere')}
            </Button>
            <Button className="px-2 py-0.5 text-xs" disabled={!next || merge.isPending} onClick={() => merge.mutate()}>
              {t('khutbah.mergeWithNext')}
            </Button>
            <Button className="px-2 py-0.5 text-xs" onClick={() => onAddAfter(paragraph)}>
              {t('khutbah.addParagraphAfter')}
            </Button>
            <Button variant="danger" className="px-2 py-0.5 text-xs" onClick={() => onDelete(paragraph)}>
              {t('common.delete')}
            </Button>
          </span>
        )}
      </div>

      {editing ? (
        <div className="flex flex-col gap-2">
          <textarea className="j-input j-textarea-ar" dir="rtl" lang="ar" rows={5} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="flex gap-2">
            <Button variant="primary" className="px-3 py-1 text-xs" disabled={!text.trim() || text === paragraph.textAr || patch.isPending} onClick={() => patch.mutate({ text: text.trim() })}>
              {t('common.save')}
            </Button>
            <Button
              className="px-3 py-1 text-xs"
              onClick={() => {
                setText(paragraph.textAr);
                setEditing(false);
              }}
            >
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <LangText lang="ar" className="text-lg">
          {paragraph.textAr}
        </LangText>
      )}

      {special && (
        <div className="rounded-lg px-3 py-2 text-xs" style={{ background: 'var(--j-accent-soft)', color: 'var(--j-accent)' }}>
          {t('khutbah.specialBlockHint')}
        </div>
      )}

      {languages.length > 0 && (
        <div className="flex flex-col gap-2">
          {languages.map((lang) => (
            <TranslationRow key={lang} khutbahId={khutbahId} paragraph={paragraph} lang={lang} translation={paragraph.translations.find((x) => x.lang === lang)} canEdit={canEdit} />
          ))}
        </div>
      )}
    </div>
  );
}
