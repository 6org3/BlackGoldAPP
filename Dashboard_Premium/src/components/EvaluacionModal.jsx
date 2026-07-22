import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ClipboardCheck, Save, Loader2, CheckCircle2, ChevronLeft } from 'lucide-react';
import { normalizarValor, resolverUmbrales, categoriaABucketBaremo } from '../lib/baremosEngine';
import { SUB_PILARES, labelPilar, labelSubPilar } from '../../../packages/analytics-core/taxonomia.js';
import { supabase } from '../api/supabaseClient';
import { TABLA_PRUEBAS_EVALUACION } from '../api/tablas';
import { recalcularOverall } from '../api/evaluacionesService';
import { useAuth } from '../AuthContext';
import NuevaPruebaModal from './NuevaPruebaModal';

// ─── PILAR DISPLAY CONFIG ──────────────────────────────────
// La etiqueta viene de la taxonomía compartida (analytics-core/taxonomia.js); el ícono
// es presentación local de este modal.
const PILAR_LABELS = {
  fisico: { label: labelPilar('fisico'), icon: '💪' },
  tecnico: { label: labelPilar('tecnico'), icon: '🏀' },
  mental: { label: labelPilar('mental'), icon: '🧠' },
};

const TREN_LABELS = {
  inferior: 'Tren Inferior',
  superior: 'Tren Superior',
  null: null,
};

// Pestañas de objetivo: la membresía deriva de la taxonomía compartida (SUB_PILARES
// + 'recuperacion' de monitoreo al final) y el `label` con labelSubPilar;
// ícono/colores son presentación local por key, con estilo default de fallback
// para sub-pilares nuevos sin identidad asignada aún.
const PRESENTACION = {
  fuerza:       { icon: '💪', border: 'border-danger/30',     bgActive: 'bg-danger/20',     text: 'text-danger-soft' },
  explosividad: { icon: '🚀', border: 'border-caution/30',    bgActive: 'bg-caution/20',    text: 'text-caution-soft' },
  resistencia:  { icon: '🏃', border: 'border-teal-500/30',   bgActive: 'bg-teal-500/20',   text: 'text-teal-400' },
  movilidad:    { icon: '🤸', border: 'border-success/30',    bgActive: 'bg-success/20',    text: 'text-success-soft' },
  tiro:         { icon: '🎯', border: 'border-cyan-500/30',   bgActive: 'bg-cyan-500/20',   text: 'text-cyan-400' },
  agilidad:     { icon: '⚡', border: 'border-yellow-500/30', bgActive: 'bg-yellow-500/20', text: 'text-yellow-400' },
  tactica:      { icon: '🧠', border: 'border-mental/30',     bgActive: 'bg-mental/20',     text: 'text-mental-soft' },
  resiliencia:  { icon: '🛡️', border: 'border-pink-500/30',   bgActive: 'bg-pink-500/20',   text: 'text-pink-400' },
  recuperacion: { icon: '🔋', border: 'border-info/30',       bgActive: 'bg-info/20',       text: 'text-info-soft' },
};
const PRESENTACION_DEFAULT = { icon: '📈', border: 'border-white/10', bgActive: 'bg-white/10', text: 'text-fg-secondary' };

const OBJETIVOS = [
  { id: 'todas', label: 'Todas', icon: '📋', filter: () => true, border: 'border-gray-500/30', bgActive: 'bg-gray-500/20', text: 'text-fg-secondary' },
  ...[...SUB_PILARES.map(s => s.key), 'recuperacion'].map((id) => ({
    id,
    label: labelSubPilar(id),
    filter: (b) => b.sub_pilar === id,
    ...(PRESENTACION[id] || PRESENTACION_DEFAULT),
  })),
];

// Salvaguarda defensiva: si catalogo_ejercicios llegara a tener filas
// duplicadas por nombre (p.ej. por un seed reintroducido), se queda con una
// sola por nombre, priorizando la que tiene baremo_key asignado (canónica).
function dedupePorNombre(filas) {
  const porNombre = new Map();
  for (const fila of filas) {
    const existente = porNombre.get(fila.nombre);
    if (!existente || (!existente.baremo_key && fila.baremo_key)) {
      porNombre.set(fila.nombre, fila);
    }
  }
  return [...porNombre.values()];
}

// ─── Tier badge renderer ────────────────────────────────────
// A nivel de módulo: definido dentro del componente su identidad cambiaba en
// cada render y React lo remontaba (re-disparando las animaciones) con cada
// tecla del input de valores.
const TierBadge = ({ tier, tierConfig, puntuacion }) => (
  <motion.div
    initial={{ scale: 0.8, opacity: 0 }}
    animate={{ scale: 1, opacity: 1 }}
    className="flex flex-col items-center gap-2 p-4 rounded-panel bg-white/[0.03] border border-white/10"
  >
    <span className="text-3xs font-bold uppercase tracking-widest text-fg-muted">
      Resultado
    </span>
    <div className="flex items-center gap-3">
      <span className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider ${tierConfig.bg} ${tier === 'above_avg' ? 'text-black' : 'text-white'}`}>
        {tierConfig.label}
      </span>
      <span className="text-2xl font-black text-white">
        {puntuacion}
        <span className="text-sm text-fg-muted font-medium">/100</span>
      </span>
    </div>
    <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden mt-1">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${puntuacion}%` }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        className={`h-full rounded-full ${tierConfig.bg}`}
      />
    </div>
  </motion.div>
);

// ─── COMPONENT ──────────────────────────────────────────────
export default function EvaluacionModal({ atleta, onClose, onSaved }) {
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState(user?.rol === 'atleta' ? 'recuperacion' : 'todas');
  const [pruebaTipo, setPruebaTipo] = useState(''); // this will store the catalog ID
  const [searchQuery, setSearchQuery] = useState(''); // Estado para la barra de búsqueda
  const [valoresCrudos, setValoresCrudos] = useState({});
  const [notas, setNotas] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  
  const [catalogoEjercicios, setCatalogoEjercicios] = useState([]);
  const [loadingCatalogo, setLoadingCatalogo] = useState(true);
  const [showNuevaPruebaModal, setShowNuevaPruebaModal] = useState(false);

  useEffect(() => {
    loadCatalogo();
  }, [user]);

  // Bloquea el scroll del fondo mientras el modal está abierto (iOS scrollea el body detrás)
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const loadCatalogo = async () => {
    setLoadingCatalogo(true);
    try {
      const { data, error } = await supabase
        .from(TABLA_PRUEBAS_EVALUACION)
        .select('*');
      if (data && !error) {
        setCatalogoEjercicios(dedupePorNombre(data));
      }
    } catch (err) {
      console.error(err);
    }
    setLoadingCatalogo(false);
  };

  // ─── Derived state ────────────────────────────────────────
  const activeFilter = OBJETIVOS.find(o => o.id === activeTab)?.filter || (() => true);

  const pruebasFiltradas = useMemo(() => {
    return catalogoEjercicios.filter(p => {
      const matchesTab = activeFilter(p);
      const matchesSearch = p.nombre.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesTab && matchesSearch;
    });
  }, [catalogoEjercicios, activeFilter, searchQuery]);

  const selectedBaremo = useMemo(() => {
    return catalogoEjercicios.find(e => e.id === pruebaTipo) || null;
  }, [pruebaTipo, catalogoEjercicios]);

  // Check if the athlete's category has thresholds for this test.
  // Debe usar el MISMO mapeo FEB→bucket que normalizarValor (categoriaABucketBaremo),
  // si no, categorías FEB con guión ("Menores (Sub-14)", "Prejuvenil (Sub-16)") nunca
  // coincidían con las llaves de baremo (Sub12/Sub15/Sub18/Senior) y el aviso "no tiene
  // baremo" salía aunque sí existiera el umbral. Ver packages/analytics-core/baremos.js.
  const categoryAvailable = useMemo(() => {
    if (!selectedBaremo) return true;
    const cat = atleta?.categoria || 'Todas';
    const thresholds = selectedBaremo.thresholds || {};
    const catKey = categoriaABucketBaremo(cat)
      || Object.keys(thresholds).find(k => cat.includes(k))
      || 'Sub15';
    // resolverUmbrales entiende TODAS las convenciones del catálogo (bucket→array,
    // por nivel de desarrollo, por género, 'Todas', tiers legacy) — el check anterior
    // (Array.isArray(thresholds[catKey])) marcaba "no hay baremo" en pruebas anidadas
    // que sí lo tenían. Debe usar el MISMO resolver que normalizarValor.
    return resolverUmbrales(thresholds, {
      bucket: catKey,
      nivelDesarrollo: atleta?.nivel_desarrollo ?? null,
      genero: atleta?.genero ?? null,
    }) !== null;
  }, [selectedBaremo, atleta]);

  // Real-time normalization preview
  const preview = useMemo(() => {
    const cat = atleta?.categoria || 'Todas';
    if (!pruebaTipo || !selectedBaremo) return null;
    
    let vals = [];
    if (selectedBaremo?.inputs_requeridos) {
      for (const input of selectedBaremo.inputs_requeridos) {
        if (!valoresCrudos[input.id] || valoresCrudos[input.id] === '') return null;
        vals.push(parseFloat(valoresCrudos[input.id]));
      }
    } else {
      if (!valoresCrudos['unico'] || valoresCrudos['unico'] === '') return null;
      vals.push(parseFloat(valoresCrudos['unico']));
    }
    
    if (vals.some(isNaN)) return null;
    
    // Convert boolean to 'menos_es_mejor' / 'mas_es_mejor' string if needed by legacy engine
    // normalizarValor expects baremoObj. So we just pass selectedBaremo, but we ensure it has .tipo
    const baremoParam = {
      ...selectedBaremo,
      tipo: selectedBaremo.invertido ? 'menos_es_mejor' : 'mas_es_mejor',
      label: selectedBaremo.nombre
    };
    
    // El perfil (nivel de desarrollo / género) solo influye si los umbrales de la
    // prueba están segmentados por esas dimensiones (ver resolverUmbrales, P1.5).
    return normalizarValor(baremoParam, vals, cat, {
      nivel_desarrollo: atleta?.nivel_desarrollo ?? null,
      genero: atleta?.genero ?? null,
    });
  }, [pruebaTipo, valoresCrudos, atleta, selectedBaremo]);

  // Is valid for submit?
  const isFormValid = useMemo(() => {
    if (!pruebaTipo || !preview || preview.noAplica) return false;
    if (selectedBaremo?.inputs_requeridos) {
      return selectedBaremo.inputs_requeridos.every(i => valoresCrudos[i.id] !== undefined && valoresCrudos[i.id] !== '');
    }
    return valoresCrudos['unico'] !== undefined && valoresCrudos['unico'] !== '';
  }, [pruebaTipo, preview, selectedBaremo, valoresCrudos]);

  // ─── Submit handler ───────────────────────────────────────
  const handleSubmit = async () => {
    if (!isFormValid || saving) return;
    setSaving(true);
    setError('');

    try {
      const { puntuacion, tier } = preview;
      const registros = [];

      if (selectedBaremo.inputs_requeridos) {
        for (const input of selectedBaremo.inputs_requeridos) {
          registros.push({
            atleta_id: atleta.atleta_id || atleta.id,
            prueba_tipo: selectedBaremo.nombre, // Save readable name
            valor_crudo: parseFloat(valoresCrudos[input.id]),
            lado: input.id,
            unidad: selectedBaremo.unidad,
            pilar: selectedBaremo.pilar,
            sub_pilar: selectedBaremo.sub_pilar,
            tren: selectedBaremo.tren || null,
            tier,
            puntuacion_normalizada: puntuacion,
            notas: notas.trim() || null,
            registrado_por: user?.id || null,
          });
        }
      } else {
        registros.push({
          atleta_id: atleta.atleta_id || atleta.id,
          prueba_tipo: selectedBaremo.nombre,
          valor_crudo: parseFloat(valoresCrudos['unico']),
          lado: 'unico',
          unidad: selectedBaremo.unidad,
          pilar: selectedBaremo.pilar,
          sub_pilar: selectedBaremo.sub_pilar,
          tren: selectedBaremo.tren || null,
          tier,
          puntuacion_normalizada: puntuacion,
          notas: notas.trim() || null,
          registrado_por: user?.id || null,
        });
      }

      const { error: dbError } = await supabase
        .from('evaluaciones_pruebas')
        .insert(registros);

      if (dbError) throw dbError;

      // Cierra el loop evaluación → misión → XP: recalcula overall/rango del
      // atleta y dispara la generación de misiones (Edge Function). No
      // bloqueante: si el recálculo falla, la evaluación ya quedó guardada.
      try {
        await recalcularOverall(atleta.atleta_id || atleta.id);
      } catch (recalcError) {
        console.error('Error al recalcular el overall tras guardar la evaluación:', recalcError);
      }

      setSaved(true);
      setTimeout(() => {
        onSaved?.(registros);
        onClose();
      }, 1800);
    } catch (err) {
      console.error('Error saving evaluation:', err);
      setError(err.message || 'Error al guardar la evaluación');
    }
    setSaving(false);
  };

  // Portalizado a document.body: si se renderiza anidado (p.ej. dentro del modal de
  // perfil del atleta, cuyo glass-card tiene backdrop-filter), ese ancestro crea un
  // containing block que atrapa el `position: fixed` y descuadra el modal fuera de
  // pantalla en móvil (h-dvh centrado contra un contenedor más alto que el viewport).
  return createPortal(
    <>
      <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[110] flex items-center justify-center p-0 md:p-4 bg-black/90 md:bg-black/80 md:backdrop-blur-sm"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          initial={{ scale: 0.9, y: 30, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.9, y: 30, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="w-full max-w-xl bg-surface-base rounded-none md:rounded-card border border-brand/30 shadow-[0_0_60px_rgba(255,215,0,0.12)] overflow-hidden flex flex-col h-dvh md:h-auto md:max-h-[90vh] pt-[env(safe-area-inset-top)] md:pt-0"
        >
          {/* ─── Header ──────────────────────────────────────── */}
          <div className="p-4 border-b border-white/10 flex justify-between items-center bg-gradient-to-r from-brand/10 to-transparent">
            <div className="flex items-center space-x-2">
              <ClipboardCheck className="text-brand" size={20} />
              <div>
                <h2 className="text-lg font-black text-white uppercase tracking-tight">
                  Evaluación Científica
                </h2>
                <p className="text-2xs text-brand/70 font-bold uppercase tracking-widest">
                  {atleta?.nombre} · {atleta?.categoria}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Cerrar evaluación"
              className="text-fg-secondary hover:text-white bg-white/5 hover:bg-white/10 p-2.5 rounded-full transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* ─── Body ────────────────────────────────────────── */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <AnimatePresence mode="wait">
              {saved ? (
                /* ─── Success state ─────────────────────────── */
                <motion.div
                  key="success"
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="flex flex-col items-center justify-center py-12 space-y-4 h-full"
                >
                  <div className="w-16 h-16 bg-success/20 text-success-soft rounded-full flex items-center justify-center">
                    <CheckCircle2 size={32} />
                  </div>
                  <p className="text-success-soft font-bold uppercase tracking-widest text-sm">
                    Evaluación guardada
                  </p>
                  {preview && !preview.noAplica && (
                    <p className={`text-lg font-black ${preview.tierConfig.color}`}>
                      {preview.tierConfig.label} — {preview.puntuacion}/100
                    </p>
                  )}
                </motion.div>
              ) : !pruebaTipo ? (
                <motion.div key="selector" className="flex flex-col h-full">
                  {/* Search and Action Bar */}
                  <div className="flex px-4 pt-4 pb-2 gap-2 items-center">
                    <input
                      type="search"
                      autoComplete="off"
                      placeholder="Buscar ejercicio..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-control px-4 py-2 text-base md:text-sm text-white placeholder-gray-500 focus:outline-none focus:border-brand/50"
                    />
                    {user?.rol !== 'atleta' && (
                      <button
                        onClick={() => setShowNuevaPruebaModal(true)}
                        className="bg-brand/10 text-brand border border-brand/30 hover:bg-brand/20 px-4 py-2 rounded-control text-xs font-bold uppercase tracking-widest transition-colors flex-shrink-0"
                      >
                        + Nueva Prueba
                      </button>
                    )}
                  </div>

                  {/* Objetivos: chips que envuelven en varias filas (antes era una barra
                      con overflow-x horizontal que en móvil obligaba a un swipe incómodo). */}
                  <div className="flex flex-wrap px-3 pt-2 pb-3 gap-2 border-b border-white/5">
                    {OBJETIVOS.filter(obj => {
                      if (user?.rol === 'atleta') {
                        return obj.id === 'recuperacion';
                      }
                      if (obj.id === 'recuperacion') {
                        const day = new Date().getDay();
                        return day === 5 || day === 6 || day === 0; // Viernes, Sábado, Domingo
                      }
                      return true;
                    }).map(obj => (
                      <button
                        key={obj.id}
                        onClick={() => setActiveTab(obj.id)}
                        aria-pressed={activeTab === obj.id}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-[11px] font-bold uppercase tracking-widest transition
                          ${activeTab === obj.id ? `${obj.bgActive} ${obj.text} ${obj.border}` : 'bg-white/5 text-fg-muted border-transparent hover:bg-white/10 hover:text-gray-200'}`}
                      >
                        <span>{obj.icon}</span> {obj.label}
                      </button>
                    ))}
                  </div>

                  {/* List of Tests */}
                  <div className="flex-1 overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-2 bg-black/20">
                    {loadingCatalogo ? (
                      <p className="text-center text-fg-muted text-xs py-8 uppercase font-bold tracking-widest">Cargando Catálogo...</p>
                    ) : pruebasFiltradas.length === 0 ? (
                      <p className="text-center text-fg-muted text-xs py-8 uppercase font-bold tracking-widest">No hay pruebas para este objetivo.</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {pruebasFiltradas.map(baremo => (
                          <button
                            key={baremo.id}
                            onClick={() => {
                              setPruebaTipo(baremo.id);
                              setValoresCrudos({});
                              setError('');
                            }}
                            className="bg-white/5 border border-white/10 hover:border-brand/50 hover:bg-white/10 rounded-control p-4 text-left transition flex flex-col group"
                          >
                            <span className="text-white font-bold text-sm mb-1 group-hover:text-brand transition-colors">{baremo.nombre}</span>
                            <div className="flex justify-between items-center text-2xs text-fg-muted font-bold uppercase tracking-widest">
                              <span>{baremo.unidad}</span>
                              <span>{baremo.tren ? TREN_LABELS[baremo.tren] : baremo.sub_pilar}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              ) : (
                /* ─── Formulario de la Prueba ──────────────────────── */
                <motion.div key="form" className="p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] overflow-y-auto flex-1 space-y-5">
                  <button onClick={() => setPruebaTipo('')} className="text-xs text-fg-secondary hover:text-white flex items-center font-bold uppercase tracking-widest mb-2 transition-colors">
                    <ChevronLeft size={14} className="mr-1"/> Volver a las pruebas
                  </button>
                  
                  <div className="flex items-center space-x-3 mb-4">
                    <span className="text-2xl">{PILAR_LABELS[selectedBaremo.pilar]?.icon}</span>
                    <div>
                      <h3 className="text-lg font-black text-white">{selectedBaremo.nombre}</h3>
                      <p className="text-2xs text-brand font-bold uppercase tracking-widest">
                        {selectedBaremo.sub_pilar} {selectedBaremo.tren ? `· ${TREN_LABELS[selectedBaremo.tren]}` : ''}
                      </p>
                    </div>
                  </div>

                  {/* ─── Category warning ────────────────────── */}
                  {selectedBaremo && !categoryAvailable && (
                    <div className="bg-caution/10 border border-caution/30 rounded-control p-3 text-caution-soft text-xs">
                      ⚠️ Esta prueba no tiene baremo definido para la categoría{' '}
                      <strong>{atleta?.categoria || 'actual'}</strong>. No podrás guardar un resultado hasta que exista un umbral para esta categoría.
                    </div>
                  )}

                  {(selectedBaremo?.descripcion || selectedBaremo?.descripcion_ejecucion) && (
                    <div className="bg-white/5 border border-white/10 rounded-control p-4 text-sm space-y-2">
                      {selectedBaremo?.descripcion && (
                        <div>
                          <span className="text-brand text-2xs font-bold uppercase tracking-widest block mb-1">Objetivo de la Prueba</span>
                          <p className="text-gray-300 font-medium">{selectedBaremo.descripcion}</p>
                        </div>
                      )}
                      {selectedBaremo?.descripcion_ejecucion && (
                        <div className={selectedBaremo?.descripcion ? "pt-2 border-t border-white/10" : ""}>
                          <span className="text-brand text-2xs font-bold uppercase tracking-widest block mb-1">Ejecución</span>
                          <p className="text-fg-secondary">{selectedBaremo.descripcion_ejecucion}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ─── Valor Inputs ─────────────────────────── */}
                  {selectedBaremo && (
                    <div className="space-y-3">
                      <label className="text-3xs font-bold uppercase tracking-widest text-fg-muted block">
                        Valores Medidos
                      </label>
                      <div className={`grid gap-3 ${selectedBaremo.inputs_requeridos ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
                        {(selectedBaremo.inputs_requeridos || [{ id: 'unico', label: 'Resultado' }]).map(input => (
                          <div key={input.id} className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold text-fg-secondary max-w-[5.5rem] truncate">
                              {input.label}:
                            </span>
                            <input
                              type="number"
                              step="any"
                              inputMode="decimal"
                              value={valoresCrudos[input.id] || ''}
                              onChange={(e) => {
                                setValoresCrudos(prev => ({ ...prev, [input.id]: e.target.value }));
                                setError('');
                              }}
                              className="w-full bg-surface-card border border-white/10 rounded-control pl-24 pr-16 py-4 text-base md:text-sm text-white font-bold focus:outline-none focus:border-brand/50 transition-colors shadow-inner"
                              placeholder="0.00"
                            />
                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-2xs font-bold uppercase tracking-widest text-brand/60">
                              {selectedBaremo.unidad}
                            </span>
                          </div>
                        ))}
                      </div>
                      {selectedBaremo.invertido && (
                        <p className="text-3xs text-cyan-400/60 mt-1 ml-1 font-bold uppercase tracking-widest">
                          ↓ Menor valor = Mejor resultado
                        </p>
                      )}
                    </div>
                  )}

                  {/* ─── Preview Result ──────────────────────── */}
                  <AnimatePresence>
                    {preview && preview.noAplica && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="bg-caution/10 border border-caution/30 rounded-control p-3 text-caution-soft text-xs mt-2"
                      >
                        ⚠️ {preview.mensajeNoAplica} No se puede guardar este resultado.
                      </motion.div>
                    )}
                    {preview && !preview.noAplica && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="space-y-3 pt-2"
                      >
                        {preview.isAsymmetric && (
                          <div className="bg-danger/10 border border-danger/30 rounded-control p-3 text-danger-soft text-xs flex items-start gap-2">
                            <span>⚠️</span>
                            <span>{preview.alertMsg}</span>
                          </div>
                        )}
                        <TierBadge
                          tier={preview.tier}
                          tierConfig={preview.tierConfig}
                          puntuacion={preview.puntuacion}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* ─── Notas ────────────────────────────────── */}
                  <div className="pt-2">
                    <label className="text-3xs font-bold uppercase tracking-widest text-fg-muted mb-2 block">
                      Notas del Coach (Opcional)
                    </label>
                    <textarea
                      value={notas}
                      onChange={(e) => setNotas(e.target.value)}
                      placeholder="Observaciones sobre la ejecución, técnica, condiciones..."
                      rows={2}
                      className="w-full bg-white/5 border border-white/10 rounded-control px-4 py-3 text-base md:text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand/50 transition-colors resize-none"
                    />
                  </div>

                  {/* ─── Error ────────────────────────────────── */}
                  {error && (
                    <div className="bg-danger/10 border border-danger/30 rounded-control p-3 text-danger-soft text-xs">
                      {error}
                    </div>
                  )}

                  {/* ─── Submit Button ────────────────────────── */}
                  <div className="pt-4">
                    <button
                      onClick={handleSubmit}
                      disabled={!isFormValid || saving}
                      className="w-full bg-brand hover:bg-brand-hover text-black font-black uppercase tracking-widest py-4 rounded-control shadow-[0_0_25px_rgba(255,215,0,0.2)] disabled:opacity-30 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
                    >
                      {saving ? (
                        <>
                          <Loader2 size={18} className="animate-spin" />
                          Guardando...
                        </>
                      ) : (
                        <>
                          <Save size={18} />
                          Registrar Evaluación
                        </>
                      )}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
      {showNuevaPruebaModal && (
        <NuevaPruebaModal 
          isOpen={showNuevaPruebaModal} 
          onClose={() => setShowNuevaPruebaModal(false)}
          onPruebaCreated={(nuevaPrueba) => {
            setCatalogoEjercicios(prev => [...prev, nuevaPrueba]);
            setShowNuevaPruebaModal(false);
            setPruebaTipo(nuevaPrueba.id);
            setActiveTab('todas');
          }}
        />
      )}
    </>,
    document.body
  );
}
