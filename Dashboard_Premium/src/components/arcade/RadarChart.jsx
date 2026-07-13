/* ============================================================
   Radar de 7 pilares — primitiva Arcade genérica y TÁCTIL.

   Extraída del radar inline de VistaPadreArcade (mismo sistema de coordenadas)
   y generalizada: acepta `axes` [{key,label,value 0..100}], resalta el vértice
   `selectedKey` (círculo dorado claro) y llama `onSelect(key)` al tocar un eje.
   Geometría idéntica al prototipo Arcade: centro (130,112), radio máx 82,
   viewBox 260×215; vértice i → ang=-90°+i·(360/7), r=82·(value/100).
   ============================================================ */

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
  accent = '#FFD700',
  fill = 'rgba(255,215,0,.18)',
}) {
  const selIdx = Math.max(0, axes.findIndex((a) => a.key === selectedKey));
  const sel = axes.length ? vertex(selIdx, clamp(axes[selIdx]?.value) / 100) : null;
  return (
    <svg viewBox="0 0 260 215" width="82%" style={{ margin: '0 auto' }} role="img" aria-label="Radar de 7 pilares">
      <polygon points={ring(1 / 3)} fill="none" stroke="rgba(255,255,255,.07)" />
      <polygon points={ring(2 / 3)} fill="none" stroke="rgba(255,255,255,.07)" />
      <polygon points={ring(1)} fill="none" stroke="rgba(255,215,0,.12)" />
      <polygon points={dataPoints(axes)} fill={fill} stroke={accent} strokeWidth="2" />
      {sel && <circle cx={sel[0].toFixed(1)} cy={sel[1].toFixed(1)} r="4.5" fill="#FFEB66" />}
      {axes.map((p, i) => (
        <text
          key={p.key}
          x={LABEL_XY[i][0]}
          y={LABEL_XY[i][1]}
          fill={p.key === selectedKey ? accent : '#9CA3AF'}
          textAnchor="middle"
          fontFamily="Silkscreen"
          style={{ fontSize: 7, cursor: onSelect ? 'pointer' : 'default' }}
          onClick={onSelect ? () => onSelect(p.key) : undefined}
        >
          {p.label}
        </text>
      ))}
    </svg>
  );
}
