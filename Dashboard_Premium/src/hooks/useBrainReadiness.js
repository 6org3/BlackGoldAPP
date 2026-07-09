// src/hooks/useBrainReadiness.js
// Hook de lectura del readiness del cerebro (brainService, cacheado por
// atleta). Refetchea al cambiar atletaId y expone `refrescar` (invalida
// caché + repide). Gemelo de useBrainDiagnostico para el otro recurso.
import { useCallback, useEffect, useState } from 'react';
import { fetchReadinessAtleta, invalidarReadiness } from '../api/brainService';

/**
 * Readiness del día de un atleta vía brain-gateway.
 *
 * Patrón anti-carreras: el estado se escribe SOLO tras el await (regla
 * react-hooks/set-state-in-effect) y cada respuesta queda atada a su `clave`
 * (atletaId + versión); si el atleta cambia mientras el request vuela, el
 * resultado viejo deja de ser vigente y `loading` se deriva solo, sin
 * setState síncrono en el efecto.
 *
 * @param {string|undefined} atletaId - atletas.id; sin él no se pide nada y loading=false.
 * @returns {{ readiness: Object|null, atleta: Object|null, fuente: Object|null,
 *   loading: boolean, error: Error|null, refrescar: Function }}
 */
export function useBrainReadiness(atletaId) {
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
        const data = await fetchReadinessAtleta(atletaId);
        if (!cancelado) setResultado({ clave, data, error: null });
      } catch (err) {
        if (!cancelado) setResultado({ clave, data: null, error: err });
      }
    })();
    return () => { cancelado = true; };
  }, [clave, atletaId]);

  const refrescar = useCallback(() => {
    if (!atletaId) return;
    invalidarReadiness(atletaId);
    setVersion((v) => v + 1);
  }, [atletaId]);

  const vigente = resultado && resultado.clave === clave ? resultado : null;

  return {
    readiness: vigente?.data?.readiness ?? null,
    atleta: vigente?.data?.atleta ?? null,
    fuente: vigente?.data?.fuente ?? null,
    loading: Boolean(clave) && !vigente,
    error: vigente?.error ?? null,
    refrescar,
  };
}
