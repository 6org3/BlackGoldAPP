import { useEffect, useState, useCallback } from 'react';
import { fetchTodosLosAtletas } from '../api/atletasService';
import { calcularCategoriaFEB } from '../api/utilsAtletas';

const FASE_ORDEN = { 'Micro': 0, 'Desarrollo': 1, 'Elite': 2 };

const ITEMS_PER_PAGE = 12;

export function useAppAtletasData({ user, busqueda, filtros, ordenarPor }) {
  const [atletas, setAtletas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [showReadinessModal, setShowReadinessModal] = useState(false);

  const loadData = useCallback(async () => {
    if (user.rol === 'atleta') {
      const uCat = { ...user, categoria: calcularCategoriaFEB(user.fecha_nacimiento || user.edad) };
      setAtletas([uCat]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const data = await fetchTodosLosAtletas(user);

      const dataConCategorias = (data || []).map(a => ({
        ...a,
        categoria: calcularCategoriaFEB(a.fecha_nacimiento || a.edad) || a.categoria
      }));

      setAtletas(dataConCategorias);
    } catch (err) {
      console.error("Error al cargar datos:", err);
      setAtletas([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const loadMore = () => {
    setPage(p => p + 1);
  };

  useEffect(() => {
    setPage(1);
  }, [busqueda, filtros, ordenarPor]);

  useEffect(() => {
    loadData();

    // Check readiness diario si es atleta (a partir de las 6:00 AM)
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
  }, [loadData, user]);

  // Filtrar
  const atletasFiltrados = atletas.filter(a => {
    // Búsqueda
    if (busqueda) {
      const q = busqueda.toLowerCase();
      const matchName = (a.nombre || '').toLowerCase().includes(q);
      const matchCedula = (a.cedula || '').toLowerCase().includes(q);
      if (!matchName && !matchCedula) return false;
    }

    // Filtros
    if (filtros.categoria !== 'Todas') {
      const catFiltro = filtros.categoria;
      const catAtleta = a.categoria || '';
      if (catAtleta !== catFiltro && !catFiltro.includes(catAtleta) && !catAtleta.includes(catFiltro)) {
        return false;
      }
    }
    if (filtros.posicion !== 'Todas' && a.posicion !== filtros.posicion) return false;
    if (filtros.nivelDesarrollo !== 'Todos' && a.nivel_desarrollo !== filtros.nivelDesarrollo) return false;
    if (filtros.genero !== 'Todos' && a.genero !== filtros.genero) return false;
    return true;
  });

  // Ordenar
  const atletasOrdenados = [...atletasFiltrados].sort((a, b) => {
    switch (ordenarPor) {
      case 'nombre': return (a.nombre || '').localeCompare(b.nombre || '');
      case 'edad': return (a.edad || 0) - (b.edad || 0);
      case 'nivel_desarrollo': {
        const fA = FASE_ORDEN[a.nivel_desarrollo] ?? 0;
        const fB = FASE_ORDEN[b.nivel_desarrollo] ?? 0;
        return fB - fA;
      }
      case 'overall': return (b.overall_score || 0) - (a.overall_score || 0);
      case 'talla': return (b.talla_cm || 0) - (a.talla_cm || 0);
      default: return 0;
    }
  });

  const atletasPaginados = atletasOrdenados.slice(0, page * ITEMS_PER_PAGE);
  const currentHasMore = atletasPaginados.length < atletasOrdenados.length;

  return {
    atletas,
    loading,
    page,
    loadData,
    loadMore,
    atletasFiltrados,
    atletasOrdenados,
    atletasPaginados,
    currentHasMore,
    showReadinessModal,
    setShowReadinessModal,
  };
}
