import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { History, X, User, Cog } from 'lucide-react';
import { fetchAuditoriaPago } from '../api/pagosService';

const ACCION_LABEL = {
  creado: 'Cargo creado',
  estado_cambiado: 'Cambio de estado',
};

/**
 * Modal de solo lectura con el historial cronológico de un pago
 * (pagos_auditoria, v30 — alimentada por trigger, nunca por el cliente).
 * actor_id NULL = disparado por pg_cron (vencimiento automático,
 * generación mensual), no un dato faltante.
 */
export default function AuditoriaPago({ pagoId, atletaNombre, onClose }) {
  const [entradas, setEntradas] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelado = false;
    fetchAuditoriaPago(pagoId).then(data => { if (!cancelado) { setEntradas(data); setLoading(false); } });
    return () => { cancelado = true; };
  }, [pagoId]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}>
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
          className="glass-card rounded-panel border border-white/10 w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col"
          onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-4 py-3 bg-black/40 border-b border-white/10">
            <div className="flex items-center space-x-2">
              <History size={16} className="text-brand" />
              <div>
                <h3 className="text-xs font-black uppercase tracking-widest text-brand">Auditoría del pago</h3>
                <p className="text-3xs text-fg-muted">{atletaNombre}</p>
              </div>
            </div>
            <button onClick={onClose} aria-label="Cerrar" className="p-2 min-w-9 min-h-9 flex items-center justify-center text-fg-muted hover:text-white">
              <X size={16} />
            </button>
          </div>

          <div className="p-4 overflow-y-auto space-y-2">
            {loading ? (
              <p className="text-center py-8 text-sm text-fg-faint font-bold">Cargando…</p>
            ) : entradas.length === 0 ? (
              <p className="text-center py-8 text-sm text-fg-faint font-bold">Sin registros de auditoría.</p>
            ) : (
              entradas.map(e => (
                <div key={e.id} className="flex items-start gap-3 px-3 py-2.5 bg-black/20 border border-white/5 rounded-lg">
                  <div className="mt-0.5 w-6 h-6 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                    {e.actor_id ? <User size={12} className="text-fg-secondary" /> : <Cog size={12} className="text-fg-muted" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-2xs font-bold text-white">{ACCION_LABEL[e.accion] || e.accion}</p>
                    <p className="text-3xs text-fg-secondary">
                      {e.estado_anterior && e.estado_nuevo && e.estado_anterior !== e.estado_nuevo
                        ? <>{e.estado_anterior} → <span className="font-bold text-white">{e.estado_nuevo}</span></>
                        : <span className="font-bold text-white">{e.estado_nuevo}</span>}
                      {e.monto_pagado_nuevo != null && ` · pagado $${Number(e.monto_pagado_nuevo).toFixed(2)}`}
                    </p>
                    <p className="text-3xs text-fg-faint mt-0.5">
                      {e.usuarios?.nombre || 'Sistema (automático)'} · {new Date(e.created_at).toLocaleString('es-EC')}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
