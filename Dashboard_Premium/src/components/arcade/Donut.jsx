import { PIXEL, C } from './arcadeTokens';

const R = 58;
const SW = 14;
const CIRC = 2 * Math.PI * R;

/**
 * Anillo de progreso SVG (donut/gauge del HUD). r=58, stroke 14, dash = C·pct/100.
 * El texto central va en un <div> superpuesto (NO <text> SVG, que no escala fiable
 * — regla del handoff). Oro para meta financiera, verde para retención.
 */
export default function Donut({ pct = 0, color = C.gold, centerTop, centerLabel, size = 122, ariaLabel }) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  const dash = `${((CIRC * p) / 100).toFixed(0)} ${Math.ceil(CIRC)}`;
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
      <svg width={size} height={size} viewBox="0 0 140 140" style={{ display: 'block' }} role="img" aria-label={ariaLabel || `${p}%`}>
        <circle cx="70" cy="70" r={R} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth={SW} />
        <circle cx="70" cy="70" r={R} fill="none" stroke={color} strokeWidth={SW} strokeDasharray={dash} transform="rotate(-90 70 70)" />
      </svg>
      {/* Texto central decorativo: el valor ya va en el aria-label del svg; sin
          aria-hidden un lector lo anunciaría dos veces. */}
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ margin: 0, fontFamily: PIXEL, fontSize: 17, color }}>{centerTop}</p>
          {centerLabel && <p style={{ margin: '4px 0 0', fontFamily: PIXEL, fontSize: 6.5, color: C.text3, letterSpacing: '.06em' }}>{centerLabel}</p>}
        </div>
      </div>
    </div>
  );
}
