import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Target, Users, User, CheckCircle2, Loader2, X, Bookmark, Lightbulb, TrendingUp } from 'lucide-react';
import { supabase } from '../api/supabaseClient';
import { useAuth } from '../AuthContext';
import { getSubPilarScores } from '../lib/radarCalc';

export default function AsignadorMisiones({ onClose, todosLosAtletas }) {
  const { user } = useAuth();
  
  const [bancoMisiones, setBancoMisiones] = useState([]);
  const [loadingBanco, setLoadingBanco] = useState(true);
  
  const [modoCreacion, setModoCreacion] = useState(false);
  const [misionSeleccionadaId, setMisionSeleccionadaId] = useState('');
  
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [recompensa, setRecompensa] = useState(10);
  
  const [asignacionTipo, setAsignacionTipo] = useState('atleta'); // 'atleta', 'categoria', 'todos'
  const [atletaSeleccionado, setAtletaSeleccionado] = useState('');
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState('Sub10');
  
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [sugerenciaXP, setSugerenciaXP] = useState(null);

  const categorias = [...new Set(todosLosAtletas.map(a => a.categoria).filter(Boolean))];

  useEffect(() => {
    loadBancoMisiones();
  }, [user]);

  const loadBancoMisiones = async () => {
    setLoadingBanco(true);
    try {
      const { data, error } = await supabase
        .from('catalogo_misiones')
        .select('*')
        .order('fecha_creacion', { ascending: false });
      
      if (!error && data) {
        setBancoMisiones(data);
      }
    } catch (err) {
      console.error(err);
    }
    setLoadingBanco(false);
  };

  // AI Suggestion Engine: If assigning to one athlete, analyze deficits
  useEffect(() => {
    if (asignacionTipo === 'atleta' && atletaSeleccionado) {
      const atleta = todosLosAtletas.find(a => a.id === atletaSeleccionado);
      if (atleta && atleta._evaluaciones) {
        const scores = getSubPilarScores(atleta._evaluaciones);
        // Find weakest
        let weakest = null;
        let minScore = 999;
        Object.entries(scores).forEach(([k, v]) => {
          if (v < minScore) { minScore = v; weakest = k; }
        });
        
        if (weakest && minScore < 50) {
          setSugerenciaXP({
            pilar: weakest,
            xp: 25,
            msg: `Su ${weakest} está bajo (${minScore} XP). Sugerimos +25 XP para motivar este hábito.`
          });
        } else {
          setSugerenciaXP(null);
        }
      }
    } else {
      setSugerenciaXP(null);
    }
  }, [asignacionTipo, atletaSeleccionado, todosLosAtletas]);

  const handleMisionSelect = (e) => {
    const id = e.target.value;
    setMisionSeleccionadaId(id);
    if (id === 'nueva') {
      setModoCreacion(true);
      setTitulo('');
      setDescripcion('');
      setRecompensa(10);
    } else if (id) {
      setModoCreacion(false);
      const m = bancoMisiones.find(x => x.id === id);
      if (m) {
        setTitulo(m.titulo);
        setDescripcion(m.descripcion);
        setRecompensa(m.xp_base);
      }
    }
  };

  const aplicarSugerencia = () => {
    if (sugerenciaXP) setRecompensa(sugerenciaXP.xp);
  };

  const handleAssign = async () => {
    if (!titulo.trim()) {
      setError('El título de la misión es obligatorio');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      let targetAthletes = [];
      
      if (asignacionTipo === 'atleta') {
        if (!atletaSeleccionado) throw new Error('Selecciona un atleta');
        targetAthletes.push(todosLosAtletas.find(a => a.id === atletaSeleccionado));
      } else if (asignacionTipo === 'categoria') {
        targetAthletes = todosLosAtletas.filter(a => a.categoria === categoriaSeleccionada);
      } else {
        targetAthletes = todosLosAtletas;
      }

      if (targetAthletes.length === 0) throw new Error('No hay atletas en esta selección');

      // 1. Save to Banco if creating new
      if (modoCreacion) {
        const { error: catalogoErr } = await supabase
          .from('catalogo_misiones')
          .insert([{
            titulo,
            descripcion,
            xp_base: parseInt(recompensa),
            creado_por: user.id,
            club_id: user.club
          }]);
        if (catalogoErr) throw catalogoErr;
      }

      // 2. Assign to athletes
      const misionesAInsertar = targetAthletes.map(a => ({
        atleta_id: a.id,
        coach_id: user.id,
        titulo,
        descripcion,
        recompensa_xp: parseInt(recompensa)
      }));

      const { error: dbError } = await supabase
        .from('misiones_habitos')
        .insert(misionesAInsertar);

      if (dbError) throw dbError;

      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 2000);
      
    } catch (err) {
      setError(err.message || 'Error al asignar la misión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass-card w-full max-w-lg rounded-2xl p-6 border border-zinc-800 max-h-[90vh] overflow-y-auto custom-scrollbar"
      >
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center space-x-3">
            <div className="bg-amber-500/20 p-2 rounded-lg">
              <Target className="text-amber-500 w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-white">Inteligencia de Misiones</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="space-y-4">
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Asignar a:</label>
              <select 
                value={asignacionTipo}
                onChange={(e) => setAsignacionTipo(e.target.value)}
                className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-white outline-none"
              >
                <option value="atleta">Un Atleta Específico</option>
                <option value="categoria">Una Categoría Entera</option>
                <option value="todos">Todos los Atletas</option>
              </select>
            </div>

            {asignacionTipo === 'atleta' && (
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Atleta</label>
                <select 
                  value={atletaSeleccionado}
                  onChange={(e) => setAtletaSeleccionado(e.target.value)}
                  className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-white outline-none"
                >
                  <option value="">Selecciona...</option>
                  {todosLosAtletas.map(a => (
                    <option key={a.id} value={a.id}>{a.nombre} - {a.categoria}</option>
                  ))}
                </select>
              </div>
            )}
            {asignacionTipo === 'categoria' && (
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Categoría</label>
                <select 
                  value={categoriaSeleccionada}
                  onChange={(e) => setCategoriaSeleccionada(e.target.value)}
                  className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-white outline-none"
                >
                  {categorias.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-white/10">
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center">
              <Bookmark className="w-3 h-3 mr-1" /> Banco de Misiones
            </label>
            <select 
              value={misionSeleccionadaId}
              onChange={handleMisionSelect}
              className="w-full bg-amber-900/20 border border-amber-500/30 rounded-xl p-3 text-amber-400 font-bold outline-none"
            >
              <option value="">-- Selecciona del Catálogo --</option>
              {loadingBanco ? <option disabled>Cargando...</option> : bancoMisiones.map(m => (
                <option key={m.id} value={m.id}>{m.titulo} ({m.xp_base} XP)</option>
              ))}
              <option value="nueva">+ Crear Nueva Misión y Guardar en Banco</option>
            </select>
          </div>

          {(misionSeleccionadaId || modoCreacion) && (
            <motion.div initial={{opacity:0, height:0}} animate={{opacity:1, height:'auto'}} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Título del Hábito</label>
                <input 
                  type="text"
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  disabled={!modoCreacion}
                  placeholder="Ej: Beber 2L de agua diarios"
                  className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-white disabled:opacity-50 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Descripción (Opcional)</label>
                <textarea 
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  disabled={!modoCreacion}
                  className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-white disabled:opacity-50 h-20 resize-none outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">XP de Recompensa</label>
                <div className="flex space-x-2">
                  <input 
                    type="number"
                    value={recompensa}
                    onChange={(e) => setRecompensa(e.target.value)}
                    disabled={!modoCreacion}
                    className="w-32 bg-black/30 border border-white/10 rounded-xl p-3 text-white disabled:opacity-50 outline-none"
                  />
                  {modoCreacion && sugerenciaXP && (
                    <button 
                      onClick={aplicarSugerencia}
                      className="flex-1 flex items-center justify-center space-x-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-xl p-3 text-xs font-bold hover:bg-emerald-500/20 transition-colors"
                    >
                      <Lightbulb className="w-4 h-4 text-emerald-400" />
                      <span className="text-left text-[10px] leading-tight">{sugerenciaXP.msg}</span>
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {error && <div className="text-red-400 text-sm font-medium pt-2">{error}</div>}

          <button
            onClick={handleAssign}
            disabled={loading || success || !misionSeleccionadaId}
            className={`w-full mt-4 flex items-center justify-center space-x-2 p-4 rounded-xl font-bold uppercase tracking-widest transition-all ${
              success 
                ? 'bg-emerald-500 text-black' 
                : 'bg-amber-500 hover:bg-amber-400 text-black disabled:opacity-50'
            }`}
          >
            {loading ? <Loader2 className="animate-spin w-5 h-5" /> : success ? <CheckCircle2 className="w-5 h-5" /> : <Users className="w-5 h-5" />}
            <span>{success ? 'Misión Asignada' : modoCreacion ? 'Guardar en Banco y Asignar' : 'Asignar Misión del Banco'}</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
}
