import { useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { UserCog, UserPlus, AlertCircle, X, Pencil, Power, KeyRound, AlertTriangle } from 'lucide-react';
import BotonVolver from './arcade/BotonVolver';
import useAdminEquipoForm from './useAdminEquipoForm';
import AdminEquipoForm from './AdminEquipoForm';
import ActionButton from './AdminAtletasActionButton';
import SelectField from './AdminAtletasSelectField';
import ModalHUD from './arcade/ModalHUD';
import CutCard from './arcade/CutCard';
import HexAvatar from './arcade/HexAvatar';
import MicroLabel from './arcade/MicroLabel';
import { cambiarEstadoCoach } from '../api/coachesService';
import { crearAccesoUsuario } from '../api/accesosService';
import { C, BORDER, GRAD, TINT, cut } from './arcade/arcadeTokens';

/**
 * Equipo técnico del club (v35) — el dueño da de alta a sus coaches.
 *
 * Owner y superadmin: la ruta ya lo gatea y la RLS `usuarios_insert` (v35) lo
 * repite server-side — un coach no puede crear coaches ni owners.
 *
 * Retirar a un coach lo desactiva (`usuarios.estado='inactivo'`), no lo borra:
 * sus FKs en asistencia/sesiones_control son RESTRICT y su historial debe
 * sobrevivir. Un coach inactivo no puede entrar (PrivateRoute) ni rankea en el
 * panel del dueño (fn_coach_stats, v35).
 */
export default function AdminEquipo({ user }) {
  const [modal, setModal] = useState(null);
  const [procesandoId, setProcesandoId] = useState(null);

  const {
    coaches, loading, load,
    clubTrabajo, setClubTrabajo, clubes, esSuperadmin, puedeInvitarCoDuenos,
    showForm, setShowForm,
    editingId, setEditingId,
    saving,
    error, setError,
    success, setSuccess,
    emptyForm,
    form, setForm,
    handleChange,
    handleEdit,
    handleSubmit,
  } = useAdminEquipoForm({ user });

  const activos = coaches.filter((c) => c.estado === 'activo');
  const duenos = activos.filter((c) => c.rol === 'owner');

  // Retirar a un DUEÑO es del superadmin (v36): entre co-dueños, el primero que
  // pulsara el botón se quedaría con el club. Y nadie se retira a sí mismo.
  const puedeRetirar = (miembro) => {
    if (miembro.id === user?.id) return false;
    return miembro.rol === 'owner' ? esSuperadmin : true;
  };

  const toggleEstado = useCallback((coach) => {
    const activar = coach.estado !== 'activo';
    const ejecutar = async () => {
      setModal(null);
      setProcesandoId(coach.id);
      try {
        await cambiarEstadoCoach(coach.id, activar);
        await load();
      } catch (e) {
        setModal({
          variant: 'alert', tone: 'danger', icon: AlertTriangle, eyebrow: 'Error',
          title: activar ? 'No se pudo reincorporar' : 'No se pudo retirar', message: e.message,
        });
      } finally {
        setProcesandoId(null);
      }
    };
    if (activar) { ejecutar(); return; } // reincorporar no destruye nada
    setModal({
      variant: 'confirm', tone: 'warn', icon: Power,
      eyebrow: 'Retirar del equipo',
      title: `¿Retirar a ${coach.nombre}?`,
      message: coach.rol === 'owner'
        ? 'Deja de administrar el club y pierde el acceso a la app. Su historial se conserva y puedes reincorporarlo.'
        : 'Pierde el acceso a la app y sale del ranking del club. Su historial de sesiones y asistencia se conserva, y puedes reincorporarlo cuando vuelva.',
      confirmLabel: 'Retirar',
      onConfirm: ejecutar,
    });
  }, [load]);

  // Reintento del acceso para un coach que quedó sin cuenta de Auth (la Edge
  // Function falló en el alta): sin esto no podría entrar nunca.
  const reintentarAcceso = useCallback(async (coach) => {
    setProcesandoId(coach.id);
    try {
      await crearAccesoUsuario({ usuarioId: coach.id });
      setSuccess(`✅ Acceso creado para ${coach.nombre}.`);
      await load();
    } catch (e) {
      setModal({
        variant: 'alert', tone: 'danger', icon: AlertTriangle, eyebrow: 'Error',
        title: 'No se pudo crear el acceso', message: e.message,
      });
    } finally {
      setProcesandoId(null);
    }
  }, [load, setSuccess]);

  return (
    <div className="max-w-5xl mx-auto">
      {/* ═══════════════════════ HEADER ═══════════════════════ */}
      <div className="flex items-center justify-between mb-8 gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <BotonVolver />
          <HexAvatar size={44} background={GRAD.goldHex} color={C.ink}>
            <UserCog size={20} strokeWidth={2.5} />
          </HexAvatar>
          <div className="min-w-0">
            <h2 className="text-2xl md:text-3xl font-black uppercase tracking-tight" style={{ color: C.text }}>
              Equipo <span style={{ color: C.gold }}>Técnico</span>
            </h2>
            <MicroLabel style={{ marginTop: 3 }}>
              {activos.length - duenos.length} coach{activos.length - duenos.length === 1 ? '' : 'es'}
              {duenos.length > 0 && ` · ${duenos.length} dueño${duenos.length === 1 ? '' : 's'}`}
              {coaches.length !== activos.length && ` · ${coaches.length - activos.length} retirado${coaches.length - activos.length === 1 ? '' : 's'}`}
              {clubTrabajo && ` · ${clubTrabajo}`}
            </MicroLabel>
          </div>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setEditingId(null); setForm(emptyForm); }}
          aria-label="Nuevo coach"
          className="cut-focus flex items-center gap-2 min-h-11 px-5 font-black text-xs uppercase tracking-widest transition shrink-0"
          style={{ clipPath: cut(8), background: GRAD.goldCTA, border: 'none', color: C.ink }}
        >
          <UserPlus size={16} />
          <span className="hidden sm:inline">Nuevo Coach</span>
        </button>
      </div>

      {/* Club de trabajo: el superadmin ve todos los clubes, así que sin elegir
          uno estaría mirando el equipo de la plataforma entera mezclado — y
          creando coaches en el club de su propia ficha sin saberlo. */}
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
          <motion.div role="alert" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="mb-6 p-4 text-sm font-bold flex items-center gap-3"
            style={{ clipPath: cut(10), background: TINT.danger, border: `1px solid ${BORDER.danger}`, color: C.danger }}>
            <AlertCircle size={18} className="shrink-0" /><span className="flex-1">{error}</span>
            <button onClick={() => setError('')} aria-label="Cerrar mensaje" className="cut-focus ml-auto p-2 -m-2 min-h-11 min-w-11 flex items-center justify-center" style={{ color: C.danger }}><X size={16} /></button>
          </motion.div>
        )}
        {success && (
          <motion.div role="status" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="mb-6 p-4 text-sm font-bold flex items-center gap-3"
            style={{ clipPath: cut(10), background: TINT.ok, border: `1px solid ${BORDER.okStrong}`, color: C.ok }}>
            <span className="flex-1">{success}</span>
            <button onClick={() => setSuccess('')} aria-label="Cerrar mensaje" className="cut-focus p-2 -m-2 min-h-11 min-w-11 flex items-center justify-center" style={{ color: C.ok }}><X size={16} /></button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════ FORMULARIO ═══════════════════════ */}
      <AnimatePresence>
        {showForm && (
          <AdminEquipoForm
            form={form}
            handleChange={handleChange}
            saving={saving}
            editingId={editingId}
            setEditingId={setEditingId}
            setShowForm={setShowForm}
            handleSubmit={handleSubmit}
            clubNombre={clubTrabajo}
            puedeInvitarCoDuenos={puedeInvitarCoDuenos}
          />
        )}
      </AnimatePresence>

      {/* ═══════════════════════ LISTA ═══════════════════════ */}
      {loading ? (
        <p className="text-center py-16 text-sm font-bold animate-pulse" style={{ color: C.text3 }}>Cargando equipo…</p>
      ) : coaches.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-4">🧢</div>
          <p className="text-sm font-bold" style={{ color: C.text3 }}>
            Aún no hay nadie en el equipo de {clubTrabajo || 'el club'}. Crea el primero con “Nuevo Coach”.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {coaches.map((coach, i) => {
            const retirado = coach.estado !== 'activo';
            const esDueno = coach.rol === 'owner';
            const soyYo = coach.id === user?.id;
            return (
              <motion.div key={coach.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i, 10) * 0.03 }}>
                <CutCard cut={10} padding="14px 20px" style={retirado ? { opacity: 0.72 } : undefined}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <HexAvatar size={40}>{coach.nombre?.charAt(0)}</HexAvatar>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold truncate" style={{ color: C.text }}>{coach.nombre}</p>
                        <p className="text-2xs truncate" style={{ color: C.text3 }}>
                          {coach.cedula && `CI ${coach.cedula}`}
                          {coach.correo && ` · ${coach.correo}`}
                          {coach.telefono && ` · ${coach.telefono}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {esDueno ? (
                          <span className="text-3xs font-black uppercase tracking-widest px-2 py-0.5"
                            style={{ clipPath: cut(4), border: `1px solid ${C.gold}`, background: TINT.gold, color: C.gold }}>
                            {coach.esPrincipal ? 'Dueño' : 'Co-dueño'}
                          </span>
                        ) : (
                          <span className="hidden sm:inline text-3xs font-bold uppercase tracking-widest px-2 py-0.5"
                            style={{ clipPath: cut(4), border: `1px solid ${BORDER.info}`, background: TINT.info, color: C.info }}>
                            {coach.categoria || 'Todas'}
                          </span>
                        )}
                        {soyYo && (
                          <span className="text-3xs font-bold uppercase tracking-widest px-2 py-0.5"
                            style={{ clipPath: cut(4), border: `1px solid ${BORDER.neutralSoft}`, color: C.text3 }}>
                            Tú
                          </span>
                        )}
                        {retirado && (
                          <span className="text-3xs font-black uppercase tracking-widest px-2 py-0.5"
                            style={{ clipPath: cut(4), border: `1px solid ${C.danger}`, background: TINT.danger, color: C.danger }}>
                            Retirado
                          </span>
                        )}
                        {!coach.tieneAcceso && !retirado && (
                          <span className="text-3xs font-black uppercase tracking-widest px-2 py-0.5"
                            style={{ clipPath: cut(4), border: `1px solid ${C.warn}`, background: TINT.warn, color: C.warn }}>
                            Sin acceso
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {/* Mismo criterio que el badge "Sin acceso": a un coach
                          retirado no se le ofrece un acceso que no podría usar
                          (primero se le reincorpora, que es el clic de al lado). */}
                      {!coach.tieneAcceso && !retirado && (
                        <ActionButton onClick={() => reintentarAcceso(coach)} title={`Crear acceso de ${coach.nombre}`} className="hover:text-warning-soft">
                          <KeyRound size={14} />
                        </ActionButton>
                      )}
                      <ActionButton onClick={() => handleEdit(coach)} title={`Editar a ${coach.nombre}`} className="hover:text-brand">
                        <Pencil size={14} />
                      </ActionButton>
                      {/* A un dueño solo lo retira el superadmin, y nadie se
                          retira a sí mismo (v36): el botón ni se ofrece. */}
                      {puedeRetirar(coach) && (
                        <ActionButton
                          onClick={() => toggleEstado(coach)}
                          title={retirado ? `Reincorporar a ${coach.nombre}` : `Retirar a ${coach.nombre}`}
                          className={retirado ? 'hover:text-success-soft' : 'hover:text-danger'}
                          isActive={procesandoId === coach.id}
                        >
                          <Power size={14} />
                        </ActionButton>
                      )}
                    </div>
                  </div>
                </CutCard>
              </motion.div>
            );
          })}
        </div>
      )}

      <ModalHUD open={!!modal} {...(modal || {})} onClose={() => setModal(null)} />
    </div>
  );
}
