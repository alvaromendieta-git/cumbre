import { type ReactNode, useEffect, useRef, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import type { Sport } from '../lib/types';

// ---------- router ----------
export function useRoute(): string[] {
  const get = () => (location.hash.replace(/^#\/?/, '') || 'hoy').split('?')[0].split('/').map(decodeURIComponent);
  const [r, setR] = useState(get);
  useEffect(() => {
    const on = () => {
      setR(get());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return r;
}
export const go = (path: string) => {
  location.hash = '#/' + path;
};
export const query = (k: string) => new URLSearchParams(location.hash.split('?')[1] ?? '').get(k);

// ---------- layout ----------
export function Header({ title, back, right }: { title: ReactNode; back?: boolean | string; right?: ReactNode }) {
  return (
    <header className="header">
      {back && (
        <button className="icon-btn" aria-label="Volver" onClick={() => (typeof back === 'string' ? go(back) : history.length > 1 ? history.back() : go('hoy'))}>
          <ChevronLeft size={22} />
        </button>
      )}
      <h1>{title}</h1>
      {right}
    </header>
  );
}

export function Card({ title, action, children, className = '' }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <h2 className="card-title">
          <span>{title}</span>
          {action}
        </h2>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, unit, tone, big }: { label: string; value: ReactNode; unit?: string; tone?: string; big?: boolean }) {
  return (
    <div className={`stat ${big ? 'big' : ''}`}>
      <div className="label">{label}</div>
      <div className={`value ${tone ? 'c-' + tone : ''}`}>
        {value}
        {unit && <small>{unit}</small>}
      </div>
    </div>
  );
}

export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    ref.current?.focus();
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', k);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <div className="grip" />
        <h2>{title}</h2>
        {children}
      </div>
    </>
  );
}

export function Field({ label, hint, error, children, id }: { label: string; hint?: string; error?: string; children: ReactNode; id: string }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && !error && <span className="hint">{hint}</span>}
      {error && <span className="err">{error}</span>}
    </div>
  );
}

export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      {icon}
      <div className="b" style={{ color: 'var(--c-text)' }}>
        {title}
      </div>
      <div className="sm" style={{ marginTop: 6 }}>
        {children}
      </div>
    </div>
  );
}

let toastSet: ((s: string | null) => void) | null = null;
export function toast(msg: string) {
  toastSet?.(msg);
}
export function ToastHost() {
  const [m, setM] = useState<string | null>(null);
  useEffect(() => {
    toastSet = setM;
  }, []);
  useEffect(() => {
    if (!m) return;
    const t = setTimeout(() => setM(null), 2600);
    return () => clearTimeout(t);
  }, [m]);
  return m ? (
    <div className="toast" role="status">
      {m}
    </div>
  ) : null;
}

export const sportColor = (s: Sport) => `var(--c-${s})`;
