import { useState } from 'react';
import Sidebar from './components/Sidebar';
import AthleteLayout from './components/AthleteLayout';
import { useAuth } from './AuthContext';
import ReadinessModal from './components/ReadinessModal';
import { useNavigate } from 'react-router-dom';
import { useAppAtletasData, FILTROS_INICIALES } from './hooks/useAppAtletasData';
import AppHeader from './components/AppHeader';
import Plantel from './components/Plantel';

// Vista exclusiva para atletas — layout propio con sidebar + tabs. El switch
// vive aquí (y no en Plantel) porque tanto /dashboard como su alias /atleta
// conmutan a esta vista según el rol; la extracción a un home nativo propio
// llega con el rediseño del home del atleta (blueprint §3.3).
function VistaAtleta({ user }) {
  const {
    atletas,
    loading,
    atletasOrdenados,
    showReadinessModal,
    setShowReadinessModal,
  } = useAppAtletasData({ user, busqueda: '', filtros: FILTROS_INICIALES, ordenarPor: 'overall' });

  // Para rol atleta el hook no consulta el listado (usa la ficha del propio
  // user), así que `loading` dura un tick y no hay nada útil que pintar aún.
  if (loading) return null;

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

// Página /dashboard: Sidebar + header + el módulo Plantel (grid de atletas
// con toolbar y filtros, extraído a src/components/Plantel.jsx en el PR3
// para poder embeberlo también en los homes por rol).
function App() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);

  const handleLogout = () => { logout(); navigate('/login'); };

  if (user.rol === 'atleta') return <VistaAtleta user={user} />;

  return (
    <div className="flex h-dvh bg-surface-base overflow-hidden text-white selection:bg-brand selection:text-black">
      <Sidebar
        isMobileMenuOpen={isMobileMenuOpen}
        setIsMobileMenuOpen={setIsMobileMenuOpen}
      />

      {/* pb móvil reserva espacio para el FAB flotante "Modo Cancha" que
          Sidebar monta en esta superficie (bottom 24px + ~56px de alto) — si
          no, queda flotando sobre la última tarjeta al hacer scroll hasta
          el final. */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 md:p-12 pb-[calc(env(safe-area-inset-bottom)+96px)] md:pb-12 relative">
        {/* Blobs decorativos solo en desktop: el blur gigante + mix-blend
            fuerza composición GPU cara en móviles de gama baja. */}
        <div className="hidden md:block absolute top-[-20%] left-[10%] w-[800px] h-[600px] bg-brand/5 blur-[150px] pointer-events-none rounded-full mix-blend-screen"></div>
        <div className="hidden md:block absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-brand-strong/5 blur-[120px] pointer-events-none rounded-full mix-blend-screen"></div>

        <AppHeader
          user={user}
          setIsMobileMenuOpen={setIsMobileMenuOpen}
          setShowEditProfile={setShowEditProfile}
          handleLogout={handleLogout}
        />

        <Plantel
          user={user}
          showEditProfile={showEditProfile}
          setShowEditProfile={setShowEditProfile}
        />
      </main>
    </div>
  );
}

export default App;
