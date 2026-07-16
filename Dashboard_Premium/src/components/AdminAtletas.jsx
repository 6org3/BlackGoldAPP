import React, { useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { supabase } from '../api/supabaseClient';
import { AlertCircle, X, Trash2, AlertTriangle, UserMinus } from 'lucide-react';
import { marcarBaja } from '../api/retencionService';
import { esBaja } from './adminAtletasMembresia';
import ScoutingReportTemplate from './ScoutingReportTemplate';
import AntropometriaModal from './AntropometriaModal';
import useAdminAtletasFiltros from './useAdminAtletasFiltros';
import useAdminAtletasForm from './useAdminAtletasForm';
import AdminAtletasHeader from './AdminAtletasHeader';
import AdminAtletasForm from './AdminAtletasForm';
import AdminAtletasFiltersPanel from './AdminAtletasFiltersPanel';
import AdminAtletasGrupoNivel from './AdminAtletasGrupoNivel';
import MembresiaAtletaModal from './MembresiaAtletaModal';
import SolicitudesPanel from './SolicitudesPanel';
import ModalHUD from './arcade/ModalHUD';
import { COLORS } from '../lib/designTokens';
import { C, BORDER, TINT, cut } from './arcade/arcadeTokens';

export default function AdminAtletas({ atletas, onRefresh, user }) {
  const {
    showForm, setShowForm,
    editingId, setEditingId,
    saving,
    error, setError,
    success, setSuccess,
    showParentForm, setShowParentForm,
    emptyForm,
    form, setForm,
    handleChange,
    handleEdit,
    handleSubmit,
    esMenor,
    clubes,
    clubesError,
    recargarClubes,
  } = useAdminAtletasForm({ onRefresh, user });

  const {
    busqueda, setBusqueda,
    filtroCat, setFiltroCat,
    filtroNivel, setFiltroNivel,
    filtroPosicion, setFiltroPosicion,
    filtroGenero, setFiltroGenero,
    filtroMembresia, setFiltroMembresia,
    filtroEdadMin, setFiltroEdadMin,
    filtroEdadMax, setFiltroEdadMax,
    showFilters, setShowFilters,
    atletasFiltrados,
    atletasAgrupados,
    filtrosActivos,
    hasFilters,
    loadingFiltrados,
    clearFilters,
    refetch,
  } = useAdminAtletasFiltros(user);

  // ─── View State ───────────────────────────────────────────
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'

  // ─── Modals ───────────────────────────────────────────────
  const [evaluatingAntropometria, setEvaluatingAntropometria] = useState(null);
  const [exportingAtleta, setExportingAtleta] = useState(null);
  // Membresía (v38): qué grupo cubre su cuota y qué extras se le cobran aparte.
  const [membresiaAtleta, setMembresiaAtleta] = useState(null);
  // Diálogo HUD activo (reemplaza confirm/alert nativos): null | { variant, ... }.
  const [modal, setModal] = useState(null);
  const reportRef = React.useRef(null);

  // Quién puede qué (v34, en simetría con la aprobación de solicitudes: quien
  // decide quién entra decide quién sale). Los triggers y la RLS lo repiten
  // server-side — esto solo evita ofrecer un botón que iba a fallar.
  const puedeMembresia = user?.rol === 'owner' || user?.rol === 'superadmin';
  const puedeEliminar = user?.rol === 'superadmin';

  // Handlers estables: las cards/filas están memoizadas (React.memo) y
  // reciben estas referencias directamente.
  const handleDelete = useCallback((atleta) => {
    setModal({
      variant: 'confirm', tone: 'danger', icon: Trash2,
      eyebrow: 'Acción irreversible',
      title: 'Eliminar atleta',
      message: `¿Seguro que deseas eliminar a ${atleta.nombre}? Se borra también todo su historial (asistencia, evaluaciones, pagos, XP) y no se puede deshacer. Para una salida reversible, usa "Dar de baja".`,
      confirmLabel: 'Eliminar',
      onConfirm: async () => {
        setModal(null);
        // Los dos deletes se comprueban: antes se ignoraba el resultado, así que
        // un fallo de RLS en el segundo dejaba el usuario huérfano en silencio.
        const { error: eAtleta } = await supabase.from('atletas').delete().eq('id', atleta.atleta_id);
        const { error: eUsuario } = eAtleta
          ? { error: null }
          : await supabase.from('usuarios').delete().eq('id', atleta.id);
        if (eAtleta || eUsuario) {
          setModal({
            variant: 'alert', tone: 'danger', icon: AlertTriangle, eyebrow: 'Error',
            title: 'No se pudo eliminar', message: (eAtleta || eUsuario).message,
          });
        }
        if (onRefresh) onRefresh();
        refetch();
      },
    });
  }, [onRefresh, refetch]);

  // Dar de baja / reactivar (v31: atletas.estado_membresia). Reversible y
  // conserva el histórico — es la salida por defecto frente a Eliminar.
  const handleToggleMembresia = useCallback((atleta) => {
    const dar = !esBaja(atleta);
    const ejecutar = async () => {
      setModal(null);
      try {
        await marcarBaja(atleta.atleta_id, dar);
        if (onRefresh) onRefresh();
        refetch(); // la lista visible la sirve useAdminAtletasFiltros, no `atletas`
      } catch (e) {
        setModal({
          variant: 'alert', tone: 'danger', icon: AlertTriangle, eyebrow: 'Error',
          title: dar ? 'No se pudo dar de baja' : 'No se pudo reactivar', message: e.message,
        });
      }
    };
    if (!dar) { ejecutar(); return; } // reactivar no necesita confirmación: no destruye nada
    setModal({
      variant: 'confirm', tone: 'warn', icon: UserMinus,
      eyebrow: 'Baja del club',
      title: `¿Dar de baja a ${atleta.nombre}?`,
      message: 'Sale del plantel activo y deja de generar mensualidades. Conserva su historial y puedes reactivarlo cuando vuelva.',
      confirmLabel: 'Dar de baja',
      onConfirm: ejecutar,
    });
  }, [onRefresh, refetch]);

  const exportPDF = useCallback(async (atleta) => {
    setExportingAtleta(atleta);
    setTimeout(async () => {
      if (!reportRef.current) return;
      try {
        // html2canvas-pro (no html2canvas): el CSS del proyecto usa oklch()/
        // color-mix() (modificadores de opacidad de Tailwind v4, ej. bg-white/5)
        // que el html2canvas clásico no sabe parsear y hace fallar el export.
        const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
          import('html2canvas-pro'),
          import('jspdf'),
        ]);
        const canvas = await html2canvas(reportRef.current, {
          scale: 2, useCORS: true, backgroundColor: COLORS.surface.base,
        });
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`Scouting_Report_${atleta.nombre.replace(/\s+/g, '_')}.pdf`);
      } catch (error) {
        console.error("Error generating PDF:", error);
        setModal({
          variant: 'alert', tone: 'danger', icon: AlertTriangle,
          eyebrow: 'Error',
          title: 'No se pudo generar el PDF',
          message: 'Hubo un error al generar el PDF. Intenta de nuevo.',
        });
      } finally {
        setExportingAtleta(null);
      }
    }, 100);
  }, []);

  return (
    <div className="max-w-7xl mx-auto">
      {/* ═══════════════════════ HEADER ═══════════════════════ */}
      <AdminAtletasHeader
        atletasFiltrados={atletasFiltrados}
        atletas={atletas}
        filtrosActivos={filtrosActivos}
        viewMode={viewMode}
        setViewMode={setViewMode}
        showForm={showForm}
        setShowForm={setShowForm}
        setEditingId={setEditingId}
        setForm={setForm}
        emptyForm={emptyForm}
        setShowParentForm={setShowParentForm}
      />

      {/* ═══════════════════════ MENSAJES ═══════════════════════ */}
      <AnimatePresence>
        {error && (
          <motion.div
            role="alert"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="mb-6 p-4 text-sm font-bold flex items-center gap-3"
            style={{ clipPath: cut(10), background: TINT.danger, border: `1px solid ${BORDER.danger}`, color: C.danger }}
          >
            <AlertCircle size={18} className="shrink-0" /><span className="flex-1">{error}</span>
            <button onClick={() => setError('')} aria-label="Cerrar mensaje" className="cut-focus ml-auto p-2 -m-2 min-h-11 min-w-11 flex items-center justify-center" style={{ color: C.danger }}><X size={16} /></button>
          </motion.div>
        )}
        {success && (
          <motion.div
            role="status"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="mb-6 p-4 text-sm font-bold flex items-center gap-3"
            style={{ clipPath: cut(10), background: TINT.ok, border: `1px solid ${BORDER.okStrong}`, color: C.ok }}
          >
            <span className="flex-1">{success}</span>
            <button onClick={() => setSuccess('')} aria-label="Cerrar mensaje" className="cut-focus p-2 -m-2 min-h-11 min-w-11 flex items-center justify-center" style={{ color: C.ok }}><X size={16} /></button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════ SOLICITUDES DE REGISTRO (v33) ═══════════════════════ */}
      {/* Bandeja del registro público: aprobar/rechazar es decisión del dueño
          del club (el coach ni la ve; la RPC lo re-valida server-side). */}
      {(user?.rol === 'owner' || user?.rol === 'superadmin') && (
        <div className="mb-6">
          <SolicitudesPanel onResuelto={onRefresh} />
        </div>
      )}

      {/* ═══════════════════════ FORMULARIO ═══════════════════════ */}
      <AnimatePresence>
        {showForm && (
          <AdminAtletasForm
            form={form}
            handleChange={handleChange}
            esMenor={esMenor}
            showParentForm={showParentForm}
            setShowParentForm={setShowParentForm}
            saving={saving}
            editingId={editingId}
            setEditingId={setEditingId}
            setShowForm={setShowForm}
            handleSubmit={handleSubmit}
            user={user}
            clubes={clubes}
            clubesError={clubesError}
            recargarClubes={recargarClubes}
          />
        )}
      </AnimatePresence>

      {/* ═══════════════════════ BÚSQUEDA Y FILTROS ═══════════════════════ */}
      <AdminAtletasFiltersPanel
        busqueda={busqueda}
        setBusqueda={setBusqueda}
        showFilters={showFilters}
        setShowFilters={setShowFilters}
        filtroCat={filtroCat}
        setFiltroCat={setFiltroCat}
        filtroNivel={filtroNivel}
        setFiltroNivel={setFiltroNivel}
        filtroPosicion={filtroPosicion}
        setFiltroPosicion={setFiltroPosicion}
        filtroGenero={filtroGenero}
        setFiltroGenero={setFiltroGenero}
        filtroMembresia={filtroMembresia}
        setFiltroMembresia={setFiltroMembresia}
        filtroEdadMin={filtroEdadMin}
        setFiltroEdadMin={setFiltroEdadMin}
        filtroEdadMax={filtroEdadMax}
        setFiltroEdadMax={setFiltroEdadMax}
        filtrosActivos={filtrosActivos}
        clearFilters={clearFilters}
      />

      {/* ═══════════════════════ LISTA DE ATLETAS AGRUPADOS ═══════════════════════ */}
      <AdminAtletasGrupoNivel
        atletasAgrupados={atletasAgrupados}
        loading={loadingFiltrados}
        viewMode={viewMode}
        filtrosActivos={filtrosActivos}
        hasFilters={hasFilters}
        clearFilters={clearFilters}
        exportingAtleta={exportingAtleta}
        onEdit={handleEdit}
        onDelete={puedeEliminar ? handleDelete : null}
        onExport={exportPDF}
        onAntropometria={setEvaluatingAntropometria}
        onToggleMembresia={puedeMembresia ? handleToggleMembresia : null}
        onMembresia={setMembresiaAtleta}
      />

      {/* Componente oculto para exportación PDF */}
      <div style={{ position: 'absolute', left: '-9999px', top: '-9999px' }}>
        {exportingAtleta && (
          <ScoutingReportTemplate ref={reportRef} atleta={exportingAtleta} todosLosAtletas={atletas} />
        )}
      </div>

      {/* Modal Antropometría */}
      {evaluatingAntropometria && (
        <AntropometriaModal
          atleta={evaluatingAntropometria}
          onClose={() => setEvaluatingAntropometria(null)}
          onRefresh={onRefresh}
        />
      )}

      {/* Diálogo HUD (reemplaza confirm/alert): borrado de atleta y error de PDF */}
      {membresiaAtleta && (
        <MembresiaAtletaModal
          atleta={membresiaAtleta}
          club={membresiaAtleta.club || user?.club}
          onClose={() => setMembresiaAtleta(null)}
          onSaved={() => { if (onRefresh) onRefresh(); refetch(); }}
        />
      )}

      <ModalHUD open={!!modal} {...(modal || {})} onClose={() => setModal(null)} />
    </div>
  );
}
