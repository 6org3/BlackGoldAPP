import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { C, BORDER, GRAD, OVERLAY, cut } from './arcadeTokens';
import HexAvatar from './HexAvatar';
import MicroLabel from './MicroLabel';

/**
 * ModalShell — cascarón de diálogo del lenguaje Arcade para modales con cuerpo
 * PROPIO (formularios, paneles informativos). A diferencia de ModalHUD (que es
 * para prompt/alert/confirm simples), aquí el contenido lo pone el consumidor
 * como `children`; el shell aporta el overlay, el panel CutCard, la cabecera
 * hexágono+título y toda la semántica de diálogo accesible:
 * role=dialog + aria-modal, foco inicial, trampa de foco (Tab cicla), Escape y
 * clic en el backdrop cierran, bloqueo del scroll de fondo y restauración del
 * foco al disparador al cerrar.
 *
 * @param {()=>void} onClose
 * @param {string} title  nombre accesible del diálogo (aria-label) + título visible
 * @param {string} [titleClassName] clase extra para el <h2> (p.ej. color de rango)
 * @param {React.ComponentType} [icon] icono lucide del hexágono
 * @param {string} [eyebrow] micro-label pixel sobre el título
 * @param {string} [maxWidth='max-w-lg'] clase Tailwind de ancho máximo del panel
 * @param {'center'|'end'} [align='center'] alineación vertical (end = bottom-sheet en móvil)
 */
export default function ModalShell({ onClose, title, titleClassName = '', icon: Icon, eyebrow, maxWidth = 'max-w-lg', align = 'center', children }) {
  const panelRef = useRef(null);
  const closeRef = useRef(null);
  const triggerRef = useRef(null);

  // `onClose` es una arrow nueva en cada render del padre; guardarla en un ref
  // evita que el efecto de abajo dependa de su identidad y se re-ejecute en cada
  // render del padre — lo que dispararía su cleanup (restaurar foco al disparador)
  // sacando el foco del panel a media interacción.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    triggerRef.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = setTimeout(() => closeRef.current?.focus(), 0);
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onCloseRef.current?.(); return; }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const f = Array.from(
        panelRef.current.querySelectorAll('button, input, textarea, select, a[href], [tabindex]:not([tabindex="-1"])')
      ).filter((el) => !el.disabled && el.offsetParent !== null);
      if (f.length === 0) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      const el = triggerRef.current;
      if (el && typeof el.focus === 'function' && document.contains(el)) el.focus();
    };
  }, []);

  const alignCls = align === 'end' ? 'items-end sm:items-center' : 'items-center';
  // Portal a <body>: el clip-path de un ancestro (cualquier superficie cut()
  // del HUD) recorta el pintado de descendientes position:fixed — ver la misma
  // nota en ModalHUD.jsx.
  return createPortal(
    <div
      className={`fixed inset-0 z-[100] flex ${alignCls} justify-center p-4`}
      style={{ background: OVERLAY, backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full ${maxWidth} max-h-[90dvh] overflow-y-auto`}
        style={{ background: C.card, border: `1px solid ${BORDER.neutralSoft}`, clipPath: cut(14) }}
      >
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="cut-focus absolute right-2 top-2 z-10 min-h-11 min-w-11 md:min-h-9 md:min-w-9 inline-flex items-center justify-center transition-colors"
          style={{ color: C.text3 }}
        >
          <X size={18} />
        </button>
        <div className="p-5 sm:p-7" style={align === 'end' ? { paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' } : undefined}>
          <div className="flex items-center gap-3 mb-5 pr-8">
            {Icon && (
              <HexAvatar size={40} background={GRAD.goldHex} color={C.ink}>
                <Icon size={20} strokeWidth={2.5} />
              </HexAvatar>
            )}
            <div className="min-w-0">
              {eyebrow && <MicroLabel style={{ marginBottom: 3 }}>{eyebrow}</MicroLabel>}
              <h2 className={`text-lg font-black uppercase tracking-tight leading-tight ${titleClassName}`} style={titleClassName ? undefined : { color: C.text }}>
                {title}
              </h2>
            </div>
          </div>
          {children}
        </div>
      </motion.div>
    </div>,
    document.body
  );
}
