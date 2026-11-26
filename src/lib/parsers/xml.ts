import { type Parsed, cumulativeDistance, speedFromDist, sportFrom, summarize } from './common';

const byLocal = (el: Element | Document, name: string) => Array.from(el.getElementsByTagNameNS('*', name));
const first = (el: Element, name: string) => byLocal(el, name)[0];
const numOf = (el: Element | undefined) => {
  if (!el?.textContent) return null;
  const v = parseFloat(el.textContent);
  return isFinite(v) ? v : null;
};

function parseXml(text: string) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('XML no válido');
  return doc;
}

export function parseGpx(text: string): Parsed[] {
  const doc = parseXml(text);
  const trk = byLocal(doc, 'trk')[0];
  const name = trk ? first(trk, 'name')?.textContent ?? '' : '';
  const type = trk ? first(trk, 'type')?.textContent ?? '' : '';
  const pts = byLocal(doc, 'trkpt');
  if (pts.length < 2) throw new Error('GPX sin puntos de track');
  const t0 = Date.parse(first(pts[0], 'time')?.textContent ?? '');
  if (!isFinite(t0)) throw new Error('GPX sin marcas de tiempo');
  const t: number[] = [];
  const lat: (number | null)[] = [];
  const lng: (number | null)[] = [];
  const alt: (number | null)[] = [];
  const hr: (number | null)[] = [];
  const cad: (number | null)[] = [];
  const power: (number | null)[] = [];
  for (const p of pts) {
    const ts = Date.parse(first(p, 'time')?.textContent ?? '');
    if (!isFinite(ts)) continue;
    t.push((ts - t0) / 1000);
    lat.push(parseFloat(p.getAttribute('lat') ?? 'NaN'));
    lng.push(parseFloat(p.getAttribute('lon') ?? 'NaN'));
    alt.push(numOf(first(p, 'ele')));
    hr.push(numOf(first(p, 'hr')));
    cad.push(numOf(first(p, 'cad')));
    power.push(numOf(first(p, 'power')) ?? numOf(first(p, 'PowerInWatts')));
  }
  const has = (a: (number | null)[]) => a.some((v) => v != null);
  const dist = cumulativeDistance(lat, lng);
  const streams = { t, lat, lng, dist, speed: speedFromDist(t, dist), alt: has(alt) ? alt : undefined, hr: has(hr) ? hr : undefined, cad: has(cad) ? cad : undefined, power: has(power) ? power : undefined };
  const sport = sportFrom(type || name);
  const activity = summarize({ sport, start: t0, name, duration: movingTime(t, dist), source: 'gpx' }, streams);
  return [{ activity, streams }];
}

/** Moving time: skip intervals where speed < 0.5 m/s or gap > 30 s. */
function movingTime(t: number[], dist: (number | null)[]) {
  let m = 0;
  for (let i = 1; i < t.length; i++) {
    const dt = t[i] - t[i - 1];
    const dd = (dist[i] ?? 0) - (dist[i - 1] ?? 0);
    if (dt > 0 && dt <= 30 && dd / dt > 0.5) m += dt;
  }
  return m || t[t.length - 1] - t[0];
}

export function parseTcx(text: string): Parsed[] {
  const doc = parseXml(text);
  const acts = byLocal(doc, 'Activity');
  if (!acts.length) throw new Error('TCX sin actividades');
  return acts.map((act) => {
    const sport = sportFrom(act.getAttribute('Sport'));
    const laps = byLocal(act, 'Lap');
    const t0 = Date.parse(laps[0]?.getAttribute('StartTime') ?? first(act, 'Id')?.textContent ?? '');
    const tps = byLocal(act, 'Trackpoint');
    const t: number[] = [];
    const lat: (number | null)[] = [];
    const lng: (number | null)[] = [];
    const alt: (number | null)[] = [];
    const hr: (number | null)[] = [];
    const cad: (number | null)[] = [];
    const power: (number | null)[] = [];
    const dist: (number | null)[] = [];
    const speed: (number | null)[] = [];
    for (const p of tps) {
      const ts = Date.parse(first(p, 'Time')?.textContent ?? '');
      if (!isFinite(ts)) continue;
      t.push((ts - t0) / 1000);
      lat.push(numOf(first(p, 'LatitudeDegrees')));
      lng.push(numOf(first(p, 'LongitudeDegrees')));
      alt.push(numOf(first(p, 'AltitudeMeters')));
      dist.push(numOf(first(p, 'DistanceMeters')));
      const hrEl = first(p, 'HeartRateBpm');
      hr.push(hrEl ? numOf(first(hrEl, 'Value')) : null);
      cad.push(numOf(first(p, 'Cadence')) ?? numOf(first(p, 'RunCadence')));
      power.push(numOf(first(p, 'Watts')));
      speed.push(numOf(first(p, 'Speed')));
    }
    const has = (a: (number | null)[]) => a.some((v) => v != null);
    const lapSum = (tag: string) => laps.reduce((s, l) => s + (numOf(Array.from(l.children).find((c) => c.localName === tag)) ?? 0), 0);
    const totalTime = lapSum('TotalTimeSeconds');
    const totalDist = lapSum('DistanceMeters');
    const calories = lapSum('Calories');
    const streams = t.length > 10
      ? {
          t,
          lat: has(lat) ? lat : undefined,
          lng: has(lng) ? lng : undefined,
          alt: has(alt) ? alt : undefined,
          dist: has(dist) ? dist : has(lat) ? cumulativeDistance(lat, lng) : undefined,
          speed: has(speed) ? speed : has(dist) ? speedFromDist(t, dist) : has(lat) ? speedFromDist(t, cumulativeDistance(lat, lng)) : undefined,
          hr: has(hr) ? hr : undefined,
          cad: has(cad) ? cad : undefined,
          power: has(power) ? power : undefined,
        }
      : undefined;
    const lapList = laps.map((l) => ({
      start: (Date.parse(l.getAttribute('StartTime') ?? '') - t0) / 1000,
      duration: numOf(Array.from(l.children).find((c) => c.localName === 'TotalTimeSeconds')) ?? 0,
      distance: numOf(Array.from(l.children).find((c) => c.localName === 'DistanceMeters')) ?? undefined,
    }));
    const activity = summarize(
      {
        sport,
        start: t0,
        name: first(act, 'Notes')?.textContent ?? '',
        duration: totalTime,
        distance: totalDist || undefined,
        calories: calories || undefined,
        laps: lapList.length > 1 ? lapList : undefined,
        source: 'tcx',
      },
      streams,
    );
    return { activity, streams };
  });
}
