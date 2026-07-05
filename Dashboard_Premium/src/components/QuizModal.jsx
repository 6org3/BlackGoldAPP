import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle, XCircle } from 'lucide-react';
import confetti from 'canvas-confetti';
import { CONFETTI_GOLD } from '../lib/designTokens';

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
            colors: CONFETTI_GOLD,
            disableForReducedMotion: true,
          });
          setTimeout(() => {
            confetti({
              particleCount: 50,
              spread: 120,
              origin: { y: 0.5 },
              colors: CONFETTI_GOLD,
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
          className="glass-card w-full max-w-lg rounded-card p-5 sm:p-8 relative max-h-[90dvh] overflow-y-auto"
          onClick={e => e.stopPropagation()}
        >
          <button onClick={onClose} aria-label="Cerrar cuestionario" className="absolute top-3 right-3 p-3 text-fg-muted hover:text-white transition-colors">
            <X size={20} />
          </button>

          {!finished ? (
            <>
              {/* Progress */}
              <div className="flex items-center justify-between mb-6">
                <span className="text-2xs text-brand font-bold uppercase tracking-eyebrow">
                  Cuestionario de Verificación
                </span>
                <span className="text-xs text-fg-secondary font-bold">
                  {currentQuestion + 1} / {totalQuestions}
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full h-1 bg-white/10 rounded-full mb-8 overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-brand to-brand-strong rounded-full"
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
                      bgClass = 'bg-success/20 border-success/50';
                    } else if (index === selectedAnswer && index !== question.correcta) {
                      bgClass = 'bg-danger/20 border-danger/50';
                    }
                  }

                  return (
                    <motion.button
                      key={index}
                      whileHover={!showResult ? { scale: 1.02 } : {}}
                      whileTap={!showResult ? { scale: 0.98 } : {}}
                      onClick={() => handleAnswer(index)}
                      disabled={showResult}
                      className={`w-full text-left p-4 rounded-control border transition duration-300 ${bgClass}`}
                    >
                      <div className="flex items-center space-x-3">
                        <span className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center text-xs font-bold text-gray-300 shrink-0">
                          {String.fromCharCode(65 + index)}
                        </span>
                        <span className="text-sm text-white font-medium">{opcion}</span>
                        {showResult && index === question.correcta && <CheckCircle size={18} className="text-success-soft ml-auto shrink-0" />}
                        {showResult && index === selectedAnswer && index !== question.correcta && <XCircle size={18} className="text-danger-soft ml-auto shrink-0" />}
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
                  <h3 className="text-2xl font-black text-brand uppercase tracking-tight mb-2">¡Misión Completada!</h3>
                  <p className="text-sm text-fg-secondary mb-2">{correctCount}/{totalQuestions} respuestas correctas</p>
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="inline-flex items-center space-x-2 bg-brand/10 border border-brand/30 rounded-full px-5 py-2 mt-4 mb-6"
                  >
                    <span className="text-brand font-black text-lg">+{xpRecompensa} XP</span>
                  </motion.div>
                </>
              ) : (
                <>
                  <div className="text-6xl mb-4">📖</div>
                  <h3 className="text-2xl font-black text-danger-soft uppercase tracking-tight mb-2">Necesitas Repasar</h3>
                  <p className="text-sm text-fg-secondary mb-6">{correctCount}/{totalQuestions} correctas. Necesitas al menos {passingScore} para aprobar.</p>
                </>
              )}

              <button
                onClick={handleFinish}
                className={`w-full py-4 rounded-control font-black uppercase tracking-widest text-sm transition ${
                  passed
                    ? 'bg-gradient-to-r from-brand to-brand-strong text-black shadow-[0_0_20px_rgba(255,215,0,0.3)]'
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
