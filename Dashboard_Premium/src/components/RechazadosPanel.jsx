import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { UserX, Trash2, AlertTriangle } from 'lucide-react';
import { fetchUsuariosRechazados, purgarUsuarioRechazado } from '../api/solicitudesService';
import ModalHUD from './arcade/ModalHUD';
import { C, BORDER, TINT, cut } from './arcade/arcadeTokens';

/**
 * Bandeja de cuentas rechazadas (v45) — solo superadmin. Rechazar una
 * solicitud (SolicitudesPanel) deja usuarios.estado='rechazado' para
 * siempre; como usuarios.cedula es UNIQUE, esa cédula queda bloqueada para
 * cualquier reintento de registro (registrar_publico la rechaza con "ya se
 * encuentra registrada"). "Liberar cédula" purga la cuenta por completo
 * (usuarios/atletas/padres_atletas + su cuenta de Auth si tenía) vía la Edge
 * Function purgar-usuario-rechazado, que re-valida server-side que el caller
 * sea superadmin y que el estado siga siendo 'rechazado'. Es irreversible:
 * pide confirmación explícita en un ModalHUD.
 */
export default function RechazadosPanel() {
  const [rechazados, setRechazados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [procesandoId, setProcesandoId] = useState(null);
  const [modal, setModal] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchUsuariosRechazados();
      setRechazados(data);
    } catch (e) {
      console.error(e);
      setRechazados([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const ejecutarPurga = async (usuario) => {
    setProcesandoId(usuario.id);
    try {
      await purgarUsuarioRechazado(usuario.id);
      await load();
    } catch (e) {
      console.error(e);
      setModal({
        variant: 'alert', tone: 'danger', icon: AlertTriangle, eyebrow: 'Error',
        title: 'No se pudo liberar la cédula', message: e.message,
      });
    } finally {
      setProcesandoId(null);
    }
  };

  const confirmarPurga = (usuario) => {
    setModal({
      variant: 'confirm', tone: 'danger', icon: Trash2,
      eyebrow: 'Acción irreversible',
      title: `¿Liberar la cédula de ${usuario.nombre}?`,
      message: `Se borra por completo la cuenta rechazada (perfil, ficha y su acceso si lo tenía). La cédula "${usuario.cedula}" queda libre para un nuevo registro. No se puede deshacer.`,
      confirmLabel: 'Liberar cédula',
      onConfirm: () => { setModal(null); ejecutarPurga(usuario); },
    });
  };

  if (!loading && rechazados.length === 0) return null;

  return (
    <div style={{ background: C.card, border: `1px solid ${BORDER.danger}`, clipPath: cut(12), overflow: 'hidden' }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ background: C.cardAlt1, borderBottom: `1px solid ${BORDER.neutral}` }}>
        <div className="flex items-center space-x-2">
          <UserX size={16} style={{ color: C.danger }} />
          <h3 className="text-xs font-black uppercase tracking-widest" style={{ color: C.danger }}>
            Cuentas rechazadas ({rechazados.length})
          </h3>
        </div>
      </div>

      {loading ? (
        <p className="text-center py-8 text-sm font-bold" style={{ color: C.text3 }}>Cargando…</p>
      ) : (
        rechazados.map((u) => (
          <motion.div key={u.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="px-4 py-3.5 flex flex-col md:flex-row md:items-center gap-3" style={{ borderBottom: `1px solid ${BORDER.neutralFaint}` }}>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold" style={{ color: C.text }}>{u.nombre}</p>
              <p className="text-2xs" style={{ color: C.text2 }}>
                {u.cedula && `CI ${u.cedula} · `}
                {u.rol === 'padre' ? 'Representante' : 'Atleta'} · {u.club}
              </p>
              <p className="text-3xs" style={{ color: C.text3 }}>
                rechazado desde el {new Date(u.created_at).toLocaleDateString('es-EC')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => confirmarPurga(u)} disabled={procesandoId === u.id}
                className="cut-focus flex items-center space-x-1.5 px-3.5 py-2 min-h-11 md:min-h-10 text-2xs font-black disabled:opacity-50 transition uppercase tracking-widest"
                style={{ clipPath: cut(7), background: TINT.danger, border: `1px solid ${BORDER.danger}`, color: C.danger }}>
                <Trash2 size={12} />
                <span>Liberar cédula</span>
              </button>
            </div>
          </motion.div>
        ))
      )}

      <ModalHUD open={!!modal} {...(modal || {})} onClose={() => setModal(null)} />
    </div>
  );
}
