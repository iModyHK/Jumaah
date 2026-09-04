import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import { SECTION_TYPES, createKhutbahSchema, nextFriday, toHijri, type KhutbahDto, type SectionType, type TenantDto } from '@jumaah/shared';
import { Button, Spinner } from '@jumaah/ui';
import { api } from '../api';
import { useAuth } from '../auth/AuthProvider';
import { Field, FormRow, TextArea, TextInput } from '../components/Field';
import { FileDrop } from '../components/FileDrop';
import { LanguagePicker } from '../components/LanguagePicker';
import { Card, PageHeader } from '../components/PageHeader';
import { useToast } from '../components/Toast';
import { toDateInput } from '../lib/format';
import { clean, validate } from '../lib/forms';

interface Extracted {
  format: string;
  text: string;
  paragraphs: Array<{ text: string; kind: string }>;
}

export function KhutbahNewPage() {
  const { t } = useTranslation();
  const { tenantId } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const tenant = useQuery({ queryKey: ['tenant', tenantId], queryFn: () => api.get<TenantDto>('/tenant') });

  const [title, setTitle] = useState('');
  const [date, setDate] = useState(toDateInput(nextFriday()));
  const [hijri, setHijri] = useState(toHijri(nextFriday()).formatted);
  const [hijriTouched, setHijriTouched] = useState(false);
  const [imamName, setImamName] = useState('');
  const [languages, setLanguages] = useState<string[] | null>(null);
  const [texts, setTexts] = useState<Record<SectionType, string>>({ FIRST: '', SECOND: '', DUA: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState<SectionType | null>(null);

  useEffect(() => {
    if (hijriTouched) return;
    const d = new Date(date);
    if (!Number.isNaN(d.getTime())) setHijri(toHijri(d).formatted);
  }, [date, hijriTouched]);

  const langs = languages ?? tenant.data?.languages ?? [];

  const create = useMutation({
    mutationFn: (body: unknown) => api.post<KhutbahDto>('/khutbahs', body),
    onSuccess: (k) => {
      toast.success(t('common.success'));
      navigate(`/khutbahs/${k.id}`, { replace: true });
    },
    onError: (e) => toast.error(e),
  });

  const importFile = async (section: SectionType, file: File) => {
    setImporting(section);
    try {
      const res = await api.upload<Extracted>('/import/extract', file);
      setTexts((prev) => ({ ...prev, [section]: res.text }));
    } catch (err) {
      toast.error(err);
    } finally {
      setImporting(null);
    }
  };

  const submit = () => {
    const body = clean({
      title: title.trim(),
      gregorianDate: date,
      hijriDate: hijri.trim(),
      imamName: imamName.trim(),
      targetLanguages: langs,
      sections: SECTION_TYPES.map((type) => ({ type, rawText: texts[type] })),
    });
    const v = validate(createKhutbahSchema, body);
    setErrors(v.errors);
    if (v.ok) create.mutate(v.data);
  };

  return (
    <div>
      <PageHeader
        title={t('khutbah.new')}
        actions={
          <>
            <Button onClick={() => navigate('/khutbahs')}>{t('common.cancel')}</Button>
            <Button variant="primary" onClick={submit} disabled={create.isPending}>
              {create.isPending ? <Spinner /> : t('common.create')}
            </Button>
          </>
        }
      />
      <div className="flex flex-col gap-4">
        <Card>
          <div className="flex flex-col gap-3">
            <Field label={t('khutbah.title')} error={errors.title}>
              <TextInput value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <FormRow cols={3}>
              <Field label={t('khutbah.gregorianDate')} error={errors.gregorianDate}>
                <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field label={t('khutbah.hijriDate')} error={errors.hijriDate}>
                <TextInput
                  value={hijri}
                  onChange={(e) => {
                    setHijri(e.target.value);
                    setHijriTouched(true);
                  }}
                />
              </Field>
              <Field label={t('khutbah.imamName')} error={errors.imamName}>
                <TextInput value={imamName} onChange={(e) => setImamName(e.target.value)} />
              </Field>
            </FormRow>
            <Field label={t('khutbah.targetLanguages')} error={errors.targetLanguages} hint={t('settings.languagesHint')}>
              <LanguagePicker value={langs} onChange={setLanguages} />
            </Field>
          </div>
        </Card>

        {SECTION_TYPES.map((type) => (
          <Card
            key={type}
            title={t(`khutbah.sections.${type}`)}
            actions={<FileDrop accept=".docx,.txt,.pdf" label={t('khutbah.importFile')} busy={importing === type} onFile={(f) => importFile(type, f)} className="px-3 py-1 text-xs" />}
          >
            <TextArea dir="rtl" lang="ar" className="j-textarea-ar" rows={8} placeholder={t('khutbah.textPlaceholder')} value={texts[type]} onChange={(e) => setTexts((prev) => ({ ...prev, [type]: e.target.value }))} />
            <div className="j-muted mt-1 text-xs">{t('khutbah.splitHint')}</div>
          </Card>
        ))}
        {errors.sections && <div style={{ color: 'var(--j-danger)' }}>{errors.sections}</div>}
      </div>
    </div>
  );
}
