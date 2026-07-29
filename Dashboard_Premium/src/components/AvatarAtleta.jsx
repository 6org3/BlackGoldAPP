import HexAvatar from './arcade/HexAvatar';
import { useFotoUrl } from '../hooks/useFotoUrl';

/**
 * Avatar de un atleta: su foto de identificación si la tiene, y si no la
 * inicial de siempre. Envuelve a HexAvatar resolviendo la URL firmada.
 *
 * Es el único punto por el que debe entrar un retrato en la UI — nunca un
 * <img> suelto, que se quedaría sin el fallback ni la invalidación de firma.
 */
export default function AvatarAtleta({
  fotoPath,
  nombre,
  initial,
  alt,
  ...resto
}) {
  const { url, alFallar } = useFotoUrl(fotoPath);
  const inicial = initial ?? nombre?.charAt(0)?.toUpperCase() ?? '?';

  return (
    <HexAvatar
      {...resto}
      src={url}
      // alt vacío por defecto: en casi todos los sitios el nombre ya está en
      // texto al lado, y repetirlo sería ruido para un lector de pantalla.
      alt={alt ?? ''}
      initial={inicial}
      onErrorFoto={alFallar}
    />
  );
}
