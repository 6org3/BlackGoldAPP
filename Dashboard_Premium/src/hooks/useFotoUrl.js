import { useEffect, useState } from 'react';
import { getFotoUrl, invalidarFotoUrl } from '../api/fotosAtletasService';

/**
 * Resuelve la URL firmada de una foto de atleta a partir de su `foto_path`.
 *
 * No hace falta agrupar los paths a mano: el servicio junta en una sola
 * petición de firma todos los que se pidan en el mismo tick, así que una lista
 * de 100 tarjetas monta 100 avatares y hace 1 round-trip.
 *
 * Devuelve también `alFallar`, que hay que cablear al onError del <img>: una
 * firma caducada (pestaña abierta más de una hora, portátil que despierta de
 * suspensión) solo se detecta cuando la imagen falla al cargar.
 */
export function useFotoUrl(fotoPath) {
  const [url, setUrl] = useState(null);

  // Al cambiar de foto se olvida la URL anterior durante el render, no en un
  // efecto: así el avatar nunca llega a pintar la cara del atleta anterior.
  const [pathPrevio, setPathPrevio] = useState(fotoPath);
  if (pathPrevio !== fotoPath) {
    setPathPrevio(fotoPath);
    setUrl(null);
  }

  useEffect(() => {
    if (!fotoPath) return undefined;

    let vivo = true;
    const resolver = () => {
      getFotoUrl(fotoPath)
        .then((u) => { if (vivo) setUrl(u); })
        .catch(() => { if (vivo) setUrl(null); });
    };

    resolver();

    // Al volver a la pestaña se re-resuelve: lo que siga vigente sale de caché
    // y lo caducado se re-firma en un único lote. Sin setInterval a propósito —
    // re-firmar genera un token nuevo y obliga al navegador a volver a
    // descargar la imagen.
    const alVolver = () => { if (document.visibilityState === 'visible') resolver(); };
    document.addEventListener('visibilitychange', alVolver);

    return () => {
      vivo = false;
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [fotoPath]);

  const alFallar = () => {
    invalidarFotoUrl(fotoPath);
    setUrl(null);
  };

  return { url, alFallar };
}
