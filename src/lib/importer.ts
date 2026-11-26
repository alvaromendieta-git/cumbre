import { bump, db, getSettings, uid } from './db';
import { dayKey } from './format';
import { analyzeStreams, withTss } from './metrics';
import type { Parsed } from './parsers/common';
import { parseCsv } from './parsers/csv';
import { parseGpx, parseTcx } from './parsers/xml';
import type { Activity, DayMetric, Streams } from './types';
import { SPORT_LABEL } from './types';

export interface ImportReport {
  added: number;
  updated: number;
  skipped: number;
  metrics: number;
  errors: { file: string; error: string }[];
  kinds: Set<string>;
}

async function gunzip(buf: ArrayBuffer): Promise<ArrayBuffer> {
  const ds = new DecompressionStream('gzip');
  return new Response(new Blob([buf]).stream().pipeThrough(ds)).arrayBuffer();
}

async function inflateRaw(buf: Uint8Array): Promise<ArrayBuffer> {
  const ds = new DecompressionStream('deflate-raw');
  return new Response(new Blob([buf.slice() as Uint8Array<ArrayBuffer>]).stream().pipeThrough(ds)).arrayBuffer();
}

/** Minimal ZIP reader (stored + deflate) using the central directory. */
async function* unzip(buf: ArrayBuffer): AsyncGenerator<{ name: string; data: ArrayBuffer }> {
  const v = new DataView(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('ZIP no válido');
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  for (let k = 0; k < count; k++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const method = v.getUint16(p + 10, true);
    const csize = v.getUint32(p + 20, true);
    const nlen = v.getUint16(p + 28, true);
    const xlen = v.getUint16(p + 30, true);
    const clen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(buf, p + 46, nlen));
    p += 46 + nlen + xlen + clen;
    if (name.endsWith('/')) continue;
    const lnlen = v.getUint16(local + 26, true);
    const lxlen = v.getUint16(local + 28, true);
    const start = local + 30 + lnlen + lxlen;
    const raw = new Uint8Array(buf, start, csize);
    if (method === 0) yield { name, data: raw.slice().buffer };
    else if (method === 8) yield { name, data: await inflateRaw(raw) };
  }
}

interface Pending {
  parsed: Parsed[];
  metrics: DayMetric[];
  kind?: string;
}

async function parseBuffer(name: string, buf: ArrayBuffer): Promise<Pending> {
  let n = name.toLowerCase();
  if (n.endsWith('.gz')) {
    buf = await gunzip(buf);
    n = n.slice(0, -3);
  }
  const text = () => new TextDecoder().decode(buf);
  if (n.endsWith('.fit')) {
    const { parseFit } = await import('./parsers/fit');
    return { parsed: parseFit(buf), metrics: [], kind: 'FIT' };
  }
  if (n.endsWith('.gpx')) return { parsed: parseGpx(text()), metrics: [], kind: 'GPX' };
  if (n.endsWith('.tcx')) return { parsed: parseTcx(text()), metrics: [], kind: 'TCX' };
  if (n.endsWith('.csv')) {
    const r = parseCsv(text());
    return { parsed: r.activities, metrics: r.metrics, kind: `CSV ${r.kind}` };
  }
  if (n.endsWith('.json')) return parseJson(text());
  throw new Error('Formato no soportado');
}

function parseJson(text: string): Pending {
  const j = JSON.parse(text);
  if (j.app === 'cumbre' && j.backup) throw new Error('Es una copia de seguridad: usa «Restaurar copia»');
  const list: any[] = Array.isArray(j) ? j : j.activities ?? [];
  const parsed: Parsed[] = list.map((a) => ({
    activity: {
      sport: a.sport,
      start: typeof a.start === 'number' ? a.start : Date.parse(a.start),
      name: a.name ?? '',
      duration: a.duration,
      distance: a.distance,
      avgHr: a.avgHr,
      maxHr: a.maxHr,
      avgPower: a.avgPower,
      np: a.np,
      avgSpeed: a.avgSpeed ?? (a.distance && a.duration ? a.distance / a.duration : undefined),
      elevGain: a.elevGain,
      calories: a.calories,
      fileTss: a.tss,
      source: a.source ?? 'json',
    },
  }));
  const metrics: DayMetric[] = (j.metrics ?? []).filter((m: DayMetric) => m.date);
  return { parsed, metrics, kind: 'JSON' };
}

function defaultName(a: Parsed['activity']) {
  const d = new Date(a.start);
  const h = d.getHours();
  const part = h < 12 ? 'matutino' : h < 20 ? 'de tarde' : 'nocturno';
  return `${SPORT_LABEL[a.sport]} ${part}`;
}

export async function importFiles(files: File[], onProgress?: (done: number, total: number, name: string) => void): Promise<ImportReport> {
  const settings = await getSettings();
  const report: ImportReport = { added: 0, updated: 0, skipped: 0, metrics: 0, errors: [], kinds: new Set() };
  const existing = await db.activities.toArray();
  const index = existing.map((a) => ({ start: a.start, sport: a.sport, a }));

  // expand zips into entries
  type Entry = { name: string; get: () => Promise<ArrayBuffer> };
  const entries: Entry[] = [];
  for (const f of files) {
    if (f.name.toLowerCase().endsWith('.zip')) {
      try {
        for await (const e of unzip(await f.arrayBuffer())) {
          if (/\.(fit|gpx|tcx|csv)(\.gz)?$/i.test(e.name)) entries.push({ name: e.name, get: async () => e.data });
        }
      } catch (e) {
        report.errors.push({ file: f.name, error: String((e as Error).message ?? e) });
      }
    } else entries.push({ name: f.webkitRelativePath || f.name, get: () => f.arrayBuffer() });
  }
  // CSV summaries last, so files with full streams win the de-duplication
  entries.sort((a, b) => Number(/\.csv$/i.test(a.name)) - Number(/\.csv$/i.test(b.name)));

  let done = 0;
  for (const e of entries) {
    onProgress?.(done, entries.length, e.name);
    try {
      const p = await parseBuffer(e.name, await e.get());
      if (p.kind) report.kinds.add(p.kind);
      for (const item of p.parsed) {
        const res = await saveParsed(item, index, settings.thresholds);
        report[res]++;
      }
      for (const m of p.metrics) {
        const cur = await db.metrics.get(m.date);
        const clean = Object.fromEntries(Object.entries(m).filter(([, v]) => v != null));
        await db.metrics.put({ ...cur, ...clean, date: m.date });
        report.metrics++;
      }
    } catch (err) {
      report.errors.push({ file: e.name, error: String((err as Error).message ?? err) });
    }
    done++;
    if (done % 20 === 0) await new Promise((r) => setTimeout(r));
  }
  onProgress?.(entries.length, entries.length, '');
  bump();
  return report;
}

async function saveParsed(item: Parsed, index: { start: number; sport: string; a: Activity }[], th: import('./types').Thresholds): Promise<'added' | 'updated' | 'skipped'> {
  const src = item.activity;
  if (!src.start || !isFinite(src.start) || !src.duration) return 'skipped';
  const dup = index.find((x) => Math.abs(x.start - src.start) < 3 * 60 * 1000 && (x.sport === src.sport || src.sport === 'other' || x.sport === 'other'));
  if (dup && (dup.a.hasStreams || !item.streams)) return 'skipped';

  const id = dup?.a.id ?? uid();
  let act: Activity = {
    ...src,
    id,
    date: dayKey(src.start),
    name: dup?.a.name || src.name || defaultName(src),
    source: src.source ?? 'file',
    rpe: dup?.a.rpe ?? src.rpe,
    feel: dup?.a.feel ?? src.feel,
    notes: dup?.a.notes ?? src.notes,
    plannedId: dup?.a.plannedId,
    fileTss: src.fileTss ?? dup?.a.fileTss,
  };
  if (item.streams) {
    const st: Streams = { id, ...item.streams };
    const an = analyzeStreams(st, act.sport);
    act = { ...act, np: act.np ?? an.np, ngp: an.ngp, peaks: an.peaks, hist: an.hist, hasStreams: true };
    await db.streams.put(st);
  }
  act = withTss(act, th);
  await db.activities.put(act);
  if (dup) {
    dup.a = act;
    return 'updated';
  }
  index.push({ start: act.start, sport: act.sport, a: act });
  return 'added';
}

/** Recalculate TSS for everything (after thresholds change). */
export async function recomputeAll() {
  const s = await getSettings();
  const all = await db.activities.toArray();
  await db.activities.bulkPut(all.map((a) => withTss(a, s.thresholds)));
  bump();
}

/** Re-analyse streams (peaks, histograms) for every activity that has them. */
export async function reanalyzeStreams() {
  const s = await getSettings();
  const all = await db.activities.toArray();
  for (const a of all) {
    if (!a.hasStreams) continue;
    const st = await db.streams.get(a.id);
    if (!st) continue;
    const an = analyzeStreams(st, a.sport);
    await db.activities.put(withTss({ ...a, np: a.np ?? an.np, ngp: an.ngp, peaks: an.peaks, hist: an.hist }, s.thresholds));
  }
  bump();
}

export async function exportBackup(includeStreams: boolean): Promise<Blob> {
  const data = {
    app: 'cumbre',
    backup: 1,
    exportedAt: new Date().toISOString(),
    settings: await db.settings.toArray(),
    activities: await db.activities.toArray(),
    planned: await db.planned.toArray(),
    metrics: await db.metrics.toArray(),
    events: await db.events.toArray(),
    streams: includeStreams ? await db.streams.toArray() : [],
  };
  return new Blob([JSON.stringify(data)], { type: 'application/json' });
}

export async function restoreBackup(file: File) {
  const j = JSON.parse(await file.text());
  if (j.app !== 'cumbre') throw new Error('No es una copia de Cumbre');
  await db.transaction('rw', [db.settings, db.activities, db.planned, db.metrics, db.events, db.streams], async () => {
    if (j.settings?.length) await db.settings.bulkPut(j.settings);
    await db.activities.bulkPut(j.activities ?? []);
    await db.planned.bulkPut(j.planned ?? []);
    await db.metrics.bulkPut(j.metrics ?? []);
    await db.events.bulkPut(j.events ?? []);
    if (j.streams?.length) await db.streams.bulkPut(j.streams);
  });
  bump();
}

export async function wipeAll() {
  await Promise.all([db.activities.clear(), db.streams.clear(), db.planned.clear(), db.metrics.clear(), db.events.clear(), db.settings.clear()]);
  bump();
}
