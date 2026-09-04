import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@jumaah/ui';

export function CopyButton({ text, className = '' }: { text: string; className?: string }) {
  const { t } = useTranslation();
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setDone(true);
    setTimeout(() => setDone(false), 1500);
  };
  return (
    <Button className={`px-2 py-1 text-xs ${className}`} onClick={() => void copy()}>
      {done ? t('common.copied') : t('common.copy')}
    </Button>
  );
}

export function CopyField({ value }: { value: string }) {
  return (
    <div className="flex items-center gap-2">
      <code className="j-kbd flex-1 select-all">{value}</code>
      <CopyButton text={value} />
    </div>
  );
}
