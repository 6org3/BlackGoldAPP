import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { FileSearch, ExternalLink, Check, X, RefreshCw, AlertTriangle } from 'lucide-react';
import {
  fetchComprobantesPendientes, resolverComprobante, getComprobanteUrl,
} from '../api/pagosService';
import ModalHUD from './arcade/ModalHUD';
import { C, BORDER, TINT, cut } from './arcade/arcadeTokens';

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
  const [modal, setModal] = useState(null);

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
    else setModal({
      variant: 'alert', tone: 'danger', icon: FileSearch, eyebrow: 'Comprobante',
      title: 'No se pudo abrir', message: 'No se pudo generar el enlace del comprobante (¿bucket configurado?).',
    });
  };

  const ejecutarResolver = async (comprobante, aprobar, motivo = null) => {
    setProcesandoId(comprobante.id);
    try {
      await resolverComprobante(comprobante.id, aprobar, motivo);
      await load();
      onResuelto?.();
    } catch (e) {
      console.error(e);
      setModal({
        variant: 'alert', tone: 'danger', icon: AlertTriangle, eyebrow: 'Error',
        title: 'No se pudo resolver el comprobante', message: e.message,
      });
    } finally {
      setProcesandoId(null);
    }
  };

  const resolver = (comprobante, aprobar) => {
    if (aprobar) { ejecutarResolver(comprobante, true); return; }
    setModal({
      variant: 'prompt', tone: 'danger', icon: X, eyebrow: 'Rechazo',
      title: 'Motivo del rechazo', message: 'Lo verá el representante — tiene que ser accionable.',
      placeholder: 'Ej. el monto no coincide con el saldo', confirmLabel: 'Rechazar comprobante',
      onConfirm: (motivo) => { setModal(null); ejecutarResolver(comprobante, false, motivo); },
    });
  };

  return (
    <div style={{ background: C.card, border: `1px solid ${BORDER.warn}`, clipPath: cut(12), overflow: 'hidden' }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ background: C.cardAlt1, borderBottom: `1px solid ${BORDER.neutral}` }}>
        <div className="flex items-center space-x-2">
          <FileSearch size={16} style={{ color: C.warn }} />
          <h3 className="text-xs font-black uppercase tracking-widest" style={{ color: C.warn }}>
            Comprobantes por verificar ({comprobantes.length})
          </h3>
        </div>
        <button onClick={load} aria-label="Recargar comprobantes"
          className="cut-focus p-2 min-w-11 min-h-11 md:min-w-10 md:min-h-10 flex items-center justify-center transition-colors"
          style={{ color: C.text3 }}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading ? (
        <p className="text-center py-8 text-sm font-bold" style={{ color: C.text3 }}>Cargando…</p>
      ) : comprobantes.length === 0 ? (
        <p className="text-center py-8 text-sm font-bold" style={{ color: C.text3 }}>
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
              className="px-4 py-3.5 flex flex-col md:flex-row md:items-center gap-3" style={{ borderBottom: `1px solid ${BORDER.neutralFaint}` }}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold" style={{ color: C.text }}>{atletaNombre}</p>
                <p className="text-2xs" style={{ color: C.text2 }}>
                  {conceptoDePago(pago)} · saldo <span style={{ color: C.text, fontWeight: 900 }}>${saldo.toFixed(2)}</span>
                  {declarado !== null && (
                    <span style={{ color: coincide ? C.ok : C.danger }}>
                      {' '}· declarado ${declarado.toFixed(2)}{coincide ? '' : ' ⚠ no coincide'}
                    </span>
                  )}
                </p>
                <p className="text-3xs" style={{ color: C.text3 }}>
                  {c.banco && `${c.banco} · `}{c.numero_documento && `doc ${c.numero_documento} · `}
                  subido {new Date(c.created_at).toLocaleDateString('es-EC')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => verImagen(c)}
                  className="cut-focus flex items-center space-x-1.5 px-3 py-2 min-h-11 md:min-h-10 text-2xs font-black transition-colors"
                  style={{ clipPath: cut(7), border: `1px solid ${BORDER.neutralSoft}`, color: C.text2 }}>
                  <ExternalLink size={12} />
                  <span>Ver</span>
                </button>
                <button onClick={() => resolver(c, true)} disabled={procesandoId === c.id}
                  className="cut-focus flex items-center space-x-1.5 px-3.5 py-2 min-h-11 md:min-h-10 text-2xs font-black disabled:opacity-50 transition uppercase tracking-widest"
                  style={{ clipPath: cut(7), background: TINT.ok, border: `1px solid ${BORDER.okStrong}`, color: C.ok }}>
                  <Check size={12} />
                  <span>Aprobar</span>
                </button>
                <button onClick={() => resolver(c, false)} disabled={procesandoId === c.id}
                  className="cut-focus flex items-center space-x-1.5 px-3.5 py-2 min-h-11 md:min-h-10 text-2xs font-black disabled:opacity-50 transition uppercase tracking-widest"
                  style={{ clipPath: cut(7), background: TINT.danger, border: `1px solid ${BORDER.danger}`, color: C.danger }}>
                  <X size={12} />
                  <span>Rechazar</span>
                </button>
              </div>
            </motion.div>
          );
        })
      )}

      <ModalHUD open={!!modal} {...(modal || {})} onClose={() => setModal(null)} />
    </div>
  );
}
