import { useEffect, useState } from 'react';
import { Card, Field, Header, Stat, toast } from '../components/ui';
import { Sparkline } from '../components/charts';
import { bump, db } from '../lib/db';
import { useTraining } from '../lib/store';
import { addDays, dayShort, today } from '../lib/format';
import type { DayMetric } from '../lib/types';

const SCALE = ['1', '2', '3', '4', '5'];

export default function Metrics() {
  const data = useTraining();
  const [date, setDate] = useState(today());
  const [m, setM] = useState<DayMetric>({ date });
  useEffect(() => {
    if (data) setM(data.metrics.find((x) => x.date === date) ?? { date });
  }, [data, date]);
  if (!data) return <Header title="Métricas" back="mas" />;
  const last = data.metrics.filter((x) => x.date > addDays(today(), -60));
  const series = (k: keyof DayMetric) => last.map((x) => (typeof x[k] === 'number' ? (x[k] as number) : null));
  const latest = (k: keyof DayMetric) => [...data.metrics].reverse().find((x) => x[k] != null)?.[k] as number | undefined;
  const avg7 = (k: keyof DayMetric) => {
    const v = data.metrics.filter((x) => x.date > addDays(today(), -7) && typeof x[k] === 'number').map((x) => x[k] as number);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined;
  };
  const num = (k: keyof DayMetric, v: string) => setM({ ...m, [k]: v === '' ? undefined : Number(v.replace(',', '.')) });
  const save = async () => {
    await db.metrics.put({ ...m, date });
    bump();
    toast('Métricas guardadas');
  };
  const hrv7 = avg7('hrv');
  const hrvToday = latest('hrv');

  return (
    <>
      <Header title="Métricas" back="mas" />
      <div className="stack-lg">
        <Card title="Tendencias (60 días)">
          <div className="stack">
            {([
              ['hrv', 'VFC', 'ms', 'var(--c-fitness)'],
              ['restHr', 'FC reposo', 'ppm', 'var(--c-fatigue)'],
              ['sleepHours', 'Sueño', 'h', 'var(--c-strength)'],
              ['weight', 'Peso', 'kg', 'var(--c-form)'],
            ] as const).map(([k, l, u, c]) => (
              <div key={k} className="row">
                <div style={{ width: 110 }}><Stat label={l} value={latest(k) ?? '—'} unit={u} /></div>
                <div className="grow"><Sparkline values={series(k)} color={c} /></div>
              </div>
            ))}
          </div>
          {hrv7 && hrvToday && (
            <p className="xs muted" style={{ marginBottom: 0 }}>
              VFC de hoy {hrvToday > hrv7 * 1.05 ? 'por encima' : hrvToday < hrv7 * 0.92 ? 'claramente por debajo' : 'en línea con'} tu media de 7 días ({hrv7.toFixed(0)} ms){hrvToday < hrv7 * 0.92 ? ': considera una sesión suave.' : '.'}
            </p>
          )}
        </Card>

        <Card title="Registrar día">
          <div className="stack">
            <Field id="m-date" label="Fecha"><input id="m-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <div className="grid2">
              <Field id="m-hrv" label="VFC (ms)"><input id="m-hrv" className="input" inputMode="decimal" value={m.hrv ?? ''} onChange={(e) => num('hrv', e.target.value)} /></Field>
              <Field id="m-rhr" label="FC reposo"><input id="m-rhr" className="input" inputMode="numeric" value={m.restHr ?? ''} onChange={(e) => num('restHr', e.target.value)} /></Field>
              <Field id="m-sleep" label="Sueño (h)"><input id="m-sleep" className="input" inputMode="decimal" value={m.sleepHours ?? ''} onChange={(e) => num('sleepHours', e.target.value)} /></Field>
              <Field id="m-w" label="Peso (kg)"><input id="m-w" className="input" inputMode="decimal" value={m.weight ?? ''} onChange={(e) => num('weight', e.target.value)} /></Field>
            </div>
            {([
              ['sleepQuality', 'Calidad del sueño'],
              ['fatigue', 'Fatiga'],
              ['soreness', 'Dolor muscular'],
              ['stress', 'Estrés'],
              ['mood', 'Ánimo'],
            ] as const).map(([k, l]) => (
              <div key={k}>
                <div className="xs muted" style={{ marginBottom: 4 }}>{l} (1 bajo – 5 alto)</div>
                <div className="rpe" style={{ gridTemplateColumns: 'repeat(5,1fr)' }} role="group" aria-label={l}>
                  {SCALE.map((s) => <button key={s} aria-pressed={m[k] === Number(s)} onClick={() => setM({ ...m, [k]: m[k] === Number(s) ? undefined : Number(s) })}>{s}</button>)}
                </div>
              </div>
            ))}
            <Field id="m-notes" label="Notas"><textarea id="m-notes" className="input" value={m.notes ?? ''} onChange={(e) => setM({ ...m, notes: e.target.value })} /></Field>
            <button className="btn primary block" onClick={save}>Guardar</button>
          </div>
        </Card>

        {last.length > 0 && (
          <Card title="Últimos registros">
            <div className="scroll-x">
              <table className="t">
                <thead><tr><th>Día</th><th className="r">VFC</th><th className="r">Reposo</th><th className="r">Sueño</th><th className="r">Peso</th></tr></thead>
                <tbody>
                  {[...last].reverse().slice(0, 14).map((x) => (
                    <tr key={x.date} onClick={() => setDate(x.date)} style={{ cursor: 'pointer' }}><td>{dayShort(x.date)}</td><td className="r">{x.hrv ?? '—'}</td><td className="r">{x.restHr ?? '—'}</td><td className="r">{x.sleepHours ?? '—'}</td><td className="r">{x.weight ?? '—'}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
