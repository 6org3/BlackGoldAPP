// CopilotoPanel — bottom-sheet de chat con el Copiloto Black Gold (PR6).
// Referencia visual: docs/mockup_v6_comparar_graficos.html (sheet del copiloto).
// El hilo vive en estado local y cada envío manda TODO el hilo al service
// (la Edge Function `copiloto` resuelve rol, alcance por club y tono).
// El tono se muestra como badge: 🫶 simple (atleta/padre) / ⚙️ técnico (staff).
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../AuthContext';
import { enviarMensajeCopiloto } from '../api/copilotoService';
import { MOTION } from '../lib/designTokens';

const ROLES_TECNICOS = new Set(['superadmin', 'owner', 'coach']);

// Alcance visible y preguntas sugeridas por rol (2 chips por rol, estilo qchip
// del mockup). El alcance REAL lo impone el server; esto solo lo comunica.
const UI_POR_ROL = {
  superadmin: { alcance: 'Todos los clubes', chips: ['¿Qué club tiene peor salud?', '¿Dónde faltan baremos?'] },
  owner: { alcance: 'Solo tu club', chips: ['¿Qué categoría flojea?', '¿Quién puede ver mis datos?'] },
  coach: { alcance: 'Tus atletas', chips: ['¿Quién está bajo la media en explosividad?', '¿Qué dice la metodología sobre pliometría?'] },
  atleta: { alcance: 'Solo tú', chips: ['¿Cómo mejoro mi salto?', '¿Cómo voy con mi recuperación?'] },
  padre: { alcance: 'Solo tus hijos', chips: ['¿Cómo va mi hijo/a?', '¿Hay algo que cuidar en casa?'] },
};

// Máximo de mensajes que acepta la Edge Function por hilo.
const MAX_HILO = 20;

/** Hilo listo para el server: solo role/content, últimos MAX_HILO, y sin
 *  mensajes 'assistant' al inicio (la Messages API exige abrir con 'user'). */
const recortarHilo = (hilo) => {
  const ultimos = hilo.slice(-MAX_HILO).map(({ role, content }) => ({ role, content }));
  while (ultimos.length && ultimos[0].role !== 'user') ultimos.shift();
  return ultimos;
};

const TypingDots = () => (
  <div
    className="self-start flex items-center gap-1 px-3.5 py-3 bg-surface-sunken border border-white/5 rounded-panel rounded-bl-sm"
    role="status"
    aria-label="El copiloto está escribiendo"
  >
    {[0, 1, 2].map((i) => (
      <motion.span
        key={i}
        className="w-1.5 h-1.5 rounded-full bg-mental-soft"
        animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
        transition={{ duration: 1, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
      />
    ))}
  </div>
);

/**
 * Panel de chat del copiloto.
 * @param {boolean} abierto     — controla la visibilidad (sheet + scrim).
 * @param {Function} onCerrar   — cierra el panel (scrim, ×, Escape).
 * @param {string|null} [atletaId] — atleta de contexto si se abrió desde su ficha.
 */
const CopilotoPanel = ({ abierto, onCerrar, atletaId = null }) => {
  const { user } = useAuth();
  const rol = user?.rol ?? 'atleta';
  const tono = ROLES_TECNICOS.has(rol) ? 'tecnico' : 'simple';
  const { alcance, chips } = UI_POR_ROL[rol] ?? UI_POR_ROL.atleta;

  const [mensajes, setMensajes] = useState([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  const chatRef = useRef(null);
  const inputRef = useRef(null);

  const saludo = tono === 'simple'
    ? '¡Hola! 👋 Pregúntame lo que quieras, te lo explico fácil.'
    : 'Hola. Copiloto fundamentado en el rack documental del club; alcance limitado a tu rol.';

  // Foco al abrir (a11y) y autoscroll al fondo cuando crece el hilo.
  useEffect(() => {
    if (abierto) inputRef.current?.focus();
  }, [abierto]);
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [mensajes, enviando]);

  const handleEnviar = async (pregunta) => {
    const contenido = (pregunta ?? texto).trim();
    if (!contenido || enviando) return;
    setError(null);
    setTexto('');
    const hilo = [...mensajes, { role: 'user', content: contenido }];
    setMensajes(hilo);
    setEnviando(true);
    try {
      const data = await enviarMensajeCopiloto({ mensajes: recortarHilo(hilo), atletaId });
      setMensajes((prev) => [...prev, {
        role: 'assistant',
        content: data.respuesta,
        herramientas: data.herramientas_usadas ?? [],
      }]);
    } catch (err) {
      setError(err.message || 'El copiloto no está disponible en este momento.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <AnimatePresence>
      {abierto && (
        <div
          className="fixed inset-0 z-50"
          role="dialog"
          aria-modal="true"
          aria-label="Copiloto Black Gold"
          onKeyDown={(e) => { if (e.key === 'Escape') onCerrar(); }}
        >
          {/* Scrim */}
          <motion.div
            className="absolute inset-0 bg-black/55 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: MOTION.duration.fast }}
            onClick={onCerrar}
          />

          {/* Sheet */}
          <motion.div
            className="absolute inset-x-0 bottom-0 max-h-[82%] flex flex-col bg-surface-raised rounded-t-card border-t border-mental/25 shadow-modal"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={MOTION.spring.ui}
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-white/5">
              <div className="w-9 h-9 shrink-0 rounded-control grid place-items-center bg-mental/15 border border-mental/25 text-mental-soft text-base" aria-hidden="true">
                ✦
              </div>
              <div className="min-w-0">
                <p className="text-sm font-extrabold text-fg leading-tight">Copiloto Black Gold</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-3xs font-bold text-fg-muted uppercase tracking-eyebrow">{alcance}</span>
                  <span
                    className={`text-3xs font-extrabold px-2 py-0.5 rounded-full border ${
                      tono === 'simple'
                        ? 'text-success-soft bg-success/10 border-success/25'
                        : 'text-info-soft bg-info/10 border-info/25'
                    }`}
                  >
                    {tono === 'simple' ? '🫶 Explicación simple' : '⚙️ Modo técnico'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={onCerrar}
                aria-label="Cerrar copiloto"
                className="ml-auto shrink-0 w-9 h-9 grid place-items-center rounded-control text-fg-muted hover:text-fg text-xl transition-colors"
              >
                ×
              </button>
            </div>

            {/* Hilo */}
            <div ref={chatRef} className="flex-1 min-h-40 overflow-y-auto px-4 py-4 flex flex-col gap-3">
              <div className="self-start max-w-[88%] bg-surface-sunken border border-white/5 rounded-panel rounded-bl-sm px-3.5 py-2.5 text-sm leading-relaxed text-fg">
                {saludo}
              </div>

              {mensajes.map((m, i) => (
                m.role === 'user' ? (
                  <div key={i} className="self-end max-w-[88%] bg-brand text-on-brand font-semibold rounded-panel rounded-br-sm px-3.5 py-2.5 text-sm leading-relaxed">
                    {m.content}
                  </div>
                ) : (
                  <div key={i} className="self-start max-w-[88%] bg-surface-sunken border border-white/5 rounded-panel rounded-bl-sm px-3.5 py-2.5 text-sm leading-relaxed text-fg whitespace-pre-wrap">
                    {m.content}
                    {m.herramientas?.length > 0 && (
                      <p className="mt-2 text-3xs font-bold text-mental-soft">
                        ✦ {m.herramientas.join(' · ')}
                      </p>
                    )}
                  </div>
                )
              ))}

              {enviando && <TypingDots />}

              {error && (
                <div className="self-start max-w-[88%] text-2xs text-danger-soft bg-danger/10 border border-danger/25 rounded-panel px-3 py-2" role="alert">
                  {error}
                </div>
              )}
            </div>

            {/* Sugerencias por rol */}
            <div className="flex flex-wrap gap-2 px-4 pb-3">
              {chips.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => handleEnviar(q)}
                  disabled={enviando}
                  className="text-2xs font-bold px-3 py-1.5 rounded-full bg-surface-card border border-white/10 text-fg-secondary hover:border-mental hover:text-mental-soft transition-colors disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>

            {/* Input */}
            <div className="flex items-center gap-2 px-4 pb-4">
              <input
                ref={inputRef}
                type="text"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleEnviar(); }}
                placeholder="Pregúntale al copiloto…"
                aria-label="Mensaje para el copiloto"
                maxLength={2000}
                className="flex-1 h-11 px-4 rounded-control bg-surface-sunken border border-white/10 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:border-mental/50"
              />
              <button
                type="button"
                onClick={() => handleEnviar()}
                disabled={enviando || !texto.trim()}
                aria-label="Enviar mensaje"
                className="h-11 px-4 shrink-0 rounded-control bg-mental text-fg text-sm font-extrabold hover:bg-mental-soft transition-colors disabled:opacity-40"
              >
                Enviar
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default CopilotoPanel;
