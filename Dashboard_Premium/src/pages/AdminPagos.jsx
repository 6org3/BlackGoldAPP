import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  DollarSign, CheckCircle2, AlertTriangle, Clock, Users,
  MessageSquare, Plus, RefreshCw, Shield
} from 'lucide-react';
import {
  fetchPagosMes, marcarPagado, actualizarEstadoVencidos,
  generarPagosMensuales
} from '../api/pagosService';
import { generarLinkWhatsApp, generarMensajeRecordatorioPago } from '../api/comunicacionesService';

const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const ESTADO_CFG = {
  Pagado:    { color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30', icon: CheckCircle2 },
  Pendiente: { color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',   icon: Clock },
  Vencido:   { color: 'text-red-400 bg-red-500/10 border-red-500/30',            icon: AlertTriangle },
  Becado:    { color: 'text-purple-400 bg-purple-500/10 border-purple-500/30',   icon: Shield },
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

  const load = useCallback(async () => {
    setLoading(true);
    await actualizarEstadoVencidos();
    const data = await fetchPagosMes(mes, anio, grupo);
    setPagos(data);
    setLoading(false);
  }, [mes, anio, grupo]);

  useEffect(() => { load(); }, [load]);

  // Métricas
  const total = pagos.length;
  const pagados = pagos.filter(p => p.estado === 'Pagado').length;
  const pendientes = pagos.filter(p => p.estado === 'Pendiente').length;
  const vencidos = pagos.filter(p => p.estado === 'Vencido').length;
  const becados = pagos.filter(p => p.estado === 'Becado').length;
  const recaudado = pagos.filter(p => p.estado === 'Pagado').reduce((s, p) => s + (p.monto_final || 0), 0);
  const porCobrar = pagos.filter(p => ['Pendiente','Vencido'].includes(p.estado)).reduce((s, p) => s + (p.monto_final || 0), 0);

  const handleMarcarPagado = async (pagoId, atleta) => {
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
    <div className="min-h-screen bg-[#09090b] text-white p-6 md:p-10">
      <div className="fixed top-[-20%] right-[10%] w-[600px] h-[500px] bg-[#FFD700]/4 blur-[150px] pointer-events-none rounded-full" />

      {/* Header */}
      <header className="mb-8 border-b border-white/5 pb-8 relative z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <DollarSign className="text-[#FFD700]" size={28} />
            <div>
              <h2 className="text-4xl md:text-5xl font-black uppercase tracking-tighter">
                Control de{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#FFD700] to-[#D4AF37]">Pagos</span>
              </h2>
              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.3em] mt-1">
                Mensualidades · Sesiones Individuales
              </p>
            </div>
          </div>
          <button onClick={handleGenerarMes} disabled={generando}
            className="flex items-center space-x-2 px-4 py-2.5 bg-[#FFD700]/10 border border-[#FFD700]/30 text-[#FFD700] text-xs font-black rounded-xl uppercase tracking-widest hover:bg-[#FFD700]/20 disabled:opacity-50 transition-all">
            <Plus size={14} />
            <span>{generando ? 'Generando...' : 'Generar Mes'}</span>
          </button>
        </div>
      </header>

      {/* Toolbar */}
      <div className="relative z-10 flex flex-wrap gap-3 mb-6">
        {/* Mes / Año */}
        <div className="flex items-center space-x-2 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5">
          <select value={mes} onChange={e => setMes(Number(e.target.value))}
            className="bg-transparent text-sm text-white font-bold focus:outline-none cursor-pointer appearance-none">
            {MESES.slice(1).map((m, i) => <option key={i+1} value={i+1} className="bg-[#121214]">{m}</option>)}
          </select>
          <span className="text-gray-500">/</span>
          <input type="number" value={anio} onChange={e => setAnio(Number(e.target.value))}
            className="bg-transparent w-16 text-sm text-white font-bold focus:outline-none" />
        </div>

        {/* Grupo */}
        <div className="flex items-center space-x-1 bg-white/5 border border-white/10 rounded-xl p-1">
          {GRUPOS.map(g => (
            <button key={g} onClick={() => setGrupo(g)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                grupo === g ? 'bg-[#FFD700]/10 text-[#FFD700] border border-[#FFD700]/30' : 'text-gray-500 hover:text-white'
              }`}>{g}</button>
          ))}
        </div>

        <button onClick={load} className="flex items-center space-x-1.5 px-3 py-2.5 border border-white/10 rounded-xl text-gray-500 hover:text-white text-xs font-bold transition-colors">
          <RefreshCw size={13} />
          <span>Actualizar</span>
        </button>
      </div>

      {/* Stats Bar */}
      <div className="relative z-10 grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Recaudado', value: `$${recaudado.toFixed(0)}`, sub: `${pagados} pagos`, color: 'text-emerald-400', border: 'border-emerald-500/20' },
          { label: 'Por Cobrar', value: `$${porCobrar.toFixed(0)}`, sub: `${pendientes} pendientes`, color: 'text-yellow-400', border: 'border-yellow-500/20' },
          { label: 'Vencidos', value: vencidos, sub: 'requieren atención', color: 'text-red-400', border: 'border-red-500/20' },
          { label: 'Becados', value: becados, sub: 'del grupo', color: 'text-purple-400', border: 'border-purple-500/20' },
        ].map(stat => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className={`glass-card rounded-2xl p-4 border ${stat.border}`}>
            <p className="text-[8px] font-black uppercase tracking-[0.2em] text-gray-500 mb-1">{stat.label}</p>
            <p className={`text-3xl font-black ${stat.color}`}>{stat.value}</p>
            <p className="text-[9px] text-gray-500 mt-0.5">{stat.sub}</p>
          </motion.div>
        ))}
      </div>

      {/* Tabla de Pagos */}
      <div className="relative z-10 glass-card rounded-2xl overflow-hidden border border-white/8">
        <div className="bg-black/40 border-b border-white/10 px-4 py-3 grid grid-cols-[1fr_80px_90px_100px_auto] gap-4 text-[8px] font-black uppercase tracking-widest text-gray-500">
          <span>Jugador</span>
          <span>Grupo</span>
          <span>Monto</span>
          <span>Estado</span>
          <span className="text-right">Acciones</span>
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-600">
            <RefreshCw size={24} className="mx-auto mb-3 animate-spin opacity-30" />
            <p className="text-sm font-bold">Cargando pagos...</p>
          </div>
        ) : pagos.length === 0 ? (
          <div className="text-center py-16 text-gray-600">
            <DollarSign size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm font-bold">No hay pagos para este mes/grupo</p>
            <p className="text-xs text-gray-600 mt-1">Presiona "Generar Mes" para crear los pagos del mes</p>
          </div>
        ) : (
          pagos.map((pago, idx) => {
            const atletaNombre = pago.atletas?.usuarios?.nombre || '—';
            const cfg = ESTADO_CFG[pago.estado];
            const Icon = cfg?.icon;
            const dias = diasParaVencer(pago.fecha_vencimiento);
            const alertaVencimiento = pago.estado === 'Pendiente' && dias !== null && dias <= 3;

            return (
              <motion.div key={pago.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.02 }}
                className={`px-4 py-3.5 border-b border-white/5 grid grid-cols-[1fr_80px_90px_100px_auto] gap-4 items-center hover:bg-white/3 transition-colors ${
                  alertaVencimiento ? 'bg-red-500/3' : ''
                }`}>

                {/* Jugador */}
                <div className="flex items-center space-x-2.5">
                  <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center font-black text-white/50 text-xs flex-shrink-0">
                    {atletaNombre?.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white leading-tight">{atletaNombre}</p>
                    {alertaVencimiento && (
                      <p className="text-[8px] text-red-400 font-bold">⚠ Vence en {dias} día(s)</p>
                    )}
                  </div>
                </div>

                {/* Grupo */}
                <span className="text-[10px] text-gray-400 font-bold">{pago.atletas?.grupo_nombre || '—'}</span>

                {/* Monto */}
                <span className="text-sm font-black text-white">${(pago.monto_final || 0).toFixed(0)}</span>

                {/* Estado */}
                <div className={`flex items-center space-x-1 px-2 py-1 rounded-lg border text-[9px] font-black ${cfg?.color}`}>
                  {Icon && <Icon size={11} />}
                  <span>{pago.estado}</span>
                </div>

                {/* Acciones */}
                <div className="flex items-center space-x-2 justify-end">
                  {pago.estado !== 'Pagado' && pago.estado !== 'Becado' && (
                    <>
                      {marcandoId === pago.id ? (
                        <div className="flex items-center space-x-1.5">
                          <select value={formaPago} onChange={e => setFormaPago(e.target.value)}
                            className="bg-black/60 border border-white/10 rounded-lg px-2 py-1 text-[10px] text-white focus:outline-none">
                            {['Efectivo', 'Transferencia', 'Otro'].map(f => (
                              <option key={f} value={f} className="bg-[#121214]">{f}</option>
                            ))}
                          </select>
                          <button onClick={() => handleMarcarPagado(pago.id)}
                            className="px-3 py-1 bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-[10px] font-black rounded-lg">✓</button>
                          <button onClick={() => setMarcandoId(null)}
                            className="px-2 py-1 border border-white/10 text-gray-500 text-[10px] font-black rounded-lg">✕</button>
                        </div>
                      ) : (
                        <button onClick={() => setMarcandoId(pago.id)}
                          className="px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[9px] font-black rounded-lg hover:bg-emerald-500/20 transition-all uppercase tracking-widest">
                          Marcar Pagado
                        </button>
                      )}
                      <button
                        onClick={() => window.open(generarLinkWhatsApp('', generarMensajeRecordatorioPago(atletaNombre, pago.monto_final?.toFixed(0), mes)), '_blank')}
                        title="Recordar por WhatsApp"
                        className="p-1.5 text-emerald-600 hover:text-emerald-400 transition-colors">
                        <MessageSquare size={14} />
                      </button>
                    </>
                  )}
                  {pago.estado === 'Pagado' && (
                    <span className="text-[9px] text-gray-600">{pago.fecha_pago} · {pago.forma_pago}</span>
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
