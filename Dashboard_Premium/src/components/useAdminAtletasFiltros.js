import { useState, useMemo } from 'react';
import { NIVEL_ORDER } from './AdminAtletasConstants';

// ─── Hook de filtrado y agrupamiento de atletas ────────────────
export default function useAdminAtletasFiltros(atletas) {
  // ─── Filter State ─────────────────────────────────────────
  const [busqueda, setBusqueda] = useState('');
  const [filtroCat, setFiltroCat] = useState('Todas');
  const [filtroNivel, setFiltroNivel] = useState('Todos');
  const [filtroPosicion, setFiltroPosicion] = useState('Todas');
  const [filtroGenero, setFiltroGenero] = useState('Todos');
  const [showFilters, setShowFilters] = useState(false);

  // ─── Filtrado y agrupamiento (memoizado) ──────────────────
  const atletasFiltrados = useMemo(() => {
    if (!atletas) return [];

    const hasFilters = busqueda !== '' ||
                       filtroCat !== 'Todas' ||
                       filtroNivel !== 'Todos' ||
                       filtroPosicion !== 'Todas' ||
                       filtroGenero !== 'Todos';

    if (!hasFilters) return []; // No renderizar todo el array inicial para mejorar fluidez

    return atletas.filter(a => {
      // Búsqueda de texto
      if (busqueda) {
        const b = busqueda.toLowerCase();
        const matchName = a.nombre?.toLowerCase().includes(b);
        const matchCedula = a.cedula?.toLowerCase().includes(b);
        if (!matchName && !matchCedula) return false;
      }
      // Filtro Categoría
      if (filtroCat !== 'Todas' && a.categoria !== filtroCat) return false;
      // Filtro Nivel
      if (filtroNivel !== 'Todos') {
        const nivelAtleta = a.nivel_desarrollo || 'Por Asignar';
        if (nivelAtleta !== filtroNivel) return false;
      }
      // Filtro Posición
      if (filtroPosicion !== 'Todas' && a.posicion !== filtroPosicion) return false;
      // Filtro Género
      if (filtroGenero !== 'Todos') {
        const generoAtleta = a.genero || 'Masculino';
        if (generoAtleta !== filtroGenero) return false;
      }
      return true;
    });
  }, [atletas, busqueda, filtroCat, filtroNivel, filtroPosicion, filtroGenero]);

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
    clearFilters,
  };
}
