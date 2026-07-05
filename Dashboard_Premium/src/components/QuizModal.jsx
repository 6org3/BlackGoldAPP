import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle, XCircle } from 'lucide-react';
import confetti from 'canvas-confetti';

export default function QuizModal({ quiz, xpRecompensa, onPass, onClose }) {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [finished, setFinished] = useState(false);
  const [passed, setPassed] = useState(false);

  const question = quiz[currentQuestion];
  const totalQuestions = quiz.length;
  const passingScore = Math.ceil(totalQuestions * 0.6); // 60% para aprobar

  const handleAnswer = (index) => {
    if (showResult) return;
    setSelectedAnswer(index);
    setShowResult(true);

    const isCorrect = index === question.correcta;
    const newCorrectCount = isCorrect ? correctCount + 1 : correctCount;
    if (isCorrect) setCorrectCount(newCorrectCount);

    setTimeout(() => {
      if (currentQuestion + 1 < totalQuestions) {
        setCurrentQuestion(currentQuestion + 1);
        setSelectedAnswer(null);
        setShowResult(false);
      } else {
        // Quiz terminado
        const didPass = newCorrectCount >= passingScore;
        setPassed(didPass);
        setFinished(true);

        if (didPass) {
          // Lluvia de confeti dorado
          confetti({
            particleCount: 80,
            spread: 90,
            origin: { y: 0.6 },
            colors: ['#FFD700', '#D4AF37', '#FFFFFF', '#F5E6A3'],
            disableForReducedMotion: true,
          });
          setTimeout(() => {
            confetti({
              particleCount: 50,
              spread: 120,
              origin: { y: 0.5 },
              colors: ['#FFD700', '#D4AF37'],
              disableForReducedMotion: true,
            });
          }, 400);
        }
      }
    }, 1500);
  };

  const handleFinish = () => {
    if (passed) {
      onPass();
    }
    onClose();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4"
        onClick={() => {
          // Solo cerrar con toque fuera antes de empezar a responder, para no perder progreso
          if (currentQuestion === 0 && !showResult && !finished) onClose();
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ type: "spring", damping: 25 }}
          className="glass-card w-full max-w-lg rounded-3xl p-5 sm:p-8 relative max-h-[90dvh] overflow-y-auto"
          onClick={e => e.stopPropagation()}
        >
          <button onClick={onClose} aria-label="Cerrar cuestionario" className="absolute top-3 right-3 p-3 text-gray-500 hover:text-white transition-colors">
            <X size={20} />
          </button>

          {!finished ? (
            <>
              {/* Progress */}
              <div className="flex items-center justify-between mb-6">
                <span className="text-[10px] text-[#FFD700] font-bold uppercase tracking-[0.2em]">
                  Cuestionario de Verificación
                </span>
                <span className="text-xs text-gray-400 font-bold">
                  {currentQuestion + 1} / {totalQuestions}
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full h-1 bg-white/10 rounded-full mb-8 overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-[#FFD700] to-[#D4AF37] rounded-full"
                  animate={{ width: `${((currentQuestion + 1) / totalQuestions) * 100}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>

              {/* Question */}
              <h3 className="text-lg font-bold text-white mb-6 leading-relaxed">{question.pregunta}</h3>

              {/* Options */}
              <div className="space-y-3">
                {question.opciones.map((opcion, index) => {
                  let bgClass = 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20';
                  if (showResult) {
                    if (index === question.correcta) {
                      bgClass = 'bg-emerald-500/20 border-emerald-500/50';
                    } else if (index === selectedAnswer && index !== question.correcta) {
                      bgClass = 'bg-red-500/20 border-red-500/50';
                    }
                  }

                  return (
                    <motion.button
                      key={index}
                      whileHover={!showResult ? { scale: 1.02 } : {}}
                      whileTap={!showResult ? { scale: 0.98 } : {}}
                      onClick={() => handleAnswer(index)}
                      disabled={showResult}
                      className={`w-full text-left p-4 rounded-xl border transition-all duration-300 ${bgClass}`}
                    >
                      <div className="flex items-center space-x-3">
                        <span className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center text-xs font-bold text-gray-300 shrink-0">
                          {String.fromCharCode(65 + index)}
                        </span>
                        <span className="text-sm text-white font-medium">{opcion}</span>
                        {showResult && index === question.correcta && <CheckCircle size={18} className="text-emerald-400 ml-auto shrink-0" />}
                        {showResult && index === selectedAnswer && index !== question.correcta && <XCircle size={18} className="text-red-400 ml-auto shrink-0" />}
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </>
          ) : (
            /* Results Screen */
            <div className="text-center py-6">
              {passed ? (
                <>
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", damping: 10 }}
                    className="text-6xl mb-4"
                  >
                    🏆
                  </motion.div>
                  <h3 className="text-2xl font-black text-[#FFD700] uppercase tracking-tight mb-2">¡Misión Completada!</h3>
                  <p className="text-sm text-gray-400 mb-2">{correctCount}/{totalQuestions} respuestas correctas</p>
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="inline-flex items-center space-x-2 bg-[#FFD700]/10 border border-[#FFD700]/30 rounded-full px-5 py-2 mt-4 mb-6"
                  >
                    <span className="text-[#FFD700] font-black text-lg">+{xpRecompensa} XP</span>
                  </motion.div>
                </>
              ) : (
                <>
                  <div className="text-6xl mb-4">📖</div>
                  <h3 className="text-2xl font-black text-red-400 uppercase tracking-tight mb-2">Necesitas Repasar</h3>
                  <p className="text-sm text-gray-400 mb-6">{correctCount}/{totalQuestions} correctas. Necesitas al menos {passingScore} para aprobar.</p>
                </>
              )}

              <button
                onClick={handleFinish}
                className={`w-full py-4 rounded-xl font-black uppercase tracking-widest text-sm transition-all ${
                  passed
                    ? 'bg-gradient-to-r from-[#FFD700] to-[#D4AF37] text-black shadow-[0_0_20px_rgba(255,215,0,0.3)]'
                    : 'bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                {passed ? 'Reclamar Recompensa' : 'Volver a Intentar'}
              </button>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
