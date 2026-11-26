import { Flag, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Card, Empty, Field, Header, Sheet, Stat, toast } from '../components/ui';
import { BarChart, type Bar } from '../components/charts';
import { bump, db, uid } from '../lib/db';
import { useTraining } from '../lib/store';
import { addDays, dayLong, dayShort, diffDays, today, weekStartOf } from '../lib/format';
import { pmcAt } from '../lib/metrics';
import { SPORT_LABEL, SPORTS, type RaceEvent, type Sport } from '../lib/types';

interface WeekPlan { start: string; phase: string; tss: number; ctl: number; recovery: boolean }

const K = Math.pow(41 / 42, 7);

/** Week-by-week load plan from today's CTL to a target CTL on race day, with recovery weeks and taper. */
export function buildSeason(startCtl: number, from: string, race: string, targetCtl: number, weekStart: 0 | 1): WeekPlan[] {
  const weeks: WeekPlan[] = [];
  const first = weekStartOf(from, weekStart);
  const n = Math.max(1, Math.ceil((diffDays(first, race) + 1) / 7));
  const taperWeeks = n >= 6 ? 2 : 1;
  const buildWeeks = n - taperWeeks;
  // ramp so that CTL hits target at end of build (recovery weeks don't ramp)
  const recov = (i: number) => i % 4 === 3 && i < buildWeeks - 1;
  const rampWeeks = Array.from({ length: buildWeeks }, (_, i) => i).filter((i) => !recov(i)).length || 1;
  const step = (targetCtl - startCtl) / rampWeeks;
  let ctl = startCtl;
  for (let i = 0; i < n; i++) {
    const wsd = addDays(first, i * 7);
    const weeksOut = n - i;
    let phase = weeksOut > 12 ? 'Base' : weeksOut > taperWeeks + 3 ? 'Construcción' : weeksOut > taperWeeks ? 'Pico' : 'Puesta a punto';
    let goal: number;
    const r = recov(i) && phase !== 'Puesta a punto';
    if (phase === 'Puesta a punto') goal = ctl * (weeksOut === 1 ? 0.92 : 0.96);
    else if (r) goal = ctl * 0.97;
    else goal = ctl + step;
    if (r) phase = 'Recuperación';
    const daily = Math.max(0, (goal - K * ctl) / (1 - K));
    ctl = daily + (ctl - daily) * K;
    weeks.push({ start: wsd, phase, tss: Math.round(daily * 7), ctl, recovery: r });
  }
  return weeks;
}

export default function AnnualPlan() {
  const data = useTraining();
  const [edit, setEdit] = useState<RaceEvent | null>(null);
  if (!data) return <Header title="Plan anual" back="mas" />;
  const t = today();
  const { events, pmc, settings, planned } = data;
  const upcoming = events.filter((e) => e.date >= t);
  const past = events.filter((e) => e.date < t).reverse();
  const a = upcoming.find((e) => e.priority === 'A') ?? upcoming[0];
  const ctlNow = pmcAt(pmc, t)?.ctl ?? 0;
  const target = a?.targetCtl ?? Math.round(Math.min(ctlNow + 5 * Math.max(1, diffDays(t, a?.date ?? t) / 7), ctlNow * 1.6 + 20));
  const season = a ? buildSeason(ctlNow, t, a.date, target, settings.weekStart) : [];
  const bars: Bar[] = season.map((w) => {
    const pl = planned.filter((p) => p.date >= w.start && p.date <= addDays(w.start, 6)).reduce((s, p) => s + (p.tss ?? 0), 0);
    return { key: w.start, label: dayShort(w.start), value: w.tss, planned: pl || undefined, highlight: w.start === weekStartOf(t, settings.weekStart) };
  });

  const blank = (): RaceEvent => ({ id: uid(), date: addDays(t, 84), name: '', sport: 'run', priority: 'A' });

  return (
    <>
      <Header title="Plan anual" back="mas" right={<button className="icon-btn" aria-label="Añadir objetivo" onClick={() => setEdit(blank())}><Plus size={20} /></button>} />
      <div className="stack-lg">
        {!events.length && (
          <Card>
            <Empty icon={<Flag size={40} />} title="Sin objetivos">Añade tu carrera principal (A) y las secundarias (B/C). Calcularé la carga semanal para llegar en forma.</Empty>
            <button className="btn primary block" onClick={() => setEdit(blank())}>Añadir objetivo</button>
          </Card>
        )}

        {a && (
          <Card title={`Hacia ${a.name}`}>
            <div className="stats">
              <Stat label="Faltan" value={diffDays(t, a.date)} unit="días" tone="accent" />
              <Stat label="CTL hoy" value={ctlNow.toFixed(0)} tone="fitness" />
              <Stat label="CTL objetivo" value={target} tone="fitness" />
            </div>
            <div className="row sm" style={{ marginTop: 10 }}>
              <label htmlFor="ctl-t" className="muted">Objetivo CTL</label>
              <input id="ctl-t" type="range" className="grow" min={Math.round(ctlNow)} max={Math.round(ctlNow + 60)} value={target} onChange={async (e) => { await db.events.put({ ...a, targetCtl: Number(e.target.value) }); bump(); }} />
            </div>
            <p className="xs muted">Rampa media: {season.length ? ((target - ctlNow) / Math.max(1, season.filter((w) => !w.recovery && w.phase !== 'Puesta a punto').length)).toFixed(1) : 0} CTL/semana. Entre 3 y 7 es sostenible; por encima de 8, riesgo de sobrecarga.</p>
            <BarChart bars={bars} />
            <div className="xs muted">Barras: TSS semanal objetivo · Recuadro discontinuo: TSS que ya tienes planificado</div>
            <div className="scroll-x" style={{ marginTop: 10 }}>
              <table className="t">
                <thead><tr><th>Semana</th><th>Fase</th><th className="r">TSS</th><th className="r">≈ h</th><th className="r">CTL</th></tr></thead>
                <tbody>
                  {season.map((w) => (
                    <tr key={w.start} style={w.recovery ? { color: 'var(--c-text-muted)' } : undefined}>
                      <td>{dayShort(w.start)}</td><td>{w.phase}</td><td className="r">{w.tss}</td><td className="r">{(w.tss / 60).toFixed(1)}</td><td className="r">{w.ctl.toFixed(0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="xs muted" style={{ marginBottom: 0 }}>Las horas son orientativas (≈60 TSS por hora a intensidad moderada).</p>
          </Card>
        )}

        {upcoming.length > 0 && (
          <section className="stack">
            <h2 className="section-title">Próximos</h2>
            {upcoming.map((e) => <EventRow key={e.id} e={e} onClick={() => setEdit(e)} />)}
          </section>
        )}
        {past.length > 0 && (
          <section className="stack">
            <h2 className="section-title">Pasados</h2>
            {past.map((e) => <EventRow key={e.id} e={e} onClick={() => setEdit(e)} />)}
          </section>
        )}
      </div>
      {edit && <EventSheet ev={edit} onClose={() => setEdit(null)} isNew={!events.some((x) => x.id === edit.id)} />}
    </>
  );
}

function EventRow({ e, onClick }: { e: RaceEvent; onClick: () => void }) {
  return (
    <button className="wo" onClick={onClick}>
      <span className="chip" style={{ color: e.priority === 'A' ? 'var(--c-accent)' : undefined }}>{e.priority}</span>
      <span className="grow">
        <span className="title">{e.name}</span>
        <span className="meta"><span style={{ textTransform: 'capitalize' }}>{dayLong(e.date)}</span><span>{SPORT_LABEL[e.sport]}</span>{e.goal && <span>Meta: {e.goal}</span>}</span>
      </span>
      <span className="b c-accent tnum">{Math.max(0, diffDays(today(), e.date))}d</span>
    </button>
  );
}

function EventSheet({ ev, onClose, isNew }: { ev: RaceEvent; onClose: () => void; isNew: boolean }) {
  const [e, setE] = useState(ev);
  const save = async () => {
    if (!e.name.trim()) return toast('Pon un nombre');
    await db.events.put(e);
    bump();
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title={isNew ? 'Nuevo objetivo' : 'Editar objetivo'}>
      <div className="stack">
        <Field id="e-name" label="Nombre"><input id="e-name" className="input" value={e.name} onChange={(x) => setE({ ...e, name: x.target.value })} placeholder="Maratón de Valencia" /></Field>
        <div className="grid2">
          <Field id="e-date" label="Fecha"><input id="e-date" type="date" className="input" value={e.date} onChange={(x) => setE({ ...e, date: x.target.value })} /></Field>
          <Field id="e-sport" label="Deporte"><select id="e-sport" className="input" value={e.sport} onChange={(x) => setE({ ...e, sport: x.target.value as Sport })}>{SPORTS.map((s) => <option key={s} value={s}>{SPORT_LABEL[s]}</option>)}</select></Field>
          <Field id="e-pri" label="Prioridad" hint="A: principal · C: preparación"><select id="e-pri" className="input" value={e.priority} onChange={(x) => setE({ ...e, priority: x.target.value as RaceEvent['priority'] })}><option>A</option><option>B</option><option>C</option></select></Field>
          <Field id="e-goal" label="Meta"><input id="e-goal" className="input" value={e.goal ?? ''} onChange={(x) => setE({ ...e, goal: x.target.value })} placeholder="3:15:00" /></Field>
        </div>
        <button className="btn primary block" onClick={save}>Guardar</button>
        {!isNew && <button className="btn danger block" onClick={async () => { await db.events.delete(e.id); bump(); onClose(); }}><Trash2 size={16} /> Eliminar</button>}
      </div>
    </Sheet>
  );
}
