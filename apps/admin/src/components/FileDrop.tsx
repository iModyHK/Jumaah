import { useRef, useState, type ReactNode } from 'react';
import { Spinner } from '@jumaah/ui';

/** Button-style file picker that also accepts drag & drop. */
export function FileDrop({ accept, onFile, label, busy, className = '', disabled }: { accept?: string; onFile: (file: File) => void | Promise<void>; label: ReactNode; busy?: boolean; className?: string; disabled?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const handle = (f: File | undefined) => {
    if (f && !disabled) void onFile(f);
  };
  return (
    <div
      className={`j-btn ${className}`}
      style={over ? { borderColor: 'var(--j-accent)', background: 'var(--j-accent-soft)' } : undefined}
      onClick={() => !disabled && ref.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        handle(e.dataTransfer.files[0]);
      }}
      role="button"
      tabIndex={0}
      aria-disabled={disabled}
    >
      {busy ? <Spinner /> : label}
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          handle(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}
