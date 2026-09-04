import { useEffect } from 'react';
import { DISPLAY_THEMES, type DisplayTheme } from '@jumaah/shared';
import { useFullscreen, useWakeLock } from '@jumaah/ui';

export function normalizeTheme(theme: string | null | undefined): DisplayTheme {
  return (DISPLAY_THEMES as readonly string[]).includes(theme ?? '') ? (theme as DisplayTheme) : 'dark';
}

/** Apply a theme to <html data-theme> (tokens live in @jumaah/ui base.css). */
export function useTheme(theme: string | null | undefined): void {
  useEffect(() => {
    document.documentElement.dataset.theme = normalizeTheme(theme);
  }, [theme]);
}

const CURSOR_IDLE_MS = 3000;

/**
 * Kiosk behaviour for the wall screen: wake lock, hidden cursor after idle,
 * fullscreen on first interaction, `f` toggles fullscreen, no page scroll.
 */
export function useKiosk(enabled = true): void {
  useWakeLock(enabled);
  const { enter, toggle } = useFullscreen();

  useEffect(() => {
    if (!enabled) return;
    const html = document.documentElement;
    html.classList.add('j-kiosk');

    let timer: ReturnType<typeof setTimeout> | null = null;
    const hide = () => html.classList.add('j-cursor-hidden');
    const wake = () => {
      html.classList.remove('j-cursor-hidden');
      if (timer) clearTimeout(timer);
      timer = setTimeout(hide, CURSOR_IDLE_MS);
    };
    timer = setTimeout(hide, CURSOR_IDLE_MS);

    let requested = false;
    const firstGesture = () => {
      if (requested) return;
      requested = true;
      void enter();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        requested = true;
        void toggle();
        return;
      }
      firstGesture();
    };

    window.addEventListener('mousemove', wake, { passive: true });
    window.addEventListener('pointerdown', firstGesture, { passive: true });
    window.addEventListener('keydown', onKey);
    return () => {
      if (timer) clearTimeout(timer);
      html.classList.remove('j-kiosk', 'j-cursor-hidden');
      window.removeEventListener('mousemove', wake);
      window.removeEventListener('pointerdown', firstGesture);
      window.removeEventListener('keydown', onKey);
    };
  }, [enabled, enter, toggle]);
}
