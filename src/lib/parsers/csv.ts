/**
 * CSV import. Recognises (by column names) activity exports from Strava (activities.csv),
 * TrainingPeaks (workouts export), Garmin Connect and a generic layout, plus daily-metric exports.
 */
import type { DayMetric } from '../types';
import { type Parsed, sportFrom } from './common';
import { dayKey } from '../format';

export function splitCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  const sep = detectSep(text);
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') (cell += '"'), i++;
        else q = false;
      } else cell += c;
    } else if (c === '"') q = true;
    else if (c === sep) row.push(cell), (cell = '');
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

function detectSep(text: string) {
  const head = text.slice(0, text.indexOf('\n') > 0 ? text.indexOf('\n') : 500);
  const c = (s: string) => head.split(s).length;
  return c(';') > c(',') ? ';' : c('\t') > c(',') ? '\t' : ',';
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

class Cols {
  idx = new Map<string, number[]>();
  constructor(public header: string[]) {
    header.forEach((h, i) => {
      const k = norm(h);
      this.idx.set(k, [...(this.idx.get(k) ?? []), i]);
    });
  }
  /** first matching column (or last occurrence when `last`) */
  get(row: string[], names: string[], last = false): string | undefined {
    for (const n of names) {
      const ix = this.idx.get(norm(n));
      if (ix?.length) {
        const v = row[last ? ix[ix.length - 1] : ix[0]];
        if (v != null && v.trim() !== '') return v.trim();
      }
    }
    return undefined;
  }
  has(names: string[]) {
    return names.some((n) => this.idx.has(norm(n)));
  }
}

const toNum = (v?: string) => {
  if (v == null) return undefined;
  const s = v.replace(/\s/g, '');
  const n = parseFloat(/^\d{1,3}(\.\d{3})*,\d+$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,(?=\d{3}\b)/g, '').replace(',', '.'));
  return isFinite(n) ? n : undefined;
};

/** "1:02:03", "62:03", "3723" (s) */
const toSec = (v?: string) => {
  if (!v) return undefined;
  if (v.includes(':')) {
    const p = v.split(':').map((x) => parseFloat(x));
    if (p.some(isNaN)) return undefined;
    return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
  }
  return toNum(v);
};

function toDate(v?: string, utcHint = false): number | undefined {
  if (!v) return undefined;
  const s = v.trim();
  // 2026-11-26 or 2026-11-26 09:01:00 or ISO
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) return Date.parse(s);
    const d = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 8), +(m[5] ?? 0), +(m[6] ?? 0));
    return d.getTime();
  }
  // 26/11/2026 [09:01]
  m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] ?? 8), +(m[5] ?? 0)).getTime();
  const p = Date.parse(utcHint ? s + ' UTC' : s);
  return isFinite(p) ? p : undefined;
}

export interface CsvResult {
  activities: Parsed[];
  metrics: DayMetric[];
  kind: string;
}

export function parseCsv(text: string): CsvResult {
  const rows = splitCsv(text.replace(/^﻿/, ''));
  if (rows.length < 2) throw new Error('CSV vacío');
  const c = new Cols(rows[0]);
  const body = rows.slice(1);

  // Daily metrics export: Timestamp,Type,Value
  if (c.has(['Type']) && c.has(['Value']) && c.has(['Timestamp', 'Date', 'Fecha'])) {
    return { activities: [], metrics: metricsLong(c, body), kind: 'métricas' };
  }
  // Wide metrics (date + weight/hrv/sleep columns and no sport column)
  const isActivity = c.has(['Activity Type', 'WorkoutType', 'Sport', 'Deporte', 'Type', 'Tipo', 'Tipo de actividad']);
  if (!isActivity && c.has(['Weight', 'Peso', 'HRV', 'Resting HR', 'FC reposo', 'Sleep', 'Sueño'])) {
    return { activities: [], metrics: metricsWide(c, body), kind: 'métricas' };
  }

  const strava = c.has(['Activity ID']) && c.has(['Activity Name']);
  const tp = c.has(['WorkoutType']) && c.has(['WorkoutDay']);
  const garmin = c.has(['Avg HR']) && c.has(['Title']) && c.has(['Activity Type']);
  const kind = strava ? 'Strava' : tp ? 'TrainingPeaks' : garmin ? 'Garmin Connect' : 'genérico';

  const activities: Parsed[] = [];
  for (const r of body) {
    const sportText = c.get(r, ['Activity Type', 'WorkoutType', 'Sport', 'Deporte', 'Type', 'Tipo', 'Tipo de actividad']);
    let start = toDate(c.get(r, ['Activity Date', 'Start Time', 'WorkoutDay', 'Date', 'Fecha', 'Start', 'Inicio']), strava);
    if (start == null) continue;
    // durations
    let duration: number | undefined;
    if (tp) {
      const h = toNum(c.get(r, ['TimeTotalInHours']));
      duration = h != null ? h * 3600 : undefined;
      if (!duration) continue; // planned-only rows in TP export
      start = start + 0;
    } else if (strava) {
      duration = toNum(c.get(r, ['Moving Time'])) ?? toNum(c.get(r, ['Elapsed Time']));
    } else {
      duration = toSec(c.get(r, ['Moving Time', 'Time', 'Duration', 'Duración', 'Tiempo', 'Elapsed Time', 'Tiempo en movimiento']));
      const mins = toNum(c.get(r, ['Duration (min)', 'Minutes', 'Minutos']));
      if (!duration && mins) duration = mins * 60;
    }
    if (!duration) continue;
    // distance: Strava has km first and metres last; TP uses metres; Garmin km
    let distance: number | undefined;
    if (strava) distance = toNum(c.get(r, ['Distance'], true));
    else if (tp) distance = toNum(c.get(r, ['DistanceInMeters']));
    else {
      const m = toNum(c.get(r, ['Distance (m)', 'Distance m', 'Metros', 'DistanceInMeters']));
      const km = toNum(c.get(r, ['Distance (km)', 'Distance', 'Distancia', 'Km']));
      distance = m ?? (km != null ? (km > 400 ? km : km * 1000) : undefined);
    }
    const vel = toNum(c.get(r, ['VelocityAverage', 'Average Speed']));
    activities.push({
      activity: {
        sport: sportFrom(sportText),
        start,
        name: c.get(r, ['Activity Name', 'Title', 'Name', 'Nombre', 'Título']) ?? '',
        duration,
        elapsed: strava ? toNum(c.get(r, ['Elapsed Time'])) : undefined,
        distance: distance || undefined,
        elevGain: toNum(c.get(r, ['Elevation Gain', 'Total Ascent', 'Ascent', 'Desnivel', 'ElevationGain'])),
        avgHr: toNum(c.get(r, ['Average Heart Rate', 'HeartRateAverage', 'Avg HR', 'FC media', 'Avg Heart Rate'])),
        maxHr: toNum(c.get(r, ['Max Heart Rate', 'HeartRateMax', 'Max HR', 'FC max', 'FC máxima'])),
        avgPower: toNum(c.get(r, ['Average Watts', 'PowerAverage', 'Avg Power', 'Potencia media'])),
        maxPower: toNum(c.get(r, ['Max Watts', 'PowerMax', 'Max Power'])),
        np: toNum(c.get(r, ['Weighted Average Power', 'Normalized Power® (NP®)', 'Normalized Power', 'NP'])),
        avgSpeed: vel ?? (distance && duration ? distance / duration : undefined),
        avgCadence: toNum(c.get(r, ['Average Cadence', 'CadenceAverage', 'Avg Run Cadence', 'Avg Bike Cadence', 'Cadencia media'])),
        calories: toNum(c.get(r, ['Calories', 'Energy', 'Calorías', 'Calorias'])),
        fileTss: toNum(c.get(r, ['TSS', 'Training Stress Score®', 'Training Stress Score'])),
        rpe: toNum(c.get(r, ['Rpe', 'RPE', 'Perceived Exertion'])),
        feel: toNum(c.get(r, ['Feeling'])),
        notes: c.get(r, ['AthleteComments', 'Activity Description', 'Notes', 'Notas']),
        source: 'csv',
      },
    });
  }
  return { activities, metrics: [], kind };
}

function metricsLong(c: Cols, body: string[][]): DayMetric[] {
  const map = new Map<string, DayMetric>();
  for (const r of body) {
    const t = toDate(c.get(r, ['Timestamp', 'Date', 'Fecha']));
    const type = norm(c.get(r, ['Type']) ?? '');
    const v = toNum(c.get(r, ['Value']));
    if (t == null || v == null) continue;
    const date = dayKey(t);
    const m = map.get(date) ?? { date };
    if (/weight|peso/.test(type)) m.weight = type.includes('pound') ? Math.round(v * 0.4536 * 10) / 10 : v;
    else if (/hrv|vfc/.test(type)) m.hrv = v;
    else if (/pulse|resting|reposo|rhr/.test(type)) m.restHr = v;
    else if (/sleephours|sleep$|sueno/.test(type) || type === 'sleephours') m.sleepHours = v;
    else if (/sleepquality/.test(type)) m.sleepQuality = v;
    else if (/fatigue|fatiga/.test(type)) m.fatigue = v;
    else if (/soreness|agujetas/.test(type)) m.soreness = v;
    else if (/stress|estres/.test(type)) m.stress = v;
    else if (/mood|animo/.test(type)) m.mood = v;
    else continue;
    map.set(date, m);
  }
  return [...map.values()];
}

function metricsWide(c: Cols, body: string[][]): DayMetric[] {
  const out: DayMetric[] = [];
  for (const r of body) {
    const t = toDate(c.get(r, ['Date', 'Fecha', 'Timestamp', 'Day', 'Día']));
    if (t == null) continue;
    out.push({
      date: dayKey(t),
      weight: toNum(c.get(r, ['Weight', 'Weight (kg)', 'Peso'])),
      hrv: toNum(c.get(r, ['HRV', 'VFC', 'HRV (ms)'])),
      restHr: toNum(c.get(r, ['Resting HR', 'RHR', 'FC reposo', 'Resting Heart Rate'])),
      sleepHours: toNum(c.get(r, ['Sleep Hours', 'Sleep', 'Sueño', 'Horas sueño'])),
    });
  }
  return out;
}
