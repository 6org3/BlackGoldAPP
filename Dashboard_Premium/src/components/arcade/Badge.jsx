import { HEX, C, GRAD, GLOW, PIXEL } from './arcadeTokens';

/**
 * Insignia hexagonal automática — se desbloquea al poner 5★ en su eje.
 * Bloqueada: gris desaturado. Activa: hex dorado con glow.
 * `name` admite salto de línea (\n) para nombres de dos renglones.
 *
 * `pop` (default true): reproduce `bg-pop` al desbloquear — para superficies
 * donde el unlock ocurre en vivo (PantallaEvaluar). En galerías en reposo
 * (Progreso del atleta) pasar pop={false} para que no re-anime en cada mount.
 * `glow` permite bajar la intensidad (p. ej. GLOW.hexGoldMid en reposo) y
 * `countLabel` añade la línea de conteo bajo el nombre.
 */
export default function Badge({ icon, name, unlocked = false, pop = true, glow = GLOW.hexGoldStrong, countLabel }) {
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
          boxShadow: unlocked ? glow : 'none',
          filter: unlocked ? 'none' : 'grayscale(1) opacity(.4)',
          animation: unlocked && pop ? 'bg-pop .4s ease-out' : 'none',
          // §5: nunca transition-all — solo las props que cambian al desbloquear.
          transition: 'filter .25s ease, box-shadow .25s ease',
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
      {countLabel != null && (
        <p style={{ margin: '3px 0 0', fontFamily: PIXEL, fontSize: 8, color: unlocked ? C.text : C.text4 }}>
          {countLabel}
        </p>
      )}
    </div>
  );
}
