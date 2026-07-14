import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { UserPlus, Check, X, RefreshCw, AlertTriangle } from 'lucide-react';
import { fetchSolicitudesPendientes, resolverSolicitud } from '../api/solicitudesService';
import { calcularCategoriaFEB } from '../api/utilsAtletas';
import ModalHUD from './arcade/ModalHUD';
import { C, BORDER, TINT, cut } from './arcade/arcadeTokens';

/**
 * Bandeja de solicitudes de registro (v33) — atletas del registro público que
 * esperan aprobación del club. Solo la montan owner/superadmin (AdminAtletas);
 * la RPC resolver_solicitud_registro re-valida el rol y el club server-side.
 * `onResuelto` avisa al padre para recargar el plantel tras aprobar.
 */
export default function SolicitudesPanel({ onResuelto, onCountChange }) {
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [procesandoId, setProcesandoId] = useState(null);
  const [modal, setModal] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchSolicitudesPendientes();
      setSolicitudes(data);
      onCountChange?.(data.length);
    } catch (e) {
      console.error(e);
      setSolicitudes([]);
    }
    setLoading(false);
  }, [onCountChange]);

  useEffect(() => { load(); }, [load]);

  const ejecutarResolver = async (solicitud, accion) => {
    setProcesandoId(solicitud.id);
    try {
      await resolverSolicitud(solicitud.id, accion);
      await load();
      onResuelto?.();
    } catch (e) {
      console.error(e);
      setModal({
        variant: 'alert', tone: 'danger', icon: AlertTriangle, eyebrow: 'Error',
        title: 'No se pudo resolver la solicitud', message: e.message,
      });
    } finally {
      setProcesandoId(null);
    }
  };

  const resolver = (solicitud, accion) => {
    if (accion === 'aprobar') { ejecutarResolver(solicitud, 'aprobar'); return; }
    setModal({
      variant: 'confirm', tone: 'danger', icon: X, eyebrow: 'Rechazo',
      title: `¿Rechazar a ${solicitud.nombre}?`,
      message: 'El atleta y su representante verán "solicitud no aprobada" al iniciar sesión.',
      confirmLabel: 'Rechazar solicitud',
      onConfirm: () => { setModal(null); ejecutarResolver(solicitud, 'rechazar'); },
    });
  };

  return (
    <div style={{ background: C.card, border: `1px solid ${BORDER.info}`, clipPath: cut(12), overflow: 'hidden' }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ background: C.cardAlt1, borderBottom: `1px solid ${BORDER.neutral}` }}>
        <div className="flex items-center space-x-2">
          <UserPlus size={16} style={{ color: C.info }} />
          <h3 className="text-xs font-black uppercase tracking-widest" style={{ color: C.info }}>
            Solicitudes de registro ({solicitudes.length})
          </h3>
        </div>
        <button onClick={load} aria-label="Recargar solicitudes"
          className="cut-focus p-2 min-w-11 min-h-11 md:min-w-10 md:min-h-10 flex items-center justify-center transition-colors"
          style={{ color: C.text3 }}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading ? (
        <p className="text-center py-8 text-sm font-bold" style={{ color: C.text3 }}>Cargando…</p>
      ) : solicitudes.length === 0 ? (
        <p className="text-center py-8 text-sm font-bold" style={{ color: C.text3 }}>
          Sin solicitudes pendientes. Las inscripciones del formulario público aparecerán aquí.
        </p>
      ) : (
        solicitudes.map((s) => (
          <motion.div key={s.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="px-4 py-3.5 flex flex-col md:flex-row md:items-center gap-3" style={{ borderBottom: `1px solid ${BORDER.neutralFaint}` }}>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold" style={{ color: C.text }}>{s.nombre}</p>
              <p className="text-2xs" style={{ color: C.text2 }}>
                {s.cedula && `CI ${s.cedula} · `}
                {s.fecha_nacimiento && `${calcularCategoriaFEB(s.fecha_nacimiento)} · `}
                {s.genero && `${s.genero} · `}
                {s.club}
              </p>
              <p className="text-3xs" style={{ color: C.text3 }}>
                {s.padre?.nombre && `Rep. ${s.padre.nombre}${s.padre.telefono ? ` · ${s.padre.telefono}` : ''} · `}
                solicitado el {new Date(s.created_at).toLocaleDateString('es-EC')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => resolver(s, 'aprobar')} disabled={procesandoId === s.id}
                className="cut-focus flex items-center space-x-1.5 px-3.5 py-2 min-h-11 md:min-h-10 text-2xs font-black disabled:opacity-50 transition uppercase tracking-widest"
                style={{ clipPath: cut(7), background: TINT.ok, border: `1px solid ${BORDER.okStrong}`, color: C.ok }}>
                <Check size={12} />
                <span>Aprobar</span>
              </button>
              <button onClick={() => resolver(s, 'rechazar')} disabled={procesandoId === s.id}
                className="cut-focus flex items-center space-x-1.5 px-3.5 py-2 min-h-11 md:min-h-10 text-2xs font-black disabled:opacity-50 transition uppercase tracking-widest"
                style={{ clipPath: cut(7), background: TINT.danger, border: `1px solid ${BORDER.danger}`, color: C.danger }}>
                <X size={12} />
                <span>Rechazar</span>
              </button>
            </div>
          </motion.div>
        ))
      )}

      <ModalHUD open={!!modal} {...(modal || {})} onClose={() => setModal(null)} />
    </div>
  );
}
