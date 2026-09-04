import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { errorMessage } from '../lib/errors';

interface ToastItem {
  id: number;
  tone: 'ok' | 'danger' | 'info';
  text: string;
}

interface ToastApi {
  success: (text: string) => void;
  error: (err: unknown) => void;
  info: (text: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const push = useCallback((tone: ToastItem['tone'], text: string) => {
    const id = ++seq.current;
    setItems((prev) => [...prev, { id, tone, text }]);
    setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== id)), tone === 'danger' ? 6000 : 3500);
  }, []);

  const value = useMemo<ToastApi>(
    () => ({
      success: (text) => push('ok', text),
      error: (err) => push('danger', errorMessage(err)),
      info: (text) => push('info', text),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 start-4 z-[100] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
        {items.map((i) => (
          <div
            key={i.id}
            className="j-card j-fade-in pointer-events-auto px-4 py-3 text-sm shadow-lg"
            style={{ borderColor: i.tone === 'ok' ? 'var(--j-accent)' : i.tone === 'danger' ? 'var(--j-danger)' : 'var(--j-border)' }}
            role="status"
          >
            {i.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
