import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import type { PmcPoint } from '../lib/metrics';
import { dayShort, fmtDur, monShort, parseDay } from '../lib/format';

function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(340);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((e) => setW(Math.max(200, Math.floor(e[0].contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** Touch/mouse scrubbing over an x range -> index. */
function useScrub(n: number, padL: number, width: number) {
  const [idx, setIdx] = useState<number | null>(null);
  const handlers = {
    onPointerMove: (e: React.PointerEvent<SVGSVGElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - r.left - padL;
      const i = Math.round((x / Math.max(1, width - padL)) * (n - 1));
      setIdx(Math.max(0, Math.min(n - 1, i)));
    },
    onPointerLeave: () => setIdx(null),
    onPointerDown: (e: React.PointerEvent<SVGSVGElement>) => handlers.onPointerMove(e),
  };
  return [idx, handlers] as const;
}

function niceMax(v: number) {
  if (v <= 0) return 10;
  const p = 10 ** Math.floor(Math.log10(v));
  const m = v / p;
  const step = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((x) => m <= x) ?? 10;
  return step * p;
}

// ---------- Performance management ----------
export function PmcChart({ points, height = 220, compact = false }: { points: PmcPoint[]; height?: number; compact?: boolean }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const padL = compact ? 4 : 28;
  const padR = compact ? 4 : 28;
  const padB = compact ? 4 : 18;
  const padT = 8;
  const n = points.length;
  const [idx, h] = useScrub(n, padL, w - padR);
  if (!n) return <div ref={ref} />;
  const maxL = niceMax(Math.max(...points.map((p) => Math.max(p.ctl, p.atl))) * 1.05);
  const tsbAbs = niceMax(Math.max(10, ...points.map((p) => Math.abs(p.tsb))));
  const maxTss = Math.max(1, ...points.map((p) => p.tss));
  const X = (i: number) => padL + (i / Math.max(1, n - 1)) * (w - padL - padR);
  const Y = (v: number) => padT + (1 - v / maxL) * (height - padT - padB);
  const Yt = (v: number) => padT + (0.5 - v / (2 * tsbAbs)) * (height - padT - padB);
  const firstFuture = points.findIndex((p) => p.future);
  const path = (k: 'ctl' | 'atl' | 'tsb', from = 0, to = n) => {
    let d = '';
    for (let i = from; i < to; i++) d += `${i === from ? 'M' : 'L'}${X(i).toFixed(1)},${(k === 'tsb' ? Yt(points[i][k]) : Y(points[i][k])).toFixed(1)}`;
    return d;
  };
  const split = firstFuture > 0 ? firstFuture : n;
  const area = `${path('ctl', 0, split)}L${X(split - 1)},${Y(0)}L${X(0)},${Y(0)}Z`;
  const ticks: { i: number; label: string }[] = [];
  let lastM = '';
  points.forEach((p, i) => {
    const m = p.date.slice(0, 7);
    if (m !== lastM && parseDay(p.date).getDate() <= 7) {
      ticks.push({ i, label: monShort(p.date) });
      lastM = m;
    }
  });
  const sel = idx != null ? points[idx] : null;
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <svg className="chart" width={w} height={height} {...h} role="img" aria-label="Gráfico de forma: fitness, fatiga y forma">
        {!compact &&
          [0.25, 0.5, 0.75, 1].map((f) => (
            <g key={f}>
              <line x1={padL} x2={w - padR} y1={Y(maxL * f)} y2={Y(maxL * f)} stroke="var(--c-border)" strokeWidth={1} />
              <text x={padL - 4} y={Y(maxL * f) + 3} textAnchor="end">
                {Math.round(maxL * f)}
              </text>
            </g>
          ))}
        {!compact && (
          <>
            <line x1={padL} x2={w - padR} y1={Yt(0)} y2={Yt(0)} stroke="var(--c-border-input)" strokeDasharray="2 3" />
            <text x={w - padR + 4} y={Yt(tsbAbs * 0.8) + 3}>+{Math.round(tsbAbs * 0.8)}</text>
            <text x={w - padR + 4} y={Yt(0) + 3}>0</text>
            <text x={w - padR + 4} y={Yt(-tsbAbs * 0.8) + 3}>{-Math.round(tsbAbs * 0.8)}</text>
          </>
        )}
        {!compact &&
          points.map((p, i) =>
            p.tss > 0 ? <circle key={i} cx={X(i)} cy={height - padB - (p.tss / maxTss) * (height - padT - padB) * 0.35} r={1.6} fill={p.future ? 'var(--c-border-input)' : 'var(--c-fatigue)'} opacity={0.55} /> : null,
          )}
        <path d={area} fill="var(--c-fitness)" opacity={0.18} />
        <path d={path('ctl', 0, split)} fill="none" stroke="var(--c-fitness)" strokeWidth={2} />
        <path d={path('atl', 0, split)} fill="none" stroke="var(--c-fatigue)" strokeWidth={1.4} opacity={0.9} />
        {!compact && <path d={path('tsb', 0, split)} fill="none" stroke="var(--c-form)" strokeWidth={1.4} />}
        {split < n && (
          <g strokeDasharray="4 3">
            <path d={path('ctl', split - 1, n)} fill="none" stroke="var(--c-fitness)" strokeWidth={2} />
            <path d={path('atl', split - 1, n)} fill="none" stroke="var(--c-fatigue)" strokeWidth={1.2} />
            {!compact && <path d={path('tsb', split - 1, n)} fill="none" stroke="var(--c-form)" strokeWidth={1.2} />}
          </g>
        )}
        {!compact && ticks.map((t) => <text key={t.i} x={X(t.i)} y={height - 4} textAnchor="middle">{t.label}</text>)}
        {sel && idx != null && <line x1={X(idx)} x2={X(idx)} y1={padT} y2={height - padB} stroke="var(--c-text-muted)" strokeWidth={1} />}
      </svg>
      {sel && !compact && (
        <div className="xs card tight" style={{ position: 'absolute', top: 0, left: idx != null && X(idx) > w / 2 ? 8 : undefined, right: idx != null && X(idx) <= w / 2 ? 8 : undefined, pointerEvents: 'none', padding: '6px 10px' }}>
          <div className="b">{dayShort(sel.date)}{sel.future ? ' · previsto' : ''}</div>
          <div>
            <span className="c-fitness">CTL {sel.ctl.toFixed(0)}</span> · <span className="c-fatigue">ATL {sel.atl.toFixed(0)}</span> · <span className="c-form">TSB {sel.tsb.toFixed(0)}</span>
          </div>
          <div className="muted">TSS {Math.round(sel.tss)}</div>
        </div>
      )}
    </div>
  );
}

// ---------- Activity streams ----------
export interface Series {
  key: string;
  label: string;
  color: string;
  data: (number | null)[];
  fmt: (v: number) => string;
  invert?: boolean; // e.g. pace: lower is better, draw higher
}

export function StreamChart({ x, series, xFmt, panelH = 64 }: { x: number[]; series: Series[]; xFmt: (v: number) => string; panelH?: number }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const n = x.length;
  const padL = 4;
  const [idx, h] = useScrub(n, padL, w - 4);
  const height = series.length * (panelH + 8) + 14;
  // downsample for drawing
  const step = Math.max(1, Math.floor(n / (w * 1.5)));
  const X = (i: number) => padL + (i / Math.max(1, n - 1)) * (w - padL - 4);
  return (
    <div ref={ref}>
      {idx != null && (
        <div className="row wrap xs" style={{ minHeight: 18, gap: 10 }}>
          <span className="b">{xFmt(x[idx])}</span>
          {series.map((s) => (
            <span key={s.key} style={{ color: s.color }}>
              {s.data[idx] != null ? s.fmt(s.data[idx] as number) : '—'}
            </span>
          ))}
        </div>
      )}
      {idx == null && (
        <div className="legend" style={{ minHeight: 18 }}>
          {series.map((s) => (
            <span key={s.key}>
              <i className="dot" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
      <svg className="chart" width={w} height={height} {...h} role="img" aria-label="Gráfico de la sesión">
        {series.map((s, k) => {
          const vals = s.data.filter((v): v is number => v != null && isFinite(v));
          if (!vals.length) return null;
          const sorted = [...vals].sort((a, b) => a - b);
          let lo = sorted[Math.floor(sorted.length * 0.02)];
          let hi = sorted[Math.floor(sorted.length * 0.995)];
          if (hi - lo < 1e-6) (hi += 1), (lo -= 1);
          const top = k * (panelH + 8) + 4;
          const Y = (v: number) => {
            const f = (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo);
            return top + (s.invert ? f : 1 - f) * panelH;
          };
          let d = '';
          let pen = false;
          for (let i = 0; i < n; i += step) {
            const v = s.data[i];
            if (v == null) {
              pen = false;
              continue;
            }
            d += `${pen ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`;
            pen = true;
          }
          const fill = `${d}L${X(n - 1)},${top + panelH}L${X(0)},${top + panelH}Z`;
          return (
            <g key={s.key}>
              <rect x={0} y={top} width={w} height={panelH} fill="var(--c-surface-2)" opacity={0.35} rx={4} />
              {s.key !== 'pace' && <path d={fill} fill={s.color} opacity={0.12} />}
              <path d={d} fill="none" stroke={s.color} strokeWidth={1.3} />
              <text x={w - 6} y={top + 11} textAnchor="end">{s.fmt(s.invert ? lo : hi)}</text>
              <text x={w - 6} y={top + panelH - 3} textAnchor="end">{s.fmt(s.invert ? hi : lo)}</text>
            </g>
          );
        })}
        {[0.25, 0.5, 0.75].map((f) => (
          <text key={f} x={X(Math.round(f * (n - 1)))} y={height - 2} textAnchor="middle">{xFmt(x[Math.round(f * (n - 1))] ?? 0)}</text>
        ))}
        {idx != null && <line x1={X(idx)} x2={X(idx)} y1={0} y2={height - 12} stroke="var(--c-text)" strokeWidth={1} opacity={0.6} />}
      </svg>
    </div>
  );
}

// ---------- Bars ----------
export interface Bar {
  key: string;
  label: string;
  value: number;
  planned?: number;
  stack?: { value: number; color: string }[];
  highlight?: boolean;
}

export function BarChart({ bars, height = 160, fmt = (v) => String(Math.round(v)), color = 'var(--c-accent)', onSelect }: { bars: Bar[]; height?: number; fmt?: (v: number) => string; color?: string; onSelect?: (b: Bar) => void }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [sel, setSel] = useState<number | null>(null);
  const padB = 18;
  const padT = 16;
  const max = niceMax(Math.max(1, ...bars.map((b) => Math.max(b.value, b.planned ?? 0))));
  const bw = (w - 8) / Math.max(1, bars.length);
  const Y = (v: number) => padT + (1 - v / max) * (height - padT - padB);
  const every = Math.ceil(bars.length / Math.max(1, Math.floor(w / 44)));
  return (
    <div ref={ref}>
      <svg className="chart" width={w} height={height} role="img" aria-label="Gráfico de barras">
        <line x1={0} x2={w} y1={Y(max / 2)} y2={Y(max / 2)} stroke="var(--c-border)" />
        <text x={2} y={Y(max / 2) - 3}>{fmt(max / 2)}</text>
        {bars.map((b, i) => {
          const x = 4 + i * bw + bw * 0.15;
          const bwInner = bw * 0.7;
          let acc = 0;
          return (
            <g key={b.key} onClick={() => (setSel(i), onSelect?.(b))} style={{ cursor: 'pointer' }}>
              <rect x={4 + i * bw} y={0} width={bw} height={height} fill="transparent" />
              {b.planned ? <rect x={x} y={Y(b.planned)} width={bwInner} height={Y(0) - Y(b.planned)} fill="none" stroke="var(--c-border-input)" strokeDasharray="3 2" rx={3} /> : null}
              {b.stack
                ? b.stack.map((s, k) => {
                    const y0 = Y(acc);
                    acc += s.value;
                    return <rect key={k} x={x} y={Y(acc)} width={bwInner} height={Math.max(0, y0 - Y(acc))} fill={s.color} opacity={b.highlight || sel === i ? 1 : 0.85} />;
                  })
                : <rect x={x} y={Y(b.value)} width={bwInner} height={Math.max(0, Y(0) - Y(b.value))} rx={3} fill={color} opacity={b.highlight || sel === i ? 1 : 0.7} />}
              {(sel === i || (sel == null && b.highlight)) && b.value > 0 && (
                <text x={x + bwInner / 2} y={Y(Math.max(b.value, b.planned ?? 0)) - 4} textAnchor="middle" style={{ fill: 'var(--c-text)', fontWeight: 600 }}>
                  {fmt(b.value)}
                </text>
              )}
              {i % every === 0 && <text x={x + bwInner / 2} y={height - 4} textAnchor="middle">{b.label}</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ---------- Zones ----------
export const ZONE_COLORS = ['#7d8a9a', '#5aa9ff', '#3ddc97', '#ffd166', '#ff9f43', '#ff6b6b', '#d65cff'];

export function ZoneBars({ names, seconds }: { names: string[]; seconds: number[] }) {
  const total = seconds.reduce((a, b) => a + b, 0) || 1;
  const max = Math.max(...seconds, 1);
  return (
    <div className="stack" style={{ gap: 6 }}>
      {names.map((n, i) => (
        <div className="zone-row" key={n}>
          <span className="ellipsis">{n}</span>
          <div className="track" aria-hidden>
            <div className="fill" style={{ width: `${(seconds[i] / max) * 100}%`, background: ZONE_COLORS[Math.min(i, ZONE_COLORS.length - 1)] }} />
          </div>
          <span className="tnum" style={{ textAlign: 'right' }} title={fmtDur(seconds[i])}>
            {Math.round((seconds[i] / total) * 100)}% <span className="muted">{fmtDur(seconds[i], true)}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------- Peak curve ----------
export function PeakCurve({ series, fmtY, height = 200 }: { series: { label: string; color: string; points: [number, number][] }[]; fmtY: (v: number) => string; height?: number }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const all = series.flatMap((s) => s.points);
  if (!all.length) return <div ref={ref} className="muted sm">Sin datos de picos todavía.</div>;
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  const lx0 = Math.log(Math.min(...xs));
  const lx1 = Math.log(Math.max(...xs));
  const y0 = Math.min(...ys) * 0.92;
  const y1 = Math.max(...ys) * 1.04;
  const padL = 38;
  const padB = 18;
  const X = (v: number) => padL + ((Math.log(v) - lx0) / Math.max(1e-6, lx1 - lx0)) * (w - padL - 8);
  const Y = (v: number) => 6 + (1 - (v - y0) / Math.max(1e-6, y1 - y0)) * (height - 6 - padB);
  const lbl = (s: number) => (s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : `${s / 3600}h`);
  return (
    <div ref={ref}>
      <svg className="chart" width={w} height={height} role="img" aria-label="Curva de mejores marcas">
        {[0, 0.5, 1].map((f) => {
          const v = y0 + (y1 - y0) * f;
          return (
            <g key={f}>
              <line x1={padL} x2={w} y1={Y(v)} y2={Y(v)} stroke="var(--c-border)" />
              <text x={padL - 4} y={Y(v) + 3} textAnchor="end">{fmtY(v)}</text>
            </g>
          );
        })}
        {[...new Set(xs)].sort((a, b) => a - b).map((d) => <text key={d} x={X(d)} y={height - 4} textAnchor="middle">{lbl(d)}</text>)}
        {series.map((s) => (
          <g key={s.label}>
            <path d={s.points.map((p, i) => `${i ? 'L' : 'M'}${X(p[0])},${Y(p[1])}`).join('')} fill="none" stroke={s.color} strokeWidth={2} />
            {s.points.map((p) => <circle key={p[0]} cx={X(p[0])} cy={Y(p[1])} r={2.5} fill={s.color} />)}
          </g>
        ))}
      </svg>
      {series.length > 1 && (
        <div className="legend">
          {series.map((s) => (
            <span key={s.label}><i className="dot" style={{ background: s.color }} />{s.label}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Route ----------
export function RouteMap({ lat, lng, height = 200 }: { lat: (number | null)[]; lng: (number | null)[]; height?: number }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const pts = useMemo(() => {
    const out: [number, number][] = [];
    const step = Math.max(1, Math.floor(lat.length / 1500));
    for (let i = 0; i < lat.length; i += step) if (lat[i] != null && lng[i] != null) out.push([lat[i] as number, lng[i] as number]);
    return out;
  }, [lat, lng]);
  if (pts.length < 2) return null;
  const la = pts.map((p) => p[0]);
  const lo = pts.map((p) => p[1]);
  const minLa = Math.min(...la), maxLa = Math.max(...la), minLo = Math.min(...lo), maxLo = Math.max(...lo);
  const k = Math.cos(((minLa + maxLa) / 2) * (Math.PI / 180));
  const sx = (maxLo - minLo) * k || 1e-6;
  const sy = maxLa - minLa || 1e-6;
  const s = Math.min((w - 20) / sx, (height - 20) / sy);
  const ox = (w - sx * s) / 2;
  const oy = (height - sy * s) / 2;
  const P = (p: [number, number]) => [ox + (p[1] - minLo) * k * s, oy + (maxLa - p[0]) * s];
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${P(p)[0].toFixed(1)},${P(p)[1].toFixed(1)}`).join('');
  const a = P(pts[0]);
  const b = P(pts[pts.length - 1]);
  return (
    <div ref={ref}>
      <svg className="chart" width={w} height={height} role="img" aria-label="Recorrido">
        <rect width={w} height={height} rx={10} fill="var(--c-surface-2)" opacity={0.5} />
        <path d={d} fill="none" stroke="var(--c-accent)" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={a[0]} cy={a[1]} r={5} fill="var(--c-success)" />
        <circle cx={b[0]} cy={b[1]} r={5} fill="var(--c-danger)" />
      </svg>
    </div>
  );
}

export function Sparkline({ values, color, height = 36 }: { values: (number | null)[]; color: string; height?: number }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const v = values.filter((x): x is number => x != null);
  if (v.length < 2) return <div ref={ref} style={{ height }} />;
  const lo = Math.min(...v);
  const hi = Math.max(...v);
  const X = (i: number) => (i / (values.length - 1)) * w;
  const Y = (x: number) => 3 + (1 - (x - lo) / (hi - lo || 1)) * (height - 6);
  let d = '';
  let pen = false;
  values.forEach((x, i) => {
    if (x == null) return (pen = false);
    d += `${pen ? 'L' : 'M'}${X(i).toFixed(1)},${Y(x).toFixed(1)}`;
    pen = true;
  });
  return (
    <div ref={ref}>
      <svg width={w} height={height} className="chart" aria-hidden>
        <path d={d} fill="none" stroke={color} strokeWidth={2} />
      </svg>
    </div>
  );
}

export function Legend({ items }: { items: { color: string; label: ReactNode }[] }) {
  return (
    <div className="legend">
      {items.map((it, i) => (
        <span key={i}><i className="dot" style={{ background: it.color }} />{it.label}</span>
      ))}
    </div>
  );
}
