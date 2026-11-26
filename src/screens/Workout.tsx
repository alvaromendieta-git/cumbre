import { Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Card, Empty, Header, Seg, Stat, go, toast } from '../components/ui';
import { RouteMap, StreamChart, ZoneBars, type Series } from '../components/charts';
import { SportIcon } from '../components/workout';
import { bump, db, getSettings, useQuery } from '../lib/db';
import { useTraining } from '../lib/store';
import { dayLong, fmtDur, fmtKm, fmtPace, speedFor } from '../lib/format';
import { activityZones, compliance, COMPLIANCE_LABEL, hrZonesFor, PACE_ZONES, POWER_ZONES, SWIM_ZONES, TSS_LABEL, withTss } from '../lib/metrics';
import { SPORT_LABEL, SPORTS, type Activity, type Sport } from '../lib/types';

const FEEL = ['😫', '🙁', '😐', '🙂', '😄'];
const FEEL_LABEL = ['Muy mal', 'Mal', 'Normal', 'Bien', 'Muy bien'];

export default function Workout({ id }: { id: string }) {
  const data = useTraining();
  const act = data?.acts.find((a) => a.id === id);
  const streams = useQuery(() => db.streams.get(id), [id]);
  const [zoneTab, setZoneTab] = useState<'hr' | 'power' | 'pace'>('hr');
  const [notes, setNotes] = useState<string>('');
  const [name, setName] = useState('');
  useEffect(() => {
    if (act) {
      setNotes(act.notes ?? '');
      setName(act.name);
    }
  }, [act?.id]);

  const series = useMemo<Series[] | null>(() => {
    if (!streams || !act) return null;
    const s: Series[] = [];
    const isPace = act.sport === 'run' || act.sport === 'walk' || act.sport === 'swim';
    if (streams.hr) s.push({ key: 'hr', label: 'FC', color: 'var(--c-fatigue)', data: streams.hr, fmt: (v) => `${Math.round(v)} ppm` });
    if (streams.power) s.push({ key: 'power', label: 'Potencia', color: 'var(--c-warning)', data: smooth(streams.power, 5), fmt: (v) => `${Math.round(v)} W` });
    if (streams.speed) {
      const sm = smooth(streams.speed, 10);
      s.push(isPace
        ? { key: 'pace', label: 'Ritmo', color: 'var(--c-run)', data: sm.map((v) => (v != null && v > 0.5 ? v : null)), fmt: (v) => `${fmtPace(v, act.sport === 'swim' ? 100 : 1000)}`, invert: false }
        : { key: 'speed', label: 'Velocidad', color: 'var(--c-bike)', data: sm, fmt: (v) => `${(v * 3.6).toFixed(1)} km/h` });
    }
    if (streams.cad) s.push({ key: 'cad', label: 'Cadencia', color: 'var(--c-strength)', data: smooth(streams.cad, 5), fmt: (v) => `${Math.round(v)}` });
    if (streams.alt) s.push({ key: 'alt', label: 'Altitud', color: 'var(--c-text-muted)', data: streams.alt, fmt: (v) => `${Math.round(v)} m` });
    return s;
  }, [streams, act?.id]);

  if (!data) return <Header title="Entreno" back />;
  if (!act) return (<><Header title="Entreno" back /><Empty icon={null} title="No encontrado">Este entreno ya no existe.</Empty></>);

  const th = data.settings.thresholds;
  const plan = data.planned.find((p) => data.pairs.get(p.id)?.id === act.id);
  const zones = activityZones(act, th);
  const sp = speedFor(act.sport, act.avgSpeed ?? (act.distance ? act.distance / act.duration : undefined));
  const zoneOpts = [
    zones.hr && { value: 'hr' as const, label: 'FC' },
    zones.power && { value: 'power' as const, label: 'Potencia' },
    zones.pace && { value: 'pace' as const, label: 'Ritmo' },
  ].filter(Boolean) as { value: 'hr' | 'power' | 'pace'; label: string }[];
  const activeZone = zoneOpts.find((z) => z.value === zoneTab)?.value ?? zoneOpts[0]?.value;
  const zoneNames = activeZone === 'power' ? POWER_ZONES : activeZone === 'pace' ? (act.sport === 'swim' ? SWIM_ZONES : PACE_ZONES) : hrZonesFor(act.sport);

  const update = async (patch: Partial<Activity>) => {
    const s = await getSettings();
    await db.activities.put(withTss({ ...act, ...patch }, s.thresholds));
    bump();
  };
  const remove = async () => {
    if (!confirm('¿Eliminar este entreno? No se puede deshacer.')) return;
    await db.activities.delete(act.id);
    await db.streams.delete(act.id);
    bump();
    toast('Entreno eliminado');
    go('calendario');
  };

  const x = streams?.t ?? [];
  const c = plan ? compliance(plan, act) : null;

  return (
    <>
      <Header title={act.name} back right={<button className="icon-btn" aria-label="Eliminar entreno" onClick={remove}><Trash2 size={18} /></button>} />
      <div className="stack-lg">
        <div className="row muted sm" style={{ textTransform: 'capitalize' }}>
          <SportIcon sport={act.sport} /> {SPORT_LABEL[act.sport]} · {dayLong(act.date)} · {new Date(act.start).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
        </div>

        <Card>
          <div className="stats">
            <Stat big label="Duración" value={fmtDur(act.duration)} />
            {act.distance ? <Stat big label="Distancia" value={fmtKm(act.distance, 2)} unit="km" /> : <Stat big label="Calorías" value={act.calories ?? '—'} unit="kcal" />}
            <Stat big label={TSS_LABEL[act.tssMethod ?? 'none']} value={act.tss ?? '—'} tone="accent" />
          </div>
          <div className="stats" style={{ marginTop: 14 }}>
            {act.intensity != null && <Stat label="IF" value={act.intensity.toFixed(2)} />}
            {act.avgSpeed || act.distance ? <Stat label={act.sport === 'bike' ? 'Vel. media' : 'Ritmo medio'} value={sp.value} unit={sp.unit} /> : null}
            {act.ngp && <Stat label="Ritmo ajustado" value={fmtPace(act.ngp)} unit="/km" />}
            {act.avgHr && <Stat label="FC media" value={act.avgHr} unit="ppm" />}
            {act.maxHr && <Stat label="FC máx" value={act.maxHr} unit="ppm" />}
            {act.avgPower && <Stat label="Pot. media" value={act.avgPower} unit="W" />}
            {act.np && <Stat label="NP" value={Math.round(act.np)} unit="W" />}
            {act.avgPower && <Stat label="Trabajo" value={Math.round((act.avgPower * act.duration) / 1000)} unit="kJ" />}
            {act.elevGain ? <Stat label="Desnivel +" value={Math.round(act.elevGain)} unit="m" /> : null}
            {act.avgCadence && <Stat label="Cadencia" value={Math.round(act.avgCadence)} />}
            {act.calories && act.distance ? <Stat label="Calorías" value={act.calories} unit="kcal" /> : null}
            {act.elapsed && act.elapsed - act.duration > 60 ? <Stat label="Tiempo total" value={fmtDur(act.elapsed)} /> : null}
          </div>
          {act.tssMethod === 'rpe' && <p className="xs muted" style={{ marginTop: 10 }}>TSS estimado por esfuerzo percibido: añade FC o tus umbrales para mayor precisión.</p>}
        </Card>

        {plan && (
          <Card title="Planificado vs realizado" action={<span className="row xs"><i className={`dot comp-${c}`} /> {COMPLIANCE_LABEL[c!]}</span>}>
            <button className="tappable" style={{ background: 'none', border: 0, padding: 0 }} onClick={() => go(`plan/${plan.id}`)}>
              <table className="t">
                <thead><tr><th></th><th className="r">Plan</th><th className="r">Hecho</th></tr></thead>
                <tbody>
                  <tr><td>Duración</td><td className="r">{fmtDur(plan.duration)}</td><td className="r">{fmtDur(act.duration)}</td></tr>
                  <tr><td>Distancia</td><td className="r">{plan.distance ? fmtKm(plan.distance) : '—'}</td><td className="r">{fmtKm(act.distance)}</td></tr>
                  <tr><td>TSS</td><td className="r">{plan.tss ?? '—'}</td><td className="r">{act.tss ?? '—'}</td></tr>
                </tbody>
              </table>
            </button>
          </Card>
        )}

        {series && series.length > 0 && (
          <Card title="Gráfica">
            <StreamChart x={x} series={series} xFmt={(s) => fmtDur(s)} />
          </Card>
        )}
        {act.hasStreams && streams === undefined && <div className="skeleton" style={{ height: 200 }} />}

        {zoneOpts.length > 0 && activeZone && (
          <Card title="Tiempo en zonas" action={zoneOpts.length > 1 ? <div style={{ minWidth: 180 }}><Seg label="Tipo de zona" value={activeZone} onChange={setZoneTab} options={zoneOpts} /></div> : undefined}>
            <ZoneBars names={zoneNames.map((z) => z.name)} seconds={zones[activeZone]!} />
          </Card>
        )}
        {!zoneOpts.length && act.hasStreams && (
          <Card><p className="sm muted" style={{ margin: 0 }}>Configura tus umbrales para ver el tiempo en zonas. <a href="#/zonas">Ir a zonas</a></p></Card>
        )}

        {act.peaks && <PeaksCard act={act} />}

        {act.laps && act.laps.length > 1 && (
          <Card title={`Vueltas (${act.laps.length})`}>
            <div className="scroll-x">
              <table className="t">
                <thead><tr><th>#</th><th className="r">Tiempo</th><th className="r">Dist</th><th className="r">{act.sport === 'bike' ? 'km/h' : 'Ritmo'}</th><th className="r">FC</th>{act.laps.some((l) => l.avgPower) && <th className="r">W</th>}</tr></thead>
                <tbody>
                  {act.laps.map((l, i) => {
                    const v = l.avgSpeed ?? (l.distance && l.duration ? l.distance / l.duration : undefined);
                    return (
                      <tr key={i}>
                        <td>{i + 1}</td>
                        <td className="r">{fmtDur(l.duration)}</td>
                        <td className="r">{l.distance ? fmtKm(l.distance, 2) : '—'}</td>
                        <td className="r">{speedFor(act.sport, v).value}</td>
                        <td className="r">{l.avgHr ? Math.round(l.avgHr) : '—'}</td>
                        {act.laps!.some((q) => q.avgPower) && <td className="r">{l.avgPower ? Math.round(l.avgPower) : '—'}</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {streams?.lat && streams.lng && (
          <Card title="Recorrido"><RouteMap lat={streams.lat} lng={streams.lng} /></Card>
        )}

        <Card title="¿Cómo te sentiste?">
          <div className="stack">
            <div className="feel" role="group" aria-label="Sensaciones">
              {FEEL.map((f, i) => (
                <button key={i} aria-pressed={act.feel === i + 1} aria-label={FEEL_LABEL[i]} title={FEEL_LABEL[i]} onClick={() => update({ feel: i + 1 })}>{f}</button>
              ))}
            </div>
            <div>
              <div className="xs muted" style={{ marginBottom: 6 }}>Esfuerzo percibido (RPE 1–10)</div>
              <div className="rpe" role="group" aria-label="RPE">
                {Array.from({ length: 10 }, (_, i) => (
                  <button key={i} aria-pressed={act.rpe === i + 1} onClick={() => update({ rpe: i + 1 })}>{i + 1}</button>
                ))}
              </div>
            </div>
            <label className="xs muted" htmlFor="w-notes">Notas</label>
            <textarea id="w-notes" className="input" value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (act.notes ?? '') && update({ notes })} placeholder="Sensaciones, clima, material…" />
          </div>
        </Card>

        <Card title="Editar">
          <div className="stack">
            <label className="xs muted" htmlFor="w-name">Nombre</label>
            <input id="w-name" className="input" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name && name !== act.name && update({ name })} />
            <label className="xs muted" htmlFor="w-sport">Deporte</label>
            <select id="w-sport" className="input" value={act.sport} onChange={(e) => update({ sport: e.target.value as Sport })}>
              {SPORTS.map((s) => <option key={s} value={s}>{SPORT_LABEL[s]}</option>)}
            </select>
            <label className="xs muted" htmlFor="w-tss">TSS manual (vacío = automático)</label>
            <input id="w-tss" className="input" inputMode="numeric" defaultValue={act.tssMethod === 'file' ? act.fileTss : ''} onBlur={(e) => update({ fileTss: e.target.value ? Number(e.target.value) : undefined })} />
            <p className="xs muted" style={{ margin: 0 }}>Origen: {act.source.toUpperCase()}{act.hasStreams ? ' con datos segundo a segundo' : ' (solo resumen)'}</p>
          </div>
        </Card>
      </div>
    </>
  );
}

function PeaksCard({ act }: { act: Activity }) {
  const best = useQuery(async () => {
    const all = await db.activities.where('sport').equals(act.sport).toArray();
    const top = (k: 'power' | 'hr' | 'speed', d: string) => Math.max(0, ...all.map((a) => a.peaks?.[k]?.[d] ?? 0));
    const topDist = (d: string) => Math.min(Infinity, ...all.map((a) => a.peaks?.distTime?.[d] ?? Infinity));
    return { top, topDist };
  }, [act.id]);
  const p = act.peaks!;
  const rows: { label: string; value: string; pr: boolean }[] = [];
  const durs: [string, string][] = [['5', '5 s'], ['60', '1 min'], ['300', '5 min'], ['1200', '20 min'], ['3600', '60 min']];
  if (p.power) for (const [d, l] of durs) if (p.power[d]) rows.push({ label: `Potencia ${l}`, value: `${Math.round(p.power[d])} W`, pr: !!best && p.power[d] >= best.top('power', d) });
  if (p.distTime) for (const [d, l] of [['1000', '1 km'], ['5000', '5 km'], ['10000', '10 km'], ['21097', 'Media'], ['42195', 'Maratón']]) if (p.distTime[d]) rows.push({ label: `Mejor ${l}`, value: fmtDur(p.distTime[d]), pr: !!best && p.distTime[d] <= best.topDist(d) });
  if (p.hr) for (const [d, l] of durs.slice(1)) if (p.hr[d]) rows.push({ label: `FC ${l}`, value: `${Math.round(p.hr[d])} ppm`, pr: false });
  if (!rows.length) return null;
  return (
    <Card title="Mejores marcas de la sesión" action={<a className="xs" href="#/records">Récords</a>}>
      <table className="t">
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}><td>{r.label}</td><td className="r b">{r.value}</td><td className="r">{r.pr ? <span className="chip" style={{ color: 'var(--c-warning)', borderColor: 'var(--c-warning)' }}>🏆 Récord</span> : null}</td></tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function smooth(a: (number | null)[], w: number): (number | null)[] {
  const out: (number | null)[] = new Array(a.length).fill(null);
  let sum = 0;
  let n = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] != null) (sum += a[i] as number), n++;
    if (i >= w && a[i - w] != null) (sum -= a[i - w] as number), n--;
    out[i] = a[i] == null ? null : n ? sum / n : null;
  }
  return out;
}
