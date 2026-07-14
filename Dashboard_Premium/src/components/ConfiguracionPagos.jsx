import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Settings, Landmark, Save, Plus, Trash2, Tag, RefreshCw, Check, ChevronDown, ChevronUp, AlertTriangle,
} from 'lucide-react';
import {
  fetchClubConfig, upsertClubConfig, fetchCatalogo, upsertServicio,
  toggleServicioActivo, fetchTarifas, upsertTarifa, deleteTarifa, fetchGruposClub,
} from '../api/pagosService';
import { normalizarTelefonoEC } from '../lib/plantillasWhatsApp';
import { CATEGORIAS_FEB } from '../api/utilsAtletas';
import ModalHUD from './arcade/ModalHUD';
import { C, BORDER, GRAD, TINT, cut } from './arcade/arcadeTokens';

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
  // Diálogo HUD activo (reemplaza prompt/alert nativos): null | { variant, ... }.
  const [modal, setModal] = useState(null);

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
    if (telInvalido) {
      setModal({ variant: 'alert', tone: 'danger', icon: AlertTriangle, eyebrow: 'Validación', title: 'Teléfono inválido', message: 'El WhatsApp del club no tiene formato ecuatoriano válido (09XXXXXXXX o 5939XXXXXXXX).' });
      return;
    }
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
      setModal({ variant: 'alert', tone: 'danger', icon: AlertTriangle, eyebrow: 'Error', title: 'No se pudo guardar la configuración', message: e.message });
    } finally {
      setGuardandoConfig(false);
    }
  };

  const nuevoServicio = () => {
    setModal({
      variant: 'prompt', tone: 'gold', icon: Tag, eyebrow: 'Catálogo',
      title: 'Nuevo servicio', message: 'P. ej. "Small Ball Camp", "Uniforme".',
      placeholder: 'Nombre del servicio', confirmLabel: 'Crear',
      onConfirm: (nombre) => { setModal(null); crearServicio(nombre); },
    });
  };

  const crearServicio = async (nombre) => {
    try {
      const creado = await upsertServicio({
        club, nombre: nombre.trim(), recurrencia: 'puntual', precio_base: 0, activo: true,
      });
      setServicios(prev => [...prev, creado].sort((a, b) => a.nombre.localeCompare(b.nombre)));
    } catch (e) {
      setModal({ variant: 'alert', tone: 'danger', icon: AlertTriangle, eyebrow: 'Error', title: 'No se pudo crear el servicio', message: e.message });
    }
  };

  const guardarServicio = async (servicio, campos) => {
    try {
      const actualizado = await upsertServicio({ ...servicio, ...campos });
      setServicios(prev => prev.map(s => s.id === actualizado.id ? actualizado : s));
    } catch (e) {
      setModal({ variant: 'alert', tone: 'danger', icon: AlertTriangle, eyebrow: 'Error', title: 'No se pudo guardar', message: e.message });
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      style={{ background: C.card, border: `1px solid ${BORDER.gold16}`, clipPath: cut(12), overflow: 'hidden' }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ background: C.cardAlt1, borderBottom: `1px solid ${BORDER.neutral}` }}>
        <div className="flex items-center space-x-2">
          <Settings size={16} style={{ color: C.gold }} />
          <h3 className="text-xs font-black uppercase tracking-widest" style={{ color: C.gold }}>Configuración de pagos</h3>
        </div>
        <button onClick={load} aria-label="Recargar" className="cut-focus p-2 min-w-11 min-h-11 md:min-w-10 md:min-h-10 flex items-center justify-center transition-colors" style={{ color: C.text3 }}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="p-4 space-y-6">
        {/* ── Datos del club ─────────────────────────────────────────── */}
        <section>
          <h4 className="text-2xs font-black uppercase tracking-widest mb-3 flex items-center gap-2" style={{ color: C.text2 }}>
            <Landmark size={13} /> Datos del club
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-3xs font-bold uppercase tracking-widest" style={{ color: C.text3 }}>WhatsApp del club (recibe avisos)</span>
              <input type="tel" value={config.whatsapp_club} placeholder="0999123456"
                onChange={e => setConfig(c => ({ ...c, whatsapp_club: e.target.value }))}
                className="cut-focus arcade-input mt-1 w-full bg-transparent px-3 min-h-11 text-sm font-bold focus:outline-none"
                style={{ clipPath: cut(7), background: C.cardAlt1, border: `1px solid ${telInvalido ? BORDER.danger : BORDER.neutralSoft}`, color: C.text }} />
              {telInvalido && <span className="text-3xs" role="alert" style={{ color: C.danger }}>Formato inválido (09XXXXXXXX)</span>}
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-3xs font-bold uppercase tracking-widest" style={{ color: C.text3 }}>Día de vencimiento</span>
                <input type="number" min={1} max={28} value={config.dia_vencimiento}
                  onChange={e => setConfig(c => ({ ...c, dia_vencimiento: e.target.value }))}
                  className="cut-focus arcade-input mt-1 w-full bg-transparent px-3 min-h-11 text-sm font-bold focus:outline-none"
                  style={{ clipPath: cut(7), background: C.cardAlt1, border: `1px solid ${BORDER.neutralSoft}`, color: C.text }} />
              </label>
              <label className="block">
                <span className="text-3xs font-bold uppercase tracking-widest" style={{ color: C.text3 }}>% desc. hermanos</span>
                <input type="number" min={0} max={100} value={config.descuento_hermanos_pct}
                  onChange={e => setConfig(c => ({ ...c, descuento_hermanos_pct: e.target.value }))}
                  className="cut-focus arcade-input mt-1 w-full bg-transparent px-3 min-h-11 text-sm font-bold focus:outline-none"
                  style={{ clipPath: cut(7), background: C.cardAlt1, border: `1px solid ${BORDER.neutralSoft}`, color: C.text }} />
              </label>
            </div>
          </div>
          <label className="block mt-3">
            <span className="text-3xs font-bold uppercase tracking-widest" style={{ color: C.text3 }}>Instrucciones de transferencia (las ve el padre)</span>
            <textarea rows={3} value={config.cuenta_bancaria_texto}
              placeholder={'Banco Pichincha · Cuenta Ahorros 2100XXXXXX\nA nombre de: Club Black Gold · RUC/CI: ...\nEnvía tu comprobante desde la app.'}
              onChange={e => setConfig(c => ({ ...c, cuenta_bancaria_texto: e.target.value }))}
              className="cut-focus arcade-input mt-1 w-full bg-transparent px-3 py-2.5 text-sm font-bold focus:outline-none resize-y"
              style={{ clipPath: cut(7), background: C.cardAlt1, border: `1px solid ${BORDER.neutralSoft}`, color: C.text }} />
          </label>
          <label className="flex items-start gap-2.5 mt-3 cursor-pointer">
            <input type="checkbox" checked={config.autogenerar_mensual}
              onChange={e => setConfig(c => ({ ...c, autogenerar_mensual: e.target.checked }))}
              className="mt-0.5 w-4 h-4" style={{ accentColor: C.gold }} />
            <span className="text-2xs" style={{ color: C.text2 }}>
              <span className="font-black" style={{ color: C.text }}>Generar las mensualidades automáticamente</span> el día 1 de cada mes.
              Si está apagado, se generan solo con el botón "Generar Mes".
            </span>
          </label>
          <div className="flex items-center gap-3 mt-3">
            <button onClick={guardarConfig} disabled={guardandoConfig}
              className="cut-focus flex items-center gap-2 px-4 min-h-11 text-2xs font-black uppercase tracking-widest disabled:opacity-50 transition"
              style={{ clipPath: cut(8), background: GRAD.goldCTA, border: 'none', color: C.ink }}>
              <Save size={13} />
              {guardandoConfig ? 'Guardando…' : 'Guardar datos del club'}
            </button>
            {configOk && <span className="text-2xs font-bold flex items-center gap-1" style={{ color: C.ok }}><Check size={12} /> Guardado</span>}
          </div>
        </section>

        {/* ── Catálogo de servicios ──────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-2xs font-black uppercase tracking-widest flex items-center gap-2" style={{ color: C.text2 }}>
              <Tag size={13} /> Catálogo de servicios
            </h4>
            <button onClick={nuevoServicio}
              className="cut-focus flex items-center gap-1.5 px-3 min-h-11 md:min-h-10 text-2xs font-black transition-colors"
              style={{ clipPath: cut(7), background: 'transparent', border: `1px solid ${BORDER.neutralSoft}`, color: C.text2 }}>
              <Plus size={12} /> Nuevo servicio
            </button>
          </div>

          {loading ? (
            <p className="text-sm font-bold py-2" style={{ color: C.text3 }}>Cargando…</p>
          ) : servicios.length === 0 ? (
            <p className="text-sm font-bold py-2" style={{ color: C.text3 }}>Sin servicios en el catálogo.</p>
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

      <ModalHUD open={!!modal} {...(modal || {})} onClose={() => setModal(null)} />
    </motion.div>
  );
}

// Fila de servicio con edición inline de precio base/recurrencia y editor de tarifas.
function ServicioRow({ servicio, grupos, expandido, onToggleExpand, onGuardar, onToggleActivo }) {
  const [precio, setPrecio] = useState(servicio.precio_base);
  const [recurrencia, setRecurrencia] = useState(servicio.recurrencia);

  const dirty = Number(precio) !== Number(servicio.precio_base) || recurrencia !== servicio.recurrencia;

  return (
    <div style={{ clipPath: cut(8), background: C.cardAlt1, border: `1px solid ${servicio.activo ? BORDER.neutral : BORDER.neutralFaint}`, opacity: servicio.activo ? 1 : 0.6 }}>
      <div className="flex flex-wrap items-center gap-2 p-3">
        <span className="flex-1 min-w-[8rem] text-sm font-bold" style={{ color: C.text }}>{servicio.nombre}</span>
        <select value={recurrencia} onChange={e => setRecurrencia(e.target.value)}
          className="cut-focus arcade-input px-2 min-h-11 md:min-h-10 text-2xs font-bold focus:outline-none"
          style={{ clipPath: cut(7), background: C.card, border: `1px solid ${BORDER.neutralSoft}`, color: C.text }}>
          <option value="mensual">mensual</option>
          <option value="puntual">puntual</option>
        </select>
        <div className="flex items-center gap-1">
          <span className="text-2xs" style={{ color: C.text3 }}>base $</span>
          <input type="number" min={0} step="0.01" value={precio} onChange={e => setPrecio(e.target.value)}
            className="cut-focus arcade-input w-20 px-2 min-h-11 md:min-h-10 text-2xs font-bold focus:outline-none"
            style={{ clipPath: cut(7), background: C.card, border: `1px solid ${BORDER.neutralSoft}`, color: C.text }} />
        </div>
        {dirty && (
          <button onClick={() => onGuardar(servicio, { precio_base: Number(precio), recurrencia })}
            className="cut-focus px-3 min-h-11 md:min-h-10 text-2xs font-black"
            style={{ clipPath: cut(7), background: TINT.ok, border: `1px solid ${BORDER.okStrong}`, color: C.ok }}>Guardar</button>
        )}
        {/* role=switch + aria-label estable: el texto visible es solo el estado
            actual ("Activo"/"Inactivo") y sin esto un lector de pantalla no
            puede saber que el botón CONMUTA el servicio en el catálogo. */}
        <button onClick={onToggleActivo}
          role="switch" aria-checked={servicio.activo}
          aria-label={`Servicio ${servicio.nombre} activo`}
          className="cut-focus px-3 min-h-11 md:min-h-10 text-2xs font-black"
          style={servicio.activo
            ? { clipPath: cut(7), border: `1px solid ${BORDER.neutralSoft}`, color: C.text3 }
            : { clipPath: cut(7), border: `1px solid ${BORDER.okSoft}`, color: C.ok }}>
          {servicio.activo ? 'Activo' : 'Inactivo'}
        </button>
        <button onClick={onToggleExpand} aria-label="Tarifas por dimensión"
          className="cut-focus p-2 min-w-11 min-h-11 md:min-w-10 md:min-h-10 flex items-center justify-center" style={{ color: C.text3 }}>
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
  // Diálogo HUD activo (reemplaza confirm/alert nativos): null | { variant, ... }.
  const [modal, setModal] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setTarifas(await fetchTarifas(servicioId));
    setLoading(false);
  }, [servicioId]);
  useEffect(() => { load(); }, [load]);

  const agregar = async () => {
    if (!nueva.precio || Number(nueva.precio) < 0) {
      setModal({ variant: 'alert', tone: 'danger', icon: AlertTriangle, eyebrow: 'Validación', title: 'Precio inválido', message: 'Ingresa un precio válido (mayor o igual a 0).' });
      return;
    }
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
    } catch (e) {
      setModal({ variant: 'alert', tone: 'danger', icon: AlertTriangle, eyebrow: 'Error', title: 'No se pudo crear la tarifa', message: e.message });
    }
  };

  const quitar = (id) => {
    setModal({
      variant: 'confirm', tone: 'danger', icon: Trash2,
      eyebrow: 'Acción irreversible', title: 'Eliminar tarifa',
      message: '¿Eliminar esta tarifa? El servicio volverá a usar la regla siguiente en precedencia o el precio base.',
      confirmLabel: 'Eliminar',
      onConfirm: async () => {
        setModal(null);
        try { await deleteTarifa(id); load(); }
        catch (e) { setModal({ variant: 'alert', tone: 'danger', icon: AlertTriangle, eyebrow: 'Error', title: 'No se pudo eliminar', message: e.message }); }
      },
    });
  };

  const dim = (t) => [
    t.grupos_entrenamiento?.nombre || (t.grupo_id ? 'grupo' : null),
    t.categoria_feb, t.genero,
  ].filter(Boolean).join(' · ') || 'Todos (por defecto)';

  return (
    <div className="p-3" style={{ borderTop: `1px solid ${BORDER.neutral}`, background: C.cardAlt2 }}>
      <p className="text-3xs mb-2" style={{ color: C.text3 }}>
        Precedencia: grupo &gt; categoría &gt; género &gt; precio base (${Number(precioBase).toFixed(2)}). Una dimensión vacía = "cualquiera".
      </p>
      {loading ? (
        <p className="text-2xs py-1" style={{ color: C.text3 }}>Cargando tarifas…</p>
      ) : tarifas.length === 0 ? (
        <p className="text-2xs py-1" style={{ color: C.text3 }}>Sin tarifas específicas: se usa el precio base.</p>
      ) : (
        <div className="space-y-1.5 mb-3">
          {tarifas.map(t => (
            <div key={t.id} className="flex items-center justify-between gap-2 px-2 py-1.5" style={{ clipPath: cut(6), background: C.card, border: `1px solid ${BORDER.neutralFaint}` }}>
              <span className="text-2xs font-bold" style={{ color: C.text2 }}>{dim(t)}</span>
              <div className="flex items-center gap-2">
                <span className="text-2xs font-black" style={{ color: C.text }}>${Number(t.precio).toFixed(2)}</span>
                <button onClick={() => quitar(t.id)} aria-label="Eliminar tarifa"
                  className="cut-focus p-1.5 min-w-11 min-h-11 md:min-w-9 md:min-h-9 flex items-center justify-center opacity-70 hover:opacity-100 transition-opacity" style={{ color: C.danger }}>
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
          <span className="text-3xs" style={{ color: C.text3 }}>Grupo</span>
          <select value={nueva.grupo_id} onChange={e => setNueva(n => ({ ...n, grupo_id: e.target.value }))}
            className="cut-focus arcade-input mt-0.5 block px-2 min-h-11 md:min-h-10 text-2xs font-bold focus:outline-none"
            style={{ clipPath: cut(7), background: C.card, border: `1px solid ${BORDER.neutralSoft}`, color: C.text }}>
            <option value="">Cualquiera</option>
            {grupos.map(g => <option key={g.id} value={g.id}>{g.nombre}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-3xs" style={{ color: C.text3 }}>Categoría</span>
          <select value={nueva.categoria_feb} onChange={e => setNueva(n => ({ ...n, categoria_feb: e.target.value }))}
            className="cut-focus arcade-input mt-0.5 block px-2 min-h-11 md:min-h-10 text-2xs font-bold focus:outline-none"
            style={{ clipPath: cut(7), background: C.card, border: `1px solid ${BORDER.neutralSoft}`, color: C.text }}>
            <option value="">Cualquiera</option>
            {CATEGORIAS_FEB.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-3xs" style={{ color: C.text3 }}>Género</span>
          <select value={nueva.genero} onChange={e => setNueva(n => ({ ...n, genero: e.target.value }))}
            className="cut-focus arcade-input mt-0.5 block px-2 min-h-11 md:min-h-10 text-2xs font-bold focus:outline-none"
            style={{ clipPath: cut(7), background: C.card, border: `1px solid ${BORDER.neutralSoft}`, color: C.text }}>
            <option value="">Cualquiera</option>
            <option value="Masculino">Masculino</option>
            <option value="Femenino">Femenino</option>
          </select>
        </label>
        <label className="block">
          <span className="text-3xs" style={{ color: C.text3 }}>Precio $</span>
          <input type="number" min={0} step="0.01" value={nueva.precio} onChange={e => setNueva(n => ({ ...n, precio: e.target.value }))}
            className="cut-focus arcade-input mt-0.5 block w-20 px-2 min-h-11 md:min-h-10 text-2xs font-bold focus:outline-none"
            style={{ clipPath: cut(7), background: C.card, border: `1px solid ${BORDER.neutralSoft}`, color: C.text }} />
        </label>
        <button onClick={agregar}
          className="cut-focus flex items-center gap-1 px-3 min-h-11 md:min-h-10 text-2xs font-black transition"
          style={{ clipPath: cut(7), background: TINT.gold, border: `1px solid ${BORDER.goldMid}`, color: C.gold }}>
          <Plus size={12} /> Agregar
        </button>
      </div>

      <ModalHUD open={!!modal} {...(modal || {})} onClose={() => setModal(null)} />
    </div>
  );
}
