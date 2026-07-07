import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  PackagePlus, Plus, RefreshCw, MessageSquare, Ban, CheckCircle2, Clock, AlertTriangle, CircleDollarSign, Hourglass,
} from 'lucide-react';
import {
  fetchCatalogo, fetchCargosExtra, crearCargo, anularCargo, precioSugerido,
} from '../api/pagosService';
import { registrarEnvioWhatsApp } from '../api/comunicacionesService';
import { renderPlantilla, normalizarTelefonoEC, linkWhatsApp } from '../lib/plantillasWhatsApp';

const ESTADO_CFG = {
  Pagado:          { color: 'text-success-soft bg-success/10 border-success/30', icon: CheckCircle2 },
  Pendiente:       { color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30', icon: Clock },
  Vencido:         { color: 'text-danger-soft bg-danger/10 border-danger/30', icon: AlertTriangle },
  Abonado:         { color: 'text-info-soft bg-info/10 border-info/30', icon: CircleDollarSign },
  'Por Verificar': { color: 'text-caution-soft bg-caution/10 border-caution/30', icon: Hourglass },
  Anulado:         { color: 'text-fg-muted bg-white/5 border-white/10', icon: Ban },
};

/**
 * Pestaña de cargos extra individualizados (camps, uniformes, sesiones
 * individuales, inscripciones). El padre los ve en su estado de cuenta (que ya
 * soporta pagos no-mensualidad). Owner-only desde AdminPagos.
 */
export default function CargosExtra({ user, atletas = [], grupoId = 'Todos', contactos = {} }) {
  const [servicios, setServicios] = useState([]);
  const [cargos, setCargos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creando, setCreando] = useState(false);

  // Formulario de nuevo cargo
  const [atletaId, setAtletaId] = useState('');
  const [servicioId, setServicioId] = useState('');
  const [concepto, setConcepto] = useState('');
  const [monto, setMonto] = useState('');
  const [vencimiento, setVencimiento] = useState('');
  const [sugiriendo, setSugiriendo] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [cat, cgs] = await Promise.all([
      fetchCatalogo(user?.club, { soloActivos: true }),
      fetchCargosExtra(grupoId),
    ]);
    // El catálogo de cargos extra excluye la Mensualidad (esa se genera por mes)
    setServicios(cat.filter(s => s.nombre !== 'Mensualidad'));
    setCargos(cgs);
    setLoading(false);
  }, [user?.club, grupoId]);

  useEffect(() => { load(); }, [load]);

  const atletasOrdenados = useMemo(
    () => [...atletas].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '')),
    [atletas]
  );

  // Al elegir servicio o atleta, sugerir precio (categoría FEB resuelta en SQL).
  const sugerirPrecio = useCallback(async (svcId, atId) => {
    const svc = servicios.find(s => s.id === svcId);
    if (svc && !concepto) setConcepto(svc.nombre);
    if (!svcId || !atId) return;
    setSugiriendo(true);
    try {
      const p = await precioSugerido(svcId, atId);
      if (p != null) setMonto(Number(p).toFixed(2));
    } finally {
      setSugiriendo(false);
    }
  }, [servicios, concepto]);

  const onServicioChange = (svcId) => {
    setServicioId(svcId);
    const svc = servicios.find(s => s.id === svcId);
    setConcepto(svc ? svc.nombre : '');
    sugerirPrecio(svcId, atletaId);
  };
  const onAtletaChange = (atId) => {
    setAtletaId(atId);
    sugerirPrecio(servicioId, atId);
  };

  const limpiar = () => {
    setAtletaId(''); setServicioId(''); setConcepto(''); setMonto(''); setVencimiento('');
  };

  const crear = async () => {
    if (!atletaId) { alert('Elige un atleta.'); return; }
    if (!concepto.trim()) { alert('Falta el concepto del cargo.'); return; }
    if (!monto || Number(monto) <= 0) { alert('Monto inválido.'); return; }
    const svc = servicios.find(s => s.id === servicioId);
    setCreando(true);
    try {
      await crearCargo({
        atletaId,
        servicioId: servicioId || null,
        tipo: svc?.nombre === 'Sesión Individual' ? 'Sesion Individual' : 'Otro',
        concepto: concepto.trim(),
        monto: Number(monto),
        fechaVencimiento: vencimiento || null,
      }, user.id);
      limpiar();
      load();
    } catch (e) {
      console.error(e);
      alert(`No se pudo crear el cargo: ${e.message}`);
    } finally {
      setCreando(false);
    }
  };

  const anular = async (cargo) => {
    const motivo = window.prompt('Motivo de la anulación:', '');
    if (motivo === null) return;
    if (!motivo.trim()) { alert('La anulación necesita un motivo.'); return; }
    try { await anularCargo(cargo.id, motivo.trim()); load(); }
    catch (e) { alert(e.message); }
  };

  const avisarWhatsApp = (cargo) => {
    const contacto = contactos[cargo.atleta_id];
    const nombre = cargo.atletas?.usuarios?.nombre || 'el atleta';
    const mensaje = renderPlantilla('cargo_extra', {
      nombre_atleta: nombre,
      concepto: cargo.concepto || cargo.tipo,
      monto: (cargo.monto_final || 0).toFixed(2),
      fecha_limite: cargo.fecha_vencimiento
        ? new Date(`${cargo.fecha_vencimiento}T12:00:00`).toLocaleDateString('es-EC')
        : 'a convenir',
    });
    const telefono = normalizarTelefonoEC(contacto?.telefono);
    window.open(linkWhatsApp(telefono, mensaje), '_blank');
    registrarEnvioWhatsApp({
      autorId: user.id, usuarioDestinoId: contacto?.usuarioId || null,
      plantilla: 'cargo_extra', titulo: `cargo_extra · ${nombre}`, mensaje,
    });
  };

  return (
    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
      className="glass-card rounded-panel border border-info/20 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-black/40 border-b border-white/10">
        <div className="flex items-center space-x-2">
          <PackagePlus size={16} className="text-info-soft" />
          <h3 className="text-xs font-black uppercase tracking-widest text-info-soft">Servicios y cargos extra</h3>
        </div>
        <button onClick={load} aria-label="Recargar" className="p-2 min-w-10 min-h-10 flex items-center justify-center text-fg-muted hover:text-white transition-colors">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="p-4 space-y-5">
        {/* Nuevo cargo */}
        <div className="bg-black/20 border border-white/10 rounded-control p-3">
          <p className="text-2xs font-black uppercase tracking-widest text-fg-secondary mb-3">Nuevo cargo</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <label className="block">
              <span className="text-3xs text-fg-muted">Atleta</span>
              <select value={atletaId} onChange={e => onAtletaChange(e.target.value)}
                className="mt-0.5 w-full bg-black/60 border border-white/10 rounded-lg px-2 py-2.5 min-h-11 text-2xs text-white focus:outline-none">
                <option value="" className="bg-surface-card">Elegir atleta…</option>
                {atletasOrdenados.map(a => (
                  <option key={a.atleta_id} value={a.atleta_id} className="bg-surface-card">
                    {a.nombre}{a.grupo_nombre ? ` · ${a.grupo_nombre}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-3xs text-fg-muted">Servicio (sugiere precio)</span>
              <select value={servicioId} onChange={e => onServicioChange(e.target.value)}
                className="mt-0.5 w-full bg-black/60 border border-white/10 rounded-lg px-2 py-2.5 min-h-11 text-2xs text-white focus:outline-none">
                <option value="" className="bg-surface-card">Cargo libre (sin catálogo)</option>
                {servicios.map(s => <option key={s.id} value={s.id} className="bg-surface-card">{s.nombre}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-3xs text-fg-muted">Concepto</span>
              <input type="text" value={concepto} onChange={e => setConcepto(e.target.value)}
                placeholder="Ej. Camp julio, Uniforme talla M"
                className="mt-0.5 w-full bg-black/60 border border-white/10 rounded-lg px-2 py-2.5 min-h-11 text-2xs text-white focus:outline-none" />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-3xs text-fg-muted">Monto ${sugiriendo ? ' (sugiriendo…)' : ''}</span>
                <input type="number" min="0.01" step="0.01" value={monto} onChange={e => setMonto(e.target.value)}
                  className="mt-0.5 w-full bg-black/60 border border-white/10 rounded-lg px-2 py-2.5 min-h-11 text-2xs text-white focus:outline-none" />
              </label>
              <label className="block">
                <span className="text-3xs text-fg-muted">Vence (opcional)</span>
                <input type="date" value={vencimiento} onChange={e => setVencimiento(e.target.value)}
                  className="mt-0.5 w-full bg-black/60 border border-white/10 rounded-lg px-2 py-2.5 min-h-11 text-2xs text-white focus:outline-none" />
              </label>
            </div>
          </div>
          <button onClick={crear} disabled={creando}
            className="mt-3 flex items-center gap-2 px-4 py-2.5 min-h-11 bg-info/10 border border-info/30 text-info-soft text-2xs font-black rounded-control uppercase tracking-widest hover:bg-info/20 disabled:opacity-50 transition">
            <Plus size={13} /> {creando ? 'Creando…' : 'Crear cargo'}
          </button>
        </div>

        {/* Lista de cargos existentes */}
        {loading ? (
          <p className="text-center py-6 text-sm text-fg-faint font-bold">Cargando…</p>
        ) : cargos.length === 0 ? (
          <p className="text-center py-6 text-sm text-fg-faint font-bold">Sin cargos extra registrados.</p>
        ) : (
          <div className="space-y-2">
            {cargos.map(c => {
              const cfg = ESTADO_CFG[c.estado] || ESTADO_CFG.Pendiente;
              const Icon = cfg.icon;
              const nombre = c.atletas?.usuarios?.nombre || '—';
              return (
                <div key={c.id} className="flex flex-col md:flex-row md:items-center gap-2 px-3 py-2.5 border-b border-white/5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white">{nombre}</p>
                    <p className="text-2xs text-fg-secondary">{c.concepto || c.tipo} · <span className="font-black text-white">${(c.monto_final || 0).toFixed(2)}</span></p>
                  </div>
                  <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-3xs font-black ${cfg.color}`}>
                    <Icon size={10} /><span>{c.estado}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {c.estado !== 'Anulado' && c.estado !== 'Pagado' && (
                      <button onClick={() => avisarWhatsApp(c)} aria-label="Avisar por WhatsApp"
                        className="p-2 min-w-10 min-h-10 flex items-center justify-center text-emerald-600 hover:text-success-soft transition-colors">
                        <MessageSquare size={15} />
                      </button>
                    )}
                    {c.estado !== 'Anulado' && c.estado !== 'Pagado' && (c.monto_pagado || 0) === 0 && (
                      <button onClick={() => anular(c)} aria-label="Anular cargo"
                        className="p-2 min-w-10 min-h-10 flex items-center justify-center text-danger-soft/70 hover:text-danger-soft transition-colors">
                        <Ban size={15} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}
