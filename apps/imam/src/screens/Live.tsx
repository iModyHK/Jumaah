import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, ConnectionDot, useFullscreen, useLocalStorage, useNow, useOnline, useSwipe, useWakeLock } from '@jumaah/ui';
import type { SessionCommand } from '@jumaah/shared';
import { store, useAppState } from '../state/store';
import { sendCommand, startHeartbeat, stopHeartbeat } from '../state/live';
import { hasSection, indexOfParagraph, remainingSeconds } from '../state/reducer';
import { Banner } from '../components/Banner';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ControlBar } from '../components/ControlBar';
import { ParagraphView } from '../components/ParagraphView';
import { Timers } from '../components/Timers';

const FONT_MIN = 1.2;
const FONT_MAX = 4;
const FONT_STEP = 0.2;

export function Live() {
  const { t, i18n } = useTranslation();
  const { snapshot, khutbah, connected, everConnected, displays, clockOffsetMs, pending } = useAppState();
  const online = useOnline();
  const wake = useWakeLock(true);
  const fs = useFullscreen();
  const now = useNow(1000, true, clockOffsetMs);
  const [fontRem, setFontRem] = useLocalStorage<number>('imam.fontRem', 2.6);
  const [showFont, setShowFont] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const fsTried = useRef(false);
  const rtl = i18n.dir() === 'rtl';

  const paragraphs = khutbah?.paragraphs ?? [];
  const total = paragraphs.length;
  const idx = indexOfParagraph(snapshot, khutbah);
  const current = paragraphs[idx];
  const prev = idx > 0 ? paragraphs[idx - 1] : undefined;
  const next = idx < total - 1 ? paragraphs[idx + 1] : undefined;
  const state = snapshot?.state ?? 'WAITING';
  const section = snapshot?.currentSection ?? current?.sectionType ?? null;

  const cmd = useCallback((c: SessionCommand) => sendCommand(c), []);
  const goNext = useCallback(() => cmd({ type: 'next' }), [cmd]);
  const goPrev = useCallback(() => cmd({ type: 'prev' }), [cmd]);
  // In RTL the "next" page lies to the left (where the Next button is rendered); LTR mirrors that.
  const swipe = useSwipe(rtl ? goNext : goPrev, rtl ? goPrev : goNext);

  useEffect(() => {
    startHeartbeat();
    return stopHeartbeat;
  }, []);

  // Leave when the session ends (server resets to WAITING a few seconds later) or vanishes.
  const sessionId = snapshot?.sessionId ?? null;
  useEffect(() => {
    if (!snapshot) return;
    if (state === 'ENDED' || !sessionId) {
      const tm = setTimeout(() => store.setState({ screen: 'pick' }), state === 'ENDED' ? 1500 : 0);
      return () => clearTimeout(tm);
    }
  }, [snapshot, state, sessionId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (confirmEnd) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (tag === 'BUTTON' && (e.key === ' ' || e.key === 'Enter')) return; // let the focused button handle it
      switch (e.key) {
        case ' ':
        case 'Enter':
        case 'PageDown':
        case 'ArrowDown':
          e.preventDefault();
          goNext();
          break;
        case 'PageUp':
        case 'ArrowUp':
          e.preventDefault();
          goPrev();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          (rtl ? goNext : goPrev)();
          break;
        case 'ArrowRight':
          e.preventDefault();
          (rtl ? goPrev : goNext)();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goNext, goPrev, rtl, confirmEnd]);

  const onFirstPointer = () => {
    if (fsTried.current) return;
    fsTried.current = true;
    void fs.enter();
  };

  const clampFont = (v: number) => Math.round(Math.min(FONT_MAX, Math.max(FONT_MIN, v)) * 10) / 10;

  const elapsed = snapshot?.startedAt ? (now - Date.parse(snapshot.startedAt)) / 1000 : 0;
  const sectionElapsed = snapshot?.sectionStartedAt ? (now - Date.parse(snapshot.sectionStartedAt)) / 1000 : 0;
  const remaining = remainingSeconds(khutbah, idx);
  const progress = total ? ((idx + 1) / total) * 100 : 0;

  const showSecond = section === 'FIRST' && hasSection(khutbah, 'SECOND');
  const showDua = section !== 'DUA' && hasSection(khutbah, 'DUA') && (section === 'SECOND' || !hasSection(khutbah, 'SECOND'));
  const offline = !connected && (everConnected || !online);

  if (!snapshot || !khutbah) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-6 p-8 text-center">
        <div className="text-2xl font-bold">{t('dashboard.noSession')}</div>
        {!connected && (
          <div style={{ color: 'var(--j-fg-muted)' }}>{online ? t('imam.reconnecting') : t('imam.offlineMode')}</div>
        )}
        <Button className="min-h-16 px-8 text-xl" onClick={() => store.setState({ screen: 'pick' })}>
          {t('common.back')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden" onPointerDown={onFirstPointer}>
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2" style={{ borderBottom: '1px solid var(--j-border)', paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}>
        <Button variant="ghost" className="min-h-11 px-3" onClick={() => store.setState({ screen: 'pick' })} aria-label={t('imam.selectKhutbah')}>
          ☰
        </Button>
        <div className="min-w-0 flex-1 truncate text-base font-bold">{khutbah.title}</div>
        <ConnectionDot connected={connected} label={connected ? t('imam.connected') : t('imam.reconnecting')} />
        {pending > 0 && (
          <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--j-warn)' }} title={t('imam.offlineMode')}>
            ⏳ {pending}
          </span>
        )}
        <span className="text-sm" style={{ color: 'var(--j-fg-muted)' }}>
          {t('imam.displaysConnected', { count: displays })}
        </span>
        <span className="inline-flex items-center gap-1 text-xs" style={{ color: wake.active ? 'var(--j-accent)' : 'var(--j-fg-muted)' }} title={t('imam.wakeLock')}>
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: wake.active ? 'var(--j-accent)' : 'var(--j-fg-muted)' }} />
          {t('imam.wakeLock')}
        </span>
        <Button variant="ghost" className="min-h-11 px-3 font-bold" onClick={() => setShowFont((v) => !v)} aria-pressed={showFont} aria-label={t('imam.fontSize')}>
          Aa
        </Button>
        <Button variant="ghost" className="min-h-11 px-3" onClick={() => void fs.toggle()} aria-label="fullscreen">
          {fs.isFullscreen ? '🗗' : '⛶'}
        </Button>
      </header>

      {showFont && (
        <div className="j-fade-in flex shrink-0 items-center gap-3 px-4 py-2" style={{ background: 'var(--j-bg-soft)', borderBottom: '1px solid var(--j-border)' }}>
          <span className="text-sm font-semibold">{t('imam.fontSize')}</span>
          <Button className="min-h-11 w-12 text-xl" onClick={() => setFontRem((v) => clampFont(v - FONT_STEP))} aria-label="-">
            −
          </Button>
          <input
            type="range"
            className="min-h-11 flex-1"
            min={FONT_MIN}
            max={FONT_MAX}
            step={0.1}
            value={fontRem}
            onChange={(e) => setFontRem(clampFont(Number(e.target.value)))}
            style={{ accentColor: 'var(--j-accent)' }}
            aria-label={t('imam.fontSize')}
          />
          <Button className="min-h-11 w-12 text-xl" onClick={() => setFontRem((v) => clampFont(v + FONT_STEP))} aria-label="+">
            +
          </Button>
          <span className="w-12 text-center font-mono text-sm tabular-nums" dir="ltr">
            {fontRem.toFixed(1)}
          </span>
        </div>
      )}

      {offline && <Banner tone="warn">{t('imam.offlineMode')}</Banner>}
      {state === 'IMPROV' && <Banner tone="accent">{t('imam.improvActive')}</Banner>}
      {state === 'PAUSED' && <Banner tone="muted">⏸ {t('imam.paused')}</Banner>}
      {state === 'ENDED' && <Banner tone="danger">{t('display.ended')}</Banner>}

      <div className="h-1 w-full shrink-0" style={{ background: 'var(--j-border)' }} aria-hidden="true">
        <div className="h-full transition-[width] duration-300" style={{ width: `${progress}%`, background: 'var(--j-accent)' }} />
      </div>

      <div className="flex shrink-0 items-center justify-between px-4 py-1 text-sm font-bold">
        <span style={{ color: 'var(--j-accent)' }}>{section ? t(`khutbah.sections.${section}`) : ''}</span>
        <span className="font-mono tabular-nums" dir="ltr" style={{ color: 'var(--j-fg-muted)' }}>
          {idx + 1} / {total}
        </span>
      </div>

      <main className="min-h-0 flex-1 touch-pan-y select-none" onTouchStart={swipe.onTouchStart} onTouchEnd={swipe.onTouchEnd}>
        <ParagraphView prev={prev} current={current} next={next} fontRem={fontRem} />
      </main>

      <Timers elapsed={elapsed} section={sectionElapsed} remaining={remaining} />

      <ControlBar
        state={state}
        autoAdvance={snapshot.autoAdvance}
        showSecond={showSecond}
        showDua={showDua}
        canPrev={idx > 0}
        canNext={idx < total - 1}
        onPrev={goPrev}
        onNext={goNext}
        onPauseToggle={() => cmd({ type: state === 'PAUSED' ? 'resume' : 'pause' })}
        onImprov={() => cmd({ type: 'improv' })}
        onSecond={() => cmd({ type: 'section', section: 'SECOND' })}
        onDua={() => cmd({ type: 'section', section: 'DUA' })}
        onAutoAdvance={(enabled) => cmd({ type: 'autoAdvance', enabled })}
        onEnd={() => setConfirmEnd(true)}
      />

      <ConfirmDialog
        open={confirmEnd}
        title={t('imam.end')}
        message={t('imam.endConfirm')}
        confirmLabel={t('imam.end')}
        cancelLabel={t('common.cancel')}
        danger
        onCancel={() => setConfirmEnd(false)}
        onConfirm={() => {
          setConfirmEnd(false);
          cmd({ type: 'end' });
        }}
      />
    </div>
  );
}
