/**
 * Estimate thresholds from past training so a new user gets sensible zones on day one.
 * Uses stream peaks when available (FIT/GPX/TCX) and falls back to activity summaries (CSV).
 */
import type { Activity, DayMetric, Thresholds } from './types';
import { addDays, fmtPace, today } from './format';

export interface Suggestion {
  key: keyof Thresholds;
  value: number;
  label: string;
  display: string;
  evidence: string;
  confidence: 'alta' | 'media' | 'baja';
}

const riegelSpeed60 = (speed: number, sec: number) => speed * Math.pow(sec / 3600, 0.0566);
const powerTo60 = (p: number, sec: number) => p * Math.pow(sec / 3600, 0.07);

function topWithSpikeGuard(values: { v: number; a: Activity }[], guard: number) {
  const s = [...values].sort((x, y) => y.v - x.v);
  if (s.length >= 2 && s[0].v - s[1].v > guard) return s[1];
  return s[0];
}

export function detectThresholds(acts: Activity[], metrics: DayMetric[], windowDays = 120): Suggestion[] {
  const since = addDays(today(), -windowDays);
  let recent = acts.filter((a) => a.date >= since);
  if (recent.length < 8) recent = acts.filter((a) => a.date >= addDays(today(), -365));
  const out: Suggestion[] = [];
  const name = (a: Activity) => `«${a.name}» (${a.date})`;

  // Max HR
  const maxes = acts
    .filter((a) => a.date >= addDays(today(), -540))
    .map((a) => ({ v: a.maxHr ?? 0, a }))
    .filter((x) => x.v > 120 && x.v < 225);
  const maxHr = topWithSpikeGuard(maxes, 8);
  if (maxHr) out.push({ key: 'maxHr', value: Math.round(maxHr.v), label: 'FC máxima', display: `${Math.round(maxHr.v)} ppm`, evidence: `Máximo registrado en ${name(maxHr.a)}`, confidence: maxes.length > 20 ? 'alta' : 'media' });

  // Resting HR (median of last 30 logged days)
  const rest = metrics.filter((m) => m.restHr && m.date >= addDays(today(), -30)).map((m) => m.restHr as number).sort((a, b) => a - b);
  if (rest.length) {
    const med = rest[Math.floor(rest.length / 2)];
    out.push({ key: 'restHr', value: med, label: 'FC en reposo', display: `${med} ppm`, evidence: `Mediana de ${rest.length} días registrados`, confidence: rest.length > 7 ? 'alta' : 'media' });
  }

  // Weight
  const w = metrics.filter((m) => m.weight).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  if (w?.weight) out.push({ key: 'weight', value: w.weight, label: 'Peso', display: `${w.weight} kg`, evidence: `Último registro (${w.date})`, confidence: 'alta' });

  // LTHR per sport
  for (const sport of ['run', 'bike'] as const) {
    const list = recent.filter((a) => a.sport === sport);
    const fromPeaks = list
      .map((a) => {
        const p = a.peaks?.hr;
        if (!p) return undefined;
        const c = [p['3600'], p['1800'] ? p['1800'] * 0.98 : undefined, p['1200'] ? p['1200'] * 0.95 : undefined].filter(Boolean) as number[];
        return c.length ? { v: Math.max(...c), a } : undefined;
      })
      .filter(Boolean) as { v: number; a: Activity }[];
    const fromSummary = list
      .filter((a) => a.avgHr && a.duration >= 20 * 60 && a.duration <= 100 * 60)
      .map((a) => ({ v: (a.avgHr as number) * (a.duration >= 45 * 60 ? 1.02 : 1.0), a }));
    const best = topWithSpikeGuard(fromPeaks.length ? fromPeaks : fromSummary, 6);
    let v = best?.v;
    const cap = maxHr ? maxHr.v * 0.95 : undefined;
    if (v && cap) v = Math.min(v, cap);
    if (!v && maxHr) v = maxHr.v * (sport === 'run' ? 0.89 : 0.86);
    if (v) {
      out.push({
        key: sport === 'run' ? 'lthrRun' : 'lthrBike',
        value: Math.round(v),
        label: sport === 'run' ? 'FC umbral carrera (LTHR)' : 'FC umbral ciclismo (LTHR)',
        display: `${Math.round(v)} ppm`,
        evidence: best
          ? fromPeaks.length
            ? `Mejor FC sostenida 20–60 min en ${name(best.a)}`
            : `FC media más alta en sesiones de 20–100 min: ${name(best.a)}`
          : '% de la FC máxima (sin sesiones adecuadas)',
        confidence: fromPeaks.length ? 'alta' : best ? 'media' : 'baja',
      });
    }
  }

  // Threshold run pace
  const runs = recent.filter((a) => a.sport === 'run' && a.distance && a.duration >= 12 * 60 && a.distance >= 3000);
  const paceCands: { v: number; a: Activity }[] = [];
  for (const a of runs) {
    const dt = a.peaks?.distTime;
    if (dt) {
      for (const [d, s] of Object.entries(dt)) if (Number(d) >= 3000) paceCands.push({ v: riegelSpeed60(Number(d) / s, s), a });
    }
    const sp = a.peaks?.speed;
    if (sp?.['1200']) paceCands.push({ v: riegelSpeed60(sp['1200'], 1200), a });
    const avg = (a.distance as number) / a.duration;
    paceCands.push({ v: riegelSpeed60(avg, a.duration), a });
  }
  const bestPace = topWithSpikeGuard(paceCands.filter((c) => c.v < 7), 0.25);
  if (bestPace) {
    out.push({ key: 'runPace', value: Math.round(bestPace.v * 1000) / 1000, label: 'Ritmo umbral carrera', display: `${fmtPace(bestPace.v)} /km`, evidence: `Proyección a 60 min del mejor esfuerzo: ${name(bestPace.a)}. Si no has corrido fuerte últimamente, ajústalo a mano.`, confidence: runs.some((r) => r.peaks?.distTime) ? 'media' : 'baja' });
  }

  // FTP
  const rides = recent.filter((a) => a.sport === 'bike');
  const ftpCands: { v: number; a: Activity }[] = [];
  for (const a of rides) {
    const p = a.peaks?.power;
    if (p) {
      if (p['1200']) ftpCands.push({ v: p['1200'] * 0.95, a });
      if (p['3600']) ftpCands.push({ v: p['3600'], a });
      if (p['480']) ftpCands.push({ v: p['480'] * 0.9, a });
    }
    const pw = a.np ?? a.avgPower;
    if (pw && a.duration >= 20 * 60) ftpCands.push({ v: powerTo60(pw, a.duration) * (a.np ? 1 : 0.97), a });
  }
  const ftp = topWithSpikeGuard(ftpCands, 25);
  if (ftp) out.push({ key: 'ftp', value: Math.round(ftp.v), label: 'FTP ciclismo', display: `${Math.round(ftp.v)} W`, evidence: `Mejor potencia sostenida (20–60 min) en ${name(ftp.a)}`, confidence: rides.some((r) => r.peaks?.power) ? 'alta' : 'media' });

  // CSS swim
  const swims = recent.filter((a) => a.sport === 'swim' && a.distance && a.duration >= 10 * 60);
  const css = topWithSpikeGuard(swims.map((a) => ({ v: ((a.distance as number) / a.duration) * Math.pow(a.duration / 1800, 0.05), a })), 0.15);
  if (css) out.push({ key: 'swimPace', value: Math.round(css.v * 1000) / 1000, label: 'Ritmo umbral natación (CSS)', display: `${fmtPace(css.v, 100)} /100m`, evidence: `Mejor ritmo medio sostenido: ${name(css.a)}`, confidence: 'baja' });

  return out;
}
