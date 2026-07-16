import { useNavigate } from 'react-router-dom';
import {
  LayoutGrid, Users, Target, Boxes, DollarSign, BarChart3,
  FlaskConical, Activity, CalendarDays, TrendingUp, UserCog, MessageSquare,
} from 'lucide-react';
import { C, BORDER, PIXEL, cut } from './arcadeTokens';
import ModalShell from './ModalShell';
import MicroLabel from './MicroLabel';

/**
 * Consola de gestión — la "pantalla de selección" del HUD del dueño: la única
 * puerta desde /club hacia los módulos /admin/*.
 *
 * Existe porque VistaDuenoArcade es un HUD standalone (no monta HomeShell, y por
 * tanto tampoco el Sidebar que coach y superadmin heredan) y su bottom-nav son
 * tabs internas, no rutas: el dueño quedaba sin camino visible a sus propias
 * herramientas. Los paneles ofrecen además atajos contextuales (SalidaAdmin)
 * hacia la ruta de su tema; esto es el acceso COMPLETO, incluidas las cuatro que
 * no tienen panel donde colgarse (misiones, eventos, sesiones, comparar).
 *
 * No se resolvió montando /club dentro de HomeShell: ese shell trae su propia
 * BottomNav por rol y su propio <main> scrolleable, y el HUD acabaría con dos
 * barras inferiores y dos contenedores de scroll dentro de un marco de 100dvh.
 *
 * Los 11 destinos son los de PrivateRoute en main.jsx. Sin filtro por rol a
 * propósito: /club solo admite owner y superadmin, y ambos pasan las guardas de
 * las 11 rutas (las dos más estrictas —kpis y equipo— piden exactamente ese par).
 * Si algún día entra otro rol a /club, aquí hay que filtrar.
 *
 * MANTENIMIENTO: una ruta /admin/* que no entre en esta lista queda sin puerta
 * desde /club — el dueño no monta Sidebar. Ya pasó con /admin/grupos (v37), que
 * nació mientras esta consola se escribía. Al añadir una ruta admin, añade su
 * tile aquí y su caso al spec dueno_consola_gestion.cy.js.
 */

// Iconos: manda el idioma que el dueño ya tiene delante (la bottom-nav de su
// HUD: $ = dinero, Activity = asistencia, Target = misiones) y el Sidebar
// resuelve el resto. Donde el Sidebar es ambiguo se corrige: usa Plus para
// "Gestionar Atletas", que aquí leería como "añadir", no como "atletas".
const BLOQUES = [
  {
    eyebrow: 'PLANTEL',
    tiles: [
      { label: 'ATLETAS', Icon: Users, href: '/admin/atletas' },
      { label: 'MISIONES', Icon: Target, href: '/admin/misiones' },
      // Grupos va en PLANTEL, no en OPERACIÓN: un grupo es una agrupación de
      // atletas (con su nivel y su cuota), no una actividad del día. Icono Boxes,
      // el mismo con el que el Sidebar y la propia pantalla ya lo nombran.
      { label: 'GRUPOS', Icon: Boxes, href: '/admin/grupos' },
    ],
  },
  {
    eyebrow: 'DINERO',
    tiles: [
      { label: 'PAGOS', Icon: DollarSign, href: '/admin/pagos' },
      { label: 'KPIS', Icon: BarChart3, href: '/admin/kpis' },
    ],
  },
  // CLUB va antes que OPERACIÓN (4 tiles, la más del día a día del coach) para
  // que COMUNICACIONES —de uso frecuente del dueño— entre sin scroll en el marco
  // móvil; y dentro del bloque va primero por la misma razón frente a EQUIPO,
  // que se toca al dar de alta a un coach y poco más.
  {
    eyebrow: 'CLUB',
    tiles: [
      { label: 'COMUNICACIONES', Icon: MessageSquare, href: '/admin/comunicaciones' },
      { label: 'EQUIPO', Icon: UserCog, href: '/admin/equipo' },
    ],
  },
  {
    eyebrow: 'OPERACIÓN',
    tiles: [
      { label: 'SESIONES', Icon: FlaskConical, href: '/admin/sesiones' },
      { label: 'ASISTENCIA', Icon: Activity, href: '/admin/asistencia' },
      { label: 'EVENTOS', Icon: CalendarDays, href: '/admin/eventos' },
      { label: 'COMPARAR', Icon: TrendingUp, href: '/admin/comparar' },
    ],
  },
];

export default function ConsolaGestion({ onClose }) {
  const navigate = useNavigate();

  return (
    <ModalShell onClose={onClose} title="Consola de gestión" eyebrow="DUEÑO" icon={LayoutGrid} maxWidth="max-w-md">
      {BLOQUES.map((b, i) => (
        <div key={b.eyebrow} style={{ marginTop: i === 0 ? 0 : 18 }}>
          <MicroLabel as="p" color={C.text3} size={8.5} tracking=".14em" style={{ margin: '0 0 8px' }}>
            {b.eyebrow}
          </MicroLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {b.tiles.map((t) => (
              <Tile key={t.href} {...t} onGo={() => { onClose(); navigate(t.href); }} />
            ))}
          </div>
        </div>
      ))}
    </ModalShell>
  );
}

/** Tile de destino: hexágono de icono sobre etiqueta pixel, en superficie cortada. */
function Tile({ label, Icon, onGo }) {
  return (
    <button
      type="button"
      onClick={onGo}
      className="cut-focus"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        minHeight: 74,
        padding: '10px 6px',
        background: C.cardAlt1,
        border: `1px solid ${BORDER.neutralSoft}`,
        clipPath: cut(9),
        color: C.text2,
        cursor: 'pointer',
      }}
    >
      <Icon size={19} strokeWidth={2} style={{ flex: 'none', color: C.gold }} />
      {/* Etiquetas de dos palabras (COMUNICACIONES) parten sin desbordar el tile. */}
      <span style={{ fontFamily: PIXEL, fontSize: 8, letterSpacing: '.04em', textAlign: 'center', lineHeight: 1.4 }}>
        {label}
      </span>
    </button>
  );
}
