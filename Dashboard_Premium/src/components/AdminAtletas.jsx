import React, { useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { supabase } from '../api/supabaseClient';
import { AlertCircle, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ScoutingReportTemplate from './ScoutingReportTemplate';
import AntropometriaModal from './AntropometriaModal';
import useAdminAtletasFiltros from './useAdminAtletasFiltros';
import useAdminAtletasForm from './useAdminAtletasForm';
import AdminAtletasHeader from './AdminAtletasHeader';
import AdminAtletasForm from './AdminAtletasForm';
import AdminAtletasFiltersPanel from './AdminAtletasFiltersPanel';
import AdminAtletasGrupoNivel from './AdminAtletasGrupoNivel';
import { COLORS } from '../lib/designTokens';

export default function AdminAtletas({ atletas, onRefresh, user }) {
  const navigate = useNavigate();

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
  } = useAdminAtletasForm({ onRefresh, user });

  const {
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
  } = useAdminAtletasFiltros(user);

  // ─── View State ───────────────────────────────────────────
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'

  // ─── Modals ───────────────────────────────────────────────
  const [evaluatingAntropometria, setEvaluatingAntropometria] = useState(null);
  const [exportingAtleta, setExportingAtleta] = useState(null);
  const reportRef = React.useRef(null);

  // Handlers estables: las cards/filas están memoizadas (React.memo) y
  // reciben estas referencias directamente.
  const handleDelete = useCallback(async (atleta) => {
    if (!confirm(`¿Seguro que deseas eliminar a ${atleta.nombre}? Esta acción no se puede deshacer.`)) return;
    await supabase.from('atletas').delete().eq('id', atleta.atleta_id);
    await supabase.from('usuarios').delete().eq('id', atleta.id);
    if (onRefresh) onRefresh();
  }, [onRefresh]);

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
        alert("Hubo un error al generar el PDF.");
      } finally {
        setExportingAtleta(null);
      }
    }, 100);
  }, []);

  return (
    <div className="max-w-7xl mx-auto">
      {/* ═══════════════════════ HEADER ═══════════════════════ */}
      <AdminAtletasHeader
        navigate={navigate}
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
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="mb-6 p-4 rounded-control bg-danger/10 border border-danger/30 text-danger-soft text-sm font-bold flex items-center space-x-3"
          >
            <AlertCircle size={18} /><span>{error}</span>
            <button onClick={() => setError('')} aria-label="Cerrar mensaje" className="ml-auto p-2 -m-2 text-danger-soft/60 hover:text-red-300"><X size={16} /></button>
          </motion.div>
        )}
        {success && (
          <motion.div
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="mb-6 p-4 rounded-control bg-success/10 border border-success/30 text-success-soft text-sm font-bold"
          >
            {success}
            <button onClick={() => setSuccess('')} aria-label="Cerrar mensaje" className="ml-4 p-2 -m-2 text-success-soft/60 hover:text-emerald-300"><X size={16} /></button>
          </motion.div>
        )}
      </AnimatePresence>

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
        filtrosActivos={filtrosActivos}
        clearFilters={clearFilters}
      />

      {/* ═══════════════════════ LISTA DE ATLETAS AGRUPADOS ═══════════════════════ */}
      <AdminAtletasGrupoNivel
        atletasAgrupados={atletasAgrupados}
        loading={loadingFiltrados}
        viewMode={viewMode}
        filtrosActivos={filtrosActivos}
        clearFilters={clearFilters}
        exportingAtleta={exportingAtleta}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onExport={exportPDF}
        onAntropometria={setEvaluatingAntropometria}
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
    </div>
  );
}
