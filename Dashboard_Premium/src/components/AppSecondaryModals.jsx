import InstallPrompt from './InstallPrompt';
import AsignadorMisiones from './AsignadorMisiones';
import ReadinessModal from './ReadinessModal';
import EditarPerfilModal from './EditarPerfilModal';

export default function AppSecondaryModals({
  atletas,
  user,
  showAsignador,
  setShowAsignador,
  showReadinessModal,
  setShowReadinessModal,
  showEditProfile,
  setShowEditProfile,
}) {
  return (
    <>
      {/* PWA Install Prompt */}
      <InstallPrompt />

      {showAsignador && (
        <AsignadorMisiones
          todosLosAtletas={atletas}
          onClose={() => setShowAsignador(false)}
        />
      )}

      {showReadinessModal && (
        <ReadinessModal
          atletaId={user.atleta_id}
          onClose={() => setShowReadinessModal(false)}
          onComplete={() => {
            // Si se requiere refrescar, se puede llamar loadData
            console.log('Readiness guardado');
          }}
        />
      )}

      {/* Modal Editar Perfil */}
      {showEditProfile && (
        <EditarPerfilModal
          onClose={() => setShowEditProfile(false)}
          // Recarga completa a propósito: AuthContext no expone un refreshUser
          // y supabase.auth.refreshSession() NO sirve aquí (su onAuthStateChange
          // ignora TOKEN_REFRESHED y cualquier evento del mismo auth id), así
          // que sin reload el `user` del contexto quedaría desactualizado tras
          // editar el perfil. Reemplazar cuando AuthContext exponga refreshUser.
          onRefresh={() => window.location.reload()}
        />
      )}
    </>
  );
}
