// Gauge — gauge radial reutilizable, firma visual del mockup v6 (función
// gauge() en docs/mockup_v6_comparar_graficos.html línea 185): SVG 84×84,
// dos círculos concéntricos r=30 stroke=8, el de progreso rotado -90° para
// arrancar a las 12. Geometría fusionada con el mini-reloj SVG real de
// ModoCanchaModalSesionesActivas.jsx (mismo patrón dasharray/dashoffset).
//
// Regla: SOLO para magnitudes 0–100 (%, overall, cobertura). Conteos puros
// van en StatCard (HomeShell.jsx) — el propio mockup separa ambos casos
// (no hay gauge de "216 atletas" en el owner, sí en cobertura/asistencia).
export default function Gauge({ pct, valor = Math.round(pct), label, color, size = 82 }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const pctClamped = Math.max(0, Math.min(100, pct || 0));
  const offset = c * (1 - pctClamped / 100);

  return (
    <div className="text-center" role="img" aria-label={`${label}: ${valor}`}>
      <svg viewBox="0 0 84 84" width={size} height={size} aria-hidden="true">
        <circle cx="42" cy="42" r={r} fill="none" className="stroke-surface-sunken" strokeWidth="8" />
        <circle
          cx="42"
          cy="42"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          transform="rotate(-90 42 42)"
          style={{ transition: 'stroke-dashoffset 1s linear' }}
          className="motion-reduce:transition-none"
        />
        <text x="42" y="46" textAnchor="middle" fontSize="18" fontWeight="900" className="fill-fg">
          {valor}
        </text>
      </svg>
      <div className="text-3xs uppercase tracking-widest text-fg-muted font-bold mt-1">{label}</div>
    </div>
  );
}
