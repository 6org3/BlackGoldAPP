import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Send, RefreshCw, Check, BellOff, MessageSquare } from 'lucide-react';
import { fetchPagosMes, fetchContactosPago } from '../api/pagosService';
import { registrarEnvioWhatsApp } from '../api/comunicacionesService';
import { renderPlantilla, normalizarTelefonoEC, linkWhatsApp } from '../lib/plantillasWhatsApp';
import { C, BORDER, TINT, cut } from './arcade/arcadeTokens';

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
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      style={{ background: C.card, border: `1px solid ${BORDER.warn}`, clipPath: cut(12), overflow: 'hidden' }}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3" style={{ background: C.cardAlt1, borderBottom: `1px solid ${BORDER.neutral}` }}>
        <div className="flex items-center space-x-2">
          <Send size={16} style={{ color: C.warn }} />
          <h3 className="text-xs font-black uppercase tracking-widest" style={{ color: C.warn }}>
            Cola de recordatorios ({filtrados.length})
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setSoloVencidos(v => !v)} aria-pressed={soloVencidos}
            className="cut-focus px-3 py-2 min-h-11 md:min-h-9 text-2xs font-black uppercase tracking-widest transition"
            style={soloVencidos
              ? { clipPath: cut(7), background: TINT.danger, border: `1px solid ${BORDER.danger}`, color: C.danger }
              : { clipPath: cut(7), background: 'transparent', border: `1px solid ${BORDER.neutralSoft}`, color: C.text3 }}>
            Solo vencidos
          </button>
          <button onClick={load} aria-label="Recargar"
            className="cut-focus p-2 min-w-11 min-h-11 md:min-w-9 md:min-h-9 flex items-center justify-center transition-colors"
            style={{ color: C.text3 }}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="px-4 py-2 flex items-center justify-between text-2xs" style={{ color: C.text3, borderBottom: `1px solid ${BORDER.neutralFaint}` }}>
        <span>Enviados esta sesión: <span style={{ color: C.text, fontWeight: 900 }}>{enviados.size}</span></span>
        <span>{pendientesDeEnviar.length} por enviar</span>
      </div>

      {loading ? (
        <p className="text-center py-8 text-sm font-bold" style={{ color: C.text3 }}>Cargando…</p>
      ) : filtrados.length === 0 ? (
        <p className="text-center py-8 text-sm font-bold" style={{ color: C.text3 }}>Nada por recordar este mes 🎉</p>
      ) : (
        filtrados.map(pago => {
          const contacto = contactos[pago.atleta_id];
          const nombre = pago.atletas?.usuarios?.nombre || '—';
          const tel = normalizarTelefonoEC(contacto?.telefono);
          const pausado = pago.atletas?.recordatorios_pausados;
          const yaEnviado = enviados.has(pago.id);
          return (
            <div key={pago.id} className={`flex items-center gap-2 px-4 py-2.5 ${pausado ? 'opacity-50' : ''}`}
              style={{ borderBottom: `1px solid ${BORDER.neutralFaint}` }}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate" style={{ color: C.text }}>
                  {nombre}
                  {pago.estado === 'Vencido' && <span className="ml-2 text-3xs font-black uppercase" style={{ color: C.danger }}>vencido</span>}
                  {pausado && <span className="ml-2 text-3xs font-black uppercase inline-flex items-center gap-0.5" style={{ color: C.text3 }}><BellOff size={9} /> pausado</span>}
                </p>
                <p className="text-2xs" style={{ color: C.text2 }}>
                  {contacto?.esPlaceholder
                    ? <span className="font-bold" style={{ color: C.warn }}>Sin representante confirmado</span>
                    : (contacto?.nombre || 'sin representante')} · saldo <span style={{ color: C.text, fontWeight: 900 }}>${saldoDe(pago).toFixed(2)}</span>
                  {!tel && contacto && !contacto.esPlaceholder && <span style={{ color: C.danger }}> · sin teléfono</span>}
                </p>
              </div>
              {yaEnviado ? (
                <span className="flex items-center gap-1 px-3 py-2 min-h-11 md:min-h-10 text-2xs font-black" style={{ color: C.ok }}><Check size={13} /> Enviado</span>
              ) : (
                <button onClick={() => enviar(pago)} disabled={pausado}
                  className="cut-focus flex items-center gap-1.5 px-3.5 py-2 min-h-11 md:min-h-10 text-2xs font-black disabled:opacity-40 transition uppercase tracking-widest"
                  style={{ clipPath: cut(7), background: TINT.whatsapp, border: `1px solid ${BORDER.whatsapp}`, color: C.whatsapp }}>
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
