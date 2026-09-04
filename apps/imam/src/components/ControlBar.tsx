import { useTranslation } from 'react-i18next';
import { Button } from '@jumaah/ui';
import type { SessionState } from '@jumaah/shared';

export interface ControlBarProps {
  state: SessionState;
  autoAdvance: boolean;
  showSecond: boolean;
  showDua: boolean;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onPauseToggle: () => void;
  onImprov: () => void;
  onSecond: () => void;
  onDua: () => void;
  onAutoAdvance: (enabled: boolean) => void;
  onEnd: () => void;
}

const BIG = 'min-h-16 text-lg font-bold';

export function ControlBar(p: ControlBarProps) {
  const { t } = useTranslation();
  const paused = p.state === 'PAUSED';
  const improv = p.state === 'IMPROV';
  return (
    <div className="flex shrink-0 flex-col gap-2 px-3 pt-2" style={{ background: 'var(--j-bg-soft)', borderTop: '1px solid var(--j-border)', paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
      <div className="flex flex-wrap gap-2">
        <Button className={`${BIG} flex-1`} onClick={p.onPauseToggle} aria-pressed={paused} style={paused ? { borderColor: 'var(--j-warn)', color: 'var(--j-warn)' } : undefined}>
          {paused ? '▶ ' + t('imam.resume') : '⏸ ' + t('imam.pause')}
        </Button>
        <Button className={`${BIG} flex-1`} onClick={p.onImprov} aria-pressed={improv} style={improv ? { background: 'var(--j-accent-soft)', borderColor: 'var(--j-accent)' } : undefined}>
          {improv ? t('imam.backToText') : t('imam.improv')}
        </Button>
        {p.showSecond && (
          <Button className={`${BIG} flex-1`} onClick={p.onSecond}>
            {t('imam.endFirst')}
          </Button>
        )}
        {p.showDua && (
          <Button className={`${BIG} flex-1`} onClick={p.onDua}>
            {t('imam.startDua')}
          </Button>
        )}
        <label className={`j-btn ${BIG} flex-1 cursor-pointer select-none`} style={p.autoAdvance ? { borderColor: 'var(--j-accent)' } : undefined}>
          <input type="checkbox" className="h-5 w-5" style={{ accentColor: 'var(--j-accent)' }} checked={p.autoAdvance} onChange={(e) => p.onAutoAdvance(e.target.checked)} />
          <span>{t('imam.autoAdvance')}</span>
        </label>
        <Button variant="danger" className={`${BIG} flex-1`} onClick={p.onEnd}>
          {t('imam.end')}
        </Button>
      </div>
      <div className="flex gap-2">
        <Button className="min-h-20 flex-1 text-xl font-bold" onClick={p.onPrev} disabled={!p.canPrev}>
          {t('common.previous')}
        </Button>
        <Button variant="primary" className="min-h-20 flex-[2] text-2xl font-extrabold" onClick={p.onNext} disabled={!p.canNext}>
          {t('common.next')}
        </Button>
      </div>
    </div>
  );
}
