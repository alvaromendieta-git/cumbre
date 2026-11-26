import type { Sport } from './types';

export const pad = (n: number) => String(n).padStart(2, '0');

/** Local YYYY-MM-DD */
export function dayKey(d: Date | number): string {
  const x = typeof d === 'number' ? new Date(d) : d;
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

export function parseDay(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: string, n: number): string {
  const d = parseDay(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

export function diffDays(a: string, b: string): number {
  return Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / 86400000);
}

export function today(): string {
  return dayKey(new Date());
}

/** Monday (or Sunday) of the week containing key. */
export function weekStartOf(key: string, weekStart: 0 | 1 = 1): string {
  const d = parseDay(key);
  const dow = d.getDay();
  const back = (dow - weekStart + 7) % 7;
  return addDays(key, -back);
}

const DOW = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MON = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MON_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export const dowShort = (key: string) => DOW[parseDay(key).getDay()];
export const dayShort = (key: string) => {
  const d = parseDay(key);
  return `${d.getDate()} ${MON[d.getMonth()]}`;
};
export const dayLong = (key: string) => {
  const d = parseDay(key);
  return `${DOW[d.getDay()]} ${d.getDate()} de ${MON_LONG[d.getMonth()]}`;
};
export const monthLabel = (key: string) => {
  const d = parseDay(key);
  return `${MON_LONG[d.getMonth()]} ${d.getFullYear()}`;
};
export const monShort = (key: string) => MON[parseDay(key).getMonth()];

/** h:mm:ss or m:ss */
export function fmtDur(sec?: number, short = false): string {
  if (sec == null || !isFinite(sec)) return '—';
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (short) return h ? `${h}h${m ? pad(m) : ''}` : `${m}min`;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function fmtHours(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return `${h}:${pad(m)}`;
}

export function fmtKm(m?: number, digits = 1): string {
  if (m == null || !isFinite(m)) return '—';
  return (m / 1000).toFixed(digits);
}

/** pace per km (run) as m:ss */
export function fmtPace(speed?: number | null, per = 1000): string {
  if (!speed || speed <= 0.2) return '—';
  const s = per / speed;
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return r === 60 ? `${m + 1}:00` : `${m}:${pad(r)}`;
}

export function fmtSpeed(speed?: number | null): string {
  if (!speed) return '—';
  return (speed * 3.6).toFixed(1);
}

/** Speed shown the way the sport usually reads it. */
export function speedFor(sport: Sport, speed?: number | null): { value: string; unit: string } {
  if (sport === 'swim') return { value: fmtPace(speed, 100), unit: '/100m' };
  if (sport === 'run' || sport === 'walk') return { value: fmtPace(speed), unit: '/km' };
  return { value: fmtSpeed(speed), unit: 'km/h' };
}

export function parsePace(text: string): number | undefined {
  // "4:30" per km -> m/s
  const m = text.trim().match(/^(\d+):(\d{1,2})$/);
  if (!m) return undefined;
  const s = Number(m[1]) * 60 + Number(m[2]);
  return s > 0 ? 1000 / s : undefined;
}

export function parseDur(text: string): number | undefined {
  // "1:30:00", "45:00", "45" (min)
  const parts = text.trim().split(':').map(Number);
  if (parts.some((p) => isNaN(p))) return undefined;
  if (parts.length === 1) return parts[0] * 60;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

export const round = (n?: number, d = 0) => (n == null || !isFinite(n) ? undefined : Math.round(n * 10 ** d) / 10 ** d);
