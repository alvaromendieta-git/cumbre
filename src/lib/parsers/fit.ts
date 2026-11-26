import { Decoder, Stream } from '@garmin/fitsdk';
import type { Lap } from '../types';
import { type Parsed, lapsFromList, sportFrom, summarize } from './common';

const SEMI = 180 / 2 ** 31;
type M = Record<string, any>;

export function parseFit(buf: ArrayBuffer): Parsed[] {
  const stream = Stream.fromArrayBuffer(buf);
  const decoder = new Decoder(stream);
  if (!decoder.isFIT()) throw new Error('No es un archivo FIT válido');
  const { messages, errors } = decoder.read({ convertDateTimesToDates: true, mergeHeartRates: true });
  if (errors?.length && !messages?.recordMesgs?.length && !messages?.sessionMesgs?.length) throw new Error(String(errors[0]));
  const sessions: M[] = messages.sessionMesgs ?? [];
  const records: M[] = messages.recordMesgs ?? [];
  const lapsAll: M[] = messages.lapMesgs ?? [];
  if (!sessions.length && !records.length) throw new Error('El FIT no contiene actividad');

  const sessionList = sessions.length ? sessions : [{ startTime: records[0]?.timestamp, sport: messages.sportMesgs?.[0]?.sport }];
  return sessionList.map((s, idx) => {
    const start: Date = s.startTime instanceof Date ? s.startTime : records[0]?.timestamp;
    const startMs = start.getTime();
    const endMs = sessionList[idx + 1]?.startTime instanceof Date ? sessionList[idx + 1].startTime.getTime() : Infinity;
    const recs = records.filter((r) => r.timestamp instanceof Date && r.timestamp.getTime() >= startMs && r.timestamp.getTime() < endMs);
    const sportText = `${s.sport ?? ''} ${s.subSport ?? ''}`;
    const sport = sportFrom(sportText);

    let streams: Parsed['streams'];
    if (recs.length > 10) {
      const t: number[] = [];
      const hr: (number | null)[] = [];
      const power: (number | null)[] = [];
      const speed: (number | null)[] = [];
      const alt: (number | null)[] = [];
      const cad: (number | null)[] = [];
      const dist: (number | null)[] = [];
      const lat: (number | null)[] = [];
      const lng: (number | null)[] = [];
      for (const r of recs) {
        t.push((r.timestamp.getTime() - startMs) / 1000);
        hr.push(r.heartRate ?? null);
        power.push(r.power ?? null);
        speed.push(r.enhancedSpeed ?? r.speed ?? null);
        alt.push(r.enhancedAltitude ?? r.altitude ?? null);
        cad.push(r.cadence != null ? r.cadence + (r.fractionalCadence ?? 0) : null);
        dist.push(r.distance ?? null);
        lat.push(r.positionLat != null ? r.positionLat * SEMI : null);
        lng.push(r.positionLong != null ? r.positionLong * SEMI : null);
      }
      const has = (a: (number | null)[]) => a.some((v) => v != null);
      streams = {
        t,
        hr: has(hr) ? hr : undefined,
        power: has(power) ? power : undefined,
        speed: has(speed) ? speed : undefined,
        alt: has(alt) ? alt : undefined,
        cad: has(cad) ? cad : undefined,
        dist: has(dist) ? dist : undefined,
        lat: has(lat) ? lat : undefined,
        lng: has(lng) ? lng : undefined,
      };
    }

    const laps: Lap[] = lapsAll
      .filter((l) => l.startTime instanceof Date && l.startTime.getTime() >= startMs && l.startTime.getTime() < endMs)
      .map((l) => ({
        start: (l.startTime.getTime() - startMs) / 1000,
        duration: l.totalTimerTime ?? l.totalElapsedTime ?? 0,
        distance: l.totalDistance,
        avgHr: l.avgHeartRate,
        maxHr: l.maxHeartRate,
        avgPower: l.avgPower,
        avgSpeed: l.enhancedAvgSpeed ?? l.avgSpeed,
        avgCadence: l.avgCadence,
      }));

    const activity: Parsed['activity'] = {
      sport,
      subSport: s.subSport ? String(s.subSport) : undefined,
      start: startMs,
      name: '',
      duration: s.totalTimerTime ?? 0,
      elapsed: s.totalElapsedTime,
      distance: s.totalDistance || undefined,
      elevGain: s.totalAscent,
      avgHr: s.avgHeartRate,
      maxHr: s.maxHeartRate,
      avgPower: s.avgPower,
      maxPower: s.maxPower,
      np: s.normalizedPower,
      avgSpeed: s.enhancedAvgSpeed ?? s.avgSpeed,
      maxSpeed: s.enhancedMaxSpeed ?? s.maxSpeed,
      avgCadence: s.avgCadence ?? s.avgRunningCadence,
      calories: s.totalCalories,
      fileTss: s.trainingStressScore,
      laps: lapsFromList(laps),
      source: 'fit',
    };
    return { activity: summarize(activity, streams), streams };
  });
}
