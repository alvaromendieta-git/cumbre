export type Sport = 'run' | 'bike' | 'swim' | 'strength' | 'walk' | 'row' | 'ski' | 'other';

export const SPORTS: Sport[] = ['run', 'bike', 'swim', 'strength', 'walk', 'row', 'ski', 'other'];

export const SPORT_LABEL: Record<Sport, string> = {
  run: 'Carrera',
  bike: 'Ciclismo',
  swim: 'Natación',
  strength: 'Fuerza',
  walk: 'Caminar / Trekking',
  row: 'Remo',
  ski: 'Esquí',
  other: 'Otro',
};

export type TssMethod = 'power' | 'pace' | 'hr' | 'swim' | 'rpe' | 'manual' | 'file' | 'none';

export interface Lap {
  start: number; // seconds from activity start
  duration: number;
  distance?: number;
  avgHr?: number;
  maxHr?: number;
  avgPower?: number;
  avgSpeed?: number;
  avgCadence?: number;
}

/** Per-second (or per-sample) streams, stored separately from the activity summary. */
export interface Streams {
  id: string; // activity id
  t: number[]; // seconds from start
  hr?: (number | null)[];
  power?: (number | null)[];
  speed?: (number | null)[]; // m/s
  alt?: (number | null)[];
  cad?: (number | null)[];
  dist?: (number | null)[]; // metres
  lat?: (number | null)[];
  lng?: (number | null)[];
}

export interface Peaks {
  power?: Record<string, number>; // duration seconds -> watts
  hr?: Record<string, number>; // duration seconds -> bpm
  speed?: Record<string, number>; // duration seconds -> m/s
  distTime?: Record<string, number>; // metres -> best seconds
}

export interface Activity {
  id: string;
  sport: Sport;
  subSport?: string;
  start: number; // epoch ms
  date: string; // YYYY-MM-DD (local)
  name: string;
  duration: number; // moving/timer seconds
  elapsed?: number;
  distance?: number; // m
  elevGain?: number; // m
  avgHr?: number;
  maxHr?: number;
  avgPower?: number;
  maxPower?: number;
  np?: number; // normalized power
  avgSpeed?: number; // m/s
  maxSpeed?: number;
  avgCadence?: number;
  calories?: number;
  tss?: number;
  tssMethod?: TssMethod;
  intensity?: number; // IF
  fileTss?: number; // TSS coming from an imported file/CSV
  rpe?: number; // 1..10
  feel?: number; // 1..5
  notes?: string;
  source: string; // fit, gpx, tcx, csv, manual, json
  hasStreams?: boolean;
  laps?: Lap[];
  peaks?: Peaks;
  /** Threshold-independent histograms (seconds per bin) so zones and hrTSS can be recomputed any time. */
  hist?: { hr?: Record<string, number>; power?: Record<string, number>; speed?: Record<string, number> };
  ngp?: number; // normalized graded speed, m/s (run)
  plannedId?: string;
}

export interface Step {
  id: string;
  label: string;
  duration: number; // seconds
  intensity: number; // fraction of threshold, e.g. 0.75
  repeat?: number;
  rest?: { duration: number; intensity: number }; // recovery after each repeat
}

export interface Planned {
  id: string;
  date: string; // YYYY-MM-DD
  sport: Sport;
  title: string;
  description?: string;
  duration?: number; // seconds
  distance?: number; // m
  tss?: number;
  steps?: Step[];
}

export interface DayMetric {
  date: string; // YYYY-MM-DD, primary key
  weight?: number;
  restHr?: number;
  hrv?: number;
  sleepHours?: number;
  sleepQuality?: number; // 1..5
  fatigue?: number; // 1..5
  soreness?: number; // 1..5
  stress?: number; // 1..5
  mood?: number; // 1..5
  notes?: string;
}

export type Priority = 'A' | 'B' | 'C';

export interface RaceEvent {
  id: string;
  date: string;
  name: string;
  sport: Sport;
  priority: Priority;
  distance?: number;
  goal?: string;
  targetCtl?: number;
}

export interface Thresholds {
  ftp?: number; // W
  runPace?: number; // threshold speed m/s
  swimPace?: number; // CSS m/s
  lthrRun?: number;
  lthrBike?: number;
  maxHr?: number;
  restHr?: number;
  weight?: number;
}

export interface Settings {
  id: 'me';
  name?: string;
  thresholds: Thresholds;
  units: 'metric' | 'imperial';
  weekStart: 1 | 0;
  ctlDays: number;
  atlDays: number;
  onboarded?: boolean;
  thresholdsAt?: number; // when thresholds last changed (ms)
}
