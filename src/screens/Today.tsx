import { AlertTriangle, BatteryCharging, CalendarPlus, Download, Flame, Gauge, HeartPulse, Moon, Scale, TrendingUp, Trophy } from 'lucide-react';
import { useState } from 'react';
import { Card, CountUp, Empty, Header, Stat, Trend, go } from '../components/ui';
import { PmcChart, Sparkline } from '../components/charts';
import { AddSheet, WorkoutChip } from '../components/workout';
import { useTraining } from '../lib/store';
import { addDays, dayLong, diffDays, fmtHours, fmtKm, today, weekStartOf } from '../lib/format';
import { pmcAt, trainingStatus, tsbColor, type StatusLevel } from '../lib/metrics';

export default function Today() {
  const data = useTraining();
  const [add, setAdd] = useState(false);
  const t = today();
  if (!data) return <><Header title="Hoy" /><div className="stack"><div className="skeleton" style={{ height: 140 }} /><div className="skeleton" style={{ height: 90 }} /></div></>;
  const { acts, pmc, byDate, plannedByDate, pairs, settings, metrics, events } = data;

  if (!acts.length && !data.planned.length) {
    return (
      <>
        <Header title="Cumbre" />
        <Card>
          <Empty icon={<Download size={40} />} title="Empieza con tu historial">
            Importa tus entrenamientos anteriores (FIT, GPX, TCX, CSV de Strava, TrainingPeaks o Garmin) y calcularé tus umbrales, zonas y tu forma actual.
          </Empty>
          <div className="stack">
            <button className="btn primary block" onClick={() => go('importar')}>Importar historial</button>
            <button className="btn ghost block" onClick={() => go('zonas')}>Introducir umbrales a mano</button>
            <button className="btn ghost block" onClick={() => setAdd(true)}>Planificar mi primer entreno</button>
          </div>
        </Card>
        <AddSheet open={add} onClose={() => setAdd(false)} />
      </>
    );
  }

  const now = pmcAt(pmc, t);
  const st = trainingStatus(pmc, t);
  const alert = st.level === 'danger' || st.level === 'overreach';
  const StIcon = ({ danger: AlertTriangle, overreach: Flame, productive: TrendingUp, fresh: BatteryCharging, detraining: BatteryCharging, neutral: Gauge, empty: Gauge } as Record<StatusLevel, typeof Gauge>)[st.level];
  // needle position on the gauge: TSB -50 (left, red) .. +40 (right)
  const needle = now ? Math.max(2, Math.min(98, ((now.tsb + 50) / 90) * 100)) : 50;
  const todayActs = byDate.get(t) ?? [];
  const todayPlans = plannedByDate.get(t) ?? [];
  const pairedIds = new Set([...pairs.values()].map((a) => a.id));
  const tomorrowPlans = plannedByDate.get(addDays(t, 1)) ?? [];

  // week summary
  const ws = weekStartOf(t, settings.weekStart);
  let wDur = 0, wDist = 0, wTss = 0, pDur = 0, pTss = 0;
  for (let i = 0; i < 7; i++) {
    const d = addDays(ws, i);
    for (const a of byDate.get(d) ?? []) { wDur += a.duration; wDist += a.distance ?? 0; wTss += a.tss ?? 0; }
    for (const p of plannedByDate.get(d) ?? []) { pDur += p.duration ?? 0; pTss += p.tss ?? 0; }
  }
  const last90 = pmc.filter((p) => p.date > addDays(t, -90) && p.date <= addDays(t, 14));
  const nextEvent = events.find((e) => e.date >= t);
  const lastMetric = [...metrics].reverse().find((m) => m.hrv || m.restHr || m.sleepHours || m.weight);
  const hrvSeries = metrics.filter((m) => m.date > addDays(t, -30)).map((m) => m.hrv ?? null);

  return (
    <>
      <Header title={<span>Hoy <span className="muted sm" style={{ fontWeight: 500 }}>· {dayLong(t)}</span></span>} right={<button className="icon-btn" aria-label="Añadir entreno" onClick={() => setAdd(true)}><CalendarPlus size={20} /></button>} />
      <div className="stack-lg">
        <Card tint={st.color} className={alert ? 'alert' : ''} title="Estado de forma" action={<button className="btn sm ghost" onClick={() => go('analisis')}>Análisis</button>}>
          {now ? (
            <div className="stack">
              <div className="row between wrap">
                <span className="status-pill"><span className="pulse" /><StIcon size={16} /> {st.label}</span>
                {st.acwr != null && <span className="xs muted tnum">Carga aguda/crónica <b style={{ color: st.acwr > 1.3 ? 'var(--st-danger)' : st.acwr < 0.8 ? 'var(--st-detraining)' : 'var(--st-fresh)' }}>{st.acwr.toFixed(2)}</b></span>}
              </div>
              <div className="stats">
                <Stat big glow label="Fitness" value={<CountUp value={now.ctl} />} tone="fitness" unit="CTL" extra={<Trend delta={st.ctlDelta} badWhen="down" />} />
                <Stat big glow label="Fatiga" value={<CountUp value={now.atl} />} color={alert ? 'var(--st-danger)' : 'var(--c-fatigue)'} unit="ATL" extra={<Trend delta={st.atlDelta} badWhen="up" />} />
                <Stat big glow label="Forma" value={<CountUp value={now.tsb} prefix="±" />} color={tsbColor(now.tsb)} unit="TSB" />
              </div>
              <div>
                <div className="gauge" role="meter" aria-valuemin={-50} aria-valuemax={40} aria-valuenow={Math.round(now.tsb)} aria-label="Forma">
                  <span className="needle" style={{ left: `${needle}%` }} />
                </div>
                <div className="row between" style={{ fontSize: 10, marginTop: 6, color: 'var(--c-text-muted)' }}>
                  <span style={{ color: 'var(--st-danger)' }}>Fatiga</span><span>Productivo</span><span>Equilibrado</span><span style={{ color: 'var(--st-fresh)' }}>Fresco</span>
                </div>
              </div>
              <p className="sm" style={{ margin: 0, color: alert ? st.color : undefined }}>{alert && <AlertTriangle size={14} style={{ verticalAlign: -2, marginRight: 4 }} />}{st.advice}</p>
              <PmcChart points={last90} height={96} compact />
            </div>
          ) : <p className="muted sm">Sin carga registrada todavía.</p>}
        </Card>

        <section className="stack">
          <h2 className="section-title">Hoy</h2>
          {todayPlans.map((p) => <WorkoutChip key={p.id} plan={p} act={pairs.get(p.id)} />)}
          {todayActs.filter((a) => !pairedIds.has(a.id)).map((a) => <WorkoutChip key={a.id} act={a} />)}
          {!todayPlans.length && !todayActs.length && (
            <button className="add-day" onClick={() => setAdd(true)}>Día libre · toca para añadir un entreno</button>
          )}
          {tomorrowPlans.length > 0 && (
            <>
              <h2 className="section-title">Mañana</h2>
              {tomorrowPlans.map((p) => <WorkoutChip key={p.id} plan={p} act={pairs.get(p.id)} />)}
            </>
          )}
        </section>

        <Card title="Esta semana" action={<button className="btn sm ghost" onClick={() => go('calendario')}>Calendario</button>}>
          <div className="stats">
            <Stat label="Tiempo" value={fmtHours(wDur)} unit={pDur ? `/ ${fmtHours(pDur)}` : 'h'} />
            <Stat label="Distancia" value={fmtKm(wDist, 1)} unit="km" />
            <Stat label="TSS" value={<CountUp value={wTss} />} unit={pTss ? `/ ${Math.round(pTss)}` : undefined} />
          </div>
          {pTss > 0 && (
            <div className="progress" style={{ marginTop: 12 }} aria-label={`Completado ${Math.round((wTss / pTss) * 100)}% del TSS planificado`}>
              <div style={{ width: `${Math.min(100, (wTss / pTss) * 100)}%` }} />
            </div>
          )}
        </Card>

        <div className="grid2">
          {nextEvent && (
            <button className="card tappable" onClick={() => go('plan-anual')}>
              <div className="row muted xs"><Trophy size={14} /> PRÓXIMO OBJETIVO</div>
              <div className="b ellipsis" style={{ marginTop: 4 }}>{nextEvent.name}</div>
              <div className="xl c-accent">{diffDays(t, nextEvent.date)}<small className="xs muted"> días</small></div>
            </button>
          )}
          <button className="card tappable" onClick={() => go('metricas')}>
            <div className="row muted xs"><HeartPulse size={14} /> MÉTRICAS</div>
            {lastMetric ? (
              <div className="xs" style={{ marginTop: 6, lineHeight: '20px' }}>
                {lastMetric.hrv != null && <div><Gauge size={12} /> VFC <b>{lastMetric.hrv}</b> ms</div>}
                {lastMetric.restHr != null && <div><HeartPulse size={12} /> Reposo <b>{lastMetric.restHr}</b> ppm</div>}
                {lastMetric.sleepHours != null && <div><Moon size={12} /> Sueño <b>{lastMetric.sleepHours}</b> h</div>}
                {lastMetric.weight != null && <div><Scale size={12} /> Peso <b>{lastMetric.weight}</b> kg</div>}
                <Sparkline values={hrvSeries} color="var(--c-fitness)" height={24} />
              </div>
            ) : <div className="sm muted" style={{ marginTop: 6 }}>Registra sueño, VFC o peso</div>}
          </button>
          {!nextEvent && (
            <button className="card tappable" onClick={() => go('plan-anual')}>
              <div className="row muted xs"><Trophy size={14} /> OBJETIVO</div>
              <div className="sm" style={{ marginTop: 6 }}>Añade tu próxima carrera y planifica la temporada</div>
            </button>
          )}
        </div>

        {!settings.thresholds.lthrRun && !settings.thresholds.ftp && !settings.thresholds.runPace && (
          <Card>
            <div className="sm">Aún no tienes umbrales. Los TSS se están estimando por RPE.</div>
            <button className="btn primary block" style={{ marginTop: 10 }} onClick={() => go('zonas')}>Calcular umbrales desde mi historial</button>
          </Card>
        )}
      </div>
      <AddSheet open={add} onClose={() => setAdd(false)} />
    </>
  );
}
