# Recon — plataforma de planificación y análisis de entrenamiento (referencia: app.trainingpeaks.com)

> Nota: la sesión del navegador automatizado no estaba iniciada (pantalla de login), así que este mapa se basa en
> el uso público del producto y su documentación funcional. No se ha copiado código, textos, logos ni colores.
> Nombre propio del clon: **Cumbre**. Objetivo: PWA móvil, todo gratis (incluye lo que en el original es Premium).

## Bucle central
Importar/registrar entrenamiento → se calcula la carga (TSS) con los umbrales del atleta → se actualiza el
gráfico de rendimiento (Fitness/Fatiga/Forma) → se compara con lo planificado (cumplimiento) → se planifica lo siguiente.

## Pantallas
| ID | Pantalla | Propósito | Componentes | Estados |
|----|----------|-----------|-------------|---------|
| S01 | Hoy (inicio) | Estado de forma y lo que toca hoy | tarjeta CTL/ATL/TSB, entreno de hoy, resumen semanal, mini PMC | vacío (sin datos → importar), con datos |
| S02 | Calendario | Semana/mes con planificados y realizados | lista de días, chips de entreno con color de cumplimiento, resumen semanal | vacío, semana pasada/futura |
| S03 | Detalle de entreno | Métricas, gráficas, zonas, vueltas, picos | stat grid, gráfico multi-serie con cursor, barras de zonas, tabla vueltas, mapa SVG, RPE/sensaciones/notas | solo resumen (CSV) o con streams (FIT/GPX/TCX) |
| S04 | Análisis (dashboard) | Gráficos premium | PMC con rango, TSS semanal, distribución de zonas, curva de picos, volumen por deporte | sin datos |
| S05 | Zonas y umbrales | FTP, LTHR, ritmo umbral, CSS, FC máx/reposo y tablas de zonas | formularios, tablas de zonas, detector automático | sugerencias del historial |
| S06 | Importar / exportar | Leer historial previo | selector multi-archivo/carpeta, progreso, informe | ok, duplicados, errores |
| S07 | Constructor de entreno | Entreno estructurado y TSS estimado | lista de pasos, gráfico de intensidad | vacío |
| S08 | Plan anual (ATP) | Eventos A/B/C, fases y CTL objetivo | lista de eventos, gráfico de CTL proyectado, tabla de semanas | sin eventos |
| S09 | Métricas | Peso, FC reposo, VFC, sueño, sensaciones | formulario diario, mini gráficas | vacío |
| S10 | Récords (picos) | Mejores marcas por duración/distancia y periodo | tabla, filtros de periodo/deporte | vacío |
| S11 | Ajustes | Perfil, unidades, datos, instalar | formularios | — |

## Navegación
Inferior (móvil): Hoy · Calendario · (+) · Análisis · Más. "Más" → Zonas, Récords, Métricas, Plan anual, Importar, Ajustes.
