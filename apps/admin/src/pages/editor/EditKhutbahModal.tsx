import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { KHUTBAH_STATUSES, toHijri, updateKhutbahSchema, type KhutbahDto, type KhutbahStatus } from '@jumaah/shared';
import { Button, Spinner } from '@jumaah/ui';
import { api } from '../../api';
import { Field, FormRow, Select, TextArea, TextInput } from '../../components/Field';
import { LanguagePicker } from '../../components/LanguagePicker';
import { Modal } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { validate } from '../../lib/forms';
import { useInvalidateKhutbah } from './hooks';

export function EditKhutbahModal({ khutbah, open, onClose }: { khutbah: KhutbahDto; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const invalidate = useInvalidateKhutbah(khutbah.id);
  const [title, setTitle] = useState(khutbah.title);
  const [date, setDate] = useState(khutbah.gregorianDate);
  const [hijri, setHijri] = useState(khutbah.hijriDate ?? '');
  const [imamName, setImamName] = useState(khutbah.imamName ?? '');
  const [languages, setLanguages] = useState(khutbah.targetLanguages);
  const [status, setStatus] = useState<KhutbahStatus>(khutbah.status);
  const [notes, setNotes] = useState(khutbah.notes ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setTitle(khutbah.title);
    setDate(khutbah.gregorianDate);
    setHijri(khutbah.hijriDate ?? '');
    setImamName(khutbah.imamName ?? '');
    setLanguages(khutbah.targetLanguages);
    setStatus(khutbah.status);
    setNotes(khutbah.notes ?? '');
    setErrors({});
  }, [open, khutbah]);

  const save = useMutation({
    mutationFn: (body: unknown) => api.patch<KhutbahDto>(`/khutbahs/${khutbah.id}`, body),
    onSuccess: () => {
      toast.success(t('common.success'));
      void invalidate();
      onClose();
    },
    onError: (e) => toast.error(e),
  });

  const submit = () => {
    const v = validate(updateKhutbahSchema, {
      title: title.trim(),
      gregorianDate: date,
      hijriDate: hijri.trim() || null,
      imamName: imamName.trim() || null,
      targetLanguages: languages,
      status,
      notes: notes.trim() || null,
    });
    setErrors(v.errors);
    if (v.ok) save.mutate(v.data);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('khutbah.edit')}
      wide
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={submit} disabled={save.isPending}>
            {save.isPending ? <Spinner /> : t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label={t('khutbah.title')} error={errors.title}>
          <TextInput value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <FormRow cols={3}>
          <Field label={t('khutbah.gregorianDate')} error={errors.gregorianDate}>
            <TextInput
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                const d = new Date(e.target.value);
                if (!Number.isNaN(d.getTime())) setHijri(toHijri(d).formatted);
              }}
            />
          </Field>
          <Field label={t('khutbah.hijriDate')} error={errors.hijriDate}>
            <TextInput value={hijri} onChange={(e) => setHijri(e.target.value)} />
          </Field>
          <Field label={t('khutbah.imamName')} error={errors.imamName}>
            <TextInput value={imamName} onChange={(e) => setImamName(e.target.value)} />
          </Field>
        </FormRow>
        <Field label={t('khutbah.targetLanguages')} error={errors.targetLanguages}>
          <LanguagePicker value={languages} onChange={setLanguages} />
        </Field>
        <FormRow>
          <Field label={t('common.status')} error={errors.status}>
            <Select value={status} onChange={(e) => setStatus(e.target.value as KhutbahStatus)}>
              {KHUTBAH_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`khutbah.status.${s}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('khutbah.notes')} error={errors.notes}>
            <TextArea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </FormRow>
      </div>
    </Modal>
  );
}
