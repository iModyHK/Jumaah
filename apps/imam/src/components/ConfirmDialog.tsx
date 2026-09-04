import { Button } from '@jumaah/ui';

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: 'rgba(0,0,0,0.72)' }} role="dialog" aria-modal="true">
      <div className="j-card j-fade-in flex w-full max-w-md flex-col gap-5 p-6">
        {title && <h2 className="text-xl font-bold">{title}</h2>}
        <p className="text-lg leading-relaxed">{message}</p>
        <div className="flex gap-3">
          {onCancel && cancelLabel && (
            <Button className="min-h-14 flex-1 text-lg" onClick={onCancel}>
              {cancelLabel}
            </Button>
          )}
          <Button variant={danger ? 'danger' : 'primary'} className="min-h-14 flex-1 text-lg" onClick={onConfirm} autoFocus>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
