import { useState } from 'react';
import { Bike, Dumbbell, Footprints, Mountain, Snowflake, Waves, Activity as ActIcon, Sailboat } from 'lucide-react';
import type { Activity, Planned, Sport } from '../lib/types';
import { SPORT_LABEL, SPORTS } from '../lib/types';
import { compliance, COMPLIANCE_LABEL, stepsTss, TSS_LABEL, withTss } from '../lib/metrics';
import { fmtDur, fmtKm, parseDur, speedFor, today } from '../lib/format';
import { bump, db, getSettings, uid } from '../lib/db';
import { Field, Sheet, go, sportColor, toast } from './ui';

export function SportIcon({ sport, size = 18 }: { sport: Sport; size?: number }) {
  const p = { size, color: sportColor(sport), 'aria-hidden': true } as const;
  switch (sport) {
    case 'run': return <Footprints {...p} />;
    case 'bike': return <Bike {...p} />;
    case 'swim': return <Waves {...p} />;
    case 'strength': return <Dumbbell {...p} />;
    case 'walk': return <Mountain {...p} />;
    case 'row': return <Sailboat {...p} />;
    case 'ski': return <Snowflake {...p} />;
    default: return <ActIcon {...p} />;
  }
}

/** A planned workout, a completed one, or both paired. */
export function WorkoutChip({ act, plan }: { act?: Activity; plan?: Planned }) {
  const sport = act?.sport ?? plan?.sport ?? 'other';
  const c = compliance(plan, act);
  const title = act?.name || plan?.title || SPORT_LABEL[sport];
  const sp = act?.avgSpeed ? speedFor(sport, act.avgSpeed) : null;
  const label = `${SPORT_LABEL[sport]}: ${title}. ${plan ? COMPLIANCE_LABEL[c] : 'Realizado'}`;
  return (
    <button className={`wo ${!act ? 'planned' : ''}`} onClick={() => (act ? go(`entreno/${act.id}`) : go(`plan/${plan!.id}`))} aria-label={label}>
      <span className="bar" style={{ background: sportColor(sport) }} />
      <span className="grow" style={{ minWidth: 0 }}>
        <span className="row" style={{ gap: 6 }}>
          <SportIcon sport={sport} size={16} />
          <span className="title ellipsis grow">{title}</span>
          {plan && <i className={`dot comp-${c}`} title={COMPLIANCE_LABEL[c]} />}
        </span>
        <span className="meta">
          {act ? (
            <>
              <span><b>{fmtDur(act.duration)}</b></span>
              {act.distance ? <span><b>{fmtKm(act.distance, 2)}</b> km</span> : null}
              {act.tss != null && <span><b>{act.tss}</b> {TSS_LABEL[act.tssMethod ?? 'none']}</span>}
              {sp && sport !== 'strength' && <span>{sp.value} {sp.unit}</span>}
            </>
          ) : (
            <>
              <span>Plan:</span>
              {plan?.duration ? <span><b>{fmtDur(plan.duration)}</b></span> : null}
              {plan?.distance ? <span><b>{fmtKm(plan.distance, 1)}</b> km</span> : null}
              {plan?.tss ? <span><b>{plan.tss}</b> TSS</span> : null}
            </>
          )}
          {act && plan && (
            <span>
              plan {plan.duration ? fmtDur(plan.duration, true) : ''} {plan.tss ? `· ${plan.tss} TSS` : ''}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

/** Quick add: planned workout (future/today) or a manual completed activity. */
export function AddSheet({ open, onClose, date }: { open: boolean; onClose: () => void; date?: string }) {
  const [kind, setKind] = useState<'plan' | 'done'>(date && date < today() ? 'done' : 'plan');
  const [sport, setSport] = useState<Sport>('run');
  const [d, setD] = useState(date ?? today());
  const [title, setTitle] = useState('');
  const [dur, setDur] = useState('');
  const [dist, setDist] = useState('');
  const [tss, setTss] = useState('');
  const [rpe, setRpe] = useState('5');
  const [avgHr, setAvgHr] = useState('');
  const [desc, setDesc] = useState('');
  const [err, setErr] = useState<string>();

  const save = async () => {
    const seconds = dur ? parseDur(dur) : undefined;
    if (dur && !seconds) return setErr('Duración no válida (usa 1:15:00 o 45)');
    const meters = dist ? parseFloat(dist.replace(',', '.')) * 1000 : undefined;
    if (kind === 'plan') {
      const p: Planned = { id: uid(), date: d, sport, title: title || `${SPORT_LABEL[sport]}`, duration: seconds, distance: meters, tss: tss ? Number(tss) : seconds ? stepsTss([{ duration: seconds, intensity: 0.7 }]).tss : undefined, description: desc || undefined };
      await db.planned.put(p);
      toast('Entreno planificado');
    } else {
      if (!seconds) return setErr('Indica la duración');
      const s = await getSettings();
      const start = new Date(d + 'T09:00:00').getTime();
      const a = withTss(
        { id: uid(), sport, date: d, start, name: title || SPORT_LABEL[sport], duration: seconds, distance: meters, avgSpeed: meters ? meters / seconds : undefined, avgHr: avgHr ? Number(avgHr) : undefined, rpe: Number(rpe), fileTss: tss ? Number(tss) : undefined, notes: desc || undefined, source: 'manual' },
        s.thresholds,
      );
      await db.activities.put(a);
      toast('Entreno registrado');
    }
    bump();
    onClose();
    setTitle(''); setDur(''); setDist(''); setTss(''); setDesc(''); setAvgHr(''); setErr(undefined);
  };

  return (
    <Sheet open={open} onClose={onClose} title="Añadir">
      <div className="stack">
        <div className="seg" role="tablist" aria-label="Tipo">
          <button role="tab" aria-selected={kind === 'plan'} onClick={() => setKind('plan')}>Planificar</button>
          <button role="tab" aria-selected={kind === 'done'} onClick={() => setKind('done')}>Registrar hecho</button>
        </div>
        <div className="row wrap" role="radiogroup" aria-label="Deporte">
          {SPORTS.map((s) => (
            <button key={s} className="chip" role="radio" aria-checked={sport === s} onClick={() => setSport(s)} style={sport === s ? { borderColor: sportColor(s), color: 'var(--c-text)' } : undefined}>
              <SportIcon sport={s} size={14} /> {SPORT_LABEL[s]}
            </button>
          ))}
        </div>
        <div className="grid2">
          <Field label="Fecha" id="a-date"><input id="a-date" className="input" type="date" value={d} onChange={(e) => setD(e.target.value)} /></Field>
          <Field label="Título" id="a-title"><input id="a-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Rodaje suave" /></Field>
          <Field label="Duración" id="a-dur" hint="h:mm:ss o minutos" error={err}><input id="a-dur" className="input" inputMode="numeric" value={dur} onChange={(e) => setDur(e.target.value)} placeholder="1:00:00" /></Field>
          <Field label="Distancia (km)" id="a-dist"><input id="a-dist" className="input" inputMode="decimal" value={dist} onChange={(e) => setDist(e.target.value)} placeholder="10" /></Field>
          <Field label={kind === 'plan' ? 'TSS objetivo' : 'TSS (opcional)'} id="a-tss" hint={kind === 'plan' ? 'Vacío: se estima' : 'Vacío: se calcula'}><input id="a-tss" className="input" inputMode="numeric" value={tss} onChange={(e) => setTss(e.target.value)} /></Field>
          {kind === 'done' && <Field label="FC media" id="a-hr"><input id="a-hr" className="input" inputMode="numeric" value={avgHr} onChange={(e) => setAvgHr(e.target.value)} /></Field>}
        </div>
        {kind === 'done' && (
          <Field label={`Esfuerzo percibido (RPE): ${rpe}`} id="a-rpe">
            <input id="a-rpe" type="range" min={1} max={10} value={rpe} onChange={(e) => setRpe(e.target.value)} />
          </Field>
        )}
        <Field label="Descripción" id="a-desc"><textarea id="a-desc" className="input" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Calentamiento 15', 3×10' en Z3, vuelta a la calma" /></Field>
        <button className="btn primary block" onClick={save}>Guardar</button>
        {kind === 'plan' && (
          <button className="btn ghost block" onClick={() => { onClose(); go(`constructor?fecha=${d}&deporte=${sport}`); }}>
            Diseñar entreno estructurado
          </button>
        )}
      </div>
    </Sheet>
  );
}
