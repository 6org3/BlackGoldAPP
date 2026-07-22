/* ============================================================
   Radar de N pilares — primitiva Arcade genérica, táctil u
   observacional.

   Acepta `axes` [{key,label,value 0..100}]. Con `selectedKey` resalta ese
   vértice (círculo dorado claro) y con `onSelect(key)` los ejes son táctiles;
   sin ellos es un radar display-only (sin punto de selección) — el modo del
   portal Padre. `rings` define los anillos interiores (factores 0..1).
   Geometría idéntica al prototipo Arcade: centro (130,112), radio máx 82,
   viewBox 260×215; vértice i → ang=-90°+i·(360/n), r=82·(value/100), con
   n = axes.length (antes n=7 fijo con etiquetas hardcodeadas).
   ============================================================ */

import { C, PIXEL, RADAR_FILL } from './arcadeTokens';

const CX = 130;
const CY = 112;
const MAXR = 82;
const LABEL_R = 98;

const angulo = (i, n) => ((-90 + i * (360 / n)) * Math.PI) / 180;

function vertex(i, n, factor) {
  const ang = angulo(i, n);
  const r = MAXR * factor;
  return [CX + r * Math.cos(ang), CY + r * Math.sin(ang)];
}
const fmt = (pt) => `${pt[0].toFixed(1)},${pt[1].toFixed(1)}`;
const ring = (factor, n) => Array.from({ length: n }, (_, i) => fmt(vertex(i, n, factor))).join(' ');
const clamp = (v) => Math.max(0, Math.min(100, Number(v) || 0));
const dataPoints = (axes, n) => axes.map((p, i) => fmt(vertex(i, n, clamp(p.value) / 100))).join(' ');

/** Posición de la etiqueta del eje i: mismo ángulo del vértice a radio 98,
    clampeada al viewBox (+2 de baseline) y con anclaje según el lado. */
function labelPos(i, n) {
  const cos = Math.cos(angulo(i, n));
  return {
    x: Math.max(8, Math.min(252, CX + LABEL_R * cos)),
    y: Math.max(14, Math.min(210, CY + LABEL_R * Math.sin(angulo(i, n)) + 2)),
    anchor: Math.abs(cos) < 0.35 ? 'middle' : cos > 0 ? 'start' : 'end',
  };
}

export default function RadarChart({
  axes = [],
  selectedKey,
  onSelect,
  accent = C.gold,
  fill = RADAR_FILL,
  rings = [1 / 3, 2 / 3],
}) {
  // Con axes vacío no hay nada que dibujar, pero n=1 evita dividir por 0.
  const n = axes.length || 1;
  // Punto de selección solo cuando selectedKey apunta a un eje real: sin él
  // (radar display-only, p. ej. el del Padre) no se dibuja ningún vértice.
  const selIdx = axes.findIndex((a) => a.key === selectedKey);
  const sel = selIdx >= 0 ? vertex(selIdx, n, clamp(axes[selIdx].value) / 100) : null;
  return (
    <svg viewBox="0 0 260 215" width="82%" style={{ margin: '0 auto' }} role="img" aria-label={`Radar de ${axes.length} pilares`}>
      {rings.map((f) => (
        <polygon key={f} points={ring(f, n)} fill="none" stroke="rgba(255,255,255,.07)" />
      ))}
      <polygon points={ring(1, n)} fill="none" stroke="rgba(255,215,0,.12)" />
      <polygon points={dataPoints(axes, n)} fill={fill} stroke={accent} strokeWidth="2" />
      {sel && <circle cx={sel[0].toFixed(1)} cy={sel[1].toFixed(1)} r="4.5" fill={C.goldLight} />}
      {axes.map((p, i) => {
        const lp = labelPos(i, n);
        return (
          <text
            key={p.key}
            x={lp.x}
            y={lp.y}
            fill={p.key === selectedKey ? accent : C.text2}
            textAnchor={lp.anchor}
            style={{ fontFamily: PIXEL, fontSize: 7 }}
          >
            {p.label}
          </text>
        );
      })}
      {/* Hit-targets táctiles: el <text> de 7px era el único objetivo y quedaba
          muy por debajo de los 44px del estándar táctil. Círculos transparentes
          r=23u (≈46px reales al 82% de 375px, medido en vivo), clampeados para
          no salirse del viewBox (fuera de él no reciben eventos). Solo táctil. */}
      {onSelect &&
        axes.map((p, i) => {
          const lp = labelPos(i, n);
          return (
            <circle
              key={`hit-${p.key}`}
              cx={Math.max(23, Math.min(237, lp.x))}
              cy={Math.max(23, Math.min(192, lp.y))}
              r="23"
              fill="transparent"
              role="button"
              tabIndex={0}
              aria-label={`Ver pilar ${p.label}`}
              style={{ cursor: 'pointer' }}
              onClick={() => onSelect(p.key)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(p.key);
                }
              }}
            />
          );
        })}
    </svg>
  );
}
