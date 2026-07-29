import { useState, useEffect } from 'react';
import { HEX, C, hueBg, hueFg, GLOW } from './arcadeTokens';

/**
 * Qué se pinta dentro del hexágono. Extraída como función pura para poder
 * testearla: el entorno de Vitest del repo es `node`, sin jsdom.
 *
 * Precedencia `children` > `src` > `initial`: los ~25 call sites que pasan un
 * icono lucide como children (ModalShell, ModalHUD, cabeceras Admin*) no son
 * atletas y deben quedar intactos aunque algún día reciban un src por error.
 */
export function resolverContenidoAvatar({ src, fallo, children, initial }) {
  if (children != null) return 'children';
  if (src && !fallo) return 'foto';
  return initial != null ? 'initial' : 'vacio';
}

/**
 * Avatar/badge hexagonal con inicial, icono o foto. Tamaños del prototipo:
 * 34 / 44 / 54 / 66 / 76px. Colorea por `hue` del atleta, o pasa
 * `background`/`color` directos (p. ej. gradiente info del padre).
 *
 * `src` es una URL firmada del bucket privado fotos-atletas (ver
 * src/api/fotosAtletasService.js): caduca, así que el fallback a la inicial no
 * es decorativo — es el estado normal cuando la firma expira.
 */
export default function HexAvatar({
  initial,
  children,
  size = 44,
  hue,
  background,
  color,
  glow = false,
  onClick,
  ariaLabel,
  style,
  src,
  alt = '',
  onErrorFoto,
}) {
  // Se reinicia al cambiar src: una firma caducada que falló no debe dejar el
  // avatar en modo inicial para siempre cuando llegue la URL renovada.
  const [fallo, setFallo] = useState(false);
  const [cargada, setCargada] = useState(false);
  useEffect(() => { setFallo(false); setCargada(false); }, [src]);

  const bg = background || (hue ? hueBg(hue) : 'rgba(255,255,255,.06)');
  const fg = color || (hue ? hueFg(hue) : C.text);
  const interactive = typeof onClick === 'function';
  const mostrarFoto = resolverContenidoAvatar({ src, fallo, children, initial }) === 'foto';

  return (
    <div
      onClick={onClick}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? ariaLabel : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick(e);
              }
            }
          : undefined
      }
      style={{
        width: size,
        height: size,
        flex: 'none',
        clipPath: HEX,
        background: bg,
        color: fg,
        display: 'grid',
        placeItems: 'center',
        fontWeight: 900,
        fontSize: Math.round(size * 0.34),
        filter: glow ? GLOW.hexGold : undefined,
        cursor: interactive ? 'pointer' : undefined,
        position: 'relative',
        // Redundante con clipPath salvo en Safari, donde un <img> absoluto puede
        // pintarse fuera del clip del padre si ese nodo lleva un filter (glow).
        overflow: 'hidden',
        ...style,
      }}
    >
      {/* La inicial se pinta siempre debajo: es el placeholder mientras carga la
          foto y el fallback si falla, sin hueco vacío ni layout shift. */}
      <span aria-hidden={mostrarFoto && cargada ? 'true' : undefined}>
        {children ?? initial}
      </span>
      {mostrarFoto && (
        <img
          src={src}
          alt={alt}
          draggable={false}
          loading="lazy"
          decoding="async"
          onLoad={() => setCargada(true)}
          onError={() => { setFallo(true); onErrorFoto?.(); }}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            // Red de seguridad de encuadre para fotos que no pasaron por
            // prepararImagen (importadas, legacy): sube el centro hacia la cara.
            objectPosition: '50% 42%',
            opacity: cargada ? 1 : 0,
            transition: 'opacity .18s ease-out',
          }}
        />
      )}
    </div>
  );
}
