import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  CreditCard, Upload, ChevronDown, ChevronUp, Landmark, MessageCircle,
  CheckCircle2, Clock, AlertTriangle, Hourglass, Shield, CircleDollarSign,
} from 'lucide-react';
import { fetchEstadoCuentaPadre, fetchClubConfig, subirComprobante } from '../api/pagosService';
import { renderPlantilla, linkWhatsApp } from '../lib/plantillasWhatsApp';

const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const BADGE = {
  Pendiente:       { cls: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30', icon: Clock, label: 'Pendiente' },
  Vencido:         { cls: 'text-danger-soft bg-danger/10 border-danger/30', icon: AlertTriangle, label: 'Vencido' },
  Abonado:         { cls: 'text-info-soft bg-info/10 border-info/30', icon: CircleDollarSign, label: 'Abonado' },
  'Por Verificar': { cls: 'text-caution-soft bg-caution/10 border-caution/30', icon: Hourglass, label: 'En verificación ⏳' },
  Pagado:          { cls: 'text-success-soft bg-success/10 border-success/30', icon: CheckCircle2, label: 'Pagado ✅' },
  Becado:          { cls: 'text-mental-soft bg-mental/10 border-mental/30', icon: Shield, label: 'Beca 🖤💛' },
};

function conceptoDe(pago) {
  if (pago.concepto) return pago.concepto;
  if (pago.tipo === 'Mensualidad' && pago.mes) return `Mensualidad ${MESES[pago.mes]} ${pago.anio}`;
  return pago.tipo || 'Pago';
}

/**
 * Estado de cuenta real del hijo en el Portal Padre (reemplaza la maqueta).
 * Se apoya en la RLS pagos_select_propio de v24: el padre solo ve lo suyo.
 * `hijo` viene de fetchPadreData: hijo.id = usuario, hijo.atleta_id = fila atletas.
 */
export default function EstadoCuentaPadre({ hijo, user }) {
  const [cuenta, setCuenta] = useState({ abiertos: [], historial: [] });
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [verHistorial, setVerHistorial] = useState(false);
  const [verComoPagar, setVerComoPagar] = useState(false);
  const [subiendoId, setSubiendoId] = useState(null);

  const load = useCallback(async () => {
    if (!hijo?.atleta_id) return;
    setLoading(true);
    const [c, cfg] = await Promise.all([
      fetchEstadoCuentaPadre(hijo.atleta_id),
      fetchClubConfig(user?.club),
    ]);
    setCuenta(c);
    setConfig(cfg);
    setLoading(false);
  }, [hijo?.atleta_id, user?.club]);

  useEffect(() => { load(); }, [load]);

  const handleSubirComprobante = async (pago, file) => {
    if (!file) return;
    setSubiendoId(pago.id);
    try {
      await subirComprobante({ pagoId: pago.id, atletaId: hijo.atleta_id, file }, user.id);
      await load();
      // Aviso opcional al club con un toque
      if (config?.whatsapp_club && window.confirm('Comprobante subido ✅ ¿Avisar al club por WhatsApp?')) {
        const texto = renderPlantilla('aviso_comprobante_subido', {
          nombre_atleta: hijo.nombre, concepto: conceptoDe(pago),
        });
        window.open(linkWhatsApp(config.whatsapp_club, texto), '_blank');
      }
    } catch (e) {
      console.error(e);
      alert(`No se pudo subir el comprobante: ${e.message}`);
    } finally {
      setSubiendoId(null);
    }
  };

  const totalPendiente = cuenta.abiertos.reduce(
    (acc, p) => acc + Math.max((p.monto_final || 0) - (p.monto_pagado || 0), 0), 0
  );
  const alDia = !loading && cuenta.abiertos.length === 0;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
      className={`glass-card p-4 sm:p-6 rounded-panel border ${alDia ? 'border-success/30' : 'border-white/10'}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-bold uppercase tracking-widest text-fg-secondary flex items-center">
          <CreditCard className="mr-2 w-4 h-4 text-brand" /> Estado de Pagos
        </h3>
        {!loading && !alDia && (
          <span className="text-sm font-black text-white">${totalPendiente.toFixed(2)}</span>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-fg-faint font-bold py-2">Cargando…</p>
      ) : alDia ? (
        <div className="flex items-center justify-between p-3 bg-success/10 border border-success/30 rounded-control">
          <span className="text-2xs font-bold text-success uppercase tracking-widest">Al Día 🖤💛</span>
          <span className="text-xs text-white">Sin pagos pendientes</span>
        </div>
      ) : (
        <div className="space-y-3 mb-2">
          {cuenta.abiertos.map(pago => {
            const b = BADGE[pago.estado] || BADGE.Pendiente;
            const Icon = b.icon;
            const saldo = Math.max((pago.monto_final || 0) - (pago.monto_pagado || 0), 0);
            const comprobantePendiente = pago.estado === 'Por Verificar'
              || pago.ultimo_comprobante?.estado === 'pendiente';
            const rechazado = pago.ultimo_comprobante?.estado === 'rechazado';

            return (
              <div key={pago.id} className="p-3 bg-black/30 border border-white/10 rounded-control">
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white truncate">{conceptoDe(pago)}</p>
                    <div className={`inline-flex items-center space-x-1 px-2 py-0.5 mt-1 rounded-lg border text-3xs font-black ${b.cls}`}>
                      <Icon size={10} />
                      <span>{b.label}</span>
                    </div>
                    {pago.estado === 'Abonado' && (
                      <p className="text-3xs text-info-soft font-bold mt-1">
                        Abonado ${(pago.monto_pagado || 0).toFixed(2)} de ${(pago.monto_final || 0).toFixed(2)}
                      </p>
                    )}
                    {(pago.descuento_pct || 0) > 0 && (
                      <p className="text-3xs text-fg-muted mt-0.5">Incluye descuento {pago.descuento_pct}%</p>
                    )}
                    {rechazado && !comprobantePendiente && (
                      <p className="text-3xs text-danger-soft font-bold mt-1">
                        Comprobante observado: {pago.ultimo_comprobante.motivo_rechazo || 'revisa e intenta de nuevo'}
                      </p>
                    )}
                  </div>
                  <span className="text-lg font-black text-white flex-shrink-0">${saldo.toFixed(2)}</span>
                </div>

                {!comprobantePendiente && (
                  <label className={`mt-3 w-full flex items-center justify-center gap-2 py-2.5 min-h-11 rounded-control text-2xs font-black uppercase tracking-eyebrow cursor-pointer transition ${
                    subiendoId === pago.id
                      ? 'bg-white/5 text-fg-muted'
                      : 'bg-brand/10 border border-brand/30 text-brand hover:bg-brand/20'
                  }`}>
                    <Upload size={13} />
                    <span>{subiendoId === pago.id ? 'Subiendo…' : 'Subir comprobante de transferencia'}</span>
                    <input type="file" accept="image/*,.pdf" className="hidden" disabled={subiendoId === pago.id}
                      onChange={e => { handleSubirComprobante(pago, e.target.files?.[0]); e.target.value = ''; }} />
                  </label>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Cómo pagar (instrucciones del club) */}
      {config?.cuenta_bancaria_texto && (
        <div className="mt-3">
          <button onClick={() => setVerComoPagar(v => !v)}
            className="w-full flex items-center justify-between py-2 text-2xs font-black uppercase tracking-widest text-fg-secondary hover:text-white transition-colors">
            <span className="flex items-center gap-2"><Landmark size={13} /> Cómo pagar</span>
            {verComoPagar ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {verComoPagar && (
            <div className="p-3 bg-black/30 border border-white/10 rounded-control text-xs text-fg-secondary whitespace-pre-wrap">
              {config.cuenta_bancaria_texto}
            </div>
          )}
        </div>
      )}

      {/* Avisar al club */}
      {config?.whatsapp_club && (
        <a href={linkWhatsApp(config.whatsapp_club, `Hola 👋 soy representante de ${hijo?.nombre || 'un atleta'}, les escribo por un tema de pagos.`)}
          target="_blank" rel="noopener noreferrer"
          className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 min-h-11 rounded-control bg-whatsapp/10 border border-whatsapp/30 text-whatsapp text-2xs font-black uppercase tracking-eyebrow hover:bg-whatsapp/20 transition">
          <MessageCircle size={13} />
          Avisar al club por WhatsApp
        </a>
      )}

      {/* Historial */}
      {cuenta.historial.length > 0 && (
        <div className="mt-3">
          <button onClick={() => setVerHistorial(v => !v)}
            className="w-full flex items-center justify-between py-2 text-2xs font-black uppercase tracking-widest text-fg-secondary hover:text-white transition-colors">
            <span>Historial ({cuenta.historial.length})</span>
            {verHistorial ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {verHistorial && (
            <div className="space-y-1.5">
              {cuenta.historial.map(p => (
                <div key={p.id} className="flex justify-between items-center px-3 py-2 bg-black/20 border border-white/5 rounded-control">
                  <span className="text-2xs text-fg-secondary font-bold truncate">{conceptoDe(p)}</span>
                  <span className="text-2xs text-fg-muted flex-shrink-0 ml-2">
                    {p.estado === 'Becado' ? 'Beca 🖤💛' : `$${(p.monto_final || 0).toFixed(0)} · ${p.forma_pago || ''} · ${p.fecha_pago || ''}`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
