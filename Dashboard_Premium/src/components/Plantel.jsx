import { useState, useCallback, useMemo } from 'react';
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
    loadData,
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

  // La ficha abierta se resuelve contra la lista viva, no contra la copia que
  // se guardó al hacer clic: así, cuando `loadData()` trae al atleta con su
  // evaluación recién guardada, el modal ya montado se repinta con el dato
  // nuevo. Si el refetch lo dejó fuera (cambió de página o de filtro), se
  // conserva la copia previa en vez de cerrar el modal en la cara del coach.
  const atletaEnFicha = useMemo(() => {
    if (!selectedAtleta) return null;
    const id = selectedAtleta.atleta_id || selectedAtleta.id;
    return atletas.find((a) => (a.atleta_id || a.id) === id) || selectedAtleta;
  }, [selectedAtleta, atletas]);

  return (
    <>
      {/* Premium Dashboard Toolbar */}
      {/* Se monta con `loading` en curso a propósito: cada filtro dispara una
          query, así que condicionarla a `!loading` desmontaba la barra entera en
          cada tecleo y el campo perdía el foco a mitad de palabra (con los
          <select> no se notaba porque un clic aplica el valor completo, pero
          hacía intecleable cualquier campo de texto o número). Quien comunica la
          carga es AppAthleteGrid, que ya recibe `loading`. */}
      {user.rol !== 'atleta' && (
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
        selectedAtleta={atletaEnFicha}
        atletas={atletas}
        onClose={() => setSelectedAtleta(null)}
        // Cierra el loop de quien evalúa: al guardar desde la ficha se recarga
        // el plantel, que es de donde salen el overall, el radar y las alertas.
        onDatosActualizados={loadData}
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
