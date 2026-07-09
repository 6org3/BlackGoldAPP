import { useState, useCallback } from 'react';
import { useAuth } from '../AuthContext';
import { useAppAtletasData, FILTROS_INICIALES } from '../hooks/useAppAtletasData';
import AppToolbar from './AppToolbar';
import AppAthleteGrid from './AppAthleteGrid';
import AppAthleteProfileModal from './AppAthleteProfileModal';
import AppSecondaryModals from './AppSecondaryModals';
import GrupoTendencias from './GrupoTendencias';

/**
 * Plantel — el grid de atletas con su toolbar de búsqueda/filtros/orden,
 * estados de carga, tendencias del grupo y modales asociados.
 *
 * Módulo autocontenido (extraído de App.jsx en el PR3 del rediseño,
 * blueprint §2.1): carga sus propios datos vía useAppAtletasData, así que
 * puede embeberse en cualquier home por rol (/coach, /club, /sistema)
 * además de seguir siendo el corazón de /dashboard. El scoping por club y
 * por categoría del coach ya lo aplica la capa de servicios en SQL.
 *
 * Props:
 * - user: opcional; si no llega, se toma de useAuth(). Útil para que la
 *   página que ya tiene al user no fuerce un doble contexto.
 * - showEditProfile / setShowEditProfile: opcionales; solo los usa
 *   /dashboard porque el botón "Editar Perfil" vive en AppHeader. Los
 *   homes que embeben el Plantel no los necesitan.
 */
export default function Plantel({ user: userProp = null, showEditProfile = false, setShowEditProfile = () => {} }) {
  const { user: userAuth } = useAuth();
  const user = userProp || userAuth;

  const [ordenarPor, setOrdenarPor] = useState('overall');
  const [selectedAtleta, setSelectedAtleta] = useState(null);
  const [showAsignador, setShowAsignador] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);

  const {
    atletas,
    loading,
    loadMore,
    atletasFiltrados,
    atletasPaginados,
    currentHasMore,
    showReadinessModal,
    setShowReadinessModal,
  } = useAppAtletasData({ user, busqueda, filtros, ordenarPor });

  const handleFiltroChange = useCallback((key, value) => {
    setFiltros(prev => ({ ...prev, [key]: value }));
  }, []);

  return (
    <>
      {/* Premium Dashboard Toolbar */}
      {user.rol !== 'atleta' && !loading && (
        <AppToolbar
          busqueda={busqueda}
          setBusqueda={setBusqueda}
          filtros={filtros}
          handleFiltroChange={handleFiltroChange}
          ordenarPor={ordenarPor}
          setOrdenarPor={setOrdenarPor}
          setShowAsignador={setShowAsignador}
        />
      )}

      <AppAthleteGrid
        loading={loading}
        atletasPaginados={atletasPaginados}
        currentHasMore={currentHasMore}
        atletasFiltradosLength={atletasFiltrados.length}
        onSelect={setSelectedAtleta}
        onLoadMore={loadMore}
      />

      {/* Tendencias agregadas del grupo visible (respeta los filtros) */}
      {!loading && <GrupoTendencias atletas={atletasFiltrados} />}

      {/* Modal Perfil Específico */}
      <AppAthleteProfileModal
        selectedAtleta={selectedAtleta}
        atletas={atletas}
        onClose={() => setSelectedAtleta(null)}
      />

      <AppSecondaryModals
        atletas={atletas}
        user={user}
        showAsignador={showAsignador}
        setShowAsignador={setShowAsignador}
        showReadinessModal={showReadinessModal}
        setShowReadinessModal={setShowReadinessModal}
        showEditProfile={showEditProfile}
        setShowEditProfile={setShowEditProfile}
      />
    </>
  );
}
