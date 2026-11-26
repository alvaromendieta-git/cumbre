import { CalendarPlus, Download, Gauge, HeartPulse, Moon, Scale, Trophy } from 'lucide-react';
import { useState } from 'react';
import { Card, Empty, Header, Stat, go } from '../components/ui';
import { PmcChart, Sparkline } from '../components/charts';
import { AddSheet, WorkoutChip } from '../components/workout';
import { useTraining } from '../lib/store';
import { addDays, dayLong, diffDays, fmtHours, fmtKm, today, weekStartOf } from '../lib/format';
import { formLabel, pmcAt, rampRate } from '../lib/metrics';

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
  const ramp = rampRate(pmc, t);
  const form = now ? formLabel(now.tsb) : null;
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
        <Card title="Estado de forma" action={<button className="btn sm ghost" onClick={() => go('analisis')}>Ver análisis</button>}>
          {now ? (
            <>
              <div className="stats">
                <Stat big label="Fitness" value={now.ctl.toFixed(0)} tone="fitness" unit="CTL" />
                <Stat big label="Fatiga" value={now.atl.toFixed(0)} tone="fatigue" unit="ATL" />
                <Stat big label="Forma" value={(now.tsb > 0 ? '+' : '') + now.tsb.toFixed(0)} tone="form" unit="TSB" />
              </div>
              <div className="row between sm" style={{ marginTop: 10 }}>
                <span className={`c-${form!.tone}`}>{form!.text}</span>
                {ramp != null && <span className="muted tnum">Rampa {ramp > 0 ? '+' : ''}{ramp.toFixed(1)}/sem</span>}
              </div>
              <div style={{ marginTop: 8 }}><PmcChart points={last90} height={90} compact /></div>
            </>
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
            <Stat label="TSS" value={Math.round(wTss)} unit={pTss ? `/ ${Math.round(pTss)}` : undefined} />
          </div>
          {pTss > 0 && (
            <div style={{ marginTop: 10, height: 6, background: 'var(--c-surface-2)', borderRadius: 3, overflow: 'hidden' }} aria-label={`Completado ${Math.round((wTss / pTss) * 100)}% del TSS planificado`}>
              <div style={{ width: `${Math.min(100, (wTss / pTss) * 100)}%`, height: '100%', background: 'var(--c-accent)' }} />
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
