import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TranslationJobDto } from '@jumaah/shared';
import { Button, StatusPill } from '@jumaah/ui';
import { api } from '../../api';
import { ProgressBar } from '../../components/ProgressBar';
import { useToast } from '../../components/Toast';
import { useSocketEvent } from '../../lib/socket';

type Progress = Pick<TranslationJobDto, 'id' | 'khutbahId' | 'status' | 'total' | 'done' | 'failed' | 'cached' | 'error'>;
const TERMINAL = new Set(['DONE', 'FAILED', 'CANCELLED']);

/** Progress bar for one translation job — socket driven with a 2s polling fallback. */
export function JobProgress({ job, onFinished, onDismiss }: { job: TranslationJobDto; onFinished: (job: Progress) => void; onDismiss: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [state, setState] = useState<Progress>(job);
  const finishedRef = useRef(false);

  const finish = useCallback(
    (p: Progress) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      onFinished(p);
      if (p.status === 'DONE') toast.success(t('khutbah.jobDone'));
      else if (p.status === 'FAILED') toast.error(new Error(p.error ?? t('khutbah.jobFailed')));
      else toast.info(t('khutbah.jobCancelled'));
    },
    [onFinished, toast, t],
  );

  useEffect(() => {
    setState(job);
    finishedRef.current = false;
  }, [job]);

  useSocketEvent(
    'job:progress',
    useCallback(
      (p: { id: string; khutbahId: string; status: string; total: number; done: number; failed: number; cached: number; error: string | null }) => {
        if (p.id !== job.id) return;
        const next = { ...p, status: p.status as TranslationJobDto['status'] };
        setState(next);
        if (TERMINAL.has(p.status)) finish(next);
      },
      [job.id, finish],
    ),
  );

  useEffect(() => {
    if (TERMINAL.has(state.status)) return;
    const timer = setInterval(async () => {
      try {
        const j = await api.get<TranslationJobDto>(`/translation-jobs/${job.id}`);
        setState(j);
        if (TERMINAL.has(j.status)) finish(j);
      } catch {
        /* keep polling */
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [job.id, state.status, finish]);

  const cancel = async () => {
    try {
      const j = await api.post<TranslationJobDto>(`/translation-jobs/${job.id}/cancel`);
      setState(j);
      if (TERMINAL.has(j.status)) finish(j);
    } catch (err) {
      toast.error(err);
    }
  };

  const done = TERMINAL.has(state.status);
  const tone = state.status === 'DONE' ? 'ok' : state.status === 'FAILED' ? 'danger' : done ? 'muted' : 'warn';
  return (
    <div className="j-card j-fade-in flex flex-col gap-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <StatusPill tone={tone}>{state.status}</StatusPill>
          {t('khutbah.jobProgress', { done: state.done, total: state.total })}
          {state.cached > 0 && <span className="j-muted text-xs">({state.cached} {t('khutbah.cached')})</span>}
          {state.failed > 0 && (
            <span className="text-xs" style={{ color: 'var(--j-danger)' }}>
              {state.failed} {t('khutbah.jobFailed')}
            </span>
          )}
        </div>
        {done ? (
          <Button className="px-2 py-1 text-xs" onClick={onDismiss}>
            {t('common.close')}
          </Button>
        ) : (
          <Button variant="danger" className="px-2 py-1 text-xs" onClick={() => void cancel()}>
            {t('common.cancel')}
          </Button>
        )}
      </div>
      <ProgressBar value={state.done} max={state.total} />
      {state.error && (
        <div className="text-xs" style={{ color: 'var(--j-danger)' }} dir="ltr">
          {state.error}
        </div>
      )}
    </div>
  );
}
