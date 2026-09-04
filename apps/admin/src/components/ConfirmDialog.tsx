import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Spinner } from '@jumaah/ui';
import { Modal } from './Modal';

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  danger,
  confirmLabel,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  title?: ReactNode;
  message: ReactNode;
  danger?: boolean;
  confirmLabel?: string;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title ?? t('common.areYouSure')}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={() => void run()} disabled={busy}>
            {busy ? <Spinner /> : confirmLabel ?? t('common.confirm')}
          </Button>
        </>
      }
    >
      <div className="text-sm leading-relaxed">{message}</div>
    </Modal>
  );
}
