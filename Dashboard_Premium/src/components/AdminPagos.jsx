import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  DollarSign, CheckCircle2, AlertTriangle, Clock,
  MessageSquare, Plus, RefreshCw, Shield, ChevronDown
} from 'lucide-react';
import {
  fetchPagosMes, marcarPagado, actualizarEstadoVencidos,
  generarPagosMensuales
} from '../api/pagosService';
import { generarLinkWhatsApp, generarMensajeRecordatorioPago } from '../api/comunicacionesService';

const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const ESTADO_CFG = {
  Pagado:    { color: 'text-success-soft bg-success/10 border-success/30', icon: CheckCircle2 },
  Pendiente: { color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',   icon: Clock },
  Vencido:   { color: 'text-danger-soft bg-danger/10 border-danger/30',            icon: AlertTriangle },
  Becado:    { color: 'text-mental-soft bg-mental/10 border-mental/30',   icon: Shield },
};

const GRUPOS = ['Todos', 'Micro', 'Desarrollo', 'Elite'];

export default function AdminPagos({ user, atletas = [] }) {
  const hoy = new Date();
  const [mes, setMes] = useState(hoy.getMonth() + 1);
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [grupo, setGrupo] = useState('Todos');
  const [pagos, setPagos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [marcandoId, setMarcandoId] = useState(null);
  const [formaPago, setFormaPago] = useState('Efectivo');
  const [generando, setGenerando] = useState(false);
  const [vencidosListos, setVencidosListos] = useState(false);

  // Marcar vencidos una sola vez al entrar (es una escritura en DB);
  // cambiar mes/año/grupo solo debe leer.
  useEffect(() => {
    actualizarEstadoVencidos().finally(() => setVencidosListos(true));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchPagosMes(mes, anio, grupo);
    setPagos(data);
    setLoading(false);
  }, [mes, anio, grupo]);

  useEffect(() => {
    if (!vencidosListos) return;
    load();
  }, [vencidosListos, load]);

  // Métricas (una sola pasada, memoizada)
  const { pagados, pendientes, vencidos, becados, recaudado, porCobrar } = useMemo(() => {
    const m = { pagados: 0, pendientes: 0, vencidos: 0, becados: 0, recaudado: 0, porCobrar: 0 };
    pagos.forEach(p => {
      const monto = p.monto_final || 0;
      if (p.estado === 'Pagado') { m.pagados += 1; m.recaudado += monto; }
      else if (p.estado === 'Pendiente') { m.pendientes += 1; m.porCobrar += monto; }
      else if (p.estado === 'Vencido') { m.vencidos += 1; m.porCobrar += monto; }
      else if (p.estado === 'Becado') { m.becados += 1; }
    });
    return m;
  }, [pagos]);

  const handleMarcarPagado = async (pagoId) => {
    await marcarPagado(pagoId, { forma_pago: formaPago });
    setMarcandoId(null);
    load();
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
          <button onClick={handleGenerarMes} disabled={generando}
            className="flex items-center justify-center space-x-2 px-4 py-2.5 min-h-11 bg-brand/10 border border-brand/30 text-brand text-xs font-black rounded-control uppercase tracking-widest hover:bg-brand/20 disabled:opacity-50 transition">
            <Plus size={14} />
            <span>{generando ? 'Generando...' : 'Generar Mes'}</span>
          </button>
        </div>
      </header>

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

        {/* Grupo */}
        <div className="flex items-center space-x-1 bg-white/5 border border-white/10 rounded-control p-1">
          {GRUPOS.map(g => (
            <button key={g} onClick={() => setGrupo(g)}
              className={`px-3 py-2 min-h-10 rounded-lg text-2xs font-black uppercase tracking-widest transition ${
                grupo === g ? 'bg-brand/10 text-brand border border-brand/30' : 'text-fg-muted hover:text-white'
              }`}>{g}</button>
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
          { label: 'Recaudado', value: `$${recaudado.toFixed(0)}`, sub: `${pagados} pagos`, color: 'text-success-soft', border: 'border-success/20' },
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
        <div className="hidden md:grid bg-black/40 border-b border-white/10 px-4 py-3 grid-cols-[1fr_80px_90px_100px_auto] gap-4 text-[8px] font-black uppercase tracking-widest text-fg-muted">
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
            const cfg = ESTADO_CFG[pago.estado];
            const Icon = cfg?.icon;
            const dias = diasParaVencer(pago.fecha_vencimiento);
            const alertaVencimiento = pago.estado === 'Pendiente' && dias !== null && dias <= 3;

            return (
              <motion.div key={pago.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(idx, 10) * 0.02 }}
                className={`px-4 py-3.5 border-b border-white/5 flex flex-col gap-3 md:grid md:grid-cols-[1fr_80px_90px_100px_auto] md:gap-4 md:items-center hover:bg-white/3 transition-colors ${
                  alertaVencimiento ? 'bg-danger/3' : ''
                }`}>

                {/* Jugador */}
                <div className="flex items-center space-x-2.5">
                  <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center font-black text-white/50 text-xs flex-shrink-0">
                    {atletaNombre?.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white leading-tight">{atletaNombre}</p>
                    {alertaVencimiento && (
                      <p className="text-[11px] text-danger-soft font-bold">⚠ Vence en {dias} día(s)</p>
                    )}
                  </div>
                </div>

                {/* Grupo · Monto · Estado (fila compacta en móvil, columnas del grid en md+) */}
                <div className="flex items-center justify-between gap-2 md:contents">
                  <span className="text-2xs text-fg-secondary font-bold">{pago.atletas?.grupo_nombre || '—'}</span>
                  <span className="text-lg md:text-sm font-black text-white">${(pago.monto_final || 0).toFixed(0)}</span>
                  <div className={`flex items-center space-x-1 px-2 py-1 rounded-lg border text-3xs font-black ${cfg?.color}`}>
                    {Icon && <Icon size={11} />}
                    <span>{pago.estado}</span>
                  </div>
                </div>

                {/* Acciones */}
                <div className="flex items-center gap-2 md:justify-end">
                  {pago.estado !== 'Pagado' && pago.estado !== 'Becado' && (
                    <>
                      {marcandoId === pago.id ? (
                        <div className="flex flex-1 md:flex-none items-center gap-2">
                          <select value={formaPago} onChange={e => setFormaPago(e.target.value)}
                            className="flex-1 md:flex-none bg-black/60 border border-white/10 rounded-lg px-2 py-2 min-h-11 md:min-h-10 text-2xs text-white focus:outline-none">
                            {['Efectivo', 'Transferencia', 'Otro'].map(f => (
                              <option key={f} value={f} className="bg-surface-card">{f}</option>
                            ))}
                          </select>
                          <button onClick={() => handleMarcarPagado(pago.id)} aria-label="Confirmar pago"
                            className="px-3.5 py-2 min-h-11 md:min-h-10 bg-success/20 border border-success/40 text-success-soft text-2xs font-black rounded-lg">✓</button>
                          <button onClick={() => setMarcandoId(null)} aria-label="Cancelar"
                            className="px-3.5 py-2 min-h-11 md:min-h-10 border border-white/10 text-fg-muted text-2xs font-black rounded-lg">✕</button>
                        </div>
                      ) : (
                        <button onClick={() => setMarcandoId(pago.id)}
                          className="flex-1 md:flex-none px-3.5 py-2 min-h-11 md:min-h-10 bg-success/10 border border-success/30 text-success-soft text-2xs font-black rounded-lg hover:bg-success/20 transition uppercase tracking-widest">
                          Marcar Pagado
                        </button>
                      )}
                      <button
                        onClick={() => window.open(generarLinkWhatsApp('', generarMensajeRecordatorioPago(atletaNombre, pago.monto_final?.toFixed(0), mes)), '_blank')}
                        title="Recordar por WhatsApp"
                        aria-label="Recordar por WhatsApp"
                        className="p-2.5 min-w-11 min-h-11 flex items-center justify-center text-emerald-600 hover:text-success-soft transition-colors">
                        <MessageSquare size={16} />
                      </button>
                    </>
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
