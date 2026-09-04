import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { PARAGRAPH_KINDS, paragraphInputSchema, type ParagraphDto, type ParagraphKind } from '@jumaah/shared';
import { Button, Spinner } from '@jumaah/ui';
import { api } from '../../api';
import { Field, FormRow, Select, TextArea, TextInput } from '../../components/Field';
import { Modal } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { clean, validate } from '../../lib/forms';
import { useInvalidateKhutbah } from './hooks';

export function AddParagraphModal({ khutbahId, sectionId, afterId, open, onClose }: { khutbahId: string; sectionId: string; afterId: string | null; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const invalidate = useInvalidateKhutbah(khutbahId);
  const [text, setText] = useState('');
  const [kind, setKind] = useState<ParagraphKind>('TEXT');
  const [reference, setReference] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const add = useMutation({
    mutationFn: (body: unknown) => api.post<ParagraphDto>(`/sections/${sectionId}/paragraphs`, body),
    onSuccess: () => {
      toast.success(t('common.success'));
      setText('');
      setReference('');
      setKind('TEXT');
      void invalidate();
      onClose();
    },
    onError: (e) => toast.error(e),
  });

  const submit = () => {
    const v = validate(paragraphInputSchema, clean({ text: text.trim(), kind, reference: reference.trim() }));
    setErrors(v.errors);
    if (v.ok) add.mutate({ ...v.data, afterId: afterId ?? undefined });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('khutbah.addParagraph')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={submit} disabled={add.isPending}>
            {add.isPending ? <Spinner /> : t('common.create')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label={t('khutbah.paragraph')} error={errors.text}>
          <TextArea className="j-textarea-ar" dir="rtl" lang="ar" rows={6} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        <FormRow>
          <Field label={t('khutbah.kind')} error={errors.kind}>
            <Select value={kind} onChange={(e) => setKind(e.target.value as ParagraphKind)}>
              {PARAGRAPH_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`khutbah.kinds.${k}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('khutbah.reference')} error={errors.reference}>
            <TextInput value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>
        </FormRow>
      </div>
    </Modal>
  );
}
