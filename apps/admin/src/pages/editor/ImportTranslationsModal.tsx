import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { SECTION_TYPES, getLanguage, importTranslationsSchema, type KhutbahDto, type SectionType } from '@jumaah/shared';
import { Button, Spinner } from '@jumaah/ui';
import { api } from '../../api';
import { Field, FormRow, Select } from '../../components/Field';
import { FileDrop } from '../../components/FileDrop';
import { Modal } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { validate } from '../../lib/forms';
import { splitBlocks, useInvalidateKhutbah } from './hooks';

type ImportStatus = 'MACHINE' | 'REVIEWED' | 'APPROVED';

export function ImportTranslationsModal({ khutbah, open, onClose, initialLang }: { khutbah: KhutbahDto; open: boolean; onClose: () => void; initialLang?: string }) {
  const { t } = useTranslation();
  const toast = useToast();
  const invalidate = useInvalidateKhutbah(khutbah.id);
  const [lang, setLang] = useState(initialLang ?? khutbah.targetLanguages[0] ?? 'en');
  const [section, setSection] = useState<SectionType | ''>('');
  const [status, setStatus] = useState<ImportStatus>('REVIEWED');
  const [texts, setTexts] = useState<string[] | null>(null);
  const [fileName, setFileName] = useState('');

  const expected = (khutbah.sections ?? []).filter((s) => !section || s.type === section).reduce((n, s) => n + s.paragraphs.length, 0);
  const mismatch = texts !== null && texts.length !== expected;

  const readFile = async (file: File) => {
    const raw = await file.text();
    setTexts(splitBlocks(raw));
    setFileName(file.name);
  };

  const imp = useMutation({
    mutationFn: () => {
      const v = validate(importTranslationsSchema, { lang, texts, sectionType: section || undefined, status });
      if (!v.ok) throw new Error(Object.values(v.errors)[0] ?? t('errors.VALIDATION'));
      return api.post<{ written: number }>(`/khutbahs/${khutbah.id}/translations/import`, v.data);
    },
    onSuccess: (r) => {
      toast.success(t('khutbah.translationsImported', { count: r.written }));
      void invalidate();
      setTexts(null);
      setFileName('');
      onClose();
    },
    onError: (e) => toast.error(e),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('khutbah.importTranslations')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={!texts || mismatch || imp.isPending} onClick={() => imp.mutate()}>
            {imp.isPending ? <Spinner /> : t('common.import')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <FormRow cols={3}>
          <Field label={t('common.language')}>
            <Select value={lang} onChange={(e) => setLang(e.target.value)}>
              {khutbah.targetLanguages.map((code) => (
                <option key={code} value={code}>
                  {getLanguage(code).nativeName} ({code})
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('khutbah.importSection')}>
            <Select value={section} onChange={(e) => setSection(e.target.value as SectionType | '')}>
              <option value="">{t('common.all')}</option>
              {SECTION_TYPES.map((s) => (
                <option key={s} value={s}>
                  {t(`khutbah.sections.${s}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('common.status')}>
            <Select value={status} onChange={(e) => setStatus(e.target.value as ImportStatus)}>
              {(['MACHINE', 'REVIEWED', 'APPROVED'] as const).map((s) => (
                <option key={s} value={s}>
                  {t(`khutbah.translationStatus.${s}`)}
                </option>
              ))}
            </Select>
          </Field>
        </FormRow>
        <div className="j-muted text-xs">{t('khutbah.importTranslationsHint')}</div>
        <FileDrop accept=".txt,text/plain" label={fileName || t('common.upload')} onFile={readFile} />
        {texts && (
          <div className="text-sm" style={{ color: mismatch ? 'var(--j-danger)' : 'var(--j-accent)' }}>
            {mismatch ? t('khutbah.importCountMismatch', { got: texts.length, expected }) : `${texts.length} / ${expected}`}
          </div>
        )}
      </div>
    </Modal>
  );
}
