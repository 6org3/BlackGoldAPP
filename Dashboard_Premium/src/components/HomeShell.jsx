import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import Sidebar from './Sidebar';
import BottomNav from './BottomNav';
import { CopilotoProvider } from './CopilotoLauncher';
import { useAuth } from '../AuthContext';
import { BOTTOM_NAV_POR_ROL } from '../lib/bottomNavConfig';
import { C, BORDER, GRAD, TINT, cut, PIXEL } from './arcade/arcadeTokens';
import MicroLabel from './arcade/MicroLabel';
import HexAvatar from './arcade/HexAvatar';
import KpiTile from './arcade/KpiTile';

/**
 * HomeShell — layout compartido de los homes por rol (Fase 1 del rediseño,
 * blueprint §2.1): Sidebar + main scrolleable, botón de menú móvil y cabecera
 * saludo/contexto. Monta la BottomNav móvil y el Copiloto (FAB + panel) por
 * rol de staff — PR7 del retrofit visual.
 *
 * Ola 2 · PR 2.1 (convergencia Arcade): el chrome habla el lenguaje Arcade HUD
 * (design_system_arcade.md §6.4 "Panel admin denso") — retícula dorada desktop
 * como campo de juego, header con MicroLabel pixel + HexAvatar de identidad,
 * chips/eyebrows con esquina cortada `cut()` y voz de marcador. La API pública
 * (props y subcomponentes) no cambia: las páginas consumidoras quedan intactas.
 *
 * Props:
 * - eyebrow: línea micro sobre el titular (ej. fecha o rol).
 * - titulo: nodo del titular (puede traer <em> dorado vía text-gradient-gold).
 * - contexto: chip/nodo de contexto de alcance bajo el titular (opcional).
 */
export default function HomeShell({ eyebrow, titulo, contexto, children }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const itemsNav = BOTTOM_NAV_POR_ROL[user?.rol] || null;
  const activo = itemsNav?.find((it) => location.pathname.startsWith(it.ruta))?.key;

  // Identidad del header (§6.4: título + HexAvatar, patrón de VistaDuenoArcade).
  const iniciales = (user?.nombre || 'BG').trim().split(/\s+/)
    .map((p) => p[0]).slice(0, 2).join('').toUpperCase();

  return (
    <CopilotoProvider>
    <div className="flex h-dvh bg-surface-base overflow-hidden text-white selection:bg-brand selection:text-black">
      <Sidebar
        isMobileMenuOpen={isMobileMenuOpen}
        setIsMobileMenuOpen={setIsMobileMenuOpen}
        ocultarFabModoCancha
      />

      {/* pb móvil con BottomNav (74px) reserva hasta el borde superior del FAB
          del Copiloto (74+16px de offset + 48px de alto ≈ 138px), no solo la
          altura de la barra — si no, el FAB queda flotando sobre la última
          tarjeta al hacer scroll hasta el final. */}
      {/* Retícula dorada del lienzo Arcade (.bg-arcade-grid, tokens.css): 36px
          en móvil (§2.6) y 44px densa en md+ (§6.1). Su radial-gradient superior
          reemplaza al antiguo div de glow con blur-[150px] — mismo halo, sin
          costo de blur en GPU. */}
      <main
        className={`bg-arcade-grid flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 md:p-10 relative ${itemsNav ? 'pb-[calc(env(safe-area-inset-bottom)+142px)] md:pb-[calc(env(safe-area-inset-bottom)+24px)]' : 'pb-[calc(env(safe-area-inset-bottom)+24px)]'}`}
      >
        <header className="flex items-start justify-between gap-4 mb-2 relative z-10">
          <div className="min-w-0">
            <MicroLabel as="p" color={C.goldDeep} size={9.5} tracking=".12em" style={{ marginBottom: 6 }}>
              {eyebrow}
            </MicroLabel>
            <h1 className="text-3xl md:text-4xl font-black tracking-tighter leading-tight">{titulo}</h1>
          </div>
          {/* Identidad hex (solo desktop; en móvil ese espacio es del menú).
              Decorativo: aria-hidden para no anunciar iniciales sueltas. */}
          <div className="hidden md:block shrink-0" aria-hidden="true">
            <HexAvatar size={46} initial={iniciales} background={GRAD.goldHex} color={C.ink} glow style={{ fontSize: 14 }} />
          </div>
          <button
            aria-label="Abrir menú"
            className="cut-focus md:hidden shrink-0 text-brand p-2.5 bg-white/5 hover:bg-white/10 transition-colors"
            style={{ clipPath: cut(7), border: `1px solid ${BORDER.neutralSoft}` }}
            onClick={() => setIsMobileMenuOpen(true)}
          >
            <Menu size={24} />
          </button>
        </header>

        {contexto && <div className="relative z-10 mb-4">{contexto}</div>}

        <div className="relative z-10">{children}</div>
      </main>

      {itemsNav && (
        <BottomNav items={itemsNav} activo={activo} onSelect={(key) => {
          const item = itemsNav.find((it) => it.key === key);
          if (item) navigate(item.ruta);
        }} />
      )}
    </div>
    </CopilotoProvider>
  );
}

/* Tintes de chip por tono — tokenizados en arcadeTokens (TINT superficies,
   BORDER bordes); aquí solo se componen, sin valores crudos (§7.1). */
const CHIP_TONOS = {
  brand:   { color: C.gold, background: TINT.gold, borderColor: BORDER.gold16 },
  info:    { color: C.info, background: TINT.info, borderColor: BORDER.info },
  success: { color: C.ok,   background: TINT.ok,   borderColor: BORDER.okSoft },
  mental:  { color: C.ai,   background: TINT.ai,   borderColor: BORDER.ai },
};

/** Chip de contexto de alcance bajo el titular. Skin HUD (corte + tinte) pero
 *  cuerpo en Outfit: trae frases descriptivas, y la vara prohíbe cuerpo en
 *  pixel (§7.3) y sub-9px fuera del marco 480px (§6.5). */
export function ContextChip({ tono = 'brand', children }) {
  const t = CHIP_TONOS[tono] || CHIP_TONOS.brand;
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontSize: 11, fontWeight: 800, letterSpacing: '.02em',
        padding: '6px 10px', clipPath: cut(7),
        border: '1px solid', ...t,
      }}
    >
      {children}
    </span>
  );
}

/** Eyebrow de sección (MicroLabel pixel — la "voz de marcador" que ordena la pantalla, §4.5). */
export function SectionEyebrow({ children, pill, pillTono = 'brand' }) {
  const t = CHIP_TONOS[pillTono] || CHIP_TONOS.brand;
  return (
    <div className="flex items-center gap-2 mt-6 mb-3">
      <MicroLabel as="span" color={C.text3} size={9.5} tracking=".14em">{children}</MicroLabel>
      {pill && (
        <span
          style={{
            marginLeft: 'auto', fontFamily: PIXEL, fontSize: 9.5, letterSpacing: '.06em',
            textTransform: 'uppercase', padding: '3px 8px', clipPath: cut(7),
            border: '1px solid', ...t,
          }}
        >
          {pill}
        </span>
      )}
    </div>
  );
}

/* tonoTexto (API DS v1, clases Tailwind) → color de KpiTile. */
const TONO_KPI = {
  'text-white': C.text,
  'text-brand': C.gold,
  'text-caution-soft': C.warn,
};

/** Stat-card: delega en la primitiva canónica KpiTile (Ola 0). API intacta.
 *  labelSize 9: piso pixel desktop (§6.1) — los homes viven fuera del marco 480px. */
export function StatCard({ valor, label, tonoTexto = 'text-white' }) {
  return <KpiTile label={label} val={valor} color={TONO_KPI[tonoTexto] || C.text} labelSize={9} />;
}
