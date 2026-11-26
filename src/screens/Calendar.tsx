import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { type CSSProperties, useState } from 'react';
import { Header, Seg, Stat, sportColor } from '../components/ui';
import { AddSheet, WorkoutChip, loadColor } from '../components/workout';
import { useTraining } from '../lib/store';
import { addDays, dayShort, dowShort, fmtHours, fmtKm, monthLabel, parseDay, today, weekStartOf } from '../lib/format';
import { compliance, pmcAt, tsbColor } from '../lib/metrics';
import type { Sport } from '../lib/types';

export default function Calendar() {
  const data = useTraining();
  const [mode, setMode] = useState<'week' | 'month'>('week');
  const [anchor, setAnchor] = useState(today());
  const [addDate, setAddDate] = useState<string | null>(null);
  const t = today();
  if (!data) return <Header title="Calendario" />;
  const { byDate, plannedByDate, pairs, settings, pmc } = data;
  const ws = weekStartOf(anchor, settings.weekStart);
  const pairedIds = new Set([...pairs.values()].map((a) => a.id));

  const dayItems = (d: string) => {
    const plans = plannedByDate.get(d) ?? [];
    const acts = (byDate.get(d) ?? []).filter((a) => !pairedIds.has(a.id));
    return { plans, acts };
  };

  const shift = (n: number) => {
    if (mode === 'week') setAnchor(addDays(anchor, n * 7));
    else {
      const d = parseDay(anchor);
      d.setMonth(d.getMonth() + n, 1);
      setAnchor(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`);
    }
  };

  // weekly summary
  let wDur = 0, wDist = 0, wTss = 0, pDur = 0, pTss = 0;
  const bySport = new Map<Sport, number>();
  for (let i = 0; i < 7; i++) {
    const d = addDays(ws, i);
    for (const a of byDate.get(d) ?? []) {
      wDur += a.duration; wDist += a.distance ?? 0; wTss += a.tss ?? 0;
      bySport.set(a.sport, (bySport.get(a.sport) ?? 0) + a.duration);
    }
    for (const p of plannedByDate.get(d) ?? []) { pDur += p.duration ?? 0; pTss += p.tss ?? 0; }
  }
  const endPmc = pmcAt(pmc, addDays(ws, 6));

  const title = mode === 'week' ? `${dayShort(ws)} – ${dayShort(addDays(ws, 6))}` : monthLabel(anchor);

  return (
    <>
      <Header
        title={<span style={{ textTransform: 'capitalize' }}>{title}</span>}
        right={
          <>
            <button className="icon-btn" aria-label="Anterior" onClick={() => shift(-1)}><ChevronLeft size={20} /></button>
            <button className="btn sm ghost" onClick={() => setAnchor(t)}>Hoy</button>
            <button className="icon-btn" aria-label="Siguiente" onClick={() => shift(1)}><ChevronRight size={20} /></button>
          </>
        }
      />
      <div className="stack">
        <Seg label="Vista" value={mode} onChange={setMode} options={[{ value: 'week', label: 'Semana' }, { value: 'month', label: 'Mes' }]} />

        {mode === 'week' ? (
          <>
            <div className="card tight">
              <div className="stats four">
                <Stat label="Tiempo" value={fmtHours(wDur)} unit={pDur ? `/${fmtHours(pDur)}` : undefined} />
                <Stat label="Km" value={fmtKm(wDist, 0)} />
                <Stat label="TSS" value={Math.round(wTss)} unit={pTss ? `/${Math.round(pTss)}` : undefined} />
                <Stat label="Forma" value={endPmc ? endPmc.tsb.toFixed(0) : '—'} color={endPmc ? tsbColor(endPmc.tsb) : undefined} />
              </div>
              {bySport.size > 0 && (
                <div className="row wrap xs muted" style={{ marginTop: 8, gap: 12 }}>
                  {[...bySport.entries()].map(([s, d]) => (
                    <span key={s} className="row" style={{ gap: 4 }}><i className="dot" style={{ background: sportColor(s) }} />{fmtHours(d)}</span>
                  ))}
                </div>
              )}
            </div>
            <div>
              {Array.from({ length: 7 }, (_, i) => addDays(ws, i)).map((d) => {
                const { plans, acts } = dayItems(d);
                return (
                  <div key={d} className={`day ${d === t ? 'today' : ''}`}>
                    <div className="dl">
                      <div className="dow">{dowShort(d)}</div>
                      <div className="num">{parseDay(d).getDate()}</div>
                    </div>
                    <div className="items">
                      {plans.map((p) => <WorkoutChip key={p.id} plan={p} act={pairs.get(p.id)} />)}
                      {acts.map((a) => <WorkoutChip key={a.id} act={a} />)}
                      <button className="add-day" onClick={() => setAddDate(d)} aria-label={`Añadir entreno el ${dayShort(d)}`}>
                        <Plus size={14} style={{ verticalAlign: -2 }} /> {plans.length + acts.length ? '' : 'Añadir'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <MonthGrid anchor={anchor} weekStart={settings.weekStart} onPick={(d) => { setAnchor(d); setMode('week'); }} dayItems={dayItems} pairs={pairs} />
        )}
      </div>
      <AddSheet key={addDate ?? 'x'} open={!!addDate} date={addDate ?? undefined} onClose={() => setAddDate(null)} />
    </>
  );
}

function MonthGrid({ anchor, weekStart, onPick, dayItems, pairs }: { anchor: string; weekStart: 0 | 1; onPick: (d: string) => void; dayItems: (d: string) => { plans: import('../lib/types').Planned[]; acts: import('../lib/types').Activity[] }; pairs: Map<string, import('../lib/types').Activity> }) {
  const first = anchor.slice(0, 8) + '01';
  const start = weekStartOf(first, weekStart);
  const t = today();
  const month = anchor.slice(0, 7);
  const heads = Array.from({ length: 7 }, (_, i) => dowShort(addDays(start, i)));
  return (
    <div className="month" role="grid" aria-label="Mes">
      {heads.map((h) => <div key={h} className="h">{h}</div>)}
      {Array.from({ length: 42 }, (_, i) => addDays(start, i)).map((d) => {
        const { plans, acts } = dayItems(d);
        const tss = [...acts, ...plans.map((p) => pairs.get(p.id)).filter(Boolean)].reduce((s, a) => s + (a?.tss ?? 0), 0);
        const heat = Math.min(1, tss / 180);
        return (
          <button key={d} className={`cell ${d.slice(0, 7) !== month ? 'out' : ''} ${d === t ? 'today' : ''}`} onClick={() => onPick(d)} aria-label={`${dayShort(d)}: ${plans.length + acts.length} entrenos`} style={{ '--heat': heat * 0.55, '--load': loadColor(tss) } as CSSProperties}>
            <span className="heat" />
            <span className="n">{parseDay(d).getDate()}</span>
            {plans.map((p) => {
              const c = compliance(p, pairs.get(p.id));
              return <span key={p.id} className={`pill comp-${c}`} style={c === 'pending' ? { background: 'transparent', border: `1px dashed ${sportColor(p.sport)}` } : undefined} />;
            })}
            {acts.map((a) => <span key={a.id} className="pill" style={{ background: sportColor(a.sport) }} />)}
            {tss > 0 && <span className="t">{Math.round(tss)}</span>}
          </button>
        );
      })}
    </div>
  );
}
