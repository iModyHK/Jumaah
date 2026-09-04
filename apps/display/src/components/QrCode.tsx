import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

const cache = new Map<string, string>();

export function QrCode({ value, className = '' }: { value: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(() => cache.get(value) ?? null);
  useEffect(() => {
    let cancelled = false;
    const hit = cache.get(value);
    if (hit) {
      setSrc(hit);
      return;
    }
    QRCode.toDataURL(value, { margin: 1, width: 320, errorCorrectionLevel: 'M' })
      .then((url) => {
        cache.set(value, url);
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [value]);
  if (!src) return null;
  return <img src={src} alt="QR" className={className} draggable={false} />;
}
