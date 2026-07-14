import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { C, BORDER, GRAD, TINT, cut } from './arcadeTokens';
import HexAvatar from './HexAvatar';
import MicroLabel from './MicroLabel';

/**
 * Modal-HUD — el diálogo del lenguaje Arcade. Reemplaza `window.prompt` /
 * `alert` / `confirm` nativos por una superficie del HUD (corte de esquina,
 * hexágono de icono, micro-label pixel, CTA dorado) con semántica accesible.
 *
 * Es un primitivo reutilizable: la Ola 3 exige sacar los diálogos nativos de
 * todos los módulos /admin/* (auditoría §6, PR 3.1) — este es el molde único.
 *
 * Variantes:
 * - `alert`   → un solo botón (dismiss). Para avisos/errores/éxitos.
 * - `confirm` → confirmar + cancelar. Para acciones que piden un sí explícito.
 * - `prompt`  → input de texto + confirmar/cancelar. `onConfirm(valorRecortado)`.
 *
 * Accesibilidad: role="dialog" + aria-modal, foco inicial (input en prompt,
 * confirmar en el resto), Escape y clic en el backdrop cancelan, y foco atrapado
 * (Tab cicla dentro del diálogo). El movimiento respeta el MotionConfig global.
 *
 * Controlado por el padre: `open` decide el montaje; `onClose` limpia su estado.
 * `onConfirm` NO cierra por sí solo — el padre encadena el cierre o el siguiente
 * modal (p.ej. prompt → guardar → alert de resultado).
 *
 * @param {boolean} open
 * @param {'alert'|'confirm'|'prompt'} [variant='alert']
 * @param {'gold'|'ok'|'warn'|'danger'|'info'} [tone='gold'] color de acento
 * @param {React.ComponentType} [icon] icono lucide del hexágono
 * @param {string} [eyebrow] micro-label pixel sobre el título
 * @param {string} title
 * @param {string} [message] cuerpo (o ayuda bajo el input en prompt)
 * @param {string} [defaultValue] valor inicial del input (prompt)
 * @param {string} [placeholder] placeholder del input (prompt)
 * @param {string} [confirmLabel]
 * @param {string} [cancelLabel='Cancelar']
 * @param {(value?:string)=>void} [onConfirm]
 * @param {()=>void} onClose
 */

const ACCENT = { gold: C.gold, ok: C.ok, warn: C.warn, danger: C.danger, info: C.info };
const HEX_BG = { gold: GRAD.goldHex, ok: TINT.ok, warn: TINT.warn, danger: TINT.danger, info: TINT.info };
const HEX_INK = { gold: C.ink, ok: C.ok, warn: C.warn, danger: C.danger, info: C.info };
// El botón afirmativo lleva el peso del tono: oro relleno (primario) o tinte + borde semántico.
const CONFIRM_STYLE = {
  gold:   { clipPath: cut(8), background: GRAD.goldCTA, border: 'none', color: C.ink },
  ok:     { clipPath: cut(8), background: TINT.ok, border: `1px solid ${BORDER.okStrong}`, color: C.ok },
  warn:   { clipPath: cut(8), background: C.cardAlt1, border: `1px solid ${BORDER.warn}`, color: C.warn },
  danger: { clipPath: cut(8), background: TINT.danger, border: `1px solid ${BORDER.danger}`, color: C.danger },
  info:   { clipPath: cut(8), background: TINT.info, border: `1px solid ${BORDER.info}`, color: C.info },
};

const DEFAULT_CONFIRM = { alert: 'Entendido', confirm: 'Confirmar', prompt: 'Confirmar' };

export default function ModalHUD({
  open,
  variant = 'alert',
  tone = 'gold',
  icon: Icon,
  eyebrow,
  title,
  message,
  defaultValue = '',
  placeholder,
  confirmLabel,
  cancelLabel = 'Cancelar',
  onConfirm,
  onClose,
}) {
  const [value, setValue] = useState(defaultValue);
  const [prevOpen, setPrevOpen] = useState(open);
  const inputRef = useRef(null);
  const confirmRef = useRef(null);
  const panelRef = useRef(null);
  const triggerRef = useRef(null); // elemento enfocado antes de abrir, para devolverle el foco al cerrar

  // Reseembrar el input al abrir (el prompt precarga su valor). Se ajusta en
  // fase de render — patrón oficial "ajustar estado al cambiar props" — para no
  // llamar setState dentro de un efecto (cascada de renders / react-hooks).
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setValue(defaultValue);
  }

  // `onClose` es una arrow nueva en cada render del padre; guardarla en un ref
  // evita que el efecto de abajo dependa de su identidad (y se re-ejecute robando
  // el foco en cada render mientras el diálogo está abierto).
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  // Foco inicial + Escape + trampa de foco (Tab cicla dentro del diálogo),
  // bloqueo del scroll de fondo y restauración del foco al disparador al cerrar
  // (paridad con los window.prompt/alert nativos, que congelan la página y
  // dejan el foco en el botón que los abrió).
  useEffect(() => {
    if (!open) return;
    // Al ejecutar el efecto (justo tras el commit) el foco sigue en el disparador:
    // el foco al input/confirmar se mueve en el setTimeout(0) de más abajo.
    triggerRef.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = setTimeout(() => {
      if (variant === 'prompt' && inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      } else {
        confirmRef.current?.focus();
      }
    }, 0);
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onCloseRef.current?.(); return; }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusables = Array.from(
        panelRef.current.querySelectorAll(
          'button, input, textarea, select, a[href], [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.disabled && el.offsetParent !== null);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      const el = triggerRef.current;
      if (el && typeof el.focus === 'function' && document.contains(el)) el.focus();
    };
  }, [open, variant]);

  if (!open) return null;

  const accent = ACCENT[tone] || C.gold;
  const confirmCb = onConfirm || onClose;
  const isPrompt = variant === 'prompt';
  const promptEmpty = isPrompt && !value.trim();

  const handleConfirm = (e) => {
    e?.preventDefault?.();
    if (isPrompt) {
      const v = value.trim();
      if (!v) return; // no confirmar con nombre vacío
      confirmCb?.(v);
    } else {
      confirmCb?.();
    }
  };

  const titleId = 'modalhud-title';
  const msgId = message ? 'modalhud-msg' : undefined;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,.8)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={msgId}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md max-h-[90dvh] overflow-y-auto"
        style={{ background: C.card, border: `1px solid ${BORDER.neutralSoft}`, clipPath: cut(14), padding: 22 }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="cut-focus absolute right-2 top-2 min-h-11 min-w-11 md:min-h-9 md:min-w-9 inline-flex items-center justify-center transition-colors"
          style={{ color: C.text3 }}
        >
          <X size={18} />
        </button>

        {/* Cabecera: hexágono de tono + eyebrow + título */}
        <div className="flex items-center gap-3 mb-4 pr-8">
          {Icon && (
            <HexAvatar size={40} background={HEX_BG[tone]} color={HEX_INK[tone]}>
              <Icon size={20} strokeWidth={2.5} />
            </HexAvatar>
          )}
          <div className="min-w-0">
            {eyebrow && <MicroLabel color={accent} style={{ marginBottom: 3 }}>{eyebrow}</MicroLabel>}
            <h3 id={titleId} className="text-lg font-black uppercase tracking-tight leading-tight" style={{ color: C.text }}>
              {title}
            </h3>
          </div>
        </div>

        <form onSubmit={handleConfirm}>
          {message && (
            <p id={msgId} className="text-sm leading-relaxed mb-4" style={{ color: C.text2 }}>
              {message}
            </p>
          )}

          {isPrompt && (
            <div className="mb-5 px-3" style={{ clipPath: cut(7), background: C.cardAlt1, border: `1px solid ${BORDER.neutralSoft}` }}>
              <input
                ref={inputRef}
                type="text"
                value={value}
                placeholder={placeholder}
                aria-label={placeholder || title}
                onChange={(e) => setValue(e.target.value)}
                className="cut-focus arcade-input w-full bg-transparent min-h-11 text-sm font-bold focus:outline-none"
                style={{ color: C.text }}
              />
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            {variant !== 'alert' && (
              <button
                type="button"
                onClick={onClose}
                className="cut-focus min-h-11 px-4 text-2xs font-black uppercase tracking-widest transition-colors"
                style={{ clipPath: cut(7), background: 'transparent', border: `1px solid ${BORDER.neutralSoft}`, color: C.text3 }}
              >
                {cancelLabel}
              </button>
            )}
            <button
              ref={confirmRef}
              type="submit"
              disabled={promptEmpty}
              className={`cut-focus min-h-11 px-5 text-2xs font-black uppercase tracking-widest transition ${promptEmpty ? 'disabled:opacity-40 disabled:cursor-not-allowed' : ''}`}
              style={CONFIRM_STYLE[tone] || CONFIRM_STYLE.gold}
            >
              {confirmLabel || DEFAULT_CONFIRM[variant] || 'Confirmar'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
