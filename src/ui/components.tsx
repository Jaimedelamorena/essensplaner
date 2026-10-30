import { useEffect, type ReactNode } from 'react';
import { Icon } from './Icon';

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="btn icon ghost" onClick={onClose} aria-label="Schliessen">
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          className={o.value === value ? 'on' : ''}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      className={`check ${checked ? 'on' : ''}`}
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
    >
      {checked && <Icon name="check" size={18} />}
    </button>
  );
}

/** Bestätigung direkt auf der Seite (window.confirm ist nicht überall verfügbar). */
export function ConfirmBox({
  question,
  confirmLabel,
  danger = false,
  onConfirm,
  onCancel,
}: {
  question: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className={`alert ${danger ? 'danger' : 'info'} stack-sm`} role="alertdialog" aria-live="polite">
      <div>{question}</div>
      <div className="row wrap">
        <button type="button" className={`btn small ${danger ? 'danger' : 'primary'}`} onClick={onConfirm}>
          {confirmLabel}
        </button>
        <button type="button" className="btn small" onClick={onCancel}>
          Abbrechen
        </button>
      </div>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card empty">
      <h2>{title}</h2>
      {children}
    </div>
  );
}

/** Kostenänderung als «+1.20» / «−0.80» / «±0.00». */
export function formatDelta(delta: number): string {
  if (Math.abs(delta) < 0.005) return '±0.00';
  return `${delta > 0 ? '+' : '−'}${Math.abs(delta).toFixed(2)}`;
}
