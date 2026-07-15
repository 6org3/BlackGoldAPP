import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  DollarSign, CheckCircle2, AlertTriangle, Clock,
  MessageSquare, Plus, RefreshCw, Shield, ChevronDown,
  FileSearch, Hourglass, CircleDollarSign, Ban, Paperclip,
  Settings, PackagePlus, Send, Wallet, FileText, History, Download,
} from 'lucide-react';
import {
  fetchPagosMes, registrarTransaccion, registrarTransferenciaAsistida,
  actualizarEstadoVencidos, generarPagosMensuales, fetchGruposClub, fetchContactosPago,
  exportarPagosCSV,
} from '../api/pagosService';
import { registrarEnvioWhatsApp } from '../api/comunicacionesService';
import { renderPlantilla, normalizarTelefonoEC, linkWhatsApp } from '../lib/plantillasWhatsApp';
import { generarReciboPDF } from '../lib/reciboPago';
import PorVerificarPanel from './PorVerificarPanel';
import ConfiguracionPagos from './ConfiguracionPagos';
import CargosExtra from './CargosExtra';
import ColaRecordatorios from './ColaRecordatorios';
import CajaResumen from './CajaResumen';
import AuditoriaPago from './AuditoriaPago';
import CutCard from './arcade/CutCard';
import HexAvatar from './arcade/HexAvatar';
import BotonVolver from './arcade/BotonVolver';
import MicroLabel from './arcade/MicroLabel';
import KpiTile from './arcade/KpiTile';
import KpiGrid from './arcade/KpiGrid';
import ModalHUD from './arcade/ModalHUD';
import { C, BORDER, GRAD, TINT, cut } from './arcade/arcadeTokens';

const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// Mapa de estados con su tono Arcade (color + tinte de fondo + borde + icono).
const ESTADO_CFG = {
  Pagado:          { c: C.ok,     bg: TINT.ok,      border: BORDER.okSoft,  icon: CheckCircle2 },
  Pendiente:       { c: C.gold,   bg: TINT.gold,    border: BORDER.gold16,  icon: Clock },
  Vencido:         { c: C.danger, bg: TINT.danger,  border: BORDER.danger,  icon: AlertTriangle },
  Becado:          { c: C.ai,     bg: TINT.ai,      border: BORDER.ai,      icon: Shield },
  Abonado:         { c: C.info,   bg: TINT.info,    border: BORDER.info,    icon: CircleDollarSign },
  'Por Verificar': { c: C.warn,   bg: TINT.warn,    border: BORDER.warn,    icon: Hourglass },
  Anulado:         { c: C.text3,  bg: TINT.neutral, border: BORDER.neutral, icon: Ban },
};

// Estados sobre los que el staff puede registrar dinero
const ESTADOS_COBRABLES = ['Pendiente', 'Vencido', 'Abonado'];

// Caja de control de la toolbar (mes/año/grupos): superficie cut(7).
const boxStyle = { clipPath: cut(7), background: C.cardAlt1, border: `1px solid ${BORDER.neutralSoft}` };

// Botones toggle de paneles: base común + estilo inactivo.
const TOGGLE_BASE = 'cut-focus flex items-center justify-center gap-2 px-4 min-h-11 md:min-h-9 text-2xs font-black uppercase tracking-widest transition-colors';
const toggleInactive = { clipPath: cut(7), background: 'transparent', border: `1px solid ${BORDER.neutralSoft}`, color: C.text3 };

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
  const [mostrarCola, setMostrarCola] = useState(false);
  const [mostrarCaja, setMostrarCaja] = useState(false);
  const [auditoriaPago, setAuditoriaPago] = useState(null); // { id, nombre } | null
  // Diálogo HUD activo (reemplaza confirm/alert nativos): null | { variant, ... }.
  const [modal, setModal] = useState(null);

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

  // Métricas (una sola pasada, memoizada).
  // Un atleta sin grupo asignado igual recibe una fila de pago (fallback de
  // precio, generar_pagos_mes v28) — sin eso, "Vencidos"/"Por Cobrar" cuentan
  // como alerta real algo que en realidad es "nadie configuró su plan
  // todavía". Esos pagos se separan en `sinPlan`, no en vencidos/pendientes.
  const { pagados, pendientes, vencidos, becados, sinPlan, recaudado, porCobrar } = useMemo(() => {
    const m = { pagados: 0, pendientes: 0, vencidos: 0, becados: 0, sinPlan: 0, recaudado: 0, porCobrar: 0 };
    pagos.forEach(p => {
      const monto = p.monto_final || 0;
      const pagado = p.monto_pagado || 0;
      const sinGrupo = !p.atletas?.grupo_id;
      if (p.estado === 'Pagado') { m.pagados += 1; m.recaudado += monto; }
      else if (sinGrupo && (p.estado === 'Pendiente' || p.estado === 'Vencido')) { m.sinPlan += 1; m.recaudado += pagado; m.porCobrar += monto - pagado; }
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
    if (!monto || monto <= 0) {
      setModal({ variant: 'alert', tone: 'danger', icon: AlertTriangle, eyebrow: 'Validación', title: 'Monto inválido', message: 'Ingresa un monto mayor a 0.' });
      return;
    }
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
      setModal({ variant: 'alert', tone: 'danger', icon: AlertTriangle, eyebrow: 'Error', title: 'No se pudo registrar el pago', message: e.message });
    } finally {
      setGuardandoTx(false);
    }
  };

  const conceptoDe = (pago) => pago.concepto
    || (pago.tipo === 'Mensualidad' ? `Mensualidad ${MESES[pago.mes] || ''}` : pago.tipo);

  // WhatsApp dirigido al representante de pagos, con plantilla según estado.
  // Sin teléfono normalizable cae al selector de contactos (comportamiento previo).
  const ejecutarEnvioWhatsApp = (pago) => {
    const contacto = contactos[pago.atleta_id];
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

  const enviarWhatsApp = (pago) => {
    if (pago.atletas?.recordatorios_pausados && pago.estado !== 'Pagado') {
      setModal({
        variant: 'confirm', tone: 'warn', icon: MessageSquare,
        eyebrow: 'Acuerdo con el club',
        title: 'Recordatorios pausados',
        message: 'Esta familia tiene los recordatorios pausados (acuerdo con el club). ¿Enviar de todas formas?',
        confirmLabel: 'Enviar de todas formas',
        onConfirm: () => { setModal(null); ejecutarEnvioWhatsApp(pago); },
      });
      return;
    }
    ejecutarEnvioWhatsApp(pago);
  };

  const handleGenerarMes = async () => {
    setGenerando(true);
    try {
      // v28: server-side por club (superadmin sin club → todos). Idempotente.
      const creados = await generarPagosMensuales(mes, anio, user.club ?? null, user.id);
      load();
      if (typeof creados === 'number') {
        setModal({
          variant: 'alert',
          tone: creados > 0 ? 'ok' : 'info',
          icon: creados > 0 ? CheckCircle2 : Clock,
          eyebrow: 'Generar mes',
          title: creados > 0 ? 'Pagos generados' : 'Sin pagos nuevos',
          message: creados > 0 ? `Se generaron ${creados} pago(s) para ${MESES[mes]} ${anio}.` : `No había pagos nuevos que generar para ${MESES[mes]} ${anio}.`,
        });
      }
    } catch (e) {
      console.error(e);
      setModal({ variant: 'alert', tone: 'danger', icon: AlertTriangle, eyebrow: 'Error', title: 'No se pudo generar el mes', message: e.message });
    }
    setGenerando(false);
  };

  const descargarRecibo = (pago) => {
    generarReciboPDF(pago, {
      atletaNombre: pago.atletas?.usuarios?.nombre || '—',
      club: user?.club || 'Black Gold',
    }).catch(e => {
      console.error(e);
      setModal({ variant: 'alert', tone: 'danger', icon: AlertTriangle, eyebrow: 'Error', title: 'No se pudo generar el recibo', message: 'No se pudo generar el recibo.' });
    });
  };

  const diasParaVencer = (fecha) => {
    if (!fecha) return null;
    const diff = Math.ceil((new Date(fecha) - new Date()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  return (
    <div className="p-6 md:p-12" style={{ color: C.text }}>
      {/* Header */}
      <header className="mb-8 pb-8" style={{ borderBottom: `1px solid ${BORDER.neutral}` }}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <BotonVolver />
            <HexAvatar size={44} background={GRAD.goldHex} color={C.ink}>
              <DollarSign size={22} strokeWidth={2.5} />
            </HexAvatar>
            <div>
              <h2 className="text-3xl md:text-4xl font-black uppercase tracking-tight" style={{ color: C.text }}>
                Control de <span style={{ color: C.gold }}>Pagos</span>
              </h2>
              <MicroLabel style={{ marginTop: 4 }}>Mensualidades · Sesiones Individuales</MicroLabel>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setMostrarVerificacion(v => !v)}
              aria-pressed={mostrarVerificacion}
              className={TOGGLE_BASE}
              style={(mostrarVerificacion || pendientesVerificar > 0)
                ? { clipPath: cut(7), background: TINT.warn, border: `1px solid ${BORDER.warn}`, color: C.warn }
                : toggleInactive}>
              <FileSearch size={14} />
              <span>Por verificar{pendientesVerificar > 0 ? ` (${pendientesVerificar})` : ''}</span>
            </button>
            {/* Recordatorios (cola 1-a-N) también para el coach en modo cobro. */}
            <button type="button" onClick={() => setMostrarCola(v => !v)}
              aria-pressed={mostrarCola}
              className={TOGGLE_BASE}
              style={mostrarCola
                ? { clipPath: cut(7), background: TINT.warn, border: `1px solid ${BORDER.warn}`, color: C.warn }
                : toggleInactive}>
              <Send size={14} />
              <span>Recordatorios</span>
            </button>
            {/* El coach opera en modo cobro: registrar y recordar. Servicios,
                configuración, caja y "Generar Mes" son owner/superadmin. */}
            {!esCoach && (
              <>
                <button type="button" onClick={() => setMostrarCaja(v => !v)}
                  aria-pressed={mostrarCaja}
                  className={TOGGLE_BASE}
                  style={mostrarCaja
                    ? { clipPath: cut(7), background: TINT.ok, border: `1px solid ${BORDER.okSoft}`, color: C.ok }
                    : toggleInactive}>
                  <Wallet size={14} />
                  <span>Caja</span>
                </button>
                <button type="button" onClick={() => { setMostrarServicios(v => !v); setMostrarConfig(false); }}
                  aria-pressed={mostrarServicios}
                  className={TOGGLE_BASE}
                  style={mostrarServicios
                    ? { clipPath: cut(7), background: TINT.info, border: `1px solid ${BORDER.info}`, color: C.info }
                    : toggleInactive}>
                  <PackagePlus size={14} />
                  <span>Servicios</span>
                </button>
                <button type="button" onClick={() => { setMostrarConfig(v => !v); setMostrarServicios(false); }}
                  aria-pressed={mostrarConfig}
                  className={TOGGLE_BASE}
                  style={mostrarConfig
                    ? { clipPath: cut(7), background: TINT.gold, border: `1px solid ${BORDER.goldMid}`, color: C.gold }
                    : toggleInactive}>
                  <Settings size={14} />
                  <span>Configuración</span>
                </button>
                <button type="button" onClick={handleGenerarMes} disabled={generando}
                  className="cut-focus flex items-center justify-center gap-2 px-4 min-h-11 md:min-h-9 text-2xs font-black uppercase tracking-widest disabled:opacity-50 transition"
                  style={{ clipPath: cut(8), background: GRAD.goldCTA, border: 'none', color: C.ink }}>
                  <Plus size={14} />
                  <span>{generando ? 'Generando...' : 'Generar Mes'}</span>
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Cola de recordatorios W2 (staff) */}
      {mostrarCola && (
        <div className="mb-6">
          <ColaRecordatorios user={user} mes={mes} anio={anio} />
        </div>
      )}

      {/* Cierre de caja (owner) */}
      {mostrarCaja && !esCoach && (
        <div className="mb-6">
          <CajaResumen mes={mes} anio={anio} />
        </div>
      )}

      {/* Configuración del club (owner) */}
      {mostrarConfig && !esCoach && (
        <div className="mb-6">
          <ConfiguracionPagos user={user} />
        </div>
      )}

      {/* Servicios y cargos extra (owner) */}
      {mostrarServicios && !esCoach && (
        <div className="mb-6">
          <CargosExtra user={user} atletas={atletas} grupoId={grupoId} contactos={contactos} />
        </div>
      )}

      {/* Comprobantes por verificar */}
      {mostrarVerificacion && (
        <div className="mb-6">
          <PorVerificarPanel onResuelto={load} onCountChange={setPendientesVerificar} />
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 mb-6">
        {/* Mes / Año */}
        <div className="flex items-center gap-2 px-4" style={boxStyle}>
          <div className="relative flex items-center">
            <select value={mes} onChange={e => setMes(Number(e.target.value))}
              className="cut-focus arcade-input bg-transparent min-h-11 md:min-h-9 text-sm font-bold focus:outline-none cursor-pointer appearance-none pr-5"
              style={{ color: C.text }}>
              {MESES.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
            <ChevronDown size={12} className="absolute right-0 pointer-events-none" style={{ color: C.text3 }} />
          </div>
          <span style={{ color: C.text3 }}>/</span>
          <input type="number" inputMode="numeric" min={2024} max={2099} value={anio} onChange={e => setAnio(Number(e.target.value))}
            className="cut-focus arcade-input bg-transparent w-16 min-h-11 md:min-h-9 text-sm font-bold focus:outline-none"
            style={{ color: C.text }} />
        </div>

        {/* Grupos reales del club (adiós lista hardcodeada) */}
        <div className="flex items-center flex-wrap gap-1 p-1" style={boxStyle}>
          {[{ id: 'Todos', nombre: 'Todos' }, ...grupos].map(g => (
            <button key={g.id} type="button" onClick={() => setGrupoId(g.id)}
              aria-pressed={grupoId === g.id}
              className="cut-focus px-3.5 min-h-11 md:min-h-9 inline-flex items-center text-2xs font-black uppercase tracking-widest transition-colors"
              style={grupoId === g.id
                ? { clipPath: cut(5), background: TINT.gold, border: `1px solid ${BORDER.goldMid}`, color: C.gold }
                : { clipPath: cut(5), background: 'transparent', border: '1px solid transparent', color: C.text3 }}>
              {g.nombre}
            </button>
          ))}
        </div>

        <button type="button" onClick={load}
          className="cut-focus flex items-center gap-1.5 px-3 min-h-11 md:min-h-9 text-xs font-bold transition-colors"
          style={{ clipPath: cut(7), background: 'transparent', border: `1px solid ${BORDER.neutralSoft}`, color: C.text3 }}>
          <RefreshCw size={13} />
          <span>Actualizar</span>
        </button>

        <button type="button" onClick={() => exportarPagosCSV(pagos, { mes, anio })} disabled={pagos.length === 0}
          className="cut-focus flex items-center gap-1.5 px-3 min-h-11 md:min-h-9 text-xs font-bold transition-colors disabled:opacity-40"
          style={{ clipPath: cut(7), background: 'transparent', border: `1px solid ${BORDER.neutralSoft}`, color: C.text3 }}>
          <Download size={13} />
          <span>Exportar CSV</span>
        </button>
      </div>

      {/* Stats Bar */}
      <KpiGrid min={160} gap={12} style={{ marginBottom: 32 }}>
        <KpiTile label="Recaudado" val={`$${recaudado.toFixed(0)}`} color={C.ok} sub={`${pagados} pagos completos`} labelSize={9} border={BORDER.ok} />
        <KpiTile label="Por Cobrar" val={`$${porCobrar.toFixed(0)}`} color={C.gold} sub={`${pendientes} pendientes`} labelSize={9} border={BORDER.gold16} />
        <KpiTile label="Vencidos" val={vencidos} color={C.danger} sub="requieren atención" labelSize={9} border={BORDER.danger} />
        <KpiTile label="Sin Plan" val={sinPlan} color={C.warn} sub="falta asignar grupo" labelSize={9} border={BORDER.warn} />
        <KpiTile label="Becados" val={becados} color={C.ai} sub="del grupo" labelSize={9} border={BORDER.ai} />
      </KpiGrid>

      {/* Tabla de Pagos (cards apiladas en móvil, grid en md+) */}
      <CutCard cut={12} padding="0" style={{ overflow: 'hidden' }}>
        <div className="hidden md:grid px-4 py-3 grid-cols-[1fr_80px_90px_110px_auto] gap-4" style={{ background: C.cardAlt1, borderBottom: `1px solid ${BORDER.neutral}` }}>
          <MicroLabel as="span" style={{ margin: 0 }}>Jugador</MicroLabel>
          <MicroLabel as="span" style={{ margin: 0 }}>Grupo</MicroLabel>
          <MicroLabel as="span" style={{ margin: 0 }}>Monto</MicroLabel>
          <MicroLabel as="span" style={{ margin: 0 }}>Estado</MicroLabel>
          <MicroLabel as="span" style={{ margin: 0, textAlign: 'right' }}>Acciones</MicroLabel>
        </div>

        {loading ? (
          <div className="text-center py-16" style={{ color: C.text3 }}>
            <RefreshCw size={24} className="mx-auto mb-3 animate-spin opacity-30" />
            <p className="text-sm font-bold">Cargando pagos...</p>
          </div>
        ) : pagos.length === 0 ? (
          <div className="text-center py-16" style={{ color: C.text3 }}>
            <DollarSign size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm font-bold">No hay pagos para este mes/grupo</p>
            <p className="text-xs mt-1" style={{ color: C.text3 }}>Presiona "Generar Mes" para crear los pagos del mes</p>
          </div>
        ) : (
          pagos.map((pago, idx) => {
            const atletaNombre = pago.atletas?.usuarios?.nombre || '—';
            // Sin grupo asignado + aún no pagado: la fila arrastra el precio
            // fallback de generar_pagos_mes, no un plan real — no se etiqueta
            // como "Vencido"/"Pendiente" para no leerse como alerta real.
            const esSinPlan = !pago.atletas?.grupo_id && (pago.estado === 'Pendiente' || pago.estado === 'Vencido');
            const cfg = esSinPlan
              ? { c: C.warn, bg: TINT.warn, border: BORDER.warn, icon: Hourglass }
              : (ESTADO_CFG[pago.estado] || ESTADO_CFG.Pendiente);
            const Icon = cfg?.icon;
            const dias = diasParaVencer(pago.fecha_vencimiento);
            const alertaVencimiento = pago.estado === 'Pendiente' && dias !== null && dias <= 3;
            const saldo = saldoDe(pago);
            const contacto = contactos[pago.atleta_id];
            const cobrable = ESTADOS_COBRABLES.includes(pago.estado);

            return (
              <motion.div key={pago.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(idx, 10) * 0.02 }}
                className="px-4 py-3.5 flex flex-col gap-3 md:grid md:grid-cols-[1fr_80px_90px_110px_auto] md:gap-4 md:items-center hover:bg-white/[0.03] transition-colors"
                style={{ borderBottom: `1px solid ${BORDER.neutralFaint}`, background: alertaVencimiento ? TINT.danger : undefined }}>

                {/* Jugador */}
                <div className="flex items-center gap-2.5">
                  <HexAvatar size={36}>{atletaNombre?.charAt(0)}</HexAvatar>
                  <div>
                    <p className="text-sm font-bold leading-tight" style={{ color: C.text }}>{atletaNombre}</p>
                    {contacto?.nombre && (
                      contacto.esPlaceholder ? (
                        <p className="text-3xs font-bold" style={{ color: C.warn }}>Sin representante confirmado</p>
                      ) : (
                        <p className="text-3xs" style={{ color: C.text3 }}>Rep.: {contacto.nombre}{!normalizarTelefonoEC(contacto.telefono) ? ' · sin teléfono' : ''}</p>
                      )
                    )}
                    {alertaVencimiento && (
                      <p className="text-[11px] font-bold" style={{ color: C.danger }}>⚠ Vence en {dias} día(s)</p>
                    )}
                  </div>
                </div>

                {/* Grupo · Monto · Estado (fila compacta en móvil, columnas del grid en md+) */}
                <div className="flex items-center justify-between gap-2 md:contents">
                  <span className="text-2xs font-bold" style={{ color: C.text2 }}>{pago.atletas?.grupo_nombre || '—'}</span>
                  <span className="text-lg md:text-sm font-black" style={{ color: C.text }}>
                    ${(pago.monto_final || 0).toFixed(0)}
                    {pago.estado === 'Abonado' && (
                      <span className="block text-3xs font-bold" style={{ color: C.info }}>abonado ${(pago.monto_pagado || 0).toFixed(0)}</span>
                    )}
                  </span>
                  <div className="flex items-center gap-1 px-2 py-1 text-3xs font-black" style={{ clipPath: cut(5), background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.c }}>
                    {Icon && <Icon size={11} />}
                    <span>{esSinPlan ? 'Sin Plan' : pago.estado}</span>
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
                          className="cut-focus arcade-input w-20 px-2 min-h-11 md:min-h-10 text-2xs font-bold focus:outline-none"
                          style={{ ...boxStyle, color: C.text }} />
                        <select value={formaPago} onChange={e => setFormaPago(e.target.value)}
                          className="cut-focus arcade-input px-2 min-h-11 md:min-h-10 text-2xs font-bold focus:outline-none"
                          style={{ ...boxStyle, color: C.text }}>
                          {['Efectivo', 'Transferencia', 'Otro'].map(f => (
                            <option key={f} value={f}>{f}</option>
                          ))}
                        </select>
                        {formaPago === 'Transferencia' && (
                          <>
                            <input type="text" placeholder="Nº doc." value={referenciaTx} onChange={e => setReferenciaTx(e.target.value)}
                              className="cut-focus arcade-input w-20 px-2 min-h-11 md:min-h-10 text-2xs font-bold focus:outline-none"
                              style={{ ...boxStyle, color: C.text }} />
                            <label className="cut-focus flex items-center gap-1 px-2 min-h-11 md:min-h-10 text-2xs font-bold cursor-pointer transition-colors"
                              style={archivoTx
                                ? { clipPath: cut(7), background: C.cardAlt1, border: `1px solid ${BORDER.okSoft}`, color: C.ok }
                                : { clipPath: cut(7), background: C.cardAlt1, border: `1px solid ${BORDER.neutralSoft}`, color: C.text3 }}
                              title="Adjuntar la foto del comprobante que mandó la familia (se registra y aprueba en un paso)">
                              <Paperclip size={12} />
                              <span>{archivoTx ? '1 adjunto' : 'Comprob.'}</span>
                              <input type="file" accept="image/*,.pdf" className="hidden"
                                onChange={e => setArchivoTx(e.target.files?.[0] || null)} />
                            </label>
                          </>
                        )}
                        <button type="button" onClick={() => handleRegistrarTransaccion(pago)} disabled={guardandoTx} aria-label="Confirmar registro"
                          className="cut-focus px-3.5 min-h-11 md:min-h-10 text-2xs font-black disabled:opacity-50"
                          style={{ clipPath: cut(7), background: TINT.ok, border: `1px solid ${BORDER.okStrong}`, color: C.ok }}>✓</button>
                        <button type="button" onClick={() => setRegistrandoId(null)} aria-label="Cancelar"
                          className="cut-focus px-3.5 min-h-11 md:min-h-10 text-2xs font-black"
                          style={{ clipPath: cut(7), background: 'transparent', border: `1px solid ${BORDER.neutralSoft}`, color: C.text3 }}>✕</button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => abrirRegistro(pago)}
                        className="cut-focus flex-1 md:flex-none px-3.5 min-h-11 md:min-h-10 text-2xs font-black uppercase tracking-widest transition-colors"
                        style={{ clipPath: cut(7), background: TINT.ok, border: `1px solid ${BORDER.okSoft}`, color: C.ok }}>
                        Registrar pago
                      </button>
                    )
                  )}
                  {pago.estado === 'Por Verificar' && (
                    <button type="button" onClick={() => setMostrarVerificacion(true)}
                      className="cut-focus flex-1 md:flex-none px-3.5 min-h-11 md:min-h-10 text-2xs font-black uppercase tracking-widest transition-colors"
                      style={{ clipPath: cut(7), background: TINT.warn, border: `1px solid ${BORDER.warn}`, color: C.warn }}>
                      Ver comprobante
                    </button>
                  )}
                  {pago.estado !== 'Becado' && pago.estado !== 'Anulado' && (
                    <button type="button"
                      onClick={() => enviarWhatsApp(pago)}
                      title={pago.estado === 'Pagado' ? 'Enviar confirmación por WhatsApp' : 'Recordar por WhatsApp'}
                      aria-label={pago.estado === 'Pagado' ? 'Enviar confirmación por WhatsApp' : 'Recordar por WhatsApp'}
                      className="cut-focus p-2.5 min-w-11 min-h-11 flex items-center justify-center transition-colors hover:bg-white/[0.06]"
                      style={{ clipPath: cut(5), color: C.whatsapp }}>
                      <MessageSquare size={16} />
                    </button>
                  )}
                  {pago.estado === 'Pagado' && (
                    <>
                      <button type="button" onClick={() => descargarRecibo(pago)}
                        title="Descargar recibo" aria-label="Descargar recibo"
                        className="cut-focus p-2.5 min-w-11 min-h-11 flex items-center justify-center transition-colors hover:bg-white/[0.06]"
                        style={{ clipPath: cut(5), color: C.text3 }}>
                        <FileText size={16} />
                      </button>
                      <span className="text-3xs" style={{ color: C.text3 }}>{pago.fecha_pago} · {pago.forma_pago}</span>
                    </>
                  )}
                  <button type="button" onClick={() => setAuditoriaPago({ id: pago.id, nombre: atletaNombre })}
                    title="Ver auditoría" aria-label="Ver auditoría"
                    className="cut-focus p-2.5 min-w-11 min-h-11 flex items-center justify-center transition-colors hover:bg-white/[0.06]"
                    style={{ clipPath: cut(5), color: C.text3 }}>
                    <History size={16} />
                  </button>
                </div>
              </motion.div>
            );
          })
        )}
      </CutCard>

      {auditoriaPago && (
        <AuditoriaPago pagoId={auditoriaPago.id} atletaNombre={auditoriaPago.nombre} onClose={() => setAuditoriaPago(null)} />
      )}

      <ModalHUD open={!!modal} {...(modal || {})} onClose={() => setModal(null)} />
    </div>
  );
}
