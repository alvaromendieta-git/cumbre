import { Copy, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Card, Field, Header, Stat, go, query, sportColor, toast } from '../components/ui';
import { ZONE_COLORS } from '../components/charts';
import { SportIcon, WorkoutChip } from '../components/workout';
import { bump, db, uid } from '../lib/db';
import { useTraining } from '../lib/store';
import { addDays, dayLong, fmtDur, fmtPace, parseDur, today } from '../lib/format';
import { compliance, COMPLIANCE_LABEL, lthrFor, stepsTss } from '../lib/metrics';
import { SPORT_LABEL, SPORTS, type Planned, type Sport, type Step, type Thresholds } from '../lib/types';

const TEMPLATES: { name: string; sports: Sport[]; steps: Omit<Step, 'id'>[] }[] = [
  { name: 'Rodaje aeróbico', sports: ['run', 'bike', 'swim', 'row', 'ski', 'walk'], steps: [{ label: 'Calentamiento', duration: 600, intensity: 0.65 }, { label: 'Aeróbico Z2', duration: 2400, intensity: 0.75 }, { label: 'Vuelta a la calma', duration: 300, intensity: 0.6 }] },
  { name: 'Umbral 5×6′', sports: ['run', 'bike'], steps: [{ label: 'Calentamiento', duration: 900, intensity: 0.68 }, { label: 'Umbral', duration: 360, intensity: 1.0, repeat: 5, rest: { duration: 120, intensity: 0.6 } }, { label: 'Vuelta a la calma', duration: 600, intensity: 0.6 }] },
  { name: 'VO2máx 6×3′', sports: ['run', 'bike', 'row'], steps: [{ label: 'Calentamiento', duration: 900, intensity: 0.68 }, { label: 'VO2máx', duration: 180, intensity: 1.12, repeat: 6, rest: { duration: 180, intensity: 0.55 } }, { label: 'Vuelta a la calma', duration: 600, intensity: 0.6 }] },
  { name: 'Sweet spot 3×12′', sports: ['bike'], steps: [{ label: 'Calentamiento', duration: 900, intensity: 0.65 }, { label: 'Sweet spot', duration: 720, intensity: 0.9, repeat: 3, rest: { duration: 300, intensity: 0.55 } }, { label: 'Vuelta a la calma', duration: 600, intensity: 0.55 }] },
  { name: 'Tirada larga', sports: ['run', 'bike', 'walk'], steps: [{ label: 'Progresivo', duration: 900, intensity: 0.68 }, { label: 'Z2 continuo', duration: 4500, intensity: 0.76 }, { label: 'Suelto', duration: 300, intensity: 0.62 }] },
  { name: 'Tempo 2×20′', sports: ['run', 'bike', 'swim'], steps: [{ label: 'Calentamiento', duration: 900, intensity: 0.68 }, { label: 'Tempo', duration: 1200, intensity: 0.88, repeat: 2, rest: { duration: 300, intensity: 0.6 } }, { label: 'Vuelta a la calma', duration: 600, intensity: 0.6 }] },
  { name: 'Fuerza general', sports: ['strength'], steps: [{ label: 'Movilidad', duration: 600, intensity: 0.5 }, { label: 'Circuito', duration: 2400, intensity: 0.72 }, { label: 'Estiramientos', duration: 300, intensity: 0.45 }] },
];

/** Human-readable target for an intensity in the sport's own units. */
function target(sport: Sport, f: number, t: Thresholds): string {
  if (sport === 'bike' && t.ftp) return `${Math.round(f * t.ftp)} W`;
  if (sport === 'run' && t.runPace) return `${fmtPace(f * t.runPace)} /km`;
  if (sport === 'swim' && t.swimPace) return `${fmtPace(f * t.swimPace, 100)} /100m`;
  const l = lthrFor(sport, t);
  if (l) return `~${Math.round(l * (0.55 + 0.45 * Math.min(f, 1.1)))} ppm`;
  return `${Math.round(f * 100)}%`;
}

export default function PlanEditor({ id }: { id?: string }) {
  const data = useTraining();
  const [p, setP] = useState<Planned | null>(null);
  const [durText, setDurText] = useState('');
  useEffect(() => {
    if (!data || p) return;
    const existing = id ? data.planned.find((x) => x.id === id) : undefined;
    const fresh: Planned = { id: uid(), date: query('fecha') ?? today(), sport: (query('deporte') as Sport) ?? 'run', title: '', steps: [] };
    const v = existing ?? fresh;
    setP(v);
    setDurText(v.duration ? fmtDur(v.duration) : '');
  }, [data, id]);
  if (!data || !p) return <Header title="Entreno" back />;
  const th = data.settings.thresholds;
  const steps = p.steps ?? [];
  const est = stepsTss(steps);
  const isNew = !data.planned.some((x) => x.id === p.id);
  const act = data.pairs.get(p.id);
  const c = compliance(p, act);

  const setSteps = (s: Step[]) => {
    const e = stepsTss(s);
    setP({ ...p, steps: s, duration: s.length ? e.duration : p.duration, tss: s.length ? e.tss : p.tss });
    if (s.length) setDurText(fmtDur(e.duration));
  };
  const upd = (i: number, patch: Partial<Step>) => setSteps(steps.map((s, k) => (k === i ? { ...s, ...patch } : s)));
  const save = async () => {
    const dur = durText ? parseDur(durText) : p.duration;
    const final: Planned = { ...p, title: p.title || SPORT_LABEL[p.sport], duration: dur, tss: p.tss ?? (dur ? stepsTss([{ duration: dur, intensity: 0.72 }]).tss : undefined) };
    await db.planned.put(final);
    bump();
    toast(isNew ? 'Entreno planificado' : 'Cambios guardados');
    go('calendario');
  };
  const remove = async () => {
    if (!confirm('¿Eliminar este entreno planificado?')) return;
    await db.planned.delete(p.id);
    bump();
    go('calendario');
  };
  const duplicate = async (days: number) => {
    await db.planned.put({ ...p, id: uid(), date: addDays(p.date, days) });
    bump();
    toast(`Copiado al ${dayLong(addDays(p.date, days))}`);
  };

  // intensity profile
  const blocks: { d: number; f: number }[] = [];
  for (const s of steps) for (let r = 0; r < (s.repeat ?? 1); r++) { blocks.push({ d: s.duration, f: s.intensity }); if (s.rest) blocks.push({ d: s.rest.duration, f: s.rest.intensity }); }
  const totalD = blocks.reduce((a, b) => a + b.d, 0) || 1;

  return (
    <>
      <Header title={isNew ? 'Nuevo entreno' : p.title || 'Entreno planificado'} back right={!isNew ? <button className="icon-btn" aria-label="Eliminar" onClick={remove}><Trash2 size={18} /></button> : undefined} />
      <div className="stack-lg">
        {!isNew && (
          <div className="row sm"><i className={`dot comp-${c}`} /> {COMPLIANCE_LABEL[c]} {act && <span className="muted">· realizado: </span>}</div>
        )}
        {act && <WorkoutChip act={act} />}

        <Card>
          <div className="stack">
            <div className="row wrap" role="radiogroup" aria-label="Deporte">
              {SPORTS.map((s) => (
                <button key={s} className="chip" role="radio" aria-checked={p.sport === s} onClick={() => setP({ ...p, sport: s })} style={p.sport === s ? { borderColor: sportColor(s), color: 'var(--c-text)' } : undefined}>
                  <SportIcon sport={s} size={14} /> {SPORT_LABEL[s]}
                </button>
              ))}
            </div>
            <div className="grid2">
              <Field id="p-title" label="Título"><input id="p-title" className="input" value={p.title} onChange={(e) => setP({ ...p, title: e.target.value })} placeholder="Series en umbral" /></Field>
              <Field id="p-date" label="Fecha"><input id="p-date" type="date" className="input" value={p.date} onChange={(e) => setP({ ...p, date: e.target.value })} /></Field>
              <Field id="p-dur" label="Duración" hint={steps.length ? 'Calculada de los pasos' : 'h:mm:ss'}><input id="p-dur" className="input" value={durText} disabled={!!steps.length} onChange={(e) => setDurText(e.target.value)} placeholder="1:00:00" /></Field>
              <Field id="p-dist" label="Distancia (km)"><input id="p-dist" className="input" inputMode="decimal" value={p.distance ? p.distance / 1000 : ''} onChange={(e) => setP({ ...p, distance: e.target.value ? parseFloat(e.target.value.replace(',', '.')) * 1000 : undefined })} /></Field>
              <Field id="p-tss" label="TSS objetivo" hint={steps.length ? 'Estimado de los pasos' : undefined}><input id="p-tss" className="input" inputMode="numeric" value={p.tss ?? ''} disabled={!!steps.length} onChange={(e) => setP({ ...p, tss: e.target.value ? Number(e.target.value) : undefined })} /></Field>
            </div>
            <Field id="p-desc" label="Descripción"><textarea id="p-desc" className="input" value={p.description ?? ''} onChange={(e) => setP({ ...p, description: e.target.value })} /></Field>
          </div>
        </Card>

        <Card title="Estructura" action={steps.length ? <span className="xs muted tnum">{fmtDur(est.duration)} · {est.tss} TSS</span> : undefined}>
          {blocks.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'flex-end', height: 70, gap: 1, marginBottom: 12 }} aria-label="Perfil de intensidad" role="img">
              {blocks.map((b, i) => {
                const zi = b.f < 0.56 ? 0 : b.f < 0.76 ? 1 : b.f < 0.9 ? 2 : b.f < 1.05 ? 3 : b.f < 1.2 ? 4 : 5;
                return <div key={i} style={{ width: `${(b.d / totalD) * 100}%`, height: `${Math.min(100, (b.f / 1.3) * 100)}%`, background: ZONE_COLORS[zi], borderRadius: 2 }} />;
              })}
            </div>
          )}
          <div className="stack">
            {steps.map((s, i) => (
              <div key={s.id} className="card tight" style={{ background: 'var(--c-surface-2)' }}>
                <div className="row">
                  <input aria-label="Nombre del paso" className="input grow" value={s.label} onChange={(e) => upd(i, { label: e.target.value })} />
                  <button className="icon-btn" aria-label="Quitar paso" onClick={() => setSteps(steps.filter((_, k) => k !== i))}><X size={18} /></button>
                </div>
                <div className="grid3" style={{ marginTop: 8 }}>
                  <Field id={`s-d-${i}`} label="Duración"><input id={`s-d-${i}`} className="input" defaultValue={fmtDur(s.duration)} onBlur={(e) => { const v = parseDur(e.target.value); if (v) upd(i, { duration: v }); }} /></Field>
                  <Field id={`s-i-${i}`} label="% umbral" hint={target(p.sport, s.intensity, th)}><input id={`s-i-${i}`} className="input" inputMode="numeric" value={Math.round(s.intensity * 100)} onChange={(e) => upd(i, { intensity: Number(e.target.value) / 100 || 0 })} /></Field>
                  <Field id={`s-r-${i}`} label="Repeticiones"><input id={`s-r-${i}`} className="input" inputMode="numeric" value={s.repeat ?? 1} onChange={(e) => { const r = Math.max(1, Number(e.target.value) || 1); upd(i, { repeat: r, rest: r > 1 ? s.rest ?? { duration: 120, intensity: 0.55 } : undefined }); }} /></Field>
                </div>
                {s.rest && (
                  <div className="grid2" style={{ marginTop: 8 }}>
                    <Field id={`s-rd-${i}`} label="Recuperación"><input id={`s-rd-${i}`} className="input" defaultValue={fmtDur(s.rest.duration)} onBlur={(e) => { const v = parseDur(e.target.value); if (v) upd(i, { rest: { ...s.rest!, duration: v } }); }} /></Field>
                    <Field id={`s-ri-${i}`} label="% umbral rec." hint={target(p.sport, s.rest.intensity, th)}><input id={`s-ri-${i}`} className="input" inputMode="numeric" value={Math.round(s.rest.intensity * 100)} onChange={(e) => upd(i, { rest: { ...s.rest!, intensity: Number(e.target.value) / 100 || 0 } })} /></Field>
                  </div>
                )}
              </div>
            ))}
            <button className="btn ghost block" onClick={() => setSteps([...steps, { id: uid(), label: 'Bloque', duration: 600, intensity: 0.75 }])}><Plus size={16} /> Añadir paso</button>
          </div>
          <div className="xs muted" style={{ margin: '14px 0 6px' }}>Plantillas</div>
          <div className="row wrap">
            {TEMPLATES.filter((t) => t.sports.includes(p.sport)).map((t) => (
              <button key={t.name} className="chip" onClick={() => { setSteps(t.steps.map((s) => ({ ...s, id: uid() }))); if (!p.title) setP((cur) => cur && { ...cur, title: t.name }); }}>{t.name}</button>
            ))}
          </div>
        </Card>

        {steps.length > 0 && (
          <Card>
            <div className="stats">
              <Stat label="Duración" value={fmtDur(est.duration)} />
              <Stat label="TSS est." value={est.tss} tone="accent" />
              <Stat label="IF est." value={est.duration ? Math.sqrt(est.tss / 100 / (est.duration / 3600)).toFixed(2) : '—'} />
            </div>
          </Card>
        )}

        <button className="btn primary block" onClick={save}>{isNew ? 'Guardar en el calendario' : 'Guardar cambios'}</button>
        {!isNew && (
          <div className="grid2">
            <button className="btn ghost" onClick={() => duplicate(7)}><Copy size={16} /> Copiar a +1 semana</button>
            <button className="btn ghost" onClick={() => duplicate(1)}><Copy size={16} /> Copiar a mañana</button>
          </div>
        )}
      </div>
    </>
  );
}
