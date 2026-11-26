import { BarChart3 } from 'lucide-react';
import { useState } from 'react';
import { Card, CountUp, Empty, Header, Seg, Stat, Trend, go, sportColor } from '../components/ui';
import { BarChart, Legend, PeakCurve, PmcChart, ZoneBars, type Bar } from '../components/charts';
import { useTraining } from '../lib/store';
import { addDays, dayShort, fmtHours, fmtPace, today, weekStartOf } from '../lib/format';
import { activityZones, HR_ZONES_RUN, pmcAt, rampRate, trainingStatus, tsbColor } from '../lib/metrics';
import { SPORT_LABEL, type Sport } from '../lib/types';

type Range = '42' | '90' | '180' | '365' | 'all';
const RANGES: { value: Range; label: string }[] = [
  { value: '42', label: '6 sem' },
  { value: '90', label: '3 m' },
  { value: '180', label: '6 m' },
  { value: '365', label: '1 año' },
  { value: 'all', label: 'Todo' },
];

export default function Analysis() {
  const data = useTraining();
  const [range, setRange] = useState<Range>('90');
  const [weekMetric, setWeekMetric] = useState<'tss' | 'hours' | 'km' | 'kcal'>('tss');
  const [peakKind, setPeakKind] = useState<'power' | 'pace' | 'hr'>('pace');
  if (!data) return <Header title="Análisis" />;
  const { acts, pmc, settings, planned } = data;
  if (!acts.length) return (<><Header title="Análisis" /><Empty icon={<BarChart3 size={40} />} title="Sin datos todavía"><p>Importa tu historial para ver tu evolución.</p><button className="btn primary" onClick={() => go('importar')}>Importar</button></Empty></>);

  const t = today();
  const from = range === 'all' ? acts[0].date : addDays(t, -Number(range));
  const inRange = acts.filter((a) => a.date >= from && a.date <= t);
  const pts = pmc.filter((p) => p.date >= from && p.date <= addDays(t, 21));
  const now = pmcAt(pmc, t);
  const ramp = rampRate(pmc, t);
  const st = trainingStatus(pmc, t);
  const alert = st.level === 'danger' || st.level === 'overreach';
  const peakCtl = pmc.filter((p) => !p.future).reduce((m, p) => (p.ctl > m.ctl ? p : m), pmc[0]);

  // weekly bars
  const ws0 = weekStartOf(from, settings.weekStart);
  const weeks: Bar[] = [];
  const sportsSeen = new Set<Sport>();
  for (let w = ws0; w <= addDays(t, 13); w = addDays(w, 7)) {
    const we = addDays(w, 6);
    const list = inRange.filter((a) => a.date >= w && a.date <= we);
    const val = (a: (typeof list)[0]) => (weekMetric === 'tss' ? a.tss ?? 0 : weekMetric === 'hours' ? a.duration / 3600 : weekMetric === 'km' ? (a.distance ?? 0) / 1000 : a.calories ?? 0);
    const by = new Map<Sport, number>();
    list.forEach((a) => { by.set(a.sport, (by.get(a.sport) ?? 0) + val(a)); sportsSeen.add(a.sport); });
    const pl = planned.filter((p) => p.date >= w && p.date <= we);
    const plannedVal = weekMetric === 'tss' ? pl.reduce((s, p) => s + (p.tss ?? 0), 0) : weekMetric === 'hours' ? pl.reduce((s, p) => s + (p.duration ?? 0), 0) / 3600 : weekMetric === 'km' ? pl.reduce((s, p) => s + (p.distance ?? 0), 0) / 1000 : 0;
    weeks.push({
      key: w,
      label: dayShort(w).replace(' ', ' '),
      value: [...by.values()].reduce((a, b) => a + b, 0),
      planned: plannedVal || undefined,
      stack: [...by.entries()].map(([s, v]) => ({ value: v, color: sportColor(s) })),
      highlight: w === weekStartOf(t, settings.weekStart),
    });
  }
  // flag weeks whose load jumps >30% above the previous 3-week average (tss/hours only)
  if (weekMetric === 'tss' || weekMetric === 'hours') {
    weeks.forEach((wk, i) => {
      const prev = weeks.slice(Math.max(0, i - 3), i).map((x) => x.value).filter((v) => v > 0);
      if (prev.length >= 2) {
        const avg = prev.reduce((a, b) => a + b, 0) / prev.length;
        wk.alert = wk.value > avg * 1.3 && wk.value - avg > (weekMetric === 'tss' ? 60 : 1);
      }
    });
  }
  const spikes = weeks.filter((w) => w.alert).length;
  const fmtW = (v: number) => (weekMetric === 'hours' ? `${v.toFixed(1)}h` : Math.round(v).toString());

  // sport distribution
  const bySport = new Map<Sport, { dur: number; n: number; km: number }>();
  for (const a of inRange) {
    const cur = bySport.get(a.sport) ?? { dur: 0, n: 0, km: 0 };
    bySport.set(a.sport, { dur: cur.dur + a.duration, n: cur.n + 1, km: cur.km + (a.distance ?? 0) / 1000 });
  }
  const totalDur = [...bySport.values()].reduce((s, v) => s + v.dur, 0) || 1;

  // zones aggregate (HR, all sports with their own LTHR)
  const zoneSum = HR_ZONES_RUN.map(() => 0);
  let zoneAny = false;
  for (const a of inRange) {
    const z = activityZones(a, settings.thresholds).hr;
    if (z) { zoneAny = true; z.forEach((s, i) => (zoneSum[i] += s)); }
  }
  // polarisation summary (low = Z1-2, mid = Z3-4, high = Z5)
  const zt = zoneSum.reduce((a, b) => a + b, 0) || 1;
  const low = (zoneSum[0] + zoneSum[1]) / zt, mid = (zoneSum[2] + zoneSum[3]) / zt, high = (zoneSum[4] + zoneSum[5] + zoneSum[6]) / zt;

  // peaks
  const durs = [5, 30, 60, 300, 600, 1200, 1800, 3600];
  const peakSeries = (list: typeof acts, label: string, color: string) => {
    const pts: [number, number][] = [];
    for (const d of durs) {
      let best = 0;
      for (const a of list) {
        if (peakKind === 'power' && a.sport !== 'bike') continue;
        if (peakKind === 'pace' && a.sport !== 'run') continue;
        const v = peakKind === 'power' ? a.peaks?.power?.[d] : peakKind === 'hr' ? a.peaks?.hr?.[d] : a.peaks?.speed?.[d];
        if (v && v > best) best = v;
      }
      if (best) pts.push([d, peakKind === 'pace' ? best * 3.6 : best]);
    }
    return { label, color, points: pts };
  };
  const peakAll = peakSeries(acts, 'Histórico', 'var(--c-text-muted)');
  const peakRange = peakSeries(inRange, 'Periodo', 'var(--c-accent)');
  const fmtPeak = (v: number) => (peakKind === 'power' ? `${Math.round(v)}W` : peakKind === 'hr' ? `${Math.round(v)}` : fmtPace(v / 3.6));

  return (
    <>
      <Header title="Análisis" />
      <div className="stack-lg">
        <Seg label="Periodo" value={range} onChange={setRange} options={RANGES} />

        <Card tint={st.color} className={alert ? 'alert' : ''} title="Gráfico de forma (PMC)" action={<span className="status-pill"><span className="pulse" />{st.label}</span>}>
          {now && (
            <div className="stats four" style={{ marginBottom: 10 }}>
              <Stat label="Fitness" value={<CountUp value={now.ctl} />} tone="fitness" extra={<Trend delta={st.ctlDelta} badWhen="down" />} />
              <Stat label="Fatiga" value={<CountUp value={now.atl} />} color={alert ? 'var(--st-danger)' : 'var(--c-fatigue)'} extra={<Trend delta={st.atlDelta} badWhen="up" />} />
              <Stat label="Forma" value={<CountUp value={now.tsb} prefix="±" />} color={tsbColor(now.tsb)} />
              <Stat label="Rampa" value={ramp != null ? (ramp > 0 ? '+' : '') + ramp.toFixed(1) : '—'} unit="/sem" color={ramp != null && ramp > 6 ? 'var(--st-danger)' : ramp != null && ramp > 0 ? 'var(--st-fresh)' : undefined} />
            </div>
          )}
          <PmcChart points={pts} />
          <Legend items={[{ color: 'var(--c-fitness)', label: 'Fitness (CTL)' }, { color: 'var(--c-fatigue)', label: 'Fatiga (ATL)' }, { color: 'var(--st-fresh)', label: 'Forma +' }, { color: 'var(--st-danger)', label: 'Forma en fatiga' }, { color: 'var(--c-accent)', label: 'TSS diario (burbujas)' }]} />
          {now && <p className="xs" style={{ marginBottom: 0, color: alert ? st.color : 'var(--c-text-muted)' }}>{st.advice} Pico de fitness: {peakCtl.ctl.toFixed(0)} ({dayShort(peakCtl.date)}). Rampa segura: 3–7 CTL/semana.</p>}
        </Card>

        <Card title="Carga semanal" action={<div style={{ minWidth: 200 }}><Seg label="Métrica semanal" value={weekMetric} onChange={setWeekMetric} options={[{ value: 'tss', label: 'TSS' }, { value: 'hours', label: 'Horas' }, { value: 'km', label: 'Km' }, { value: 'kcal', label: 'Kcal' }]} /></div>}>
          <BarChart bars={weeks} fmt={fmtW} />
          {spikes > 0 && <p className="xs c-danger" style={{ margin: '4px 0' }}>⚠ {spikes} {spikes === 1 ? 'semana' : 'semanas'} con un salto de carga &gt;30% sobre las 3 anteriores: más riesgo de lesión.</p>}
          <Legend items={[...sportsSeen].map((s) => ({ color: sportColor(s), label: SPORT_LABEL[s] }))} />
        </Card>

        <Card title="Distribución por deporte">
          <div style={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', marginBottom: 12 }} aria-hidden>
            {[...bySport.entries()].map(([s, v]) => <div key={s} style={{ width: `${(v.dur / totalDur) * 100}%`, background: sportColor(s) }} />)}
          </div>
          <table className="t">
            <thead><tr><th>Deporte</th><th className="r">Sesiones</th><th className="r">Horas</th><th className="r">Km</th><th className="r">%</th></tr></thead>
            <tbody>
              {[...bySport.entries()].sort((a, b) => b[1].dur - a[1].dur).map(([s, v]) => (
                <tr key={s}><td><i className="dot" style={{ background: sportColor(s), marginRight: 6 }} />{SPORT_LABEL[s]}</td><td className="r">{v.n}</td><td className="r">{fmtHours(v.dur)}</td><td className="r">{Math.round(v.km)}</td><td className="r">{Math.round((v.dur / totalDur) * 100)}</td></tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Tiempo en zonas de FC">
          {zoneAny ? (
            <>
              <ZoneBars names={HR_ZONES_RUN.map((z) => z.name)} seconds={zoneSum} />
              <div className="stats" style={{ marginTop: 12 }}>
                <Stat label="Baja (Z1–2)" value={`${Math.round(low * 100)}%`} tone="success" />
                <Stat label="Media (Z3–4)" value={`${Math.round(mid * 100)}%`} tone="form" />
                <Stat label="Alta (Z5)" value={`${Math.round(high * 100)}%`} tone="danger" />
              </div>
              <p className="xs muted" style={{ marginBottom: 0 }}>Solo entrenos con datos segundo a segundo. Un reparto ~80/20 (baja/alta) es típico de un entrenamiento polarizado.</p>
            </>
          ) : <p className="sm muted" style={{ margin: 0 }}>Necesitas archivos con FC segundo a segundo (FIT/GPX/TCX) y tu FC umbral configurada.</p>}
        </Card>

        <Card title="Curva de mejores marcas" action={<div style={{ minWidth: 190 }}><Seg label="Tipo" value={peakKind} onChange={setPeakKind} options={[{ value: 'pace', label: 'Ritmo' }, { value: 'power', label: 'Potencia' }, { value: 'hr', label: 'FC' }]} /></div>}>
          <PeakCurve series={[peakAll, peakRange].filter((s) => s.points.length)} fmtY={fmtPeak} />
        </Card>
      </div>
    </>
  );
}
