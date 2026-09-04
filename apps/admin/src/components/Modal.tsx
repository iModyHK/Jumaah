import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const { t } = useTranslation();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className={`j-card j-fade-in relative flex max-h-[92vh] w-full flex-col ${wide ? 'max-w-4xl' : 'max-w-lg'}`}>
        <div className="flex items-center justify-between gap-4 border-b px-5 py-3" style={{ borderColor: 'var(--j-border)' }}>
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" className="j-btn j-btn-ghost px-2 py-1" onClick={onClose} aria-label={t('common.close')}>
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex flex-wrap justify-end gap-2 border-t px-5 py-3" style={{ borderColor: 'var(--j-border)' }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
