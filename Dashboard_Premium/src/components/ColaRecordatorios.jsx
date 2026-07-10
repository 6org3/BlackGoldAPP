import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Send, RefreshCw, Check, BellOff, MessageSquare } from 'lucide-react';
import { fetchPagosMes, fetchContactosPago } from '../api/pagosService';
import { registrarEnvioWhatsApp } from '../api/comunicacionesService';
import { renderPlantilla, normalizarTelefonoEC, linkWhatsApp } from '../lib/plantillasWhatsApp';

const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const ABIERTOS = ['Pendiente', 'Vencido', 'Abonado'];

/**
 * Cola de envío de recordatorios 1-a-N (W2). Lista los pagos abiertos del mes
 * con el teléfono del representante y un botón wa.me por fila, para recorrer
 * "todos los vencidos" con un toque cada uno (compatible con los ToS de
 * WhatsApp; la automatización real vía apps no oficiales = baneo). Cada envío
 * queda registrado en `comunicaciones`. Respeta recordatorios_pausados.
 */
export default function ColaRecordatorios({ user, mes, anio }) {
  const [pagos, setPagos] = useState([]);
  const [contactos, setContactos] = useState({});
  const [loading, setLoading] = useState(true);
  const [soloVencidos, setSoloVencidos] = useState(false);
  const [enviados, setEnviados] = useState(() => new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchPagosMes(mes, anio, 'Todos');
    const abiertos = data.filter(p => ABIERTOS.includes(p.estado));
    setPagos(abiertos);
    setLoading(false);
    const ids = [...new Set(abiertos.map(p => p.atleta_id))];
    fetchContactosPago(ids).then(setContactos);
  }, [mes, anio]);

  useEffect(() => { load(); }, [load]);

  const filtrados = useMemo(
    () => (soloVencidos ? pagos.filter(p => p.estado === 'Vencido') : pagos),
    [pagos, soloVencidos]
  );

  const saldoDe = (p) => Math.max((p.monto_final || 0) - (p.monto_pagado || 0), 0);

  const mensajeDe = (pago) => {
    const nombre = pago.atletas?.usuarios?.nombre || 'el atleta';
    const concepto = pago.concepto || (pago.tipo === 'Mensualidad' ? `Mensualidad ${MESES[pago.mes] || ''}` : pago.tipo);
    const saldo = saldoDe(pago).toFixed(2);
    if (pago.estado === 'Vencido') {
      const dias = Math.max(Math.ceil((new Date() - new Date(pago.fecha_vencimiento)) / 86400000), 1);
      return { clave: 'pago_vencido', mensaje: renderPlantilla('pago_vencido', { nombre_atleta: nombre, concepto, monto: saldo, dias_vencido: dias }) };
    }
    const fechaLimite = pago.fecha_vencimiento
      ? new Date(`${pago.fecha_vencimiento}T12:00:00`).toLocaleDateString('es-EC')
      : `05/${String(pago.mes).padStart(2, '0')}`;
    return { clave: 'recordatorio_pago', mensaje: renderPlantilla('recordatorio_pago', { nombre_atleta: nombre, concepto, monto: saldo, fecha_limite: fechaLimite }) };
  };

  const enviar = (pago) => {
    const contacto = contactos[pago.atleta_id];
    const { clave, mensaje } = mensajeDe(pago);
    const telefono = normalizarTelefonoEC(contacto?.telefono);
    window.open(linkWhatsApp(telefono, mensaje), '_blank');
    registrarEnvioWhatsApp({
      autorId: user.id, usuarioDestinoId: contacto?.usuarioId || null,
      plantilla: clave, titulo: `${clave} · ${pago.atletas?.usuarios?.nombre || ''}`, mensaje,
    });
    setEnviados(prev => new Set(prev).add(pago.id));
  };

  const pendientesDeEnviar = filtrados.filter(p => !enviados.has(p.id) && !p.atletas?.recordatorios_pausados);

  return (
    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
      className="glass-card rounded-panel border border-warning/20 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-black/40 border-b border-white/10">
        <div className="flex items-center space-x-2">
          <Send size={16} className="text-warning-soft" />
          <h3 className="text-xs font-black uppercase tracking-widest text-warning-soft">
            Cola de recordatorios ({filtrados.length})
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setSoloVencidos(v => !v)}
            className={`px-3 py-2 min-h-10 rounded-lg text-2xs font-black uppercase tracking-widest border transition ${
              soloVencidos ? 'bg-danger/10 border-danger/30 text-danger-soft' : 'border-white/10 text-fg-muted hover:text-white'
            }`}>
            Solo vencidos
          </button>
          <button onClick={load} aria-label="Recargar" className="p-2 min-w-10 min-h-10 flex items-center justify-center text-fg-muted hover:text-white transition-colors">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="px-4 py-2 flex items-center justify-between text-2xs text-fg-muted border-b border-white/5">
        <span>Enviados esta sesión: <span className="font-black text-white">{enviados.size}</span></span>
        <span>{pendientesDeEnviar.length} por enviar</span>
      </div>

      {loading ? (
        <p className="text-center py-8 text-sm text-fg-faint font-bold">Cargando…</p>
      ) : filtrados.length === 0 ? (
        <p className="text-center py-8 text-sm text-fg-faint font-bold">Nada por recordar este mes 🎉</p>
      ) : (
        filtrados.map(pago => {
          const contacto = contactos[pago.atleta_id];
          const nombre = pago.atletas?.usuarios?.nombre || '—';
          const tel = normalizarTelefonoEC(contacto?.telefono);
          const pausado = pago.atletas?.recordatorios_pausados;
          const yaEnviado = enviados.has(pago.id);
          return (
            <div key={pago.id} className={`flex items-center gap-2 px-4 py-2.5 border-b border-white/5 ${pausado ? 'opacity-50' : ''}`}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate">
                  {nombre}
                  {pago.estado === 'Vencido' && <span className="ml-2 text-3xs text-danger-soft font-black uppercase">vencido</span>}
                  {pausado && <span className="ml-2 text-3xs text-fg-muted font-black uppercase inline-flex items-center gap-0.5"><BellOff size={9} /> pausado</span>}
                </p>
                <p className="text-2xs text-fg-secondary">
                  {contacto?.esPlaceholder
                    ? <span className="text-caution-soft font-bold">Sin representante confirmado</span>
                    : (contacto?.nombre || 'sin representante')} · saldo <span className="font-black text-white">${saldoDe(pago).toFixed(2)}</span>
                  {!tel && contacto && !contacto.esPlaceholder && <span className="text-danger-soft"> · sin teléfono</span>}
                </p>
              </div>
              {yaEnviado ? (
                <span className="flex items-center gap-1 px-3 py-2 min-h-10 text-2xs font-black text-success-soft"><Check size={13} /> Enviado</span>
              ) : (
                <button onClick={() => enviar(pago)} disabled={pausado}
                  className="flex items-center gap-1.5 px-3.5 py-2 min-h-10 bg-whatsapp/10 border border-whatsapp/30 text-whatsapp text-2xs font-black rounded-lg hover:bg-whatsapp/20 disabled:opacity-40 transition uppercase tracking-widest">
                  <MessageSquare size={13} /> Enviar
                </button>
              )}
            </div>
          );
        })
      )}
    </motion.div>
  );
}
