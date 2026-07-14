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
import ModalHUD from './arcade/ModalHUD';
import MicroLabel from './arcade/MicroLabel';
import { C, BORDER, TINT, cut } from './arcade/arcadeTokens';

// Mapa de estados con su tono Arcade — gemelo del de AdminPagos (sin Becado:
// los cargos extra no tienen ese estado).
const ESTADO_CFG = {
  Pagado:          { c: C.ok,     bg: TINT.ok,      border: BORDER.okSoft,  icon: CheckCircle2 },
  Pendiente:       { c: C.gold,   bg: TINT.gold,    border: BORDER.gold16,  icon: Clock },
  Vencido:         { c: C.danger, bg: TINT.danger,  border: BORDER.danger,  icon: AlertTriangle },
  Abonado:         { c: C.info,   bg: TINT.info,    border: BORDER.info,    icon: CircleDollarSign },
  'Por Verificar': { c: C.warn,   bg: TINT.warn,    border: BORDER.warn,    icon: Hourglass },
  Anulado:         { c: C.text3,  bg: TINT.neutral, border: BORDER.neutral, icon: Ban },
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

  // Diálogo HUD activo (reemplaza alert/prompt nativos): null | { variant, ... }.
  const [modal, setModal] = useState(null);

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
    if (!atletaId) {
      setModal({ variant: 'alert', tone: 'danger', icon: AlertTriangle, eyebrow: 'Validación', title: 'Falta el atleta', message: 'Elige un atleta.' });
      return;
    }
    if (!concepto.trim()) {
      setModal({ variant: 'alert', tone: 'danger', icon: AlertTriangle, eyebrow: 'Validación', title: 'Falta el concepto', message: 'Falta el concepto del cargo.' });
      return;
    }
    if (!monto || Number(monto) <= 0) {
      setModal({ variant: 'alert', tone: 'danger', icon: AlertTriangle, eyebrow: 'Validación', title: 'Monto inválido', message: 'Ingresa un monto mayor a 0.' });
      return;
    }
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
      setModal({ variant: 'alert', tone: 'danger', icon: AlertTriangle, eyebrow: 'Error', title: 'No se pudo crear el cargo', message: e.message });
    } finally {
      setCreando(false);
    }
  };

  const ejecutarAnulacion = async (cargo, motivo) => {
    try {
      await anularCargo(cargo.id, motivo.trim());
      load();
    } catch (e) {
      setModal({ variant: 'alert', tone: 'danger', icon: AlertTriangle, eyebrow: 'Error', title: 'No se pudo anular', message: e.message });
    }
  };

  const anular = (cargo) => {
    setModal({
      variant: 'prompt',
      tone: 'danger',
      icon: Ban,
      eyebrow: 'Anulación',
      title: 'Anular cargo',
      message: 'La anulación necesita un motivo; el padre lo verá en su estado de cuenta.',
      placeholder: 'Motivo de la anulación',
      confirmLabel: 'Anular cargo',
      onConfirm: (motivo) => { setModal(null); ejecutarAnulacion(cargo, motivo); },
    });
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
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      style={{ background: C.card, border: `1px solid ${BORDER.info}`, clipPath: cut(12), overflow: 'hidden' }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ background: C.cardAlt1, borderBottom: `1px solid ${BORDER.neutral}` }}>
        <div className="flex items-center space-x-2">
          <PackagePlus size={16} style={{ color: C.info }} />
          <h3 className="text-xs font-black uppercase tracking-widest" style={{ color: C.info }}>Servicios y cargos extra</h3>
        </div>
        <button onClick={load} aria-label="Recargar"
          className="cut-focus p-2 min-w-11 min-h-11 md:min-w-10 md:min-h-10 flex items-center justify-center transition-colors"
          style={{ color: C.text3 }}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="p-4 space-y-5">
        {/* Nuevo cargo */}
        <div className="p-3" style={{ clipPath: cut(8), background: C.cardAlt1, border: `1px solid ${BORDER.neutral}` }}>
          <MicroLabel style={{ marginBottom: 12 }}>Nuevo cargo</MicroLabel>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <label className="block">
              <span className="text-3xs" style={{ color: C.text3 }}>Atleta</span>
              <select value={atletaId} onChange={e => onAtletaChange(e.target.value)}
                className="cut-focus arcade-input mt-0.5 w-full bg-transparent px-2 min-h-11 text-2xs font-bold focus:outline-none"
                style={{ clipPath: cut(7), background: C.card, border: `1px solid ${BORDER.neutralSoft}`, color: C.text }}>
                <option value="">Elegir atleta…</option>
                {atletasOrdenados.map(a => (
                  <option key={a.atleta_id} value={a.atleta_id}>
                    {a.nombre}{a.grupo_nombre ? ` · ${a.grupo_nombre}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-3xs" style={{ color: C.text3 }}>Servicio (sugiere precio)</span>
              <select value={servicioId} onChange={e => onServicioChange(e.target.value)}
                className="cut-focus arcade-input mt-0.5 w-full bg-transparent px-2 min-h-11 text-2xs font-bold focus:outline-none"
                style={{ clipPath: cut(7), background: C.card, border: `1px solid ${BORDER.neutralSoft}`, color: C.text }}>
                <option value="">Cargo libre (sin catálogo)</option>
                {servicios.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-3xs" style={{ color: C.text3 }}>Concepto</span>
              <input type="text" value={concepto} onChange={e => setConcepto(e.target.value)}
                placeholder="Ej. Camp julio, Uniforme talla M"
                className="cut-focus arcade-input mt-0.5 w-full bg-transparent px-2 min-h-11 text-2xs font-bold focus:outline-none"
                style={{ clipPath: cut(7), background: C.card, border: `1px solid ${BORDER.neutralSoft}`, color: C.text }} />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-3xs" style={{ color: C.text3 }}>Monto ${sugiriendo ? ' (sugiriendo…)' : ''}</span>
                <input type="number" min="0.01" step="0.01" value={monto} onChange={e => setMonto(e.target.value)}
                  className="cut-focus arcade-input mt-0.5 w-full bg-transparent px-2 min-h-11 text-2xs font-bold focus:outline-none"
                  style={{ clipPath: cut(7), background: C.card, border: `1px solid ${BORDER.neutralSoft}`, color: C.text }} />
              </label>
              <label className="block">
                <span className="text-3xs" style={{ color: C.text3 }}>Vence (opcional)</span>
                <input type="date" value={vencimiento} onChange={e => setVencimiento(e.target.value)}
                  className="cut-focus arcade-input mt-0.5 w-full bg-transparent px-2 min-h-11 text-2xs font-bold focus:outline-none"
                  style={{ clipPath: cut(7), background: C.card, border: `1px solid ${BORDER.neutralSoft}`, color: C.text }} />
              </label>
            </div>
          </div>
          <button onClick={crear} disabled={creando}
            className="cut-focus mt-3 flex items-center gap-2 px-4 min-h-11 text-2xs font-black uppercase tracking-widest disabled:opacity-50 transition"
            style={{ clipPath: cut(8), background: TINT.info, border: `1px solid ${BORDER.info}`, color: C.info }}>
            <Plus size={13} /> {creando ? 'Creando…' : 'Crear cargo'}
          </button>
        </div>

        {/* Lista de cargos existentes */}
        {loading ? (
          <p className="text-center py-6 text-sm font-bold" style={{ color: C.text3 }}>Cargando…</p>
        ) : cargos.length === 0 ? (
          <p className="text-center py-6 text-sm font-bold" style={{ color: C.text3 }}>Sin cargos extra registrados.</p>
        ) : (
          <div className="space-y-2">
            {cargos.map(c => {
              const cfg = ESTADO_CFG[c.estado] || ESTADO_CFG.Pendiente;
              const Icon = cfg.icon;
              const nombre = c.atletas?.usuarios?.nombre || '—';
              return (
                <div key={c.id} className="flex flex-col md:flex-row md:items-center gap-2 px-3 py-2.5"
                  style={{ borderBottom: `1px solid ${BORDER.neutralFaint}` }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold" style={{ color: C.text }}>{nombre}</p>
                    <p className="text-2xs" style={{ color: C.text2 }}>{c.concepto || c.tipo} · <span style={{ color: C.text, fontWeight: 900 }}>${(c.monto_final || 0).toFixed(2)}</span></p>
                  </div>
                  <div className="inline-flex items-center gap-1 px-2 py-1 text-3xs font-black"
                    style={{ clipPath: cut(5), background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.c }}>
                    <Icon size={10} /><span>{c.estado}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {c.estado !== 'Anulado' && c.estado !== 'Pagado' && (
                      <button onClick={() => avisarWhatsApp(c)} aria-label="Avisar por WhatsApp"
                        className="cut-focus p-2 min-w-11 min-h-11 md:min-w-10 md:min-h-10 flex items-center justify-center transition-colors hover:bg-white/[0.06]"
                        style={{ clipPath: cut(5), color: C.whatsapp }}>
                        <MessageSquare size={15} />
                      </button>
                    )}
                    {c.estado !== 'Anulado' && c.estado !== 'Pagado' && (c.monto_pagado || 0) === 0 && (
                      <button onClick={() => anular(c)} aria-label="Anular cargo"
                        className="cut-focus p-2 min-w-11 min-h-11 md:min-w-10 md:min-h-10 flex items-center justify-center transition-colors hover:bg-white/[0.06]"
                        style={{ clipPath: cut(5), color: C.danger }}>
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

      <ModalHUD open={!!modal} {...(modal || {})} onClose={() => setModal(null)} />
    </motion.div>
  );
}
