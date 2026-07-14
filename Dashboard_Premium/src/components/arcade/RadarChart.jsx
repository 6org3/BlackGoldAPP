/* ============================================================
   Radar de 7 pilares — primitiva Arcade genérica, táctil u
   observacional.

   Acepta `axes` [{key,label,value 0..100}]. Con `selectedKey` resalta ese
   vértice (círculo dorado claro) y con `onSelect(key)` los ejes son táctiles;
   sin ellos es un radar display-only (sin punto de selección) — el modo del
   portal Padre. `rings` define los anillos interiores (factores 0..1).
   Geometría idéntica al prototipo Arcade: centro (130,112), radio máx 82,
   viewBox 260×215; vértice i → ang=-90°+i·(360/7), r=82·(value/100).
   ============================================================ */

import { C, PIXEL, RADAR_FILL } from './arcadeTokens';

const CX = 130;
const CY = 112;
const MAXR = 82;
const N = 7;

function vertex(i, factor) {
  const ang = ((-90 + i * (360 / N)) * Math.PI) / 180;
  const r = MAXR * factor;
  return [CX + r * Math.cos(ang), CY + r * Math.sin(ang)];
}
const fmt = (pt) => `${pt[0].toFixed(1)},${pt[1].toFixed(1)}`;
const ring = (factor) => Array.from({ length: N }, (_, i) => fmt(vertex(i, factor))).join(' ');
const clamp = (v) => Math.max(0, Math.min(100, Number(v) || 0));
const dataPoints = (axes) => axes.map((p, i) => fmt(vertex(i, clamp(p.value) / 100))).join(' ');

// Posiciones de las 7 etiquetas alrededor del radar (mismo layout del prototipo).
const LABEL_XY = [
  [130, 18], [212, 52], [234, 138], [173, 206], [87, 206], [28, 138], [52, 52],
];

export default function RadarChart({
  axes = [],
  selectedKey,
  onSelect,
  accent = C.gold,
  fill = RADAR_FILL,
  rings = [1 / 3, 2 / 3],
}) {
  // Punto de selección solo cuando selectedKey apunta a un eje real: sin él
  // (radar display-only, p. ej. el del Padre) no se dibuja ningún vértice.
  const selIdx = axes.findIndex((a) => a.key === selectedKey);
  const sel = selIdx >= 0 ? vertex(selIdx, clamp(axes[selIdx].value) / 100) : null;
  return (
    <svg viewBox="0 0 260 215" width="82%" style={{ margin: '0 auto' }} role="img" aria-label="Radar de 7 pilares">
      {rings.map((f) => (
        <polygon key={f} points={ring(f)} fill="none" stroke="rgba(255,255,255,.07)" />
      ))}
      <polygon points={ring(1)} fill="none" stroke="rgba(255,215,0,.12)" />
      <polygon points={dataPoints(axes)} fill={fill} stroke={accent} strokeWidth="2" />
      {sel && <circle cx={sel[0].toFixed(1)} cy={sel[1].toFixed(1)} r="4.5" fill={C.goldLight} />}
      {axes.map((p, i) => (
        <text
          key={p.key}
          x={LABEL_XY[i][0]}
          y={LABEL_XY[i][1]}
          fill={p.key === selectedKey ? accent : C.text2}
          textAnchor="middle"
          style={{ fontFamily: PIXEL, fontSize: 7, cursor: onSelect ? 'pointer' : 'default' }}
          onClick={onSelect ? () => onSelect(p.key) : undefined}
        >
          {p.label}
        </text>
      ))}
    </svg>
  );
}
