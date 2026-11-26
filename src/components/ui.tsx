import { type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
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

export function Card({ title, action, children, className = '', tint, style }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; tint?: string; style?: CSSProperties }) {
  return (
    <section className={`card ${tint ? 'hero' : ''} ${className}`} style={tint ? ({ '--tint': tint, ...style } as CSSProperties) : style}>
      {(title || action) && (
        <h2 className="card-title">
          <span>{title}</span>
          {action}
        </h2>
      )}
      <div className="card-body">{children}</div>
    </section>
  );
}

/** Animated number that counts up when it changes. */
export function CountUp({ value, decimals = 0, prefix = '' }: { value: number; decimals?: number; prefix?: string }) {
  const [v, setV] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return setV(value);
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / 900);
      const e = 1 - Math.pow(1 - k, 3);
      setV(a + (value - a) * e);
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  const sign = prefix === '±' ? (value > 0 ? '+' : '') : prefix;
  return <>{sign}{v.toFixed(decimals)}</>;
}

/** Small arrow badge showing a 7-day change; `badWhen` says which direction is bad news. */
export function Trend({ delta, badWhen, unit = '' }: { delta?: number; badWhen: 'up' | 'down'; unit?: string }) {
  if (delta == null || !isFinite(delta)) return null;
  const flat = Math.abs(delta) < 0.5;
  const up = delta > 0;
  const cls = flat ? 'flat' : up ? (badWhen === 'up' ? 'up-bad' : 'up-good') : badWhen === 'down' ? 'down-bad' : 'down-good';
  return (
    <span className={`trend ${cls}`} title="Cambio en 7 días">
      {flat ? '→' : up ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}{unit}
    </span>
  );
}

export function Stat({ label, value, unit, tone, big, color, glow, extra }: { label: string; value: ReactNode; unit?: string; tone?: string; big?: boolean; color?: string; glow?: boolean; extra?: ReactNode }) {
  return (
    <div className={`stat ${big ? 'big' : ''}`}>
      <div className="label">{label}</div>
      <div className={`value ${tone ? 'c-' + tone : ''} ${glow ? 'glow' : ''}`} style={color ? { color } : undefined}>
        {value}
        {unit && <small>{unit}</small>}
      </div>
      {extra}
    </div>
  );
}

/** Soft floating bubbles behind a chart. */
export function ChartBubbles({ color = 'var(--c-accent)', count = 6, seed = 1 }: { color?: string; count?: number; seed?: number }) {
  const items = useMemo(() => {
    let x = seed * 9301 + 49297;
    const rnd = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
    return Array.from({ length: count }, () => ({ l: rnd() * 90, t: rnd() * 80, s: 40 + rnd() * 110, d: 7 + rnd() * 8, dx: (rnd() - 0.5) * 30, dy: (rnd() - 0.5) * 30 }));
  }, [count, seed]);
  return (
    <div className="chart-bubbles" aria-hidden>
      {items.map((b, i) => (
        <span key={i} style={{ left: `${b.l}%`, top: `${b.t}%`, width: b.s, height: b.s, '--bc': color, '--d': `${b.d}s`, '--dx': `${b.dx}px`, '--dy': `${b.dy}px` } as CSSProperties} />
      ))}
    </div>
  );
}

/** Fixed background: drifting colour orbs (tinted by load status) and rising bubbles. */
export function Backdrop() {
  const bubbles = useMemo(() => Array.from({ length: 12 }, (_, i) => ({ l: (i * 37) % 100, s: 14 + ((i * 53) % 46), d: 18 + ((i * 29) % 22), delay: -((i * 7) % 30) })), []);
  return (
    <div className="backdrop" aria-hidden>
      <div className="orb o1" />
      <div className="orb o2" />
      <div className="orb o3" />
      {bubbles.map((b, i) => (
        <span key={i} className="bubble" style={{ left: `${b.l}%`, bottom: -60, width: b.s, height: b.s, animationDuration: `${b.d}s`, animationDelay: `${b.delay}s` }} />
      ))}
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
