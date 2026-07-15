import { ArrowLeft } from 'lucide-react';
import { C, cut } from './arcadeTokens';
import useVolverAlHome from '../../hooks/useVolverAlHome';

/**
 * Vuelta al home del rol desde un módulo /admin/*. Autocontenido: resuelve el
 * destino por su cuenta (useVolverAlHome → rutaHomeParaRol), así los headers no
 * cablean routing ni auth.
 *
 * Existe para cerrar dos asimetrías del panel admin: la mitad de los módulos no
 * ofrecía vuelta (el dueño llega a Pagos desde su consola y salía distinto que
 * desde Equipo), y los que sí la ofrecían usaban tres moldes diferentes —uno de
 * ellos sin foco visible ni los 44px táctiles (§4.2)—. Este es el molde único:
 * superficie tenue + corte cut(7) (§6.3) + hit-area 44px.
 *
 * No es la única salida —AdminShell monta Sidebar en desktop y BottomNav en
 * móvil— pero sí la directa, y la que hace que todos los módulos se comporten
 * igual. Su aria-label es un hook de los E2E: no cambiarlo a la ligera.
 */
export default function BotonVolver({ className = '' }) {
  const volver = useVolverAlHome();
  return (
    <button
      type="button"
      onClick={volver}
      aria-label="Volver al inicio"
      className={`cut-focus grid place-items-center min-h-11 min-w-11 shrink-0 bg-white/5 hover:bg-white/10 transition-colors ${className}`}
      style={{ clipPath: cut(7), color: C.text3 }}
    >
      <ArrowLeft size={20} />
    </button>
  );
}
