import { Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Card, Field, Header, Seg, toast } from '../components/ui';
import { ZONE_COLORS } from '../components/charts';
import { saveSettings } from '../lib/db';
import { recomputeAll } from '../lib/importer';
import { useTraining } from '../lib/store';
import { fmtPace, parsePace } from '../lib/format';
import { HR_ZONES_BIKE, HR_ZONES_RUN, PACE_ZONES, POWER_ZONES, SWIM_ZONES, type Zone } from '../lib/metrics';
import { detectThresholds, type Suggestion } from '../lib/thresholds';
import type { Thresholds } from '../lib/types';

type Form = Record<keyof Thresholds, string>;
const KEYS: (keyof Thresholds)[] = ['ftp', 'runPace', 'swimPace', 'lthrRun', 'lthrBike', 'maxHr', 'restHr', 'weight'];

function toForm(t: Thresholds): Form {
  const f = {} as Form;
  for (const k of KEYS) {
    const v = t[k];
    f[k] = v == null ? '' : k === 'runPace' ? fmtPace(v) : k === 'swimPace' ? fmtPace(v, 100) : String(v);
  }
  return f;
}

export default function Zones() {
  const data = useTraining();
  const [form, setForm] = useState<Form | null>(null);
  const [sugs, setSugs] = useState<Suggestion[] | null>(null);
  const [tab, setTab] = useState<'run' | 'bike' | 'swim'>('run');
  const [errors, setErrors] = useState<Partial<Record<keyof Thresholds, string>>>({});
  useEffect(() => {
    if (data && !form) setForm(toForm(data.settings.thresholds));
  }, [data]);
  if (!data || !form) return <Header title="Zonas y umbrales" back="mas" />;
  const th = data.settings.thresholds;

  const set = (k: keyof Thresholds, v: string) => setForm({ ...form, [k]: v });

  const parse = (): Thresholds | null => {
    const out: Thresholds = {};
    const errs: typeof errors = {};
    for (const k of KEYS) {
      const v = form[k].trim();
      if (!v) continue;
      if (k === 'runPace') { const s = parsePace(v); s ? (out[k] = s) : (errs[k] = 'Formato m:ss'); }
      else if (k === 'swimPace') { const s = parsePace(v); s ? (out[k] = s / 10) : (errs[k] = 'Formato m:ss'); }
      else { const n = Number(v.replace(',', '.')); n > 0 ? (out[k] = n) : (errs[k] = 'Número no válido'); }
    }
    setErrors(errs);
    return Object.keys(errs).length ? null : out;
  };

  const save = async (t?: Thresholds) => {
    const next = t ?? parse();
    if (!next) return;
    await saveSettings({ thresholds: next, thresholdsAt: Date.now() });
    await recomputeAll();
    setForm(toForm(next));
    toast('Umbrales guardados · TSS recalculado');
  };

  const detect = () => setSugs(detectThresholds(data.acts, data.metrics));
  const applyAll = async () => {
    if (!sugs) return;
    const next: Thresholds = { ...th };
    for (const s of sugs) (next as Record<string, number>)[s.key] = s.value;
    await save(next);
    setSugs(null);
  };

  return (
    <>
      <Header title="Zonas y umbrales" back="mas" />
      <div className="stack-lg">
        <Card title="Detectar desde tu historial">
          <p className="sm muted" style={{ marginTop: 0 }}>Analizo tus entrenamientos de los últimos meses ({data.acts.length} en total) para proponer FTP, FC umbral, ritmo umbral, CSS y FC máxima.</p>
          <button className="btn primary block" onClick={detect} disabled={!data.acts.length}><Sparkles size={16} /> Analizar historial</button>
          {sugs && (
            <div className="stack" style={{ marginTop: 12 }}>
              {!sugs.length && <p className="sm muted">No hay suficientes datos. Importa más entrenamientos.</p>}
              {sugs.map((s) => (
                <div key={s.key} className="card tight" style={{ background: 'var(--c-surface-2)' }}>
                  <div className="row between">
                    <span className="b sm">{s.label}</span>
                    <span className="lg c-accent tnum">{s.display}</span>
                  </div>
                  <div className="xs muted">{s.evidence} · confianza {s.confidence}</div>
                  <button className="btn sm ghost" style={{ marginTop: 6 }} onClick={() => save({ ...th, [s.key]: s.value })}>Aplicar solo este</button>
                </div>
              ))}
              {sugs.length > 0 && <button className="btn primary block" onClick={applyAll}>Aplicar todos y recalcular</button>}
            </div>
          )}
        </Card>

        <Card title="Mis umbrales">
          <div className="grid2">
            <Field id="z-lthrRun" label="FC umbral carrera" hint="ppm (LTHR)" error={errors.lthrRun}><input id="z-lthrRun" className="input" inputMode="numeric" value={form.lthrRun} onChange={(e) => set('lthrRun', e.target.value)} /></Field>
            <Field id="z-runPace" label="Ritmo umbral" hint="min/km, p.ej. 4:26" error={errors.runPace}><input id="z-runPace" className="input" value={form.runPace} onChange={(e) => set('runPace', e.target.value)} placeholder="4:30" /></Field>
            <Field id="z-ftp" label="FTP" hint="vatios" error={errors.ftp}><input id="z-ftp" className="input" inputMode="numeric" value={form.ftp} onChange={(e) => set('ftp', e.target.value)} /></Field>
            <Field id="z-lthrBike" label="FC umbral bici" hint="ppm" error={errors.lthrBike}><input id="z-lthrBike" className="input" inputMode="numeric" value={form.lthrBike} onChange={(e) => set('lthrBike', e.target.value)} /></Field>
            <Field id="z-swim" label="CSS natación" hint="min/100m" error={errors.swimPace}><input id="z-swim" className="input" value={form.swimPace} onChange={(e) => set('swimPace', e.target.value)} placeholder="1:45" /></Field>
            <Field id="z-max" label="FC máxima" hint="ppm" error={errors.maxHr}><input id="z-max" className="input" inputMode="numeric" value={form.maxHr} onChange={(e) => set('maxHr', e.target.value)} /></Field>
            <Field id="z-rest" label="FC reposo" hint="ppm" error={errors.restHr}><input id="z-rest" className="input" inputMode="numeric" value={form.restHr} onChange={(e) => set('restHr', e.target.value)} /></Field>
            <Field id="z-w" label="Peso" hint="kg" error={errors.weight}><input id="z-w" className="input" inputMode="decimal" value={form.weight} onChange={(e) => set('weight', e.target.value)} /></Field>
          </div>
          <button className="btn primary block" style={{ marginTop: 14 }} onClick={() => save()}>Guardar y recalcular TSS</button>
          {th.ftp && th.weight ? <p className="xs muted" style={{ marginBottom: 0 }}>FTP relativo: {(th.ftp / th.weight).toFixed(2)} W/kg</p> : null}
        </Card>

        <Card title="Zonas">
          <Seg label="Deporte" value={tab} onChange={setTab} options={[{ value: 'run', label: 'Carrera' }, { value: 'bike', label: 'Ciclismo' }, { value: 'swim', label: 'Natación' }]} />
          <div className="stack" style={{ marginTop: 12 }}>
            {tab === 'run' && (
              <>
                <ZoneTable title="FC (% LTHR)" zones={HR_ZONES_RUN} thr={th.lthrRun} fmt={(v) => `${Math.round(v)}`} unit="ppm" />
                <ZoneTable title="Ritmo (% velocidad umbral)" zones={PACE_ZONES} thr={th.runPace} fmt={(v) => fmtPace(v)} unit="/km" inverse />
              </>
            )}
            {tab === 'bike' && (
              <>
                <ZoneTable title="Potencia (% FTP)" zones={POWER_ZONES} thr={th.ftp} fmt={(v) => `${Math.round(v)}`} unit="W" />
                <ZoneTable title="FC (% LTHR)" zones={HR_ZONES_BIKE} thr={th.lthrBike ?? (th.lthrRun ? th.lthrRun - 6 : undefined)} fmt={(v) => `${Math.round(v)}`} unit="ppm" />
              </>
            )}
            {tab === 'swim' && <ZoneTable title="Ritmo (% CSS)" zones={SWIM_ZONES} thr={th.swimPace} fmt={(v) => fmtPace(v, 100)} unit="/100m" inverse />}
          </div>
        </Card>
      </div>
    </>
  );
}

function ZoneTable({ title, zones, thr, fmt, unit, inverse }: { title: string; zones: Zone[]; thr?: number; fmt: (v: number) => string; unit: string; inverse?: boolean }) {
  return (
    <div>
      <div className="xs b muted" style={{ marginBottom: 4 }}>{title}</div>
      {!thr ? <p className="sm muted" style={{ margin: 0 }}>Introduce el umbral para ver los rangos.</p> : (
        <table className="t">
          <tbody>
            {zones.map((z, i) => {
              const lo = z.lo * thr;
              const hi = z.hi * thr;
              const text = z.lo === 0 ? (inverse ? `> ${fmt(hi)}` : `< ${fmt(hi)}`) : z.hi > 5 ? (inverse ? `< ${fmt(lo)}` : `> ${fmt(lo)}`) : inverse ? `${fmt(lo)} – ${fmt(hi)}` : `${fmt(lo)} – ${fmt(hi - 1)}`;
              return (
                <tr key={z.name}>
                  <td><i className="dot" style={{ background: ZONE_COLORS[Math.min(i, 6)], marginRight: 6 }} />{z.name}</td>
                  <td className="r tnum">{text} <span className="muted xs">{unit}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
