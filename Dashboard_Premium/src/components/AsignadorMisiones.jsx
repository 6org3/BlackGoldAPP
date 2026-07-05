import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Target, Users, CheckCircle2, Loader2, X, Bookmark, Lightbulb, Plus } from 'lucide-react';
import { supabase } from '../api/supabaseClient';
import { useAuth } from '../AuthContext';
import { asignarMisionAAtleta } from '../api/misionesService';
import { PILAR_LABELS, PILARES_OPTIONS } from '../constants/pilares';
import { getSubPilarScores } from '../lib/radarCalc';

export default function AsignadorMisiones({ onClose, todosLosAtletas }) {
  const { user } = useAuth();

  const [bancoMisiones, setBancoMisiones] = useState([]);
  const [loadingBanco, setLoadingBanco] = useState(true);

  const [modoCreacion, setModoCreacion] = useState(false);
  const [misionSeleccionadaId, setMisionSeleccionadaId] = useState('');

  // Campos para nueva misión
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [pilar, setPilar] = useState('youtube');
  const [videoUrl, setVideoUrl] = useState('');
  const [recompensa, setRecompensa] = useState(50);

  const [asignacionTipo, setAsignacionTipo] = useState('atleta'); // 'atleta' | 'categoria' | 'todos'
  const [atletaSeleccionado, setAtletaSeleccionado] = useState('');
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState('');

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const categorias = useMemo(
    () => [...new Set(todosLosAtletas.map(a => a.categoria).filter(Boolean))],
    [todosLosAtletas]
  );
  // todosLosAtletas llega async desde el padre: al montar `categorias` puede
  // estar vacío, así que se deriva el valor efectivo en vez de fijarlo una
  // sola vez (el select mostraba la 1ª opción pero el filtro usaba '').
  const categoriaEfectiva = categoriaSeleccionada || categorias[0] || '';

  // Scroll-lock del fondo mientras el modal está abierto (en iOS el body
  // scrollea por detrás del overlay).
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  useEffect(() => {
    let cancelado = false;
    supabase
      .from('misiones')
      .select('id, titulo, pilar, xp_recompensa')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelado) return;
        if (error) console.error('Error cargando banco de misiones:', error);
        else if (data) setBancoMisiones(data);
        setLoadingBanco(false);
      });
    return () => { cancelado = true; };
  }, [user]);

  // Sugerencia de XP basada en déficit del atleta (derivada, sin estado extra)
  const sugerenciaXP = useMemo(() => {
    if (asignacionTipo !== 'atleta' || !atletaSeleccionado) return null;
    const atleta = todosLosAtletas.find(a => a.id === atletaSeleccionado);
    if (!atleta || !atleta._evaluaciones) return null;
    const scores = getSubPilarScores(atleta._evaluaciones);
    let weakest = null;
    let minScore = 999;
    Object.entries(scores).forEach(([k, v]) => {
      if (v < minScore) { minScore = v; weakest = k; }
    });
    if (weakest && minScore < 50) {
      return {
        pilar: weakest,
        xp: 25,
        msg: `Su ${weakest} está bajo (${minScore} XP). Sugerimos +25 XP para motivar este hábito.`
      };
    }
    return null;
  }, [asignacionTipo, atletaSeleccionado, todosLosAtletas]);

  const handleMisionSelect = (e) => {
    const id = e.target.value;
    setMisionSeleccionadaId(id);
    if (id === 'nueva') {
      setModoCreacion(true);
      setTitulo('');
      setDescripcion('');
      setPilar('youtube');
      setVideoUrl('');
      setRecompensa(50);
    } else if (id) {
      setModoCreacion(false);
      const m = bancoMisiones.find(x => x.id === id);
      if (m) {
        setTitulo(m.titulo);
        setPilar(m.pilar || 'youtube');
        setRecompensa(m.xp_recompensa);
      }
    }
  };

  const handleAssign = async () => {
    if (!misionSeleccionadaId) {
      setError('Selecciona una misión del banco o crea una nueva');
      return;
    }
    if (!titulo.trim()) {
      setError('El título de la misión es obligatorio');
      return;
    }

    setLoading(true);
    setError('');

    try {
      let targetAtletas = [];

      if (asignacionTipo === 'atleta') {
        if (!atletaSeleccionado) throw new Error('Selecciona un atleta');
        const found = todosLosAtletas.find(a => a.id === atletaSeleccionado);
        if (!found) throw new Error('Atleta no encontrado');
        targetAtletas.push(found);
      } else if (asignacionTipo === 'categoria') {
        targetAtletas = todosLosAtletas.filter(a => a.categoria === categoriaEfectiva);
      } else {
        targetAtletas = todosLosAtletas;
      }

      if (targetAtletas.length === 0) throw new Error('No hay atletas en esta selección');

      let misionIdFinal = misionSeleccionadaId;

      // Si es nueva, crearla en la tabla misiones
      if (modoCreacion) {
        const { data: newMision, error: mErr } = await supabase
          .from('misiones')
          .insert({
            titulo,
            descripcion,
            pilar,
            video_url: videoUrl,
            xp_recompensa: parseInt(recompensa),
            quiz: [],
            autor_id: user.id,
          })
          .select('id')
          .single();

        if (mErr) throw mErr;
        misionIdFinal = newMision.id;
      }

      // Asignar a todos en paralelo: un round-trip por atleta en serie dejaba
      // el spinner colgado varios segundos en red móvil.
      const resultados = await Promise.allSettled(
        targetAtletas.map(atleta => asignarMisionAAtleta(atleta.atleta_id || atleta.id, misionIdFinal))
      );
      // Ignorar duplicate key (ya asignada); propagar cualquier otro error
      const falloReal = resultados.find(r => r.status === 'rejected' && r.reason?.code !== '23505');
      if (falloReal) throw falloReal.reason;

      setSuccess(true);
      setTimeout(() => { onClose(); }, 2000);
    } catch (err) {
      setError(err.message || 'Error al asignar la misión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/80 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass-card w-full max-w-lg rounded-t-2xl sm:rounded-2xl p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] border border-zinc-800 max-h-[85dvh] overflow-y-auto custom-scrollbar"
      >
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center space-x-3">
            <div className="bg-amber-500/20 p-2 rounded-lg">
              <Target className="text-amber-500 w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-white">Asignar Misión</h2>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="p-2 -m-2 text-gray-400 hover:text-white">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Tipo de asignación */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                    <option key={a.id} value={a.id}>{a.nombre} — {a.categoria}</option>
                  ))}
                </select>
              </div>
            )}

            {asignacionTipo === 'categoria' && (
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Categoría</label>
                <select
                  value={categoriaEfectiva}
                  onChange={(e) => setCategoriaSeleccionada(e.target.value)}
                  className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-white outline-none"
                >
                  {categorias.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            )}

            {asignacionTipo === 'todos' && (
              <div className="flex items-end pb-3">
                <span className="text-xs text-amber-400 font-bold flex items-center gap-1">
                  <Users className="w-4 h-4" />
                  {todosLosAtletas.length} atletas
                </span>
              </div>
            )}
          </div>

          {/* Banco de misiones */}
          <div className="pt-4 border-t border-white/10">
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1">
              <Bookmark className="w-3 h-3" /> Banco de Misiones
            </label>
            <select
              value={misionSeleccionadaId}
              onChange={handleMisionSelect}
              className="w-full bg-amber-900/20 border border-amber-500/30 rounded-xl p-3 text-amber-400 font-bold outline-none"
            >
              <option value="">— Selecciona del Banco —</option>
              {loadingBanco ? (
                <option disabled>Cargando...</option>
              ) : (
                bancoMisiones.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.titulo} · {PILAR_LABELS[m.pilar] || m.pilar} · {m.xp_recompensa} XP
                  </option>
                ))
              )}
              <option value="nueva">+ Crear nueva misión</option>
            </select>
          </div>

          {/* Detalle / Formulario */}
          {misionSeleccionadaId && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="space-y-4 mt-2"
            >
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Título</label>
                <input
                  type="text"
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  disabled={!modoCreacion}
                  placeholder="Ej: Ver video de técnica de tiro"
                  className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-white disabled:opacity-50 outline-none"
                />
              </div>

              {modoCreacion && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Descripción</label>
                    <textarea
                      value={descripcion}
                      onChange={(e) => setDescripcion(e.target.value)}
                      placeholder="Instrucciones para el atleta..."
                      className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-white h-20 resize-none outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Pilar</label>
                      <select
                        value={pilar}
                        onChange={(e) => setPilar(e.target.value)}
                        className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-white outline-none"
                      >
                        {PILARES_OPTIONS.map(({ value, label }) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">URL Video (opcional)</label>
                      <input
                        type="url"
                        value={videoUrl}
                        onChange={(e) => setVideoUrl(e.target.value)}
                        placeholder="https://youtube.com/..."
                        className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-white outline-none"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* XP */}
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">XP de Recompensa</label>
                <div className="flex space-x-2">
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    value={recompensa}
                    onChange={(e) => setRecompensa(e.target.value)}
                    disabled={!modoCreacion}
                    className="w-32 bg-black/30 border border-white/10 rounded-xl p-3 text-white disabled:opacity-50 outline-none"
                  />
                  {modoCreacion && sugerenciaXP && (
                    <button
                      onClick={() => setRecompensa(sugerenciaXP.xp)}
                      className="flex-1 flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-xl p-3 text-[10px] font-bold hover:bg-emerald-500/20 transition-colors"
                    >
                      <Lightbulb className="w-4 h-4 shrink-0" />
                      <span className="text-left leading-tight">{sugerenciaXP.msg}</span>
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {error && <div className="text-red-400 text-sm font-medium pt-1">{error}</div>}

          <button
            onClick={handleAssign}
            disabled={loading || success || !misionSeleccionadaId}
            className={`w-full mt-2 flex items-center justify-center gap-2 p-4 rounded-xl font-bold uppercase tracking-widest transition-all ${
              success
                ? 'bg-emerald-500 text-black'
                : 'bg-amber-500 hover:bg-amber-400 text-black disabled:opacity-40'
            }`}
          >
            {loading
              ? <Loader2 className="animate-spin w-5 h-5" />
              : success
              ? <CheckCircle2 className="w-5 h-5" />
              : modoCreacion
              ? <Plus className="w-5 h-5" />
              : <Target className="w-5 h-5" />
            }
            <span>
              {success ? 'Misión Asignada' : modoCreacion ? 'Crear y Asignar' : 'Asignar Misión'}
            </span>
          </button>
        </div>
      </motion.div>
    </div>
  );
}
