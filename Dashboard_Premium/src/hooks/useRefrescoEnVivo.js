import { useEffect, useId, useRef } from 'react';
import { supabase } from '../api/supabaseClient';

/**
 * useRefrescoEnVivo — avisa a la pantalla de que sus datos envejecieron.
 *
 * El QA de propagación (2026-08-03) midió que una evaluación guardada por el
 * coach está disponible para los cuatro roles en 227–361 ms; lo que faltaba es
 * que alguien VOLVIERA A PREGUNTAR. Este hook es esa campana: no trae datos ni
 * los mezcla en el estado, solo llama a `onCambio` para que la pantalla repita
 * el fetch que ya tiene escrito (con su RLS, sus filtros y su paginación).
 * Leer el payload del evento sería otra cosa — obligaría a duplicar aquí las
 * reglas de negocio de cada portal y a confiar en una fila suelta del WAL.
 *
 * Requiere que la tabla esté en la publicación `supabase_realtime` (v65 metió
 * `evaluaciones_pruebas` y `atletas`). Si no lo está, `postgres_changes` se
 * suscribe SIN error y no llega nada nunca — ese silencio fue justo el bug.
 *
 * @param {object}   opts
 * @param {string}   opts.tabla       Tabla de `public` a observar.
 * @param {string?}  opts.filtro      Filtro de PostgREST (`columna=eq.valor`).
 *                                    Es lo único que admite `postgres_changes`:
 *                                    una sola columna y un solo valor. Cuando el
 *                                    recorte no cabe ahí (varios hijos, todo un
 *                                    club) se omite y filtra la RLS, que ya se
 *                                    evalúa contra el JWT del suscriptor.
 * @param {Function} opts.onCambio    Qué hacer cuando algo cambió.
 * @param {boolean}  opts.activo      Falso = ni siquiera se abre el canal.
 * @param {number}   opts.debounceMs  Ventana de agrupación. Una captura por
 *                                    lotes (20 atletas evaluados seguidos) llega
 *                                    como 20 eventos; sin esto serían 20 refetch.
 */
export function useRefrescoEnVivo({ tabla, filtro = null, onCambio, activo = true, debounceMs = 400 }) {
  // El callback vive en una ref: los portales lo redefinen en cada render
  // (cierra sobre estado propio), y meterlo en las deps del efecto destruiría
  // y recrearía el canal constantemente. Mismo criterio que Sidebar.jsx, que
  // depende solo de primitivas para no reabrir su suscripción.
  const onCambioRef = useRef(onCambio);
  useEffect(() => { onCambioRef.current = onCambio; });

  // Identidad estable por instancia del componente: dos pantallas montadas a la
  // vez sobre la misma tabla necesitan canales distintos. Se limpia a
  // alfanumérico porque el id de React trae delimitadores (`:r0:`, `«r0»`) y el
  // topic viaja en el websocket.
  const instancia = useId().replace(/[^a-zA-Z0-9]/g, '');

  useEffect(() => {
    if (!activo || !tabla) return undefined;

    let temporizador = null;
    const canal = supabase
      .channel(`refresco-${tabla}-${instancia}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: tabla, ...(filtro ? { filter: filtro } : {}) },
        () => {
          clearTimeout(temporizador);
          temporizador = setTimeout(() => onCambioRef.current?.(), debounceMs);
        },
      )
      // Sin try/catch (rompería la memoización del React Compiler) y sin
      // propagar el fallo: un canal caído solo significa que la pantalla se
      // queda con los datos que ya cargó, que es exactamente como se comportaba
      // antes de este hook. Degradar, no romper.
      .subscribe((estado) => {
        if (estado === 'CHANNEL_ERROR' || estado === 'TIMED_OUT') {
          console.warn(`[refresco-en-vivo] canal de "${tabla}" en estado ${estado}: se sigue con los datos ya cargados.`);
        }
      });

    return () => {
      clearTimeout(temporizador);
      supabase.removeChannel(canal);
    };
  }, [tabla, filtro, activo, debounceMs, instancia]);
}

export default useRefrescoEnVivo;
