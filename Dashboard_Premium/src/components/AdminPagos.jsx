import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  DollarSign, CheckCircle2, AlertTriangle, Clock,
  MessageSquare, Plus, RefreshCw, Shield, ChevronDown,
  FileSearch, Hourglass, CircleDollarSign, Ban, Paperclip,
  Settings, PackagePlus,
} from 'lucide-react';
import {
  fetchPagosMes, registrarTransaccion, registrarTransferenciaAsistida,
  actualizarEstadoVencidos, generarPagosMensuales, fetchGruposClub, fetchContactosPago,
} from '../api/pagosService';
import { registrarEnvioWhatsApp } from '../api/comunicacionesService';
import { renderPlantilla, normalizarTelefonoEC, linkWhatsApp } from '../lib/plantillasWhatsApp';
import PorVerificarPanel from './PorVerificarPanel';
import ConfiguracionPagos from './ConfiguracionPagos';
import CargosExtra from './CargosExtra';

const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const ESTADO_CFG = {
  Pagado:          { color: 'text-success-soft bg-success/10 border-success/30', icon: CheckCircle2 },
  Pendiente:       { color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30', icon: Clock },
  Vencido:         { color: 'text-danger-soft bg-danger/10 border-danger/30', icon: AlertTriangle },
  Becado:          { color: 'text-mental-soft bg-mental/10 border-mental/30', icon: Shield },
  Abonado:         { color: 'text-info-soft bg-info/10 border-info/30', icon: CircleDollarSign },
  'Por Verificar': { color: 'text-caution-soft bg-caution/10 border-caution/30', icon: Hourglass },
  Anulado:         { color: 'text-fg-muted bg-white/5 border-white/10', icon: Ban },
};

// Estados sobre los que el staff puede registrar dinero
const ESTADOS_COBRABLES = ['Pendiente', 'Vencido', 'Abonado'];

export default function AdminPagos({ user, atletas = [] }) {
  const hoy = new Date();
  const esCoach = user?.rol === 'coach';
  const [mes, setMes] = useState(hoy.getMonth() + 1);
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [grupos, setGrupos] = useState([]);            // grupos reales del club
  const [grupoId, setGrupoId] = useState('Todos');
  const [pagos, setPagos] = useState([]);
  const [contactos, setContactos] = useState({});      // atleta_id → representante de pagos
  const [loading, setLoading] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [vencidosListos, setVencidosListos] = useState(false);
  const [mostrarVerificacion, setMostrarVerificacion] = useState(false);
  const [pendientesVerificar, setPendientesVerificar] = useState(0);
  const [mostrarServicios, setMostrarServicios] = useState(false);
  const [mostrarConfig, setMostrarConfig] = useState(false);

  // Formulario inline de registro de transacción (abonos incluidos)
  const [registrandoId, setRegistrandoId] = useState(null);
  const [formaPago, setFormaPago] = useState('Efectivo');
  const [montoTx, setMontoTx] = useState('');
  const [referenciaTx, setReferenciaTx] = useState('');
  const [archivoTx, setArchivoTx] = useState(null);
  const [guardandoTx, setGuardandoTx] = useState(false);

  // Marcar vencidos una sola vez al entrar (respaldo del job pg_cron);
  // cambiar mes/año/grupo solo debe leer.
  useEffect(() => {
    actualizarEstadoVencidos().finally(() => setVencidosListos(true));
    fetchGruposClub().then(setGrupos);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchPagosMes(mes, anio, grupoId);
    setPagos(data);
    setLoading(false);
    const atletaIds = [...new Set(data.map(p => p.atleta_id))];
    fetchContactosPago(atletaIds).then(setContactos);
  }, [mes, anio, grupoId]);

  useEffect(() => {
    if (!vencidosListos) return;
    load();
  }, [vencidosListos, load]);

  // Métricas (una sola pasada, memoizada)
  const { pagados, pendientes, vencidos, becados, recaudado, porCobrar } = useMemo(() => {
    const m = { pagados: 0, pendientes: 0, vencidos: 0, becados: 0, recaudado: 0, porCobrar: 0 };
    pagos.forEach(p => {
      const monto = p.monto_final || 0;
      const pagado = p.monto_pagado || 0;
      if (p.estado === 'Pagado') { m.pagados += 1; m.recaudado += monto; }
      else if (p.estado === 'Pendiente' || p.estado === 'Por Verificar') { m.pendientes += 1; m.porCobrar += monto - pagado; }
      else if (p.estado === 'Abonado') { m.pendientes += 1; m.recaudado += pagado; m.porCobrar += monto - pagado; }
      else if (p.estado === 'Vencido') { m.vencidos += 1; m.recaudado += pagado; m.porCobrar += monto - pagado; }
      else if (p.estado === 'Becado') { m.becados += 1; }
    });
    return m;
  }, [pagos]);

  const saldoDe = (pago) => Math.max((pago.monto_final || 0) - (pago.monto_pagado || 0), 0);

  const abrirRegistro = (pago) => {
    setRegistrandoId(pago.id);
    setFormaPago('Efectivo');
    setMontoTx(saldoDe(pago).toFixed(2));
    setReferenciaTx('');
    setArchivoTx(null);
  };

  const handleRegistrarTransaccion = async (pago) => {
    const monto = Number(montoTx);
    if (!monto || monto <= 0) { alert('Monto inválido.'); return; }
    setGuardandoTx(true);
    try {
      if (formaPago === 'Transferencia' && archivoTx) {
        // Camino asistido: el padre mandó la foto por WhatsApp; el staff la
        // registra en su nombre (comprobante + aprobación en un gesto).
        await registrarTransferenciaAsistida(
          { pagoId: pago.id, atletaId: pago.atleta_id, file: archivoTx, numeroDocumento: referenciaTx, montoDeclarado: monto },
          user.id
        );
      } else {
        await registrarTransaccion(pago.id, { monto, forma_pago: formaPago, referencia: referenciaTx }, user.id);
      }
      setRegistrandoId(null);
      load();
    } catch (e) {
      console.error(e);
      alert(`No se pudo registrar el pago: ${e.message}`);
    } finally {
      setGuardandoTx(false);
    }
  };

  const conceptoDe = (pago) => pago.concepto
    || (pago.tipo === 'Mensualidad' ? `Mensualidad ${MESES[pago.mes] || ''}` : pago.tipo);

  // WhatsApp dirigido al representante de pagos, con plantilla según estado.
  // Sin teléfono normalizable cae al selector de contactos (comportamiento previo).
  const enviarWhatsApp = (pago) => {
    const contacto = contactos[pago.atleta_id];
    if (pago.atletas?.recordatorios_pausados && pago.estado !== 'Pagado') {
      if (!window.confirm('Esta familia tiene los recordatorios pausados (acuerdo con el club). ¿Enviar de todas formas?')) return;
    }
    const nombre = pago.atletas?.usuarios?.nombre || 'el atleta';
    const saldo = saldoDe(pago).toFixed(2);
    let clave, vars;
    if (pago.estado === 'Pagado') {
      clave = 'confirmacion_pago';
      vars = { nombre_atleta: nombre, concepto: conceptoDe(pago), monto: (pago.monto_final || 0).toFixed(2), fecha_pago: pago.fecha_pago || '', forma_pago: pago.forma_pago || '' };
    } else if (pago.estado === 'Abonado') {
      clave = 'abono_registrado';
      vars = { nombre_atleta: nombre, concepto: conceptoDe(pago), monto_abonado: (pago.monto_pagado || 0).toFixed(2), saldo };
    } else if (pago.estado === 'Vencido') {
      const dias = Math.max(Math.ceil((new Date() - new Date(pago.fecha_vencimiento)) / 86400000), 1);
      clave = 'pago_vencido';
      vars = { nombre_atleta: nombre, concepto: conceptoDe(pago), monto: saldo, dias_vencido: dias };
    } else {
      clave = 'recordatorio_pago';
      const fechaLimite = pago.fecha_vencimiento
        ? new Date(`${pago.fecha_vencimiento}T12:00:00`).toLocaleDateString('es-EC')
        : `05/${String(pago.mes).padStart(2, '0')}`;
      vars = { nombre_atleta: nombre, concepto: conceptoDe(pago), monto: saldo, fecha_limite: fechaLimite };
    }
    const mensaje = renderPlantilla(clave, vars);
    const telefono = normalizarTelefonoEC(contacto?.telefono);
    window.open(linkWhatsApp(telefono, mensaje), '_blank');
    registrarEnvioWhatsApp({
      autorId: user.id,
      usuarioDestinoId: contacto?.usuarioId || null,
      plantilla: clave,
      titulo: `${clave} · ${nombre}`,
      mensaje,
    });
  };

  const handleGenerarMes = async () => {
    setGenerando(true);
    try {
      await generarPagosMensuales(mes, anio, atletas, user.id);
      load();
    } catch (e) { console.error(e); }
    setGenerando(false);
  };

  const diasParaVencer = (fecha) => {
    if (!fecha) return null;
    const diff = Math.ceil((new Date(fecha) - new Date()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  return (
    <div className="min-h-screen bg-surface-base text-white p-6 md:p-10">
      <div className="fixed top-[-20%] right-[10%] w-[600px] h-[500px] bg-brand/4 blur-[150px] pointer-events-none rounded-full" />

      {/* Header */}
      <header className="mb-6 md:mb-8 border-b border-white/5 pb-6 md:pb-8 relative z-10">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center space-x-3">
            <DollarSign className="text-brand" size={28} />
            <div>
              <h2 className="text-3xl md:text-5xl font-black uppercase tracking-tighter">
                Control de{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand to-brand-strong">Pagos</span>
              </h2>
              <p className="text-2xs text-fg-muted font-bold uppercase tracking-[0.3em] mt-1">
                Mensualidades · Sesiones Individuales
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setMostrarVerificacion(v => !v)}
              className={`flex items-center justify-center space-x-2 px-4 py-2.5 min-h-11 border text-xs font-black rounded-control uppercase tracking-widest transition ${
                mostrarVerificacion || pendientesVerificar > 0
                  ? 'bg-caution/10 border-caution/30 text-caution-soft hover:bg-caution/20'
                  : 'border-white/10 text-fg-muted hover:text-white'
              }`}>
              <FileSearch size={14} />
              <span>Por verificar{pendientesVerificar > 0 ? ` (${pendientesVerificar})` : ''}</span>
            </button>
            {/* El coach opera en modo cobro: registrar y recordar. Servicios,
                configuración y "Generar Mes" son owner/superadmin. */}
            {!esCoach && (
              <>
                <button onClick={() => { setMostrarServicios(v => !v); setMostrarConfig(false); }}
                  className={`flex items-center justify-center space-x-2 px-4 py-2.5 min-h-11 border text-xs font-black rounded-control uppercase tracking-widest transition ${
                    mostrarServicios ? 'bg-info/10 border-info/30 text-info-soft' : 'border-white/10 text-fg-muted hover:text-white'
                  }`}>
                  <PackagePlus size={14} />
                  <span>Servicios</span>
                </button>
                <button onClick={() => { setMostrarConfig(v => !v); setMostrarServicios(false); }}
                  className={`flex items-center justify-center space-x-2 px-4 py-2.5 min-h-11 border text-xs font-black rounded-control uppercase tracking-widest transition ${
                    mostrarConfig ? 'bg-brand/10 border-brand/30 text-brand' : 'border-white/10 text-fg-muted hover:text-white'
                  }`}>
                  <Settings size={14} />
                  <span>Configuración</span>
                </button>
                <button onClick={handleGenerarMes} disabled={generando}
                  className="flex items-center justify-center space-x-2 px-4 py-2.5 min-h-11 bg-brand/10 border border-brand/30 text-brand text-xs font-black rounded-control uppercase tracking-widest hover:bg-brand/20 disabled:opacity-50 transition">
                  <Plus size={14} />
                  <span>{generando ? 'Generando...' : 'Generar Mes'}</span>
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Configuración del club (owner) */}
      {mostrarConfig && !esCoach && (
        <div className="relative z-10 mb-6">
          <ConfiguracionPagos user={user} />
        </div>
      )}

      {/* Servicios y cargos extra (owner) */}
      {mostrarServicios && !esCoach && (
        <div className="relative z-10 mb-6">
          <CargosExtra user={user} atletas={atletas} grupoId={grupoId} contactos={contactos} />
        </div>
      )}

      {/* Comprobantes por verificar */}
      {mostrarVerificacion && (
        <div className="relative z-10 mb-6">
          <PorVerificarPanel onResuelto={load} onCountChange={setPendientesVerificar} />
        </div>
      )}

      {/* Toolbar */}
      <div className="relative z-10 flex flex-wrap gap-3 mb-6">
        {/* Mes / Año */}
        <div className="flex items-center space-x-2 bg-white/5 border border-white/10 rounded-control px-4 py-2.5">
          <div className="relative flex items-center">
            <select value={mes} onChange={e => setMes(Number(e.target.value))}
              className="bg-transparent text-sm text-white font-bold focus:outline-none cursor-pointer appearance-none pr-5">
              {MESES.slice(1).map((m, i) => <option key={i+1} value={i+1} className="bg-surface-card">{m}</option>)}
            </select>
            <ChevronDown size={12} className="absolute right-0 text-fg-muted pointer-events-none" />
          </div>
          <span className="text-fg-muted">/</span>
          <input type="number" inputMode="numeric" min={2024} max={2099} value={anio} onChange={e => setAnio(Number(e.target.value))}
            className="bg-transparent w-16 text-sm text-white font-bold focus:outline-none" />
        </div>

        {/* Grupos reales del club (adiós lista hardcodeada) */}
        <div className="flex items-center flex-wrap gap-1 bg-white/5 border border-white/10 rounded-control p-1">
          {[{ id: 'Todos', nombre: 'Todos' }, ...grupos].map(g => (
            <button key={g.id} onClick={() => setGrupoId(g.id)}
              className={`px-3 py-2 min-h-10 rounded-lg text-2xs font-black uppercase tracking-widest transition ${
                grupoId === g.id ? 'bg-brand/10 text-brand border border-brand/30' : 'text-fg-muted hover:text-white'
              }`}>{g.nombre}</button>
          ))}
        </div>

        <button onClick={load} className="flex items-center space-x-1.5 px-3 py-2.5 min-h-11 border border-white/10 rounded-control text-fg-muted hover:text-white text-xs font-bold transition-colors">
          <RefreshCw size={13} />
          <span>Actualizar</span>
        </button>
      </div>

      {/* Stats Bar */}
      <div className="relative z-10 grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Recaudado', value: `$${recaudado.toFixed(0)}`, sub: `${pagados} pagos completos`, color: 'text-success-soft', border: 'border-success/20' },
          { label: 'Por Cobrar', value: `$${porCobrar.toFixed(0)}`, sub: `${pendientes} pendientes`, color: 'text-yellow-400', border: 'border-yellow-500/20' },
          { label: 'Vencidos', value: vencidos, sub: 'requieren atención', color: 'text-danger-soft', border: 'border-danger/20' },
          { label: 'Becados', value: becados, sub: 'del grupo', color: 'text-mental-soft', border: 'border-mental/20' },
        ].map(stat => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className={`glass-card rounded-panel p-4 border ${stat.border}`}>
            <p className="text-2xs font-black uppercase tracking-eyebrow text-fg-muted mb-1">{stat.label}</p>
            <p className={`text-3xl font-black ${stat.color}`}>{stat.value}</p>
            <p className="text-[11px] text-fg-muted mt-0.5">{stat.sub}</p>
          </motion.div>
        ))}
      </div>

      {/* Tabla de Pagos (cards apiladas en móvil, grid en md+) */}
      <div className="relative z-10 glass-card rounded-panel overflow-hidden border border-white/8">
        <div className="hidden md:grid bg-black/40 border-b border-white/10 px-4 py-3 grid-cols-[1fr_80px_90px_110px_auto] gap-4 text-[8px] font-black uppercase tracking-widest text-fg-muted">
          <span>Jugador</span>
          <span>Grupo</span>
          <span>Monto</span>
          <span>Estado</span>
          <span className="text-right">Acciones</span>
        </div>

        {loading ? (
          <div className="text-center py-16 text-fg-faint">
            <RefreshCw size={24} className="mx-auto mb-3 animate-spin opacity-30" />
            <p className="text-sm font-bold">Cargando pagos...</p>
          </div>
        ) : pagos.length === 0 ? (
          <div className="text-center py-16 text-fg-faint">
            <DollarSign size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm font-bold">No hay pagos para este mes/grupo</p>
            <p className="text-xs text-fg-faint mt-1">Presiona "Generar Mes" para crear los pagos del mes</p>
          </div>
        ) : (
          pagos.map((pago, idx) => {
            const atletaNombre = pago.atletas?.usuarios?.nombre || '—';
            const cfg = ESTADO_CFG[pago.estado] || ESTADO_CFG.Pendiente;
            const Icon = cfg?.icon;
            const dias = diasParaVencer(pago.fecha_vencimiento);
            const alertaVencimiento = pago.estado === 'Pendiente' && dias !== null && dias <= 3;
            const saldo = saldoDe(pago);
            const contacto = contactos[pago.atleta_id];
            const cobrable = ESTADOS_COBRABLES.includes(pago.estado);

            return (
              <motion.div key={pago.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(idx, 10) * 0.02 }}
                className={`px-4 py-3.5 border-b border-white/5 flex flex-col gap-3 md:grid md:grid-cols-[1fr_80px_90px_110px_auto] md:gap-4 md:items-center hover:bg-white/3 transition-colors ${
                  alertaVencimiento ? 'bg-danger/3' : ''
                }`}>

                {/* Jugador */}
                <div className="flex items-center space-x-2.5">
                  <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center font-black text-white/50 text-xs flex-shrink-0">
                    {atletaNombre?.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white leading-tight">{atletaNombre}</p>
                    {contacto?.nombre && (
                      <p className="text-3xs text-fg-faint">Rep.: {contacto.nombre}{!normalizarTelefonoEC(contacto.telefono) ? ' · sin teléfono' : ''}</p>
                    )}
                    {alertaVencimiento && (
                      <p className="text-[11px] text-danger-soft font-bold">⚠ Vence en {dias} día(s)</p>
                    )}
                  </div>
                </div>

                {/* Grupo · Monto · Estado (fila compacta en móvil, columnas del grid en md+) */}
                <div className="flex items-center justify-between gap-2 md:contents">
                  <span className="text-2xs text-fg-secondary font-bold">{pago.atletas?.grupo_nombre || '—'}</span>
                  <span className="text-lg md:text-sm font-black text-white">
                    ${(pago.monto_final || 0).toFixed(0)}
                    {pago.estado === 'Abonado' && (
                      <span className="block text-3xs font-bold text-info-soft">abonado ${(pago.monto_pagado || 0).toFixed(0)}</span>
                    )}
                  </span>
                  <div className={`flex items-center space-x-1 px-2 py-1 rounded-lg border text-3xs font-black ${cfg?.color}`}>
                    {Icon && <Icon size={11} />}
                    <span>{pago.estado}</span>
                  </div>
                </div>

                {/* Acciones */}
                <div className="flex items-center gap-2 md:justify-end">
                  {cobrable && (
                    registrandoId === pago.id ? (
                      <div className="flex flex-1 md:flex-none flex-wrap items-center gap-2">
                        <input type="number" inputMode="decimal" min="0.01" step="0.01" max={saldo}
                          value={montoTx} onChange={e => setMontoTx(e.target.value)}
                          aria-label="Monto a registrar"
                          className="w-20 bg-black/60 border border-white/10 rounded-lg px-2 py-2 min-h-11 md:min-h-10 text-2xs text-white focus:outline-none" />
                        <select value={formaPago} onChange={e => setFormaPago(e.target.value)}
                          className="bg-black/60 border border-white/10 rounded-lg px-2 py-2 min-h-11 md:min-h-10 text-2xs text-white focus:outline-none">
                          {['Efectivo', 'Transferencia', 'Otro'].map(f => (
                            <option key={f} value={f} className="bg-surface-card">{f}</option>
                          ))}
                        </select>
                        {formaPago === 'Transferencia' && (
                          <>
                            <input type="text" placeholder="Nº doc." value={referenciaTx} onChange={e => setReferenciaTx(e.target.value)}
                              className="w-20 bg-black/60 border border-white/10 rounded-lg px-2 py-2 min-h-11 md:min-h-10 text-2xs text-white focus:outline-none" />
                            <label className={`flex items-center gap-1 px-2 py-2 min-h-11 md:min-h-10 border rounded-lg text-2xs font-bold cursor-pointer transition ${archivoTx ? 'border-success/40 text-success-soft' : 'border-white/10 text-fg-muted hover:text-white'}`}
                              title="Adjuntar la foto del comprobante que mandó la familia (se registra y aprueba en un paso)">
                              <Paperclip size={12} />
                              <span>{archivoTx ? '1 adjunto' : 'Comprob.'}</span>
                              <input type="file" accept="image/*,.pdf" className="hidden"
                                onChange={e => setArchivoTx(e.target.files?.[0] || null)} />
                            </label>
                          </>
                        )}
                        <button onClick={() => handleRegistrarTransaccion(pago)} disabled={guardandoTx} aria-label="Confirmar registro"
                          className="px-3.5 py-2 min-h-11 md:min-h-10 bg-success/20 border border-success/40 text-success-soft text-2xs font-black rounded-lg disabled:opacity-50">✓</button>
                        <button onClick={() => setRegistrandoId(null)} aria-label="Cancelar"
                          className="px-3.5 py-2 min-h-11 md:min-h-10 border border-white/10 text-fg-muted text-2xs font-black rounded-lg">✕</button>
                      </div>
                    ) : (
                      <button onClick={() => abrirRegistro(pago)}
                        className="flex-1 md:flex-none px-3.5 py-2 min-h-11 md:min-h-10 bg-success/10 border border-success/30 text-success-soft text-2xs font-black rounded-lg hover:bg-success/20 transition uppercase tracking-widest">
                        Registrar pago
                      </button>
                    )
                  )}
                  {pago.estado === 'Por Verificar' && (
                    <button onClick={() => setMostrarVerificacion(true)}
                      className="flex-1 md:flex-none px-3.5 py-2 min-h-11 md:min-h-10 bg-caution/10 border border-caution/30 text-caution-soft text-2xs font-black rounded-lg hover:bg-caution/20 transition uppercase tracking-widest">
                      Ver comprobante
                    </button>
                  )}
                  {pago.estado !== 'Becado' && pago.estado !== 'Anulado' && (
                    <button
                      onClick={() => enviarWhatsApp(pago)}
                      title={pago.estado === 'Pagado' ? 'Enviar confirmación por WhatsApp' : 'Recordar por WhatsApp'}
                      aria-label={pago.estado === 'Pagado' ? 'Enviar confirmación por WhatsApp' : 'Recordar por WhatsApp'}
                      className="p-2.5 min-w-11 min-h-11 flex items-center justify-center text-emerald-600 hover:text-success-soft transition-colors">
                      <MessageSquare size={16} />
                    </button>
                  )}
                  {pago.estado === 'Pagado' && (
                    <span className="text-3xs text-fg-faint">{pago.fecha_pago} · {pago.forma_pago}</span>
                  )}
                </div>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
}
