import { useState, useMemo, useEffect, useRef } from 'react';
import { NIVEL_ORDER } from './AdminAtletasConstants';
import { fetchTodosLosAtletas } from '../api/atletasService';

// ─── Hook de filtrado y agrupamiento de atletas ────────────────
// El filtrado ocurre en el servidor (fetchTodosLosAtletas con filtros), no
// sobre un array ya cargado en memoria — así un coach o un club grande no
// descarga el roster completo solo para aplicar 4 filtros de UI.
export default function useAdminAtletasFiltros(user) {
  // ─── Filter State ─────────────────────────────────────────
  const [busqueda, setBusqueda] = useState('');
  const [filtroCat, setFiltroCat] = useState('Todas');
  const [filtroNivel, setFiltroNivel] = useState('Todos');
  const [filtroPosicion, setFiltroPosicion] = useState('Todas');
  const [filtroGenero, setFiltroGenero] = useState('Todos');
  const [showFilters, setShowFilters] = useState(false);
  const [busquedaDebounced, setBusquedaDebounced] = useState('');
  const [atletasFiltrados, setAtletasFiltrados] = useState([]);
  const [loadingFiltrados, setLoadingFiltrados] = useState(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setBusquedaDebounced(busqueda), 300);
    return () => clearTimeout(t);
  }, [busqueda]);

  const hasFilters = busquedaDebounced !== '' ||
                     filtroCat !== 'Todas' ||
                     filtroNivel !== 'Todos' ||
                     filtroPosicion !== 'Todas' ||
                     filtroGenero !== 'Todos';

  useEffect(() => {
    if (!hasFilters || !user) {
      setAtletasFiltrados([]); // No traer todo el roster mientras no haya un filtro activo
      return;
    }

    const requestId = ++requestIdRef.current;
    setLoadingFiltrados(true);
    fetchTodosLosAtletas(user, {
      search: busquedaDebounced,
      categoria: filtroCat,
      nivelDesarrollo: filtroNivel,
      posicion: filtroPosicion,
      genero: filtroGenero,
    }).then(data => {
      if (requestId !== requestIdRef.current) return; // filtro cambió mientras cargaba
      setAtletasFiltrados(data || []);
    }).catch(err => {
      console.error('Error al filtrar atletas:', err);
      if (requestId === requestIdRef.current) setAtletasFiltrados([]);
    }).finally(() => {
      if (requestId === requestIdRef.current) setLoadingFiltrados(false);
    });
  }, [user, busquedaDebounced, filtroCat, filtroNivel, filtroPosicion, filtroGenero, hasFilters]);

  const atletasAgrupados = useMemo(() => {
    const groups = {};
    atletasFiltrados.forEach(a => {
      const key = a.nivel_desarrollo || 'Por Asignar';
      if (!groups[key]) groups[key] = [];
      groups[key].push(a);
    });
    // Ordenar grupos según NIVEL_ORDER
    const ordered = [];
    NIVEL_ORDER.forEach(nivel => {
      if (groups[nivel]) {
        ordered.push({ nivel, atletas: groups[nivel] });
      }
    });
    return ordered;
  }, [atletasFiltrados]);

  const filtrosActivos = filtroCat !== 'Todas' || filtroNivel !== 'Todos' || filtroPosicion !== 'Todas' || filtroGenero !== 'Todos';

  const clearFilters = () => {
    setFiltroCat('Todas');
    setFiltroNivel('Todos');
    setFiltroPosicion('Todas');
    setFiltroGenero('Todos');
    setBusqueda('');
  };

  return {
    busqueda, setBusqueda,
    filtroCat, setFiltroCat,
    filtroNivel, setFiltroNivel,
    filtroPosicion, setFiltroPosicion,
    filtroGenero, setFiltroGenero,
    showFilters, setShowFilters,
    atletasFiltrados,
    atletasAgrupados,
    filtrosActivos,
    loadingFiltrados,
    clearFilters,
  };
}
