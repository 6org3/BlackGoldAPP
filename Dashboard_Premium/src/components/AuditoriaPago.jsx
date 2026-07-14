import { useState, useEffect } from 'react';
import { History, User, Cog } from 'lucide-react';
import { fetchAuditoriaPago } from '../api/pagosService';
import ModalShell from './arcade/ModalShell';
import HexAvatar from './arcade/HexAvatar';
import { C, BORDER, TINT, cut } from './arcade/arcadeTokens';

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
    <ModalShell onClose={onClose} title="Auditoría del pago" icon={History} eyebrow={atletaNombre} maxWidth="max-w-lg">
      <div className="space-y-2">
        {loading ? (
          <p className="text-center py-8 text-sm font-bold" style={{ color: C.text3 }}>Cargando…</p>
        ) : entradas.length === 0 ? (
          <p className="text-center py-8 text-sm font-bold" style={{ color: C.text3 }}>Sin registros de auditoría.</p>
        ) : (
          entradas.map(e => (
            <div key={e.id} className="flex items-start gap-3 px-3 py-2.5" style={{ background: C.cardAlt1, border: `1px solid ${BORDER.neutralFaint}`, clipPath: cut(6) }}>
              <HexAvatar size={28} background={TINT.neutral} color={C.text3}>
                {e.actor_id ? <User size={12} style={{ color: C.text2 }} /> : <Cog size={12} style={{ color: C.text3 }} />}
              </HexAvatar>
              <div className="flex-1 min-w-0">
                <p className="text-2xs font-bold" style={{ color: C.text }}>{ACCION_LABEL[e.accion] || e.accion}</p>
                <p className="text-3xs" style={{ color: C.text2 }}>
                  {e.estado_anterior && e.estado_nuevo && e.estado_anterior !== e.estado_nuevo
                    ? <>{e.estado_anterior} → <span style={{ color: C.text, fontWeight: 700 }}>{e.estado_nuevo}</span></>
                    : <span style={{ color: C.text, fontWeight: 700 }}>{e.estado_nuevo}</span>}
                  {e.monto_pagado_nuevo != null && ` · pagado $${Number(e.monto_pagado_nuevo).toFixed(2)}`}
                </p>
                <p className="text-3xs mt-0.5" style={{ color: C.text3 }}>
                  {e.usuarios?.nombre || 'Sistema (automático)'} · {new Date(e.created_at).toLocaleString('es-EC')}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </ModalShell>
  );
}
