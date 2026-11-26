import { ChevronRight, Download, Flag, Gauge, HeartPulse, Info, Settings as Cog, Smartphone, Trophy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Card, Field, Header, toast } from '../components/ui';
import { saveSettings } from '../lib/db';
import { recomputeAll, reanalyzeStreams } from '../lib/importer';
import { useTraining } from '../lib/store';

const LINKS = [
  { to: 'zonas', icon: Gauge, label: 'Zonas y umbrales', sub: 'FTP, FC umbral, ritmos y detección automática' },
  { to: 'records', icon: Trophy, label: 'Récords', sub: 'Mejores marcas por distancia y duración' },
  { to: 'metricas', icon: HeartPulse, label: 'Métricas diarias', sub: 'VFC, FC reposo, sueño, peso' },
  { to: 'plan-anual', icon: Flag, label: 'Plan anual', sub: 'Objetivos y carga semanal hasta la carrera' },
  { to: 'importar', icon: Download, label: 'Importar / copia de seguridad', sub: 'FIT, GPX, TCX, CSV, ZIP' },
  { to: 'ajustes', icon: Cog, label: 'Ajustes', sub: 'Semana, constantes de carga' },
];

type BIPEvent = Event & { prompt: () => void };
let deferred: BIPEvent | null = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e as BIPEvent;
});

export default function More() {
  const [canInstall, setCanInstall] = useState(!!deferred);
  useEffect(() => {
    const t = setInterval(() => setCanInstall(!!deferred), 1000);
    return () => clearInterval(t);
  }, []);
  const standalone = window.matchMedia('(display-mode: standalone)').matches;
  return (
    <>
      <Header title="Más" />
      <div className="stack-lg">
        <Card className="tight">
          {LINKS.map((l) => (
            <a key={l.to} className="list-link" href={`#/${l.to}`}>
              <span className="ic"><l.icon size={18} /></span>
              <span className="grow"><span className="b sm" style={{ display: 'block' }}>{l.label}</span><span className="xs muted">{l.sub}</span></span>
              <ChevronRight size={18} className="muted" />
            </a>
          ))}
        </Card>
        {!standalone && (
          <Card title="Instalar en el móvil">
            <p className="sm muted" style={{ marginTop: 0 }}>Instálala como app: funciona sin conexión y abre a pantalla completa.</p>
            {canInstall ? (
              <button className="btn primary block" onClick={() => deferred?.prompt()}><Smartphone size={18} /> Instalar Cumbre</button>
            ) : (
              <p className="xs muted" style={{ margin: 0 }}>Android/Chrome: menú ⋮ → «Instalar aplicación». iPhone/Safari: Compartir → «Añadir a pantalla de inicio».</p>
            )}
          </Card>
        )}
        <Card>
          <div className="row xs muted"><Info size={14} /> Cumbre es gratuita y todas sus funciones están incluidas. Tus datos se guardan solo en este dispositivo.</div>
        </Card>
      </div>
    </>
  );
}

export function SettingsScreen() {
  const data = useTraining();
  const [ctl, setCtl] = useState('42');
  const [atl, setAtl] = useState('7');
  useEffect(() => {
    if (data) { setCtl(String(data.settings.ctlDays)); setAtl(String(data.settings.atlDays)); }
  }, [data?.settings.ctlDays, data?.settings.atlDays]);
  if (!data) return <Header title="Ajustes" back="mas" />;
  const s = data.settings;
  return (
    <>
      <Header title="Ajustes" back="mas" />
      <div className="stack-lg">
        <Card title="Calendario">
          <Field id="s-ws" label="La semana empieza en">
            <select id="s-ws" className="input" value={s.weekStart} onChange={(e) => saveSettings({ weekStart: Number(e.target.value) as 0 | 1 })}>
              <option value={1}>Lunes</option>
              <option value={0}>Domingo</option>
            </select>
          </Field>
        </Card>
        <Card title="Gráfico de forma">
          <div className="grid2">
            <Field id="s-ctl" label="Días de fitness (CTL)" hint="Habitual: 42"><input id="s-ctl" className="input" inputMode="numeric" value={ctl} onChange={(e) => setCtl(e.target.value)} /></Field>
            <Field id="s-atl" label="Días de fatiga (ATL)" hint="Habitual: 7"><input id="s-atl" className="input" inputMode="numeric" value={atl} onChange={(e) => setAtl(e.target.value)} /></Field>
          </div>
          <button className="btn primary block" style={{ marginTop: 12 }} onClick={async () => { await saveSettings({ ctlDays: Math.max(7, Number(ctl) || 42), atlDays: Math.max(2, Number(atl) || 7) }); toast('Guardado'); }}>Guardar</button>
        </Card>
        <Card title="Mantenimiento">
          <div className="stack">
            <button className="btn ghost block" onClick={async () => { await recomputeAll(); toast('TSS recalculado'); }}>Recalcular TSS de todo</button>
            <button className="btn ghost block" onClick={async () => { toast('Analizando…'); await reanalyzeStreams(); toast('Análisis completado'); }}>Volver a analizar gráficas (picos y zonas)</button>
          </div>
          <p className="xs muted" style={{ marginBottom: 0 }}>{data.acts.length} entrenos · {data.planned.length} planificados · {data.metrics.length} días de métricas</p>
        </Card>
      </div>
    </>
  );
}
