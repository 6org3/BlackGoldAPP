import { useEffect, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useAuth } from '../../AuthContext';
import { C, BORDER, GRAD, cut, PIXEL, gridBackground, fmtClock } from './arcadeTokens';
import { XP_POR_DESTACADO } from './canchaMock';
import { presentesP, destacadosList } from './canchaSelectors';
import useCanchaSession from './useCanchaSession';
import MicroLabel from './MicroLabel';
import ArcadeBottomNav from './ArcadeBottomNav';
import PantallaCancha from './PantallaCancha';
import PantallaNivel from './PantallaNivel';
import PantallaBuscador from './PantallaBuscador';
import PantallaLista from './PantallaLista';
import PantallaActiva from './PantallaActiva';
import PantallaCierre from './PantallaCierre';
import PantallaEvaluar from './PantallaEvaluar';
import PantallaFin from './PantallaFin';

const FALLBACK_FOCUSED = { id: null, label: '—', block: '', elapsed: 0, present: 0, start: '', evaluable: true, hue: 'gold' };

// Estilo del footer/CTA según habilitado + tono.
function footerStyle(enabled, tone) {
  if (!enabled) return { background: 'rgba(255,255,255,.04)', color: C.text4, border: `1px solid ${BORDER.neutral}` };
  if (tone === 'green') return { background: GRAD.greenCTA, color: C.inkGreen, border: '1px solid transparent' };
  return { background: GRAD.goldCTA, color: C.ink, border: '1px solid transparent' };
}

// Cabecera de flujo por paso (chevron + micro-label + título).
function headerFor(state, roster) {
  switch (state.step) {
    case 'nivel':
      return { label: 'PASO 1 · BLOQUE', title: 'Nueva sesión' };
    case 'buscador':
      return { label: 'PASO 1 · ATLETA', title: 'Elige atleta' };
    case 'lista':
      return { label: 'PASO 2 · ASISTENCIA', title: 'Pasar lista' };
    case 'cierre':
      return { label: 'PASO 3 · DESTACADOS', title: 'Cierre de clase' };
    case 'evaluar': {
      const a = roster.find((x) => x.id === state.evalTargetId) || roster[0];
      return { label: 'EVALUAR ATLETA', title: a?.name || 'Atleta' };
    }
    default:
      return null;
  }
}

// CTA persistente por paso (label + habilitado + acción + tono).
function footerFor(state, actions, roster) {
  switch (state.step) {
    case 'buscador': {
      const n = roster.filter((a) => state.present[a.id]).length;
      return { label: `CONTINUAR · ${n}`, enabled: n > 0, tone: 'gold', onClick: actions.toLista };
    }
    case 'lista': {
      const pc = presentesP(state, roster).length;
      return {
        label: `INICIAR SESIÓN · ${pc} ✓`,
        enabled: pc > 0,
        tone: 'green',
        onClick: () => actions.start({ classType: state.classType, level: state.level, present: state.present, roster }),
      };
    }
    case 'cierre': {
      const dc = destacadosList(state, roster).length;
      return {
        label: `FINALIZAR · +${dc * XP_POR_DESTACADO} XP`,
        enabled: dc > 0,
        tone: 'gold',
        onClick: () => actions.finish({ session: state.closingSession, present: state.present, roster }),
      };
    }
    case 'evaluar':
      return {
        label: 'GUARDAR EVALUACIÓN',
        enabled: true,
        tone: 'green',
        onClick: () => actions.saveEval({ atletaId: state.evalTargetId, scores: state.scores[state.evalTargetId] }),
      };
    default:
      return null;
  }
}

function CanchaTakeover({ onClose }) {
  const { user } = useAuth();
  const { state, actions, roster, levels, isReal } = useCanchaSession(user);
  const navigate = useNavigate();
  const coachInitial = user?.nombre
    ? user.nombre.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
    : 'PA';
  const reduce = useReducedMotion();
  const panelRef = useRef(null);

  // Bloqueo de scroll del body + foco inicial + Escape para salir + focus
  // trap (el foco no escapa al fondo) + restauración del foco al disparador.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevFocus = document.activeElement;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'Tab') {
        const panel = panelRef.current;
        if (!panel) return;
        const f = panel.querySelectorAll(
          'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
      if (prevFocus && typeof prevFocus.focus === 'function') prevFocus.focus();
    };
  }, [onClose]);

  const header = headerFor(state, roster);
  const footer = footerFor(state, actions, roster);
  const showNav = state.step === 'cancha';
  const isActiva = state.step === 'activa';

  const focused = state.sessions.find((x) => x.id === state.focusedId) || state.sessions[0] || FALLBACK_FOCUSED;
  const others = state.sessions.filter((x) => x.id !== focused.id);

  const scrollPad = isActiva ? '20px 16px 96px' : state.step === 'fin' ? '24px 16px 30px' : '18px 16px 26px';

  const goZone = (key) => {
    if (key === 'cancha') return;
    const routes = { inicio: '/coach', plantel: '/admin/atletas', analizar: '/admin/comparar', club: '/admin/pagos' };
    onClose();
    if (routes[key]) navigate(routes[key]);
  };

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Modo Cancha"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      style={{ position: 'fixed', inset: 0, zIndex: 60, background: C.bgApp, display: 'flex', justifyContent: 'center' }}
    >
      <motion.div
        ref={panelRef}
        tabIndex={-1}
        initial={reduce ? false : { scale: 0.98, y: 8 }}
        animate={{ scale: 1, y: 0 }}
        exit={reduce ? undefined : { scale: 0.99, y: 6, opacity: 0 }}
        transition={{ duration: 0.24, ease: [0.25, 0.46, 0.45, 0.94] }}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 480,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          color: C.text,
          outline: 'none',
          ...gridBackground,
        }}
      >
        {/* Cabecera de flujo */}
        {header && (
          <div
            style={{
              flex: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '16px 16px 12px',
              borderBottom: '1px solid rgba(255,215,0,.1)',
              background: 'rgba(5,5,7,.6)',
            }}
          >
            <button
              type="button"
              onClick={actions.back}
              aria-label="Atrás"
              style={{
                width: 34,
                height: 34,
                flex: 'none',
                display: 'grid',
                placeItems: 'center',
                background: 'transparent',
                border: '1px solid rgba(255,255,255,.12)',
                clipPath: cut(7),
                color: C.text2,
                cursor: 'pointer',
              }}
            >
              <ChevronLeft size={16} strokeWidth={2.4} />
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <MicroLabel color={C.goldDeep} size={8.5} tracking=".12em">{header.label}</MicroLabel>
              <p style={{ margin: '3px 0 0', fontSize: 17, fontWeight: 900, letterSpacing: '-.03em', lineHeight: 1.05 }}>{header.title}</p>
            </div>
          </div>
        )}

        {/* Área de scroll con la pantalla actual */}
        <div style={{ flex: 1, overflowY: 'auto', padding: scrollPad, WebkitOverflowScrolling: 'touch' }}>
          {state.step === 'cancha' && <PantallaCancha state={state} actions={actions} onClose={onClose} demo={!isReal} coachInitial={coachInitial} />}
          {state.step === 'nivel' && <PantallaNivel actions={actions} levels={levels} />}
          {state.step === 'buscador' && <PantallaBuscador state={state} actions={actions} roster={roster} />}
          {state.step === 'lista' && <PantallaLista state={state} actions={actions} roster={roster} />}
          {isActiva && <PantallaActiva focused={focused} others={others} actions={actions} />}
          {state.step === 'cierre' && <PantallaCierre state={state} actions={actions} roster={roster} />}
          {state.step === 'evaluar' && <PantallaEvaluar state={state} actions={actions} roster={roster} />}
          {state.step === 'fin' && <PantallaFin state={state} actions={actions} roster={roster} />}
        </div>

        {/* Minibar flotante de la sesión en foco */}
        {isActiva && (
          <div
            style={{
              position: 'absolute',
              left: 14,
              right: 14,
              bottom: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: 'rgba(9,9,11,.96)',
              border: `1px solid ${BORDER.ok}`,
              clipPath: cut(10),
              padding: '11px 14px',
              boxShadow: '0 -8px 26px rgba(0,0,0,.6)',
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.ok, animation: 'bg-blink 1.3s infinite', flex: 'none' }} />
            <span style={{ fontSize: 12, fontWeight: 700 }}>{focused.label}</span>
            <span style={{ marginLeft: 'auto', fontFamily: PIXEL, fontSize: 15, color: C.ok }}>{fmtClock(focused.elapsed)}</span>
          </div>
        )}

        {/* Footer CTA persistente */}
        {footer && (
          <div style={{ flex: 'none', padding: '12px 16px', borderTop: `1px solid ${BORDER.neutral}`, background: 'rgba(5,5,7,.8)' }}>
            <button
              type="button"
              onClick={footer.enabled ? footer.onClick : undefined}
              disabled={!footer.enabled}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                padding: 16,
                clipPath: cut(12),
                fontFamily: PIXEL,
                fontSize: 11,
                letterSpacing: '.04em',
                cursor: footer.enabled ? 'pointer' : 'default',
                ...footerStyle(footer.enabled, footer.tone),
              }}
            >
              {footer.label}
            </button>
          </div>
        )}

        {/* Nav inferior (solo landing) */}
        {showNav && <ArcadeBottomNav variant="coach" active="cancha" onNavigate={goZone} />}
      </motion.div>
    </motion.div>
  );
}

/**
 * Takeover de Modo Cancha (Arcade HUD) — reemplaza el ModoCanchaModal.
 * Contrato de props idéntico ({ isOpen, onClose }) para engancharlo en los
 * mismos puntos de lanzamiento (Sidebar, CoachHomePage).
 */
export default function ModoCanchaArcade({ isOpen, onClose }) {
  return <AnimatePresence>{isOpen && <CanchaTakeover onClose={onClose} />}</AnimatePresence>;
}
