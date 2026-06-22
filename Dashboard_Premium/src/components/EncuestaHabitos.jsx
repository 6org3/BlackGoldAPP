import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../api/supabaseClient';
import { ClipboardCheck, Moon, Utensils, Droplets, Cookie, Dumbbell, Info, CheckCircle2, Send, Loader2 } from 'lucide-react';

// ───────────────────────────────────────────────────
// SURVEY DEFINITIONS
// ───────────────────────────────────────────────────

const PREGUNTAS = [
  {
    id: 'sueno',
    texto: '¿Cuántas horas dormiste en promedio esta semana?',
    icon: Moon,
    opciones: ['Menos de 6', '6-7', '7-8', '8-9', 'Más de 9'],
    // Best = 8-9 (20), worst = Menos de 6 (4)
    puntajes: [4, 8, 16, 20, 12],
  },
  {
    id: 'comidas',
    texto: '¿Cuántas comidas completas al día?',
    icon: Utensils,
    opciones: ['1', '2', '3', '4+'],
    puntajes: [4, 10, 16, 20],
  },
  {
    id: 'agua',
    texto: '¿Cuántos litros de agua al día?',
    icon: Droplets,
    opciones: ['Menos de 0.5L', '0.5-1L', '1-1.5L', '1.5-2L', 'Más de 2L'],
    puntajes: [4, 8, 12, 20, 16],
  },
  {
    id: 'chatarra',
    texto: '¿Consumiste comida chatarra esta semana?',
    icon: Cookie,
    opciones: ['Nunca', '1 vez', '2-3 veces', '4+ veces'],
    // best = Nunca (20), worst = 4+ (4)
    puntajes: [20, 16, 10, 4],
  },
  {
    id: 'deporte_extra',
    texto: '¿Practicaste deporte fuera del club?',
    icon: Dumbbell,
    opciones: ['Sí', 'No'],
    puntajes: [20, 4],
  },
];

// ───────────────────────────────────────────────────
// HELPERS
// ───────────────────────────────────────────────────

/** Get the Monday of the current ISO week as YYYY-MM-DD */
function getLunesActual() {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.setDate(diff));
  return monday.toISOString().split('T')[0];
}

function calcularPuntajeTotal(respuestas) {
  return PREGUNTAS.reduce((sum, p) => {
    const idx = respuestas[p.id];
    if (idx == null) return sum;
    return sum + p.puntajes[idx];
  }, 0);
}

function getScoreColor(score) {
  if (score >= 80) return 'text-emerald-400';
  if (score >= 60) return 'text-[#FFD700]';
  if (score >= 40) return 'text-orange-400';
  return 'text-red-400';
}

function getScoreBarColor(score) {
  if (score >= 80) return 'bg-emerald-500';
  if (score >= 60) return 'bg-[#FFD700]';
  if (score >= 40) return 'bg-orange-500';
  return 'bg-red-500';
}

// ───────────────────────────────────────────────────
// COMPONENT
// ───────────────────────────────────────────────────

export default function EncuestaHabitos({ atletaId, tieneRepresentante }) {
  const [respuestas, setRespuestas] = useState({});
  const [yaRespondida, setYaRespondida] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  const semana = useMemo(() => getLunesActual(), []);

  // ── Check if already submitted this week ──
  useEffect(() => {
    const checkExistente = async () => {
      setLoading(true);
      try {
        const { data, error: fetchErr } = await supabase
          .from('encuestas_habitos')
          .select('respuestas')
          .eq('atleta_id', atletaId)
          .eq('semana', semana)
          .eq('respondido_por', 'atleta')
          .maybeSingle();

        if (fetchErr) throw fetchErr;

        if (data) {
          setRespuestas(data.respuestas || {});
          setYaRespondida(true);
        }
      } catch (err) {
        console.error('Error checking encuesta:', err);
      } finally {
        setLoading(false);
      }
    };
    checkExistente();
  }, [atletaId, semana]);

  // ── Handlers ──
  const handleSelect = (preguntaId, optionIndex) => {
    if (yaRespondida) return;
    setRespuestas(prev => ({ ...prev, [preguntaId]: optionIndex }));
  };

  const todasRespondidas = PREGUNTAS.every(p => respuestas[p.id] != null);
  const puntajeTotal = calcularPuntajeTotal(respuestas);

  const handleSubmit = async () => {
    if (!todasRespondidas || yaRespondida) return;
    setSaving(true);
    setError(null);

    try {
      const { error: insertErr } = await supabase
        .from('encuestas_habitos')
        .insert({
          atleta_id: atletaId,
          semana,
          respondido_por: 'atleta',
          respuestas,
          puntaje_total: puntajeTotal,
        });

      if (insertErr) throw insertErr;
      setYaRespondida(true);
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Render ──
  if (loading) {
    return (
      <div className="glass-card rounded-3xl p-8 glow-border flex items-center justify-center min-h-[200px]">
        <Loader2 className="w-6 h-6 text-[#FFD700] animate-spin" />
        <span className="ml-3 text-sm text-white/50 uppercase tracking-widest font-bold">Cargando encuesta…</span>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className="glass-card rounded-3xl p-8 relative overflow-hidden glow-border"
    >
      {/* Ambient gold glow */}
      <div className="absolute -top-32 -right-32 w-64 h-64 rounded-full blur-[100px] pointer-events-none opacity-40 bg-[#FFD700]" />

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-[#FFD700]/10 border border-[#FFD700]/30 flex items-center justify-center">
            <ClipboardCheck size={20} className="text-[#FFD700]" />
          </div>
          <div>
            <h2 className="text-lg font-black text-white tracking-tight">Encuesta Semanal de Hábitos</h2>
            <p className="text-[9px] text-white/40 uppercase tracking-[0.2em] font-bold mt-0.5">
              Semana del {new Date(semana + 'T00:00:00').toLocaleDateString('es-VE', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
        </div>

        {yaRespondida && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="flex items-center space-x-2 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-4 py-1.5"
          >
            <CheckCircle2 size={14} className="text-emerald-400" />
            <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">Completada</span>
          </motion.div>
        )}
      </div>

      {/* Representative info banner */}
      {tieneRepresentante && (
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="relative z-10 flex items-start space-x-3 bg-blue-500/5 border border-blue-500/20 rounded-xl px-4 py-3 mb-6"
        >
          <Info size={16} className="text-blue-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-blue-300/80 leading-relaxed">
            Tu representante recibirá esta encuesta para validar tus respuestas.
          </p>
        </motion.div>
      )}

      {/* Questions */}
      <div className="relative z-10 space-y-6">
        <AnimatePresence>
          {PREGUNTAS.map((pregunta, qIdx) => {
            const Icon = pregunta.icon;
            const selectedIdx = respuestas[pregunta.id];

            return (
              <motion.div
                key={pregunta.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: qIdx * 0.08, duration: 0.4 }}
                className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5"
              >
                {/* Question header */}
                <div className="flex items-center space-x-2.5 mb-4">
                  <div className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
                    <Icon size={14} className="text-[#FFD700]/70" />
                  </div>
                  <span className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em]">
                    Pregunta {qIdx + 1}
                  </span>
                </div>
                <p className="text-sm text-white/90 font-semibold mb-4 leading-relaxed">{pregunta.texto}</p>

                {/* Options as radio buttons */}
                <div className="flex flex-wrap gap-2">
                  {pregunta.opciones.map((opcion, oIdx) => {
                    const isSelected = selectedIdx === oIdx;
                    return (
                      <motion.button
                        key={oIdx}
                        type="button"
                        disabled={yaRespondida}
                        whileHover={!yaRespondida ? { scale: 1.03 } : {}}
                        whileTap={!yaRespondida ? { scale: 0.97 } : {}}
                        onClick={() => handleSelect(pregunta.id, oIdx)}
                        className={`
                          flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-bold
                          transition-all duration-200 cursor-pointer
                          ${isSelected
                            ? 'bg-[#FFD700]/15 border-[#FFD700]/60 text-[#FFD700] shadow-[0_0_12px_rgba(255,215,0,0.15)]'
                            : 'bg-white/[0.03] border-white/10 text-white/50 hover:border-white/20 hover:text-white/70'
                          }
                          border
                          ${yaRespondida && !isSelected ? 'opacity-30' : ''}
                          ${yaRespondida ? 'cursor-default' : ''}
                        `}
                      >
                        {/* Custom radio dot */}
                        <span className={`
                          w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center flex-shrink-0
                          transition-all duration-200
                          ${isSelected
                            ? 'border-[#FFD700] bg-[#FFD700]/20'
                            : 'border-white/20 bg-transparent'
                          }
                        `}>
                          {isSelected && (
                            <motion.span
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className="w-1.5 h-1.5 rounded-full bg-[#FFD700]"
                            />
                          )}
                        </span>
                        <span>{opcion}</span>

                        {/* Checkmark for submitted */}
                        {yaRespondida && isSelected && (
                          <CheckCircle2 size={12} className="text-emerald-400 ml-1" />
                        )}
                      </motion.button>
                    );
                  })}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Score bar (visible when all answered) */}
      <AnimatePresence>
        {todasRespondidas && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.4 }}
            className="relative z-10 mt-6"
          >
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[9px] font-black text-white/40 uppercase tracking-[0.2em]">
                  Puntaje Total
                </span>
                <span className={`text-2xl font-black ${getScoreColor(puntajeTotal)}`}>
                  {puntajeTotal}
                  <span className="text-sm text-white/30 ml-1">/100</span>
                </span>
              </div>
              <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${puntajeTotal}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                  className={`h-full rounded-full ${getScoreBarColor(puntajeTotal)}`}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error */}
      {error && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="relative z-10 mt-4 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2"
        >
          Error: {error}
        </motion.p>
      )}

      {/* Submit button */}
      {!yaRespondida && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="relative z-10 mt-6 flex justify-end"
        >
          <motion.button
            onClick={handleSubmit}
            disabled={!todasRespondidas || saving}
            whileHover={todasRespondidas ? { scale: 1.02 } : {}}
            whileTap={todasRespondidas ? { scale: 0.98 } : {}}
            className={`
              flex items-center space-x-2 px-6 py-3 rounded-xl font-black text-sm uppercase tracking-widest
              transition-all duration-300
              ${todasRespondidas
                ? 'bg-[#FFD700]/20 border border-[#FFD700]/50 text-[#FFD700] hover:bg-[#FFD700]/30 hover:shadow-[0_0_20px_rgba(255,215,0,0.2)]'
                : 'bg-white/5 border border-white/10 text-white/20 cursor-not-allowed'
              }
            `}
          >
            {saving ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Send size={16} />
            )}
            <span>{saving ? 'Guardando…' : 'Enviar Encuesta'}</span>
          </motion.button>
        </motion.div>
      )}

      {/* Success toast */}
      <AnimatePresence>
        {saved && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.4 }}
            className="relative z-10 mt-4 flex items-center space-x-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3"
          >
            <CheckCircle2 size={18} className="text-emerald-400" />
            <p className="text-sm text-emerald-300 font-semibold">
              ¡Encuesta enviada exitosamente! Puntaje: {puntajeTotal}/100
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
