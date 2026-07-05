import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ClipboardCheck, ChevronDown, FlaskConical, Save, Loader2, CheckCircle2, ChevronLeft } from 'lucide-react';
import { TIER_CONFIG, normalizarValor } from '../lib/baremosEngine';
import { supabase } from '../api/supabaseClient';
import { recalcularOverall } from '../api/evaluacionesService';
import { useAuth } from '../AuthContext';
import NuevaPruebaModal from './NuevaPruebaModal';

// ─── PILAR DISPLAY CONFIG ──────────────────────────────────
const PILAR_LABELS = {
  fisico: { label: 'Físico-Atlético', icon: '💪' },
  tecnico: { label: 'Técnico-Baloncestístico', icon: '🏀' },
  mental: { label: 'Mental-Táctico', icon: '🧠' },
};

const TREN_LABELS = {
  inferior: 'Tren Inferior',
  superior: 'Tren Superior',
  null: null,
};

const OBJETIVOS = [
  { id: 'todas', label: 'Todas', icon: '📋', filter: () => true, border: 'border-gray-500/30', bgActive: 'bg-gray-500/20', text: 'text-gray-400' },
  { id: 'fuerza', label: 'Fuerza', icon: '💪', filter: (b) => b.sub_pilar === 'fuerza', border: 'border-red-500/30', bgActive: 'bg-red-500/20', text: 'text-red-400' },
  { id: 'explosividad', label: 'Explosividad', icon: '🚀', filter: (b) => b.sub_pilar === 'explosividad', border: 'border-orange-500/30', bgActive: 'bg-orange-500/20', text: 'text-orange-400' },
  { id: 'movilidad', label: 'Movilidad', icon: '🤸', filter: (b) => b.sub_pilar === 'movilidad', border: 'border-emerald-500/30', bgActive: 'bg-emerald-500/20', text: 'text-emerald-400' },
  { id: 'tiro', label: 'Técnica de Tiro', icon: '🎯', filter: (b) => b.sub_pilar === 'tiro', border: 'border-cyan-500/30', bgActive: 'bg-cyan-500/20', text: 'text-cyan-400' },
  { id: 'agilidad', label: 'Agilidad', icon: '⚡', filter: (b) => b.sub_pilar === 'agilidad', border: 'border-yellow-500/30', bgActive: 'bg-yellow-500/20', text: 'text-yellow-400' },
  { id: 'tactica', label: 'Efic. Táctica', icon: '🧠', filter: (b) => b.sub_pilar === 'tactica', border: 'border-purple-500/30', bgActive: 'bg-purple-500/20', text: 'text-purple-400' },
  { id: 'resiliencia', label: 'Resiliencia', icon: '🛡️', filter: (b) => b.sub_pilar === 'resiliencia', border: 'border-pink-500/30', bgActive: 'bg-pink-500/20', text: 'text-pink-400' },
  { id: 'recuperacion', label: 'Carga/Sueño', icon: '🔋', filter: (b) => b.sub_pilar === 'recuperacion', border: 'border-blue-500/30', bgActive: 'bg-blue-500/20', text: 'text-blue-400' },
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
    className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-white/[0.03] border border-white/10"
  >
    <span className="text-[9px] font-bold uppercase tracking-widest text-gray-500">
      Resultado
    </span>
    <div className="flex items-center gap-3">
      <span className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider ${tierConfig.bg} ${tier === 'above_avg' ? 'text-black' : 'text-white'}`}>
        {tierConfig.label}
      </span>
      <span className="text-2xl font-black text-white">
        {puntuacion}
        <span className="text-sm text-gray-500 font-medium">/100</span>
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
        .from('catalogo_ejercicios')
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

  // Check if the athlete's category has thresholds for this test
  const categoryAvailable = useMemo(() => {
    const cat = atleta?.categoria || 'Todas';
    if (!selectedBaremo) return true;
    return !!Object.keys(selectedBaremo.thresholds || {}).find(k => cat.includes(k) || k === 'Todas');
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
    
    return normalizarValor(baremoParam, vals, cat);
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
      const { puntuacion, tier, tierConfig } = preview;
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

  return (
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
          className="w-full max-w-xl bg-[#09090b] rounded-none md:rounded-3xl border border-[#FFD700]/30 shadow-[0_0_60px_rgba(255,215,0,0.12)] overflow-hidden flex flex-col h-dvh md:h-auto md:max-h-[90vh] pt-[env(safe-area-inset-top)] md:pt-0"
        >
          {/* ─── Header ──────────────────────────────────────── */}
          <div className="p-4 border-b border-white/10 flex justify-between items-center bg-gradient-to-r from-[#FFD700]/10 to-transparent">
            <div className="flex items-center space-x-2">
              <ClipboardCheck className="text-[#FFD700]" size={20} />
              <div>
                <h2 className="text-lg font-black text-white uppercase tracking-tight">
                  Evaluación Científica
                </h2>
                <p className="text-[10px] text-[#FFD700]/70 font-bold uppercase tracking-widest">
                  {atleta?.nombre} · {atleta?.categoria}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Cerrar evaluación"
              className="text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 p-2.5 rounded-full transition-colors"
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
                  <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center">
                    <CheckCircle2 size={32} />
                  </div>
                  <p className="text-emerald-400 font-bold uppercase tracking-widest text-sm">
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
                      className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-base md:text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#FFD700]/50"
                    />
                    {user?.rol !== 'atleta' && (
                      <button
                        onClick={() => setShowNuevaPruebaModal(true)}
                        className="bg-[#FFD700]/10 text-[#FFD700] border border-[#FFD700]/30 hover:bg-[#FFD700]/20 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors flex-shrink-0"
                      >
                        + Nueva Prueba
                      </button>
                    )}
                  </div>

                  {/* Tabs */}
                  <div className="flex px-2 pt-2 gap-1 overflow-x-auto scrollbar-hide border-b border-white/5">
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
                        className={`flex items-center gap-2 px-4 py-3 rounded-t-xl text-xs font-bold uppercase tracking-widest transition-all whitespace-nowrap
                          ${activeTab === obj.id ? `${obj.bgActive} ${obj.text} border-b-2 ${obj.border}` : 'text-gray-500 hover:bg-white/5 hover:text-gray-300'}`}
                      >
                        <span>{obj.icon}</span> {obj.label}
                      </button>
                    ))}
                  </div>

                  {/* List of Tests */}
                  <div className="flex-1 overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-2 bg-black/20">
                    {loadingCatalogo ? (
                      <p className="text-center text-gray-500 text-xs py-8 uppercase font-bold tracking-widest">Cargando Catálogo...</p>
                    ) : pruebasFiltradas.length === 0 ? (
                      <p className="text-center text-gray-500 text-xs py-8 uppercase font-bold tracking-widest">No hay pruebas para este objetivo.</p>
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
                            className="bg-white/5 border border-white/10 hover:border-[#FFD700]/50 hover:bg-white/10 rounded-xl p-4 text-left transition-all flex flex-col group"
                          >
                            <span className="text-white font-bold text-sm mb-1 group-hover:text-[#FFD700] transition-colors">{baremo.nombre}</span>
                            <div className="flex justify-between items-center text-[10px] text-gray-500 font-bold uppercase tracking-widest">
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
                  <button onClick={() => setPruebaTipo('')} className="text-xs text-gray-400 hover:text-white flex items-center font-bold uppercase tracking-widest mb-2 transition-colors">
                    <ChevronLeft size={14} className="mr-1"/> Volver a las pruebas
                  </button>
                  
                  <div className="flex items-center space-x-3 mb-4">
                    <span className="text-2xl">{PILAR_LABELS[selectedBaremo.pilar]?.icon}</span>
                    <div>
                      <h3 className="text-lg font-black text-white">{selectedBaremo.nombre}</h3>
                      <p className="text-[10px] text-[#FFD700] font-bold uppercase tracking-widest">
                        {selectedBaremo.sub_pilar} {selectedBaremo.tren ? `· ${TREN_LABELS[selectedBaremo.tren]}` : ''}
                      </p>
                    </div>
                  </div>

                  {/* ─── Category warning ────────────────────── */}
                  {selectedBaremo && !categoryAvailable && (
                    <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-3 text-orange-400 text-xs">
                      ⚠️ Esta prueba no tiene baremo definido para la categoría{' '}
                      <strong>{atleta?.categoria || 'actual'}</strong>. No podrás guardar un resultado hasta que exista un umbral para esta categoría.
                    </div>
                  )}

                  {(selectedBaremo?.descripcion || selectedBaremo?.descripcion_ejecucion) && (
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-sm space-y-2">
                      {selectedBaremo?.descripcion && (
                        <div>
                          <span className="text-[#FFD700] text-[10px] font-bold uppercase tracking-widest block mb-1">Objetivo de la Prueba</span>
                          <p className="text-gray-300 font-medium">{selectedBaremo.descripcion}</p>
                        </div>
                      )}
                      {selectedBaremo?.descripcion_ejecucion && (
                        <div className={selectedBaremo?.descripcion ? "pt-2 border-t border-white/10" : ""}>
                          <span className="text-[#FFD700] text-[10px] font-bold uppercase tracking-widest block mb-1">Ejecución</span>
                          <p className="text-gray-400">{selectedBaremo.descripcion_ejecucion}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ─── Valor Inputs ─────────────────────────── */}
                  {selectedBaremo && (
                    <div className="space-y-3">
                      <label className="text-[9px] font-bold uppercase tracking-widest text-gray-500 block">
                        Valores Medidos
                      </label>
                      <div className={`grid gap-3 ${selectedBaremo.inputs_requeridos ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
                        {(selectedBaremo.inputs_requeridos || [{ id: 'unico', label: 'Resultado' }]).map(input => (
                          <div key={input.id} className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400 max-w-[5.5rem] truncate">
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
                              className="w-full bg-[#121214] border border-white/10 rounded-xl pl-24 pr-16 py-4 text-base md:text-sm text-white font-bold focus:outline-none focus:border-[#FFD700]/50 transition-colors shadow-inner"
                              placeholder="0.00"
                            />
                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase tracking-widest text-[#FFD700]/60">
                              {selectedBaremo.unidad}
                            </span>
                          </div>
                        ))}
                      </div>
                      {selectedBaremo.invertido && (
                        <p className="text-[9px] text-cyan-400/60 mt-1 ml-1 font-bold uppercase tracking-widest">
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
                        className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-3 text-orange-400 text-xs mt-2"
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
                          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-red-400 text-xs flex items-start gap-2">
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
                    <label className="text-[9px] font-bold uppercase tracking-widest text-gray-500 mb-2 block">
                      Notas del Coach (Opcional)
                    </label>
                    <textarea
                      value={notas}
                      onChange={(e) => setNotas(e.target.value)}
                      placeholder="Observaciones sobre la ejecución, técnica, condiciones..."
                      rows={2}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-base md:text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#FFD700]/50 transition-colors resize-none"
                    />
                  </div>

                  {/* ─── Error ────────────────────────────────── */}
                  {error && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-red-400 text-xs">
                      {error}
                    </div>
                  )}

                  {/* ─── Submit Button ────────────────────────── */}
                  <div className="pt-4">
                    <button
                      onClick={handleSubmit}
                      disabled={!isFormValid || saving}
                      className="w-full bg-[#FFD700] hover:bg-[#D4AF37] text-black font-black uppercase tracking-widest py-4 rounded-xl shadow-[0_0_25px_rgba(255,215,0,0.2)] disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
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
    </>
  );
}
