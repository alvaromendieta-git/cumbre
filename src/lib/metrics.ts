/**
 * Training-load maths. All formulas are the public, widely published ones
 * (Coggan NP/IF/TSS, Banister TRIMP, exponentially weighted CTL/ATL, Friel zones).
 */
import type { Activity, Peaks, Planned, Sport, Streams, Thresholds, TssMethod } from './types';
import { addDays, dayKey, today } from './format';

// ---------- streams -> 1 Hz ----------

export interface Sec {
  n: number;
  hr: (number | null)[];
  power: (number | null)[];
  speed: (number | null)[];
  alt: (number | null)[];
  dist: (number | null)[];
}

/** Resample to one value per second, forward-filling gaps up to `maxGap` seconds (longer gaps = paused). */
export function toSeconds(s: Streams, maxGap = 10): Sec {
  const last = s.t.length ? Math.round(s.t[s.t.length - 1]) : 0;
  const n = Math.min(last + 1, 60 * 60 * 30);
  const mk = () => new Array<number | null>(n).fill(null);
  const out: Sec = { n, hr: mk(), power: mk(), speed: mk(), alt: mk(), dist: mk() };
  const keys = ['hr', 'power', 'speed', 'alt', 'dist'] as const;
  for (let i = 0; i < s.t.length; i++) {
    const t0 = Math.round(s.t[i]);
    const t1 = i + 1 < s.t.length ? Math.round(s.t[i + 1]) : t0 + 1;
    const span = t1 - t0 > maxGap ? 1 : Math.max(1, t1 - t0);
    for (const k of keys) {
      const arr = s[k];
      const v = arr?.[i];
      if (v == null || !isFinite(v)) continue;
      for (let j = 0; j < span && t0 + j < n; j++) out[k][t0 + j] = v;
    }
  }
  // derive speed from distance if missing
  if (!out.speed.some((v) => v != null) && out.dist.some((v) => v != null)) {
    for (let i = 5; i < n; i++) {
      const a = out.dist[i - 5];
      const b = out.dist[i];
      if (a != null && b != null) out.speed[i] = Math.max(0, (b - a) / 5);
    }
  }
  return out;
}

function rolling(arr: (number | null)[], w: number): number[] {
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    sum += arr[i] ?? 0;
    if (i >= w) sum -= arr[i - w] ?? 0;
    if (i >= w - 1) out.push(sum / w);
  }
  return out;
}

export function normalizedPower(p: (number | null)[]): number | undefined {
  if (p.filter((v) => v != null).length < 60) return undefined;
  const r = rolling(p, 30);
  if (!r.length) return undefined;
  const m4 = r.reduce((a, v) => a + v ** 4, 0) / r.length;
  return m4 ** 0.25;
}

/** Normalized graded speed: grade-adjusted speed, 30 s rolling, 4th-power mean. */
export function normalizedGradedSpeed(sec: Sec): number | undefined {
  const { speed, alt, dist } = sec;
  if (speed.filter((v) => v != null).length < 120) return undefined;
  const gap: (number | null)[] = speed.map((v, i) => {
    if (v == null) return null;
    const j = i - 10;
    if (j < 0 || alt[i] == null || alt[j] == null || dist[i] == null || dist[j] == null) return v;
    const dd = (dist[i] as number) - (dist[j] as number);
    if (dd < 5) return v;
    const g = Math.max(-0.3, Math.min(0.3, ((alt[i] as number) - (alt[j] as number)) / dd));
    // approx. metabolic cost factor of running on a grade (uphill costs more, gentle downhill less)
    const f = g >= 0 ? 1 + 3.3 * g : 1 + 1.8 * g + 6 * g * g;
    return v * f;
  });
  const r = rolling(gap, 30);
  const m4 = r.reduce((a, v) => a + v ** 4, 0) / r.length;
  return m4 ** 0.25;
}

/** Best average over each window duration. Windows with too many gaps are ignored. */
export function meanMax(arr: (number | null)[], durations: number[], zeroFill = false): Record<string, number> {
  const n = arr.length;
  const pre = new Float64Array(n + 1);
  const cnt = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) {
    const v = arr[i];
    pre[i + 1] = pre[i] + (v ?? 0);
    cnt[i + 1] = cnt[i] + (v != null ? 1 : 0);
  }
  const out: Record<string, number> = {};
  for (const d of durations) {
    if (d > n) continue;
    let best = 0;
    for (let i = d; i <= n; i++) {
      const c = cnt[i] - cnt[i - d];
      if (!zeroFill && c < d * 0.9) continue;
      const avg = (pre[i] - pre[i - d]) / (zeroFill ? d : c);
      if (avg > best) best = avg;
    }
    if (best > 0) out[d] = Math.round(best * 100) / 100;
  }
  return out;
}

/** Fastest time over each distance using the distance stream. */
export function bestDistanceTimes(sec: Sec, distances: number[]): Record<string, number> {
  const t: number[] = [];
  const d: number[] = [];
  sec.dist.forEach((v, i) => {
    if (v != null) {
      t.push(i);
      d.push(v);
    }
  });
  const out: Record<string, number> = {};
  if (!d.length) return out;
  const total = d[d.length - 1] - d[0];
  for (const D of distances) {
    if (D > total) continue;
    let best = Infinity;
    let i = 0;
    for (let j = 0; j < d.length; j++) {
      while (i < j && d[j] - d[i + 1] >= D) i++;
      if (d[j] - d[i] >= D) best = Math.min(best, t[j] - t[i]);
    }
    if (isFinite(best) && best > 0) out[D] = best;
  }
  return out;
}

export const PEAK_DURATIONS = [5, 15, 30, 60, 180, 300, 600, 1200, 1800, 3600, 5400, 7200];
export const PEAK_DISTANCES = [400, 1000, 1609, 5000, 10000, 21097, 42195];

function hist(arr: (number | null)[], bin: number): Record<string, number> | undefined {
  const h: Record<string, number> = {};
  let any = false;
  for (const v of arr) {
    if (v == null || v <= 0) continue;
    const k = String(Math.floor(v / bin) * bin);
    h[k] = (h[k] ?? 0) + 1;
    any = true;
  }
  return any ? h : undefined;
}

/** Everything derived from streams that does not depend on thresholds. */
export function analyzeStreams(s: Streams, sport: Sport) {
  const sec = toSeconds(s);
  const hasP = sec.power.some((v) => v != null && v > 0);
  const hasHr = sec.hr.some((v) => v != null && v > 0);
  const hasSp = sec.speed.some((v) => v != null && v > 0);
  const peaks: Peaks = {};
  if (hasP) peaks.power = meanMax(sec.power, PEAK_DURATIONS, true);
  if (hasHr) peaks.hr = meanMax(sec.hr, PEAK_DURATIONS);
  if (hasSp) peaks.speed = meanMax(sec.speed, PEAK_DURATIONS);
  if (sport === 'run' || sport === 'walk') peaks.distTime = bestDistanceTimes(sec, PEAK_DISTANCES);
  return {
    np: hasP ? normalizedPower(sec.power) : undefined,
    ngp: sport === 'run' && hasSp ? normalizedGradedSpeed(sec) : undefined,
    peaks,
    hist: {
      hr: hasHr ? hist(sec.hr, 1) : undefined,
      power: hasP ? hist(sec.power, 5) : undefined,
      speed: hasSp ? hist(sec.speed, 0.05) : undefined,
    },
  };
}

// ---------- zones ----------

export interface Zone {
  name: string;
  lo: number; // fraction of threshold (inclusive)
  hi: number; // exclusive
}

export const POWER_ZONES: Zone[] = [
  { name: 'Z1 Recuperación', lo: 0, hi: 0.56 },
  { name: 'Z2 Resistencia', lo: 0.56, hi: 0.76 },
  { name: 'Z3 Tempo', lo: 0.76, hi: 0.91 },
  { name: 'Z4 Umbral', lo: 0.91, hi: 1.06 },
  { name: 'Z5 VO2máx', lo: 1.06, hi: 1.21 },
  { name: 'Z6 Anaeróbico', lo: 1.21, hi: 1.51 },
  { name: 'Z7 Neuromuscular', lo: 1.51, hi: 99 },
];

export const HR_ZONES_RUN: Zone[] = [
  { name: 'Z1 Recuperación', lo: 0, hi: 0.85 },
  { name: 'Z2 Aeróbico', lo: 0.85, hi: 0.9 },
  { name: 'Z3 Tempo', lo: 0.9, hi: 0.95 },
  { name: 'Z4 Subumbral', lo: 0.95, hi: 1.0 },
  { name: 'Z5a Supraumbral', lo: 1.0, hi: 1.03 },
  { name: 'Z5b Capacidad aeróbica', lo: 1.03, hi: 1.07 },
  { name: 'Z5c Anaeróbico', lo: 1.07, hi: 9 },
];

export const HR_ZONES_BIKE: Zone[] = [
  { name: 'Z1 Recuperación', lo: 0, hi: 0.81 },
  { name: 'Z2 Aeróbico', lo: 0.81, hi: 0.9 },
  { name: 'Z3 Tempo', lo: 0.9, hi: 0.94 },
  { name: 'Z4 Subumbral', lo: 0.94, hi: 1.0 },
  { name: 'Z5a Supraumbral', lo: 1.0, hi: 1.03 },
  { name: 'Z5b Capacidad aeróbica', lo: 1.03, hi: 1.07 },
  { name: 'Z5c Anaeróbico', lo: 1.07, hi: 9 },
];

/** Run pace zones as a fraction of threshold SPEED. */
export const PACE_ZONES: Zone[] = [
  { name: 'Z1 Recuperación', lo: 0, hi: 0.775 },
  { name: 'Z2 Aeróbico', lo: 0.775, hi: 0.877 },
  { name: 'Z3 Tempo', lo: 0.877, hi: 0.943 },
  { name: 'Z4 Subumbral', lo: 0.943, hi: 1.0 },
  { name: 'Z5a Supraumbral', lo: 1.0, hi: 1.031 },
  { name: 'Z5b Capacidad aeróbica', lo: 1.031, hi: 1.111 },
  { name: 'Z5c Anaeróbico', lo: 1.111, hi: 9 },
];

export const SWIM_ZONES: Zone[] = [
  { name: 'Z1 Recuperación', lo: 0, hi: 0.8 },
  { name: 'Z2 Aeróbico', lo: 0.8, hi: 0.9 },
  { name: 'Z3 Tempo', lo: 0.9, hi: 0.97 },
  { name: 'Z4 Umbral', lo: 0.97, hi: 1.03 },
  { name: 'Z5 VO2máx', lo: 1.03, hi: 1.1 },
  { name: 'Z6 Velocidad', lo: 1.1, hi: 9 },
];

export const lthrFor = (sport: Sport, t: Thresholds) =>
  sport === 'bike' ? t.lthrBike ?? (t.lthrRun ? t.lthrRun - 6 : undefined) : t.lthrRun ?? (t.lthrBike ? t.lthrBike + 6 : undefined);

export const hrZonesFor = (sport: Sport) => (sport === 'bike' ? HR_ZONES_BIKE : HR_ZONES_RUN);

/** Seconds per zone from a histogram. */
export function zoneSeconds(h: Record<string, number> | undefined, zones: Zone[], threshold?: number, binOffset = 0): number[] | undefined {
  if (!h || !threshold) return undefined;
  const out = zones.map(() => 0);
  for (const [k, sec] of Object.entries(h)) {
    const f = (Number(k) + binOffset) / threshold;
    const i = zones.findIndex((z) => f >= z.lo && f < z.hi);
    if (i >= 0) out[i] += sec;
  }
  return out;
}

export function activityZones(a: Activity, t: Thresholds) {
  return {
    hr: zoneSeconds(a.hist?.hr, hrZonesFor(a.sport), lthrFor(a.sport, t), 0.5),
    power: a.sport === 'bike' ? zoneSeconds(a.hist?.power, POWER_ZONES, t.ftp, 2.5) : undefined,
    pace:
      a.sport === 'run'
        ? zoneSeconds(a.hist?.speed, PACE_ZONES, t.runPace, 0.025)
        : a.sport === 'swim'
          ? zoneSeconds(a.hist?.speed, SWIM_ZONES, t.swimPace, 0.025)
          : undefined,
  };
}

// ---------- TSS ----------

function trimpFactor(hrr: number) {
  return hrr * 0.64 * Math.exp(1.92 * hrr);
}

function hrTss(a: Activity, t: Thresholds): number | undefined {
  const lthr = lthrFor(a.sport, t);
  if (!lthr) return undefined;
  const max = t.maxHr ?? Math.round(lthr / 0.9);
  const rest = t.restHr ?? 50;
  if (max <= rest) return undefined;
  const ref = trimpFactor((lthr - rest) / (max - rest)) * 60; // one hour at LTHR
  let trimp = 0;
  if (a.hist?.hr) {
    for (const [k, sec] of Object.entries(a.hist.hr)) {
      const hrr = Math.max(0, Math.min(1.1, (Number(k) + 0.5 - rest) / (max - rest)));
      trimp += trimpFactor(hrr) * (sec / 60);
    }
  } else if (a.avgHr) {
    const hrr = Math.max(0, Math.min(1.1, (a.avgHr - rest) / (max - rest)));
    trimp = trimpFactor(hrr) * (a.duration / 60);
  } else return undefined;
  return (trimp / ref) * 100;
}

const RPE_IF = [0, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.87, 0.95, 1.05];

export function computeTss(a: Activity, t: Thresholds): { tss?: number; method: TssMethod; intensity?: number } {
  const h = a.duration / 3600;
  if (h <= 0) return { method: 'none' };
  // power
  const p = a.np ?? a.avgPower;
  if (a.sport === 'bike' && t.ftp && p) {
    const IF = p / t.ftp;
    return { tss: h * IF * IF * 100, method: 'power', intensity: IF };
  }
  // pace (run)
  const spd = a.ngp ?? a.avgSpeed ?? (a.distance ? a.distance / a.duration : undefined);
  if (a.sport === 'run' && t.runPace && spd && spd > 1.2) {
    const IF = spd / t.runPace;
    const pace = h * IF * IF * 100;
    // Summary-only runs: average pace hides intervals, so let heart rate win if it says it was harder.
    if (!a.ngp && (a.hist?.hr || a.avgHr)) {
      const hr = hrTss(a, t);
      if (hr != null && hr > pace) return { tss: hr, method: 'hr', intensity: Math.sqrt(hr / 100 / h) };
    }
    return { tss: pace, method: 'pace', intensity: IF };
  }
  // swim
  if (a.sport === 'swim' && t.swimPace && spd) {
    const IF = spd / t.swimPace;
    return { tss: h * IF ** 3 * 100, method: 'swim', intensity: IF };
  }
  // heart rate
  const hr = hrTss(a, t);
  if (a.sport === 'strength' && !a.fileTss) {
    // HR under-reads strength work; never go below a moderate RPE estimate.
    const IFr = RPE_IF[Math.max(1, Math.min(10, Math.round(a.rpe ?? 4)))];
    const byRpe = h * IFr * IFr * 100;
    if (hr == null || byRpe >= hr) return { tss: byRpe, method: 'rpe', intensity: IFr };
  }
  if (hr != null && (a.hist?.hr || a.avgHr)) {
    return { tss: hr, method: 'hr', intensity: Math.sqrt(hr / 100 / h) };
  }
  if (a.fileTss != null) return { tss: a.fileTss, method: 'file' };
  // RPE fallback (default moderate)
  const rpe = a.rpe ?? (a.sport === 'strength' ? 5 : 4);
  const IF = RPE_IF[Math.max(1, Math.min(10, Math.round(rpe)))];
  return { tss: h * IF * IF * 100, method: 'rpe', intensity: IF };
}

export function withTss(a: Activity, t: Thresholds): Activity {
  const r = computeTss(a, t);
  return { ...a, tss: r.tss != null ? Math.round(r.tss) : undefined, tssMethod: r.method, intensity: r.intensity != null ? Math.round(r.intensity * 100) / 100 : undefined };
}

export const TSS_LABEL: Record<TssMethod, string> = {
  power: 'TSS',
  pace: 'rTSS',
  hr: 'hrTSS',
  swim: 'sTSS',
  rpe: 'TSS (RPE)',
  manual: 'TSS',
  file: 'TSS',
  none: 'TSS',
};

/** Estimated TSS of a structured workout (steps intensity = fraction of threshold). */
export function stepsTss(steps: { duration: number; intensity: number; repeat?: number; rest?: { duration: number; intensity: number } }[]) {
  let tss = 0;
  let dur = 0;
  for (const s of steps) {
    const r = s.repeat ?? 1;
    tss += r * (s.duration / 3600) * s.intensity * s.intensity * 100;
    dur += r * s.duration;
    if (s.rest && r > 0) {
      tss += r * (s.rest.duration / 3600) * s.rest.intensity * s.rest.intensity * 100;
      dur += r * s.rest.duration;
    }
  }
  return { tss: Math.round(tss), duration: dur };
}

// ---------- performance management ----------

export interface PmcPoint {
  date: string;
  tss: number;
  ctl: number;
  atl: number;
  tsb: number;
  future?: boolean;
}

export function dailyTss(acts: Activity[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const a of acts) m.set(a.date, (m.get(a.date) ?? 0) + (a.tss ?? 0));
  return m;
}

export function buildPmc(acts: Activity[], planned: Planned[], opts: { ctlDays?: number; atlDays?: number; until?: string } = {}): PmcPoint[] {
  const ctlD = opts.ctlDays ?? 42;
  const atlD = opts.atlDays ?? 7;
  const daily = dailyTss(acts);
  const t = today();
  const plan = new Map<string, number>();
  for (const p of planned) if (p.date >= t && p.tss) plan.set(p.date, (plan.get(p.date) ?? 0) + p.tss);
  const dates = [...daily.keys()].sort();
  if (!dates.length && !plan.size) return [];
  const start = dates[0] ?? t;
  const lastPlan = [...plan.keys()].sort().pop();
  const end = opts.until ?? (lastPlan && lastPlan > t ? lastPlan : t);
  const out: PmcPoint[] = [];
  let ctl = 0;
  let atl = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const done = daily.get(d) ?? 0;
    const future = d > t;
    const tss = future ? plan.get(d) ?? 0 : done;
    const tsb = ctl - atl; // form = yesterday's fitness minus yesterday's fatigue
    ctl = ctl + (tss - ctl) / ctlD;
    atl = atl + (tss - atl) / atlD;
    out.push({ date: d, tss, ctl, atl, tsb, future });
  }
  return out;
}

export function pmcAt(pmc: PmcPoint[], date = today()): PmcPoint | undefined {
  for (let i = pmc.length - 1; i >= 0; i--) if (pmc[i].date <= date) return pmc[i];
  return undefined;
}

/** CTL change over the last 7 days. */
export function rampRate(pmc: PmcPoint[], date = today()): number | undefined {
  const now = pmcAt(pmc, date);
  const before = pmcAt(pmc, addDays(date, -7));
  if (!now || !before) return undefined;
  return now.ctl - before.ctl;
}

export function formLabel(tsb: number): { text: string; tone: 'success' | 'warning' | 'danger' | 'fitness' | 'muted' } {
  if (tsb > 25) return { text: 'Muy fresco · riesgo de perder forma', tone: 'warning' };
  if (tsb > 5) return { text: 'Fresco · listo para competir', tone: 'success' };
  if (tsb > -10) return { text: 'Neutro · mantenimiento', tone: 'muted' };
  if (tsb > -30) return { text: 'Productivo · construyendo forma', tone: 'fitness' };
  return { text: 'Fatiga alta · vigila la recuperación', tone: 'danger' };
}

// ---------- compliance ----------

export type Compliance = 'done' | 'partial' | 'off' | 'missed' | 'pending' | 'unplanned';

export function compliance(p: Planned | undefined, a: Activity | undefined): Compliance {
  if (!p) return 'unplanned';
  if (!a) return p.date < today() ? 'missed' : 'pending';
  const ratios: number[] = [];
  if (p.tss && a.tss) ratios.push(a.tss / p.tss);
  else if (p.duration) ratios.push(a.duration / p.duration);
  else if (p.distance && a.distance) ratios.push(a.distance / p.distance);
  if (!ratios.length) return 'done';
  const r = ratios[0];
  if (r >= 0.8 && r <= 1.2) return 'done';
  if (r >= 0.5 && r <= 1.5) return 'partial';
  return 'off';
}

export const COMPLIANCE_LABEL: Record<Compliance, string> = {
  done: 'Cumplido',
  partial: 'Parcial',
  off: 'Desviado',
  missed: 'No realizado',
  pending: 'Pendiente',
  unplanned: 'No planificado',
};

/** Pair planned workouts with activities on the same day and sport. */
export function matchPlanned(acts: Activity[], planned: Planned[]) {
  const used = new Set<string>();
  const pairs = new Map<string, Activity>(); // planned id -> activity
  for (const p of planned) {
    const explicit = acts.find((a) => a.plannedId === p.id);
    const cand = explicit ?? acts.find((a) => !used.has(a.id) && a.date === p.date && a.sport === p.sport);
    if (cand) {
      used.add(cand.id);
      pairs.set(p.id, cand);
    }
  }
  return { pairs, used };
}

export function weekKeyOf(date: string, weekStart: 0 | 1) {
  const d = new Date(date + 'T12:00:00');
  const dow = d.getDay();
  const back = (dow - weekStart + 7) % 7;
  d.setDate(d.getDate() - back);
  return dayKey(d);
}
