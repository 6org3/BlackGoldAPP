import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Settings, Landmark, Save, Plus, Trash2, Tag, RefreshCw, Check, ChevronDown, ChevronUp,
} from 'lucide-react';
import {
  fetchClubConfig, upsertClubConfig, fetchCatalogo, upsertServicio,
  toggleServicioActivo, fetchTarifas, upsertTarifa, deleteTarifa, fetchGruposClub,
} from '../api/pagosService';
import { normalizarTelefonoEC } from '../lib/plantillasWhatsApp';
import { CATEGORIAS_FEB } from '../api/utilsAtletas';

const CAMPOS_CONFIG_INICIAL = {
  whatsapp_club: '', cuenta_bancaria_texto: '', dia_vencimiento: 5, descuento_hermanos_pct: 0,
  autogenerar_mensual: false,
};

/**
 * Panel de configuración de pagos del club (solo owner/superadmin; la RLS v27
 * ya respalda la escritura owner-only). Cubre: club_config, catálogo de
 * servicios y tarifas por grupo/categoría FEB/género.
 */
export default function ConfiguracionPagos({ user }) {
  const club = user?.club;
  const [config, setConfig] = useState(CAMPOS_CONFIG_INICIAL);
  const [servicios, setServicios] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [guardandoConfig, setGuardandoConfig] = useState(false);
  const [configOk, setConfigOk] = useState(false);
  const [servicioExpandidoId, setServicioExpandidoId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [cfg, cat, grs] = await Promise.all([
      fetchClubConfig(club), fetchCatalogo(club), fetchGruposClub(),
    ]);
    if (cfg) setConfig({
      whatsapp_club: cfg.whatsapp_club || '',
      cuenta_bancaria_texto: cfg.cuenta_bancaria_texto || '',
      dia_vencimiento: cfg.dia_vencimiento ?? 5,
      descuento_hermanos_pct: cfg.descuento_hermanos_pct ?? 0,
      autogenerar_mensual: cfg.autogenerar_mensual ?? false,
    });
    setServicios(cat);
    setGrupos(grs.filter(g => !club || g.club === club));
    setLoading(false);
  }, [club]);

  useEffect(() => { load(); }, [load]);

  const telInvalido = config.whatsapp_club && !normalizarTelefonoEC(config.whatsapp_club);

  const guardarConfig = async () => {
    if (telInvalido) { alert('El WhatsApp del club no tiene formato ecuatoriano válido (09XXXXXXXX o 5939XXXXXXXX).'); return; }
    setGuardandoConfig(true);
    setConfigOk(false);
    try {
      await upsertClubConfig(club, {
        whatsapp_club: config.whatsapp_club.trim() || null,
        cuenta_bancaria_texto: config.cuenta_bancaria_texto.trim() || null,
        dia_vencimiento: Number(config.dia_vencimiento) || 5,
        descuento_hermanos_pct: Number(config.descuento_hermanos_pct) || 0,
        autogenerar_mensual: !!config.autogenerar_mensual,
      });
      setConfigOk(true);
      setTimeout(() => setConfigOk(false), 2500);
    } catch (e) {
      console.error(e);
      alert(`No se pudo guardar la configuración: ${e.message}`);
    } finally {
      setGuardandoConfig(false);
    }
  };

  const nuevoServicio = async () => {
    const nombre = window.prompt('Nombre del servicio (p. ej. "Small Ball Camp", "Uniforme"):', '');
    if (!nombre?.trim()) return;
    try {
      const creado = await upsertServicio({
        club, nombre: nombre.trim(), recurrencia: 'puntual', precio_base: 0, activo: true,
      });
      setServicios(prev => [...prev, creado].sort((a, b) => a.nombre.localeCompare(b.nombre)));
    } catch (e) { alert(`No se pudo crear el servicio: ${e.message}`); }
  };

  const guardarServicio = async (servicio, campos) => {
    try {
      const actualizado = await upsertServicio({ ...servicio, ...campos });
      setServicios(prev => prev.map(s => s.id === actualizado.id ? actualizado : s));
    } catch (e) { alert(`No se pudo guardar: ${e.message}`); }
  };

  return (
    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
      className="glass-card rounded-panel border border-brand/20 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-black/40 border-b border-white/10">
        <div className="flex items-center space-x-2">
          <Settings size={16} className="text-brand" />
          <h3 className="text-xs font-black uppercase tracking-widest text-brand">Configuración de pagos</h3>
        </div>
        <button onClick={load} aria-label="Recargar" className="p-2 min-w-10 min-h-10 flex items-center justify-center text-fg-muted hover:text-white transition-colors">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="p-4 space-y-6">
        {/* ── Datos del club ─────────────────────────────────────────── */}
        <section>
          <h4 className="text-2xs font-black uppercase tracking-widest text-fg-secondary mb-3 flex items-center gap-2">
            <Landmark size={13} /> Datos del club
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-3xs font-bold uppercase tracking-widest text-fg-muted">WhatsApp del club (recibe avisos)</span>
              <input type="tel" value={config.whatsapp_club} placeholder="0999123456"
                onChange={e => setConfig(c => ({ ...c, whatsapp_club: e.target.value }))}
                className={`mt-1 w-full bg-black/40 border rounded-control px-3 py-2.5 min-h-11 text-sm text-white focus:outline-none ${telInvalido ? 'border-danger/50' : 'border-white/10 focus:border-brand/40'}`} />
              {telInvalido && <span className="text-3xs text-danger-soft">Formato inválido (09XXXXXXXX)</span>}
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-3xs font-bold uppercase tracking-widest text-fg-muted">Día de vencimiento</span>
                <input type="number" min={1} max={28} value={config.dia_vencimiento}
                  onChange={e => setConfig(c => ({ ...c, dia_vencimiento: e.target.value }))}
                  className="mt-1 w-full bg-black/40 border border-white/10 rounded-control px-3 py-2.5 min-h-11 text-sm text-white focus:outline-none focus:border-brand/40" />
              </label>
              <label className="block">
                <span className="text-3xs font-bold uppercase tracking-widest text-fg-muted">% desc. hermanos</span>
                <input type="number" min={0} max={100} value={config.descuento_hermanos_pct}
                  onChange={e => setConfig(c => ({ ...c, descuento_hermanos_pct: e.target.value }))}
                  className="mt-1 w-full bg-black/40 border border-white/10 rounded-control px-3 py-2.5 min-h-11 text-sm text-white focus:outline-none focus:border-brand/40" />
              </label>
            </div>
          </div>
          <label className="block mt-3">
            <span className="text-3xs font-bold uppercase tracking-widest text-fg-muted">Instrucciones de transferencia (las ve el padre)</span>
            <textarea rows={3} value={config.cuenta_bancaria_texto}
              placeholder={'Banco Pichincha · Cuenta Ahorros 2100XXXXXX\nA nombre de: Club Black Gold · RUC/CI: ...\nEnvía tu comprobante desde la app.'}
              onChange={e => setConfig(c => ({ ...c, cuenta_bancaria_texto: e.target.value }))}
              className="mt-1 w-full bg-black/40 border border-white/10 rounded-control px-3 py-2.5 text-sm text-white focus:outline-none focus:border-brand/40 resize-y" />
          </label>
          <label className="flex items-start gap-2.5 mt-3 cursor-pointer">
            <input type="checkbox" checked={config.autogenerar_mensual}
              onChange={e => setConfig(c => ({ ...c, autogenerar_mensual: e.target.checked }))}
              className="mt-0.5 w-4 h-4 accent-brand" />
            <span className="text-2xs text-fg-secondary">
              <span className="font-black text-white">Generar las mensualidades automáticamente</span> el día 1 de cada mes.
              Si está apagado, se generan solo con el botón "Generar Mes".
            </span>
          </label>
          <div className="flex items-center gap-3 mt-3">
            <button onClick={guardarConfig} disabled={guardandoConfig}
              className="flex items-center gap-2 px-4 py-2.5 min-h-11 bg-brand/10 border border-brand/30 text-brand text-2xs font-black rounded-control uppercase tracking-widest hover:bg-brand/20 disabled:opacity-50 transition">
              <Save size={13} />
              {guardandoConfig ? 'Guardando…' : 'Guardar datos del club'}
            </button>
            {configOk && <span className="text-2xs text-success-soft font-bold flex items-center gap-1"><Check size={12} /> Guardado</span>}
          </div>
        </section>

        {/* ── Catálogo de servicios ──────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-2xs font-black uppercase tracking-widest text-fg-secondary flex items-center gap-2">
              <Tag size={13} /> Catálogo de servicios
            </h4>
            <button onClick={nuevoServicio}
              className="flex items-center gap-1.5 px-3 py-2 min-h-10 border border-white/10 rounded-control text-2xs font-black text-fg-secondary hover:text-white transition-colors">
              <Plus size={12} /> Nuevo servicio
            </button>
          </div>

          {loading ? (
            <p className="text-sm text-fg-faint font-bold py-2">Cargando…</p>
          ) : servicios.length === 0 ? (
            <p className="text-sm text-fg-faint font-bold py-2">Sin servicios en el catálogo.</p>
          ) : (
            <div className="space-y-2">
              {servicios.map(s => (
                <ServicioRow
                  key={s.id}
                  servicio={s}
                  grupos={grupos}
                  expandido={servicioExpandidoId === s.id}
                  onToggleExpand={() => setServicioExpandidoId(id => id === s.id ? null : s.id)}
                  onGuardar={guardarServicio}
                  onToggleActivo={async () => {
                    await toggleServicioActivo(s.id, !s.activo);
                    setServicios(prev => prev.map(x => x.id === s.id ? { ...x, activo: !x.activo } : x));
                  }}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </motion.div>
  );
}

// Fila de servicio con edición inline de precio base/recurrencia y editor de tarifas.
function ServicioRow({ servicio, grupos, expandido, onToggleExpand, onGuardar, onToggleActivo }) {
  const [precio, setPrecio] = useState(servicio.precio_base);
  const [recurrencia, setRecurrencia] = useState(servicio.recurrencia);

  const dirty = Number(precio) !== Number(servicio.precio_base) || recurrencia !== servicio.recurrencia;

  return (
    <div className={`border rounded-control ${servicio.activo ? 'border-white/10 bg-black/20' : 'border-white/5 bg-black/10 opacity-60'}`}>
      <div className="flex flex-wrap items-center gap-2 p-3">
        <span className="flex-1 min-w-[8rem] text-sm font-bold text-white">{servicio.nombre}</span>
        <select value={recurrencia} onChange={e => setRecurrencia(e.target.value)}
          className="bg-black/60 border border-white/10 rounded-lg px-2 py-2 min-h-10 text-2xs text-white focus:outline-none">
          <option value="mensual" className="bg-surface-card">mensual</option>
          <option value="puntual" className="bg-surface-card">puntual</option>
        </select>
        <div className="flex items-center gap-1">
          <span className="text-2xs text-fg-muted">base $</span>
          <input type="number" min={0} step="0.01" value={precio} onChange={e => setPrecio(e.target.value)}
            className="w-20 bg-black/60 border border-white/10 rounded-lg px-2 py-2 min-h-10 text-2xs text-white focus:outline-none" />
        </div>
        {dirty && (
          <button onClick={() => onGuardar(servicio, { precio_base: Number(precio), recurrencia })}
            className="px-3 py-2 min-h-10 bg-success/20 border border-success/40 text-success-soft text-2xs font-black rounded-lg">Guardar</button>
        )}
        <button onClick={onToggleActivo}
          className={`px-3 py-2 min-h-10 rounded-lg text-2xs font-black border ${servicio.activo ? 'border-white/10 text-fg-muted hover:text-white' : 'border-success/30 text-success-soft'}`}>
          {servicio.activo ? 'Activo' : 'Inactivo'}
        </button>
        <button onClick={onToggleExpand} aria-label="Tarifas por dimensión"
          className="p-2 min-w-10 min-h-10 flex items-center justify-center text-fg-muted hover:text-white">
          {expandido ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>
      {expandido && <TarifasEditor servicioId={servicio.id} grupos={grupos} precioBase={servicio.precio_base} />}
    </div>
  );
}

// Editor de reglas de precio por grupo / categoría FEB / género.
function TarifasEditor({ servicioId, grupos, precioBase }) {
  const [tarifas, setTarifas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nueva, setNueva] = useState({ grupo_id: '', categoria_feb: '', genero: '', precio: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setTarifas(await fetchTarifas(servicioId));
    setLoading(false);
  }, [servicioId]);
  useEffect(() => { load(); }, [load]);

  const agregar = async () => {
    if (!nueva.precio || Number(nueva.precio) < 0) { alert('Precio inválido.'); return; }
    try {
      await upsertTarifa({
        servicio_id: servicioId,
        grupo_id: nueva.grupo_id || null,
        categoria_feb: nueva.categoria_feb || null,
        genero: nueva.genero || null,
        precio: Number(nueva.precio),
        vigente_desde: new Date().toISOString().split('T')[0],
      });
      setNueva({ grupo_id: '', categoria_feb: '', genero: '', precio: '' });
      load();
    } catch (e) { alert(`No se pudo crear la tarifa: ${e.message}`); }
  };

  const quitar = async (id) => {
    if (!window.confirm('¿Eliminar esta tarifa?')) return;
    try { await deleteTarifa(id); load(); } catch (e) { alert(e.message); }
  };

  const dim = (t) => [
    t.grupos_entrenamiento?.nombre || (t.grupo_id ? 'grupo' : null),
    t.categoria_feb, t.genero,
  ].filter(Boolean).join(' · ') || 'Todos (por defecto)';

  return (
    <div className="border-t border-white/10 p-3 bg-black/20">
      <p className="text-3xs text-fg-muted mb-2">
        Precedencia: grupo &gt; categoría &gt; género &gt; precio base (${Number(precioBase).toFixed(2)}). Una dimensión vacía = "cualquiera".
      </p>
      {loading ? (
        <p className="text-2xs text-fg-faint py-1">Cargando tarifas…</p>
      ) : tarifas.length === 0 ? (
        <p className="text-2xs text-fg-faint py-1">Sin tarifas específicas: se usa el precio base.</p>
      ) : (
        <div className="space-y-1.5 mb-3">
          {tarifas.map(t => (
            <div key={t.id} className="flex items-center justify-between gap-2 px-2 py-1.5 bg-black/30 border border-white/5 rounded-lg">
              <span className="text-2xs text-fg-secondary font-bold">{dim(t)}</span>
              <div className="flex items-center gap-2">
                <span className="text-2xs font-black text-white">${Number(t.precio).toFixed(2)}</span>
                <button onClick={() => quitar(t.id)} aria-label="Eliminar tarifa"
                  className="p-1.5 min-w-9 min-h-9 flex items-center justify-center text-danger-soft/70 hover:text-danger-soft">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Nueva tarifa */}
      <div className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="text-3xs text-fg-muted">Grupo</span>
          <select value={nueva.grupo_id} onChange={e => setNueva(n => ({ ...n, grupo_id: e.target.value }))}
            className="mt-0.5 block bg-black/60 border border-white/10 rounded-lg px-2 py-2 min-h-10 text-2xs text-white focus:outline-none">
            <option value="" className="bg-surface-card">Cualquiera</option>
            {grupos.map(g => <option key={g.id} value={g.id} className="bg-surface-card">{g.nombre}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-3xs text-fg-muted">Categoría</span>
          <select value={nueva.categoria_feb} onChange={e => setNueva(n => ({ ...n, categoria_feb: e.target.value }))}
            className="mt-0.5 block bg-black/60 border border-white/10 rounded-lg px-2 py-2 min-h-10 text-2xs text-white focus:outline-none">
            <option value="" className="bg-surface-card">Cualquiera</option>
            {CATEGORIAS_FEB.map(c => <option key={c} value={c} className="bg-surface-card">{c}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-3xs text-fg-muted">Género</span>
          <select value={nueva.genero} onChange={e => setNueva(n => ({ ...n, genero: e.target.value }))}
            className="mt-0.5 block bg-black/60 border border-white/10 rounded-lg px-2 py-2 min-h-10 text-2xs text-white focus:outline-none">
            <option value="" className="bg-surface-card">Cualquiera</option>
            <option value="Masculino" className="bg-surface-card">Masculino</option>
            <option value="Femenino" className="bg-surface-card">Femenino</option>
          </select>
        </label>
        <label className="block">
          <span className="text-3xs text-fg-muted">Precio $</span>
          <input type="number" min={0} step="0.01" value={nueva.precio} onChange={e => setNueva(n => ({ ...n, precio: e.target.value }))}
            className="mt-0.5 block w-20 bg-black/60 border border-white/10 rounded-lg px-2 py-2 min-h-10 text-2xs text-white focus:outline-none" />
        </label>
        <button onClick={agregar}
          className="flex items-center gap-1 px-3 py-2 min-h-10 bg-brand/10 border border-brand/30 text-brand text-2xs font-black rounded-lg hover:bg-brand/20 transition">
          <Plus size={12} /> Agregar
        </button>
      </div>
    </div>
  );
}
