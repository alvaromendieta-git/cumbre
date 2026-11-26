# Cumbre · PWA de entrenamiento

App web progresiva (instalable en el móvil, funciona sin conexión) para planificar, registrar y analizar
entrenamiento de resistencia. Todas las funciones son gratuitas; los datos viven solo en el dispositivo (IndexedDB).

## Funciones
- **Hoy**: fitness/fatiga/forma (CTL/ATL/TSB), rampa, entreno del día y de mañana, resumen semanal, métricas, próximo objetivo.
- **Calendario** semana/mes con planificado vs realizado y color de cumplimiento.
- **Entreno**: métricas (TSS, IF, NP, ritmo ajustado), gráficas FC/potencia/ritmo/cadencia/altitud con cursor táctil,
  tiempo en zonas, vueltas, mejores marcas de la sesión, recorrido, RPE/sensaciones/notas.
- **Análisis**: PMC con proyección del plan, carga semanal (TSS/h/km/kcal) por deporte, distribución por deporte,
  zonas de FC agregadas (reparto polarizado), curva de mejores marcas.
- **Zonas y umbrales** con **detección automática desde tu historial** (FTP, LTHR carrera/bici, ritmo umbral, CSS, FC máx/reposo).
- **Constructor** de entrenos estructurados con plantillas y TSS estimado.
- **Plan anual**: objetivos A/B/C, fases y TSS semanal para llegar al CTL objetivo.
- **Métricas** diarias (VFC, FC reposo, sueño, peso, sensaciones) y **Récords**.
- **Importar**: FIT, GPX, TCX (también `.gz`), ZIP, CSV de Strava / TrainingPeaks / Garmin / genérico, CSV de métricas,
  copia de seguridad JSON. Al importar por primera vez calcula los umbrales automáticamente.

## Uso
```bash
npm install
npm run dev        # desarrollo, accesible en la red local (--host)
npm run build      # genera dist/
npm run preview    # sirve dist/ en http://<tu-ip>:4173
```
Para instalarla en el móvil necesita HTTPS (o localhost): publica `dist/` en cualquier hosting estático
(GitHub Pages, Netlify, Cloudflare Pages) y en Chrome Android usa «Instalar aplicación».

### Tu historial
`data/coros-historial-2026.csv` contiene 83 entrenos (jul–nov 2026) exportados de COROS. Impórtalo en
*Más → Importar*. La carpeta `data/` está fuera de `public/` para que no se publique con la app.
Para tener gráficas segundo a segundo, importa además los FIT (TrainingPeaks → Ajustes → Exportar datos, o Strava → Descargar archivo).

### Android Studio (opcional)
Para publicarla como app nativa, empaqueta la URL desplegada como Trusted Web Activity
(`npx @bubblewrap/cli init --manifest https://TU-DOMINIO/manifest.webmanifest`) y abre el proyecto generado en Android Studio.

## Estructura
- `src/lib/metrics.ts` — TSS (potencia, rTSS, hrTSS TRIMP, sTSS, RPE), NP/NGP, zonas, picos, PMC, cumplimiento
- `src/lib/thresholds.ts` — detección de umbrales
- `src/lib/parsers/` — FIT (@garmin/fitsdk), GPX/TCX, CSV
- `src/lib/importer.ts` — importación, deduplicado, ZIP, copias de seguridad
- `src/screens/` — pantallas · `src/components/` — UI y gráficos SVG propios
- `replica/` — reconocimiento, tokens de diseño, matriz de funciones y registro de construcción
