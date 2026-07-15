import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { LogOut, User } from 'lucide-react';
import { useAuth } from '../../AuthContext';
import { C, BORDER, PIXEL, cut } from './arcadeTokens';
import HexAvatar from './HexAvatar';
import MicroLabel from './MicroLabel';

const PANEL_W = 216;

/**
 * Avatar hexagonal del usuario que abre el menú de perfil del HUD: la salida de
 * sesión de los portales Arcade (Atleta · Padre · Dueño), que al converger a
 * Arcade HUD quedaron sin ninguna — el shell legacy AthleteLayout sí la tenía.
 *
 * Autocontenido: resuelve `logout` por su cuenta, así las pantallas dirigidas
 * por ctx siguen sin tocar la capa de auth. `onEditarPerfil` es opcional — sin
 * él, el menú solo ofrece cerrar sesión.
 *
 * El panel va por portal a <body> porque el clip-path de las superficies cut()
 * del HUD recorta el pintado de descendientes fixed (mismo motivo que ModalHUD).
 * Al estar fuera del árbol del avatar se ancla a mano, midiendo su rect: por eso
 * el scroll y el resize lo vuelven a medir en vez de dejarlo flotando lejos.
 */
export default function ArcadePerfilMenu({
  initial,
  size = 44,
  background,
  color,
  glow = false,
  style,
  ariaLabel = 'Menú de perfil',
  onEditarPerfil,
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [rect, setRect] = useState(null); // null = cerrado; si no, rect del disparador
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const open = rect !== null;

  const close = useCallback(() => setRect(null), []);

  // Vuelve a medir el avatar. `open` no cambia al remedir, así que el efecto de
  // abajo no se re-ejecuta ni se roba el foco.
  const reposition = useCallback(() => {
    const el = triggerRef.current;
    if (el) setRect(el.getBoundingClientRect());
  }, []);

  const abrir = () => reposition();

  // Foco inicial en el primer ítem, Escape cierra, y al cerrar el foco vuelve al
  // avatar. El scroll se escucha en captura para atrapar también el del área de
  // scroll interna del portal (el <body> del HUD no scrollea).
  useEffect(() => {
    if (!open) return undefined;
    const trigger = triggerRef.current; // el nodo del cleanup se fija aquí: al cerrar por logout ya está desmontado
    const t = setTimeout(() => {
      panelRef.current?.querySelector('button')?.focus();
    }, 0);
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
      if (trigger && document.contains(trigger)) trigger.focus();
    };
  }, [open, close, reposition]);

  const handleLogout = () => {
    close();
    logout();
    navigate('/login');
  };

  const handleEditar = () => {
    close();
    onEditarPerfil?.();
  };

  const itemStyle = {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
    padding: '11px 13px',
    appearance: 'none',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
    color: C.text2,
    fontFamily: PIXEL,
    fontSize: 9,
    letterSpacing: '.04em',
  };

  // El panel se despliega hacia el centro del marco del HUD: el avatar del atleta
  // vive a la izquierda de su hero y el del padre/dueño a la derecha de la
  // cabecera, así que anclarlo siempre al mismo borde lo tiraría fuera del marco.
  // El clamp lo mantiene dentro del viewport en pantallas angostas.
  const posicion = !rect
    ? null
    : rect.left + rect.width / 2 < window.innerWidth / 2
      ? { left: Math.max(8, Math.min(rect.left, window.innerWidth - PANEL_W - 8)) }
      : { right: Math.max(8, Math.min(window.innerWidth - rect.right, window.innerWidth - PANEL_W - 8)) };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={abrir}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        className="cut-focus"
        style={{ appearance: 'none', background: 'none', border: 'none', padding: 0, cursor: 'pointer', flex: 'none', lineHeight: 0 }}
      >
        <HexAvatar initial={initial} size={size} background={background} color={color} glow={glow} style={style} />
      </button>

      {open &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[90]" onClick={close} />
            <div
              ref={panelRef}
              role="menu"
              aria-label={ariaLabel}
              className="fixed z-[100]"
              style={{
                top: rect.bottom + 8,
                ...posicion,
                width: PANEL_W,
                maxHeight: `calc(100dvh - ${rect.bottom + 16}px)`,
                overflowY: 'auto',
                background: C.card,
                border: `1px solid ${BORDER.neutralSoft}`,
                clipPath: cut(10),
                backdropFilter: 'blur(18px)',
                WebkitBackdropFilter: 'blur(18px)',
              }}
            >
              {/* Identidad de quien está dentro de la sesión */}
              <div style={{ padding: '13px 13px 11px', borderBottom: `1px solid ${BORDER.neutralFaint}` }}>
                <MicroLabel color={C.goldDeep} size={8} tracking=".1em">{(user?.rol || 'SESIÓN').toUpperCase()}</MicroLabel>
                <p style={{ margin: '4px 0 0', fontSize: 12.5, fontWeight: 800, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user?.nombre || '—'}
                </p>
              </div>

              {onEditarPerfil && (
                <button type="button" role="menuitem" onClick={handleEditar} className="cut-focus" style={itemStyle}>
                  <User size={15} style={{ flex: 'none', color: C.text3 }} />
                  <span>EDITAR PERFIL</span>
                </button>
              )}

              <button
                type="button"
                role="menuitem"
                onClick={handleLogout}
                data-testid="btn-logout"
                className="cut-focus"
                style={{ ...itemStyle, color: C.danger, borderTop: onEditarPerfil ? `1px solid ${BORDER.neutralFaint}` : undefined }}
              >
                <LogOut size={15} style={{ flex: 'none' }} />
                <span>CERRAR SESIÓN</span>
              </button>
            </div>
          </>,
          document.body
        )}
    </>
  );
}
