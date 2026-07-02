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
        <EditarPerfilModal onClose={() => setShowEditProfile(false)} onRefresh={() => window.location.reload()} />
      )}
    </>
  );
}
