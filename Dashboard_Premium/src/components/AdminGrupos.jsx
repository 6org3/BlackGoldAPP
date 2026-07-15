import { useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Boxes, Plus, Pencil, Archive, ArchiveRestore, Trash2, AlertCircle, X, Users } from 'lucide-react';
import useAdminGruposForm from './useAdminGruposForm';
import AdminGruposForm from './AdminGruposForm';
import SelectField from './AdminAtletasSelectField';
import CutCard from './arcade/CutCard';
import HexAvatar from './arcade/HexAvatar';
import MicroLabel from './arcade/MicroLabel';
import ModalHUD from './arcade/ModalHUD';
import { NIVELES_GRUPO } from '../api/gruposService';
import { C, BORDER, TINT, GRAD, cut } from './arcade/arcadeTokens';

// ─── Gestión de grupos de entrenamiento (v37) ───
// Molde: AdminEquipo. La doctrina es la misma: retirar NO borra. Un grupo con
// atletas o histórico se archiva (activo=false); borrarlo dejaría a sus familias
// facturando la tarifa genérica en la siguiente corrida del cron, así que el FK
// lo impide a propósito y aquí solo se ofrece "Eliminar" cuando está vacío.
//
// La pantalla ES la regla de negocio: arriba los tres principales (lo que cubre
// la membresía básica), abajo los extra (que se cobran aparte).

const chip = (bg, border, color) => ({
  clipPath: cut(4), background: bg, border: `1px solid ${border}`, color,
  fontSize: 9, fontWeight: 900, letterSpacing: '.08em', padding: '3px 7px', textTransform: 'uppercase',
});

function Ocupacion({ inscritos, cupo }) {
  const lleno = cupo != null && inscritos >= cupo;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-bold" style={{ color: lleno ? C.warn : C.text3 }}>
      <Users size={12} />
      {inscritos}{cupo != null ? ` / ${cupo}` : ''}
      {lleno && <span style={chip(TINT.warn, BORDER.warn, C.warn)}>Lleno</span>}
    </span>
  );
}

function GrupoCard({ grupo, onEdit, onArchivar, onBorrar, procesando }) {
  const archivado = !grupo.activo;
  return (
    <CutCard cut={10} padding="14px 20px" style={archivado ? { opacity: 0.72 } : undefined}>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h4 className="text-base font-black uppercase tracking-tight truncate" style={{ color: C.text }}>{grupo.nombre}</h4>
            {grupo.nivel && <span style={chip(TINT.info, BORDER.info, C.info)}>{grupo.nivel}</span>}
            {grupo.es_principal
              ? <span style={chip(TINT.gold, BORDER.goldStrong, C.gold)}>Principal</span>
              : <span style={chip(TINT.neutral, BORDER.neutralSoft, C.text3)}>Extra</span>}
            {archivado && <span style={chip(TINT.warn, BORDER.warn, C.warn)}>Archivado</span>}
          </div>
          <div className="flex items-center gap-3 flex-wrap text-xs" style={{ color: C.text3 }}>
            <span className="font-bold">{grupo.horario}</span>
            <span style={{ color: C.gold, fontWeight: 800 }}>
              {grupo.precio_mensual == null ? 'Sin precio' : `$${Number(grupo.precio_mensual).toFixed(2)}/mes`}
            </span>
            <Ocupacion inscritos={grupo.inscritos} cupo={grupo.cupo_max} />
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onEdit(grupo)} aria-label={`Editar ${grupo.nombre}`} disabled={procesando}
            className="cut-focus p-2.5 min-h-11 min-w-11 flex items-center justify-center transition-colors hover:text-brand disabled:opacity-40"
            style={{ color: C.text3, clipPath: cut(5) }}
          >
            <Pencil size={16} />
          </button>
          <button
            onClick={() => onArchivar(grupo)} disabled={procesando}
            aria-label={archivado ? `Reactivar ${grupo.nombre}` : `Archivar ${grupo.nombre}`}
            className="cut-focus p-2.5 min-h-11 min-w-11 flex items-center justify-center transition-colors hover:text-success-soft disabled:opacity-40"
            style={{ color: C.text3, clipPath: cut(5) }}
          >
            {archivado ? <ArchiveRestore size={16} /> : <Archive size={16} />}
          </button>
          {/* Eliminar solo en grupos vacíos: con atletas dentro la base lo
              rechaza (y ese rechazo protege la facturación). */}
          {grupo.inscritos === 0 && (
            <button
              onClick={() => onBorrar(grupo)} aria-label={`Eliminar ${grupo.nombre}`} disabled={procesando}
              className="cut-focus p-2.5 min-h-11 min-w-11 flex items-center justify-center transition-colors hover:text-danger disabled:opacity-40"
              style={{ color: C.text3, clipPath: cut(5) }}
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>
    </CutCard>
  );
}

// Hueco de un principal que el club aún no creó. Es el estado normal al empezar:
// la migración no los inventa porque nadie puede adivinar su horario ni su precio.
function PrincipalVacio({ nivel, onCrear }) {
  return (
    <CutCard cut={10} padding="16px 20px" style={{ borderStyle: 'dashed' }}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-black uppercase tracking-tight" style={{ color: C.text2 }}>{nivel}</p>
          <MicroLabel style={{ marginTop: 2 }}>Sin grupo principal</MicroLabel>
        </div>
        <button
          onClick={() => onCrear(nivel)} aria-label={`Crear el grupo principal ${nivel}`}
          className="cut-focus flex items-center gap-1.5 min-h-11 px-3.5 text-2xs font-black uppercase tracking-widest transition shrink-0"
          style={{ clipPath: cut(6), background: TINT.gold, border: `1px solid ${BORDER.goldStrong}`, color: C.gold }}
        >
          <Plus size={14} /><span>Crear</span>
        </button>
      </div>
    </CutCard>
  );
}

export default function AdminGrupos({ user }) {
  const navigate = useNavigate();
  const [modal, setModal] = useState(null);
  const {
    esSuperadmin, clubTrabajo, setClubTrabajo, clubes,
    grupos, loading,
    showForm, editingId, saving, procesandoId,
    error, setError, success, setSuccess,
    form, handleChange,
    abrirNuevo, handleEdit, cerrarForm, handleSubmit,
    toggleArchivado, borrar,
  } = useAdminGruposForm({ user });

  const activos = grupos.filter((g) => g.activo);
  const principales = activos.filter((g) => g.es_principal);
  const extra = activos.filter((g) => !g.es_principal);
  const archivados = grupos.filter((g) => !g.activo);

  const confirmarArchivar = useCallback((grupo) => {
    if (!grupo.activo) { toggleArchivado(grupo); return; } // reactivar no destruye nada
    setModal({
      variant: 'confirm', tone: 'warn', icon: Archive,
      eyebrow: 'Retirar grupo',
      title: `¿Archivar "${grupo.nombre}"?`,
      message: grupo.inscritos > 0
        ? `Deja de ofrecerse para sesiones, asistencia y comunicaciones. Sus ${grupo.inscritos} atleta${grupo.inscritos === 1 ? '' : 's'} siguen dentro y se les sigue facturando: muévelos antes si el grupo desaparece de verdad. Puedes reactivarlo cuando quieras.`
        : 'Deja de ofrecerse para sesiones, asistencia y comunicaciones. Su historial se conserva y puedes reactivarlo cuando quieras.',
      confirmLabel: 'Archivar',
      onConfirm: () => { setModal(null); toggleArchivado(grupo); },
    });
  }, [toggleArchivado]);

  const confirmarBorrar = useCallback((grupo) => {
    setModal({
      variant: 'confirm', tone: 'danger', icon: Trash2,
      eyebrow: 'Acción irreversible',
      title: `¿Eliminar "${grupo.nombre}"?`,
      message: 'El grupo está vacío, así que se puede borrar. Si tuvo sesiones, comunicaciones o cobros, la base lo impedirá: en ese caso archívalo.',
      confirmLabel: 'Eliminar',
      onConfirm: () => { setModal(null); borrar(grupo); },
    });
  }, [borrar]);

  return (
    <div className="max-w-5xl mx-auto">
      {/* ═══════════════════════ HEADER ═══════════════════════ */}
      <div className="flex items-center justify-between mb-8 gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate('/dashboard')} aria-label="Volver al dashboard"
            className="cut-focus p-2.5 -ml-2.5 min-h-11 min-w-11 flex items-center justify-center transition-colors"
            style={{ color: C.text3, clipPath: cut(5) }}
          >
            <ArrowLeft size={20} />
          </button>
          <HexAvatar size={44} background={GRAD.goldHex} color={C.ink}>
            <Boxes size={20} strokeWidth={2.5} />
          </HexAvatar>
          <div className="min-w-0">
            <h2 className="text-2xl md:text-3xl font-black uppercase tracking-tight" style={{ color: C.text }}>
              Grupos de <span style={{ color: C.gold }}>Entrenamiento</span>
            </h2>
            <MicroLabel style={{ marginTop: 3 }}>
              {principales.length}/3 principales · {extra.length} extra
              {archivados.length > 0 && ` · ${archivados.length} archivado${archivados.length === 1 ? '' : 's'}`}
              {clubTrabajo && ` · ${clubTrabajo}`}
            </MicroLabel>
          </div>
        </div>
        <button
          onClick={() => (showForm ? cerrarForm() : abrirNuevo())} aria-label="Nuevo grupo"
          className="cut-focus flex items-center gap-2 min-h-11 px-5 font-black text-xs uppercase tracking-widest transition shrink-0"
          style={{ clipPath: cut(8), background: GRAD.goldCTA, border: 'none', color: C.ink }}
        >
          <Plus size={16} />
          <span className="hidden sm:inline">Nuevo Grupo</span>
        </button>
      </div>

      {/* El superadmin lee todos los clubes: sin elegir uno vería los grupos de
          la plataforma entera mezclados, y crearía en el club de su ficha. */}
      {esSuperadmin && (
        <div className="mb-6 max-w-xs">
          <SelectField
            label="Club (Admin)"
            value={clubTrabajo}
            options={clubes.length ? clubes : (clubTrabajo ? [clubTrabajo] : [''])}
            optionLabels={clubes.length ? clubes : (clubTrabajo ? [clubTrabajo] : ['Cargando clubes…'])}
            onChange={setClubTrabajo}
          />
        </div>
      )}

      {/* ═══════════════════════ MENSAJES ═══════════════════════ */}
      <AnimatePresence>
        {error && (
          <motion.div
            role="alert" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="mb-6 p-4 text-sm font-bold flex items-center gap-3"
            style={{ clipPath: cut(10), background: TINT.danger, border: `1px solid ${BORDER.danger}`, color: C.danger }}
          >
            <AlertCircle size={18} className="shrink-0" /><span className="flex-1">{error}</span>
            <button onClick={() => setError('')} aria-label="Cerrar mensaje" className="cut-focus ml-auto p-2 -m-2 min-h-11 min-w-11 flex items-center justify-center" style={{ color: C.danger }}><X size={16} /></button>
          </motion.div>
        )}
        {success && (
          <motion.div
            role="status" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="mb-6 p-4 text-sm font-bold flex items-center gap-3"
            style={{ clipPath: cut(10), background: TINT.ok, border: `1px solid ${BORDER.okStrong}`, color: C.ok }}
          >
            <span className="flex-1">{success}</span>
            <button onClick={() => setSuccess('')} aria-label="Cerrar mensaje" className="cut-focus p-2 -m-2 min-h-11 min-w-11 flex items-center justify-center" style={{ color: C.ok }}><X size={16} /></button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════ FORMULARIO ═══════════════════════ */}
      <AnimatePresence>
        {showForm && (
          <AdminGruposForm
            form={form} handleChange={handleChange} handleSubmit={handleSubmit}
            saving={saving} editingId={editingId} onClose={cerrarForm}
          />
        )}
      </AnimatePresence>

      {loading ? (
        <p className="text-sm font-bold animate-pulse" style={{ color: C.text3 }}>Cargando grupos…</p>
      ) : (
        <>
          {/* ═══════════ PRINCIPALES: lo que cubre la membresía básica ═══════════ */}
          <MicroLabel style={{ marginBottom: 10 }}>Principales · la membresía básica cubre uno de estos</MicroLabel>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-8">
            {NIVELES_GRUPO.map((nivel) => {
              const g = principales.find((x) => x.nivel === nivel);
              return g
                ? <GrupoCard key={nivel} grupo={g} onEdit={handleEdit} onArchivar={confirmarArchivar} onBorrar={confirmarBorrar} procesando={procesandoId === g.id} />
                : <PrincipalVacio key={nivel} nivel={nivel} onCrear={(n) => abrirNuevo({ nivel: n, es_principal: true, nombre: n })} />;
            })}
          </div>

          {/* ═══════════ EXTRA: se cobran aparte ═══════════ */}
          <MicroLabel style={{ marginBottom: 10 }}>Grupos extra · se cobran aparte de la membresía básica</MicroLabel>
          {extra.length === 0 ? (
            <CutCard cut={10} padding="24px" style={{ marginBottom: 32 }}>
              <p className="text-sm font-bold text-center" style={{ color: C.text3 }}>
                Aún no hay grupos extra. Crea uno con <strong style={{ color: C.gold }}>Nuevo Grupo</strong> para
                ofrecer entrenamientos fuera de la cuota: otro horario, pretemporada, tecnificación…
              </p>
            </CutCard>
          ) : (
            <div className="space-y-3 mb-8">
              {extra.map((g, i) => (
                <motion.div key={g.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i, 10) * 0.03 }}>
                  <GrupoCard grupo={g} onEdit={handleEdit} onArchivar={confirmarArchivar} onBorrar={confirmarBorrar} procesando={procesandoId === g.id} />
                </motion.div>
              ))}
            </div>
          )}

          {/* ═══════════ ARCHIVADOS ═══════════ */}
          {archivados.length > 0 && (
            <>
              <MicroLabel style={{ marginBottom: 10 }}>Archivados · no se ofrecen en sesiones ni asistencia</MicroLabel>
              <div className="space-y-3">
                {archivados.map((g) => (
                  <GrupoCard key={g.id} grupo={g} onEdit={handleEdit} onArchivar={confirmarArchivar} onBorrar={confirmarBorrar} procesando={procesandoId === g.id} />
                ))}
              </div>
            </>
          )}
        </>
      )}

      <ModalHUD open={!!modal} {...(modal || {})} onClose={() => setModal(null)} />
    </div>
  );
}
