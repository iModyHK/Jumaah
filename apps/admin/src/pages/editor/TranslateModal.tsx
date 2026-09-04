import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { bulkTranslateSchema, type CostEstimate, type KhutbahDto, type TranslationJobDto } from '@jumaah/shared';
import { Button, Spinner } from '@jumaah/ui';
import { api } from '../../api';
import { Checkbox, Field } from '../../components/Field';
import { LanguagePicker } from '../../components/LanguagePicker';
import { Modal } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { errorMessage } from '../../lib/errors';
import { fmtUsd } from '../../lib/format';
import { validate } from '../../lib/forms';

export function TranslateModal({ khutbah, open, onClose, onStarted }: { khutbah: KhutbahDto; open: boolean; onClose: () => void; onStarted: (job: TranslationJobDto) => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [languages, setLanguages] = useState<string[]>(khutbah.targetLanguages);
  const [force, setForce] = useState(false);
  const [includeSpecialBlocks, setSpecial] = useState(false);
  const [estimate, setEstimate] = useState<CostEstimate | null>(null);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [estimating, setEstimating] = useState(false);

  useEffect(() => {
    if (open) setLanguages(khutbah.targetLanguages);
  }, [open, khutbah.targetLanguages]);

  const body = () => validate(bulkTranslateSchema, { languages: languages.length ? languages : undefined, force, includeSpecialBlocks });

  useEffect(() => {
    if (!open) return;
    const v = body();
    if (!v.ok) return;
    let cancelled = false;
    setEstimating(true);
    setEstimateError(null);
    api
      .post<CostEstimate>(`/khutbahs/${khutbah.id}/translate/estimate`, v.data)
      .then((e) => {
        if (!cancelled) setEstimate(e);
      })
      .catch((err) => {
        if (!cancelled) setEstimateError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setEstimating(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, khutbah.id, languages.join(','), force, includeSpecialBlocks]);

  const start = useMutation({
    mutationFn: () => {
      const v = body();
      if (!v.ok) throw new Error(v.errors.languages ?? t('errors.VALIDATION'));
      return api.post<TranslationJobDto>(`/khutbahs/${khutbah.id}/translate`, v.data);
    },
    onSuccess: (job) => {
      onStarted(job);
      onClose();
    },
    onError: (e) => toast.error(e),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('khutbah.translate')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={() => start.mutate()} disabled={start.isPending || languages.length === 0}>
            {start.isPending ? <Spinner /> : t('khutbah.startTranslation')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={t('khutbah.targetLanguages')}>
          <LanguagePicker value={languages} onChange={setLanguages} options={khutbah.targetLanguages} />
        </Field>
        <div className="flex flex-col gap-2">
          <Checkbox label={t('khutbah.force')} checked={force} onChange={setForce} />
          <Checkbox label={t('khutbah.includeSpecialBlocks')} checked={includeSpecialBlocks} onChange={setSpecial} />
        </div>
        <div className="j-card p-3 text-sm">
          <div className="mb-2 flex items-center gap-2 font-semibold">
            {t('khutbah.estimatedCost')}
            {estimating && <Spinner />}
          </div>
          {estimateError && <div style={{ color: 'var(--j-danger)' }}>{estimateError}</div>}
          {estimate && (
            <div className="flex flex-col gap-1">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 md:grid-cols-4">
                <Info label={t('khutbah.characters')} value={estimate.characters} />
                <Info label={t('khutbah.paragraphs')} value={estimate.paragraphs} />
                <Info label={t('common.languages')} value={estimate.languages} />
                <Info label={t('khutbah.cached')} value={estimate.cachedUnits} />
              </div>
              <div className="mt-2 border-t pt-2" style={{ borderColor: 'var(--j-border)' }}>
                {estimate.perProvider.length === 0 && <div className="j-muted">{t('common.none')}</div>}
                {estimate.perProvider.map((p, i) => (
                  <div key={`${p.type}-${i}`} className="flex items-center justify-between gap-2 py-0.5">
                    <span>
                      {t(`providers.types.${p.type}`)}
                      {p.model && <span className="j-muted text-xs"> · {p.model}</span>}
                      {p.note && <span className="j-muted text-xs"> · {p.note}</span>}
                    </span>
                    <span className="tabular-nums" dir="ltr">
                      {fmtUsd(p.estimatedUsd)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function Info({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="j-muted text-xs">{label}</div>
      <div className="font-semibold tabular-nums">{value}</div>
    </div>
  );
}
