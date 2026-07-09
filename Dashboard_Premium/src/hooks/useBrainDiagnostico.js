// src/hooks/useBrainDiagnostico.js
// Hook de lectura del diagnóstico 360° del cerebro (brainService, cacheado
// por atleta). Refetchea al cambiar atletaId — p.ej. cuando el padre cambia
// de hijo en PadreDashboard — y expone `refrescar` (invalida caché + repide).
import { useCallback, useEffect, useState } from 'react';
import { fetchDiagnosticoAtleta, invalidarDiagnostico } from '../api/brainService';

/**
 * Diagnóstico 360° de un atleta vía brain-gateway.
 *
 * Patrón anti-carreras: el estado se escribe SOLO tras el await (regla
 * react-hooks/set-state-in-effect) y cada respuesta queda atada a su `clave`
 * (atletaId + versión); si el atleta cambia mientras el request vuela, el
 * resultado viejo deja de ser vigente y `loading` se deriva solo, sin
 * setState síncrono en el efecto.
 *
 * @param {string|undefined} atletaId - atletas.id; sin él no se pide nada y loading=false.
 * @returns {{ diagnostico: Object|null, atleta: Object|null, fuente: Object|null,
 *   loading: boolean, error: Error|null, refrescar: Function }}
 */
export function useBrainDiagnostico(atletaId) {
  // `version` fuerza un refetch tras invalidar la caché (refrescar()).
  const [version, setVersion] = useState(0);
  // Última respuesta: { clave, data, error }.
  const [resultado, setResultado] = useState(null);

  const clave = atletaId ? `${atletaId}:${version}` : null;

  useEffect(() => {
    if (!clave) return undefined;
    let cancelado = false;
    (async () => {
      try {
        const data = await fetchDiagnosticoAtleta(atletaId);
        if (!cancelado) setResultado({ clave, data, error: null });
      } catch (err) {
        if (!cancelado) setResultado({ clave, data: null, error: err });
      }
    })();
    return () => { cancelado = true; };
  }, [clave, atletaId]);

  const refrescar = useCallback(() => {
    if (!atletaId) return;
    invalidarDiagnostico(atletaId);
    setVersion((v) => v + 1);
  }, [atletaId]);

  const vigente = resultado && resultado.clave === clave ? resultado : null;

  return {
    diagnostico: vigente?.data?.diagnostico ?? null,
    atleta: vigente?.data?.atleta ?? null,
    fuente: vigente?.data?.fuente ?? null,
    loading: Boolean(clave) && !vigente,
    error: vigente?.error ?? null,
    refrescar,
  };
}
