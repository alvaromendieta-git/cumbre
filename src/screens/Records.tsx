import { Trophy } from 'lucide-react';
import { useState } from 'react';
import { Card, Empty, Header, Seg, go } from '../components/ui';
import { useTraining } from '../lib/store';
import { addDays, dayShort, fmtDur, fmtPace, today } from '../lib/format';
import type { Activity } from '../lib/types';

type Period = '28' | '90' | '365' | 'all';

export default function Records() {
  const data = useTraining();
  const [period, setPeriod] = useState<Period>('365');
  const [kind, setKind] = useState<'run' | 'bike' | 'hr'>('run');
  if (!data) return <Header title="Récords" back="mas" />;
  const from = period === 'all' ? '0000' : addDays(today(), -Number(period));
  const acts = data.acts.filter((a) => a.date >= from && a.peaks);
  const rows: { label: string; value: string; a: Activity }[] = [];

  const bestBy = (pick: (a: Activity) => number | undefined, lower = false) => {
    let best: { v: number; a: Activity } | null = null;
    for (const a of acts) {
      const v = pick(a);
      if (!v) continue;
      if (!best || (lower ? v < best.v : v > best.v)) best = { v, a };
    }
    return best;
  };

  if (kind === 'run') {
    for (const [d, l] of [['400', '400 m'], ['1000', '1 km'], ['1609', '1 milla'], ['5000', '5 km'], ['10000', '10 km'], ['21097', 'Media maratón'], ['42195', 'Maratón']]) {
      const b = bestBy((a) => (a.sport === 'run' ? a.peaks?.distTime?.[d] : undefined), true);
      if (b) rows.push({ label: l, value: `${fmtDur(b.v)} · ${fmtPace(Number(d) / b.v)}/km`, a: b.a });
    }
    for (const [d, l] of [['300', '5 min'], ['1200', '20 min'], ['3600', '60 min']]) {
      const b = bestBy((a) => (a.sport === 'run' ? a.peaks?.speed?.[d] : undefined));
      if (b) rows.push({ label: `Ritmo ${l}`, value: `${fmtPace(b.v)}/km`, a: b.a });
    }
  } else if (kind === 'bike') {
    const w = data.settings.thresholds.weight;
    for (const [d, l] of [['5', '5 s'], ['60', '1 min'], ['300', '5 min'], ['1200', '20 min'], ['3600', '60 min']]) {
      const b = bestBy((a) => (a.sport === 'bike' ? a.peaks?.power?.[d] : undefined));
      if (b) rows.push({ label: `Potencia ${l}`, value: `${Math.round(b.v)} W${w ? ` · ${(b.v / w).toFixed(2)} W/kg` : ''}`, a: b.a });
    }
  } else {
    for (const [d, l] of [['60', '1 min'], ['300', '5 min'], ['1200', '20 min'], ['3600', '60 min']]) {
      const b = bestBy((a) => a.peaks?.hr?.[d]);
      if (b) rows.push({ label: `FC ${l}`, value: `${Math.round(b.v)} ppm`, a: b.a });
    }
    const mx = bestBy((a) => a.maxHr);
    if (mx) rows.push({ label: 'FC máxima', value: `${mx.v} ppm`, a: mx.a });
  }

  return (
    <>
      <Header title="Récords" back="mas" />
      <div className="stack-lg">
        <Seg label="Tipo" value={kind} onChange={setKind} options={[{ value: 'run', label: 'Carrera' }, { value: 'bike', label: 'Potencia' }, { value: 'hr', label: 'FC' }]} />
        <Seg label="Periodo" value={period} onChange={setPeriod} options={[{ value: '28', label: '28 días' }, { value: '90', label: '90 días' }, { value: '365', label: '1 año' }, { value: 'all', label: 'Siempre' }]} />
        <Card>
          {rows.length ? (
            <table className="t">
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label} onClick={() => go(`entreno/${r.a.id}`)} style={{ cursor: 'pointer' }}>
                    <td><Trophy size={14} color="var(--c-warning)" style={{ verticalAlign: -2, marginRight: 6 }} />{r.label}</td>
                    <td className="r b">{r.value}</td>
                    <td className="r xs muted">{dayShort(r.a.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty icon={<Trophy size={36} />} title="Sin récords en este periodo">Los récords salen de archivos con datos segundo a segundo (FIT, GPX, TCX).</Empty>
          )}
        </Card>
      </div>
    </>
  );
}
