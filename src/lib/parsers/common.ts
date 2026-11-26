import type { Activity, Lap, Sport, Streams } from '../types';

export interface Parsed {
  activity: Omit<Activity, 'id' | 'date' | 'source'> & { source?: string };
  streams?: Omit<Streams, 'id'>;
}

export function sportFrom(text?: string | number | null): Sport {
  const s = String(text ?? '').toLowerCase();
  if (/run|carrera|correr|trail|treadmill|cinta|track|rtss/.test(s)) return 'run';
  if (/bik|cycl|ride|ciclis|bici|mtb|gravel|velo|spin|virtual/.test(s)) return 'bike';
  if (/swim|nata|piscina|open water|pool/.test(s)) return 'swim';
  if (/strength|fuerza|weight|gym|crossfit|training|hiit|core|functional|pesas/.test(s)) return 'strength';
  if (/walk|hik|camin|trek|sender|mountaineer|monta/.test(s)) return 'walk';
  if (/row|remo|kayak|canoe|paddl/.test(s)) return 'row';
  if (/ski|esqu|snowboard/.test(s)) return 'ski';
  return 'other';
}

const num = (v: number | null | undefined) => (v != null && isFinite(v) ? v : undefined);

/** Fill in summary fields that a file did not provide, from its streams. */
export function summarize(act: Parsed['activity'], st?: Omit<Streams, 'id'>): Parsed['activity'] {
  if (!st || !st.t.length) return act;
  const avg = (a?: (number | null)[]) => {
    if (!a) return undefined;
    let s = 0;
    let n = 0;
    for (const v of a) if (v != null && v > 0) (s += v), n++;
    return n ? s / n : undefined;
  };
  const max = (a?: (number | null)[]) => {
    if (!a) return undefined;
    let m = 0;
    for (const v of a) if (v != null && v > m) m = v;
    return m || undefined;
  };
  const dur = st.t[st.t.length - 1] - st.t[0];
  let gain = 0;
  if (st.alt) {
    let prev: number | null = null;
    for (let i = 0; i < st.alt.length; i += 5) {
      const v = st.alt[i];
      if (v == null) continue;
      if (prev != null && v - prev > 0) gain += v - prev;
      prev = v;
    }
  }
  const lastDist = st.dist ? [...st.dist].reverse().find((v) => v != null) : undefined;
  return {
    ...act,
    duration: act.duration || dur,
    elapsed: act.elapsed ?? dur,
    distance: act.distance ?? num(lastDist ?? undefined),
    avgHr: act.avgHr ?? (avg(st.hr) ? Math.round(avg(st.hr) as number) : undefined),
    maxHr: act.maxHr ?? max(st.hr),
    avgPower: act.avgPower ?? (avg(st.power) ? Math.round(avg(st.power) as number) : undefined),
    maxPower: act.maxPower ?? max(st.power),
    avgCadence: act.avgCadence ?? (avg(st.cad) ? Math.round(avg(st.cad) as number) : undefined),
    elevGain: act.elevGain ?? (st.alt ? Math.round(gain) : undefined),
    hasStreams: true,
  };
}

/** Haversine distance in metres. */
export function hav(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const r = Math.PI / 180;
  const dLat = (lat2 - lat1) * r;
  const dLon = (lon2 - lon1) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function cumulativeDistance(lat: (number | null)[], lng: (number | null)[]): (number | null)[] {
  const out: (number | null)[] = [];
  let d = 0;
  let pl: number | null = null;
  let pg: number | null = null;
  for (let i = 0; i < lat.length; i++) {
    const a = lat[i];
    const b = lng[i];
    if (a != null && b != null) {
      if (pl != null && pg != null) d += hav(pl, pg, a, b);
      pl = a;
      pg = b;
      out.push(d);
    } else out.push(null);
  }
  return out;
}

export function lapsFromList(laps: Lap[]): Lap[] | undefined {
  return laps.length > 1 ? laps : undefined;
}

/** Speed (m/s) from a cumulative distance stream, over a ~5 s window. */
export function speedFromDist(t: number[], dist: (number | null)[]): (number | null)[] {
  const out: (number | null)[] = new Array(t.length).fill(null);
  let j = 0;
  for (let i = 0; i < t.length; i++) {
    if (dist[i] == null) continue;
    while (j < i && (t[i] - t[j] > 5 || dist[j] == null)) j++;
    const dt = t[i] - t[j];
    if (dt > 0 && dist[j] != null) out[i] = Math.max(0, ((dist[i] as number) - (dist[j] as number)) / dt);
  }
  return out;
}
