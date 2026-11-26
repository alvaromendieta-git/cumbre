import Dexie, { type Table } from 'dexie';
import { useEffect, useState } from 'react';
import type { Activity, DayMetric, Planned, RaceEvent, Settings, Streams } from './types';

class CumbreDB extends Dexie {
  activities!: Table<Activity, string>;
  streams!: Table<Streams, string>;
  planned!: Table<Planned, string>;
  metrics!: Table<DayMetric, string>;
  events!: Table<RaceEvent, string>;
  settings!: Table<Settings, string>;

  constructor() {
    super('cumbre');
    this.version(1).stores({
      activities: 'id, date, start, sport',
      streams: 'id',
      planned: 'id, date, sport',
      metrics: 'date',
      events: 'id, date',
      settings: 'id',
    });
  }
}

export const db = new CumbreDB();

export const DEFAULT_SETTINGS: Settings = {
  id: 'me',
  thresholds: {},
  units: 'metric',
  weekStart: 1,
  ctlDays: 42,
  atlDays: 7,
};

export async function getSettings(): Promise<Settings> {
  const s = await db.settings.get('me');
  return { ...DEFAULT_SETTINGS, ...s, thresholds: { ...(s?.thresholds ?? {}) } };
}

export async function saveSettings(patch: Partial<Settings>) {
  const cur = await getSettings();
  await db.settings.put({ ...cur, ...patch, id: 'me' });
  bump();
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// --- tiny reactive layer: every write calls bump(), hooks re-query. ---
let version = 0;
const listeners = new Set<() => void>();
export function bump() {
  version++;
  listeners.forEach((l) => l());
}

export function useDbVersion() {
  const [v, setV] = useState(version);
  useEffect(() => {
    const l = () => setV(version);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return v;
}

/** Re-runs the query whenever the database changes. undefined while loading. */
export function useQuery<T>(fn: () => Promise<T>, deps: unknown[] = []): T | undefined {
  const v = useDbVersion();
  const [val, setVal] = useState<T>();
  useEffect(() => {
    let alive = true;
    fn().then((r) => alive && setVal(r)).catch((e) => console.error(e));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v, ...deps]);
  return val;
}

export function useSettings() {
  return useQuery(getSettings);
}
