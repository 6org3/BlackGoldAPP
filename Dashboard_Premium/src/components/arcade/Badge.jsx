import { HEX, C, GRAD, GLOW, PIXEL } from './arcadeTokens';

/**
 * Insignia hexagonal automática — se desbloquea al poner 5★ en su eje.
 * Bloqueada: gris desaturado. Activa: hex dorado con glow y `bg-pop`.
 * `name` admite salto de línea (\n) para nombres de dos renglones.
 */
export default function Badge({ icon, name, unlocked = false }) {
  return (
    <div style={{ flex: 1, textAlign: 'center' }}>
      <div
        style={{
          width: 54,
          height: 54,
          margin: '0 auto',
          clipPath: HEX,
          display: 'grid',
          placeItems: 'center',
          fontSize: 21,
          background: unlocked ? GRAD.goldHex : 'rgba(255,255,255,.04)',
          boxShadow: unlocked ? GLOW.hexGoldStrong : 'none',
          filter: unlocked ? 'none' : 'grayscale(1) opacity(.4)',
          animation: unlocked ? 'bg-pop .4s ease-out' : 'none',
          transition: 'all .25s',
        }}
      >
        <span aria-hidden="true">{icon}</span>
      </div>
      <p
        style={{
          margin: '7px 0 0',
          fontFamily: PIXEL,
          fontSize: 7,
          letterSpacing: '.02em',
          lineHeight: 1.35,
          whiteSpace: 'pre-line',
          color: unlocked ? C.gold : C.text4,
        }}
      >
        {name}
      </p>
    </div>
  );
}
