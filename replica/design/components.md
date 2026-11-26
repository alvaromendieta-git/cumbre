# Componentes — Cumbre

Iconos: Lucide (MIT). Fuente: Inter/system (abierta). Todos los colores vía `var(--c-*)` de `src/styles/tokens.css`.

```
Button
  variants  primary, secondary, ghost, danger
  sizes     sm 32px, md 44px (táctil)
  states    default, hover, active, focus-visible (2px ring accent), disabled, loading
  tokens    bg accent, text on-accent, radius md, font sm/600
  a11y      <button> real, foco visible
  used on   S01-S11

Card
  variants  default, interactive (tappable, chevron)
  tokens    bg surface, border border, radius lg, padding 16
  used on   S01, S03, S04, S05, S08, S09

Stat
  parts     label (xs muted, uppercase), value (lg/xl tabular-nums), unit (xs muted)
  used on   S01, S03, S04

WorkoutChip
  parts     barra de color de deporte, título, duración/distancia/TSS, punto de cumplimiento
  states    planificado (borde discontinuo), realizado, cumplido (verde), parcial (amarillo), desviado (naranja), no hecho (rojo)
  a11y      botón con aria-label que describe estado
  used on   S01, S02

Segmented
  states    default, selected (bg surface-2, text), focus-visible
  a11y      role=tablist / aria-selected
  used on   S02, S04, S10

Sheet (bottom sheet modal)
  states    abierto/cerrado, scroll interno
  a11y      role=dialog, aria-modal, Escape cierra, foco al abrir
  used on   añadir entreno, editar métrica

Field (input/select/textarea)
  states    default, focus (ring), error (danger + mensaje), disabled
  tokens    bg surface-2, border border-input, radius md, alto 44
  a11y      <label> siempre asociado

Charts (SVG propio)
  PMCChart     CTL área fitness, ATL línea fatigue, TSB barras form, cursor táctil, proyección discontinua
  StreamChart  hasta 4 series apiladas, cursor táctil compartido
  ZoneBars     barras horizontales por zona con %, tiempo
  BarChart     TSS/horas semanales
  PeakCurve    curva mean-max eje X log
  RouteMap     trazo SVG de lat/lng normalizados

BottomNav
  5 destinos, botón central (+) acento, safe-area inset, aria-current en activo
```
