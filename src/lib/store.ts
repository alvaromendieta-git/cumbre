import { db, getSettings, useQuery } from './db';
import { buildPmc, matchPlanned, type PmcPoint } from './metrics';
import type { Activity, DayMetric, Planned, RaceEvent, Settings } from './types';

export interface TrainingData {
  acts: Activity[];
  planned: Planned[];
  metrics: DayMetric[];
  events: RaceEvent[];
  settings: Settings;
  pmc: PmcPoint[];
  pairs: Map<string, Activity>; // planned id -> activity
  byDate: Map<string, Activity[]>;
  plannedByDate: Map<string, Planned[]>;
}

async function load(): Promise<TrainingData> {
  const [acts, planned, metrics, events, settings] = await Promise.all([
    db.activities.orderBy('start').toArray(),
    db.planned.orderBy('date').toArray(),
    db.metrics.orderBy('date').toArray(),
    db.events.orderBy('date').toArray(),
    getSettings(),
  ]);
  const { pairs } = matchPlanned(acts, planned);
  const byDate = new Map<string, Activity[]>();
  for (const a of acts) byDate.set(a.date, [...(byDate.get(a.date) ?? []), a]);
  const plannedByDate = new Map<string, Planned[]>();
  for (const p of planned) plannedByDate.set(p.date, [...(plannedByDate.get(p.date) ?? []), p]);
  const pmc = buildPmc(acts, planned, { ctlDays: settings.ctlDays, atlDays: settings.atlDays });
  return { acts, planned, metrics, events, settings, pmc, pairs, byDate, plannedByDate };
}

export function useTraining() {
  return useQuery(load);
}
