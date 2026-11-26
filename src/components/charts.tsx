import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { tsbColor, type PmcPoint } from '../lib/metrics';
import { dayShort, fmtDur, monShort, parseDay } from '../lib/format';
import { ChartBubbles } from './ui';

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

function Defs({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={`${id}-ctl`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="var(--c-fitness)" stopOpacity={0.55} />
        <stop offset="100%" stopColor="var(--c-fitness)" stopOpacity={0} />
      </linearGradient>
      <radialGradient id={`${id}-bub`} cx="35%" cy="30%" r="70%">
        <stop offset="0%" stopColor="#fff" stopOpacity={0.55} />
        <stop offset="60%" stopColor="#fff" stopOpacity={0.05} />
        <stop offset="100%" stopColor="#fff" stopOpacity={0} />
      </radialGradient>
      <filter id={`${id}-glow`} x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="3" result="b" />
        <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
    </defs>
  );
}

// ---------- Performance management ----------
export function PmcChart({ points, height = 240, compact = false }: { points: PmcPoint[]; height?: number; compact?: boolean }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const padL = compact ? 4 : 28;
  const padR = compact ? 4 : 30;
  const padB = compact ? 4 : 18;
  const padT = 8;
  const n = points.length;
  const [idx, h] = useScrub(n, padL, w - padR);
  const id = useMemo(() => 'p' + Math.random().toString(36).slice(2, 7), []);
  if (!n) return <div ref={ref} />;
  const maxL = niceMax(Math.max(...points.map((p) => Math.max(p.ctl, p.atl))) * 1.08);
  const tsbAbs = niceMax(Math.max(20, ...points.map((p) => Math.abs(p.tsb))));
  const maxTss = Math.max(1, ...points.map((p) => p.tss));
  const innerH = height - padT - padB;
  const X = (i: number) => padL + (i / Math.max(1, n - 1)) * (w - padL - padR);
  const Y = (v: number) => padT + (1 - v / maxL) * innerH;
  const Yt = (v: number) => padT + (0.5 - v / (2 * tsbAbs)) * innerH;
  const firstFuture = points.findIndex((p) => p.future);
  const split = firstFuture > 0 ? firstFuture : n;
  const path = (k: 'ctl' | 'atl' | 'tsb', from = 0, to = n) => {
    let d = '';
    for (let i = from; i < to; i++) d += `${i === from ? 'M' : 'L'}${X(i).toFixed(1)},${(k === 'tsb' ? Yt(points[i][k]) : Y(points[i][k])).toFixed(1)}`;
    return d;
  };
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
  const barW = Math.max(1.5, ((w - padL - padR) / n) * 0.62);
  const last = points[split - 1];
  return (
    <div ref={ref} className="chart-wrap">
      {!compact && <ChartBubbles color="var(--c-fitness)" count={5} seed={3} />}
      <svg className="chart" width={w} height={height} {...h} role="img" aria-label="Gráfico de forma: fitness, fatiga y forma">
        <Defs id={id} />
        {!compact && Yt(-30) < height - padB && (
          <g className="fadein">
            <rect x={padL} y={Yt(-30)} width={w - padL - padR} height={height - padB - Yt(-30)} fill="var(--st-danger)" opacity={0.08} />
            <line x1={padL} x2={w - padR} y1={Yt(-30)} y2={Yt(-30)} stroke="var(--st-danger)" strokeDasharray="3 4" opacity={0.6} />
            <text x={w - padR - 4} y={Yt(-30) - 4} textAnchor="end" style={{ fill: 'var(--st-danger)', fontWeight: 700 }}>zona de fatiga</text>
          </g>
        )}
        {!compact &&
          [0.25, 0.5, 0.75, 1].map((f) => (
            <g key={f}>
              <line x1={padL} x2={w - padR} y1={Y(maxL * f)} y2={Y(maxL * f)} stroke="rgba(160,175,255,.10)" strokeWidth={1} />
              <text x={padL - 4} y={Y(maxL * f) + 3} textAnchor="end">{Math.round(maxL * f)}</text>
            </g>
          ))}
        {!compact && (
          <>
            <line x1={padL} x2={w - padR} y1={Yt(0)} y2={Yt(0)} stroke="var(--c-border-input)" strokeDasharray="2 3" opacity={0.6} />
            <text x={w - padR + 4} y={Yt(tsbAbs * 0.7) + 3}>+{Math.round(tsbAbs * 0.7)}</text>
            <text x={w - padR + 4} y={Yt(0) + 3}>0</text>
            <text x={w - padR + 4} y={Yt(-tsbAbs * 0.7) + 3}>{-Math.round(tsbAbs * 0.7)}</text>
          </>
        )}
        {!compact &&
          points.map((p, i) => {
            const y0 = Yt(0);
            const y1 = Yt(p.tsb);
            return <rect key={'b' + i} className="grow" style={{ animationDelay: `${(i / n) * 500}ms`, transformOrigin: p.tsb < 0 ? 'top' : 'bottom' }} x={X(i) - barW / 2} y={Math.min(y0, y1)} width={barW} height={Math.abs(y1 - y0)} rx={barW / 2} fill={tsbColor(p.tsb)} opacity={p.future ? 0.25 : 0.55} />;
          })}
        <path d={area} fill={`url(#${id}-ctl)`} className="fadein" />
        <path d={path('ctl', 0, split)} pathLength={1} className="draw" fill="none" stroke="var(--c-fitness)" strokeWidth={compact ? 2.4 : 2.6} strokeLinecap="round" filter={`url(#${id}-glow)`} />
        <path d={path('atl', 0, split)} pathLength={1} className="draw d2" fill="none" stroke="var(--c-fatigue)" strokeWidth={compact ? 1.6 : 1.8} strokeLinecap="round" opacity={0.95} />
        {split < n && (
          <g strokeDasharray="4 4" className="fadein">
            <path d={path('ctl', split - 1, n)} fill="none" stroke="var(--c-fitness)" strokeWidth={2} opacity={0.8} />
            <path d={path('atl', split - 1, n)} fill="none" stroke="var(--c-fatigue)" strokeWidth={1.4} opacity={0.7} />
          </g>
        )}
        {!compact &&
          points.map((p, i) => {
            if (p.tss <= 0) return null;
            const r = 2 + Math.sqrt(p.tss / maxTss) * 9;
            const cy = height - padB - 10 - (p.tss / maxTss) * innerH * 0.28;
            const c = p.future ? 'var(--c-border-input)' : p.tss > maxTss * 0.7 ? 'var(--st-danger)' : p.tss > maxTss * 0.4 ? 'var(--c-fatigue)' : 'var(--c-accent)';
            return (
              <g key={'t' + i} className="bub" style={{ animationDelay: `${300 + (i / n) * 700}ms` }}>
                <circle cx={X(i)} cy={cy} r={r} fill={c} opacity={p.future ? 0.25 : 0.45} />
                <circle cx={X(i)} cy={cy} r={r} fill={`url(#${id}-bub)`} />
              </g>
            );
          })}
        {last && (
          <g className="fadein">
            <circle cx={X(split - 1)} cy={Y(last.ctl)} r={compact ? 3.5 : 4.5} fill="var(--c-fitness)" stroke="var(--c-bg)" strokeWidth={2} />
            <circle cx={X(split - 1)} cy={Y(last.ctl)} r={9} fill="var(--c-fitness)" opacity={0.25}>
              <animate attributeName="r" values="5;12;5" dur="2.2s" repeatCount="indefinite" />
              <animate attributeName="opacity" values=".4;0;.4" dur="2.2s" repeatCount="indefinite" />
            </circle>
          </g>
        )}
        {!compact && ticks.map((t) => <text key={t.i} x={X(t.i)} y={height - 4} textAnchor="middle">{t.label}</text>)}
        {sel && idx != null && (
          <g>
            <line x1={X(idx)} x2={X(idx)} y1={padT} y2={height - padB} stroke="var(--c-text)" strokeWidth={1} opacity={0.5} />
            <circle cx={X(idx)} cy={Y(sel.ctl)} r={4} fill="var(--c-fitness)" stroke="var(--c-bg)" strokeWidth={2} />
            <circle cx={X(idx)} cy={Y(sel.atl)} r={4} fill="var(--c-fatigue)" stroke="var(--c-bg)" strokeWidth={2} />
          </g>
        )}
      </svg>
      {sel && !compact && (
        <div className="tooltip" style={{ left: idx != null && X(idx) > w / 2 ? 8 : undefined, right: idx != null && X(idx) <= w / 2 ? 8 : undefined }}>
          <div className="b">{dayShort(sel.date)}{sel.future ? ' · previsto' : ''}</div>
          <div>
            <span className="c-fitness">CTL {sel.ctl.toFixed(0)}</span> · <span className="c-fatigue">ATL {sel.atl.toFixed(0)}</span> · <span style={{ color: tsbColor(sel.tsb) }}>TSB {sel.tsb.toFixed(0)}</span>
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
  invert?: boolean;
}

export function StreamChart({ x, series, xFmt, panelH = 70 }: { x: number[]; series: Series[]; xFmt: (v: number) => string; panelH?: number }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const n = x.length;
  const padL = 4;
  const [idx, h] = useScrub(n, padL, w - 4);
  const height = series.length * (panelH + 10) + 14;
  const step = Math.max(1, Math.floor(n / (w * 1.5)));
  const X = (i: number) => padL + (i / Math.max(1, n - 1)) * (w - padL - 4);
  const id = useMemo(() => 's' + Math.random().toString(36).slice(2, 7), []);
  return (
    <div ref={ref} className="chart-wrap">
      <ChartBubbles color={series[0]?.color} count={5} seed={7} />
      <div className="row wrap xs" style={{ minHeight: 20, gap: 10, position: 'relative' }}>
        {idx != null ? (
          <>
            <span className="b">{xFmt(x[idx])}</span>
            {series.map((s) => <span key={s.key} style={{ color: s.color, fontWeight: 700 }}>{s.data[idx] != null ? s.fmt(s.data[idx] as number) : '—'}</span>)}
          </>
        ) : (
          <Legend items={series.map((s) => ({ color: s.color, label: s.label }))} />
        )}
      </div>
      <svg className="chart" width={w} height={height} {...h} role="img" aria-label="Gráfico de la sesión">
        <defs>
          {series.map((s) => (
            <linearGradient key={s.key} id={`${id}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={0.45} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        {series.map((s, k) => {
          const vals = s.data.filter((v): v is number => v != null && isFinite(v));
          if (!vals.length) return null;
          const sorted = [...vals].sort((a, b) => a - b);
          let lo = sorted[Math.floor(sorted.length * 0.02)];
          let hi = sorted[Math.floor(sorted.length * 0.995)];
          if (hi - lo < 1e-6) (hi += 1), (lo -= 1);
          const top = k * (panelH + 10) + 4;
          const Y = (v: number) => {
            const f = (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo);
            return top + (s.invert ? f : 1 - f) * panelH;
          };
          let d = '';
          let pen = false;
          for (let i = 0; i < n; i += step) {
            const v = s.data[i];
            if (v == null) { pen = false; continue; }
            d += `${pen ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`;
            pen = true;
          }
          const fill = `${d}L${X(n - 1)},${top + panelH}L${X(0)},${top + panelH}Z`;
          return (
            <g key={s.key}>
              <rect x={0} y={top} width={w} height={panelH} fill="rgba(255,255,255,.025)" rx={10} />
              {s.key !== 'pace' && <path d={fill} fill={`url(#${id}-${s.key})`} className="fadein" />}
              <path d={d} pathLength={1} className="draw" fill="none" stroke={s.color} strokeWidth={1.6} strokeLinejoin="round" />
              <text x={w - 6} y={top + 12} textAnchor="end">{s.fmt(s.invert ? lo : hi)}</text>
              <text x={w - 6} y={top + panelH - 4} textAnchor="end">{s.fmt(s.invert ? hi : lo)}</text>
            </g>
          );
        })}
        {[0.25, 0.5, 0.75].map((f) => <text key={f} x={X(Math.round(f * (n - 1)))} y={height - 2} textAnchor="middle">{xFmt(x[Math.round(f * (n - 1))] ?? 0)}</text>)}
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
  alert?: boolean;
}

export function BarChart({ bars, height = 180, fmt = (v) => String(Math.round(v)), color = 'var(--c-accent)', onSelect }: { bars: Bar[]; height?: number; fmt?: (v: number) => string; color?: string; onSelect?: (b: Bar) => void }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [sel, setSel] = useState<number | null>(null);
  const padB = 18;
  const padT = 20;
  const max = niceMax(Math.max(1, ...bars.map((b) => Math.max(b.value, b.planned ?? 0))) * 1.05);
  const bw = (w - 8) / Math.max(1, bars.length);
  const Y = (v: number) => padT + (1 - v / max) * (height - padT - padB);
  const every = Math.ceil(bars.length / Math.max(1, Math.floor(w / 46)));
  return (
    <div ref={ref} className="chart-wrap">
      <ChartBubbles color={color} count={5} seed={11} />
      <svg className="chart" width={w} height={height} role="img" aria-label="Gráfico de barras">
        <line x1={0} x2={w} y1={Y(max / 2)} y2={Y(max / 2)} stroke="rgba(160,175,255,.10)" />
        <text x={2} y={Y(max / 2) - 3}>{fmt(max / 2)}</text>
        {bars.map((b, i) => {
          const x = 4 + i * bw + bw * 0.16;
          const bwInner = bw * 0.68;
          const r = Math.min(8, bwInner / 2);
          let acc = 0;
          return (
            <g key={b.key} onClick={() => (setSel(i), onSelect?.(b))} style={{ cursor: 'pointer' }}>
              <rect x={4 + i * bw} y={0} width={bw} height={height} fill="transparent" />
              {b.planned ? <rect x={x} y={Y(b.planned)} width={bwInner} height={Y(0) - Y(b.planned)} fill="none" stroke="var(--c-border-input)" strokeDasharray="3 3" rx={r} /> : null}
              <g className="grow" style={{ animationDelay: `${i * 35}ms` }}>
                {b.stack
                  ? b.stack.map((s, k) => {
                      const y0 = Y(acc);
                      acc += s.value;
                      return <rect key={k} x={x} y={Y(acc)} width={bwInner} height={Math.max(0, y0 - Y(acc))} rx={k === b.stack!.length - 1 ? r : 2} fill={s.color} opacity={b.highlight || sel === i ? 1 : 0.82} />;
                    })
                  : <rect x={x} y={Y(b.value)} width={bwInner} height={Math.max(0, Y(0) - Y(b.value))} rx={r} fill={color} opacity={b.highlight || sel === i ? 1 : 0.75} />}
              </g>
              {b.alert && (
                <g className="bub" style={{ animationDelay: `${600 + i * 35}ms` }}>
                  <rect x={x - 2} y={Y(b.value) - 2} width={bwInner + 4} height={Y(0) - Y(b.value) + 4} rx={r + 2} fill="none" stroke="var(--st-danger)" strokeWidth={2} />
                  <circle cx={x + bwInner / 2} cy={Y(b.value) - 9} r={6} fill="var(--st-danger)" />
                  <text x={x + bwInner / 2} y={Y(b.value) - 6} textAnchor="middle" style={{ fill: '#fff', fontWeight: 800, fontSize: 9 }}>!</text>
                </g>
              )}
              {(sel === i || (sel == null && b.highlight)) && b.value > 0 && !b.alert && (
                <text x={x + bwInner / 2} y={Y(Math.max(b.value, b.planned ?? 0)) - 5} textAnchor="middle" style={{ fill: 'var(--c-text)', fontWeight: 700 }}>{fmt(b.value)}</text>
              )}
              {i % every === 0 && <text x={x + bwInner / 2} y={height - 4} textAnchor="middle">{b.label}</text>}
            </g>
          );
        })}
      </svg>
      {sel != null && bars[sel] && (
        <div className="xs" style={{ position: 'relative' }}>
          <b>{bars[sel].label}</b>: {fmt(bars[sel].value)}{bars[sel].planned ? ` / plan ${fmt(bars[sel].planned!)}` : ''}{bars[sel].alert ? <span className="c-danger"> · salto de carga brusco</span> : null}
        </div>
      )}
    </div>
  );
}

// ---------- Zones ----------
export const ZONE_COLORS = ['#8a95c9', '#4cc3ff', '#34e0a1', '#ffd45e', '#ffb547', '#ff5c6c', '#d36bff'];

export function ZoneBars({ names, seconds }: { names: string[]; seconds: number[] }) {
  const total = seconds.reduce((a, b) => a + b, 0) || 1;
  const max = Math.max(...seconds, 1);
  return (
    <div className="stack" style={{ gap: 8 }}>
      {names.map((n, i) => {
        const c = ZONE_COLORS[Math.min(i, ZONE_COLORS.length - 1)];
        return (
          <div className="zone-row" key={n}>
            <span className="ellipsis">{n}</span>
            <div className="track" aria-hidden>
              <div className="fill" style={{ width: `${(seconds[i] / max) * 100}%`, background: `linear-gradient(90deg, ${c}99, ${c})`, color: c, animationDelay: `${i * 70}ms` }} />
            </div>
            <span className="tnum" style={{ textAlign: 'right' }} title={fmtDur(seconds[i])}>
              <b>{Math.round((seconds[i] / total) * 100)}%</b> <span className="muted">{fmtDur(seconds[i], true)}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------- Peak curve ----------
export function PeakCurve({ series, fmtY, height = 210 }: { series: { label: string; color: string; points: [number, number][] }[]; fmtY: (v: number) => string; height?: number }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const all = series.flatMap((s) => s.points);
  if (!all.length) return <div ref={ref} className="muted sm">Sin datos de picos todavía.</div>;
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  const lx0 = Math.log(Math.min(...xs));
  const lx1 = Math.log(Math.max(...xs));
  const y0 = Math.min(...ys) * 0.92;
  const y1 = Math.max(...ys) * 1.04;
  const padL = 40;
  const padB = 18;
  const X = (v: number) => padL + ((Math.log(v) - lx0) / Math.max(1e-6, lx1 - lx0)) * (w - padL - 10);
  const Y = (v: number) => 8 + (1 - (v - y0) / Math.max(1e-6, y1 - y0)) * (height - 8 - padB);
  const lbl = (s: number) => (s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : `${s / 3600}h`);
  return (
    <div ref={ref} className="chart-wrap">
      <ChartBubbles color={series[series.length - 1]?.color} count={5} seed={5} />
      <svg className="chart" width={w} height={height} role="img" aria-label="Curva de mejores marcas">
        {[0, 0.5, 1].map((f) => {
          const v = y0 + (y1 - y0) * f;
          return (
            <g key={f}>
              <line x1={padL} x2={w} y1={Y(v)} y2={Y(v)} stroke="rgba(160,175,255,.10)" />
              <text x={padL - 4} y={Y(v) + 3} textAnchor="end">{fmtY(v)}</text>
            </g>
          );
        })}
        {[...new Set(xs)].sort((a, b) => a - b).map((d) => <text key={d} x={X(d)} y={height - 4} textAnchor="middle">{lbl(d)}</text>)}
        {series.map((s, k) => (
          <g key={s.label}>
            <path d={s.points.map((p, i) => `${i ? 'L' : 'M'}${X(p[0])},${Y(p[1])}`).join('')} pathLength={1} className={`draw d${k + 1}`} fill="none" stroke={s.color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
            {s.points.map((p, i) => (
              <g key={p[0]} className="bub" style={{ animationDelay: `${400 + i * 60}ms` }}>
                <circle cx={X(p[0])} cy={Y(p[1])} r={7} fill={s.color} opacity={0.18} />
                <circle cx={X(p[0])} cy={Y(p[1])} r={3.2} fill={s.color} />
              </g>
            ))}
          </g>
        ))}
      </svg>
      {series.length > 1 && <Legend items={series.map((s) => ({ color: s.color, label: s.label }))} />}
    </div>
  );
}

// ---------- Route ----------
export function RouteMap({ lat, lng, height = 220 }: { lat: (number | null)[]; lng: (number | null)[]; height?: number }) {
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
  const s = Math.min((w - 24) / sx, (height - 24) / sy);
  const ox = (w - sx * s) / 2;
  const oy = (height - sy * s) / 2;
  const P = (p: [number, number]) => [ox + (p[1] - minLo) * k * s, oy + (maxLa - p[0]) * s];
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${P(p)[0].toFixed(1)},${P(p)[1].toFixed(1)}`).join('');
  const a = P(pts[0]);
  const b = P(pts[pts.length - 1]);
  return (
    <div ref={ref} className="chart-wrap">
      <ChartBubbles color="var(--c-accent-2)" count={6} seed={9} />
      <svg className="chart" width={w} height={height} role="img" aria-label="Recorrido">
        <defs>
          <linearGradient id="route-g" x1="0" x2="1">
            <stop offset="0%" stopColor="var(--c-accent-2)" />
            <stop offset="100%" stopColor="var(--c-accent)" />
          </linearGradient>
        </defs>
        <path d={d} fill="none" stroke="url(#route-g)" strokeWidth={9} opacity={0.18} strokeLinejoin="round" strokeLinecap="round" />
        <path d={d} pathLength={1} className="draw" fill="none" stroke="url(#route-g)" strokeWidth={3.5} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={a[0]} cy={a[1]} r={6} fill="var(--c-success)" stroke="var(--c-bg)" strokeWidth={2} />
        <circle cx={b[0]} cy={b[1]} r={6} fill="var(--c-danger)" stroke="var(--c-bg)" strokeWidth={2} />
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
  const Y = (x: number) => 4 + (1 - (x - lo) / (hi - lo || 1)) * (height - 8);
  let d = '';
  let pen = false;
  let lastI = 0;
  values.forEach((x, i) => {
    if (x == null) return (pen = false);
    d += `${pen ? 'L' : 'M'}${X(i).toFixed(1)},${Y(x).toFixed(1)}`;
    pen = true;
    lastI = i;
  });
  return (
    <div ref={ref}>
      <svg width={w} height={height} className="chart" aria-hidden>
        <path d={d} pathLength={1} className="draw" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={X(lastI)} cy={Y(values[lastI] as number)} r={3} fill={color} />
      </svg>
    </div>
  );
}

export function Legend({ items }: { items: { color: string; label: ReactNode }[] }) {
  return (
    <div className="legend">
      {items.map((it, i) => (
        <span key={i}><i className="dot" style={{ background: it.color, boxShadow: `0 0 8px ${it.color}` }} />{it.label}</span>
      ))}
    </div>
  );
}
