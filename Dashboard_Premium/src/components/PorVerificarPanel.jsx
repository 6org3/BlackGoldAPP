import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { FileSearch, ExternalLink, Check, X, RefreshCw } from 'lucide-react';
import {
  fetchComprobantesPendientes, resolverComprobante, getComprobanteUrl,
} from '../api/pagosService';

const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function conceptoDePago(pago) {
  if (pago?.concepto) return pago.concepto;
  if (pago?.tipo === 'Mensualidad' && pago?.mes) return `Mensualidad ${MESES[pago.mes]} ${pago.anio}`;
  return pago?.tipo || 'Pago';
}

/**
 * Cola de comprobantes de transferencia pendientes de verificación.
 * `onResuelto` avisa al padre (AdminPagos) para recargar la tabla de pagos.
 */
export default function PorVerificarPanel({ onResuelto, onCountChange }) {
  const [comprobantes, setComprobantes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [procesandoId, setProcesandoId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchComprobantesPendientes();
    setComprobantes(data);
    onCountChange?.(data.length);
    setLoading(false);
  }, [onCountChange]);

  useEffect(() => { load(); }, [load]);

  const verImagen = async (comprobante) => {
    const url = await getComprobanteUrl(comprobante.storage_path);
    if (url) window.open(url, '_blank', 'noopener');
    else alert('No se pudo generar el enlace del comprobante (¿bucket configurado?).');
  };

  const resolver = async (comprobante, aprobar) => {
    let motivo = null;
    if (!aprobar) {
      motivo = window.prompt('Motivo del rechazo (lo verá el representante):', '');
      if (motivo === null) return; // canceló
      if (!motivo.trim()) { alert('El rechazo necesita un motivo accionable.'); return; }
    }
    setProcesandoId(comprobante.id);
    try {
      await resolverComprobante(comprobante.id, aprobar, motivo);
      await load();
      onResuelto?.();
    } catch (e) {
      console.error(e);
      alert(`No se pudo resolver el comprobante: ${e.message}`);
    } finally {
      setProcesandoId(null);
    }
  };

  return (
    <div className="glass-card rounded-panel border border-caution/20 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-black/40 border-b border-white/10">
        <div className="flex items-center space-x-2">
          <FileSearch size={16} className="text-caution-soft" />
          <h3 className="text-xs font-black uppercase tracking-widest text-caution-soft">
            Comprobantes por verificar ({comprobantes.length})
          </h3>
        </div>
        <button onClick={load} aria-label="Recargar comprobantes"
          className="p-2 min-w-10 min-h-10 flex items-center justify-center text-fg-muted hover:text-white transition-colors">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading ? (
        <p className="text-center py-8 text-sm text-fg-faint font-bold">Cargando…</p>
      ) : comprobantes.length === 0 ? (
        <p className="text-center py-8 text-sm text-fg-faint font-bold">
          Sin comprobantes pendientes. Los que suban las familias aparecerán aquí.
        </p>
      ) : (
        comprobantes.map((c) => {
          const pago = c.pagos;
          const atletaNombre = pago?.atletas?.usuarios?.nombre || '—';
          const saldo = (pago?.monto_final || 0) - (pago?.monto_pagado || 0);
          const declarado = c.monto_declarado != null ? Number(c.monto_declarado) : null;
          const coincide = declarado === null || Math.abs(declarado - saldo) < 0.01;

          return (
            <motion.div key={c.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="px-4 py-3.5 border-b border-white/5 flex flex-col md:flex-row md:items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white">{atletaNombre}</p>
                <p className="text-2xs text-fg-secondary">
                  {conceptoDePago(pago)} · saldo <span className="font-black text-white">${saldo.toFixed(2)}</span>
                  {declarado !== null && (
                    <span className={coincide ? 'text-success-soft' : 'text-danger-soft'}>
                      {' '}· declarado ${declarado.toFixed(2)}{coincide ? '' : ' ⚠ no coincide'}
                    </span>
                  )}
                </p>
                <p className="text-3xs text-fg-faint">
                  {c.banco && `${c.banco} · `}{c.numero_documento && `doc ${c.numero_documento} · `}
                  subido {new Date(c.created_at).toLocaleDateString('es-EC')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => verImagen(c)}
                  className="flex items-center space-x-1.5 px-3 py-2 min-h-10 border border-white/10 rounded-lg text-2xs font-black text-fg-secondary hover:text-white transition-colors">
                  <ExternalLink size={12} />
                  <span>Ver</span>
                </button>
                <button onClick={() => resolver(c, true)} disabled={procesandoId === c.id}
                  className="flex items-center space-x-1.5 px-3.5 py-2 min-h-10 bg-success/10 border border-success/30 text-success-soft text-2xs font-black rounded-lg hover:bg-success/20 disabled:opacity-50 transition uppercase tracking-widest">
                  <Check size={12} />
                  <span>Aprobar</span>
                </button>
                <button onClick={() => resolver(c, false)} disabled={procesandoId === c.id}
                  className="flex items-center space-x-1.5 px-3.5 py-2 min-h-10 bg-danger/10 border border-danger/30 text-danger-soft text-2xs font-black rounded-lg hover:bg-danger/20 disabled:opacity-50 transition uppercase tracking-widest">
                  <X size={12} />
                  <span>Rechazar</span>
                </button>
              </div>
            </motion.div>
          );
        })
      )}
    </div>
  );
}
