import { useCallback, useEffect, useRef, useState } from 'react';

export function useLocalStorage<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw !== null ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (v: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const next = typeof v === 'function' ? (v as (p: T) => T)(prev) : v;
        try {
          localStorage.setItem(key, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    [key],
  );
  return [value, set];
}

/** Keeps the screen on (Screen Wake Lock API) and re-acquires after tab visibility changes. */
export function useWakeLock(enabled = true): { active: boolean; supported: boolean } {
  const [active, setActive] = useState(false);
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  const lockRef = useRef<{ release: () => Promise<void>; addEventListener?: (t: string, f: () => void) => void } | null>(null);

  useEffect(() => {
    if (!enabled || !supported) return;
    let cancelled = false;
    const acquire = async () => {
      try {
        const lock = await (navigator as unknown as { wakeLock: { request: (t: 'screen') => Promise<{ release: () => Promise<void>; addEventListener?: (t: string, f: () => void) => void }> } }).wakeLock.request('screen');
        if (cancelled) {
          await lock.release();
          return;
        }
        lockRef.current = lock;
        setActive(true);
        lock.addEventListener?.('release', () => setActive(false));
      } catch {
        setActive(false);
      }
    };
    void acquire();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void acquire();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lockRef.current?.release().catch(() => undefined);
      lockRef.current = null;
    };
  }, [enabled, supported]);

  return { active, supported };
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export function useFullscreen(): { isFullscreen: boolean; toggle: () => Promise<void>; enter: () => Promise<void> } {
  const [isFullscreen, setIs] = useState(typeof document !== 'undefined' && !!document.fullscreenElement);
  useEffect(() => {
    const h = () => setIs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);
  const enter = useCallback(async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    } catch {
      /* ignore: needs a user gesture */
    }
  }, []);
  const toggle = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await enter();
    } catch {
      /* ignore */
    }
  }, [enter]);
  return { isFullscreen, toggle, enter };
}

/** Ticks every `ms` while enabled; returns Date.now() (plus optional offset). */
export function useNow(ms = 1000, enabled = true, offsetMs = 0): number {
  const [now, setNow] = useState(() => Date.now() + offsetMs);
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => setNow(Date.now() + offsetMs), ms);
    return () => clearInterval(t);
  }, [ms, enabled, offsetMs]);
  return now;
}

/** Horizontal swipe detection for touch devices. */
export function useSwipe(onLeft: () => void, onRight: () => void, threshold = 60) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, []);
  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!start.current) return;
      const dx = e.changedTouches[0].clientX - start.current.x;
      const dy = e.changedTouches[0].clientY - start.current.y;
      start.current = null;
      if (Math.abs(dx) < threshold || Math.abs(dy) > Math.abs(dx)) return;
      if (dx < 0) onLeft();
      else onRight();
    },
    [onLeft, onRight, threshold],
  );
  return { onTouchStart, onTouchEnd };
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}
