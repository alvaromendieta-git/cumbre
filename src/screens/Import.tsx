import { FileUp, FolderUp, HardDriveDownload, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { Card, Header, go, toast } from '../components/ui';
import { db, getSettings, saveSettings } from '../lib/db';
import { exportBackup, importFiles, recomputeAll, restoreBackup, wipeAll, type ImportReport } from '../lib/importer';
import { detectThresholds } from '../lib/thresholds';
import type { Thresholds } from '../lib/types';

export default function Import() {
  const files = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);
  const restore = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState<{ done: number; total: number; name: string } | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [autoTh, setAutoTh] = useState<string[] | null>(null);

  const run = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    setReport(null);
    setAutoTh(null);
    try {
      const r = await importFiles(Array.from(list), (done, total, name) => setProg({ done, total, name }));
      setReport(r);
      // First import: set thresholds automatically when none exist
      const s = await getSettings();
      const empty = !s.thresholds.lthrRun && !s.thresholds.ftp && !s.thresholds.runPace && !s.thresholds.maxHr;
      if (empty && r.added > 0) {
        const sugs = detectThresholds(await db.activities.toArray(), await db.metrics.toArray());
        if (sugs.length) {
          const next: Thresholds = {};
          for (const g of sugs) (next as Record<string, number>)[g.key] = g.value;
          await saveSettings({ thresholds: next, thresholdsAt: Date.now() });
          await recomputeAll();
          setAutoTh(sugs.map((g) => `${g.label}: ${g.display}`));
        }
      }
    } finally {
      setBusy(false);
      setProg(null);
    }
  };

  const download = async (withStreams: boolean) => {
    const blob = await exportBackup(withStreams);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cumbre-copia-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  return (
    <>
      <Header title="Importar historial" back="mas" />
      <div className="stack-lg">
        <Card title="Tus entrenamientos anteriores">
          <p className="sm muted" style={{ marginTop: 0 }}>Todo se procesa en tu móvil; nada sale del dispositivo. Los duplicados se detectan solos: si importas el mismo entreno en CSV y FIT, se queda el que tiene más datos.</p>
          <div className="stack">
            <button className="btn primary block" disabled={busy} onClick={() => files.current?.click()}><FileUp size={18} /> Elegir archivos (FIT, GPX, TCX, CSV, ZIP)</button>
            <button className="btn ghost block" disabled={busy} onClick={() => folder.current?.click()}><FolderUp size={18} /> Elegir una carpeta completa</button>
          </div>
          <input ref={files} type="file" multiple hidden accept=".fit,.gpx,.tcx,.csv,.json,.zip,.gz" onChange={(e) => { run(e.target.files); e.target.value = ''; }} />
          <input ref={folder} type="file" multiple hidden {...({ webkitdirectory: '', directory: '' } as Record<string, string>)} onChange={(e) => { run(e.target.files); e.target.value = ''; }} />

          {prog && (
            <div style={{ marginTop: 14 }} role="status" aria-live="polite">
              <div className="row between xs"><span className="ellipsis grow">{prog.name || 'Calculando…'}</span><span className="tnum">{prog.done}/{prog.total}</span></div>
              <div style={{ height: 6, background: 'var(--c-surface-2)', borderRadius: 3, marginTop: 6, overflow: 'hidden' }}>
                <div style={{ width: `${(prog.done / Math.max(1, prog.total)) * 100}%`, height: '100%', background: 'var(--c-accent)', transition: 'width 120ms' }} />
              </div>
            </div>
          )}

          {report && (
            <div className="card tight" style={{ marginTop: 14, background: 'var(--c-surface-2)' }} role="status">
              <div className="b">Importación terminada</div>
              <div className="sm">
                <span className="c-success">{report.added} nuevos</span> · {report.updated} mejorados · {report.skipped} duplicados{report.metrics ? ` · ${report.metrics} días de métricas` : ''}
              </div>
              {report.kinds.size > 0 && <div className="xs muted">Formatos: {[...report.kinds].join(', ')}</div>}
              {report.errors.length > 0 && (
                <details style={{ marginTop: 6 }}>
                  <summary className="xs c-danger">{report.errors.length} archivos con errores</summary>
                  <ul className="xs muted">{report.errors.slice(0, 30).map((e, i) => <li key={i}>{e.file}: {e.error}</li>)}</ul>
                </details>
              )}
              {autoTh && (
                <div style={{ marginTop: 8 }}>
                  <div className="xs b c-accent">Umbrales calculados automáticamente:</div>
                  <ul className="xs" style={{ margin: '4px 0' }}>{autoTh.map((t) => <li key={t}>{t}</li>)}</ul>
                  <button className="btn sm ghost" onClick={() => go('zonas')}>Revisar zonas</button>
                </div>
              )}
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn sm primary" onClick={() => go('hoy')}>Ver mi forma</button>
                <button className="btn sm ghost" onClick={() => go('calendario')}>Calendario</button>
              </div>
            </div>
          )}
        </Card>

        <Card title="¿De dónde saco mis datos?">
          <div className="stack sm">
            <details><summary className="b">TrainingPeaks</summary><p className="muted">En la web: Ajustes de cuenta → Exportar datos. Descarga el ZIP de entrenamientos (archivos FIT) y el CSV de resumen de entrenamientos y de métricas. Importa los tres aquí tal cual.</p></details>
            <details><summary className="b">Strava</summary><p className="muted">Ajustes → Mi cuenta → Descargar o eliminar tu cuenta → Solicitar archivo. Importa el ZIP completo: leo «activities.csv» y los archivos .fit.gz / .gpx.gz.</p></details>
            <details><summary className="b">COROS</summary><p className="muted">En la app COROS: abre la actividad → Compartir → Exportar FIT. En training.coros.com puedes exportar varias a la vez.</p></details>
            <details><summary className="b">Garmin Connect</summary><p className="muted">Actividades → Exportar CSV para el resumen, o «Exportar original» en cada actividad para el FIT. También puedes pedir la exportación completa de datos de tu cuenta.</p></details>
          </div>
        </Card>

        <Card title="Copia de seguridad">
          <div className="stack">
            <button className="btn ghost block" onClick={() => download(false)}><HardDriveDownload size={18} /> Descargar copia (ligera)</button>
            <button className="btn ghost block" onClick={() => download(true)}><HardDriveDownload size={18} /> Descargar copia completa (con gráficas)</button>
            <button className="btn ghost block" onClick={() => restore.current?.click()}><Upload size={18} /> Restaurar copia</button>
            <input ref={restore} type="file" hidden accept=".json" onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try { await restoreBackup(f); toast('Copia restaurada'); } catch (err) { toast(String((err as Error).message)); }
            }} />
            <button className="btn danger block" onClick={async () => { if (confirm('¿Borrar TODOS los datos de este dispositivo? No se puede deshacer.')) { await wipeAll(); toast('Datos borrados'); } }}>Borrar todos los datos</button>
          </div>
        </Card>
      </div>
    </>
  );
}
