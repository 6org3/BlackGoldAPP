import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { fetchTodosLosAtletas } from '../api/atletasService';
import { calcularCategoriaFEB } from '../api/utilsAtletas';

const FASE_ORDEN = { 'Micro': 0, 'Desarrollo': 1, 'Elite': 2 };

const ITEMS_PER_PAGE = 12;

// Campos que Postgres puede ordenar directamente. `nivel_desarrollo` usa un
// orden de "fase" (Elite > Desarrollo > Micro) que no es una columna
// ordenable tal cual, así que ese caso se sigue resolviendo en memoria
// sobre el set ya acumulado (ver más abajo).
const ORDER_BY_MAP = {
  nombre: { column: 'nombre', foreignTable: 'usuarios', ascending: true },
  edad: { column: 'edad', ascending: true },
  overall: { column: 'overall_score', ascending: false },
  talla: { column: 'talla_cm', ascending: false },
};

const withCategoria = (a) => ({
  ...a,
  categoria: calcularCategoriaFEB(a.fecha_nacimiento || a.edad) || a.categoria,
});

export function useAppAtletasData({ user, busqueda, filtros, ordenarPor }) {
  const [atletas, setAtletas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [busquedaDebounced, setBusquedaDebounced] = useState(busqueda);
  const [showReadinessModal, setShowReadinessModal] = useState(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setBusquedaDebounced(busqueda), 300);
    return () => clearTimeout(t);
  }, [busqueda]);

  const fetchOptions = useCallback((pageToLoad) => ({
    page: pageToLoad,
    limit: ITEMS_PER_PAGE,
    search: busquedaDebounced,
    categoria: filtros.categoria,
    posicion: filtros.posicion,
    nivelDesarrollo: filtros.nivelDesarrollo,
    genero: filtros.genero,
    orderBy: ORDER_BY_MAP[ordenarPor] || null,
  }), [busquedaDebounced, filtros, ordenarPor]);

  const loadData = useCallback(async () => {
    if (user.rol === 'atleta') {
      setAtletas([withCategoria(user)]);
      setHasMore(false);
      setLoading(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    setLoading(true);

    try {
      const { data, hasMore: more } = await fetchTodosLosAtletas(user, fetchOptions(1));
      if (requestId !== requestIdRef.current) return; // respuesta obsoleta (filtro cambió mientras cargaba)

      setAtletas((data || []).map(withCategoria));
      setHasMore(!!more);
      setPage(1);
    } catch (err) {
      console.error("Error al cargar datos:", err);
      if (requestId === requestIdRef.current) {
        setAtletas([]);
        setHasMore(false);
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [user, fetchOptions]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loading || user.rol === 'atleta') return;

    const requestId = ++requestIdRef.current;
    const nextPage = page + 1;
    setLoading(true);

    try {
      const { data, hasMore: more } = await fetchTodosLosAtletas(user, fetchOptions(nextPage));
      if (requestId !== requestIdRef.current) return;

      setAtletas(prev => [...prev, ...(data || []).map(withCategoria)]);
      setHasMore(!!more);
      setPage(nextPage);
    } catch (err) {
      console.error("Error al cargar más atletas:", err);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [user, page, hasMore, loading, fetchOptions]);

  // Check readiness diario si es atleta (a partir de las 6:00 AM) — solo una
  // vez por usuario, no debe repetirse cada vez que cambian los filtros.
  useEffect(() => {
    if (user.rol === 'atleta' && user.atleta_id) {
      const horaActual = new Date().getHours();
      if (horaActual >= 6) {
        import('../api/readinessService').then(({ fetchReadinessHoy }) => {
          fetchReadinessHoy(user.atleta_id).then(data => {
            if (!data) {
              setShowReadinessModal(true);
            }
          }).catch(err => console.error("Error checking readiness", err));
        });
      }
    }
  }, [user]);

  // Recarga desde el servidor cuando cambia el usuario, la búsqueda
  // (debounced), los filtros o el orden — antes esto se resolvía filtrando
  // en memoria un array ya completo; ahora cada cambio dispara una query.
  useEffect(() => {
    loadData();
  }, [loadData]);

  // `nivel_desarrollo` no se pudo empujar a SQL (ver ORDER_BY_MAP): se
  // reordena en memoria el set ya acumulado por paginación.
  const atletasOrdenados = useMemo(() => {
    if (ordenarPor !== 'nivel_desarrollo') return atletas;
    return [...atletas].sort((a, b) => {
      const fA = FASE_ORDEN[a.nivel_desarrollo] ?? 0;
      const fB = FASE_ORDEN[b.nivel_desarrollo] ?? 0;
      return fB - fA;
    });
  }, [atletas, ordenarPor]);

  return {
    atletas,
    loading,
    page,
    loadData,
    loadMore,
    atletasFiltrados: atletas,
    atletasOrdenados,
    atletasPaginados: atletasOrdenados,
    currentHasMore: hasMore,
    showReadinessModal,
    setShowReadinessModal,
  };
}
