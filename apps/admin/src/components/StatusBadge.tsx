import { useTranslation } from 'react-i18next';
import type { KhutbahStatus, TranslationStatus } from '@jumaah/shared';
import { StatusPill } from '@jumaah/ui';

const KHUTBAH_TONE: Record<KhutbahStatus, 'ok' | 'warn' | 'danger' | 'muted'> = {
  DRAFT: 'muted',
  TRANSLATING: 'warn',
  REVIEW: 'warn',
  READY: 'ok',
  DELIVERED: 'ok',
  ARCHIVED: 'muted',
};

const TRANSLATION_TONE: Record<TranslationStatus, 'ok' | 'warn' | 'danger' | 'muted'> = {
  PENDING: 'muted',
  MACHINE: 'warn',
  REVIEWED: 'warn',
  APPROVED: 'ok',
  REJECTED: 'danger',
};

export function KhutbahStatusBadge({ status }: { status: KhutbahStatus }) {
  const { t } = useTranslation();
  return <StatusPill tone={KHUTBAH_TONE[status] ?? 'muted'}>{t(`khutbah.status.${status}`)}</StatusPill>;
}

export function TranslationStatusBadge({ status }: { status: TranslationStatus }) {
  const { t } = useTranslation();
  return <StatusPill tone={TRANSLATION_TONE[status] ?? 'muted'}>{t(`khutbah.translationStatus.${status}`)}</StatusPill>;
}

export function BoolBadge({ value, yes, no }: { value: boolean; yes: string; no: string }) {
  return <StatusPill tone={value ? 'ok' : 'muted'}>{value ? yes : no}</StatusPill>;
}
