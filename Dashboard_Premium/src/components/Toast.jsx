// Toast.jsx — ToastProvider + toast flotante no bloqueante (sustituye los
// alert()/confirm() nativos por avisos con la estética "vidrio oscuro").
// Referencia visual: docs/mockup_v6_comparar_graficos.html (.toast).
// El hook useToast() y el contexto viven en ../hooks/useToast (convención
// react-refresh, igual que CopilotoLauncher/useCopiloto).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Info, AlertTriangle, CheckCircle2, HelpCircle } from 'lucide-react';
import { MOTION } from '../lib/designTokens';
import { ToastContext } from '../hooks/useToast';

const ACENTO = {
  info:    { borde: 'border-brand/25',   icono: 'text-brand',        Icono: Info },
  error:   { borde: 'border-danger/40',  icono: 'text-danger-soft',  Icono: AlertTriangle },
  success: { borde: 'border-success/40', icono: 'text-success-soft', Icono: CheckCircle2 },
};

const AUTO_CIERRE_MS = 4000;

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null); // { id, mensaje, tipo, esConfirmacion } | null
  const idRef = useRef(0);
  const timerRef = useRef(null);
  const resolverRef = useRef(null); // resolve() de la confirmación viva, si la hay

  const limpiarTimer = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  }, []);

  // Resuelve (una sola vez) la confirmación pendiente.
  const resolverPendiente = useCallback((valor) => {
    if (resolverRef.current) { resolverRef.current(valor); resolverRef.current = null; }
  }, []);

  const cerrar = useCallback((valorConfirmacion = false) => {
    limpiarTimer();
    resolverPendiente(valorConfirmacion);
    setToast(null);
  }, [limpiarTimer, resolverPendiente]);

  const mostrarToast = useCallback((mensaje, { tipo = 'info' } = {}) => {
    limpiarTimer();
    resolverPendiente(false); // un aviso nuevo cancela una confirmación previa sin decidir
    setToast({ id: ++idRef.current, mensaje, tipo, esConfirmacion: false });
  }, [limpiarTimer, resolverPendiente]);

  const pedirConfirmacion = useCallback((mensaje) => {
    limpiarTimer();
    resolverPendiente(false);
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setToast({ id: ++idRef.current, mensaje, tipo: 'info', esConfirmacion: true });
    });
  }, [limpiarTimer, resolverPendiente]);

  // Auto-cierre solo para avisos; la confirmación espera la decisión del usuario.
  useEffect(() => {
    if (!toast || toast.esConfirmacion) return undefined;
    timerRef.current = setTimeout(() => cerrar(), AUTO_CIERRE_MS);
    return limpiarTimer;
  }, [toast, cerrar, limpiarTimer]);

  const api = useMemo(() => ({ mostrarToast, pedirConfirmacion }), [mostrarToast, pedirConfirmacion]);

  const acento = ACENTO[toast?.tipo] || ACENTO.info;
  const Icono = toast?.esConfirmacion ? HelpCircle : acento.Icono;

  return (
    <ToastContext.Provider value={api}>
      {children}

      {/* Encima de la BottomNav y despejado del FAB del Copiloto (right-4, z-40):
          se apila por encima del FAB (+60px ≈ alto del FAB + gap) para no chocar. */}
      <div className="fixed left-1/2 -translate-x-1/2 z-50 bottom-[calc(74px+env(safe-area-inset-bottom)+16px+60px)] md:bottom-24 w-max max-w-[calc(100vw-2rem)] pointer-events-none">
        <AnimatePresence>
          {toast && (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ duration: MOTION.duration.base, ease: MOTION.ease.out }}
              className="pointer-events-auto"
            >
              {toast.esConfirmacion ? (
                <div
                  role="alertdialog"
                  className={`flex items-center gap-3 bg-surface-top border ${acento.borde} rounded-panel shadow-modal px-4 py-3`}
                >
                  <Icono className={`${acento.icono} shrink-0`} size={18} />
                  <span className="text-sm font-semibold text-fg">{toast.mensaje}</span>
                  <div className="flex gap-2 shrink-0 ml-1">
                    <button
                      type="button"
                      onClick={() => cerrar(false)}
                      className="px-3.5 py-2 min-h-11 rounded-control text-xs font-black uppercase tracking-eyebrow bg-white/5 border border-white/10 text-fg-secondary hover:bg-white/10 transition"
                    >
                      No
                    </button>
                    <button
                      type="button"
                      onClick={() => cerrar(true)}
                      className="px-3.5 py-2 min-h-11 rounded-control text-xs font-black uppercase tracking-eyebrow bg-brand text-on-brand hover:bg-brand-hover active:scale-95 transition"
                    >
                      Sí
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  role="status"
                  aria-live="polite"
                  className={`flex items-center gap-2 bg-surface-top border ${acento.borde} rounded-full shadow-modal px-4 py-2.5 text-center`}
                >
                  <Icono className={`${acento.icono} shrink-0`} size={16} />
                  <span className="text-sm font-semibold text-fg">{toast.mensaje}</span>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
