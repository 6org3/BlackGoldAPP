import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import BottomNav from './BottomNav';
import { CopilotoProvider } from './CopilotoLauncher';
import { useAuth } from '../AuthContext';
import { BOTTOM_NAV_POR_ROL } from '../lib/bottomNavConfig';
import { C, gridBackgroundDesktop } from './arcade/arcadeTokens';

/**
 * AdminShell — gemelo de HomeShell para las páginas /admin/*: monta el mismo
 * cableado persistente (CopilotoProvider + Sidebar + BottomNav móvil por rol)
 * PERO sin la cabecera saludo/eyebrow, porque cada módulo admin ya trae su
 * propio encabezado. Antes cada page repetía su shell (Sidebar + main) sin
 * BottomNav ni Copiloto, así que al navegar desde un home se perdían.
 *
 * No se unifica con HomeShell todavía a propósito: HomeShell necesita header
 * con hamburguesa móvil y pasa `ocultarFabModoCancha` al Sidebar (contexto del
 * home nativo); fusionarlos por banderas ensuciaría ambos. Follow-up.
 *
 * Props:
 * - padding: clases de padding del <main> (default 'p-6 md:p-10'); usar '' si
 *   el componente interno ya trae su propio padding.
 * - fabElevado: sube el FAB del Copiloto en móvil por encima de un footer
 *   sticky del módulo (p.ej. Guardar en Asistencia).
 *
 * El lienzo usa la retícula dorada `gridBackgroundDesktop` (design_system_arcade.md
 * §6.1), no un blob de blur. La antigua prop `conGlow` quedó sin efecto (los
 * callers que aún la pasan se ignoran sin error).
 */
export default function AdminShell({ children, padding = 'p-6 md:p-10', fabElevado = false }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const itemsNav = BOTTOM_NAV_POR_ROL[user?.rol] || null;
  const activo = itemsNav?.find((it) => location.pathname.startsWith(it.ruta))?.key;

  return (
    <CopilotoProvider fabElevado={fabElevado}>
    <div className="flex h-dvh overflow-hidden" style={{ ...gridBackgroundDesktop, color: C.text }}>
      {/* ocultarFabModoCancha: el FAB amarillo del Sidebar taparía el ítem
          "Misiones" de la BottomNav en móvil; Modo Cancha queda accesible
          desde el drawer y el CTA del Inicio (mismo criterio que HomeShell). */}
      <Sidebar
        isMobileMenuOpen={isMobileMenuOpen}
        setIsMobileMenuOpen={setIsMobileMenuOpen}
        ocultarFabModoCancha
      />

      <main className={`flex-1 overflow-y-auto overflow-x-hidden relative z-0 ${padding} ${itemsNav ? 'pb-[calc(env(safe-area-inset-bottom)+96px)] md:pb-[calc(env(safe-area-inset-bottom)+24px)]' : 'pb-[calc(env(safe-area-inset-bottom)+24px)]'}`}>
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
