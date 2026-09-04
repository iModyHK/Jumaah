import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

export function Field({ label, error, hint, children, className = '' }: { label?: ReactNode; error?: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      {label && <span className="j-label">{label}</span>}
      {children}
      {hint && !error && <span className="j-muted mt-1 block text-xs">{hint}</span>}
      {error && (
        <span className="mt-1 block text-xs" style={{ color: 'var(--j-danger)' }}>
          {error}
        </span>
      )}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className = '', ...rest } = props;
  return <input {...rest} className={`j-input ${className}`} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = '', ...rest } = props;
  return <textarea {...rest} className={`j-input ${className}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = '', ...rest } = props;
  return <select {...rest} className={`j-input ${className}`} />;
}

export function Checkbox({ label, checked, onChange, disabled }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input type="checkbox" className="j-check" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function FormRow({ children, cols = 2 }: { children: ReactNode; cols?: 1 | 2 | 3 }) {
  const cls = cols === 3 ? 'md:grid-cols-3' : cols === 2 ? 'md:grid-cols-2' : '';
  return <div className={`grid grid-cols-1 gap-3 ${cls}`}>{children}</div>;
}
