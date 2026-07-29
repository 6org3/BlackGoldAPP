import { useState, useEffect } from 'react';
import { Camera } from 'lucide-react';
import HexAvatar from './arcade/HexAvatar';
import { C, GRAD } from './arcade/arcadeTokens';
import { useFotoUrl } from '../hooks/useFotoUrl';
import FotoAtletaModal from './FotoAtletaModal';

/**
 * Avatar de un atleta: su foto de identificación si la tiene, y si no la
 * inicial de siempre. Envuelve a HexAvatar resolviendo la URL firmada.
 *
 * Es el único punto por el que debe entrar un retrato en la UI — nunca un
 * <img> suelto, que se quedaría sin el fallback ni la invalidación de firma.
 *
 * Con `editable`, se vuelve un botón con badge de cámara que abre el modal de
 * captura. Quién puede editar se decide fuera, con puedeEditarFoto(); aquí
 * solo se pinta. El gate real es la RPC establecer_foto_atleta.
 */
export default function AvatarAtleta({
  fotoPath,
  nombre,
  initial,
  alt,
  editable = false,
  atletaId,
  onCambio,
  size = 44,
  ...resto
}) {
  // El path se mantiene también en local para que la foto recién subida se vea
  // al instante sin obligar a recargar la lista entera que contiene al avatar.
  const [pathLocal, setPathLocal] = useState(fotoPath);
  useEffect(() => { setPathLocal(fotoPath); }, [fotoPath]);

  const { url, alFallar } = useFotoUrl(pathLocal);
  const [abierto, setAbierto] = useState(false);
  const inicial = initial ?? nombre?.charAt(0)?.toUpperCase() ?? '?';

  const avatar = (
    <HexAvatar
      {...resto}
      size={size}
      src={url}
      // alt vacío por defecto: en casi todos los sitios el nombre ya está en
      // texto al lado, y repetirlo sería ruido para un lector de pantalla.
      alt={alt ?? ''}
      initial={inicial}
      onErrorFoto={alFallar}
    />
  );

  if (!editable || !atletaId) return avatar;

  const ladoBadge = Math.max(15, Math.round(size * 0.32));
  const holgura = size < 44 ? (44 - size) / 2 : 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label={`Cambiar foto de ${nombre || 'el atleta'}`}
        className="cut-focus relative"
        style={{ width: size, height: size, lineHeight: 0, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
      >
        {avatar}
        {/* El badge hace explícita la afordancia: sin él, tocar la cara es un
            gesto oculto que nadie descubre. */}
        <span
          aria-hidden="true"
          style={{
            position: 'absolute', right: -2, bottom: -2,
            width: ladoBadge, height: ladoBadge,
            borderRadius: '50%',
            background: GRAD.goldCTA,
            color: C.ink,
            display: 'grid',
            placeItems: 'center',
            border: `1.5px solid ${C.bgApp}`,
          }}
        >
          <Camera size={Math.max(9, Math.round(ladoBadge * 0.6))} strokeWidth={3} />
        </span>
        {/* Amplía el área táctil a 44px sin alterar el layout: los avatares de
            34-40px de las listas son más pequeños que el objetivo mínimo. */}
        {holgura > 0 && (
          <span aria-hidden="true" style={{ position: 'absolute', inset: -holgura }} />
        )}
      </button>

      {abierto && (
        <FotoAtletaModal
          atletaId={atletaId}
          nombre={nombre}
          fotoPath={pathLocal}
          onClose={() => setAbierto(false)}
          onGuardada={(path) => { setPathLocal(path); onCambio?.(path); }}
        />
      )}
    </>
  );
}
