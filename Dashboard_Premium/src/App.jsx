import { useState, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import AthleteLayout from './components/AthleteLayout';
import { useAuth } from './AuthContext';
import ReadinessModal from './components/ReadinessModal';
import { useNavigate } from 'react-router-dom';
import { useAppAtletasData } from './hooks/useAppAtletasData';
import AppHeader from './components/AppHeader';
import AppToolbar from './components/AppToolbar';
import AppAthleteGrid from './components/AppAthleteGrid';
import AppAthleteProfileModal from './components/AppAthleteProfileModal';
import AppSecondaryModals from './components/AppSecondaryModals';
import GrupoTendencias from './components/GrupoTendencias';

function App() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [ordenarPor, setOrdenarPor] = useState('overall');
  const [selectedAtleta, setSelectedAtleta] = useState(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showAsignador, setShowAsignador] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [filtros, setFiltros] = useState({
    categoria: 'Todas',
    posicion: 'Todas',
    nivelDesarrollo: 'Todos',
    genero: 'Todos',
  });

  const {
    atletas,
    loading,
    loadMore,
    atletasFiltrados,
    atletasOrdenados,
    atletasPaginados,
    currentHasMore,
    showReadinessModal,
    setShowReadinessModal,
  } = useAppAtletasData({ user, busqueda, filtros, ordenarPor });

  const handleFiltroChange = useCallback((key, value) => {
    setFiltros(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleLogout = () => { logout(); navigate('/login'); };

  // Vista exclusiva para atletas — layout propio con sidebar + tabs
  if (!loading && user.rol === 'atleta') {
    const atleta = atletasOrdenados[0] || null;
    return (
      <>
        <AthleteLayout atleta={atleta} todosLosAtletas={atletas} />
        {showReadinessModal && (
          <ReadinessModal
            atletaId={user.atleta_id}
            onClose={() => setShowReadinessModal(false)}
            onComplete={() => console.log('Readiness guardado')}
          />
        )}
      </>
    );
  }

  return (
    <div className="flex h-dvh bg-[#09090b] overflow-hidden text-white selection:bg-[#FFD700] selection:text-black">
      {user.rol !== 'atleta' && (
        <Sidebar
          isMobileMenuOpen={isMobileMenuOpen}
          setIsMobileMenuOpen={setIsMobileMenuOpen}
        />
      )}

      <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 md:p-12 relative">
        {/* Blobs decorativos solo en desktop: el blur gigante + mix-blend
            fuerza composición GPU cara en móviles de gama baja. */}
        <div className="hidden md:block absolute top-[-20%] left-[10%] w-[800px] h-[600px] bg-[#FFD700]/5 blur-[150px] pointer-events-none rounded-full mix-blend-screen"></div>
        <div className="hidden md:block absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-[#D4AF37]/5 blur-[120px] pointer-events-none rounded-full mix-blend-screen"></div>

        <AppHeader
          user={user}
          setIsMobileMenuOpen={setIsMobileMenuOpen}
          setShowEditProfile={setShowEditProfile}
          handleLogout={handleLogout}
        />

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
      </main>
    </div>
  );
}

export default App;
